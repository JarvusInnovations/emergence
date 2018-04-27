<?php

// bootstrap emergence
require('bootstrap.inc.php');


// only process POST requests
if ($_SERVER['REQUEST_METHOD'] != 'POST') {
    http_response_code(405);
    echo "POST only";
    exit(1);
}


// parse and validate input
$input = json_decode(file_get_contents('php://input'), true);

if (
    empty($input)
    || empty($input['site'])
    || empty($input['event'])
    || empty($input['context'])
) {
    http_response_code(400);
    echo "site, event, and context required";
    exit(1);
}


// identify site
$siteRoot = "/emergence/sites/{$input['site']}";

if (!is_dir($siteRoot)) {
    http_response_code(404);
    echo "site not found";
    exit(1);
}


// initialize site
Site::$debug = true;
Site::initialize($siteRoot, 'localhost');


// fire event
Emergence\EventBus::fireEvent($input['event'], $input['context'], !empty($input['payload']) ? $input['payload'] : array());
