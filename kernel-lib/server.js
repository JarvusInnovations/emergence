var http = require('http')
	,util = require('util')
	,fs = require('fs')
	,path = require('path')
	,_ = require('underscore')
	,util = require('util')
	,url = require('url')
	,static = require('node-static')
	,events = require('events');

exports.server = function(paths, config) {
	var me = this
	   ,options = config.server;
	
	// call events constructor
	events.EventEmitter.call(me);

	// initialize options and apply defaults
	me.paths = paths || {};
	me.options = options || {};
	me.options.host = me.options.host || '0.0.0.0';
	me.options.port = me.options.port || 9083;
	me.options.sslKey = me.options.sslKey || null;
	me.options.sslCert = me.options.sslCert || null;
	me.options.staticDir = me.options.staticDir || path.resolve(__dirname, '../kernel-www');
	
	// initialize state
}
util.inherits(exports.server, events.EventEmitter);


exports.server.prototype.start = function() {
	var me = this,
		protocol;

	// create HTTP authentication module
	var http_auth = require('http-auth')({
		authRealm: 'Emergence Node Management'
		,authFile: '/emergence/admins.htpasswd'
	});

	// create static fileserver
	me.fileServer = new static.Server(me.options.staticDir);

	// start control server
	if (me.options.sslKey && me.options.sslCert) {
		require('https').createServer({
			key: fs.readFileSync(me.options.sslKey),
			cert: fs.readFileSync(me.options.sslCert)
		}, _handleRequest).listen(me.options.port, me.options.host);

		protocol = 'https';
	} else {
		require('http').createServer(_handleRequest).listen(me.options.port, me.options.host);

		protocol = 'http';
	}


	function _handleRequest(request, response) {

		http_auth.apply(request, response, function(username) {
			request.content = '';
		
			request.addListener('data', function(chunk) {
				request.content += chunk;
			});
		
			request.addListener('end', function() {
				request.urlInfo = url.parse(request.url)
				request.path = request.urlInfo.pathname.substr(1).split('/');
				console.log(request.method+' '+request.url);

				if(request.path[0] == 'server-config')
				{
					response.writeHead(200, {'Content-Type':'application/json'});
					response.end(JSON.stringify(me.options));
					return;
				}

				if(request.path[0] == 'package-info')
				{
					response.writeHead(200, {'Content-Type':'application/json'});
					response.end(JSON.stringify(require('../package.json')));
					return;
				}

				if(me.paths.hasOwnProperty(request.path[0]))
				{
					var result = me.paths[request.path[0]].handleRequest(request, response, me);
					if(result===false)
					{
						response.writeHead(404);
						response.end();
					}
					else if(result !== true)
					{
						response.writeHead(200, {'Content-Type':'application/json'});
						response.end(JSON.stringify(result));
					}
				}
				else
				{
					me.fileServer.serve(request, response);
				}
			});

		});
		
	}


	console.log('Management server listening on '+protocol+'://'+me.options.host+':'+me.options.port);

};

exports.createServer = function(paths, options) {
	return new exports.server(paths, options);
};
