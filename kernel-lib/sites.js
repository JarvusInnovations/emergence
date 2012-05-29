var _ = require('underscore')
	,util = require('util')
	,fs = require('fs')
	,path = require('path')
	,util = require('util')
	,events = require('events');
	

exports.createSites = function(options) {
	return new exports.sites(options);
};

exports.sites = function(options) {
	var me = this;
	
	// call events constructor
	events.EventEmitter.call(me);

	// initialize options and apply defaults
	me.options = options || {};
	me.options.sitesDir = me.options.sitesDir || '/emergence/sites';
	me.options.dataUID = me.options.dataUID || 65534;
	me.options.dataGID = me.options.dataGID || 65534;
	me.options.dataMode = me.options.dataMode || 0775;
	
	// create required directories
	if(!fs.existsSync(me.options.sitesDir))
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
		
		try
		{
			var cfgResult = me.writeSiteConfig(siteData)
				,siteData = cfgResult.site;
			
			if(cfgResult.isNew)
			{
				me.emit('siteCreated', siteData);
				response.writeHead(201, {'Content-Type':'application/json','Location': '/'+request.path[0]+'/'+siteData.handle});
			}
			else
				response.writeHead(200, {'Content-Type':'application/json'});
	
			response.end(JSON.stringify({success: true, data: siteData}));
		}
		catch(error)
		{
			response.writeHead(400, {'Content-Type':'application/json'});
			response.end(JSON.stringify({success: false, error: error}));
		}
		
		return true;
	}

	return false;
};


exports.sites.prototype.writeSiteConfig = function(siteData) {
	var me = this;

	// validate mandatory fields
	if(!siteData.primary_hostname)
	{
		throw 'primary_hostname required';
	}
	
	// apply defaults
	if(!siteData.handle)
		siteData.handle = request.path[1] || siteData.primary_hostname;
	
	if(!siteData.label)
		siteData.label = null;
		
	// generate inheritance key
	if(!siteData.inheritance_key)
		siteData.inheritance_key = me.generatePassword(16);
		
	// parent hostname
	if(!siteData.parent_hostname)
		siteData.parent_hostname = null;
		
	// hostnames
	if(siteData.hostnames && _.isString(siteData.hostnames))
		siteData.hostnames = siteData.hostnames.split(/\s*[\s,;]\s*/);
		
	if(!_.isArray(siteData.hostnames))
		siteData.hostnames = [];

	// create site directory
	var siteDir = me.options.sitesDir+'/'+siteData.handle
		,dataDir = siteDir + '/data';
		
	if(!fs.existsSync(siteDir))
	{
		console.log('sites: creating site directory '+siteDir);
		fs.mkdirSync(siteDir, 0775);
	}

	if(!fs.existsSync(dataDir))
	{
		fs.mkdirSync(dataDir, me.options.dataMode);
		fs.chownSync(dataDir, me.options.dataUID, me.options.dataGID);
	}
		
	// write site config to file
	this.sites[siteData.handle] = siteData;
	var filename = siteDir+'/site.json';
	var isNew = !fs.existsSync(filename);
	var createUser = siteData.create_user;
	if(createUser)
		delete siteData.create_user;
		
	fs.writeFileSync(filename, JSON.stringify(siteData));

	if(createUser)
		siteData.create_user = createUser;
		
	return {site: siteData, isNew: isNew};
};

exports.sites.prototype.updateSiteConfig = function(handle, changes) {
	var me = this
		,siteDir = me.options.sitesDir+'/'+handle
		,filename = siteDir+'/site.json';

	_.extend(this.sites[handle], changes);
	fs.writeFileSync(filename, JSON.stringify(this.sites[handle]));
};


exports.generatePassword = exports.sites.prototype.generatePassword = function(length) {
	length = length || 16;
	
	var pass = ''
		,chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';

	for(var x = 0; x < length; x++)
	{
		pass += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	
	return pass;
}
