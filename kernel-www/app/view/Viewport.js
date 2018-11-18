Ext.define('eMan.view.Viewport', {
    extend: 'Ext.container.Viewport',

    layout: 'border',

    initComponent: function () {

        this.tbar = ['Create a new site'];

        this.items = [{
            region: 'north',
            layout: {
                type: 'hbox',
                align: 'stretch'
            },
            height: 200,
            items: [{
                xtype: 'servicesgrid',
                width: 300
            },{
                xtype: 'loggrid',
                flex: 1
            }]
        },{
            region: 'center',
            xtype: 'sitegrid'
        }];

        this.callParent(arguments);
    }
});
