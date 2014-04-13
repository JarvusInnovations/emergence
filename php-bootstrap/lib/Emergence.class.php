<?php

class Emergence
{
    public static function handleRequest()
    {
        if (extension_loaded('newrelic')) {
            newrelic_disable_autorum();
        }

        if (!Site::getConfig('inheritance_key')) {
            Site::respondUnauthorized('Remote emergence access is disabled');
        } elseif (empty($_REQUEST['accessKey']) || $_REQUEST['accessKey'] != Site::getConfig('inheritance_key')) {
            // attempt to authenticate via developer session

            if (!UserSession::getFromRequest()->hasAccountLevel('Developer')) {
                Site::respondUnauthorized('Remote emergence access denied');
            }
        }

        if ($_REQUEST['remote'] == 'parent') {
            set_time_limit(600);
            HttpProxy::relayRequest(array(
                'url' => static::buildUrl(Site::$pathStack)
                ,'autoAppend' => false
                ,'autoQuery' => false
                ,'timeout' => 500
            ));
        }

        if (empty(Site::$pathStack[0])) {
            return static::handleTreeRequest();
        } elseif ($node = Site::resolvePath(Site::$pathStack)) {
            if (method_exists($node, 'outputAsResponse')) {
                $node->outputAsResponse(true);
            } elseif (is_a($node, 'SiteCollection')) {
                return static::handleTreeRequest($node);
            } else {
                Site::respondBadRequest();
            }
        } else {
            header('HTTP/1.0 404 Not Found');
            die('File not found');
        }
    }

    public static function handleTreeRequest($rootNode = null)
    {
        set_time_limit(600);
        $rootPath = $rootNode ? $rootNode->getFullPath(null, false) : null;
        $files = Emergence_FS::getTreeFiles($rootPath);

        header('HTTP/1.1 300 Multiple Choices');
        header('Content-Type: application/vnd.emergence.tree+json');
        print(json_encode(array(
            'total' => count($files)
            ,'files' => $files
        )));
        exit();
    }

    public static function buildUrl($path = array(), $params = array())
    {
        $params['accessKey'] = Site::getConfig('parent_key');

        $url  = 'http://'.Site::getConfig('parent_hostname').'/emergence';
        $url .= '/' . implode('/', $path);
        $url .= '?' . http_build_query($params);

        return $url;
    }

    public static function resolveFileFromParent($collection, $path, $forceRemote = false, $params = array())
    {
        if (!Site::getConfig('parent_hostname')) {
            return false;
        }

        // get collection for parent site
        if (is_string($collection)) {
            $collection = SiteCollection::getOrCreateRootCollection($collection, true);
        }

        if (is_string($path)) {
            $path = Site::splitPath($path);
        }

        // try to get existing cached file
        $fileNode = $collection->resolvePath($path);

        // try to download from parent site
        if ($forceRemote || !$fileNode) {
            if (!Site::$autoPull) {
                return false;
            }

            $remoteURL = static::buildUrl(array_merge($collection->getFullPath(null, false), $path), $params);

            $cachedStatus = apc_fetch($remoteURL);
            if ($cachedStatus) {
                return false;
            }

            $fp = fopen('php://memory', 'w+');
            $ch = curl_init($remoteURL);
            curl_setopt($ch, CURLOPT_FILE, $fp);
            curl_setopt($ch, CURLOPT_HEADER, true);

            if (!curl_exec($ch)) {
                throw new Exception('Failed to query parent site for file');
            }

            if (curl_errno($ch)) {
                throw new Exception("curl error:".curl_error($ch));
            }

            // read response
            fseek($fp, 0);

            // read and check status
            list($protocol, $status, $message) = explode(' ', trim(fgetss($fp)));

            if ($status != '200') {
                fclose($fp);
                apc_store($remoteURL, (int)$status);
                return false;
            }

            // read headers until a blank line is found
            while ($header = trim(fgetss($fp))) {
                if (!$header) {
                    break;
                }
                list($key, $value) = preg_split('/:\s*/', $header, 2);
                $key = strtolower($key);

                // if etag found, use it to skip write if existing file matches
                if ($key == 'etag' && $fileNode && $fileNode->SHA1 == $value) {
                    fclose($fp);
                    return $fileNode;
                }
            }

            // write remaining buffer to file
            $collection->createFile($path, $fp);

            $fileNode = $collection->resolvePath($path);
        }

        return $fileNode;
    }

    public static function resolveCollectionFromParent($path)
    {
        if (!Site::getConfig('parent_hostname')) {
            return false;
        }

        $fp = fopen('php://memory', 'w+');
        $ch = curl_init(static::buildUrl($path));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, $fp);

        $responseText = curl_exec($ch);
        $responseStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $responseType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);

        if (!$responseText) {
            throw new Exception('Failed to query parent site for collection');
        }

        if (curl_errno($ch)) {
            throw new Exception("curl error:".curl_error($ch));
        }

        if ($responseStatus != 300 || $responseType != 'application/vnd.emergence.tree+json') {
            return false;
        }

        return json_decode($responseText, true);
    }
}
