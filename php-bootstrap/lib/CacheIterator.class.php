<?php

if (class_exists('APCUIterator', false)) {
    class CacheIterator extends APCUIterator
    {
        public static function createFromPattern($pattern)
        {
            return new static($pattern);
        }
    }
} else {
    class CacheIterator extends APCIterator
    {
        public static function createFromPattern($pattern)
        {
            return extension_loaded('apcu') && version_compare(phpversion('apcu'), '4.0.2') < 0 ? new static($pattern) : new static('user', $pattern);
        }

        public function current()
        {
            $data = parent::current();

            return extension_loaded('apcu') && version_compare(phpversion('apcu'), '4.0.3') < 0 ? array(
                'type' => 'user'
                ,'key' => $data['key']
                ,'value' => $data['value']
                ,'num_hits' => $data['nhits']
                ,'mtime' => $data['mtime']
                ,'creation_time' => $data['ctime']
                ,'deletion_time' => $data['dtime']
                ,'access_time' => $data['atime']
                ,'ref_count' => $data['ref_count']
                ,'mem_size' => $data['mem_size']
                ,'ttl' => $data['ttl']
            ) : $data;
        }
    }
}
