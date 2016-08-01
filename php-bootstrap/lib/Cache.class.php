<?php

class Cache
{
    public static function rawFetch($key)
    {
        return function_exists('apcu_fetch') ? apcu_fetch($key) : apc_fetch($key);
    }

    public static function rawStore($key, $value, $ttl = 0)
    {
        return function_exists('apcu_store') ? apcu_store($key, $value, $ttl) : apc_store($key, $value, $ttl);
    }

    public static function rawDelete($key)
    {
        return function_exists('apcu_delete') ? apcu_delete($key) : apc_delete($key);
    }

    public static function rawExists($key)
    {
        return function_exists('apcu_exists') ? apcu_exists($key) : apc_exists($key);
    }

    public static function rawIncrease($key, $step = 1)
    {
        return function_exists('apcu_dec') ? apcu_dec($key) : apc_dec($key);
    }

    public static function rawDecrease($key, $step = 1)
    {
        return function_exists('apcu_dec') ? apcu_dec($key) : apc_dec($key);
    }

    public static function getKeyPrefix()
    {
        return Site::getConfig('handle').':';
    }

    public static function localizeKey($key)
    {
        return static::getKeyPrefix().$key;
    }

    public static function fetch($key)
    {
        return static::rawFetch(static::localizeKey($key));
    }

    public static  function store($key, $value, $ttl = 0)
    {
        return static::rawStore(static::localizeKey($key), $value, $ttl);
    }

    public static function delete($key)
    {
        return static::rawDelete(static::localizeKey($key));
    }

    public static function exists($key)
    {
        return static::rawExists(static::localizeKey($key));
    }

    public static function increase($key, $step = 1)
    {
        return static::rawIncrease(static::localizeKey($key), $step);
    }

    public static function decrease($key, $step = 1)
    {
        return static::rawDecrease(static::localizeKey($key), $step);
    }

    public static function getIterator($pattern)
    {
        // sanity check pattern
        if (!preg_match('/^(.).+\1[a-zA-Z]*$/', $pattern)) {
            throw new Exception('Cache iterator pattern doesn\'t appear to have matching delimiters');
        }

        // modify pattern to insert key prefix and isolate matches to this site
        $prefixPattern = preg_quote(static::getKeyPrefix());
        if ($pattern[1] == '^') {
            $pattern = substr_replace($pattern, $prefixPattern, 2, 0);
        } else {
            $pattern = substr_replace($pattern, '^'.$prefixPattern.'.*', 1, 0);
        }

        return CacheIterator::createFromPattern($pattern);
    }

    public static function deleteByPattern($pattern)
    {
        $count = 0;
        foreach (static::getIterator($pattern) AS $cacheEntry) {
            static::rawDelete($cacheEntry['key']);
            $count++;
        }

        return $count;
    }

    public static function invalidateScript($path)
    {
        if (extension_loaded('Zend OPcache')) {
            opcache_invalidate($path);
        } elseif (extension_loaded('apc')) {
            apc_delete_file($path);
        }
    }
}
