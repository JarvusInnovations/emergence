<?php

class DuplicateKeyException extends Exception { }
class TableNotFoundException extends Exception { }
class QueryException extends Exception { }

class DB
{
    // deprecated:
    public static $encoding = 'UTF-8';
    public static $charset = 'utf8';

    // protected properties
    protected static $_mysqli;
    protected static $_record_cache = array();

    // public static methods
    public static function escape($string)
    {
        if (is_array($string)) {
            foreach ($string AS &$sub) {
                $sub = self::getMysqli()->real_escape_string($sub);
            }
        } else {
            $string = self::getMysqli()->real_escape_string($string);
        }

        return $string;
    }

    public static function affectedRows()
    {
        return self::getMysqli()->affected_rows;
    }

    public static function foundRows()
    {
        // table not found
        if (self::getMysqli()->sqlstate == '42S02') {
            return 0;
        }

        return (int)self::oneValue('SELECT FOUND_ROWS()');
    }

    public static function insertID()
    {
        return self::getMysqli()->insert_id;
    }

    public static function nonQuery($query, $parameters = null)
    {
        $query = self::preprocessQuery($query, $parameters);

        // start query log
        $queryLog = self::startQueryLog($query);

        // preprocess and execute query
        $result = self::getMysqli()->query($query);

        // handle query error
        if ($result === false) {
            self::handleError($query, $queryLog);
        } elseif ($result !== true) {
            $result->free();
        }

        // finish query log
        self::finishQueryLog($queryLog);
    }

    public static function multiQuery($query, $parameters = null)
    {
        $query = self::preprocessQuery($query, $parameters);

        // start query log
        $queryLog = self::startQueryLog($query);

        // preprocess and execute query
        $result = self::getMysqli()->multi_query($query);

        // handle query error
        if ($result === false) {
            self::handleError($query, $queryLog);
        }

        // free results
        while (self::getMysqli()->more_results()) {
            if ($result = self::getMysqli()->use_result()) {
                $result->free();
            }
            self::getMysqli()->next_result();
        }

        // finish query log
        self::finishQueryLog($queryLog);
    }

    public static function query($query, $parameters = null)
    {
        $query = self::preprocessQuery($query, $parameters);

        // start query log
        $queryLog = self::startQueryLog($query);

        // execute query
        $result = self::getMysqli()->query($query);

        // handle query error
        if ($result === false) {
            self::handleError($query, $queryLog);
        }

        // finish query log
        self::finishQueryLog($queryLog, $result);

        return $result;
    }

    public static function table($tableKey, $query, $parameters = null, $nullKey = '')
    {
        // execute query
        $result = self::query($query, $parameters);

        $records = array();
        while ($record = $result->fetch_assoc()) {
            $records[$record[$tableKey] ? $record[$tableKey] : $nullKey] = $record;
        }

        // free result
        $result->free();

        return $records;
    }

    public static function arrayTable($tableKey, $query, $parameters = null)
    {
        // execute query
        $result = self::query($query, $parameters);

        $records = array();
        while ($record = $result->fetch_assoc()) {
            if (!array_key_exists($record[$tableKey], $records)) {
                $records[$record[$tableKey]] = array();
            }

            $records[$record[$tableKey]][] = $record;
        }

        // free result
        $result->free();

        return $records;
    }

    public static function valuesTable($tableKey, $valueKey, $query, $parameters = null)
    {
        // execute query
        $result = self::query($query, $parameters);

        $records = array();
        while ($record = $result->fetch_assoc()) {
            $records[$record[$tableKey]] = $record[$valueKey];
        }

        // free result
        $result->free();

        return $records;
    }

    public static function allRecordsWithInstantiation($query, $classMapping, $parameters = null)
    {
        // execute query
        $result = self::query($query, $parameters);

        $records = array();
        while ($record = $result->fetch_assoc()) {
            foreach ($classMapping AS $key => $class) {
                $record[$key] = new $class($record[$key]);
            }

            $records[] = $record;
        }

        // free result
        $result->free();

        return $records;
    }

    public static function allInstances($className, $query, $parameters = null)
    {
        // execute query
        $result = self::query($query, $parameters);

        $records = array();
        while ($record = $result->fetch_assoc()) {
            $records[] = new $className($record);
        }

        // free result
        $result->free();

        return $records;
    }

    public static function allRecords($query, $parameters = null)
    {
        // MICS::dump(array('query' => $query, 'params' => $parameters), 'allRecords');

        // execute query
        $result = self::query($query, $parameters);

        $records = array();
        while ($record = $result->fetch_assoc()) {
            $records[] = $record;
        }

        // free result
        $result->free();

        return $records;
    }

    public static function allValues($valueKey, $query, $parameters = null)
    {
        // execute query
        $result = self::query($query, $parameters);

        $records = array();
        while ($record = $result->fetch_assoc()) {
            $records[] = $record[$valueKey];
        }

        // free result
        $result->free();

        return $records;
    }

    public static function clearCachedRecord($cacheKey)
    {
        unset(self::$_record_cache[$cacheKey]);
    }

    public static function oneRecordCached($cacheKey, $query, $parameters = null)
    {
        // check for cached record
        if (array_key_exists($cacheKey, self::$_record_cache)) {
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
        if ($result === false) {
            self::handleError($query);
        }

        // get record
        $record = $result->fetch_assoc();

        // free result
        $result->free();

        // save record to cache
        if ($cacheKey) {
            self::$_record_cache[$cacheKey] = $record;
        }

        // return record
        return $record;
    }

    public static function oneRecord($query, $parameters = null)
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

    public static function oneValue($query, $parameters = null)
    {
        $record = self::oneRecord($query, $parameters);

        if ($record) {
            // return record
            return array_shift($record);
        } else {
            return false;
        }
    }

    public static function dump($query, $parameters = null)
    {
        Debug::dump($query, false);

        if (count($parameters)) {
            Debug::dump($parameters, false);
            Debug::dump(self::preprocessQuery($query, $parameters), 'processed');
        }
    }

    public static function makeOrderString($order = array())
    {
        $s = '';

        foreach ($order AS $field => $dir) {
            if ($s!='') {
                $s .= ',';
            }

            $s .= '`'.$field.'` '.$dir;
        }

        return $s;
    }

    public static function prepareQuery($query, $parameters = null)
    {
        return self::preprocessQuery($query, $parameters);
    }

    // protected static methods
    protected static function preprocessQuery($query, $parameters = null)
    {
        if (empty($parameters)) {
            return $query;
        }

        if (is_array($parameters)) {
            return vsprintf($query, $parameters);
        }

        return sprintf($query, $parameters);
    }

    protected static function startQueryLog($query)
    {
        if (!Site::$debug) {
            return false;
        }

        // create a new query log structure
        return array(
            'query' => $query
            ,'time_start' => sprintf('%f',microtime(true))
        );
    }

    protected static function extendQueryLog(&$queryLog, $key, $value)
    {
        if ($queryLog == false) {
            return false;
        }

        $queryLog[$key] = $value;
    }

    protected static function finishQueryLog(&$queryLog, $result = null)
    {
        if ($queryLog == false) {
            return false;
        }

        // save finish time and number of affected rows
        $queryLog['time_finish'] = sprintf('%f',microtime(true));
        $queryLog['time_duration_ms'] = ($queryLog['time_finish'] - $queryLog['time_start']) * 1000;
        $queryLog['affected_rows'] = self::getMysqli()->affected_rows;

        // save result information
        if ($result) {
            $queryLog['result_fields'] = $result->field_count;
            $queryLog['result_rows'] = $result->num_rows;
        }

        // build backtrace string
        $queryLog['method'] = '';
        $backtrace = debug_backtrace();
        while ($backtick = array_shift($backtrace)) {
            // skip the log routine itself
            if ($backtick['function'] == __FUNCTION__) {
                continue;
            }

            if ($backtick['class'] != __CLASS__) {
                break;
            }

            // append function
            if ($queryLog['method'] != '') {
                $queryLog['method'] .= '/';
            }
            $queryLog['method'] .= $backtick['function'];
        }

        // append to static log
        Debug::log($queryLog);
    }

    public static function getMysqli()
    {
        if (!isset(self::$_mysqli)) {
            $config = array_merge(array(
                'host' => 'localhost'
                ,'port' => 3306
            ), Site::getConfig('mysql'));

            // connect to mysql database
            self::$_mysqli = @new mysqli($config['host'], $config['username'], $config['password'], $config['database'], $config['port'], $config['socket']);

            self::$_mysqli->set_charset('utf8');

            // check for failure or connection error
            if (mysqli_connect_error()) {
                self::handleError('connect');
            }

            // set timezone to match PHP
            self::nonQuery(
                'SET time_zone = "%s"',
                self::escape(date('P'))
            );
        }

        return self::$_mysqli;
    }

    protected static function handleError($query = '', $queryLog = false)
    {
        // save queryLog
        if ($queryLog) {
            $queryLog['error'] = static::$_mysqli->error;
            self::finishQueryLog($queryLog);
        }

        $message = sprintf("Query: %s\nReported: %s", $query, $query == 'connect' ? mysqli_connect_error() : static::$_mysqli->error);

        // get error message
        if (static::$_mysqli->errno == 1062) {
            throw new DuplicateKeyException($message, static::$_mysqli->errno);
        } elseif (static::$_mysqli->errno == 1146) {
            throw new TableNotFoundException($message, static::$_mysqli->errno);
        } else {
            throw new QueryException($message, static::$_mysqli->errno);
        }
    }
}
