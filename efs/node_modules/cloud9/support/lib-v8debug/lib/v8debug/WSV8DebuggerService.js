/**
 * Ajax.org Code Editor (ACE)
 *
 * @copyright 2010, Ajax.org Services B.V.
 * @license LGPLv3 <http://www.gnu.org/licenses/lgpl-3.0.txt>
 * @author Fabian Jakobs <fabian AT ajax DOT org>
 */

define(function(require, exports, module) {
    
var oop = require("pilot/oop");
var EventEmitter = require("pilot/event_emitter").EventEmitter;

var WSV8DebuggerService = function(socket) {
    this.$socket = socket;
    this.$state = "initialized";
    this.$onAttach = [];
};

(function() {

    oop.implement(this, EventEmitter);

    this.attach = function(tabId, callback) {
        if (this.$state == "connected")
            return callback(new Error("already attached!"));

        this.$onAttach.push(callback);

        if (this.$state == "initialized") {
            this.$socket.send(JSON.stringify({command: "DebugAttachNode"}));
            this.$onMessageHandler = this.$onMessage.bind(this);
            this.$socket.on("message", this.$onMessageHandler);
            this.$state = "connecting";
        }
    };

    this.$onMessage = function(data) {
        var message;
        try {
            message = JSON.parse(data);
        } catch(e) {
            return;
        }
        if (message.type == "node-debug-ready") {
            this.$state = "connected";
            for (var i=0; i<this.$onAttach.length; i++)
                this.$onAttach[i]();
            this.$onAttach = [];
        }
        else if (message.type == "node-debug") {
            this._dispatchEvent("debugger_command_0", {data: message.body});
        }
    };

    this.detach = function(tabId, callback) {
        this.$state = "initialized";
        this.$socket.removeEvent("message", this.$onMessageHandler);
        callback();
    };

    this.debuggerCommand = function(tabId, v8Command) {
        this.$socket.send(JSON.stringify({command: "debugNode", body: JSON.parse(v8Command)}));
    };

}).call(WSV8DebuggerService.prototype);

return WSV8DebuggerService;

});