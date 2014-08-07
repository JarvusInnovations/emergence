<?php

// read input
@list ($scriptPath, $hostname, $recipient, $sender, $queueId) = $argv;

if (!$hostname || !$recipient || !$sender || !$queueId) {
    print("One or more required parameters missing\n");
    exit(64); // EX_USAGE
}

// get hostmap
$hostmapPath = '/emergence/services/hostmap.inc.php';
if (is_readable($hostmapPath)) {
    $hostmap = require($hostmapPath);
} else {
    $hostmap = [];
    
    foreach (glob('/emergence/sites/*', GLOB_ONLYDIR) AS $sitePath) {
        $configPath = "$sitePath/site.json";
        if (!is_readable($configPath)) {
            continue;
        }
    
        $config = @json_decode(file_get_contents($configPath), true);
    
        if (!$config) {
            continue;
        }
    
        $hostnames = array_unique(array_merge([$config['primary_hostname']], $config['hostnames']));
        
        foreach ($hostnames AS $hostname) {
            $hostmap['/^' . str_replace('\\*', '.*', preg_quote($hostname)) . '$/i'] = basename($sitePath);
        }
    }

    file_put_contents($hostmapPath, "<?php\n\nreturn " . var_export($hostmap, true) . ";\n");
}


// map hostname to handle
$siteHandle = null;
foreach ($hostmap AS $pattern => $patternHandle) {
    if (preg_match($pattern, $hostname)) {
        $siteHandle = $patternHandle;
        break;
    }
}

if (!$siteHandle) {
    print("Domain did not match any configured sites\n");
    exit(68); // EX_NOHOST
}


// bootstrap emergence
require('bootstrap.inc.php');
Site::$debug = true;
Site::initialize("/emergence/sites/$siteHandle", $hostname);

Emergence\Mail\Router::handleMessage($hostname, $recipient, $sender, $queueId);

// pre-configure 

// load core
//Site::initialize();

// dispatch request
//if (php_sapi_name() != 'cli') {
//    Site::handleRequest();
//}


/*
// read log email
$fp = fopen('php://stdin', 'r');
$flog = fopen('/tmp/php-mail-'.exec('whoami').'.log', 'a');

fwrite($flog, "\n\nReceiving new email, args = ".json_encode($argv)."\n");

while (!feof($fp)) {
        $line = trim(fgets($fp));

        fwrite($flog, "Read line: $line\n");
}

fclose($fp);
fclose($flog);

echo "Routed to emergence handler mail/data-dropbox/sapphire/10-import.php\n";
//echo "Failed to route";
//exit(69); // 75=TEMPFAIL, 69=UNAVAILABLE
*/
