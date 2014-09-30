<?php

// read input
@list ($scriptPath, $hostname, $recipient, $sender, $queueId) = $argv;

if (!$hostname || !$recipient || !$sender || !$queueId) {
    print("One or more required parameters missing\n");
    exit(64); // EX_USAGE
}

// get hostmap
// TODO: have the kernel maintain this file
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
// TODO: move this to a static Site method getHandleFromHostname, have initialize use it if hostname isn't provided (and swap initialize param order)
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


// delegate remainder of request to email router
Emergence\Mail\Router::handleMessage($hostname, $recipient, $sender, $queueId);