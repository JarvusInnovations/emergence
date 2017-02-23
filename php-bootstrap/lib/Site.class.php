<?php

class Site
{
    // config properties
    public static $title = null;
    public static $debug = false;
    public static $production = false;
    public static $defaultPage = 'home.php';
    public static $autoCreateSession = true;
    public static $listCollections = false;
    public static $onInitialized;
    public static $onNotFound;
    public static $onRequestMapped;
    public static $permittedOrigins = array();
    public static $autoPull = true;
    public static $skipSessionPaths = array();
    public static $onSiteCreated;
    public static $onBeforeScriptExecute;
    public static $onBeforeStaticResponse;

    // public properties
    public static $hostname;
    public static $rootPath;
    public static $webmasterEmail = 'root@localhost';
    public static $requestURI;
    public static $requestPath = array();
    public static $pathStack = array();
    public static $resolvedPath = array();
    public static $config; // TODO: deprecated; use Site::getConfig(...)
    public static $initializeTime;

    // protected properties
    protected static $_loadedClasses = array();
    protected static $_rootCollections;
    protected static $_config;

    public static function initialize($rootPath, $hostname = null)
    {
        static::$initializeTime = microtime(true);

        // get site root
        if ($rootPath) {
            static::$rootPath = $rootPath;
        } elseif (!static::$rootPath) {
            throw new Exception('No site root detected');
        }

        // load config
        if (!(static::$_config = Cache::rawFetch(static::$rootPath))) {
            if (is_readable(static::$rootPath.'/site.json')) {
                static::$_config = json_decode(file_get_contents(static::$rootPath.'/site.json'), true);
                Cache::rawStore(static::$rootPath, static::$_config);
            } elseif (is_readable(static::$rootPath.'/Site.config.php')) {
                include(static::$rootPath.'/Site.config.php');
                Cache::rawStore(static::$rootPath, static::$_config);
            }
        }

        static::$config = static::$_config; // TODO: deprecate

        // get hostname
        if ($hostname) {
            static::$hostname = $hostname;
        } elseif (!static::$hostname) {
            if (!empty(static::$config['primary_hostname'])) {
                static::$hostname = static::$config['primary_hostname'];
            } else {
                throw new Exception('No hostname detected');
            }
        }

        // get path stack
        if (!empty($_SERVER['REQUEST_URI'])) {
            $path = $_SERVER['REQUEST_URI'];

            if (false !== ($qPos = strpos($path, '?'))) {
                $path = substr($path, 0, $qPos);
            }

            static::$pathStack = static::$requestPath = static::splitPath($path);
        }

        // set time zone
        if ($timezone = static::getConfig('time_zone')) {
            date_default_timezone_set($timezone);
        }

        // set useful transaction name for newrelic
        if (extension_loaded('newrelic')) {
            newrelic_name_transaction(static::getConfig('handle') . '/' . implode('/', site::$requestPath));
        }

        // register class loader
        spl_autoload_register('Site::loadClass');

        // set error handle
        set_error_handler('Site::handleError');

        // register exception handler
        set_exception_handler('Site::handleException');

        // check virtual system for site config
        static::loadConfig(__CLASS__);

        // get site title
        if (!static::$title) {
            static::$title = static::getConfig('label');
        }

        // configure error display
        ini_set('display_errors', static::$debug);

        // check virtual system for proxy config
        if (class_exists('HttpProxy')) {
            static::loadConfig('HttpProxy');
        }

        if (is_callable(static::$onInitialized)) {
            call_user_func(static::$onInitialized);
        }

        if (class_exists('Emergence\\EventBus')) {
            Emergence\EventBus::fireEvent('initialized', 'Site');
        }
    }

    public static function onSiteCreated($requestData)
    {
        // create initial developer
        if (!empty($requestData['create_user'])) {
            try {
                $userClass = User::getStaticDefaultClass();

                $User = $userClass::create(array_merge($requestData['create_user'], array(
                    'AccountLevel' => 'Developer'
                )));
                $User->setClearPassword($requestData['create_user']['Password']);
                $User->save();
            } catch (Exception $e) {
                // fail silently
            }
        }

        // execute configured method
        if (is_callable(static::$onSiteCreated)) {
            call_user_func(static::$onSiteCreated, $requestData);
        }

        if (class_exists('Emergence\\EventBus')) {
            Emergence\EventBus::fireEvent('siteCreated', 'Site', $requestData);
        }
    }

    public static function handleRequest()
    {
        // handle emergence request
        if (static::$pathStack[0] == 'emergence') {
            array_shift(static::$pathStack);
            return Emergence::handleRequest();
        }

        // handle CORS headers
        if (isset($_SERVER['HTTP_ORIGIN'])) {
            $hostname = strtolower(parse_url($_SERVER['HTTP_ORIGIN'], PHP_URL_HOST));
            if ($hostname == strtolower(static::$hostname) || static::$permittedOrigins == '*' || in_array($hostname, static::$permittedOrigins)) {
                header('Access-Control-Allow-Origin: ' . $_SERVER['HTTP_ORIGIN']);
                header('Access-Control-Allow-Credentials: true');
                //header('Access-Control-Max-Age: 86400')
            } else {
                header('HTTP/1.1 403 Forbidden');
                exit();
            }
        }

        if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS' && isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_METHOD'])) {
            header('Access-Control-Allow-Methods: ' . $_SERVER['HTTP_ACCESS_CONTROL_REQUEST_METHOD']);

            if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS'])) {
                header('Access-Control-Allow-Headers: ' . $_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']);
            }

            exit();
        }

        // try to resolve URL in site-root
        $rootNode = static::getRootCollection('site-root');
        $resolvedNode = $rootNode;
        static::$resolvedPath = array();

        // handle default page request
        if (empty(static::$pathStack[0]) && static::$defaultPage) {
            static::$pathStack[0] = static::$defaultPage;
        }

        // crawl down path stack until a handler is found
        while (($handle = array_shift(static::$pathStack))) {
            $scriptHandle = (substr($handle, -4)=='.php') ? $handle : $handle.'.php';

            if (
                (
                    $resolvedNode
                    && method_exists($resolvedNode, 'getChild')
                    && (
                        ($scriptHandle && $childNode = $resolvedNode->getChild($scriptHandle))
                        || ($childNode = $resolvedNode->getChild($handle))
                    )
                )
                || ($scriptHandle && $childNode = Emergence::resolveFileFromParent('site-root', array_merge(static::$resolvedPath, array($scriptHandle))))
                || ($childNode = Emergence::resolveFileFromParent('site-root', array_merge(static::$resolvedPath, array($handle))))
            )
            {
                $resolvedNode = $childNode;

                if (is_a($resolvedNode, 'SiteFile')) {
                    static::$resolvedPath[] = $scriptHandle;
                    break;
                }
            } else {
                $resolvedNode = false;
                //break;
            }

            static::$resolvedPath[] = $handle;
        }


        if ($resolvedNode) {
            // prevent caching by default
            header('Cache-Control: max-age=0, no-cache, no-store, must-revalidate');
            header('Pragma: no-cache');

            if (is_callable(static::$onRequestMapped)) {
                call_user_func(static::$onRequestMapped, $resolvedNode);
            }

            if (class_exists('Emergence\\EventBus')) {
                Emergence\EventBus::fireEvent('requestMapped', 'Site', array(
                    'node' => $resolvedNode
                ));
            }

            // switch collection result to its _index.php if found
            if (
                is_a($resolvedNode, 'SiteCollection') &&
                (
                    ($indexNode = $resolvedNode->getChild('_index.php')) ||
                    ($indexNode = Emergence::resolveFileFromParent('site-root', array_merge(static::$resolvedPath, array('_index.php'))))
                )
            ) {
                $resolvedNode = $indexNode;
            }

            if ($resolvedNode->MIMEType == 'application/php') {
                // TODO: execute _all.php handlers, cache the list of them for the containing collection
                static::executeScript($resolvedNode);
            } elseif (is_callable(array($resolvedNode, 'outputAsResponse'))) {
                if (!is_a($resolvedNode, 'SiteFile') && !static::$listCollections) {
                    static::respondNotFound();
                }

                if (is_callable(static::$onBeforeStaticResponse)) {
                    call_user_func(static::$onBeforeStaticResponse, $resolvedNode);
                }

                if (class_exists('Emergence\\EventBus')) {
                    Emergence\EventBus::fireEvent('beforeStaticResponse', 'Site', array(
                        'node' => $resolvedNode
                    ));
                }

                $resolvedNode->outputAsResponse();
            } else {
                static::respondNotFound();
            }
        } else {
            static::respondNotFound();
        }
    }

    public static function executeScript(SiteFile $_SCRIPT_NODE, $_SCRIPT_EXIT = true)
    {
        // create session
        if (
            empty($GLOBALS['Session']) &&
            static::$autoCreateSession &&
            !in_array(implode('/', static::$resolvedPath), static::$skipSessionPaths)
        ) {
            $GLOBALS['Session'] = UserSession::getFromRequest();
        }

        if (extension_loaded('newrelic')) {
            if (!empty($GLOBALS['Session'])) {
                newrelic_add_custom_parameter('session_id', $GLOBALS['Session']->Handle);
                newrelic_add_custom_parameter('person_id', $GLOBALS['Session']->PersonID);
            }

            newrelic_add_custom_parameter('script_path', $_SCRIPT_NODE->FullPath);
        }

        if (is_callable(static::$onBeforeScriptExecute)) {
            call_user_func(static::$onBeforeScriptExecute, $_SCRIPT_NODE);
        }

        if (class_exists('Emergence\\EventBus')) {
            Emergence\EventBus::fireEvent('beforeScriptExecute', 'Site', array(
                'node' => $_SCRIPT_NODE,
                'exit' => $_SCRIPT_EXIT
            ));
        }

        require($_SCRIPT_NODE->RealPath);

        if ($_SCRIPT_EXIT) {
            exit();
        }
    }

    public static function resolvePath($path, $checkParent = true, $checkCache = true)
    {
        // special case: request for root collection
        if (is_string($path) && (empty($path) || $path == '/')) {
            return new Emergence\DAV\RootCollection();
        }

        // parse path
        if (!is_array($path)) {
            $path = static::splitPath($path);
        }

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

        return $node;
    }

    public static function loadClass($className)
    {
        $fullClassName = $className;

        // skip if already loaded
        if (
            class_exists($className, false)
            || interface_exists($className, false)
            || in_array($className, static::$_loadedClasses)
        ) {
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
        if (!$classNode && empty($namespace)) {
            // try to load class flatly
            $classNode = static::resolvePath("php-classes/$className.class.php");
        }

        if (!$classNode) {
            return;
            //throw new Exception("Unable to load class '$fullClassName'");
        } elseif (!$classNode->MIMEType == 'application/php') {
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

    public static function loadConfig($className)
    {
        $cacheKey = 'class-config:' . $className;


        if (!$configFileIds = Cache::fetch($cacheKey)) {
            $configFileIds = array();


            // compute file path for given class name
            if ($lastNsPos = strrpos($className, '\\')) {
                $namespace = substr($className, 0, $lastNsPos);
                $className = substr($className, $lastNsPos + 1);
                $path  = str_replace('\\', DIRECTORY_SEPARATOR, $namespace) . DIRECTORY_SEPARATOR;
            } else {
                $path = '';
            }

            $path .= str_replace('_', DIRECTORY_SEPARATOR, $className);


            // look for composite config files first
            $collectionPath = "php-config/$path.config.d";
            Emergence_FS::cacheTree($collectionPath);

            foreach (Emergence_FS::getAggregateChildren($collectionPath) AS $filename => $node) {
                if ($node->Type == 'application/php') {
                    $configFileIds[] = $node->ID;
                }
            }


            // look for primary config file
            $configFileNode = Site::resolvePath("php-config/$path.config.php");


            // Fall back on looking for Old_School_Underscore_Namespacing in root
            if (!$configFileNode && empty($namespace) && $path != $className) {
                $configFileNode = Site::resolvePath("php-config/$className.config.php");
            }

            if ($configFileNode && $configFileNode->MIMEType == 'application/php') {
                $configFileIds[] = $configFileNode->ID;
            }

            Cache::store($cacheKey, $configFileIds);
        }


        foreach ($configFileIds AS $id) {
            require(SiteFile::getRealPathByID($id));
        }
    }


    public static function handleError($errno, $errstr, $errfile, $errline)
    {
        if (!(error_reporting() & $errno)) {
            return;
        }

        if (substr($errfile, 0, strlen(static::$rootPath)) == static::$rootPath) {
            $fileID = substr(strrchr($errfile, '/'), 1);
            $File = SiteFile::getByID($fileID);

            $errfile .= ' ('.$File->Handle.')';
        }

        $report = "<h1>Error</h1><p>$errstr</p><p><b>Source:</b> $errfile<br /><b>Line:</b> $errline</p>";

        if (!empty($File)) {
            $report .= "<p><b>Author:</b> ".($File->Author ? $File->Author->Username : 'unknown')."<br /><b>Timestamp:</b> ".date('Y-m-d h:i:s', $File->Timestamp)."</p>";
        }

        $report .= static::_getRequestReport();
        $report .= sprintf("<h2>Backtrace</h2>\n<pre>%s</pre>\n", htmlspecialchars(print_r(debug_backtrace(), true)));

        if (!headers_sent()) {
            header('Status: 500 Internal Server Error');
        }

        if (static::$debug) {
            die($report);
        } else {
            if (class_exists('Email')) {
                Email::send(static::$webmasterEmail, 'Scripting error on '.static::$hostname, $report);
            }
            die('A problem has occurred and this request could not be handled, the webmaster has been sent a diagnostic report.');
        }
    }

    public static function handleException($e)
    {
        if (extension_loaded('newrelic')) {
            newrelic_notice_error(null, $e);
        }

        // respond
        $report = sprintf("<h1>Unhandled Exception: %s</h1>\n", get_class($e));
        $report .= sprintf("<h2>Message</h2>\n<pre>%s</pre>\n", htmlspecialchars($e->getMessage()));
        $report .= sprintf("<h2>Code</h2>\n<pre>%s</pre>\n", htmlspecialchars($e->getCode()));
        $report .= static::_getRequestReport();
        $report .= sprintf("<h2>Backtrace</h2>\n<pre>%s</pre>\n", htmlspecialchars(print_r(debug_backtrace(), true)));

        if (!headers_sent()) {
            header('Status: 500 Internal Server Error');
        }

        if (static::$debug) {
            die($report);
        } else {
            if (class_exists('Email')) {
                Email::send(static::$webmasterEmail, 'Unhandled exception on '.static::$hostname, $report);
            }
            die('A problem has occurred and this request could not be handled, the webmaster has been sent a diagnostic report.');
        }
    }

    protected static function _getRequestReport()
    {
        $report = '';

        if (isset($_SERVER['REQUEST_URI'])) {
            $report .= sprintf("<h2>URI</h2>\n<p>%s</p>\n", htmlspecialchars($_SERVER['REQUEST_URI']));
        }

        if (isset($_SERVER['REQUEST_METHOD'])) {
            $report .= sprintf("<h2>Request Method</h2>\n<p>%s</p>\n", htmlspecialchars($_SERVER['REQUEST_METHOD']));
        }

        if ($requestBody = file_get_contents('php://input')) {
            $report .= sprintf("<h2>Request Body</h2>\n<p>%s</p>\n", htmlspecialchars($requestBody));
        }

        if (!empty($_SERVER['HTTP_REFERER'])) {
            $report .= sprintf("<h2>Referrer</h2>\n<p>%s</p>\n", htmlspecialchars($_SERVER['HTTP_REFERER']));
        }

        if (!empty($_SERVER['HTTP_USER_AGENT'])) {
            $report .= sprintf("<h2>User Agent</h2>\n<p>%s</p>\n", htmlspecialchars($_SERVER['HTTP_USER_AGENT']));
        }

        if (!empty($_SERVER['REMOTE_ADDR'])) {
            $report .= sprintf("<h2>Remote Address</h2>\n<p>%s</p>\n", htmlspecialchars($_SERVER['REMOTE_ADDR']));
        }

        if (!empty($GLOBALS['Session']) && $GLOBALS['Session']->Person) {
            $report .= sprintf("<h2>User</h2>\n<pre>%s</pre>\n", var_export($GLOBALS['Session']->Person->getData(), true));
        }

        return $report;
    }

    public static function respondNotFound($message = 'Page not found')
    {
        if (is_callable(static::$onNotFound)) {
            call_user_func(static::$onNotFound, $message);
        }

        $notFoundStack = array_filter(static::$requestPath);
        array_unshift($notFoundStack, 'site-root');

        // TODO: cache list of _default/_notfound handlers for given containing collection
        $notFoundNode = null;
        while (count($notFoundStack)) { // last iteration is when site-root is all that's left
            if (
                ($notFoundNode = static::resolvePath(array_merge($notFoundStack, array('_default.php')))) ||
                ($notFoundNode = static::resolvePath(array_merge($notFoundStack, array('_notfound.php'))))
            ) {
                // calculate pathStack and resolvedPath relative to each handler
                static::$pathStack = array_slice(static::$requestPath, count($notFoundStack) - 1);
                static::$resolvedPath = array_slice(static::$requestPath, 0, count($notFoundStack) - 1);

                // false so execution continues if handler doesn't terminate
                static::executeScript($notFoundNode, false);
            }

            array_pop($notFoundStack);
        }

        header('HTTP/1.0 404 Not Found');
        die($message);
    }

    public static function respondBadRequest($message = 'Cannot display resource')
    {
        header('HTTP/1.0 400 Bad Request');
        die($message);
    }

    public static function respondUnauthorized($message = 'Access denied')
    {
        header('HTTP/1.0 403 Forbidden');
        die($message);
    }

    public static function getRootCollection($handle)
    {
        if (!empty(static::$_rootCollections[$handle])) {
            return static::$_rootCollections[$handle];
        }

        return static::$_rootCollections[$handle] = SiteCollection::getOrCreateRootCollection($handle);
    }

    public static function splitPath($path)
    {
        return explode('/', ltrim($path, '/'));
    }

    public static function redirect($path, $get = false, $hash = false)
    {
        if (is_array($path)) {
            $path = implode('/', $path);
        }

        if (preg_match('/^https?:\/\//i', $path)) {
            $url = $path;
        } else {
            $url = ($_SERVER['HTTPS'] ? 'https' : 'http') . '://' . static::$hostname . '/' . ltrim($path, '/');
        }

        if ($get) {
            $url .= '?' . (is_array($get) ? http_build_query($get) : $get);
        }

        if ($hash) {
            $url .= '#' . $hash;
        }

        header('Location: ' . $url);
        exit();
    }

    public static function redirectPermanent($path, $get = false, $hash = false)
    {
        header('HTTP/1.1 301 Moved Permanently');
        return static::redirect($path, $get, $hash);
    }

    public static function getPath($index = null)
    {
        if ($index === null) {
            return static::$requestPath;
        } else {
            return static::$requestPath[$index];
        }
    }

    public static function matchPath($index, $string)
    {
        return 0==strcasecmp(static::getPath($index), $string);
    }

    public static function normalizePath($filename)
    {
        $filename = str_replace('//', '/', $filename);
        $parts = explode('/', $filename);
        $out = array();
        foreach ($parts as $part) {
            if ($part == '.') {
                continue;
            }

            if ($part == '..') {
                array_pop($out);
                continue;
            }

            $out[] = $part;
        }

        return implode('/', $out);
    }

    public static function getVersionedRootUrl($path)
    {
        if (is_string($path)) {
            $path = static::splitPath($path);
        }

        $fsPath = $path;
        array_unshift($fsPath, 'site-root');
        $url = '/' . implode('/', $path);

        $Node = static::resolvePath($fsPath);

        if ($Node) {
            return $url . '?_sha1=' . $Node->SHA1;
        } else {
            return $url;
        }
    }

    public static function getConfig($key = null)
    {
        if ($key) {
            return array_key_exists($key, static::$_config) ? static::$_config[$key] : null;
        } else {
            return static::$_config;
        }
    }

    public static function finishRequest($exit = true)
    {
        if ($exit) {
            exit();
        } else {
            fastcgi_finish_request();
        }
    }

    /**
     * Set the active timezone for the site
     *
     * @param string $timezone Time zone name as defined in the IANA time zone database
     *
     * @return void
     */
    public static function setTimezone($timezone)
    {
        date_default_timezone_set($timezone);
        DB::syncTimezone();

        Emergence\EventBus::fireEvent(
            'timezoneSet',
            __CLASS__,
            array(
                'timezone' => $timezone
            )
        );
    }
}
