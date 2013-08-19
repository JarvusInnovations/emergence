<?php

class Emergence
{	
	static public function handleRequest()
	{
		if (extension_loaded('newrelic'))
		{
			newrelic_disable_autorum();
		}

		if(empty(Site::$config['inheritance_key']))
		{
			Site::respondUnauthorized('Remote emergence access is disabled');
		}
		elseif(empty($_REQUEST['accessKey']) || $_REQUEST['accessKey'] != Site::$config['inheritance_key'])
		{
			Site::respondUnauthorized('Remote emergence access denied');
		}

		if($node = Site::resolvePath(Site::$pathStack))
		{
			if(method_exists($node, 'outputAsResponse'))
				$node->outputAsResponse();
			else
				Site::respondBadRequest();
		}
		else
		{
			header('HTTP/1.0 404 Not Found');
			die('File not found');
		}
	}
	
	static public function buildUrl($path = array(), $params = array())
	{
		$params['accessKey'] = Site::$config['parent_key'];

		$url  = 'http://'.Site::$config['parent_hostname'].'/emergence';
		$url .= '/' . implode('/', $path);
		$url .= '?' . http_build_query($params);
		
		return $url;
	}
	
	static public function resolveFileFromParent($collection, $path, $forceRemote = false)
	{
		if(empty(Site::$config['parent_hostname']))
			return false;

		// get collection for parent site
		if(is_string($collection))
		{
			$collection = SiteCollection::getOrCreateRootCollection($collection, true);
		}
		
		if(is_string($path))
		{
			$path = Site::splitPath($path);
		}

		// try to download from parent site
		if($forceRemote || !($fileNode = $collection->resolvePath($path)))
		{
			$remoteURL = static::buildUrl(array_merge($collection->getFullPath(null, false), $path));

			$cachedStatus = apc_fetch($remoteURL);
			if($cachedStatus)
			{
				return false;
			}

			$fp = fopen('php://memory', 'w+');
			$ch = curl_init($remoteURL);
			curl_setopt($ch, CURLOPT_FILE, $fp);
			curl_setopt($ch, CURLOPT_HEADER, true);
			
			if(!curl_exec($ch))
			{
				throw new Exception('Failed to query parent site for file');
			}
			
			if(curl_errno($ch))
			{
				throw new Exception("curl error:".curl_error($ch));
			}
		
			// read response
			fseek($fp, 0);
			
			// read and check status
			list($protocol, $status, $message) = explode(' ', trim(fgetss($fp)));
			
			if($status != '200')
			{
				apc_store($remoteURL, (int)$status);
				return false;
			}
			
			// read headers until a blank line is found
			while($header = trim(fgetss($fp)))
			{
				if(!$header) break;
				list($key, $value) = preg_split('/:\s*/', $header, 2);

				// if etag found, use it to skip write if existing file matches
				if($key == 'ETag' && $fileNode && $fileNode->SHA1 == $value)
				{
					return $fileNode;
				}
			}

			// write remaining buffer to file
			$collection->createFile($path, $fp);

			$fileNode = $collection->resolvePath($path);
		}
		
		return $fileNode;
	}

	static public function resolveCollectionFromParent($path, $tree = false)
	{
		if(empty(Site::$config['parent_hostname']))
			return false;

		$remoteParams = array();
		
		if($tree)
			$remoteParams['tree'] = true;
		
		$fp = fopen('php://memory', 'w+');
		$ch = curl_init(static::buildUrl($path, $remoteParams));
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, $fp);
		
		$responseText = curl_exec($ch);
		$responseStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
		$responseType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
		
		if(!$responseText)
		{
			throw new Exception('Failed to query parent site for collection');
		}
		
		if(curl_errno($ch))
		{
			throw new Exception("curl error:".curl_error($ch));
		}
		
		if($responseStatus != 300 || $responseType != 'application/json')
		{
			return false;
		}
		
		return json_decode($responseText, true);
	}	
}
