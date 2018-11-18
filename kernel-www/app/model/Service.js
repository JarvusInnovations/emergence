Ext.define('eMan.model.Service', {
    extend: 'Ext.data.Model',

    fields: ['name','status'],
    idProperty: 'name',
    proxy: {
        type: 'rest',
        url: '/services',
        reader: {
            type: 'json',
            root: 'services'
        }
    }
});
