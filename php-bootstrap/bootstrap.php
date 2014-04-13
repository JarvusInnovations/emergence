<?php

define('EMERGENCE_BOOTSTRAP_DIR', dirname(__FILE__));

// load core libraries
require(EMERGENCE_BOOTSTRAP_DIR . '/lib/Emergence.class.php');
require(EMERGENCE_BOOTSTRAP_DIR . '/lib/Debug.class.php');
require(EMERGENCE_BOOTSTRAP_DIR . '/lib/DB.class.php');
require(EMERGENCE_BOOTSTRAP_DIR . '/lib/File.class.php');
require(EMERGENCE_BOOTSTRAP_DIR . '/lib/Site.class.php');
require(EMERGENCE_BOOTSTRAP_DIR . '/lib/SiteCollection.class.php');
require(EMERGENCE_BOOTSTRAP_DIR . '/lib/SiteFile.class.php');
require(EMERGENCE_BOOTSTRAP_DIR . '/lib/HttpProxy.class.php');

// load core
Site::initialize();

// dispatch request
if (php_sapi_name() != 'cli') {
    Site::handleRequest();
}
