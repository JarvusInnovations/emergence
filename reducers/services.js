module.exports = function (state = {}, action) {
    switch (action.type) {
        case 'SERVICES_LOAD':
            const services = {};

            for (const service of action.payload) {
                services[service.service_group] = service;
            }

            return Object.assign({}, state, services);
        default:
            return state;
    }
};
