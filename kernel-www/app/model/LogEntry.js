Ext.define('eMan.model.LogEntry', {
    extend: 'Ext.data.Model',

    fields: [{
        name: 'timestamp',
        type: 'date'
    },{
        name: 'message',
        type: 'string'
    }]
});
