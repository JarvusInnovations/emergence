/**
 * Ajax.org Code Editor (ACE)
 *
 * @copyright 2010, Ajax.org Services B.V.
 * @license LGPLv3 <http://www.gnu.org/licenses/lgpl-3.0.txt>
 * @author Fabian Jakobs <fabian AT ajax DOT org>
 */
var MsgStreamMock = function() {

    ace.implement(this, ace.MEventEmitter);

    var self = this;
    this.requests = [];
    this.sendRequest = function(message) {
        self.requests.push(message);
    };

    this.$send = function(headers, content) {
        var msg = new DevToolsMessage(headers, content);
        this.$dispatchEvent("message", {data: msg});
    };
};