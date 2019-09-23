exports.command = 'run';
exports.desc = 'Run kernel daemon';
exports.builder = {
    root: {
        describe: 'Root directory for kernel state',
        default: '/emergence'
    }
};

exports.handler = async function run ({ root }) {
    const logger = require('../../lib/logger.js');

    logger.info('in run...');
    logger.debug(`root=${root}`)
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('done');
};
