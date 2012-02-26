<?php

class File
{
	static public $magicPath = '/usr/share/misc/magic.mgc';

	static public function getMIMEType($filename)
	{
		// get mime type
		$finfo = finfo_open(FILEINFO_MIME, static::$magicPath);
		
		if(!$finfo || !($mimeInfo = finfo_file($finfo, $filename)) )
		{
			throw new Exception('Unable to load file info');
		}

		finfo_close($finfo);

		// split mime type
		$p = strpos($mimeInfo, ';');
		
		return $p ? substr($mimeInfo, 0, $p) : $mimeInfo;
	}

	static public function getMIMETypeFromContents($fileContents)
	{
		// get mime type
		$finfo = finfo_open(FILEINFO_MIME, static::$magicPath);
		
		if(!$finfo || !($mimeInfo = finfo_buffer($finfo, $fileContents)) )
		{
			throw new Exception('Unable to load file info');
		}

		finfo_close($finfo);

		// split mime type
		$p = strpos($mimeInfo, ';');
		
		return $p ? substr($mimeInfo, 0, $p) : $mimeInfo;
	}

}