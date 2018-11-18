Ext.define('eMan.model.Site', {
    extend: 'Ext.data.Model',

    fields: [
        {name: 'id', persist: false},
        {name: 'handle', type: 'string'},
        {name: 'primary_hostname', type: 'string'},
        {name: 'hostnames'},
        {name: 'label', type: 'string', useNull: true},
        {name: 'parent_hostname', type: 'string', useNull: true},
        {name: 'parent_key', type: 'string', useNull: true},
        {name: 'inheritance_key', type: 'string'},
        {name: 'create_user', useNull: true}
    ],
    proxy: {
        type: 'rest',
        url: '/sites',
        reader: {
            type: 'json',
            root: 'data'
        },
        writer: {
            type: 'json'
        }
    }
});
