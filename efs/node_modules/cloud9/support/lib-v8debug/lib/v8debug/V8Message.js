/**
 * Ajax.org Code Editor (ACE)
 *
 * @copyright 2010, Ajax.org Services B.V.
 * @license LGPLv3 <http://www.gnu.org/licenses/lgpl-3.0.txt>
 * @author Fabian Jakobs <fabian AT ajax DOT org>
 */


define(function(require, exports, module) {
    
var oop = require("pilot/oop");

var V8Message = function(type) {
    this.seq = V8Message.$seq++;
    this.type = type;
};

(function() {

    this.$msgKeys = [
        "seq",
        "type",
        "command",
        "arguments",
        "request_seq",
        "body",
        "running",
        "success",
        "message",
        "event"
    ];

    this.parse = function(msgString) {
        var json = JSON.parse(msgString);
        oop.mixin(this, json);
        return this;
    };

    this.stringify = function() {
        var tmp = {};
        for (var i=0; i<this.$msgKeys.length; i++) {
            var name = this.$msgKeys[i];
            if (this[name]) {
                tmp[name] = this[name];
            }
        }
        return JSON.stringify(tmp);
    };

}).call(V8Message.prototype);

V8Message.$seq = 1;

V8Message.fromString = function(msgString) {
    return new V8Message().parse(msgString);
};

V8Message.fromObject = function(obj) {
    var msg = new V8Message();
    oop.mixin(msg, obj);
    return msg;
};

return V8Message;
});