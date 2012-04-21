/**
 * Ajax.org Code Editor (ACE)
 *
 * @copyright 2010, Ajax.org Services B.V.
 * @license LGPLv3 <http://www.gnu.org/licenses/lgpl-3.0.txt>
 * @author Fabian Jakobs <fabian AT ajax DOT org>
 */

define(function(require, exports, module) {
    
var Breakpoint = function(source, line, column, dbg) {
    this.source = source;
    this.line = line;
    this.column = column || 0;

    this.enabled = true;
    this.condition = "";
    this.ignoreCount = 0;
    
    if (dbg) {
        this.$dbg = dbg;
        this.state = "connected";
        this.$listen();
    }
    else
        this.state = "initialized";
};

(function() {

    this.attach = function(dbg, callback) {
        var self = this;

        if (this.state !== "initialized")
            throw new Error("Already attached");

        this.$dbg = dbg;
        this.state = "connecting";

        this.$listen();
        dbg.setbreakpoint("script", self.source, self.line, self.column, self.enabled, self.condition, self.ignoreCount, function(body) {
            self.state = "connected";
            self.$id = body.breakpoint;
            self.line = body.line;
            callback(self);
        });
    };

    this.$listen = function() {
        var self = this;
        this.$onbreak = function(e) {
            if (this.state !== "connected")
                return;

            if (e.data.breakpoints.indexOf(self.$id) !== -1) {
                self.$dispatchEvent("break");
            }
        };
        dbg.addEventListener("break", this.$onbreak);
    };

    this.clear = function(callback) {
        if (this.state !== "connected")
            throw new Error("Not connected!");

        var self = this;
        this.$dbg.clearbreakpoint(this.$id, function() {
            this.$id = null;
            this.$dbg = null;
            this.state = "initialized";
            callback && callback(self);
        });
    };

    this.setEnabled = function(enabled) {
      this.enabled = enabled;
    };

    this.setCondition = function(condition) {
        this.condition = condition;
    };

    this.setIgnoreCount = function(ignoreCount) {
        this.ignoreCount = ignoreCount;
    };

    this.flush = function(callback) {
        if (this.state !== "connected") {
            throw new Error("Not connected");
        }
        this.$dbg.changeBreakpoint(this.$id, this.enabled, this.condition, this.ignoreCount, callback);
    };

    this.destroy = function() {
        dbg.removeEventListener("break", this.$onbreak);
    };

}).call(Breakpoint.prototype);

Breakpoint.fromJson = function(breakpoint, dbg) {
    if (breakpoint.type != "scriptName")
        throw new Error("unsupported breakpoint type: " + breakpoint.type);

    var bp = new Breakpoint(breakpoint.script_name, breakpoint.line, breakpoint.column, dbg);
    bp.condition = breakpoint.condition || "";
    bp.ignoreCount = breakpoint.ignoreCount || 0;
    bp.enabled = breakpoint.active;
    bp.$id = breakpoint.number;
    return bp;
};

return Breakpoint;

});