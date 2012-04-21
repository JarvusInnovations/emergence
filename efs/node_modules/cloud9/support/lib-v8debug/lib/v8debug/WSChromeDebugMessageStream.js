/**
 * Ajax.org Code Editor (ACE)
 *
 * @copyright 2010, Ajax.org Services B.V.
 * @license LGPLv3 <http://www.gnu.org/licenses/lgpl-3.0.txt>
 * @author Fabian Jakobs <fabian AT ajax DOT org>
 */

define(function(require, exports, module) {
    
var oop = require("pilot/oop");
var lang = require("pilot/lang").lang;
var EventEmitter = require("pilot/event_emitter").EventEmitter;

var WSChromeDebugMessageStream = function(socket) {
    this.$socket = socket;
    this.$attached = false;
};

(function() {

    oop.implement(this, EventEmitter);

    this.$received = "";

    this.connect = function() {
        if (this.$attached)
            return;

        var self = this;

        this.$socket.on("message", function(e) {
            var message;
            try {
                message = JSON.parse(data);
            } catch(e) {
                return _self.$onerror();
            }
            if (message.type == "chrome-debug-ready")
                self._dispatchEvent("connect");
            else {
                var response = new DevToolsMessage.fromString(e.body);
                self._dispatchEvent("message", {data: response});
            }
        });
    };

    this.sendRequest = function(message) {
//        console.log("> Sent to Chrome:\n", message.stringify());
        var command = {
            command: "debugChrome",
            message: message.stringify()
        };
        this.$socket.send(JSON.stringify(message));
    };

    this.$onerror = function() {
        this.$dispatchEvent("error");
    };

}).call(WSChromeDebugMessageStream.prototype);

return WSChromeDebugMessageStream;

});