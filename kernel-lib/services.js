var _ = require('underscore'),
    util = require('util'),
    fs = require('fs'),
    path = require('path'),
    events = require('events');

exports.ServicesController = function(sites, config) {
    var me = this;

    me.sites = sites;
    me.services = config.services;

    // call events constructor
    events.EventEmitter.call(me);

    // load services
    me.services = {};
    _.each(config.services, function(plugin, name) {
        console.log('Loading service: '+name);

        if (_.isString(plugin)) {
            plugin = require('./services/'+plugin).createService(name, me);
        } else if (!plugin.isService && plugin.type) {
            plugin = require('./services/'+plugin.type).createService(name, me, plugin);
        }

        me.services[name] = plugin;
    });

    // start services
    _.each(me.services, function(service, name) {
        console.log('Starting service: '+name);
        service.start();
    });
};

util.inherits(exports.ServicesController, events.EventEmitter);


exports.ServicesController.prototype.handleRequest = function(request, response, server) {
    var me = this;

    if (request.path[1]) {
        return me.handleServiceRequest.apply(me, arguments);
    }

    if (request.method == 'GET') {
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
    var me = this,
        service = me.services[request.path[1]];

    if (!service) {
        return false;
    }

    if (request.method == 'GET') {
        return true;
    } else if (request.method == 'POST') {
        if (request.path[2] == '!start') {
            return {
                success: service.start(),
                status: service.getStatus()
            };
        } else if (request.path[2] == '!stop') {
            return {
                success: service.stop(),
                status: service.getStatus()
            };
        } else if (request.path[2] == '!restart') {
            return {
                success: service.restart(),
                status: service.getStatus()
            };
        }
    }

    return false;
};

exports.createServices = function(sites, config) {
    return new exports.ServicesController(sites, config);
};