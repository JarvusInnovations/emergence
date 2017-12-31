Ext.define('eMan.view.site.Menu', {
    extend: 'Ext.menu.Menu',
    alias: 'widget.sitemenu',

    items: [{
        text: 'Create inheriting site',
        action: 'create-inheriting'
        //,icon: '/img/icons/fugue/blue-document.png'
    },{
        text: 'Create developer user',
        action: 'create-developer'
    }]
});
