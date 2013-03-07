<?php
ini_set('error_reporting',E_ALL & ~E_NOTICE & ~E_STRICT);  

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

DB::nonQuery('TRUNCATE `_e_files`;');
DB::nonQuery('TRUNCATE `_e_file_collections`;');

$data = scandir(Site::$rootPath . '/data');
foreach($data as $file)
{
    if($file == '.' || $file == '..') { continue; }
    unlink(Site::$rootPath . '/data/' . $file); 
}