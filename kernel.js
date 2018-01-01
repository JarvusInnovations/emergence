// setup logger
const logger = require('winston');
module.exports = { logger };

if (process.env.DEBUG) {
    logger.level = 'debug';
}


// load habitat
const habitat = require('./lib/habitat.js');
const habitatRequired = '>=0.50';


// start up in async context
(async function start () {

    // check habitat version
    if (!await habitat.satisfiesVersion(habitatRequired)) {
        throw `Habitat version must be ${habitatRequired}, reported version is ${await habitat.getVersion()}`;
    }


    // ensure supervisor is installed
    await habitat('pkg', 'install', 'core/hab-sup', { passthrough: true, wait: true });


    // install services
    await habitat('pkg', 'install', 'emergence/php5', 'emergence/nginx', 'emergence/mysql', { passthrough: true, wait: true });
})();
