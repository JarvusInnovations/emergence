<?php

require('Emergence.class.php');
require('Debug.class.php');
require('DB.class.php');
require('File.class.php');
require('Site.class.php');
require('SiteCollection.class.php');
require('SiteFile.class.php');

//include('Site.config.php');

// load MICS-compatibility layer
require('MICS.class.php');
MICS::initialize();


Site::initialize();
