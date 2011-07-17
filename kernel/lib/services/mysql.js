var _ = require('underscore')
	,fs = require('fs')
	,path = require('path')
	,util = require('util')
	,spawn = require('child_process').spawn;
	
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
	me.options.pidPath = me.options.pidPath || controller.options.runDir + '/mysqld/mysqld.pid';
	me.options.socketPath = me.options.socketPath || controller.options.runDir + '/mysqld/mysqld.sock';
	me.options.dataDir = me.options.dataDir || '/var/lib/mysql';
	me.options.errorLogPath = me.options.errorLogPath || controller.options.logsDir + '/mysqld.err';
	
	// initialize state
	if(path.existsSync(me.options.pidPath))
	{
		me.pid = parseInt(fs.readFileSync(me.options.pidPath));
		me.status = 'online';
		console.log(me.name+' found existing PID: '+me.pid);
	}
};
util.inherits(exports.mysql, require('./abstract.js').AbstractService);



exports.mysql.prototype.start = function() {
	var me = this;
	
	console.log(me.name+' spawning mysql: '+me.options.execPath);

	if(me.pid)
	{
		console.log(me.name+' mysql already runnig with PID '+me.pid);
		return false;
	}
	
	this.writeConfig();
	
	me.proc = spawn(me.options.execPath, ['--defaults-file='+me.options.configPath]);
	me.pid = me.proc.pid;
	me.status = 'online';
	
	console.log('spawned daem with pid '+me.pid);

	me.proc.on('exit', function (code) {
	
		if (code !== 0)
		{
			me.status = 'offline';
			me.exitCode = code;
			console.log(me.name+' exited with code: '+code);
		}
	});
	
	me.proc.stdout.on('data', function (data) {
		console.log(me.name+' stdout: ' + data);
	});
	
	me.proc.stderr.on('data', function (data) {
		console.log(me.name+' stderr: ' + data);
		
		if (/^execvp\(\)/.test(data)) {
			console.log('Failed to start child process.');
			me.status = 'offline';
		}
  	});
	
	return true;
}


exports.mysql.prototype.stop = function() {
	var me = this;

	if(!me.pid)
		return false;
		
	try
	{
		console.log('sending sigterm to '+me.pid);
		process.kill(me.pid, 'SIGTERM');
	}
	catch(error)
	{
		console.log(me.name+' failed to stop process: '+error);
		return false;
	}
	
	me.status = 'offline';
	me.pid = null;
	return true;
}


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