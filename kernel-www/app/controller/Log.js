Ext.define('eMan.controller.Log', {
    extend: 'Ext.app.Controller',

    views: ['log.Grid'],
    stores: ['Log'],
    models: ['LogEntry'],

    init: function () {
        this.control({
            'loggrid': {
                afterrender: function () {
                    eMan.app.on('log', function (message) {
                        this.getLogStore().insert(0, {
                            timestamp: new Date(),
                            message: message
                        });
                    }, this);
                },
                scope: this
            }
        });
    }
});
