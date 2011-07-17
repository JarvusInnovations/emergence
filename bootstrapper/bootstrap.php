<?php

require('/emergence/lib/Emergence.class.php');
require('/emergence/lib/Debug.class.php');
require('/emergence/lib/DB.class.php');
require('/emergence/lib/File.class.php');
require('/emergence/lib/Site.class.php');
require('/emergence/lib/SiteCollection.class.php');
require('/emergence/lib/SiteFile.class.php');

include('Site.config.php');

// load MICS-compatibility layer
require('/emergence/lib/MICS.class.php');
MICS::initialize();


Site::initialize();
