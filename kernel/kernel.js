// requirements
var _ = require('underscore')
	,util = require('util')
	,url = require('url');


// load core modules
var eSites = require('./lib/sites.js').createSites();

var eServices = require('./lib/services.js').createServices({
	services: {
		web: {
			type: 'nginx'
			,bindHost: '199.36.31.172'
		}
		,sql: 'mysql'
	}
	,sites: eSites
});

var eServer = require('./lib/server.js').createServer({
	host: '199.36.31.172'
	,paths: {
		sites: eSites
		,services: eServices
	}
});
	
	
// start server
eServer.start();
console.log('Server running at http://127.0.0.1:1337');
