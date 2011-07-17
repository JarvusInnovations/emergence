<?php

class DuplicateKeyException extends Exception { }


class DB
{
	// configurables
	static public $TimeZone;
	
	static public $encoding = 'UTF-8';
	static public $charset = 'utf8';
	
	// protected static properties
	protected static $_mysqli;
	protected static $_record_cache = array();
	
	
	
	
	// public static methods
	static public function escape($string)
	{
		if(is_array($string))
		{
			foreach($string AS &$sub)
			{
				$sub = self::getMysqli()->real_escape_string($sub);
			}
		}
		else
		{
			$string = self::getMysqli()->real_escape_string($string);
		}
		
		return $string;
	}
	
	
	static public function affectedRows()
	{
		return self::getMysqli()->affected_rows;
	}
	
	static public function foundRows()
	{
		return self::oneValue('SELECT FOUND_ROWS()');
	}
	
	
	static public function insertID()
	{
		return self::getMysqli()->insert_id;
	}
	
	
	static public function nonQuery($query, $parameters = array())
	{
		// MICS::dump(func_get_args(), 'nonquery');
		
		$query = self::preprocessQuery($query, $parameters);
		
		// start query log
		$queryLog = self::startQueryLog($query);
		
		// preprocess and execute query
		$success = self::getMysqli()->query($query);
		
		// handle query error
		if($success === false)
		{
			self::handleError($query, $queryLog);
		}
		
		// finish query log
		self::finishQueryLog($queryLog);
	}
	
	
	static public function query($query, $parameters = array())
	{
		$query = self::preprocessQuery($query, $parameters);
		
		// start query log
		$queryLog = self::startQueryLog($query);
		
		// execute query
		$result = self::getMysqli()->query($query);
		
		// handle query error
		if($result === false)
		{
			self::handleError($query, $queryLog);
		}
		
		// finish query log
		self::finishQueryLog($queryLog, $result);
		
		return $result;
	}
	
	
	static public function table($tableKey, $query, $parameters = array(), $nullKey = '')
	{		
		// execute query
		$result = self::query($query, $parameters);
		
		$records = array();
		while($record = $result->fetch_assoc())
		{
			$records[$record[$tableKey] ? $record[$tableKey] : $nullKey] = $record;
		}
		
		// free result
		$result->free();
		
		return $records;
	}
	

	static public function arrayTable($tableKey, $query, $parameters = array())
	{		
		// execute query
		$result = self::query($query, $parameters);
		
		$records = array();
		while($record = $result->fetch_assoc())
		{
			if(!array_key_exists($record[$tableKey], $records))
			{
				$records[$record[$tableKey]] = array();
			}
			
			$records[$record[$tableKey]][] = $record;
		}
		
		// free result
		$result->free();
		
		return $records;
	}
	
	
	static public function valuesTable($tableKey, $valueKey, $query, $parameters = array())
	{
		// execute query
		$result = self::query($query, $parameters);
		
		$records = array();
		while($record = $result->fetch_assoc())
		{
			$records[$record[$tableKey]] = $record[$valueKey];
		}
		
		// free result
		$result->free();
		
		return $records;
	}

	static public function allRecordsWithInstantiation($query, $classMapping, $parameters = array())
	{
		// execute query
		$result = self::query($query, $parameters);
		
		$records = array();
		while($record = $result->fetch_assoc())
		{
			foreach($classMapping AS $key => $class)
			{
				$record[$key] = new $class($record[$key]);
			}
			
			$records[] = $record;
		}
		
		// free result
		$result->free();
		
		return $records;
	}

	static public function allInstances($className, $query, $parameters = array())
	{
		// execute query
		$result = self::query($query, $parameters);
		
		$records = array();
		while($record = $result->fetch_assoc())
		{
			$records[] = new $className($record);
		}
		
		// free result
		$result->free();
		
		return $records;
	}
	
	static public function allRecords($query, $parameters = array())
	{
		// MICS::dump(array('query' => $query, 'params' => $parameters), 'allRecords');
		
		// execute query
		$result = self::query($query, $parameters);
		
		$records = array();
		while($record = $result->fetch_assoc())
		{
			$records[] = $record;
		}
		
		// free result
		$result->free();
		
		return $records;
	}
	
	
	static public function allValues($valueKey, $query, $parameters = array())
	{
		// MICS::dump(array('query' => $query, 'params' => $parameters), 'allRecords');
		
		// execute query
		$result = self::query($query, $parameters);
		
		$records = array();
		while($record = $result->fetch_assoc())
		{
			$records[] = $record[$valueKey];
		}
		
		// free result
		$result->free();
		
		return $records;
	}
	
	
	static public function clearCachedRecord($cacheKey)
	{
		unset(self::$_record_cache[$cacheKey]);
	}
	
	static public function oneRecordCached($cacheKey, $query, $parameters = array())
	{

		// check for cached record
		if (array_key_exists($cacheKey, self::$_record_cache))
		{
			// log cache hit
			Debug::log(array(
				'cache_hit' => true
				,'query' => $query
				,'cache_key' => $cacheKey
				,'method' => __FUNCTION__
			));
			
			// return cache hit
			return self::$_record_cache[$cacheKey];
		}
		
		// preprocess and execute query
		$result = self::query($query, $parameters);
		
		// handle query error
		if($result === false)
		{
			self::handleError($query);
		}
		
		// get record
		$record = $result->fetch_assoc();
		
		// free result
		$result->free();
		
		// save record to cache
		if ($cacheKey)
		{
			self::$_record_cache[$cacheKey] = $record;
		}
		
		// return record
		return $record;
	}
	
	
	static public function oneRecord($query, $parameters = array())
	{
		// preprocess and execute query
		$result = self::query($query, $parameters);
		
		// get record
		$record = $result->fetch_assoc();
		
		// free result
		$result->free();
		
		// return record
		return $record;
	}
	
	
	static public function oneValue($query, $parameters = array())
	{
		$record = self::oneRecord($query, $parameters);
		
		if($record)
		{
			// return record
			return array_shift($record);
		}
		else
		{
			return false;
		}
	}
	
	
	static public function dump($query, $parameters = array())
	{
		Debug::dump($query, false);
		
		if(count($parameters))
		{
			Debug::dump($parameters, false);
			Debug::dump(self::preprocessQuery($query, $parameters), 'processed');
		}
		
	}
	
	
	
	static public function makeOrderString($order = array())
	{
		$s = '';
		
		foreach($order AS $field => $dir)
		{
			if($s!='') $s .= ',';
			
			$s .= '`'.$field.'` '.$dir;
		}
		
		return $s;
	}
	
	
	static public function prepareQuery($query, $parameters = array())
	{
		return self::preprocessQuery($query, $parameters);
	}
	
	// protected static methods
	static protected function preprocessQuery($query, $parameters = array())
	{
		// MICS::dump(array('query'=>$query,'params'=>$parameters), __FUNCTION__);
		
		if ( is_array($parameters) && count($parameters) )
		{
			return vsprintf($query, $parameters);
		}
		elseif( isset($parameters) )
		{
			return sprintf($query, $parameters);
		}
		else
		{
			return $query;
		}
	}
	
	
	static protected function startQueryLog($query)
	{
		if (!Site::$debug)
		{
			return false;
		}
		
		// create a new query log structure
		return array(
			'query' => $query
			,'time_start' => sprintf('%f',microtime(true))
		);
	}
	
	
	static protected function extendQueryLog(&$queryLog, $key, $value)
	{
		if ($queryLog == false)
		{
			return false;
		}
		
		$queryLog[$key] = $value;
	}
	
	
	static protected function finishQueryLog(&$queryLog, $result = false)
	{
		if ($queryLog == false)
		{
			return false;
		}
		
		// save finish time and number of affected rows
		$queryLog['time_finish'] = sprintf('%f',microtime(true));
		$queryLog['time_duration_ms'] = ($queryLog['time_finish'] - $queryLog['time_start']) * 1000;
		$queryLog['affected_rows'] = self::getMysqli()->affected_rows;
		
		// save result information
		if($result)
		{
			$queryLog['result_fields'] = $result->field_count;
			$queryLog['result_rows'] = $result->num_rows;
		}
		
		// build backtrace string
		$queryLog['method'] = '';
		$backtrace = debug_backtrace();
		while($backtick = array_shift($backtrace))
		{
			// skip the log routine itself
			if ($backtick['function'] == __FUNCTION__)
			{
				continue;
			}
			
			if ($backtick['class'] != __CLASS__)
			{
				break;
			}
		
			// append function
			if($queryLog['method'] != '') $queryLog['method'] .= '/';
			$queryLog['method'] .= $backtick['function'];

		}
		
		// append to static log
		Debug::log($queryLog);
	}
	
	
	static public function getMysqli()
	{
		if (!isset(self::$_mysqli))
		{
			// connect to mysql database
			self::$_mysqli = @new mysqli(Site::$databaseHost, Site::$databaseUsername, Site::$databasePassword, Site::$databaseName, Site::$databasePort, Site::$databaseSocket);
	
			// check for failure or connection error
			if (mysqli_connect_error())
			{
				self::handleError('connect');
			}
			
			// set timezone
			if (isset(self::$TimeZone))
			{
				self::$_mysqli->query(sprintf(
					'SET time_zone = "%s"'
					, self::$_mysqli->real_escape_string(self::$TimeZone)
				));
			}
		}
		
		return self::$_mysqli;
	}
	
	
	static protected function handleError($query = '', $queryLog = false)
	{
		// save queryLog
		if($queryLog)
		{
			$queryLog['error'] = static::$_mysqli->error;
			self::finishQueryLog($queryLog);
		}
		
		// get error message
		if($query == 'connect')
		{
			$message = mysqli_connect_error();
		}
		elseif(static::$_mysqli->errno == 1062)
		{
			throw new DuplicateKeyException(static::$_mysqli->error);
		}
		else
		{
			$message = static::$_mysqli->error;
		}
		
		// respond
		$report = sprintf("<h1 style='color:red'>Database Error</h1>\n");
		$report .= sprintf("<h2>URI</h2>\n<p>%s</p>\n", htmlspecialchars($_SERVER['REQUEST_URI']));
		$report .= sprintf("<h2>Query</h2>\n<p>%s</p>\n", htmlspecialchars($query));
		$report .= sprintf("<h2>Reported</h2>\n<p>%s</p>\n", htmlspecialchars($message));
			
		//$report .= ErrorHandler::formatBacktrace(debug_backtrace());
					
		if(!empty($GLOBALS['Session']) && $GLOBALS['Session']->Person)
		{
			$report .= sprintf("<h2>User</h2>\n<pre>%s</pre>\n", var_export($GLOBALS['Session']->Person->data, true));
		}
		
		
		if(Site::$debug)
		{
			die($report);
		}
		else
		{
			Email::send(Site::$webmasterEmail, 'Database error on '.$_SERVER['HTTP_HOST'], $report);
			die('Error while communicating with database');
		}
	}
	
	
}
