<?php

// bootstrap emergence
require('bootstrap.inc.php');

// only process POST requests
if ($_SERVER['REQUEST_METHOD'] != 'POST') {
    exit();
}

$commands = json_decode(file_get_contents('php://input'), true);

foreach ($commands as $command) {
    switch ($command['action'])
    {
        case 'cache':
            handleCacheRequest($command);
            break;
        case 'vfs':
            handleVFSRequest($command);
            break;
    }
}

// Create, update or delete cached elements
function handleCacheRequest($command)
{
    // Raw delete
    if (!empty($command['delete'])) {
        Cache::rawDelete($command['handle'] . ':' . $command['delete']);
    }

    // Pattern delete
    // Input should not include handle or slashes
    // Example: pattern 'abc' will delete pattern '/^HANDLE:abc/'
    if (!empty($command['pattern'])) {
        foreach (CacheIterator::createFromPattern('/^' . $command['handle'] . ':' . $command['pattern'] . '/') as $cacheEntry) {
            Cache::rawDelete($cacheEntry['key']);
        }
    }

    // Create entry
    if (!empty($command['create'])) {
        Cache::rawStore(
            $command['handle'] . ':' . $command['create'],
            empty($command['value']) ? null : $command['value'],
            empty($command['ttl']) ? 0 : $command['ttl']
        );
    }
}

function handleVFSRequest($command)
{
    
}