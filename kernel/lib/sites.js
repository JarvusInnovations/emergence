var _ = require('underscore')
	,util = require('util')
	,fs = require('fs')
	,path = require('path')
	,util = require('util')
	,events = require('events');
	
exports.sites = function(options) {
	var me = this;
	
	// call events constructor
	events.EventEmitter.call(me);

	// initialize options and apply defaults
	me.options = options || {};
	me.options.sitesDir = me.options.sitesDir || '/emergence/sites';
	
	// create required directories
	if(!path.existsSync(me.options.sitesDir))
		fs.mkdirSync(me.options.sitesDir, 0775);
	
	// load sites
	console.log('Loading sites from '+me.options.sitesDir+'...');

	me.sites = {};
	_.each(fs.readdirSync(me.options.sitesDir), function(handle) {
		try
		{
			me.sites[handle] = JSON.parse(fs.readFileSync(me.options.sitesDir+'/'+handle+'/site.json'));
			me.sites[handle].handle = handle;
			console.log('-Loaded: '+me.sites[handle].primary_hostname);
		}
		catch(error)
		{
			console.log('-FAILED to load: '+handle);
		}
	});

}
util.inherits(exports.sites, events.EventEmitter);


exports.sites.prototype.handleRequest = function(request, response, server) {
	var me = this;

	if(request.method == 'GET')
	{
		response.writeHead(200, {'Content-Type':'application/json'});
		response.end(JSON.stringify({data: _.values(me.sites)}));
		return true;
	}
	else if(request.method == 'POST')
	{
		var siteData = JSON.parse(request.content);
		
		// apply existing site's properties
		if(request.path[1] && me.sites[request.path[1]])
			_.defaults(siteData, me.sites[request.path[1]]);
		
		// validate mandatory fields
		if(!siteData.primary_hostname)
		{
			response.writeHead(400, {'Content-Type':'application/json'});
			response.end(JSON.stringify({error: 'primary_hostname required'}));
		}
		
		// apply defaults
		if(!siteData.handle)
			siteData.handle = request.path[1] || siteData.primary_hostname;
		
		if(!siteData.label)
			siteData.label = false;
			
		if(!siteData.parent_hostname)
			siteData.parent_hostname = false;

		if(siteData.hostnames && _.isString(siteData.hostnames))
			siteData.hostnames = siteData.hostnames.split(/\s*[\s,;]\s*/);
			
		if(!_.isArray(siteData.hostnames))
			siteData.hostnames = [];
		
		// create site directory
		var siteDir = me.options.sitesDir+'/'+siteData.handle;
		if(!path.existsSync(siteDir))
			fs.mkdirSync(siteDir, 0775);
		
		// write to file
		this.sites[siteData.handle] = siteData;
		var filename = siteDir+'/site.json'
			,isNew = !path.existsSync(filename);
			
		fs.writeFileSync(filename, JSON.stringify(siteData));
		
		if(isNew)
			response.writeHead(201, {'Content-Type':'application/json','Location': '/'+request.path[0]+'/'+siteData.handle});
		else
			response.writeHead(200, {'Content-Type':'application/json'});

		response.end(JSON.stringify({data: siteData}));
		return true;
	}

	return false;
};

exports.createSites = function(options) {
	return new exports.sites(options);
};