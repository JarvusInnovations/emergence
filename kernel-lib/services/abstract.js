var util = require('util'),
    events = require('events');


function AbstractService (name, controller, options) {
    var me = this;

    // call events constructor
    AbstractService.super_.apply(me, arguments);

    // initialize options and apply defaults
    me.name = name;
    me.controller = controller;
    me.options = options || {};

    // initialize state
    me.isService = true;
    me.status = 'offline';
};

util.inherits(AbstractService, events.EventEmitter);

module.exports = AbstractService;


AbstractService.prototype.getStatus = function () {
    return {
        name: this.name,
        status: this.status
    };
};

AbstractService.prototype.start = function () {
    throw new Error('start() not implemented in '+this.name);
};

AbstractService.prototype.stop = function () {
    throw new Error('start() not implemented in '+this.name);
};

AbstractService.prototype.restart = function () {
    if (this.stop()) {
        return this.start();
    } else {
        return false;
    }
};
