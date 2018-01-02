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
    if (!await habitat.getSupervisorStatus()) {
        throw new Error('Habitat supervisor must be running, start it as a daemon first');
    }


    // load tables
    const tables = await require('./lib/tables');

    tables('*').on('change', event => {
        logger.info(`${event.table} rows updated: ${event.affectedRowPKS.join(", ")}`);
    });


    // install services
    await habitat('pkg', 'install', 'emergence/php5', 'emergence/nginx', 'emergence/mysql', { passthrough: true, wait: true });


    // load services
    await habitat('svc', 'load', 'emergence/nginx', { force: true, group: 'emergence' }, { passthrough: true, wait: true });
    await habitat('svc', 'load', 'emergence/php5', { force: true, group: 'emergence' }, { passthrough: true, wait: true });
    await habitat('svc', 'load', 'emergence/mysql', { force: true, group: 'emergence' }, { passthrough: true, wait: true });


    // get services status via API
    const services = await habitat.getServices();
    logger.info(`Loaded ${services.length} service(s):`);
    services.forEach(service => logger.info(`${service.process.state}:\t${service.pkg.ident}`));


    // load services into table
    await tables().loadJS('services', services);

    tables.services().on('change', event => {
        debugger;
    });

    const results1 = await tables.services().query('select').exec();
    const results2 = await tables.services().query('upsert', {
        service_group: 'mysql.emergence',
        foo: 'boo'
    }).exec();
    const results3 = await tables.services().query('select').exec();

    debugger;
}
