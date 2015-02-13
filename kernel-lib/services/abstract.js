var util   = require('util'),
    events = require('events');

function AbstractService (name, controller, options) {
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
    me.pid = null;
}

util.inherits(AbstractService, events.EventEmitter);

AbstractService.prototype.getStatus = function getStatus() {
    return {
        name:   this.name,
        status: this.status
    };
};

AbstractService.prototype.start = function start() {
    throw new Error('start() not implemented in ' + this.name);
};

AbstractService.prototype.stop = function stop() {
    throw new Error('start() not implemented in ' + this.name);
};

AbstractService.prototype.restart = function restart() {
    if (this.stop()) {
        return this.start();
    } else {
        return false;
    }
};

AbstractService.prototype.isRunning = function isRunning() {
    if (typeof this.pid !== 'number') {
        return false;
    }

    try {
        return process.kill(this.pid, 0);
    } catch (e) {
        return e.code === 'EPERM';
    }
};

exports.AbstractService = AbstractService;