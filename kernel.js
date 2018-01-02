// setup logger
const logger = require('winston');
module.exports = { logger };

if (process.env.DEBUG) {
    logger.level = 'debug';
}


// setup habitat
const habitat = require('./lib/habitat.js');
const habitatRequired = '>=0.50';


// start up in async context
start().catch(err => logger.error('Failed to start kernel:', err.message));


async function start () {

    // check habitat version
    if (!await habitat.satisfiesVersion(habitatRequired)) {
        throw new Error(`Habitat version must be ${habitatRequired}, reported version is ${await habitat.getVersion()}`);
    }


    // ensure supervisor is available
    try {
        const result = await habitat('svc', 'status');
        debugger;
    } catch (err) {
        throw new Error('Habitat supervisor must be running, start it as a daemon first');
    }


    // install services
    await habitat('pkg', 'install', 'emergence/php5', 'emergence/nginx', 'emergence/mysql', { passthrough: true, wait: true });


    // load services
    await habitat('svc', 'load', 'emergence/nginx', { force: true, group: 'emergence' }, { passthrough: true, wait: true });
    await habitat('svc', 'load', 'emergence/php5', { force: true, group: 'emergence' }, { passthrough: true, wait: true });
    await habitat('svc', 'load', 'emergence/mysql', { force: true, group: 'emergence' }, { passthrough: true, wait: true });
}
