var _ = require('underscore')
    ,util = require('util')
    ,events = require('events');


exports.AbstractService = function(name, controller, options) {
    var me = this;

    // call events constructor
    exports.AbstractService.super_.apply(me, arguments);

    // initialize options and apply defaults
    me.name = name;
    me.controller = controller;
    me.options = options || {};

    // initialize state
    me.isService = true;
    me.status = 'offline';
};

util.inherits(exports.AbstractService, events.EventEmitter);


exports.AbstractService.prototype.getStatus = function() {
    return {
        name: this.name
        ,status: this.status
    };
}

exports.AbstractService.prototype.start = function() {
    throw new Error('start() not implemented in '+this.name);
};

exports.AbstractService.prototype.stop = function() {
    throw new Error('start() not implemented in '+this.name);
};

exports.AbstractService.prototype.restart = function() {
    if (this.stop()) {
        return this.start();
    } else {
        return false;
    }
};