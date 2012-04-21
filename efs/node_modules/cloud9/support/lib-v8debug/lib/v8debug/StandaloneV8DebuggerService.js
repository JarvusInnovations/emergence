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
var MessageReader = require("./MessageReader");
var DevToolsMessage = require("./DevToolsMessage");

var StandaloneV8DebuggerService = function(socket) {
    this.$socket = socket;
    this.$attached = false;
};

(function() {

    oop.implement(this, EventEmitter);

    this.attach = function(tabId, callback) {
        if (this.$attached)
            throw new Error("already attached!");

        var self = this;
        this.$reader = new MessageReader(this.$socket, function(messageText) {
//            console.log("Connect>", messageText);
            self._dispatchEvent("connect");
            self.$reader = new MessageReader(self.$socket, self.$onMessage.bind(self));
            callback();
        });
        this.$socket.connect();
    };

    this.detach = function(tabId, callback) {
        this.$socket.close();
        this.$attached = false;
        callback();
    };

    this.$onMessage = function(messageText) {

        var self = this;
        setTimeout(function() {
            var response = new DevToolsMessage.fromString(messageText);

            var contentText = response.getContent();
            if (!contentText)
                return;

            var content = JSON.parse(contentText);
            self._dispatchEvent("debugger_command_0", {data: content});
        }, 0);
    };

    this.debuggerCommand = function(tabId, v8Command) {
        this.$send(v8Command);
    };

    this.$send = function(text) {
        var msg = ["Content-Length:", text.length, "\r\n\r\n", text].join("");
//        console.log("SEND>", msg);
        this.$socket.send(msg);
    };

}).call(StandaloneV8DebuggerService.prototype);

return StandaloneV8DebuggerService;

});