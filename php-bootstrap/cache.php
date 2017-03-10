<?php

// bootstrap emergence
require('bootstrap.inc.php');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    // Delete given cacheKey
    if (!empty($_POST['cacheKey'])) {
        \Cache::rawDelete($_POST['cacheKey']);
    }
}
