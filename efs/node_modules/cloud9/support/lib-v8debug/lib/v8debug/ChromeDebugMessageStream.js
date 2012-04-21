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

var ChromeDebugMessageStream = function(socket) {
    this.$socket = socket;
};

(function() {

    oop.implement(this, EventEmitter);

    this.$received = "";

    this.connect = function() {
        var socket = this.$socket;
        var self = this;
        socket.onconnect = function() {
            self.$onconnect();
        };
        socket.onreceive = function() {
            self.$onhandshake();
        };
        socket.connect();
    };

    this.sendRequest = function(message) {
//        console.log("> Sent to Chrome:\n", message.stringify());
        this.$socket.send(message.stringify());
    };

    this.$onconnect = function() {
        this.$socket.send(this.MSG_HANDSHAKE);
    };

    this.$onhandshake = function() {
        this.$received += this.$socket.receivedText;
        this.$socket.clearBuffer();

        if (this.$received.length < this.MSG_HANDSHAKE.length)
            return;

        if (this.$received.indexOf(this.MSG_HANDSHAKE) !== 0) {
            this.$socket.onreceive = null;
            return this.$onerror();
        }

        this.$received = this.$received.substring(this.MSG_HANDSHAKE.length);
        this.$socket.onreceive = null;
        this.$reader = new MessageReader(this.$socket, this.$onMessage.bind(this));

        this._dispatchEvent("connect");
    };

    this.$onMessage = function(messageText) {
        var self = this;
        setTimeout(function() {
//            console.log("> Received from Chrome:\n", messageText);
            var response = new DevToolsMessage.fromString(messageText);
            self._dispatchEvent("message", {data: response});
        }, 0);
    };

    this.$onerror = function() {
        this.$dispatchEvent("error");
    };

    this.MSG_HANDSHAKE = "ChromeDevToolsHandshake\r\n";

}).call(ChromeDebugMessageStream.prototype);

return ChromeDebugMessageStream;

});