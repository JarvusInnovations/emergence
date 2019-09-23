exports.command = 'controller';
exports.desc = 'Run k8s controller';
exports.builder = {
    root: {
        describe: 'Root directory for controller state',
        default: '/emergence'
    }
};

exports.handler = async function run ({ root }) {
    const logger = require('../../lib/logger.js');

    logger.info('in controller...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('done');
};
