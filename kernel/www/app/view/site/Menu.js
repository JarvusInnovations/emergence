Ext.define('eMan.view.site.Menu', {
    extend: 'Ext.menu.Menu'
    ,alias: 'widget.sitemenu'

    ,items: [{
        text: 'Created inheriting site'
        ,action: 'create-inheriting'
        //,icon: '/img/icons/fugue/blue-document.png' 
    }]
});