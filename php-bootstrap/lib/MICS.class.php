<?php 

// class definition
class MICS
{
	static public $Version = '3.3';
	
	// configurables
	static public $SiteID;
	static public $SiteName = 'MICS-powered Website';
	static public $CodePath = '/var/mics/code';
	static public $ConfPath = './conf';
	static public $TemplatePath = '../templates';
	static public $ClassPath;
	static public $CoreFeatures = array();
	static public $Locale = 'en_US.UTF-8';
	static public $DebugMode = false;
	static public $SourceOverride = array();
	static public $HTTPSAvailable = false;
	static public $HTTPSDomain = false;
	
	static public $ClassDumping = false;
	
	// static private properties
	static private $_initialized = false;
	static private $_mysqli;
	static private $_path;
	static private $_app_name;
	static private $_app_path;
	static private $_shifted_path;
	static private $_loadedClasses = array();
	static private $_loadedConfigFiles = array();
	static private $_loadedFeatures = array();
	static private $_loadQueue = array();

	
	// public methods
	static public function initialize()
	{
		// only run once
		if(static::$_initialized)
			return false;
		
		// load config from Site
		static::$SiteID = 1;//Site::$ID;
		static::$SiteName = Site::$Title;
		
		// parse path
		$path = $_SERVER['REQUEST_URI'];
		
		if ($qPos = strpos($_SERVER['REQUEST_URI'], '?')) {
			$path = substr($path, 0, $qPos);
		}

		
		static::setPath($path);
		
		// set locale
		setlocale(LC_ALL, self::$Locale);
		
		// load core features
		foreach (self::$CoreFeatures AS $featureName) {
			require (self::$CodePath.'/Core/'.$featureName.'.inc.php');
			self::$_loadedFeatures[] = $featureName;
		}
		
		// register class autoloader
		//spl_autoload_register('MICS::loadClass');
		
		// register exception handler
		//set_exception_handler('MICS::handleException');
		
		//set_error_handler('MICS::handleError', E_WARNING);
		
		// update include path
		set_include_path(get_include_path().PATH_SEPARATOR.self::$CodePath);
		
		// set headers
		header('Pragma: no-cache');
		header('Cache-Control: max-age=0, no-cache, no-store, must-revalidate');
		

		
		// call micsInitialized for core features
		foreach (self::$_loadedFeatures AS $featureName) {
			if (method_exists($featureName, 'micsInitialized')) {
				call_user_func(array($featureName, 'micsInitialized'));
			}
		}
		
		// record state change
		self::$_initialized = true;
	}
	
	static public function terminate() {
		exit();
	}
	
	static public function useHTTPS($required = false) {
		if (self::$HTTPSAvailable && ($_SERVER['HTTPS'] != 'on')) {
			
			$domain = self::$HTTPSDomain && !self::$DebugMode ? self::$HTTPSDomain : $_SERVER['HTTP_HOST'];
		
			header('Location: https://'.$domain.$_SERVER['REQUEST_URI']);
			exit();
		}
	}

	
	static public function handleException($e) {
		ErrorHandler::handleException($e);
	}

	static public function handleError($errno, $errstr, $errfile, $errline, $errcontext) {

		MICS::dump(func_get_args(), 'caught error', true);

	}

	
	static public function getLoadedClasses() {
		return self::$_loadedClasses;
	}

	
	static public function getLoadedFeatures() {
		return self::$_loadedFeatures;
	}

	
	static public function isFeatureLoaded($featureName) {
		return in_array($featureName, self::$_loadedFeatures);
	}
	
	static public function externalRedirect($url, $get = false, $hash = false)
	{
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

	static public function redirect($path, $get = false, $hash = false)
	{
		if(is_array($path)) $path = implode('/', $path);
		
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
	
	static public function isReferred() {
		if ($_SERVER['REQUEST_METHOD'] != 'GET') { return false; }
		if (!$_SERVER['HTTP_REFERER']) { return false; }
		
		$ref_path = parse_url($_SERVER['HTTP_REFERER'], PHP_URL_PATH);
		if ($ref_path == $_SERVER['REQUEST_URI']) { return false; }
		if ($ref_path == $_SERVER['REDIRECT_URL']) { return false; }

		return true;
	}
	
	static public function magicRedirect($path = false, $get = false, $hash = false) {
	
		$redirect = ($_SERVER['HTTPS'] ? 'https' : 'http') . '://'.$_SERVER['HTTP_HOST'].'/'.self::getApp();
		
		if($path)
			$redirect .= '/'.(is_array($path) ? implode('/', $path) : $path);
		
		if($get)
		{
			$redirect .= '?' . (is_array($get) ? http_build_query($get) : $get);
		}
		
		if($hash)
		{
			$redirect .= '#' . $hash;	
		}
		
		header('Location: ' . $redirect);
		exit();
	}
	
	static public function getApp()
	{
		return Site::$requestPath[0];
	}
	
	static public function setAppName($newAppName) {
		self::$_app_name = $newAppName;
	}
	
	static public function setPath($path = array()) {
		self::$_shifted_path = self::$_path = ( is_array($path) ? $path : explode('/', $path) );
	}
	
	static public function getPath($index = null) {
		if (isset($index)) {
			return self::$_path[$index];
		} else {
			return self::$_path;
		}
	}
	
	static public function getShiftedPath($index = null) {
		if (isset($index)) {
			return self::$_shifted_path[$index];
		} else {
			return self::$_shifted_path;
		}
	}
	
	static public function getAppPath() {
		if (!isset(self::$_app_path)) {
			$app = self::getApp();
			$path = self::getPath();
			
			if (count($path)) {
				self::$_app_path = '/'.$app.'/'.join('/', $path);
			} else {
				self::$_app_path = $app;
			}
		}
		
		return self::$_app_path;
	}
	
	static public function matchAppPath($pattern) {
		return eregi($pattern, self::getAppPath());
	}

	
	static public function shiftPath() {
		return array_shift(self::$_shifted_path);
	}

	
	static public function peekPath() {
		return count(self::$_shifted_path) ? self::$_shifted_path[0] : false;
	}
	
	static public function getQueryString() {
		$data = $_GET;
		unset($data['path']);
		return http_build_query($data);	
	}

	
	static public function loadClassAfter($className, $triggerClass) {
		self::$_loadQueue[$triggerClass][] = $className;
	}
	
	static public function getAllClassRecords()
	{
		// TODO: implement in emergence
		return array();
	}
	
	static public function getClassRecord($className)
	{
		die("getClassRecord($className)");
	}
	
	static public function loadClass($className)
	{
		die("loadClass($className)");
	}

	
	static public function getTemplate($templateName, $className = null, $skip = 0)
	{
		die("getTemplate($templateName)");
	}

	
	static public function textDump($title, $value, $exit = false) {
		printf("\n\n%s:\n\t%s", $title, str_replace("\n", "\n\t", var_export($value, true)));
		
		if ($exit)
			exit();
	}
	
	/*
	 * TODO: Auto-detect calling class/method for default title
	 */
	static public function dump($value, $title = 'Dump', $exit = false, $backtrace = false) {
		printf("<h2>%s:</h2><pre>%s</pre>", $title, htmlspecialchars(var_export($value, true)));
		
		if($backtrace)
		{
			print('<hr><pre>');debug_print_backtrace();print('</pre>');
		}
		
		if ($exit)
			exit();
			
		return $value;
	}

	
	static public function backtrace($printDetails = false)
	{
		$report = sprintf("<h2>Backtrace</h2>\n");
		$report .= sprintf("<table border='1'>\n");
		$report .= sprintf("<tr><th>Function</th><th>Args</th><th>Object</th><th>File:Line</th></tr>\n");
		foreach(debug_backtrace() AS $track)
		{
			if($printDetails)
			{
				foreach($track['args'] AS &$arg)
				{
					$arg = substr(var_export($arg, true), 0, 100);
				}
			}
						
			$report .= sprintf(
				'<tr><td>%s<br/>%s%s</td><td>%s</td><td>%s</td><td>%s<br/>Line %s</td></tr>'
				, isset($track['class']) ? $track['class'] : ''
				, isset($track['type']) ? $track['type'] : ''
				, $track['function']
				, $printDetails ? join('<hr />', $track['args']) : count($track['args'])
				, $printDetails && isset($track['object']) ? '<div style="white-space:pre;height:100px;overflow:scroll;">'.var_export($track['object'], true).'</div>' : ''
				, $track['file']
				, $track['line']
			);
		}
		$report .= sprintf("</table>");
		
		die($report);
	}

	
	static public function beforeDefaultHandler() {
		$localPath = $_SERVER['DOCUMENT_ROOT'].'/'.basename($_SERVER['SCRIPT_NAME']);
		
		if (file_exists($localPath)) {
			chdir($_SERVER['DOCUMENT_ROOT']);
			
			$return = @ include ($localPath);
			
			if ($return !== false) {
				exit();
			}
		}
	}

	
	static public function generateToken() {
		return md5(mt_rand(0, mt_getrandmax()));
	}

	
	// private methods
	public static function renderCode($className, $classRecord) {
		$code = $classRecord['Header'] . PHP_EOL.PHP_EOL;
		
		switch ($classRecord['Type']) {
			case 'abstract':
			case 'class': {
					if ($classRecord['Type'] == 'abstract')
						$code .= ' abstract';
						
					$code .= ' class '.$className;
					
					if ($classRecord['Extends'])
						$code .= ' extends '.$classRecord['Extends'];
						
					if ($classRecord['Implements'])
						$code .= ' implements '.$classRecord['Implements'];
						
					$code .= "\n{\n$classRecord[Code]\n}";
					
					//if($className == 'getID3') die($code);
					
					break;
				}
				
			case 'interface': {
					$code .= ' interface '.$className;
					
					$code .= "\n{\n$classRecord[Code]\n}";
					
					break;
				}
				
			case 'external': {
					$code .= $classRecord['Code'];
					
					break;
				}
		}

		
		if (
		static ::$ClassDumping)
			printf("<div style='width: 500px; height: 100px; overflow: auto; padding: 1em; margin: 1em; border: 1px dotted #999; text-align: left;'>%s</div>", nl2br(htmlspecialchars($code)));
			
		return $code;
	}
	
	
	
	static public function prepareOptions($value, $defaults = array())
	{
		if(is_string($value))
		{
			$value = json_decode($value, true);
		}
		
		return is_array($value) ? array_merge($defaults, $value) : $defaults;
	}
	
}
