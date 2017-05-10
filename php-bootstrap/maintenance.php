<?php

// bootstrap emergence
require('bootstrap.inc.php');

// only process POST requests
if ($_SERVER['REQUEST_METHOD'] != 'POST') {
    exit();
}

$data = json_decode(file_get_contents('php://input'), true);

foreach ($data['commands'] as $command) {
    switch ($command['action'])
    {
        case 'cache':
            handleCacheRequest($command, $data['handle'], $data['siteRoot']);
            break;
        case 'vfs':
            handleVFSRequest($command, $data['handle'], $data['siteRoot']);
            break;
    }
}

// Create, update or delete cached elements
function handleCacheRequest($command, $handle, $siteRoot)
{
    // Raw delete
    if (!empty($command['delete'])) {
        Cache::rawDelete($handle . ':' . $command['delete']);
    }

    // Pattern delete
    // Input should not include handle or slashes
    // Example: pattern 'abc' will delete pattern '/^HANDLE:abc/'
    if (!empty($command['pattern'])) {
        foreach (CacheIterator::createFromPattern('/^' . $handle . ':' . $command['pattern'] . '/') as $cacheEntry) {
            Cache::rawDelete($cacheEntry['key']);
        }
    }

    // Create entry
    if (!empty($command['create'])) {
        Cache::rawStore(
            $handle . ':' . $command['create'],
            empty($command['value']) ? null : $command['value'],
            empty($command['ttl']) ? 0 : $command['ttl']
        );
    }
}

function handleVFSRequest($command, $handle, $siteRoot)
{
    // Initialize site for Emergence FS commands
    Site::initialize($siteRoot);

    // Update the file system
    updateFileSystem($handle, $command['cursor'], $siteRoot);
}

function updateFileSystem($handle, $cursor = 0)
{
    // Turn on autopull to enable remote file downloads
    \Site::$autoPull = true;

    // Get update summary
    $summary = getFileSystemSummary($cursor);

    // Precache files
    foreach ($summary['new'] as $path) {
        $Node = \Site::resolvePath($path);
    }

    // Delete files
    foreach ($summary['deleted'] as $path) {
        if ($Node = \Site::resolvePath($path)) {
            $Node->delete();
        }
    }

    // Update files
    foreach ($summary['updated'] as $path) {
        $Node = \Site::resolvePath($path);
        $NewNode = \Emergence::resolveFileFromParent($Node->Collection, $Node->Handle, true);
    }

    // Get updated local cursor
    $summary['localCursor'] = getLocalCursor();

    return $summary;
}

// Retrieve the file summary for given site
function getFileSystemSummary($cursor = 0)
{
    // Local files / keys
    $localFiles = Emergence_FS::getTreeFiles(null, false);
    $localKeys = array_keys($localFiles);

    // Get parent files / keys
    $parentVFSUrl = Emergence::buildUrl();
    $curl = curl_init();
    curl_setopt_array($curl, array(
        CURLOPT_RETURNTRANSFER => 1,
        CURLOPT_URL => $parentVFSUrl
    ));
    $parentFileResponse = json_decode(curl_exec($curl), true);
    $parentFiles = $parentFileResponse['files'];
    $parentKeys = array_keys($parentFiles);

    $newFiles = [];
    $updatedFiles = [];
    $deletedFiles = [];
    $parentCursor = $cursor;

    // Compare remote files against their local copies
    foreach ($parentFiles as $path => $data) {

        // Update parent cursor
        if ($data['ID'] > $parentCursor) {
            $parentCursor = $data['ID'];
        }

        // @todo instead of comparing against local keys, do real time queries
        // for local nodes. This will minimize the number of total queries run
        // and won't require the connection to the local /emergence endpoint

        // Find new files
        if (!in_array($path, $localKeys)) {
            array_push($newFiles, $path);

        // Find deleted files
        } elseif ($data['SHA1'] == null && $localFiles[$path]['Site'] == 'Remote') {
            array_push($deletedFiles, $path);

        // Find updated files by mismatched SHA1s
        } elseif ($data['SHA1'] !== $localFiles[$path]['SHA1'] && $localFiles[$path]['Site'] == 'Remote') {
            array_push($updatedFiles, $path);
        }
    }

    return [
        'new' => $newFiles,
        'updated' => $updatedFiles,
        'deleted' => $deletedFiles,
        'parentCursor' => $parentCursor,
        'localCursor' => getLocalCursor()
    ];
}

// Retrieve the local cursor for the given site
function getLocalCursor()
{
    return \DB::oneValue('SELECT MAX(ID) FROM _e_files');
}
