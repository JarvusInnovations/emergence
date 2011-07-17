var _ = require('underscore')
	,util = require('util')
	,events = require('events');
	
exports.ServicesController = function(options) {
	var me = this;
	
	// call events constructor
	events.EventEmitter.call(me);

	// initialize options and apply defaults
	me.options = options || {};
	me.options.services = me.options.services || {};
	me.options.configDir = me.options.configDir || '/emergence/kernel/etc';
	
	if(!me.options.sites)
		throw new Error('services module requires sites');
		
	_.each(me.options.services, function(service, name) {
		console.log('Loading service: '+name);
		
		if(_.isString(service))
		{
			service = require('./services/'+service).createService(name, me);
		}
		else if(!service.isService && service.type)
		{
			service = require('./services/'+service.type).createService(name, me, service);
		}
		
		me.options.services[name] = service;
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
		
		_.each(me.options.services, function(service, name) {
			statusData.services.push(service.getStatus());
		});

		return statusData;
	}

	return false;
};

exports.ServicesController.prototype.handleServiceRequest = function(request, response, server) {
	var me = this
		service = me.options.services[request.path[1]];
		
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

exports.createServices = function(options) {
	return new exports.ServicesController(options);
};