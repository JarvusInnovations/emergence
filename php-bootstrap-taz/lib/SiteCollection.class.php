<?php


class SiteCollection
{
	static public $tableName = '_e_file_collections';
	static public $autoCreate = false;
	static public $fileClass = 'SiteFile';

	public $_handle;
	public $_record;

	function __construct($handle, $record = null)
	{
		$this->_handle = $handle;
		
		if($record)
			$this->_record = $record;
		else
			$this->_record = static::getRecordByHandle($handle);
			
		if(!$this->_record)
		{
			if(static::$autoCreate)
				$this->_record = static::createRecord($handle);
			else
			{
				throw new Exception('Collection with name ' . $handle . ' could not be located');
			}
		}
		
	}
	
	function __get($name)
	{
		switch($name)
		{
			case 'ID':
				return $this->_record['ID'];
			case 'Class':
				return __CLASS__;
			case 'Handle':
				return $this->_record['Handle'];
			case 'Status':
				return $this->_record['Status'];
			case 'SiteID':
				return $this->_record['SiteID'];
			case 'ParentID':
				return $this->_record['ParentID'];
			case 'Parent':
				if(!isset($this->_parent))
				{
					$this->_parent = $this->ParentID ? static::getByID($this->ParentID) : null;
				}
				return $this->_parent;
			case 'PosLeft':
				return $this->_record['PosLeft'];
			case 'PosRight':
				return $this->_record['PosRight'];
			case 'FullPath':
				return implode('/',$this->getFullPath());
		}
	}
	
	static public function getByID($collectionID)
	{
		$record = DB::oneRecord('SELECT * FROM `%s` WHERE ID = %u', array(static::$tableName, $collectionID));
		return new static($record['Handle'], $record);
	}
	
	static public function getRecordByHandle($handle, $parentID = null, $siteID = null, $includeDeleted = false)
	{
		$where[] = sprintf('Handle = "%s"', DB::escape($handle));
		
		if(!$includeDeleted)
			$where[] = 'Status = "Normal"';
		
		if($parentID)
		{
			$where[] = sprintf('ParentID = %u', $parentID);
		}
		else
		{
			$where[] = 'ParentID IS NULL';
			$where[] = sprintf('SiteID = %u', $siteID ? $siteID : Site::getSiteID());
		}
		
		return DB::oneRecord(
			'SELECT * FROM `%s` WHERE (%s) ORDER BY ID DESC LIMIT 1'
			,array(
				static::$tableName
				,implode(') AND (', $where)
			)
		);
	}

	public function getCollectionsTree()
    {
    	$collectionResults = DB::query(
    		'SELECT * FROM `%1$s` WHERE PosLeft BETWEEN %2$u AND %3$u AND Status = "Normal"'
    		,array(
				static::$tableName
				,$this->PosLeft
				,$this->PosRight
    		)
    	);
    	
    	$children = array();
    	while($record = $collectionResults->fetch_assoc())
		{
			$children[] = new static($record['Handle'], $record);
		}

		return $children;
    }
    
    public function getFilesTree()
    {
    	return SiteFile::getTree($this);
    }

	static public function getByHandle($handle, $parentID = null, $siteID = null, $includeDeleted = false)
	{
		$record = static::getRecordByHandle($handle, $parentID, $siteID, $includeDeleted);
		
		return $record ? new static($record['Handle'], $record) : null;
	}
	
	function getChildren()
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
		
		while($record = $collectionResults->fetch_assoc())
		{
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
		while($record = $fileResults->fetch_assoc())
		{
			$children[] = new $fileClass($record['Handle'], $record);
		}

		return $children;
	}

	function getChild($handle, $record = null)
	{
		$fileClass = static::$fileClass;
		
		//print("getChild($handle)\n");
		
		// no hidden files
		if ($handle[0]=='.')
			throw new Sabre_DAV_Exception_FileNotFound('Access denied');

		// try to get collection record
		if($collection = static::getByHandle($handle, $this->ID, $this->SiteID))
		{
			return $collection;
		}

		// try to get file record
		if($fileNode = $fileClass::getByHandle($this->ID, $handle))
		{
			if($fileNode->Status == 'Deleted')
			{
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

	function resolvePath($path)
	{
		if(!is_array($path))
			$path = Site::splitPath($path);
		
/*
		if($this->ID > 4){
			printf("%s:%u->resolvePath(%s)<br>", get_class($this), $this->ID, implode('/', $path));
		}
*/
		$node = $this;
		while($childHandle = array_shift($path))
		{
			if(method_exists($node,'getChild') && $nextNode = $node->getChild($childHandle))
			{
				$node = $nextNode;
			}
			else
			{
				$node = false;
				break;
			}
		}
		
		return $node;
	}


	function getName()
	{
		return $this->Handle;
	}
	
	public function createFile($path, $data = null, $ancestorID = null)
	{
		if(!is_array($path))
			$path = Site::splitPath($path);
			
		$parentCollection = $this;

		// create collections
		while(count($path) > 1)
		{
			$parentCollection = static::getOrCreateCollection(array_shift($path), $parentCollection);
		}

		$fileClass = static::$fileClass;
		$fileClass::create($parentCollection->ID, $path[0], $data, $ancestorID);
	}
	
	public function getLocalizedCollection()
	{
		$siteID = Site::getSiteID();
		
		if($this->SiteID == $siteID)
			return $this;
			
		// discover parent tree
		$tree = array($node = $this);
		while($node->ParentID)
		{
			$tree[] = $node = static::getByID($node->ParentID);
		}
		
		// get localized nodes from root node up
		$localNode = null;
		while($foreignNode = array_pop($tree))
		{
			$parentLocalNode = $localNode;
			$localNode = static::getByHandle($foreignNode->Handle, $parentLocalNode?$parentLocalNode->ID:null);
			
			if(!$localNode)
				$localNode = static::create($foreignNode->Handle, $parentLocalNode);
				
			//Debug::dumpVar($foreignNode, false);
			//Debug::dumpVar($localNode, false);
		}
		
		return $localNode;		
	}
	
    public function createDirectory($handle)
    {
    	// check if deleted record already exists
    	$existing = static::getByHandle($handle, $this->ID, $this->SiteID, true);
    	if($existing)
    	{
    		if($existing->Status == 'Deleted')
	    		$existing->setStatus('Normal');

    		return $existing;
    	}
    	else
    	{
    		return static::createRecord($handle, $this);
    	}
    }
    
    
    // this functions sucks, $root=null will break, caches $root'd results without key
	protected $_fullPath;
	public function getFullPath($root = null)
	{
		if(!isset($this->_fullPath) || $root)
		{
			$path = array();
			$curNode = $this;
			do
			{
				if($curNode->ID == $root->ID)
					return $path;
				
				array_unshift($path, $curNode->Handle);
			}
			while($curNode = $curNode->Parent);
			
			if($this->SiteID != Site::getSiteID())
				array_unshift($path, '_parent');
				
			$this->_fullPath = $path;
		}
		
		return $this->_fullPath;
    }
    
    static public function getAllRootCollections($siteID = null)
    {
    	$collections = array();
    	$results = DB::query(
    		'SELECT * FROM `%s` WHERE SiteID = %u AND ParentID IS NULL AND Status = "Normal" ORDER BY Handle'
			,array(
				static::$tableName
				,$siteID ? $siteID : Site::getSiteID()
			)
    	);
    	while($collectionRecord = $results->fetch_assoc())
    	{
    		$collections[] = new static($collectionRecord['Handle'], $collection);
    	}
    	
    	return $collections;
    }
    
    static public function getOrCreateRootCollection($handle, $siteID = null)
    {
    	return static::getOrCreateCollection($handle, null, $siteID);
    }
    
    static public function getOrCreateCollection($handle, $parentCollection = null, $siteID = null)
    {
    	if(!$siteID && $parentCollection)
    		$siteID = $parentCollection->SiteID;
    
    	//printf("looking for %s in %u->%s<br>", $handle, $parentCollection ? $parentCollection->ID : null, $siteID);
    	if(!$collection = static::getByHandle($handle, $parentCollection ? $parentCollection->ID : null, $siteID))
    	{
    		//printf("creating %s in %u->%s<br>", $handle, $parentCollection ? $parentCollection->ID : null, $siteID);
    		static::createRecord($handle, $parentCollection, $siteID);
    		//printf("getting after creating %s in %u->%s<br>", $handle, $parentCollection ? $parentCollection->ID : null, $siteID);
    		$collection = static::getByHandle($handle, $parentCollection ? $parentCollection->ID : null, $siteID);
    	}
    
    	return $collection;
    }
    
    static public function getCollection($handle, $parentCollection = null, $siteID = null)
    {
    
    }
    
    static public function create($handle, $parentCollection = null, $siteID = null)
    {
    	$collectionID = static::createRecord($handle, $parentCollection, $siteID);
    	return static::getByID($collectionID);
    }
    
    static public function createRecord($handle, $parentCollection = null, $siteID = null)
    {
    	// check for existing deleted node
    	$existingRecord = DB::oneRecord(
    		'SELECT * FROM `%s` WHERE SiteID = %u AND ParentID = %s AND Handle = "%s"'
    		,array(
				static::$tableName
				,$parentCollection ? $parentCollection->SiteID : ($siteID ? $siteID : Site::getSiteID())
				,$parentCollection ? $parentCollection->ID : 'NULL'
				,DB::escape($handle)
    		)
    	);
    	
    	if($existingRecord)
    	{
    		DB::nonQuery(
    			'UPDATE `%s` SET Status = "Normal" WHERE ID = %u'
    			,array(
    				static::$tableName
    				,$existingRecord['ID']
    			)
    		);
    		
    		return $existingRecord['ID'];
    	}
    
    	DB::nonQuery('LOCK TABLES '.static::$tableName.' WRITE');
    
		// determine new node's position
		$left = $parentCollection ? $parentCollection->PosRight : DB::oneValue('SELECT IFNULL(MAX(`PosRight`)+1,1) FROM `%s`', static::$tableName);
		$right = $left + 1;
		
		if($parentCollection)
		{
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
		DB::nonQuery('INSERT INTO `%s` SET SiteID = %u, Handle = "%s", CreatorID = %u, ParentID = %s, PosLeft = %u, PosRight = %u', array(
			static::$tableName
			,$parentCollection ? $parentCollection->SiteID : ($siteID ? $siteID : Site::getSiteID())
			,DB::escape($handle)
			,$GLOBALS['Session']->PersonID
			,$parentCollection ? $parentCollection->ID : 'NULL'
			,$left
			,$right
		));
		
    	//DB::nonQuery('COMMIT');
    	DB::nonQuery('UNLOCK TABLES');

		return DB::insertID();
    }

    public function setName($handle)
    {
		// updating existing record only if file is empty, by the same author, and has no ancestor
		DB::nonQuery('UPDATE `%s` SET Handle = "%s" WHERE ID = %u', array(
			static::$tableName
			,DB::escape($handle)
			,$this->ID
		));
    }
    
    public function setStatus($status)
    {
		// updating existing record only if file is empty, by the same author, and has no ancestor
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
    	// mark collection and all subcollections as deleted

    	DB::nonQuery('UPDATE `%s` SET Status = "Deleted" WHERE PosLeft BETWEEN %u AND %u', array(
    		static::$tableName
    		,$this->PosLeft
    		,$this->PosRight
    	));
    	
    	// TODO: mark files and all subfiles as deleted
    	SiteFile::deleteTree($this);
    }
    
    function getRealPath() {
		return null;
	}

	public function getData()
	{
		$data = $this->_record;
		$data['Class'] = $this->Class;
		$data['FullPath'] = $this->FullPath;
		return $data;
	}
}
