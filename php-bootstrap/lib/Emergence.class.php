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
            set_time_limit(1800);
            $remoteParams = array();
            if (!empty($_REQUEST['exclude'])) {
                $remoteParams['exclude'] = $_REQUEST['exclude'];
            }
            if (!empty($_REQUEST['includeDeleted'])) {
                $remoteParams['includeDeleted'] = true;
            }
            if (!empty($_REQUEST['minId'])) {
                $remoteParams['minId'] = $_REQUEST['minId'];
            }
            HttpProxy::relayRequest(array(
                'url' => static::buildUrl(Site::$pathStack, $remoteParams)
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
        set_time_limit(1800);
        $rootPath = $rootNode ? $rootNode->getFullPath(null, false) : null;
        $collectionConditions = array();
        $fileConditions = array();

        // process excludes
        if (!empty($_REQUEST['exclude']) && method_exists('Emergence_FS', 'getNodesFromPattern')) {
            $excludes = is_array($_REQUEST['exclude']) ? $_REQUEST['exclude'] : array($_REQUEST['exclude']);

            $excludedCollections = array();
            $excludedFiles = array();

            foreach (Emergence_FS::getNodesFromPattern($excludes) AS $node) {
                if ($node->Class == 'SiteCollection') {
                    $excludedCollections[] = $node->ID;
                } else {
                    $excludedFiles[] = $node->ID;
                }
            }

            if (count($excludedCollections)) {
                $collectionConditions['excludeTrees'] = $excludedCollections;
            }

            if (count($excludedFiles)) {
                $fileConditions[] = 'ID NOT IN ('.implode(',', $excludedFiles).')';
            }
        }

        // set include deleted
        $includeDeleted = !empty($_REQUEST['includeDeleted']);

        // set minimum id
        if (!empty($_REQUEST['minId'])) {
            $fileConditions[] = 'ID > ' . intval($_REQUEST['minId']);
        }

        // get files
        $files = Emergence_FS::getTreeFiles($rootPath, false, $fileConditions, $collectionConditions, $includeDeleted);

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

    public static function executeRequest($url)
    {
        static $ch = null;

        if (!$ch) {
            $ch = curl_init();
        }

        $fp = fopen('php://memory', 'w+');
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_FILE, $fp);
        curl_setopt($ch, CURLOPT_HEADER, true);

        if (curl_exec($ch) === false || curl_errno($ch)) {
            throw new Exception('Failed to query parent site for file: '.curl_error($ch));
        }

        // read response
        fseek($fp, 0);

        // read and check status
        list($protocol, $status, $message) = explode(' ', trim(fgetss($fp)));

        return array(
            'status' => (int)$status,
            'protocol' => $protocol,
            'message' => $message,
            'type' => curl_getinfo($ch, CURLINFO_CONTENT_TYPE),
            'resource' => $fp
        );
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

            $cachedStatus = Cache::rawFetch($remoteURL);
            if ($cachedStatus) {
                return false;
            }

            $remoteResponse = static::executeRequest($remoteURL);

            // if 500, back off for a couple seconds and try once more
            if ($remoteResponse['status'] == 500) {
                usleep(mt_rand(1000000, 3000000));
                $remoteResponse = static::executeRequest($remoteURL);
            }

            // a collection was found, cache it
            if ($remoteResponse['status'] == 300) {
                return SiteCollection::getOrCreatePath($path, $collection);
            }


            // any status but 300 or 200 is failure,remember and don't try again
            if ($remoteResponse['status'] != 200) {
                fclose($remoteResponse['resource']);
                Cache::rawStore($remoteURL, $remoteResponse['status']);
                return false;
            }

            // read headers until a blank line is found
            while ($header = trim(fgetss($remoteResponse['resource']))) {
                if (!$header) {
                    break;
                }
                list($key, $value) = preg_split('/:\s*/', $header, 2);
                $key = strtolower($key);

                // if etag found, use it to skip write if existing file matches
                if ($key == 'etag' && $fileNode && $fileNode->SHA1 == $value) {
                    fclose($remoteResponse['resource']);
                    return $fileNode;
                }
            }

            // write remaining buffer to file
            $fileRecord = $collection->createFile($path, $remoteResponse['resource']);

            $fileNode = new SiteFile($fileRecord['Handle'], $fileRecord);
        }

        return $fileNode;
    }

    public static function resolveCollectionFromParent($path)
    {
        if (!Site::getConfig('parent_hostname')) {
            return false;
        }

        $remoteResponse = static::executeRequest(static::buildUrl($path));

        if ($remoteResponse['status'] != 300 || $remoteResponse['type'] != 'application/vnd.emergence.tree+json') {
            return false;
        }

        while ($header = trim(fgetss($remoteResponse['resource']))) {
            if (!$header) {
                break;
            }
        }

        return json_decode(stream_get_contents($remoteResponse['resource']), true);
    }
}
