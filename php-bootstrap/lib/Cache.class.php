<?php

class Cache
{
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
        return apc_fetch(static::localizeKey($key));
    }

    public static  function store($key, $value, $ttl = 0)
    {
        return apc_store(static::localizeKey($key), $value, $ttl);
    }

    public static function delete($key)
    {
        return apc_delete(static::localizeKey($key));
    }

    public static function exists($key)
    {
        return apc_exists(static::localizeKey($key));
    }

    public static function increase($key, $step = 1)
    {
        return apc_inc(static::localizeKey($key), $step);
    }

    public static function decrease($key, $step = 1)
    {
        return apc_dec(static::localizeKey($key), $step);
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
            apc_delete($cacheEntry['key']);
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