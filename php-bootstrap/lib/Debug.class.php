<?php

class Debug
{
	static public $log = array();

	static public function dump($var, $exit = true)
	{
		if(!Site::$debug) return;
	
		print '<pre>';
		print_r($var);
		print '</pre>';
		
		if($exit)
			exit();
		else
			return $var;
	}
	
	static public function dumpVar($var, $exit = true)
	{
		if(!Site::$debug) return;
	
		print '<pre>';
		var_export($var);
		print '</pre>';
		
		if($exit)
			exit();
		else
			return $var;
	}
	
	
	static public function logMessage($message, $source = null)
	{
		return static::log(array('message' => $message), $source);
	}
	
	static public function log($entry, $source = null)
	{
		if(!Site::$debug) return;

		if(Site::$queryBreaker && !empty($entry['query']) && !empty($_GET['breakpoints']))
		{
			if(call_user_func(Site::$queryBreaker, $entry['query']))
			{
				print('<h1>query breakpoint</h1><pre>');
				debug_print_backtrace();
				die("</pre><hr>breakpoint matched $pattern<br>against $entry[query]");
			}
		}
	
		static::$log[] = array_merge($entry, array(
			'source' => isset($source) ? $source : static::_detectSource()
			,'time' => sprintf('%f', microtime(true))
		));
	}
	
	static protected function _detectSource()
	{
		$backtrace = debug_backtrace();
		
		while($trace = array_shift($backtrace))
		{
			if (!empty($trace['class']))
			{
				if($trace['class'] == __CLASS__)
				{
					continue;
				}
				return $trace['class'];
			}
			elseif (!empty($trace['file']))
			{
				return basename($trace['file']);
			}
		}

		return basename($_SERVER['SCRIPT_NAME']);
	}
}
