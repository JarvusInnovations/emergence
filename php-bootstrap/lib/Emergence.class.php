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

		//Debug::dumpVar(Site::$requestPath, false);
		//Debug::dumpVar(Site::$pathStack, false);
		if($node = Site::resolvePath(Site::$pathStack))
		{
			//Debug::dumpVar($node);
			//header('X-Emergence-Site-ID: '.static::$ID);
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
			
//			if($_SERVER['HTTP_HOST'] == 'newsite.sites.emr.ge')
//				print("checking cache $remoteURL<br>\n");
				
            $cache = apc_fetch($remoteURL);
            if($cache == '404') {
            	return false;
            }
            
            //if(isset(self::$cache[$cacheKey])) {
            //    $fp = self::$cache[$cacheKey];
            //}
            
			$fp = fopen('php://memory', 'w+');

//			if($_SERVER['HTTP_HOST'] == 'newsite.sites.emr.ge')
//				print("Retrieving: <a href='$remoteURL' target='_blank'>$remoteURL</a><br>\n");

			//die("getting $remoteURL");
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
			//die("got status $status");
//			if($_SERVER['HTTP_HOST'] == 'newsite.sites.emr.ge')
//				print("got status $status<br>\n");
			

			if($status != '200')
			{
				apc_store($remoteURL,'404');
				return false;
			}

			// read headers
			while($header = trim(fgetss($fp)))
			{
				if(!$header) break;
				list($key, $value) = preg_split('/:\s*/', $header, 2);
				//print "$key=$value<br>";
			}

			$collection->createFile($path, $fp);
		
			$fileNode = $collection->resolvePath($path);
		}
		return $fileNode;
	}

	
}
