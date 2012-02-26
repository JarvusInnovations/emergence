/*
 * @package jsDAV
 * @subpackage DAV
 * @copyright Copyright (C) 2010 Mike de Boer. All rights reserved.
 * @author Mike de Boer <mike AT ajax DOT org>
 * @license http://github.com/mikedeboer/jsDAV/blob/master/LICENSE MIT License
 */

var jsDAV_Tree	= require("jsDAV/lib/DAV/tree").jsDAV_Tree
	,e_SiteDirectory	= require("./e_SiteDirectory").e_SiteDirectory
	,e_SiteFile			= require("./e_SiteFile").e_SiteFile

	,Fs					= require("fs")
	,Async				= require("jsDAV/support/async.js/lib/async/index")
	,Util				= require("jsDAV/lib/DAV/util")
	,Exc				= require("jsDAV/lib/DAV/exceptions");

/**
 * ObjectTree class
 *
 * This implementation of the Tree class makes use of the INode, IFile and ICollection API's
 */
function e_SiteTree(config) {
    this.config = config;
    this.config.currentDir = Fs.realpathSync(this.config.currentDir);
    this.config.objectsDir = Fs.realpathSync(this.config.objectsDir);
}

exports.e_SiteTree = e_SiteTree;

(function() {
    /**
     * Returns a new node for the given path
     *
     * @param string path
     * @return void
     */
    this.getNodeForPath = function(path, cbfstree) {
        var realPath = this.getRealPath(path)
        	,self = this;
        Fs.stat(realPath, function(err, stat) {
            if (!Util.empty(err))
                return cbfstree(new Exc.jsDAV_Exception_FileNotFound("File at location " + realPath + " not found"));
            cbfstree(null, stat.isDirectory()
                ? new e_SiteDirectory(realPath, self.config)
                : new e_SiteFile(realPath, self.config))
        });
    };

    /**
     * Returns the real filesystem path for a webdav url.
     *
     * @param string publicPath
     * @return string
     */
    this.getRealPath = function(publicPath) {
        return Util.rtrim(this.config.currentDir, "/") + "/" + Util.trim(publicPath, "/");
    };

    /**
     * Copies a file or directory.
     *
     * This method must work recursively and delete the destination
     * if it exists
     *
     * @param string source
     * @param string destination
     * @return void
     */
    this.copy = function(source, destination, cbfscopy) {
        source      = this.getRealPath(source);
        destination = this.getRealPath(destination);
        this.realCopy(source, destination, cbfscopy);
    };

    /**
     * Used by self::copy
     *
     * @param string source
     * @param string destination
     * @return void
     */
    this.realCopy = function(source, destination, cbfsrcopy) {
        Fs.stat(source, function(err, stat) {
            if (!Util.empty(err))
                return cbfsrcopy(err);
            if (stat.isFile())
                Async.copyfile(source, destination, true, cbfsrcopy);
            else
                Async.copytree(source, destination, cbfsrcopy);
        });
    };

    /**
     * Moves a file or directory recursively.
     *
     * If the destination exists, delete it first.
     *
     * @param string source
     * @param string destination
     * @return void
     */
    this.move = function(source, destination, cbfsmove) {
        source      = this.getRealPath(source);
        destination = this.getRealPath(destination);
        Fs.rename(source, destination, cbfsmove);
    };
}).call(e_SiteTree.prototype = new jsDAV_Tree());
