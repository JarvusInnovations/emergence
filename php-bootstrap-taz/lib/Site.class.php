<?php

class Site
{
	// config properties
	static public $debug = false;
	static public $defaultPage = 'home.php';
	static public $controlKey = '86b153e60c0e801';

	static public $databaseHost;
	static public $databaseName;
	static public $databaseUsername;
	static public $databasePassword;
	
	static public $autoCreateSession = true;
	
	static public $onInitialized;
	static public $onNotFound;
	static public $onRequestMapped;
	

	// public properties
	//static public $ID;
	static public $Title;
	static public $rootPath;

	static public $webmasterEmail = 'errors@chrisrules.com';

	static public $requestURI;
	static public $requestPath;
	static public $pathStack;

	// protected properties
	static protected $_rootCollections;
	static protected $_config;
	static protected $_hostConfig;
	static protected $_parentHostConfig;

	
	static public function initialize()
	{
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

		// retrieve static configuration
		if(!(static::$_config = apc_fetch($_SERVER['HTTP_HOST'])) || ($_GET['_recache']==static::$controlKey))
		{
			static::$_config = static::_compileConfiguration();
			apc_store($_SERVER['HTTP_HOST'], static::$_config);
		}

		// get host-specific config
		if(!static::$_hostConfig = static::$_config['hosts'][$_SERVER['HTTP_HOST']])
		{
			throw new Exception('Current host is unknown');
		}
		
		if(static::$_hostConfig['ParentHostname'])
		{
			if(!static::$_parentHostConfig = static::$_config['hosts'][static::$_hostConfig['ParentHostname']])
			{
				throw new Exception('Parent host is unknown');
			}
		}
		
		// get request URI
		if(empty(static::$requestURI))
			static::$requestURI = parse_url($_SERVER['REQUEST_URI']);
			
		// get path stack
		static::$pathStack = static::$requestPath = static::splitPath(static::$requestURI['path']);
		
		// register class loader
		spl_autoload_register('Site::loadClass');
		
		// set error handle
		set_error_handler('Site::handleError');
		
		// register exception handler
		set_exception_handler('Site::handleException');
		
		// check virtual system for site config
		static::loadConfig(__CLASS__);
		
		
		if(is_callable(static::$onInitialized))
			call_user_func(static::$onInitialized);
	}
		
	
	static protected function _compileConfiguration()
	{
		$config = array();
		
		$config['hosts'] = DB::table('Hostname', 'SELECT s.*, h.Hostname, parent_h.Hostname AS ParentHostname FROM _e_hosts h LEFT JOIN _e_sites s ON(s.ID=h.SiteID) LEFT JOIN _e_hosts parent_h ON(parent_h.SiteID=s.ParentID)');
		
		return $config;
	}
	
	static public function handleRequest()
	{
		// TODO: try global handle lookup?

		// resolve URL in root
		$resolvedNode = false;
		$rootNode = static::getRootCollection('site-root');

		// handle root request - default page
		if(empty(static::$pathStack[0]) && static::$defaultPage)
		{
			static::$pathStack[0] = static::$defaultPage;
		}
		
		// route request
		if(static::$pathStack[0] == 'emergence')
		{
			array_shift(static::$pathStack);
			return Emergence::handleRequest();
		}
		elseif(static::$pathStack[0] == 'parent-refresh' && $_REQUEST['key'] == static::$controlKey)
		{
			DB::nonQuery(
				'DELETE FROM `%s` WHERE CollectionID IN (SELECT ID FROM `%s` WHERE SiteID != %u)'
				,array(
					SiteFile::$tableName
					,SiteCollection::$tableName
					,Site::getSiteID()
				)
			);
			
			die('Cleared '.DB::affectedRows().' cached files');
		}
		else
		{
			$resolvedNode = $rootNode;
			$resolvedPath = array();

			while(($handle = array_shift(static::$pathStack)))
			{
				$scriptHandle = (substr($handle,-4)=='.php') ? $handle : $handle.'.php';

				//printf('%s: (%s)/(%s) - %s<br>', $resolvedNode->Handle, $handle, implode('/',static::$pathStack), $scriptHandle);
				if(
					(
						$resolvedNode
						&& method_exists($resolvedNode, 'getChild')
						&& (
							($childNode = $resolvedNode->getChild($handle))
							|| ($scriptHandle && $childNode = $resolvedNode->getChild($scriptHandle))
						)
					)
					|| ($childNode = Emergence::resolveFileFromParent('site-root', array_merge($resolvedPath,array($handle))))
					|| ($scriptHandle && $childNode = Emergence::resolveFileFromParent('site-root', array_merge($resolvedPath,array($scriptHandle))))
				)
				{
					$resolvedNode = $childNode;
					
					if(is_a($resolvedNode, 'SiteFile'))
					{
						break;
					}
				}
				else
				{
					$resolvedNode = false;
					//break;
				}
				
				$resolvedPath[] = $handle;
			}

		}
		
		if($resolvedNode)
		{
			// create session
			if(static::$autoCreateSession && $resolvedNode->MIMEType == 'application/php')
			{
				$GLOBALS['Session'] = UserSession::getFromRequest();
			}

			if(is_callable(static::$onRequestMapped))
			{
				call_user_func(static::$onRequestMapped, $resolvedNode);
			}

			if($resolvedNode->MIMEType == 'application/php')
			{
				require($resolvedNode->RealPath);
				exit();
			}
			elseif(!is_callable(array($resolvedNode, 'outputAsResponse')))
			{
				//throw new Exception('Node does not support rendering');
				static::respondNotFound();
			}
			else
			{
				$resolvedNode->outputAsResponse();
			}
		}
		else
		{
			static::respondNotFound();
		}
	}
	
	static public function resolvePath($path, $checkParent = true)
	{
		if(is_string($path) && (empty($path) || $path == '/')) {
			return new SiteDavDirectory();
		}
		else {
            if(!is_array($path))
			    $path = static::splitPath($path);
                
            $collectionHandle = array_shift($path);
        }
			
		// get collection
		if(!$collectionHandle || !$collection = static::getRootCollection($collectionHandle))
		{
			throw new Exception('Could not resolve root collection: '.$collectionHandle);
		}

		// get file
		$node = $collection->resolvePath($path);

		// try to get from parent
		if(!$node && $checkParent)
		{
			$node = Emergence::resolveFileFromParent($collectionHandle, $path);
		}

		return $node;
	}
	
	
	static protected $_loadedClasses = array();
	
	static public function loadClass($className)
	{
		//printf("loadClass(%s) -> %s<br/>\n", $className, var_export(class_exists($className, false), true));

		// skip if already loaded
		if(
			class_exists($className, false)
			|| interface_exists($className, false)
			|| in_array($className, static::$_loadedClasses)
		)
		{
			return;
		}
		
		// try to load class
		$classNode = static::resolvePath("php-classes/$className.class.php");

		if(!$classNode)
		{
			die("<h1>Unable to load class '$className'</h1><pre>".print_r(debug_backtrace(), true)."</pre>");
		}
		elseif(!$classNode->MIMEType == 'application/php')
		{
			die("Class file for '$className' is not application/php");
		}
		
		// add to loaded class queue
		static::$_loadedClasses[] = $className;
		
		//print "...loadClass($className) -> $classNode->RealPath<br/>";
		require($classNode->RealPath);	

		// try to load config
		static::loadConfig($className);
		
		// invoke __classLoaded
		if(method_exists($className, '__classLoaded'))
		{
			call_user_func(array($className, '__classLoaded'));
		}

		
		//Debug::dump($classNode);
	}
	
	static public function loadConfig($className)
	{
		if($configNode = static::resolvePath("php-config/$className.config.php"))
		{
			if(!$configNode->MIMEType == 'application/php')
			{
				die('Config file for "'.$className.'" is not application/php');
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
			
		die("<h1>Error</h1><p>$errstr</p><p><b>Source:</b> $errfile<br /><b>Line:</b> $errline<br /><b>Author:</b> {$File->Author->Username}<br /><b>Timestamp:</b> ".date('Y-m-d h:i:s', $File->Timestamp)."</p>");
	}
	
	static public function handleException($e)
	{
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
	
	static public function getConfig($key = false)
	{
		return $key ? static::$_config[$key] : static::$_config;
	}
	
	static public function getHostConfig($key = false)
	{
		return $key ? static::$_hostConfig[$key] : static::$_hostConfig;
	}
	
	static public function getParentHostConfig($key = false)
	{
		return $key ? static::$_parentHostConfig[$key] : static::$_parentHostConfig;
	}
	
	static public function getSiteID()
	{
		return static::getHostConfig('ID');
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
}
