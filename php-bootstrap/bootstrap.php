<?php

// load core libraries
require('./lib/Emergence.class.php');
require('./lib/Debug.class.php');
require('./lib/DB.class.php');
require('./lib/File.class.php');
require('./lib/Site.class.php');
require('./lib/SiteCollection.class.php');
require('./lib/SiteFile.class.php');

// load and initialize MICS-compatibility layer
require('./lib/MICS.class.php');
MICS::initialize();

// load core
Site::initialize();

// dispatch request
Site::handleRequest();