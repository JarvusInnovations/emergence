<?php

// bootstrap emergence
require('bootstrap.inc.php');

// only process POST requests
if ($_SERVER['REQUEST_METHOD'] != 'POST') {
    exit();
}

$commands = json_decode(file_get_contents('php://input'), true);

foreach ($commands AS $command) {
    $key = $command['key'];

    if (!empty($command['site'])) {
        $key = $command['site'].':'.$key;
    }

    if ($action == 'delete') {
        Cache::rawDelete($key);
    } else {
        Cache::rawStore(
            $key,
            empty($command['value']) ? null : $command['value'],
            empty($command['ttl']) ? 0 : $command['ttl']
        );
    }
}