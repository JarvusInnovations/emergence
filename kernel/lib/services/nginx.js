var _ = require('underscore')
	,fs = require('fs')
	,path = require('path')
	,util = require('util')
	,spawn = require('child_process').spawn;
	
exports.createService = function(name, controller, options) {
	return new exports.nginx(name, controller, options);
};

exports.nginx = function(name, controller, options) {
	var me = this;
	
	// call parent constructor
	exports.nginx.super_.apply(me, arguments);
	
	// default options
	me.options.bootstrapDir = me.options.bootstrapDir || '/emergence/bootstrapper';
	me.options.configPath = me.options.configPath || controller.options.configDir + '/nginx.conf';
	me.options.execPath = me.options.execPath || '/usr/sbin/nginx';
	me.options.bindHost = me.options.bindHost || '0.0.0.0';
	me.options.bindPort = me.options.bindPort || 80;
	me.options.runDir = me.options.runDir || controller.options.runDir + '/nginx';
	me.options.pidPath = me.options.pidPath || me.options.runDir + '/nginx.pid';
	
	// create required directories
	if(!path.existsSync(me.options.runDir))
		fs.mkdirSync(me.options.runDir, 0775);
	
	// check for existing master process
	if(path.existsSync(me.options.pidPath))
	{
		me.pid = parseInt(fs.readFileSync(me.options.pidPath));
		console.log(me.name+': found existing PID: '+me.pid);
		me.status = 'online';
	}
	
}
util.inherits(exports.nginx, require('./abstract.js').AbstractService);



exports.nginx.prototype.start = function() {
	var me = this;
	
	console.log(me.name+': spawning nginx: '+me.options.execPath);

	if(me.pid)
	{
		console.log(me.name+': nginx already runnig with PID '+me.pid);
		return false;
	}
	
	this.writeConfig();
	
	me.proc = spawn(me.options.execPath, ['-c', me.options.configPath]);

	me.proc.on('exit', function (code) {
	
		if (code !== 0)
		{
			me.status = 'offline';
			me.exitCode = code;
			console.log(me.name+': exited with code: '+code);
		}
		
		// look for pid
		if(path.existsSync(me.options.pidPath))
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


exports.nginx.prototype.stop = function() {
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


exports.nginx.prototype.writeConfig = function() {
	fs.writeFileSync(this.options.configPath, this.makeConfig());
};

exports.nginx.prototype.makeConfig = function() {
	var me = this
		,c = '';
		
	c += 'user nginx nginx;\n';
	c += 'worker_processes 1;\n';
	c += 'pid '+me.options.pidPath+';\n';
	c += 'error_log /var/log/nginx/error_log info;\n';

	c += 'events {\n';
	c += '	worker_connections 1024;\n';
	c += '	use epoll;\n';
	c += '}\n';

	c += 'http {\n';
	c += '	include /etc/nginx/mime.types;\n';
	c += '	default_type application/octet-stream;\n';

	c += '	log_format main\n';
	c += '		\'$host $remote_addr - $remote_user [$time_local] \'\n';
	c += '		\'"$request" $status $bytes_sent \'\n';
	c += '		\'"$http_referer" "$http_user_agent" \'\n';
	c += '		\'"$gzip_ratio"\';\n';

	c += '	client_header_timeout 10m;\n';
	c += '	client_body_timeout 10m;\n';
	c += '	send_timeout 10m;\n';

	c += '	connection_pool_size 256;\n';
	c += '	client_header_buffer_size 1k;\n';
	c += '	large_client_header_buffers 4 2k;\n';
	c += '	request_pool_size 4k;\n';

	c += '	gzip on;\n';
	c += '	gzip_min_length 1100;\n';
	c += '	gzip_buffers 4 8k;\n';
	c += '	gzip_types text/plain;\n';

	c += '	output_buffers 1 32k;\n';
	c += '	postpone_output 1460;\n';

	c += '	sendfile on;\n';
	c += '	tcp_nopush on;\n';
	c += '	tcp_nodelay on;\n';

	c += '	keepalive_timeout 75 20;\n';

	c += '	ignore_invalid_headers on;\n';

	c += '	index index.php;\n';

/*

	c += '	server {\n';
	c += '		server_name _;\n';
	c += '		access_log /emergence/logs/access.log main;\n';
	c += '		error_log /emergence/logs/error.log info;\n';	
	c += '	}\n';
*/

	_.each(me.controller.sites.sites, function(site, handle) {
	
		// process hostnames
		var hostnames = site.hostnames.slice();
		if(_.indexOf(hostnames, site.primary_hostname) == -1)
			hostnames.unshift(site.primary_hostname);
			
		// process directories
		var siteDir = me.controller.sites.options.sitesDir+'/'+handle
			,logsDir = siteDir+'/logs';
			
		if(!path.existsSync(logsDir))
			fs.mkdirSync(logsDir, 0775);
	
		// append config
		c += '	server {\n';
		c += '		listen '+me.options.bindHost+':'+me.options.bindPort+';\n';
		c += '		server_name '+hostnames.join(' ')+';\n';
		c += '		access_log '+logsDir+'/access.log main;\n';
		c += '		error_log '+logsDir+'/error.log info;\n';
	
		c += '		location / {\n';
		c += '			root /emergence/root;\n';
		c += '			index index.php;\n';
		c += '			rewrite ^(.+)$ /index.php last;\n';
		c += '		}\n';
	
		c += '		location ~ ^/index.php {\n';
		c += '			include /etc/nginx/fastcgi_params;\n';
		c += '			fastcgi_pass 127.0.0.1:9000;\n';
		c += '			fastcgi_param PATH_INFO $fastcgi_script_name;\n';
		c += '			fastcgi_param SITE_ROOT '+siteDir+';\n';
		c += '			fastcgi_param SCRIPT_FILENAME '+me.options.bootstrapDir+'/root$fastcgi_script_name;\n';
		c += '			fastcgi_param PHP_VALUE	"auto_prepend_file='+me.options.bootstrapDir+'/bootstrap.php\n';
		c += '						 include_path='+me.options.bootstrapDir+'/lib:'+siteDir+'";\n';
		c += '			fastcgi_index index.php;\n';
		c += '		}\n';
		c += '	}\n';
	});
	
	c += '}\n';

	return c;
};