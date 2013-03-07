<?php
ini_set('error_reporting',E_ALL & ~E_NOTICE & ~E_STRICT);
ini_set('memory_limit', '512M');

set_include_path(get_include_path() . PATH_SEPARATOR . '/var/emergence/kernel/');

require('lib/Emergence.class.php');
require('lib/Debug.class.php');
require('lib/DB.class.php');
require('lib/File.class.php');
require('lib/Site.class.php');
require('lib/SiteCollection.class.php');
require('lib/SiteFile.class.php');
require('lib/EmergenceIO.class.php');

include('Site.config.php');

Site::$rootPath = '/var/emergence/sites/skeleton';

$_SERVER['HTTP_HOST'] = Site::$config['primary_hostname'];

EmergenceIO::import($argv[1]);

$User = DB::oneValue("SELECT `ID` FROM `people` WHERE `AccountLevel`='Developer'");

DB::nonQuery("UPDATE `_e_files` SET `AuthorID`='{$User}' WHERE `AuthorID` IS NULL;");
DB::nonQuery("UPDATE `_e_file_collections` SET `CreatorID`='{$User}' WHERE `CreatorID`=0;");