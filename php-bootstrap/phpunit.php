<?php

// bootstrap emergence
require('bootstrap.inc.php');
Site::$debug = true;
Site::initialize($_SERVER['SITE_ROOT'], $_SERVER['HTTP_HOST']);
