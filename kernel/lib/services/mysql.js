var _ = require('underscore')
	,fs = require('fs')
	,path = require('path')
	,util = require('util')
	,spawn = require('child_process').spawn
	,exec = require('child_process').exec
	,MysqlClient = require('mysql').Client;
	
exports.createService = function(name, controller, options) {
	return new exports.mysql(name, controller, options);
};

exports.mysql = function(name, controller, options) {
	var me = this;
	
	// call parent constructor
	exports.mysql.super_.apply(me, arguments);
	
	// default options
	me.options.configPath = me.options.configPath || controller.options.configDir + '/my.cnf';
	me.options.execPath = me.options.execPath || '/usr/sbin/mysqld';
	me.options.bindHost = me.options.bindHost || false;
	me.options.runDir = me.options.runDir || controller.options.runDir + '/mysqld';
	me.options.pidPath = me.options.pidPath || me.options.runDir + '/mysqld.pid';
	me.options.socketPath = me.options.socketPath || me.options.runDir + '/mysqld.sock';
	me.options.dataDir = me.options.dataDir || '/var/lib/mysql';
	me.options.errorLogPath = me.options.errorLogPath || controller.options.logsDir + '/mysqld.err';
	me.options.managerUser = me.options.managerUser || 'eman';
	me.options.managerPassword = me.options.managerPassword || '';
	
	// create required directories
	if(!path.existsSync(me.options.runDir))
	{
		fs.mkdirSync(me.options.runDir, 0775);
		exec('chown mysql:mysql '+me.options.runDir);
	}
	
	// instantiate MySQL client
	me.client = new MysqlClient();
	//me.client.database = 'information_schema';
	me.client.user = me.options.managerUser;
	me.client.password = me.options.managerPassword;
	me.client.port = me.options.socketPath;

	// check for existing mysqld process
	if(path.existsSync(me.options.pidPath))
	{
		me.pid = parseInt(fs.readFileSync(me.options.pidPath));
		me.status = 'online';
		console.log(me.name+': found existing PID: '+me.pid);
		
		this.connectClient();
	}
	
	// listen for site creation
	controller.sites.on('siteCreated', _.bind(me.onSiteCreated, me));
};
util.inherits(exports.mysql, require('./abstract.js').AbstractService);



exports.mysql.prototype.start = function() {
	var me = this;
	
	console.log(me.name+': spawning mysql: '+me.options.execPath);

	if(me.pid)
	{
		console.log(me.name+': mysql already runnig with PID '+me.pid);
		return false;
	}
	
	// write configuration file
	this.writeConfig();
	
	// spawn process
	me.proc = spawn(me.options.execPath, ['--defaults-file='+me.options.configPath]);
	me.pid = me.proc.pid;
	me.status = 'online';
	
	console.log(me.name+': spawned mysqld with pid '+me.pid);
	
	// add listeners to process
	me.proc.on('exit', function (code) {
	
		if (code !== 0)
		{
			me.status = 'offline';
			me.exitCode = code;
			console.log(me.name+': exited with code: '+code);
		}
	});
	
	me.proc.stdout.on('data', function (data) {
		console.log(me.name+': stdout:\n\t' + data.toString().replace(/\n/g,'\n\t'));
	});
	
	me.proc.stderr.on('data', function (data) {
		console.log(me.name+': stderr:\n\t' + data.toString().replace(/\n/g,'\n\t'));
		
		if (/^execvp\(\)/.test(data))
		{
			console.log('Failed to start child process.');
			me.status = 'offline';
		}
		
		if(/ready for connections/.test(data))
		{
			// connect to server with MySQL client
			me.connectClient();
		}
  	});
	
	return true;
}


exports.mysql.prototype.stop = function() {
	var me = this;

	if(!me.pid)
		return false;
		
	// disconnect client
	if(me.client && me.client.connected)
	{
		me.client.end();
		console.log(me.name+': mysql client disconnected');
	}
		
	try
	{
		console.log(me.name+': sending sigterm to '+me.pid);
		process.kill(me.pid, 'SIGTERM');
	}
	catch(error)
	{
		console.log(me.name+': failed to stop process: '+error);
		return false;
	}
	
	me.status = 'offline';
	me.pid = null;
	return true;
};

exports.mysql.prototype.restart = function() {
	var me = this;
	
	if(!me.stop())
		return false;
	
	// wait for pid to disappear before attempting start
	process.stdout.write(me.name+': waiting for shutdown');
	while(path.existsSync(me.options.pidPath))
	{
		process.stdout.write('.');
		var now = new Date().getTime();
		while(new Date().getTime() < now + 500)
		{
			// do nothing
		}
	}
	process.stdout.write('\n');
	
	return me.start();
};

exports.mysql.prototype.writeConfig = function() {
	fs.writeFileSync(this.options.configPath, this.makeConfig());
};

exports.mysql.prototype.makeConfig = function() {
	var me = this
		,c = '';
		
	c += '[mysqld]\n';
	c += 'character-set-server		= utf8\n';
	c += 'user 						= mysql\n';
	c += 'port 						= 3306\n';
	c += 'socket 					= '+me.options.socketPath+'\n';
	c += 'pid-file 					= '+me.options.pidPath+'\n';
	c += 'log-error 				= '+me.options.errorLogPath+'\n';
	c += 'basedir 					= /usr\n';
	c += 'datadir 					= '+me.options.dataDir+'\n';
	c += 'skip-external-locking\n';
	c += 'key_buffer 				= 16M\n';
	c += 'max_allowed_packet 		= 1M\n';
	c += 'table_cache 				= 64\n';
	c += 'sort_buffer_size 			= 512K\n';
	c += 'net_buffer_length 		= 8K\n';
	c += 'read_buffer_size 			= 256K\n';
	c += 'read_rnd_buffer_size 		= 512K\n';
	c += 'myisam_sort_buffer_size 	= 8M\n';
	c += 'language 					= /usr/share/mysql/english\n';

	if(me.options.bindHost)
		c += 'bind-address = '+me.options.bindHost+'\n';
	else
		c += 'skip-networking\n';

	c += 'log-bin					= mysqld-bin\n'
	c += 'server-id 				= 1\n'

	c += 'tmpdir 					= /tmp/\n'
	
	c += 'innodb_buffer_pool_size = 16M\n'
	c += 'innodb_additional_mem_pool_size = 2M\n'
	c += 'innodb_data_file_path = ibdata1:10M:autoextend:max:128M\n'
	c += 'innodb_log_file_size = 5M\n'
	c += 'innodb_log_buffer_size = 8M\n'
	c += 'innodb_log_files_in_group=2\n'
	c += 'innodb_flush_log_at_trx_commit = 1\n'
	c += 'innodb_lock_wait_timeout = 50\n'
	c += 'innodb_file_per_table\n'

	return c;
};

exports.mysql.prototype.connectClient = function() {
	var me = this;
	
	me.client.connect(function(error, results) {
		if(error)
		{
			console.log(me.name+': mysql client FAILED to connect: '+error.message);
			me.status = 'unknown';
			return;
		}
		console.log(me.name+': mysql client connected');
	});
};

exports.mysql.prototype.onSiteCreated = function(siteData) {
	var me = this
		,sql = ''
		,password = me.generatePassword();
	
	console.log(me.name+': creating database `'+siteData.handle+'`');
	
	sql += 'CREATE DATABASE IF NOT EXISTS `'+siteData.handle+'`;';
	sql += 'CREATE USER \''+siteData.handle+'\'@\'localhost\' IDENTIFIED BY \''+password+'\';';
	sql += 'GRANT SELECT, INSERT, UPDATE, DELETE, CREATE ON `'+siteData.handle+'`.* TO \''+siteData.handle+'\'@\'localhost\';';
	sql += 'FLUSH PRIVILEGES;';
	
	me.client.query(sql, function(error, results) {
		if(error)
		{
			console.log(me.name+': failed to setup database `'+siteData.handle+'`: '+error);
			return;
		}
		
		console.log(me.name+': database setup complete');
		
		// generate Site.config.php
		var siteDir = me.controller.sites.options.sitesDir+'/'+siteData.handle
			,configFilename = siteDir+'/Site.config.php'
			,configCode = '';
			
		configCode += '<?php\n\n';
		configCode += 'Site::$databaseSocket = \''+me.options.socketPath+'\';\n';
		configCode += 'Site::$databaseName = \''+siteData.handle+'\';\n';
		configCode += 'Site::$databaseUsername = \''+siteData.handle+'\';\n';
		configCode += 'Site::$databasePassword = \''+password+'\';\n';
			
		fs.writeFileSync(configFilename, configCode);
	});
};


exports.mysql.prototype.generatePassword = function(length) {
	length = length || 16;
	
	var pass = ''
		,chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';

	for(var x = 0; x < length; x++)
	{
		pass += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	
	return pass;
}

exports.mysql.prototype.createSkeletonTables = function(databaseName) {
	var me = this
		,sql = '';

	sql += 'USE `'+databaseName+'`;';
	
	// Table: _e_file_collections
	sql += 'CREATE TABLE `_e_file_collections` (';
	sql += '`ID` int(10) unsigned NOT NULL AUTO_INCREMENT';
	sql += ',`SiteID` int(10) unsigned NOT NULL';
	sql += ',`Handle` varchar(255) NOT NULL';
	sql += ',`Status` enum(\'Normal\',\'Deleted\') NOT NULL DEFAULT \'Normal\'';
	sql += ',`Created` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP';
	sql += ',`CreatorID` int(10) unsigned DEFAULT NULL';
	sql += ',`ParentID` int(10) unsigned DEFAULT NULL';
	sql += ',`PosLeft` int(10) unsigned DEFAULT NULL';
	sql += ',`PosRight` int(10) unsigned DEFAULT NULL';
	sql += ',PRIMARY KEY (`ID`)';
	sql += ',UNIQUE KEY `PosLeft` (`PosLeft`)';
	sql += ',UNIQUE KEY `SiteCollection` (`SiteID`,`ParentID`,`Handle`)';
	sql += ',) ENGINE=MyISAM AUTO_INCREMENT=719 DEFAULT CHARSET=utf8;';
	
	// Table: _e_files
	sql += 'CREATE TABLE `_e_files` (';
	sql += '`ID` int(10) unsigned NOT NULL AUTO_INCREMENT';
	sql += ',`CollectionID` int(10) unsigned NOT NULL';
	sql += ',`Handle` varchar(255) NOT NULL';
	sql += ',`Status` enum(\'Phantom\',\'Normal\',\'Deleted\') NOT NULL DEFAULT \'Phantom\'';
	sql += ',`SHA1` char(40) DEFAULT NULL';
	sql += ',`Size` int(10) unsigned DEFAULT NULL';
	sql += ',`Type` varchar(255) DEFAULT NULL';
	sql += ',`Timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP';
	sql += ',`AuthorID` int(10) unsigned DEFAULT NULL';
	sql += ',`AncestorID` int(10) unsigned DEFAULT NULL';
	sql += ',PRIMARY KEY (`ID`)';
	sql += ',KEY `CollectionID` (`CollectionID`)';
	sql += ',) ENGINE=MyISAM AUTO_INCREMENT=17820 DEFAULT CHARSET=utf8;';


	me.client.query(sql, function(error, results) {
		if(error)
		{
			console.log(me.name+': failed to setup skeleton tables on `'+siteData.handle+'`: '+error);
			return;
		}
		
		console.log(me.name+': skeleton table schema setup');
	});
};