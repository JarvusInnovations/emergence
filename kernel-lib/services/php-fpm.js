var _ = require('underscore')
	,fs = require('fs')
	,path = require('path')
	,util = require('util')
	,spawn = require('child_process').spawn;
	
exports.createService = function(name, controller, options) {
	return new exports.phpFpm(name, controller, options);
};

exports.phpFpm = function(name, controller, options) {
	var me = this;
	
	// call parent constructor
	exports.phpFpm.super_.apply(me, arguments);
	
	// default options
	me.options.configPath = me.options.configPath || controller.options.configDir + '/php-fpm.conf';
	me.options.execPath = me.options.execPath || '/usr/bin/php-fpm';
	me.options.bindHost = me.options.bindHost || '127.0.0.1';
	me.options.bindPort = me.options.bindPort || 9000;
	me.options.runDir = me.options.runDir || controller.options.runDir + '/php-fpm';
	me.options.logsDir = me.options.logsDir || controller.options.logsDir + '/php-fpm';
	me.options.pidPath = me.options.pidPath || me.options.runDir + '/php-fpm.pid';
	me.options.errorLogPath = me.options.errorLogPath || me.options.logsDir + '/errors.log';
	
	// create required directories
	if(!fs.existsSync(me.options.runDir))
		fs.mkdirSync(me.options.runDir, 0775);
	
	if(!fs.existsSync(me.options.logsDir))
		fs.mkdirSync(me.options.logsDir, 0775);
	
	// check for existing master process
	if(fs.existsSync(me.options.pidPath))
	{
		me.pid = parseInt(fs.readFileSync(me.options.pidPath));
		console.log(me.name+': found existing PID: '+me.pid);
		me.status = 'online';
	}

}
util.inherits(exports.phpFpm, require('./abstract.js').AbstractService);



exports.phpFpm.prototype.start = function() {
	var me = this;
	
	console.log(me.name+': spawning daemon: '+me.options.execPath);

	if(me.pid)
	{
		console.log(me.name+': already running with PID '+me.pid);
		return false;
	}
	
	this.writeConfig();
	
	me.proc = spawn(me.options.execPath, ['--fpm-config', me.options.configPath]);

	me.proc.on('exit', function (code) {
	
		if (code !== 0)
		{
			me.status = 'offline';
			me.exitCode = code;
			console.log(me.name+': exited with code: '+code);
		}
		
		// look for pid
		if(fs.existsSync(me.options.pidPath))
		{
			me.pid = parseInt(fs.readFileSync(me.options.pidPath));
			console.log(me.name+': found new PID: '+me.pid);
			me.status = 'online';
		}
		else
		{
			console.log(me.name+': failed to find pid after launching');
			me.status = 'unknown';
			me.pid = null;
		}
	});
	
	me.proc.stdout.on('data', function (data) {
		console.log(me.name+': stdout:\n\t' + data.toString().replace(/\n/g,'\n\t'));
	});
	
	me.proc.stderr.on('data', function (data) {
		console.log(me.name+': stderr:\n\t' + data.toString().replace(/\n/g,'\n\t'));
		
		if (/^execvp\(\)/.test(data)) {
			console.log('Failed to start child process.');
			me.status = 'offline';
		}
  	});
	
	this.status = 'online';
	return true;
}


exports.phpFpm.prototype.stop = function() {
	var me = this;

	if(!me.pid)
		return false;
		
	try
	{
		process.kill(me.pid, 'SIGQUIT');
	}
	catch(error)
	{
		console.log(me.name+': failed to stop process: '+error);
		return false;
	}
	
	me.status = 'offline';
	me.pid = null;
	return true;
}


exports.phpFpm.prototype.restart = function() {
	var me = this;

	if(!me.pid)
		return false;
		
	this.writeConfig();

	try
	{
		process.kill(me.pid, 'SIGUSR2');
	}
	catch(error)
	{
		console.log(me.name+': failed to restart process: '+error);
		return false;
	}
	
	console.log(me.name+': reloaded config for process '+me.pid);
	
	return true;
}


exports.phpFpm.prototype.writeConfig = function() {
	fs.writeFileSync(this.options.configPath, this.makeConfig());
};

exports.phpFpm.prototype.makeConfig = function() {
	var me = this
		,c = '';

	c += '[global]\n';
	c += 'pid = '+me.options.pidPath+'\n';
	c += 'error_log = '+me.options.errorLogPath+'\n';
	c += '[www]\n';
	c += 'user = nobody\n';
	c += 'group = nobody\n';
	c += 'listen = '+me.options.bindHost+':'+me.options.bindPort+'\n';
	c += 'pm = dynamic\n';
	c += 'pm.max_children = 5\n';
	c += 'pm.start_servers = 2\n';
	c += 'pm.min_spare_servers = 1\n';
	c += 'pm.max_spare_servers = 3\n';
	
	return c;
};
