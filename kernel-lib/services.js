var _ = require('underscore')
	,util = require('util')
	,fs = require('fs')
	,path = require('path')
	,events = require('events');
	
exports.ServicesController = function(sites, options) {
	var me = this;
	
	me.sites = sites;
		
	// call events constructor
	events.EventEmitter.call(me);

	// initialize options and apply defaults
	me.options = options || {};
	me.options.plugins = me.options.plugins || {};
	me.options.servicesDir = me.options.servicesDir || '/emergence/services';
	me.options.logsDir = me.options.logsDir || me.options.servicesDir+'/logs';
	me.options.configDir = me.options.configDir || me.options.servicesDir+'/etc';
	me.options.runDir = me.options.runDir || me.options.servicesDir+'/run';
	me.options.dataDir = me.options.dataDir || me.options.servicesDir+'/data';
	
	// create required directories
	if(!path.existsSync(me.options.servicesDir))
		fs.mkdirSync(me.options.servicesDir, 0775);
		
	if(!path.existsSync(me.options.logsDir))
		fs.mkdirSync(me.options.logsDir, 0775);
	
	if(!path.existsSync(me.options.configDir))
		fs.mkdirSync(me.options.configDir, 0775);
	
	if(!path.existsSync(me.options.runDir))
		fs.mkdirSync(me.options.runDir, 0775);
	
	if(!path.existsSync(me.options.dataDir))
		fs.mkdirSync(me.options.dataDir, 0775);
	
	// load service plugins
	me.services = {};
	_.each(me.options.plugins, function(plugin, name) {
		console.log('Loading service: '+name);
		
		if(_.isString(plugin))
		{
			plugin = require('./services/'+plugin).createService(name, me);
		}
		else if(!plugin.isService && plugin.type)
		{
			plugin = require('./services/'+plugin.type).createService(name, me, plugin);
		}
		
		me.services[name] = plugin;
	});
}
util.inherits(exports.ServicesController, events.EventEmitter);


exports.ServicesController.prototype.handleRequest = function(request, response, server) {
	var me = this;

	if(request.path[1])
	{
		return me.handleServiceRequest.apply(me, arguments);
	}

	if(request.method == 'GET')
	{
		var statusData = {
			services: []
		};
		
		_.each(me.services, function(service, name) {
			statusData.services.push(service.getStatus());
		});

		return statusData;
	}

	return false;
};

exports.ServicesController.prototype.handleServiceRequest = function(request, response, server) {
	var me = this
		service = me.services[request.path[1]];
		
	if(!service)
	{
		return false;
	}

	if(request.method == 'GET')
	{
		return true;
	}
	else if(request.method == 'POST')
	{
		if(request.path[2] == '!start')
		{
			return {
				success: service.start()
				,status: service.getStatus()
			};
		}
		else if(request.path[2] == '!stop')
		{
			return {
				success: service.stop()
				,status: service.getStatus()
			};
		}
		else if(request.path[2] == '!restart')
		{
			return {
				success: service.restart()
				,status: service.getStatus()
			};
		}
	}
	
	return false;
};

exports.createServices = function(sites, options) {
	return new exports.ServicesController(sites, options);
};