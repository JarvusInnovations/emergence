var emptyFn = function () {};

module.exports = (require.main && require.main.exports.logger) || {
    log: emptyFn,

    error: emptyFn,
    warn: emptyFn,
    info: emptyFn,
    verbose: emptyFn,
    debug: emptyFn,
    silly: emptyFn
};
