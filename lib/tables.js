const nSQL = require('nano-sql').nSQL;


// define services table
const services = nSQL.services = () => nSQL('services');

services().model([
    {
        key: 'service_group',
        type: 'string',
        props: ['pk']
    },
    {
        key: 'pkg',
        type: 'map'
    },
    {
        key: 'cfg',
        type: 'map'
    },
    {
        key: 'process',
        type: 'map'
    },
    {
        key: 'foo',
        type: 'string',
        default: 'bar'
    }
]);


// define sites table
const sites = nSQL.sites = () => nSQL('sites');

sites().model([
    {
        key: 'handle',
        type: 'string',
        props: ['pk']
    }
]);


// define users table
const users = nSQL.users = () => nSQL('users');

users().model([
    {
        key: 'username',
        type: 'string',
        props: ['pk']
    }
]);


// return promise
module.exports = (async () => {
    await nSQL().connect();
    return nSQL;
})();
