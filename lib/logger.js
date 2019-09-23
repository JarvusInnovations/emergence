"use strict";

var emptyFn = function() {};

module.exports = (require.main && require.main.exports.logger) || {
    log: emptyFn,

    error: emptyFn,
    warn: emptyFn,
    help: emptyFn,
    data: emptyFn,
    info: emptyFn,
    debug: emptyFn,
    prompt: emptyFn,
    verbose: emptyFn,
    input: emptyFn,
    silly: emptyFn
};
