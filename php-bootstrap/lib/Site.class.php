<?php

class Site
{
	// config properties
	static public $debug = false;
	static public $production = false;
	static public $defaultPage = 'home.php';
	static public $autoCreateSession = true;
	static public $listCollections = false;
	static public $onInitialized;
	static public $onNotFound;
	static public $onRequestMapped;
	static public $permittedOrigins = array();
	static public $autoPull = true;
	static public $skipSessionPaths = array();

	// public properties
	//static public $ID;
	static public $Title;
	static public $rootPath;

	static public $webmasterEmail = 'errors@chrisrules.com';

	static public $requestURI;
	static public $requestPath;
	static public $pathStack;
	static public $resolvedPath;

	static public $config;
	static public $time;
	static public $queryBreaker;

	// protected properties
	static protected $_rootCollections;

	static public function initialize()
	{
		static::$time = microtime(true);

		// resolve details from host name
		
		// get site ID
/*
		if(empty(static::$ID))
		{
			if(!empty($_SERVER['SITE_ID']))
				static::$ID = $_SERVER['SITE_ID'];
			else
				throw new Exception('No Site ID detected');
		}
*/
		// get site root
		if(empty(static::$rootPath))
		{
			if(!empty($_SERVER['SITE_ROOT']))
				static::$rootPath = $_SERVER['SITE_ROOT'];
			else
				throw new Exception('No Site root detected');
		}
		
		// load config
		if(!(static::$config = apc_fetch($_SERVER['HTTP_HOST'])))
		{
            if(is_readable(static::$rootPath.'/site.json'))
            {
			    static::$config = json_decode(file_get_contents(static::$rootPath.'/site.json'), true);
			    apc_store($_SERVER['HTTP_HOST'], static::$config);
            }
            else if(is_readable(static::$rootPath.'/Site.config.php'))
            {
                include(static::$rootPath.'/Site.config.php');
                apc_store($_SERVER['HTTP_HOST'], static::$config);
            }
		}
		
		
		// get path stack
		$path = $_SERVER['REQUEST_URI'];
		
		if(false !== ($qPos = strpos($path,'?')))
		{
			$path = substr($path, 0, $qPos);
		}

		static::$pathStack = static::$requestPath = static::splitPath($path);

		if(!empty($_COOKIE['debugpath']))
		{
			MICS::dump(static::$pathStack, 'pathStack', true);
		}

		// set useful transaction name for newrelic
		if(extension_loaded('newrelic'))
		{
			newrelic_name_transaction (static::$config['handle'] . '/' . implode('/', site::$requestPath));
		}

		// register class loader
		spl_autoload_register('Site::loadClass');
		
		// set error handle
		set_error_handler('Site::handleError');
		
		// register exception handler
		set_exception_handler('Site::handleException');
		
		// check virtual system for site config
		static::loadConfig(__CLASS__);
		
		// check virtual system for proxy config
		if (class_exists('HttpProxy')) {
			static::loadConfig('HttpProxy');
		}
		
		if(is_callable(static::$onInitialized))
			call_user_func(static::$onInitialized);
	}

	
	static public function handleRequest()
	{
		// handle emergence request
		if(static::$pathStack[0] == 'emergence')
		{
			array_shift(static::$pathStack);
			return Emergence::handleRequest();
		}

		// handle CORS headers
		if(isset($_SERVER['HTTP_ORIGIN'])) {
			$hostname = strtolower(parse_url($_SERVER['HTTP_ORIGIN'], PHP_URL_HOST));
			if($hostname == strtolower($_SERVER['HTTP_HOST']) || static::$permittedOrigins == '*' || in_array($hostname, static::$permittedOrigins)) {
				header('Access-Control-Allow-Origin: ' . $_SERVER['HTTP_ORIGIN']);
				header('Access-Control-Allow-Credentials: true');
				//header('Access-Control-Max-Age: 86400')
			}
			else {
				header('HTTP/1.1 403 Forbidden');
				exit();
			}
		}
	   
		if($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
			if(isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_METHOD'])) {
				header('Access-Control-Request-Method: *');
			}       
	
			if(isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS'])) {
				header('Access-Control-Allow-Headers: Origin, X-Requested-With, Content-Type, Accept');
			}
			
			exit();
		}

		// try to resolve URL in site-root
		$rootNode = static::getRootCollection('site-root');
		$resolvedNode = $rootNode;
		static::$resolvedPath = array();

		// handle default page request
		if(empty(static::$pathStack[0]) && static::$defaultPage)
		{
			static::$pathStack[0] = static::$defaultPage;
		}

		// crawl down path stack until a handler is found
		while(($handle = array_shift(static::$pathStack)))
		{
			$scriptHandle = (substr($handle,-4)=='.php') ? $handle : $handle.'.php';

			if(
				(
					$resolvedNode
					&& method_exists($resolvedNode, 'getChild')
					&& (
						($childNode = $resolvedNode->getChild($handle))
						|| ($scriptHandle && $childNode = $resolvedNode->getChild($scriptHandle))
					)
				)
				|| ($childNode = Emergence::resolveFileFromParent('site-root', array_merge(static::$resolvedPath,array($handle))))
				|| ($scriptHandle && $childNode = Emergence::resolveFileFromParent('site-root', array_merge(static::$resolvedPath,array($scriptHandle))))
			)
			{
				$resolvedNode = $childNode;
				
				if(is_a($resolvedNode, 'SiteFile'))
				{
					static::$resolvedPath[] = $scriptHandle;
					break;
				}
			}
			else
			{
				$resolvedNode = false;
				//break;
			}
			
			static::$resolvedPath[] = $handle;
		}
		
		
		if($resolvedNode)
		{
			// create session
			if(static::$autoCreateSession && $resolvedNode->MIMEType == 'application/php' && !in_array(implode('/', static::$resolvedPath), static::$skipSessionPaths))
			{
				$GLOBALS['Session'] = UserSession::getFromRequest();
			}

			if(is_callable(static::$onRequestMapped))
			{
				call_user_func(static::$onRequestMapped, $resolvedNode);
			}

			if($resolvedNode->MIMEType == 'application/php')
			{
				function e_include($file) {
					$file = Site::normalizePath('site-root/'.implode('/', Site::$resolvedPath).'/../'.$file);
					if(!$node = Site::resolvePath($file)) {
						throw new Exception('e_include failed to find in efs: '.$file);
					}
					require($node->RealPath);
				}
				require($resolvedNode->RealPath);
				exit();
			}
			elseif(is_callable(array($resolvedNode, 'outputAsResponse')))
			{
				if(!is_a($resolvedNode, 'SiteFile') && !static::$listCollections)
				{
					static::respondNotFound();
				}
				
				$resolvedNode->outputAsResponse();	
			}
			else
			{
				static::respondNotFound();
			}
		}
		else
		{
			static::respondNotFound();
		}
	}
	
	static public function resolvePath($path, $checkParent = true, $checkCache = true)
	{
		// special case: request for root collection
		if( is_string($path) && (empty($path) || $path == '/')) {
			return new Emergence\DAV\RootCollection();
		}

		// parse path
		if (!is_array($path)) {
			$path = static::splitPath($path);
		}
		
/*
		// build cache key
		$cacheKey = static::$config['handle'] . ':efs' . (!$checkParent ? ':local/' : '/') . join('/', $path);

		if ($checkCache && false !== ($node = apc_fetch($cacheKey))) {
			printf("--cache hit on '%s'<br>", $cacheKey);
			//MICS::dump($node, 'cache hit: '.$cacheKey, true);
			return $node;
		} else {
			printf("--cache miss on '%s'<br>", $cacheKey);
		}
*/
			
		$collectionHandle = array_shift($path);
					
		// get root collection
		if (!$collectionHandle || !$collection = static::getRootCollection($collectionHandle)) {
			throw new Exception('Could not resolve root collection: '.$collectionHandle);
		}

		// get node from collection
		$node = $collection->resolvePath($path);

		// try to get from parent
		if (!$node && $checkParent) {
			$node = Emergence::resolveFileFromParent($collectionHandle, $path);
		}
		
		if (!$node) {
			$node = null;
		}
		
/* 		apc_store($cacheKey, $node); */

		return $node;
	}
	
	
	static protected $_loadedClasses = array();
	static public function loadClass($className)
	{
		$fullClassName = $className;

		// skip if already loaded
		if(
			class_exists($className, false)
			|| interface_exists($className, false)
			|| in_array($className, static::$_loadedClasses)
		)
		{
			return;
		}

		// try to load class PSR-0 style
		if (!preg_match('/^Sabre_/', $className)) {
			if ($lastNsPos = strrpos($className, '\\')) {
				$namespace = substr($className, 0, $lastNsPos);
				$className = substr($className, $lastNsPos + 1);
				$fileName  = str_replace('\\', DIRECTORY_SEPARATOR, $namespace) . DIRECTORY_SEPARATOR;
			} else {
                                $fileName = '';
                        }
			$fileName .= str_replace('_', DIRECTORY_SEPARATOR, $className);
			$classNode = static::resolvePath("php-classes/$fileName.php");
		}

		// fall back to emergence legacy class format
		if(!$classNode && empty($namespace))
		{
			// try to load class flatly
			$classNode = static::resolvePath("php-classes/$className.class.php");
		}

		if(!$classNode)
		{
			return;
			//throw new Exception("Unable to load class '$fullClassName'");
		}
		elseif(!$classNode->MIMEType == 'application/php')
		{
			throw new Exception("Class file for '$fullClassName' is not application/php");
		}
		
		// add to loaded class queue
		static::$_loadedClasses[] = $fullClassName;
		
		// load source code
		require($classNode->RealPath);	

		// try to load config
		if (class_exists($fullClassName, false)) {
			static::loadConfig($fullClassName);
		
			// invoke __classLoaded
			if (method_exists($fullClassName, '__classLoaded')) {
				call_user_func(array($fullClassName, '__classLoaded'));
			}
		}
	}
	
	static public function loadConfig($className)
	{
		// try to load class PSR-0 style
		if ($lastNsPos = strrpos($className, '\\')) {
			$namespace = substr($className, 0, $lastNsPos);
			$className = substr($className, $lastNsPos + 1);
			$fileName  = str_replace('\\', DIRECTORY_SEPARATOR, $namespace) . DIRECTORY_SEPARATOR;
		} else {
                        $fileName = '';
                }
		$fileName .= str_replace('_', DIRECTORY_SEPARATOR, $className);
		$configNode = static::resolvePath("php-config/$fileName.config.php");

		if (!$configNode && empty($namespace)) {
			$configNode = static::resolvePath("php-config/$className.config.php");
		}
		
		if ($configNode) {
			if (!$configNode->MIMEType == 'application/php') {
				throw new Exception('Config file for "'.$className.'" is not application/php');
			}
			
			require($configNode->RealPath);
		}
	}
	
	
	static public function handleError($errno, $errstr, $errfile, $errline)
	{
		if(!(error_reporting() & $errno))
			return;
		
		if(substr($errfile, 0, strlen(static::$rootPath)) == static::$rootPath)
		{
			$fileID = substr(strrchr($errfile, '/'), 1);
			$File = SiteFile::getByID($fileID);

			$errfile .= ' ('.$File->Handle.')';
		}
		
		if(!headers_sent())
		{
			header('Status: 500 Internal Server Error');
		}

		$message = "<h1>Error</h1><p>$errstr</p><p><b>Source:</b> $errfile<br /><b>Line:</b> $errline</p>";

		if (!empty($File)) {
			$message .= "<p><b>Author:</b> ".($File->Author ? $File->Author->Username : 'unknown')."<br /><b>Timestamp:</b> ".date('Y-m-d h:i:s', $File->Timestamp)."</p>";
		}
			
		die($message);
	}
	
	static public function handleException($e)
	{
		if(extension_loaded('newrelic'))
		{
			newrelic_notice_error(null, $e);
		}
		
		if(!headers_sent())
		{
			header('Status: 500 Internal Server Error');
		}
		die('<h1>Unhandled Exception</h1><p>'.get_class($e).': '.$e->getMessage().'</p><h1>Backtrace:</h1><pre>'.$e->getTraceAsString().'</pre><h1>Exception Dump</h1><pre>'.print_r($e,true).'</pre>');
	}
	
	static public function respondNotFound($message = 'Page not found')
	{
		if(is_callable(static::$onNotFound))
		{
			call_user_func(static::$onNotFound, $message);
		}
		else
		{
			header('HTTP/1.0 404 Not Found');
			die($message);
		}
	}
	
	static public function respondBadRequest($message = 'Cannot display resource')
	{
		header('HTTP/1.0 400 Bad Request');
		die($message);
	}
	
	static public function respondUnauthorized($message = 'Access denied')
	{
		header('HTTP/1.0 403 Forbidden');
		die($message);
	}
	
	
	static public function getRootCollection($handle)
	{
		if(!empty(static::$_rootCollections[$handle]))
			return static::$_rootCollections[$handle];
				
		return static::$_rootCollections[$handle] = SiteCollection::getOrCreateRootCollection($handle);
	}


	static public function splitPath($path)
	{
		return explode('/', ltrim($path, '/'));
	}
	
	static public function redirect($path, $get = false, $hash = false)
	{
		if(is_array($path)) $path = implode('/', $path);
		
		if(preg_match('/^https?:\/\//i', $path))
			$url = $path;
		else
			$url = ($_SERVER['HTTPS'] ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . '/' . ltrim($path, '/');

		if($get)
		{
			$url .= '?' . (is_array($get) ? http_build_query($get) : $get);
		}
	
		if($hash)
		{
			$url .= '#' . $hash;	
		}
		
		header('Location: ' . $url);
		exit();
	}

	static public function redirectPermanent($path, $get = false, $hash = false)
	{
		header('HTTP/1.1 301 Moved Permanently');
		return static::redirect($path, $get, $hash);
	}

	static public function getPath($index = null)
	{
		if($index === null)
			return static::$requestPath;
		else
			return static::$requestPath[$index];
	}

	static public function matchPath($index, $string)
	{
		return 0==strcasecmp(static::getPath($index), $string);
	}

	static public function normalizePath($filename)
	{
		$filename = str_replace('//', '/', $filename);
		$parts = explode('/', $filename);
		$out = array();
		foreach ($parts as $part) {
			if ($part == '.') continue;
			if ($part == '..') {
				array_pop($out);
				continue;
			}
			$out[] = $part;
		}
		return implode('/', $out);
	}
	
	static public function getVersionedRootUrl($path)
	{
		if(is_string($path))
		{
			$path = static::splitPath($path);
		}
		
		$fsPath = $path;
		array_unshift($fsPath, 'site-root');
		$url = '/' . implode('/', $path);
		
		$Node = static::resolvePath($fsPath);
		
		if($Node) {
			return $url . '?_sha1=' . $Node->SHA1;
		}
		else {
			return $url;
		}
	}

	static public function getConfig($key = null)
	{
		if ($key) {
			return array_key_exists($key, static::$config) ? static::$config[$key] : null;
		} else {
			return static::$config;
		}
	}
	
	static public function finishRequest($exit = true)
	{
		if ($exit) {
			exit();
		} else {
			fastcgi_finish_request();
		}
	}
}
