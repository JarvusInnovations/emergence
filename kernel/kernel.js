// requirements
var _ = require('underscore')
	,util = require('util')
	,url = require('url');


// load emergence modules
eSites = require('./lib/sites.js').createSites();
eServices = require('./lib/services.js').createServices({
	services: {
		web: {
			type: 'nginx'
			,bindHost: '199.36.31.172'
		}
		,sql: 'mysql'
	}
	,sites: eSites
});
//eConfig = require('./kernel-lib/config.js').createConfig();
eServer = require('./lib/server.js').createServer({
	host: '199.36.31.172'
	,paths: {
		sites: eSites
		,services: eServices
	}
});
	
	

// load site configs


eServer.start();
console.log('Server running at http://127.0.0.1:1337');
