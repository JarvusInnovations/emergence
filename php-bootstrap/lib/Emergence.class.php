<?php

class Emergence
{

	static private $cache = array();
	
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
	
	
	static public function resolveFileFromParent($collectionHandle, $path)
	{
		if(empty(Site::$config['parent_hostname']))
			return false;

		// get collection for parent site
		$collection = SiteCollection::getOrCreateRootCollection($collectionHandle, true);
		
		$fileNode = $collection->resolvePath($path);

		// try to download from parent site
		if(!$fileNode)
		{
			$remoteURL  = 'http://'.Site::$config['parent_hostname'].'/emergence/';
			$remoteURL .= $collectionHandle.'/';
			$remoteURL .= join('/',$path);
			$remoteURL .= '?accessKey='.Site::$config['parent_key'];
			
			$cache = apc_fetch($remoteURL);
			if($cache)
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
		
		
			// write file to parent site collection
			fseek($fp, 0);
			
			// read status
			$statusLine = trim(fgetss($fp));
			list($protocol,$status,$message) = explode(' ', $statusLine);
			

			if($status != '200')
			{
				apc_store($remoteURL, $status);
				return false;
			}

			// read headers
			while($header = trim(fgetss($fp)))
			{
				if(!$header) break;
				list($key, $value) = preg_split('/:\s*/', $header, 2);
			}

			$collection->createFile($path, $fp);
		
			$fileNode = $collection->resolvePath($path);
		}
		return $fileNode;
	}

	
}
