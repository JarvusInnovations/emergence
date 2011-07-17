// requirements
var _ = require('underscore')
	,util = require('util')
	,url = require('url')
	,fs = require('fs');

// load kernel configuration
var CONFIG = JSON.parse(fs.readFileSync('kernel.config.json'));

// load core modules
var eSites = require('./lib/sites.js').createSites(CONFIG.sites);
var eServices = require('./lib/services.js').createServices(eSites, CONFIG.services);

// instantiate management server
var eManagementServer = require('./lib/server.js').createServer({
	sites: eSites
	,services: eServices
}, CONFIG.server);
	
	
// start server
eManagementServer.start();
console.log('Server running at http://127.0.0.1:1337');
