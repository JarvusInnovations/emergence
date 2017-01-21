<?php

class Emergence_FS
{
    public static function cacheTree($path, $force = false)
    {
        // split path into array
        if (is_string($path)) {
            $path = Site::splitPath($path);
        }

        // check if this tree has already been cached
        $cacheKey = 'cacheTree:' . implode('/', $path);
        if (!Site::$autoPull || (!$force && Cache::fetch($cacheKey))) {
            return 0;
        }

        Cache::store($cacheKey, true);

        // get tree map from parent
        $remoteTree = Emergence::resolveCollectionFromParent($path);

        if (!$remoteTree) {
            return 0;
        }

        $filesResolved = 0;

        $startTime = time();
        foreach ($remoteTree['files'] AS $remotePath => $remoteFile) {
            $node = Site::resolvePath($remotePath);

            if ($node && $node->Timestamp >= $startTime) {
                $filesResolved++;
            }
        }

        return $filesResolved;
    }

    public static function getTree($path = null, $localOnly = false, $includeDeleted = false, $conditions = array())
    {
        $tableLocked = false;

        // split path into array
        if (is_string($path)) {
            $path = Site::splitPath($path);
        }


        if ($path) {
            $collections = static::getCollectionLayers($path, $localOnly);

            if(empty($collections['local']) && empty($collections['remote'])) {
                return array();
            }

            DB::nonQuery('LOCK TABLES `%s` READ', SiteCollection::$tableName);
            $tableLocked = true;

            // calculate position conditions
            $positionConditions = array();
            if (!empty($collections['local'])) {
                $positions = DB::oneRecord('SELECT PosLeft, PosRight FROM `%s` WHERE ID = %u', array(
                    SiteCollection::$tableName
                    ,$collections['local']->ID
                ));

                $positionConditions[] = sprintf('PosLeft BETWEEN %u AND %u', $positions['PosLeft'], $positions['PosRight']);
            }

            if (!empty($collections['remote'])) {
                $positions = DB::oneRecord('SELECT PosLeft, PosRight FROM `%s` WHERE ID = %u', array(
                    SiteCollection::$tableName
                    ,$collections['remote']->ID
                ));

                $positionConditions[] = sprintf('PosLeft BETWEEN %u AND %u', $positions['PosLeft'], $positions['PosRight']);
            }

            // append to tree conditions
            $conditions[] = '(' . join(') OR (', $positionConditions) . ')';
        } elseif ($localOnly) {
            $conditions['Site'] = 'Local';
        }

        // Filter out deleted collections
        if (!$includeDeleted) {
            $conditions['Status'] = 'Normal';
        }

        //  filter out excluded trees
        if (array_key_exists('excludeTrees', $conditions)) {
            $excludeTrees = $conditions['excludeTrees'];
            unset($conditions['excludeTrees']);

            if (!$tableLocked) {
                DB::nonQuery('LOCK TABLES `%s` READ', SiteCollection::$tableName);
                $tableLocked = true;
            }

            $positionConditions = array();
            foreach ($excludeTrees AS $excludeTree) {
                $positions = DB::oneRecord('SELECT PosLeft, PosRight FROM `%s` WHERE ID = %u', array(
                    SiteCollection::$tableName
                    ,$excludeTree
                ));

                $positionConditions[] = sprintf('PosLeft NOT BETWEEN %u AND %u', $positions['PosLeft'], $positions['PosRight']);
            }

            // append to tree conditions
            $conditions[] = join(') AND (', $positionConditions);
        }

        // map conditions
        $mappedConditions = array();
        foreach($conditions AS $key => $value) {
            if (is_string($key)) {
                $mappedConditions[] = sprintf('`%s` = "%s"', $key, DB::escape($value));
            } else {
                $mappedConditions[] = $value;
            }
        }

        $tree = DB::table(
            'ID'
            ,'SELECT ID, Site, Handle, ParentID, Status FROM `%s` WHERE (%s) ORDER BY Site = "Remote", PosLeft'
            ,array(
                SiteCollection::$tableName
                ,join(') AND (', $mappedConditions)
            )
        );

        if ($tableLocked) {
            DB::nonQuery('UNLOCK TABLES');
        }

        return $tree;
    }

    public static function getTreeFiles($path = null, $localOnly = false, $fileConditions = array(), $collectionConditions = array()) {
        return static::getTreeFilesFromTree(static::getTree($path, $localOnly, false, $collectionConditions), $fileConditions);
    }

    public static function getTreeFilesFromTree($tree, $conditions = array()) {

        $conditions['Status'] = 'Normal';

        // map conditions
        $mappedConditions = array();
        foreach ($conditions AS $key => $value) {
            if (is_string($key)) {
                $mappedConditions[] = sprintf('`%s` = "%s"', $key, DB::escape($value));
            } else {
                $mappedConditions[] = $value;
            }
        }


        // separate local and remote layers
        $localCollections = array();
        $remoteCollections = array();

        foreach ($tree AS &$collectionInfo) {
            if($collectionInfo['Site'] == 'Local') {
                $localCollections[] = $collectionInfo['ID'];
            } else {
                $remoteCollections[] = $collectionInfo['ID'];
            }
        }


        // build files query
        $filesSql =
            'SELECT'
            .' f2.ID, f2.CollectionID, f2.SHA1'
            .',CONCAT('
                .'('
                    .'SELECT GROUP_CONCAT(parent.Handle ORDER BY parent.PosLeft SEPARATOR "/")'
                    .' FROM `%2$s` AS node, `%2$s` AS parent'
                    .' WHERE node.PosLeft BETWEEN parent.PosLeft AND parent.PosRight AND node.ID = f2.CollectionID'
                .')'
                .',"/"'
                .',f2.Handle'
            .') AS Path'
            .' FROM ('
                .' SELECT MAX(f1.ID) AS ID'
                .' FROM `%1$s` f1'
                .' WHERE CollectionID IN (%3$s)'
                .' GROUP BY f1.CollectionID, f1.Handle'
            .') AS lastestFiles'
            .' LEFT JOIN `%1$s` f2 USING (ID)'
            .' WHERE (%4$s)';


        // retrieve local and remote files
        $localFiles = count($localCollections) ? DB::allRecords(
            $filesSql
            ,array(
                SiteFile::$tableName
                ,SiteCollection::$tableName
                ,join(',', $localCollections)
                ,join(' ) AND (', $mappedConditions)
            )
        ) : array();

        $remoteFiles = count($remoteCollections) ? DB::allRecords(
            $filesSql
            ,array(
                SiteFile::$tableName
                ,SiteCollection::$tableName
                ,join(',', $remoteCollections)
                ,join(' ) AND (', $mappedConditions)
            )
        ) : array();


        // merge trees
        $mergedTree = array();
        foreach (array('Remote' => $remoteFiles, 'Local' => $localFiles) AS $layerName => $layerFiles) {
            foreach ($layerFiles AS &$fileInfo) {
                $mergedTree[$fileInfo['Path']] = array(
                    'ID' => $fileInfo['ID']
                    ,'CollectionID' => $fileInfo['CollectionID']
                    ,'SHA1' => $fileInfo['SHA1']
                    ,'Site' => $layerName
                );
            }
        }

        return $mergedTree;
    }

    public static function exportTree($sourcePath, $destinationPath, $options = array())
    {
        // initialize result accumulators
        $includedCollectionIDs = array();
        $collectionsExcluded = 0;
        $filesAnalyzed = 0;
        $filesExcluded = 0;
        $filesWritten = array();
        $filesDeleted = array();


        // prepare options
        $options = array_merge(array(
            'localOnly' => false
            ,'exclude' => array()
            ,'delete' => true
        ), $options);

        if (isset($options['transferDelete'])) {
            // transferDelete is a deprecated option
            $options['delete'] = (bool)$options['transferDelete'];
            unset($options['transferDelete']);
        }

        if (!empty($options['exclude']) && is_string($options['exclude'])) {
            $options['exclude'] = array($options['exclude']);
        }

        // normalize input paths
        if (!$sourcePath || $sourcePath == '/' || $sourcePath == '.' || $sourcePath == './') {
            $sourcePath = null;
        } else {
            $sourcePath = trim($sourcePath, '/');
        }

        if (!$destinationPath || $destinationPath == './') {
            $destinationPath = '.';
        } else {
            $destinationPath = rtrim($destinationPath, '/');
        }

        // check and prepare destination
        if (!is_dir($destinationPath)) {
            mkdir($destinationPath, 0777, true);
        } elseif ($options['delete']) {
            // scrub destination before writing
            $destinationIterator = new RecursiveDirectoryIterator($destinationPath, FilesystemIterator::SKIP_DOTS);
            $destinationIterator = new RecursiveIteratorIterator($destinationIterator, RecursiveIteratorIterator::CHILD_FIRST);

            foreach ($destinationIterator AS $file) {
                if (preg_match('#(^|/)\\.git(/|$)#', $file)) {
                    continue;
                }

                if ($file->isFile()) {
                    unlink($file);
                    $filesDeleted[] = (string)$file;
                } else {
                    rmdir($file);
                }
            }
        }

        if (!is_writable($destinationPath)) {
            throw new Exception("Destination \"$destinationPath\" is not writable");
        }


        // build map of subtrees to be written and create directories
        $prefixLen = strlen($sourcePath);
        $tree = static::getTree($sourcePath, $options['localOnly']);

        foreach ($tree AS $collectionID => &$node) {

            if ($node['ParentID'] && $tree[$node['ParentID']]) {
                $node['_path'] = $tree[$node['ParentID']]['_path'] . '/' . $node['Handle'];
            } else {
                $node['_path'] = $destinationPath;
            }

            $relPath = substr($node['_path'], $prefixLen);

            if ($node['Status'] != 'Normal') {
                continue;
            }

            if (static::matchesExclude($relPath, $options['exclude'])) {
                $collectionsExcluded++;
                continue;
            }

            if (!is_dir($node['_path'])) {
                mkdir($node['_path'], 0777, true);
            }

            $includedCollectionIDs[] = $collectionID;
        }


        // fetch and write files in included collections
        if (count($includedCollectionIDs)) {
            $conditions = array();

            if (!empty($options['minId'])) {
                $conditions[] = sprintf('ID >= %u', $options['minId']);
            }

            if (!empty($options['maxId'])) {
                $conditions[] = sprintf('ID <= %u', $options['maxId']);
            }

            $conditions[] = sprintf('CollectionID IN (%s)', join(',', $includedCollectionIDs));
            $conditions[] = 'Status != "Phantom"';

            $fileResult = DB::query(
                'SELECT f2.* FROM (SELECT MAX(f1.ID) AS ID FROM `%1$s` f1 WHERE (%2$s) GROUP BY f1.CollectionID, f1.Handle) AS lastestFiles LEFT JOIN `%1$s` f2 USING (ID)'
                ,array(
                    SiteFile::$tableName
                    ,implode(') AND (', $conditions)
                )
            );

            // copy each
            while ($fileRow = $fileResult->fetch_assoc()) {
                $dst = $tree[$fileRow['CollectionID']]['_path'].'/'.$fileRow['Handle'];
                $relPath = substr($dst, $prefixLen);

                if (static::matchesExclude($relPath, $options['exclude'])) {
                    $filesExcluded++;
                    continue;
                }

                if ($fileRow['Status'] == 'Normal' && $tree[$fileRow['CollectionID']]['Status'] != 'Deleted' && ($tree[$fileRow['CollectionID']]['Site'] == 'Local' || !in_array($dst, $filesWritten))) {
                    copy(Site::$rootPath . '/' . SiteFile::$dataPath . '/' . $fileRow['ID'], $dst);
                    touch($dst, strtotime($fileRow['Timestamp']));
                    $filesWritten[] = $dst;
                }

                $filesAnalyzed++;
            }
        }

        $filesDeleted = array_diff($filesDeleted, $filesWritten);

        return array(
            'collectionsExcluded' => $collectionsExcluded,
            'collectionsAnalyzed' => count($includedCollectionIDs),
            'filesExcluded' => $filesExcluded,
            'filesAnalyzed' => $filesAnalyzed,
            'filesWritten' => count($filesWritten),
            'filesDeleted' => count($filesDeleted)
        );
    }

    public static function importFile($sourcePath, $destinationPath)
    {
        if (!file_exists($sourcePath)) {
            return false;
        }

        $existingNode = Site::resolvePath($destinationPath);

        // calculate hash for incoming file
        $sha1 = sha1_file($sourcePath);

        // skip if existing local or remote file matches hash
        if(!$existingNode || $existingNode->SHA1 != $sha1) {
            // use lower level create methods to supply already-calculated hash
            $fileRecord = SiteFile::createFromPath($destinationPath, null, $existingNode ? $existingNode->ID : null);
            return SiteFile::saveRecordData($fileRecord, fopen($sourcePath, 'r'), $sha1);
        }

        return false;
    }

    public static function importTree($sourcePath, $destinationPath, $options = array())
    {
        $options = array_merge(array(
            'exclude' => array()
            ,'delete' => true
            ,'debug' => false
        ), $options);

        // backwords compatibility
        if (isset($options['transferDelete'])) {
            $options['delete'] = (bool)$options['transferDelete'];
            unset($options['transferDelete']);
        }

        // check source
        if (!is_readable($sourcePath)) {
            throw new Exception("Source \"$sourcePath\" unreadable");
        }

        if (!empty($options['exclude']) && is_string($options['exclude'])) {
            $options['exclude'] = array($options['exclude']);
        }

        // normalize input paths
        if (!$sourcePath || $sourcePath == './') {
            $sourcePath = '.';
        } else {
            $sourcePath = rtrim($sourcePath, '/');
        }

        if (!$destinationPath || $destinationPath == '/' || $destinationPath == '.' || $destinationPath == './') {
            $destinationPath = null;
        } else {
            $destinationPath = trim($destinationPath, '/');
        }

        // initialize state
        $prefixLen = strlen($sourcePath);

        $collectionsAnalyzed = 0;
        $collectionsDeleted = 0;
        $filesAnalyzed = 0;
        $filesExcluded = 0;
        $filesUpdated = 0;
        $filesDeleted = 0;


        // get complete list of directories existing in destination, build map of local collections
        $destinationCollectionsTree = static::getTree($destinationPath);
        $localDestinationCollectionsMap = array();

        foreach ($destinationCollectionsTree AS &$collectionInfo) {
            if ($collectionInfo['Site'] != 'Local') {
                continue;
            }

            if ($collectionInfo['ParentID'] && isset($destinationCollectionsTree[$collectionInfo['ParentID']])) {
                $collectionInfo['_path'] = $destinationCollectionsTree[$collectionInfo['ParentID']]['_path'] . '/' . $collectionInfo['Handle'];
                $localDestinationCollectionsMap[$collectionInfo['_path']] = &$collectionInfo;
            } elseif (!$collectionInfo['ParentID']) {
                $collectionInfo['_path'] = $collectionInfo['Handle'];
            } else {
                $collectionInfo['_path'] = $destinationPath;
            }
        }

        // get complete list of files existing in destination, build map of all by path
        $destinationFilesMap = static::getTreeFilesFromTree($destinationCollectionsTree);


        // configure iterator
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator(
                $sourcePath
                ,FilesystemIterator::CURRENT_AS_SELF | FilesystemIterator::SKIP_DOTS
            )
            ,RecursiveIteratorIterator::SELF_FIRST
        );


        // iterate through all source files
        foreach ($iterator AS $tmpPath => $node) {
            $relPath = substr($tmpPath, $prefixLen);
            $path = $destinationPath ? $destinationPath . $relPath : ltrim($relPath, '/');

            if ($options['debug']) {
                Debug::dump(array('tmpPath' => $tmpPath, 'destPath' => $path), false, 'iterating node');
            }

            if (static::matchesExclude($relPath, $options['exclude'])) {
                $filesExcluded++;
                continue;
            }

            // handle directory
            if ($node->isDir()) {
                SiteCollection::getOrCreatePath($path);

                $collectionsAnalyzed++;

                // erase from destination map
                unset($localDestinationCollectionsMap[$path]);

                continue;
            } else {
                $filesAnalyzed++;
            }

            $existingNode = isset($destinationFilesMap[$path]) ? $destinationFilesMap[$path] : null;

            // calculate hash for incoming file
            $sha1 = sha1_file($node->getRealPath());

            // skip if existing local or remote file matches hash
            if (!$existingNode || $existingNode['SHA1'] != $sha1) {
                if ($options['debug']) {
                    print("Found SHA1 mismatch $existingNode[SHA1] != $sha1<br>");
                }

                // use lower level create methods to supply already-calculated hash
                $fileRecord = SiteFile::createFromPath($path, null, $existingNode['ID']);
                SiteFile::saveRecordData($fileRecord, fopen($node->getPathname(),'r'), $sha1);

                $filesUpdated++;
            } elseif ($options['debug']) {
                print("Skipping matching SHA1 to existing file<br>");
            }

            // remove from dest files map
            if ($existingNode) {
                unset($destinationFilesMap[$path]);
            }
        }


        if ($options['delete']) {
            // delete local collections
            foreach ($localDestinationCollectionsMap AS $path => $collectionInfo) {
                $relPath = substr($path, strlen($destinationPath));

                // skip excluded paths
                if (static::matchesExclude($relPath, $options['exclude'])) {
                    $filesExcluded++;
                    continue;
                }

                DB::nonQuery(
                    'UPDATE `%s` SET Status = "Deleted" WHERE ID = %u'
                    ,array(
                        SiteCollection::$tableName
                        ,$collectionInfo['ID']
                    )
                );

                $collectionsDeleted++;

#                print("Deleted collection $collectionInfo[ID] at $path<br>");
            }

            // delete files
            foreach ($destinationFilesMap AS $path => $fileInfo) {
                // skip remote files
                if ($fileInfo['Site'] != 'Local') {
                    continue;
                }

                $relPath = substr($path, strlen($destinationPath));

                // skip excluded paths
                if (static::matchesExclude($relPath, $options['exclude'])) {
                    $filesExcluded++;
                    continue;
                }

                DB::nonQuery(
                    'INSERT INTO `%s` SET CollectionID = %u, Handle = "%s", Status = "Deleted", AuthorID = %u, AncestorID = %u'
                    ,array(
                        SiteFile::$tableName
                        ,$fileInfo['CollectionID']
                        ,basename($path)
                        ,!empty($GLOBALS['Session']) ? $GLOBALS['Session']->PersonID : null
                        ,$fileInfo['ID']
                    )
                );

                $filesDeleted++;

#                print("Deleted file $fileInfo[ID] at $path<br>");
            }
        }


        return array(
            'collectionsAnalyzed' => $collectionsAnalyzed
            ,'collectionsDeleted' => $collectionsDeleted
            ,'filesAnalyzed' => $filesAnalyzed
            ,'filesExcluded' => $filesExcluded
            ,'filesUpdated' => $filesUpdated
            ,'filesDeleted' => $filesDeleted
        );
    }

    public static function getTmpDir($prefix = 'etmp-')
    {
        $tmpPath = tempnam('/tmp', $prefix);
        unlink($tmpPath);
        mkdir($tmpPath);
        return $tmpPath;
    }

    public static function getCollectionLayers($path, $localOnly = false)
    {
        // split path into array
        if (is_string($path)) {
            $path = Site::splitPath($path);
        }

        // resolve local and remote collections
        $rootHandle = array_shift($path);

        $localCollection = SiteCollection::getByHandle($rootHandle, null, false);

        if (!$localOnly) {
            $remoteCollection = SiteCollection::getByHandle($rootHandle, null, true);
        }

        while ($handle = array_shift($path)) {
            if ($localCollection){
                $localCollection = SiteCollection::getByHandle($handle, $localCollection->ID, false);
            }

            if ($remoteCollection) {
                $remoteCollection = SiteCollection::getByHandle($handle, $remoteCollection->ID, true);
            }
        }

        return array_filter(array('remote' => $remoteCollection, 'local' => $localCollection));
    }

    public static function findFiles($filename, $useRegexp = false, $scope = null, $localOnly = false)
    {
        $collections = array();

        if ($scope) {
            if (!is_array($scope)) {
                $scope = array($scope);
            }

            foreach ($scope AS $scopeItem) {
                if (is_string($scopeItem)) {
                    foreach (static::getCollectionLayers($scopeItem, $localOnly) AS $collection) {
                        $collections[] = $collection;
                    }
                } elseif(is_a($scopeItem, 'SiteCollection')) {
                    $collections[] = $scopeItem;
                }
            }
        }

        DB::nonQuery('LOCK TABLES '.SiteFile::$tableName.' f1 READ, '.SiteFile::$tableName.' f2 READ, '.SiteCollection::$tableName.' collections READ');

        $collectionsQuery = sprintf('SELECT collections.ID FROM `%s` collections WHERE Status != "Deleted"', SiteCollection::$tableName);

        if (count($collections)) {
            $collectionsQuery .= sprintf(' AND ((%s))', implode(') OR (', array_map(function($collection) {
                $positions = DB::oneRecord('SELECT PosLeft, PosRight FROM `%s` collections WHERE ID = %u', array(
                    SiteCollection::$tableName
                    ,$collection->ID
                ));

                return sprintf('PosLeft BETWEEN %u AND %u', $positions['PosLeft'], $positions['PosRight']);
            }, $collections)));
        }

        $fileResults = DB::query(
            'SELECT f2.* FROM (SELECT MAX(f1.ID) AS ID FROM `%1$s` f1 WHERE CollectionID IN (%2$s) AND Status != "Phantom" GROUP BY f1.Handle) AS lastestFiles LEFT JOIN `%1$s` f2 ON (f2.ID = lastestFiles.ID) WHERE f2.Status != "Deleted" AND f2.Handle %3$s "%4$s"'
            ,array(
                SiteFile::$tableName
                ,$collectionsQuery
                ,$useRegexp ? 'REGEXP' : '='
                ,DB::escape($filename)
            )
        );

        DB::nonQuery('UNLOCK TABLES');

        $results = array();
        while ($record = $fileResults->fetch_assoc()) {
            $fileNode = new SiteFile($record['Handle'], $record);
            $results[join('/', $fileNode->getFullPath(null, false))] = $fileNode;
        }

        return $results;
    }

    public static function getAggregateChildren($path)
    {
        $children = array();

        foreach (static::getCollectionLayers($path) AS $collection) {
            foreach ($collection->getChildren() AS $child) {
                $children[$child->Handle] = $child;
            }
        }

        return $children;
    }

    public static function getNodesFromPattern($patterns, $localOnly = false)
    {
        $matchedNodes = array();

        if (!is_array($patterns)) {
            $patterns = array($patterns);
        }

        $rootCollections = SiteCollection::getAllRootCollections();
        if (!$localOnly) {
            $rootCollections = array_merge($rootCollections, SiteCollection::getAllRootCollections(true));
        }

        $_findMatchingNodes = function($patternStack, $nodes) use (&$_findMatchingNodes, &$matchedNodes) {
            $pattern = array_shift($patternStack);
            foreach ($nodes AS $node) {
                if (preg_match("{^$pattern\$}i", $node->Handle)) {
                    if (!count($patternStack)) {
                        $matchedNodes[] = $node;
                    } elseif ($node->Class == 'SiteCollection') {
                        $_findMatchingNodes($patternStack, $node->getChildren());
                    }
                }
            }
        };

        foreach ($patterns AS $pattern) {
            $_findMatchingNodes(explode('/', $pattern), $rootCollections);
        }

        return $matchedNodes;
    }

    public static function matchesExclude($relPath, array $excludes)
    {
        if ($excludes) {
            foreach ($excludes AS $excludePattern) {
                if (preg_match($excludePattern, $relPath)) {
                    return true;
                }
            }
        }

        return false;
    }
}
