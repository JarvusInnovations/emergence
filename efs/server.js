var jsDAV = require('jsDAV')
	,e_SiteTree = require('./e_SiteTree').e_SiteTree;

//jsDAV.debugMode = true;

jsDAV.createServer({
	//node: "/emergence/efs/testdir"
	//,locksBackend: new jsDAV_Locks_Backend_FS("/home/alan/var/dossier/locks")
	tree: new e_SiteTree({
		currentDir: 'current'
		,objectsDir: 'objects'
	})
}, 1338, "199.36.31.172");