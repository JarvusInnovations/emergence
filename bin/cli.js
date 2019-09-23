#!/usr/bin/env node


// setup logger
const logger = require('winston');
module.exports = { logger };

if (process.env.DEBUG) {
    logger.level = 'debug';
}


// all logger output to STDERR
for (const level in logger.levels) {
    logger.default.transports.console.stderrLevels[level] = true;
}


// route command line
require('yargs')
    .version(require('../package.json').version)
    .option('d', {
        alias: 'debug',
        type: 'boolean',
        default: false,
        global: true
    })
    .option('q', {
        alias: 'quiet',
        type: 'boolean',
        default: false,
        global: true
    })
    .check(function (argv) {
        if (argv.debug) {
            logger.level = 'debug';
        } else if (argv.quiet) {
            logger.level = 'error';
        }

        return true;
    })
    .commandDir('../commands', { exclude: /\.test\.js$/ })
    .demandCommand()
    .showHelpOnFail(false, 'Specify --help for available options')
    .fail((msg, err) => {
        logger.error(msg || err.message);

        if (err) {
            logger.debug(err.stack);
        }

        process.exit(1);
    })
    .strict()
    .help()
    .argv;
