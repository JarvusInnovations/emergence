<?php

class SiteFile
{
    // config properties
    public static $tableName = '_e_files';
    public static $dataPath = 'data';
    public static $collectionClass = 'SiteCollection';
    public static $extensionMIMETypes = array(
        'js' => 'application/javascript'
        ,'json' => 'application/json'
        ,'php' => 'application/php'
        ,'html' => 'text/html'
        ,'css' => 'text/css'
        ,'apk' => 'application/vnd.android.package-archive'
        ,'woff' => 'application/x-font-woff'
        ,'ttf' => 'font/ttf'
        ,'eot' => 'application/vnd.ms-fontobject'
        ,'scss' => 'text/x-scss'
        ,'tpl' => 'text/x-html-template'
        ,'svg' => 'image/svg+xml'
    );
    public static $additionalHeaders = array(
        'static' => array('Cache-Control: max-age=3600, must-revalidate', 'Pragma: public')
        ,'image/png' => 'static'
        ,'image/jpeg' => 'static'
        ,'image/gif' => 'static'
        ,'application/javascript' => 'static'
        ,'application/json' => 'static'
        ,'text/css' => 'static'
        ,'application/x-font-woff' => 'static'
        ,'font/ttf' => 'static'
        ,'application/vnd.ms-fontobject' => 'static'
        ,'image/svg+xml' => 'static'
    );

    // private properties
    private $_handle;
    private $_record;

    public function __construct($handle, $record = null)
    {
        $this->_handle = $handle;
        $this->_record = $record;
    }

    protected $_author;
    public function __get($name)
    {
        switch ($name) {
            case 'ID':
                return $this->_record['ID'];
            case 'Class':
                return __CLASS__;
            case 'Handle':
                return $this->_handle;
            case 'Type':
            case 'MIMEType':
                return $this->_record['Type'];
            case 'Size':
                return $this->_record['Size'];
            case 'SHA1':
                return $this->_record['SHA1'];
            case 'Status':
                return $this->_record['Status'];
            case 'Timestamp':
                return strtotime($this->_record['Timestamp']);
            case 'AuthorID':
                return $this->_record['AuthorID'];
            case 'Author':
                if (!isset($this->_author)) {
                    $this->_author = $this->AuthorID ? Person::getByID($this->AuthorID) : null;
                }

                return $this->_author;
            case 'AncestorID':
                return $this->_record['AncestorID'];
            case 'CollectionID':
                return $this->_record['CollectionID'];
            case 'Collection':
                if (!isset($this->_collection)) {
                    $collectionClass = static::$collectionClass;
                    $this->_collection = $collectionClass::getByID($this->CollectionID);
                }
                return $this->_collection;
            case 'RealPath':
                return $this->getRealPath();
            case 'FullPath':
                return implode('/', $this->getFullPath());
        }
    }

    public static function getCacheKey($collectionID, $handle)
    {
        return sprintf('%s:efs:file/%u/%s', Site::getConfig('handle'), $collectionID, $handle);
    }

    public static function getByID($fileID)
    {
        $record = DB::oneRecord(
            'SELECT * FROM `%s` WHERE ID = %u'
            ,array(
                static::$tableName
                ,$fileID
            )
        );

        return $record ? new static($record['Handle'], $record) : null;
    }

    public static function getByHandle($collectionID, $handle)
    {
        $cacheKey = static::getCacheKey($collectionID, $handle);

        if (false === ($record = apc_fetch($cacheKey))) {
            $record = DB::oneRecord(
                'SELECT * FROM `%s` WHERE CollectionID = %u AND Handle = "%s" ORDER BY ID DESC LIMIT 1'
                ,array(
                    static::$tableName
                    ,$collectionID
                    ,DB::escape($handle)
                )
            );

            apc_store($cacheKey, $record);
        }

        return $record ? new static($record['Handle'], $record) : null;
    }

    public static function getTree(SiteCollection $Collection)
    {
        DB::nonQuery('LOCK TABLES '.static::$tableName.' f1 READ, '.static::$tableName.' f2 READ, '.SiteCollection::$tableName.' collections READ');

        $positions = DB::oneRecord('SELECT PosLeft, PosRight FROM `%s` collections WHERE ID = %u', array(
            SiteCollection::$tableName
            ,$Collection->ID
        ));

        $fileResults = DB::query(
            'SELECT f2.* FROM (SELECT MAX(f1.ID) AS ID FROM `%1$s` f1 WHERE CollectionID IN (SELECT collections.ID FROM `%2$s` collections WHERE PosLeft BETWEEN %3$u AND %4$u) AND Status != "Phantom" GROUP BY f1.Handle) AS lastestFiles LEFT JOIN `%1$s` f2 ON (f2.ID = lastestFiles.ID) WHERE f2.Status != "Deleted"'
            ,array(
                static::$tableName
                ,SiteCollection::$tableName
                ,$positions['PosLeft']
                ,$positions['PosRight']
            )
        );

        DB::nonQuery('UNLOCK TABLES');

        $children = array();
        while ($record = $fileResults->fetch_assoc()) {
            $children[] = new static($record['Handle'], $record);
        }

        return $children;
    }

    public function getRevisions()
    {
        $result = DB::query(
            'SELECT * FROM `%s` WHERE CollectionID = %u AND Handle = "%s" ORDER BY ID DESC'
            ,array(
                static::$tableName
                ,$this->CollectionID
                ,DB::escape($this->Handle)
            )
        );

        $revisions = array();
        while ($record = $result->fetch_assoc()) {
            $revisions[] = new static($record['Handle'], $record);
        }

        return $revisions;
    }

    public function getRealPath()
    {
        return static::getRealPathByID($this->ID);
    }

    public function getFullPath($root = null, $prependParent = true)
    {
        $path = $this->Collection->getFullPath($root, $prependParent);
        array_push($path, $this->Handle);
        return $path;
    }

    public static function getRealPathByID($ID)
    {
        return Site::$rootPath . '/' . static::$dataPath . '/' . $ID;
    }

    public function getName()
    {
        return $this->Handle;
    }

    public function getSize()
    {
        return $this->Size;
    }

    public function getETag()
    {
        return $this->SHA1 ? ('"'.$this->SHA1.'"') : null;
    }

    public function get()
    {
        return fopen($this->getRealPath(), 'r');
    }

    public static function createFromPath($path, $data = null, $ancestorID = null)
    {
        if (!is_array($path)) {
            $path = Site::splitPath($path);
        }

        $parentCollection = null;

        // create collections
        while (count($path) > 1) {
            $parentCollection = SiteCollection::getOrCreateCollection(array_shift($path), $parentCollection);
        }

        return static::create($parentCollection->ID, $path[0], $data, $ancestorID);
    }

    public static function create($collectionID, $handle, $data = null, $ancestorID = null)
    {
        if (!$handle) {
            return;
        }

        $record = static::createPhantom($collectionID, $handle, $ancestorID);

        if ($data) {
            static::saveRecordData($record, $data);
        }

        return $record;
    }

    function put($data, $ancestorID = null)
    {
        if ($this->Status == 'Phantom' && !empty($GLOBALS['Session']) && $this->AuthorID == $GLOBALS['Session']->PersonID) {
            static::saveRecordData($this->_record, $data);
            return $this->_record;
        } else {
            $newRecord = static::createPhantom($this->CollectionID, $this->Handle, $ancestorID ? $ancestorID : $this->ID);
            static::saveRecordData($newRecord, $data);
            return $newRecord;
        }
    }

    public static function createPhantom($collectionID, $handle, $ancestorID = null)
    {
        DB::nonQuery('INSERT INTO `%s` SET CollectionID = %u, Handle = "%s", Status = "Phantom", AuthorID = %s, AncestorID = %s', array(
            static::$tableName
            ,$collectionID
            ,DB::escape($handle)
            ,!empty($GLOBALS['Session']) && $GLOBALS['Session']->PersonID ? $GLOBALS['Session']->PersonID : 'NULL'
            ,$ancestorID ? $ancestorID : 'NULL'
        ));

        return array(
            'ID' => DB::insertID()
            ,'CollectionID' => $collectionID
            ,'Handle' => $handle
            ,'Status' => 'Phantom'
            ,'AuthorID' => !empty($GLOBALS['Session']) && $GLOBALS['Session']->PersonID ? $GLOBALS['Session']->PersonID : null
            ,'AncestorID' => $ancestorID
        );
    }

    public static function saveRecordData(&$record, $data, $sha1 = null)
    {
        // save file
        $filePath = static::getRealPathByID($record['ID']);
        file_put_contents($filePath, $data);

        // update in-memory record
        $record['SHA1'] = $sha1 ? $sha1 : sha1_file($filePath);
        $record['Size'] = filesize($filePath);
        $record['Type'] = File::getMIMEType($filePath);
        $record['Status'] = 'Normal';

        // override MIME type by extension
        $extension = strtolower(substr(strrchr($record['Handle'], '.'), 1));

        if ($extension && array_key_exists($extension, static::$extensionMIMETypes)) {
            $record['Type'] = static::$extensionMIMETypes[$extension];
        }

        // write record to database
        DB::nonQuery('UPDATE `%s` SET SHA1 = "%s", Size = %u, Type = "%s", Status = "Normal" WHERE ID = %u', array(
            static::$tableName
            ,$record['SHA1']
            ,$record['Size']
            ,$record['Type']
            ,$record['ID']
        ));

        // invalidate cache
        apc_delete(static::getCacheKey($record['CollectionID'], $record['Handle']));
    }

    public function setName($handle)
    {
        $authorID = !empty($GLOBALS['Session']) && $GLOBALS['Session']->PersonID ? $GLOBALS['Session']->PersonID : null;
        $oldHandle = $this->_handle;

        if ($this->Size == 0 && $authorID && $this->AuthorID == $authorID && !$this->AncestorID) {
            // updating existing record only if file is empty, by the same author, and has no ancestor
            DB::nonQuery('UPDATE `%s` SET Handle = "%s" WHERE ID = %u', array(
                static::$tableName
                ,DB::escape($handle)
                ,$this->ID
            ));
        } else {
            // clone existing record
            DB::nonQuery(
                'INSERT INTO `%s` SET CollectionID = %u, Handle = "%s", Status = "%s", SHA1 = "%s", Size = %u, Type = "%s", AuthorID = %s, AncestorID = %u'
                ,array(
                    static::$tableName
                    ,$this->CollectionID
                    ,DB::escape($handle)
                    ,$this->Status
                    ,$this->SHA1
                    ,$this->Size
                    ,$this->Type
                    ,$this->AuthorID ? $this->AuthorID : 'NULL'
                    ,$this->ID
                )
            );
            $newID = DB::insertID();

            // delete current record
            $this->delete();

            // symlink to old data point
            symlink($this->ID, static::getRealPathByID($newID));

            // update instance
            $this->_record['ID'] = $newID;

            if ($authorID != $this->AuthorID) {
                $this->_author = null;
            }

            $this->_record['AuthorID'] = $authorID;
        }

        $this->_handle = $handle;

        // invalidate cache of new and old handle
        apc_delete(static::getCacheKey($this->CollectionID, $oldHandle));
        apc_delete(static::getCacheKey($this->CollectionID, $handle));
    }

    public function delete()
    {
        DB::nonQuery('INSERT INTO `%s` SET CollectionID = %u, Handle = "%s", Status = "Deleted", AuthorID = %s, AncestorID = %u', array(
            static::$tableName
            ,$this->CollectionID
            ,DB::escape($this->Handle)
            ,!empty($GLOBALS['Session']) && $GLOBALS['Session']->PersonID ? $GLOBALS['Session']->PersonID : 'NULL'
            ,$this->ID
        ));

        // invalidate cache
        apc_delete(static::getCacheKey($this->CollectionID, $this->Handle));
    }

    public function destroyRecord()
    {
        DB::nonQuery('DELETE FROM `%s` WHERE ID = %u', array(
            static::$tableName
            ,$this->ID
        ));

        // invalidate cache
        apc_delete(static::getCacheKey($this->CollectionID, $this->Handle));
    }

    /**
     * Clear all the files from a given collection's tree
     *
     * Warning: this method is designed to be called from SiteCollection::delete and will leave stale cache entries if called
     * on its own
     */
    public static function deleteTree(SiteCollection $Collection)
    {
        DB::nonQuery('LOCK TABLES '.static::$tableName.' WRITE, '.static::$tableName.' AS f1 READ, '.static::$tableName.' AS f2 READ, '.SiteCollection::$tableName.' AS collections READ');

        $positions = DB::oneRecord('SELECT PosLeft, PosRight FROM `%s` collections WHERE ID = %u', array(
            SiteCollection::$tableName
            ,$Collection->ID
        ));

        DB::nonQuery(
            'INSERT INTO `%1$s` (CollectionID, Handle, Status, AuthorID, AncestorID) SELECT f2.CollectionID, f2.Handle, "Deleted", %5$s, f2.ID FROM (SELECT MAX(f1.ID) AS ID FROM `%1$s` f1 WHERE CollectionID IN (SELECT collections.ID FROM `%2$s` collections WHERE PosLeft BETWEEN %3$u AND %4$u) AND Status != "Phantom" GROUP BY f1.Handle) AS lastestFiles LEFT JOIN `%1$s` f2 ON (f2.ID = lastestFiles.ID) WHERE f2.Status != "Deleted"'
            ,array(
                static::$tableName
                ,SiteCollection::$tableName
                ,$positions['PosLeft']
                ,$positions['PosRight']
                ,!empty($GLOBALS['Session']) && $GLOBALS['Session']->PersonID ? $GLOBALS['Session']->PersonID : 'NULL'
            )
        );

        DB::nonQuery('UNLOCK TABLES');
    }

    public function outputAsResponse($includeAuthor = false)
    {
        if (extension_loaded('newrelic')) {
            newrelic_disable_autorum();
        }

        if (array_key_exists($this->MIMEType, static::$additionalHeaders)) {
            $headers = static::$additionalHeaders[$this->MIMEType];

            // if value is a string, it's an alias to another headers list
            if (is_string($headers)) {
                $headers = static::$additionalHeaders[$headers];
            }

            foreach ($headers AS $header) {
                header($header);
            }
        }

        // use SHA1 for ETag and manifest-based caching
        header('ETag: '.$this->SHA1);
        if (!empty($_GET['_sha1']) && $_GET['_sha1'] == $this->SHA1) {
            $expires = 60*60*24*365;
            header('Cache-Control: public, max-age='.$expires);
            header('Expires: ' . gmdate('D, d M Y H:i:s \G\M\T', time()+$expires));
            header('Pragma: public');
        }

        // send 304 and exit if current version matches HTTP_IF_* check
        if (!empty($_SERVER['HTTP_IF_NONE_MATCH']) && $_SERVER['HTTP_IF_NONE_MATCH'] == $this->SHA1) {
            header('HTTP/1.0 304 Not Modified');
            exit();
        } elseif (!empty($_SERVER['HTTP_IF_MODIFIED_SINCE']) && strtotime($_SERVER['HTTP_IF_MODIFIED_SINCE']) >= $this->Timestamp) {
            header('HTTP/1.0 304 Not Modified');
            exit();
        }

        header('Content-Type: '.$this->MIMEType);
        header('Content-Length: '.$this->Size);
        header('Last-Modified: '.gmdate('D, d M Y H:i:s \G\M\T', $this->Timestamp));

        if ($includeAuthor && $this->Author) {
          header('Author: '.$this->Author->EmailRecipient);
        }

        readfile($this->RealPath);
        exit();
    }

    public function getLastModified()
    {
        return $this->Timestamp;
    }

    public function getContentType()
    {
        return $this->MIMEType;
    }

    public function getData()
    {
        $data = $this->_record;
        $data['Class'] = $this->Class;
        $data['FullPath'] = $this->FullPath;
        return $data;
    }
}