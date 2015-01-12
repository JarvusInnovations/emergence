<?php

class SiteCollection
{
    // config properties
    public static $tableName = '_e_file_collections';
    public static $autoCreate = false;
    public static $fileClass = 'SiteFile';

    // protected properties
    protected $_handle;
    protected $_record;

    public function __construct($handle, $record = null)
    {
        $this->_handle = $handle;

        if ($record) {
            $this->_record = $record;
        } else {
            $this->_record = static::getRecordByHandle($handle);
        }

        if (!$this->_record) {
            if (static::$autoCreate) {
                $this->_record = static::createRecord($handle);
            } else {
                throw new Exception('Collection with name ' . $handle . ' could not be located');
            }
        }

    }

    public function __get($name)
    {
        switch ($name) {
            case 'ID':
                return $this->_record['ID'];
            case 'Class':
                return __CLASS__;
            case 'Handle':
                return $this->_record['Handle'];
            case 'Status':
                return $this->_record['Status'];
            case 'Site':
                return $this->_record['Site'];
            case 'ParentID':
                return $this->_record['ParentID'];
            case 'Parent':
                if (!isset($this->_parent)) {
                    $this->_parent = $this->ParentID ? static::getByID($this->ParentID) : null;
                }
                return $this->_parent;
            case 'FullPath':
                return implode('/',$this->getFullPath());
        }
    }

    public function __isset($name)
    {
        return $this->__get($name) !== null;
    }

    public static function getCacheKey($handle, $parentID = null, $remote = false)
    {
        // build cache key and query conditions
        $cacheKey = 'efs:col';

        if ($parentID) {
            $cacheKey .= sprintf('/%u/', $parentID);
            $where[] = sprintf('ParentID = %u', $parentID);
        } else {
            $cacheKey .= sprintf('/%s/', $remote ? 'remote' : 'local');
        }

        return $cacheKey . $handle;
    }

    public static function getByID($collectionID)
    {
        $record = DB::oneRecord('SELECT * FROM `%s` WHERE ID = %u', array(static::$tableName, $collectionID));
        return $record ? new static($record['Handle'], $record) : null;
    }

    public static function getRecordByHandle($handle, $parentID = null, $remote = false, $includeDeleted = false)
    {
        // build cache key and query conditions
        $cacheKey = static::getCacheKey($handle, $parentID, $remote);
        $where = array();

        if ($parentID) {
            $where[] = sprintf('ParentID = %u', $parentID);
        } else {
            $where[] = sprintf('Site = "%s"', $remote ? 'Remote' : 'Local');
            $where[] = 'ParentID IS NULL';
        }

        $where[] = sprintf('Handle = "%s"', DB::escape($handle));

        if (!$includeDeleted) {
            $where[] = 'Status = "Normal"';
        } else {
            $cacheKey .= '?deleted';
        }

        // attempt to get from cache
        if (false !== ($record = Cache::fetch($cacheKey))) {
            return $record;
        }

        // query and cache
        $record = DB::oneRecord(
            'SELECT * FROM `%s` WHERE (%s) ORDER BY ID DESC LIMIT 1'
            ,array(
                static::$tableName
                ,implode(') AND (', $where)
            )
        );

        Cache::store($cacheKey, $record);

        return $record;
    }

    public function getCollectionsTree()
    {
        DB::nonQuery('LOCK TABLES '.static::$tableName.' READ');

        $positions = DB::oneRecord('SELECT PosLeft, PosRight FROM `%s` WHERE ID = %u', array(
            static::$tableName
            ,$this->ID
        ));

        $collectionResults = DB::query(
            'SELECT * FROM `%1$s` WHERE PosLeft BETWEEN %2$u AND %3$u AND Status = "Normal"'
            ,array(
                static::$tableName
                ,$positions['PosLeft']
                ,$positions['PosRight']
            )
        );

        DB::nonQuery('UNLOCK TABLES');

        $children = array();
        while ($record = $collectionResults->fetch_assoc()) {
            $children[] = new static($record['Handle'], $record);
        }

        return $children;
    }

    public function getFilesTree()
    {
        return SiteFile::getTree($this);
    }

    public static function getByHandle($handle, $parentID = null, $remote = false, $includeDeleted = false)
    {
        $record = static::getRecordByHandle($handle, $parentID, $remote, $includeDeleted);

        return $record ? new static($record['Handle'], $record) : null;
    }

    public function getChildren()
    {
        $fileClass = static::$fileClass;
        $children = array();

        // get collections
        $collectionResults = DB::query(
            'SELECT * FROM `%s` WHERE ParentID = %u AND Status = "Normal"'
            ,array(
                static::$tableName
                ,$this->ID
            )
        );

        while ($record = $collectionResults->fetch_assoc()) {
            $children[] = new static($record['Handle'], $record);
        }

        // get files
        $fileResults = DB::query(
            'SELECT f2.* FROM (SELECT MAX(f1.ID) AS ID FROM `%1$s` f1 WHERE CollectionID = %2$u AND Status != "Phantom" GROUP BY f1.Handle) AS lastestFiles LEFT JOIN `%1$s` f2 ON (f2.ID = lastestFiles.ID) WHERE f2.Status = "Normal"'
            ,array(
                $fileClass::$tableName
                ,$this->ID
            )
        );

        while ($record = $fileResults->fetch_assoc()) {
            $children[] = new $fileClass($record['Handle'], $record);
        }

        return $children;
    }

    public function getChild($handle, $record = null)
    {
        $fileClass = static::$fileClass;

        // try to get collection record
        if ($collection = static::getByHandle($handle, $this->ID, $this->Site == 'Remote')) {
            return $collection;
        }

        // try to get file record
        if ($fileNode = $fileClass::getByHandle($this->ID, $handle)) {
            if ($fileNode->Status == 'Deleted') {
                return false;
            }

            return $fileNode;
        }

        return false;
    }

    public function childExists($name)
    {
        return (boolean)$this->getChild($name);
    }

    public function resolvePath($path)
    {
        if (!is_array($path)) {
            $path = Site::splitPath($path);
        }

        $node = $this;
        while ($childHandle = array_shift($path)) {
            if (method_exists($node,'getChild') && $nextNode = $node->getChild($childHandle)) {
                $node = $nextNode;
            } else {
                $node = false;
                break;
            }
        }

        return $node;
    }

    public function getName()
    {
        return $this->Handle;
    }

    public function createFile($path, $data = null, $ancestorID = null)
    {
        if (!is_array($path)) {
            $path = Site::splitPath($path);
        }

        $parentCollection = $this;

        // create collections
        while (count($path) > 1) {
            $parentCollection = static::getOrCreateCollection(array_shift($path), $parentCollection);
        }

        $fileClass = static::$fileClass;
        return $fileClass::create($parentCollection->ID, $path[0], $data, $ancestorID);
    }

    public function getLocalizedCollection()
    {
        if ($this->Site == 'Local') {
            return $this;
        }

        // discover parent tree
        $tree = array($node = $this);
        while ($node->ParentID) {
            $tree[] = $node = static::getByID($node->ParentID);
        }

        // get localized nodes from root node up
        $localNode = null;
        while ($foreignNode = array_pop($tree)) {
            $parentLocalNode = $localNode;
            $localNode = static::getByHandle($foreignNode->Handle, $parentLocalNode ? $parentLocalNode->ID : null);

            if (!$localNode) {
                $localNode = static::create($foreignNode->Handle, $parentLocalNode);
            }
        }

        return $localNode;
    }

    public function createDirectory($handle)
    {
        return static::createRecord($handle, $this);
    }

    // this functions sucks, $root=null will break, caches $root'd results without key
    protected $_fullPath;
    public function getFullPath($root = null, $prependParent = true)
    {
        if (isset($this->_fullPath) && !$root) {
            $path = $this->_fullPath;
        } else {
            if ($this->Parent) {
                $path = $this->Parent->getFullPath($root, false);
            } else {
                $path = array();
            }

            array_push($path, $this->Handle);

            $this->_fullPath = $path;
        }

        if ($prependParent && $this->Site == 'Remote') {
            array_unshift($path, '_parent');
        }

        return $path;
    }

    public static function getAllRootCollections($remote = false)
    {
        if (!is_bool($remote)) {
            debug_print_backtrace();
            die('SiteID must be converted to (bool)$remote');
        }

        $collections = array();
        $results = DB::query(
            'SELECT * FROM `%s` WHERE Site = "%s" AND ParentID IS NULL AND Status = "Normal" ORDER BY Handle'
            ,array(
                static::$tableName
                ,$remote ? 'Remote' : 'Local'
            )
        );

        while ($collectionRecord = $results->fetch_assoc()) {
            $collections[] = new static($collectionRecord['Handle'], $collectionRecord);
        }

        return $collections;
    }

    public static function getOrCreateRootCollection($handle, $remote = false)
    {
        return static::getOrCreateCollection($handle, null, $remote);
    }

    public static function getOrCreateCollection($handle, $parentCollection = null, $remote = false)
    {
        if (!is_bool($remote)) {
            debug_print_backtrace();
            die('SiteID must be converted to (bool)$remote');
        }

        if ($parentCollection) {
            $remote = $parentCollection->Site=='Remote';
        }

        if (!$collection = static::getByHandle($handle, $parentCollection ? $parentCollection->ID : null, $remote)) {
            static::createRecord($handle, $parentCollection, $remote);
            $collection = static::getByHandle($handle, $parentCollection ? $parentCollection->ID : null, $remote);
        }

        if ($parentCollection && !$collection->_parent) {
            $collection->_parent = $parentCollection;
        }

        return $collection;
    }

    public static function create($handle, $parentCollection = null, $remote = false)
    {
        $collectionID = static::createRecord($handle, $parentCollection, $remote);

        return static::getByID($collectionID);
    }

    public static function createRecord($handle, $parentCollection = null, $remote = false)
    {
        // clear cache of not-found or deleted record
        Cache::delete(static::getCacheKey($handle, $parentCollection ? $parentCollection->ID : null, $remote));

        // check for existing deleted node
        $existingRecord = DB::oneRecord(
            'SELECT * FROM `%s` WHERE Site = "%s" AND ParentID = %s AND Handle = "%s"'
            ,array(
                static::$tableName
                ,$parentCollection ? $parentCollection->Site : ($remote ? 'Remote' : 'Local')
                ,$parentCollection ? $parentCollection->ID : 'NULL'
                ,DB::escape($handle)
            )
        );

        if ($existingRecord) {
            DB::nonQuery(
                'UPDATE `%s` SET Status = "Normal" WHERE ID = %u'
                ,array(
                    static::$tableName
                    ,$existingRecord['ID']
                )
            );

            return $existingRecord['ID'];
        }

        DB::nonQuery('LOCK TABLES '.static::$tableName.' WRITE, '.SiteFile::$tableName.' READ');

        // The table lock will interfere with normal error handling, so any exceptions until the table is unlocked must be intercepted
        try {
            // determine new node's position
            if ($parentCollection) {
                $left = DB::oneValue('SELECT PosRight FROM `%s` WHERE ID = %u', array(static::$tableName, $parentCollection->ID));
            } else {
                $left = DB::oneValue('SELECT IFNULL(MAX(PosRight)+1, 1) FROM `%s`', static::$tableName);
            }
            $right = $left + 1;

            if ($parentCollection) {
                // push rest of set right by 2 to make room
                DB::nonQuery(
                    'UPDATE `%s` SET PosRight = PosRight + 2 WHERE PosRight >= %u ORDER BY PosRight DESC'
                    ,array(
                        static::$tableName
                        ,$left
                    )
                );
                DB::nonQuery(
                    'UPDATE `%s` SET PosLeft = PosLeft + 2 WHERE PosLeft > %u ORDER BY PosLeft DESC'
                    ,array(
                        static::$tableName
                        ,$left
                    )
                );
            }

            // create record
            DB::nonQuery('INSERT INTO `%s` SET Site = "%s", Handle = "%s", CreatorID = %u, ParentID = %s, PosLeft = %u, PosRight = %u', array(
                static::$tableName
                ,$parentCollection ? $parentCollection->Site : ($remote ? 'Remote' : 'Local')
                ,DB::escape($handle)
                ,!empty($GLOBALS['Session']) ? $GLOBALS['Session']->PersonID : null
                ,$parentCollection ? $parentCollection->ID : 'NULL'
                ,$left
                ,$right
            ));

            $newID = DB::insertID();
        } catch (Exception $e) {
            // TODO: use `finally` structure in PHP 5.5
            DB::nonQuery('UNLOCK TABLES');
            throw $e;
        }

        DB::nonQuery('UNLOCK TABLES');

        return $newID;
    }

    public function setName($handle)
    {
        Cache::delete(static::getCacheKey($this->Handle, $this->ParentID, $this->Site == 'Remote'));
        Cache::delete(static::getCacheKey($handle, $this->ParentID, $this->Site == 'Remote'));

        DB::nonQuery('UPDATE `%s` SET Handle = "%s" WHERE ID = %u', array(
            static::$tableName
            ,DB::escape($handle)
            ,$this->ID
        ));
    }

    public function setStatus($status)
    {
        Cache::delete(static::getCacheKey($this->Handle, $this->ParentID, $this->Site == 'Remote'));

        DB::nonQuery('UPDATE `%s` SET Status = "%s" WHERE ID = %u', array(
            static::$tableName
            ,DB::escape($status)
            ,$this->ID
        ));
    }

    public function getLastModified()
    {
        return time();
    }

    public function delete()
    {
        // FIXME: check if status/handle unique combo already exists

        DB::nonQuery('LOCK TABLES '.static::$tableName.' WRITE');

        $positions = DB::oneRecord('SELECT PosLeft, PosRight FROM `%s` WHERE ID = %u', array(
            static::$tableName
            ,$this->ID
        ));

        // mark collection and all subcollections as deleted
        DB::nonQuery('UPDATE `%s` SET Status = "Deleted" WHERE PosLeft BETWEEN %u AND %u', array(
            static::$tableName
            ,$positions['PosLeft']
            ,$positions['PosRight']
        ));

        DB::nonQuery('UNLOCK TABLES');

        // delete all files
        SiteFile::deleteTree($this);

        // clear caches
        static::clearCacheTree($this->_record);
    }

    public function clearCacheTree($record, $key = null)
    {
        if (!$key) {
            $key = static::getCacheKey($record['Handle'], $record['ParentID'], $record['Site'] == 'Remote');
        }

        Cache::delete($key);

        // iterate child collections
        $childCollectionsKey = static::getCacheKey('.*', $record['ID'], $record['Site'] == 'Remote');

        foreach (CacheIterator::getIterator('|^'.$childCollectionsKey.'|') AS $childCollection) {
            if ($childCollection['value']) {
                static::clearCacheTree($childCollection['value'], $childCollection['key']);
            }
        }

        // iterate child files
        $childFilesKey = SiteFile::getCacheKey($record['ID'], '.*');

        foreach (CacheIterator::getIterator('|^'.$childFilesKey.'|') AS $childFile) {
            if ($childFile['value']) {
                Cache::delete($childFile['key']);
            }
        }
    }

    public function getRealPath()
    {
        return null;
    }

    public function getData()
    {
        $data = $this->_record;
        $data['Class'] = $this->Class;
        $data['FullPath'] = $this->FullPath;
        return $data;
    }

    public static function getOrCreatePath($path, SiteCollection $root = null)
    {
        if (!is_array($path)) {
            $path = Site::splitPath($path);
        }

        $collection = $root;

        // create collections
        while (count($path)) {
            $collection = static::getOrCreateCollection(array_shift($path), $collection);
        }

        return $collection;
    }
}
