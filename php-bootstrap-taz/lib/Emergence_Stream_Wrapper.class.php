<?php
class Emergence_Stream_Wrapper {
    var $position;
    var $varname;
    
    var $activeNode;
    public $file;
    
    public function __contruct() {
        $this->fp =0;
        $this->dh =0;   
    }
    
    public static function getByEmergenceVFS($path) {
                                      
        $vfsPath = static::get_virtual_path(str_replace('vfs://','',$path));
        
        $templateNode = false;
        
        $streamPath = Site::splitPath($vfsPath);
        if(!empty($streamPath[0]))
        {
            $topFolder = array_shift($streamPath);
            $localRoot = Site::getRootCollection($topFolder);
            $searchStack = array_filter($streamPath);   
            
            while(true)
            {
                $searchPath = $searchStack;
                
                if($templateNode = $localRoot->resolvePath($searchPath))
                {
                    break;    
                }
                
                if($templateNode = Emergence::resolveFileFromParent($topFolder, $searchPath))
                {
                    break;   
                }
                
                
                if(count($searchStack)) {
                    array_pop($searchStack);   
                }
                else {
                    break;   
                }
            }    
            
        }

        return $templateNode;    
    }
    
    public function stream_open (  $path ,  $mode ,  $options ,  &$opened_path )
    {
    	//print("stream_open($path, $mode, $options)<br>");
    	$this->position = 0;
    	$this->fp = false;
    	
        if(static::is_real_path($path))
        {
			$opened_path = $path;
			$this->fp = static::get_real_handle($path);
        }
        elseif($this->activeNode = static::getByEmergenceVFS($path))
        {
			$opened_path = $this->activeNode->getRealPath();
			$this->fp = static::get_real_handle($opened_path);
        }

		return $this->fp !== false;
    }
   
   public function stream_read($bytes) {
       return fread($this->fp,$bytes);
   }
    
    public function stream_stat() {
        clearstatcache();  
        return fstat($this->fp);
    }
    
    public function stream_eof() {
        return feof($this->fp);   
    }
    
    public function url_stat($path, $flags) {
        clearstatcache();
        
        if(static::is_real_path($path))
        {
        	return fstat(static::get_real_handle($path));
        }
        elseif($this->activeNode = static::getByEmergenceVFS($path))
        {
	        $mode = 0;
	        
        	if(is_a($this->activeNode, 'SiteFile'))
        	{
	        	$timestamp = $this->activeNode->Timestamp;
	        	$size = $this->activeNode->Size;
	        	$mode |= 0100000;
	        }
	        else
	        {
	        	$timestamp = time();
	        	$size = 4096;
	        	$mode |= 0040000;
	        }
        
			return array(
				'dev' => 0
				,'ino' => 0
				,'mode' => $mode
				,'nlink' => 0
				,'uid' => 0
				,'gid' => 0
				,'rdev' => 0
				,'size' => $size
				,'atime' => 0
				,'mtime' => $timestamp
				,'ctime' => $timestamp
				,'blksize' => -1
				,'blocks' => -1
			);
		}
        
    }
    
    
    static public function is_real_path($path)
    {
    	return (strpos($path, Site::$rootPath) === 0);
    }
    
    static public function get_real_handle($path)
    {
    	//print("get_real_handle($path)<br>");
    	
    	if(!$path)	debug_print_backtrace();
		stream_wrapper_restore('file');
		
        $fp = @fopen($path, 'r');
        
        stream_wrapper_unregister('file');
        stream_wrapper_register('file', __CLASS__);
        
        return $fp;
    }
    
    static public function get_virtual_path($path)
    {
    	if($path[0] == '/')
    	{
    		return substr($path, 1);
    	}
    	else
    	{
    		return 'site-root/'.$path;
    	}
    }
}
