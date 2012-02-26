/*
 * @package jsDAV
 * @subpackage DAV
 * @copyright Copyright (C) 2010 Mike de Boer. All rights reserved.
 * @author Mike de Boer <mike AT ajax DOT org>
 * @license http://github.com/mikedeboer/jsDAV/blob/master/LICENSE MIT License
 */

var jsDAV           = require("jsDAV")
    ,e_SiteNode   	= require("./e_SiteNode").e_SiteNode
    ,jsDAV_Directory = require("jsDAV/lib/DAV/directory").jsDAV_Directory
    ,jsDAV_iFile     = require("jsDAV/lib/DAV/iFile").jsDAV_iFile

    ,Fs              = require("fs")
    ,Exc             = require("jsDAV/lib/DAV/exceptions")
    ,Util            = require("jsDAV/lib/DAV/util")
    ,path			= require('path')
    ,crypto			= require('crypto');

function e_SiteFile(path, config) {
    this.path = path;
    this.config = config;
}

exports.e_SiteFile = e_SiteFile;

(function() {
    this.implement(jsDAV_iFile);

    /**
     * Updates the data
     *
     * @param {mixed} data
     * @return void
     */
    this.put = function(data, type, cbfsput) {
    	console.log("writing to "+this.path);
    	//console.log(data.toString('utf8'));
    	
    	var sha1Hasher = crypto.createHash('sha1');
    	sha1Hasher.update(data);
    	var sha1 = sha1Hasher.digest('hex');
    	
    	var dir = this.config.objectsDir+'/'+sha1.substr(0, 2)
    		,objectPath = dir+'/'+sha1.substr(2);
    		
    	console.log('objectPath: '+objectPath);
    	
    	if(!path.existsSync(dir)) Fs.mkdirSync(dir, 0775);
    	
        // set symlink
        if(path.existsSync(this.path))
        {
        	Fs.unlinkSync(this.path);
        }
        Fs.symlinkSync(objectPath, this.path);

    	// write to object file
    	if(!path.existsSync(objectPath))
    	{
	        Fs.writeFile(objectPath, data, type || "utf8", function(err) {
	        	if(err) console.log('failed to write object: '+err.message);
	        	cbfsput(err);
	        });
		}
		else
		{
			console.log('object already exists');
	       	cbfsput();
		}
        
    };

    /**
     * Returns the data
     *
     * @return Buffer
     */
    this.get = function(cbfsfileget) {
        if (this.$buffer)
            return cbfsfileget(null, this.$buffer);
        var _self  = this,
            onRead = function(err, buff) {
                if (err)
                    return cbfsfileget(err);
                // For older versions of node convert the string to a buffer.
                if (typeof buff === "string") {
                    var b = new Buffer(buff.length);
                    b.write(buff, "binary");
                    buff = b;
                }
                // Zero length buffers act funny, use a string
                if (buff.length === 0)
                    buff = "";
                //_self.$buffer = buff;
                cbfsfileget(null, buff);
            };
        
        // Node before 0.1.95 doesn't do buffers for fs.readFile
        if (process.version < "0.1.95" && process.version > "0.1.100") {
            // sys.debug("Warning: Old node version has slower static file loading");
            Fs.readFile(this.path, "binary", onRead);
        }
        else {
            Fs.readFile(this.path, onRead);
        }
    };

    /**
     * Delete the current file
     *
     * @return void
     */
    this["delete"] = function(cbfsfiledel) {
        Fs.unlink(this.path, cbfsfiledel);
    };

    /**
     * Returns the size of the node, in bytes
     *
     * @return int
     */
    this.getSize = function(cbfsgetsize) {
        if (this.$stat)
            return cbfsgetsize(null, this.$stat.size);
        var _self = this;
        return Fs.stat(this.path, function(err, stat) {
            if (err || !stat) {
                return cbfsgetsize(new Exc.jsDAV_Exception_FileNotFound("File at location " 
                    + this.path + " not found"));
            }
            //_self.$stat = stat;
            cbfsgetsize(null, stat.size);
        });
    };

    /**
     * Returns the ETag for a file
     * An ETag is a unique identifier representing the current version of the file.
     * If the file changes, the ETag MUST change.
     * Return null if the ETag can not effectively be determined
     *
     * @return mixed
     */
    this.getETag = function(cbfsgetetag) {
        cbfsgetetag(null, null);
    };

    /**
     * Returns the mime-type for a file
     * If null is returned, we'll assume application/octet-stream
     *
     * @return mixed
     */
    this.getContentType = function(cbfsmime) {
        return cbfsmime(null, Util.mime.type(this.path));
    };
}).call(e_SiteFile.prototype = new e_SiteNode());
