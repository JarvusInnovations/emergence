<?php

class Debug
{
    public static $log = array();

    public static function dump($var, $exit = true, $title = null)
    {
        if (Site::$debug) {
            if ($title) {
                print "<h2>$title</h2>";
            }

            print '<pre>';
            print_r($var);
            print '</pre>';
        }

        if ($exit) {
            exit();
        } else {
            return $var;
        }
    }

    public static function dumpVar($var, $exit = true, $title = null)
    {
        if (Site::$debug) {
            if ($title) {
                print "<h2>$title</h2>";
            }

            print '<pre>';
            var_export($var);
            print '</pre>';
        }

        if ($exit) {
            exit();
        } else {
            return $var;
        }
    }

    public static function logMessage($message, $source = null)
    {
        return static::log(array('message' => $message), $source);
    }

    public static function log($entry, $source = null)
    {
        if (!Site::$debug) {
            return;
        }

        static::$log[] = array_merge($entry, array(
            'source' => isset($source) ? $source : static::_detectSource()
            ,'time' => sprintf('%f', microtime(true))
        ));
    }

    static protected function _detectSource()
    {
        $backtrace = debug_backtrace();

        while ($trace = array_shift($backtrace)) {
            if (!empty($trace['class'])) {
                if ($trace['class'] == __CLASS__) {
                    continue;
                }
                return $trace['class'];
            } elseif (!empty($trace['file'])) {
                return basename($trace['file']);
            }
        }

        return basename($_SERVER['SCRIPT_NAME']);
    }
}