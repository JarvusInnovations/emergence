Ext.define('eMan.store.Skeletons', {
    extend: 'Ext.data.Store',
    requires: [
	    'eMan.model.Skeleton',
	    'Ext.data.proxy.LocalStorage'
    ],

    model: 'eMan.model.Skeleton',

    proxy: {
    	type: 'localstorage',
    	id: 'emergence-skeletons'
    }
});
