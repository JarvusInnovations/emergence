<?php

require('bootstrap.inc.php');

// load core
Site::initialize($_SERVER['SITE_ROOT'], explode(':', $_SERVER['HTTP_HOST'])[0]);

// dispatch request
Site::handleRequest();