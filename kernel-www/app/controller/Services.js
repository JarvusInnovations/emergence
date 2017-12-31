Ext.define('eMan.controller.Services', {
    extend: 'Ext.app.Controller',

    views: ['services.Grid'],
    stores: ['Services'],
    models: ['Service'],

    init: function () {

        this.startServiceBtn = new Ext.create('Ext.menu.Item', {
            text: 'Start Service',
            scope: this,
            handler: this.onStartPress
        });

        this.restartServiceBtn = new Ext.create('Ext.menu.Item', {
            text: 'Restart Service',
            scope: this,
            handler: this.onRestartPress
        });

        this.stopServiceBtn = new Ext.create('Ext.menu.Item', {
            text: 'Stop Service',
            scope: this,
            handler: this.onStopPress
        });

        this.servicesContextMenu = Ext.create('Ext.menu.Menu', {
            items: [this.startServiceBtn, this.restartServiceBtn, this.stopServiceBtn]
        });

        this.control({
            'servicesgrid gridview': {
                scope: this,
                cellclick: function (view, cellEl, colIndex, record) {
                    if (colIndex == 1)
                        this.showServiceMenu(view, cellEl, record);
	    		}
            },
            'servicesgrid tool[type=refresh]': {
                scope: this,
                click: function () {
                    this.getServicesStore().load();
                }
            }
        });
    },

    showServiceMenu: function (view, cellEl, service) {
        if (service.get('status') == 'offline')
        {
            this.startServiceBtn.show();
            this.restartServiceBtn.hide();
            this.stopServiceBtn.hide();
        }
        else
        {
            this.startServiceBtn.hide();
            this.restartServiceBtn.show();
            this.stopServiceBtn.show();
        }

        this.servicesContextMenu.contextRecord = service;
        this.servicesContextMenu.showBy(cellEl);
    },

    onStartPress: function (btn) {
        var service = btn.parentMenu.contextRecord;

        eMan.log('Starting service '+service.get('name')+'...');
        service.set('status', 'starting...');

        Ext.Ajax.request({
            url: '/services/'+service.get('name')+'/!start',
            method: 'POST',
            scope: this,
            success: function (response) {
                var r = Ext.decode(response.responseText);

                eMan.log((r.success?'Successfully started service ':'Failed to start service')+service.get('name'));

                if (r.status)
                {
                    service.set(r.status);
                    service.commit();
                }
            }
        });
    },

    onStopPress: function (btn) {
        var service = btn.parentMenu.contextRecord;

        eMan.log('Stopping service '+service.get('name')+'...');
        service.set('status', 'stopping...');

        Ext.Ajax.request({
            url: '/services/'+service.get('name')+'/!stop',
            method: 'POST',
            scope: this,
            success: function (response) {
                var r = Ext.decode(response.responseText);

                eMan.log((r.success?'Successfully stopped service ':'Failed to stop service ')+service.get('name'));

                if (r.status)
                {
                    service.set(r.status);
                    service.commit();
                }
            }
        });
    },

    onRestartPress: function (btn) {
        var service = btn.parentMenu.contextRecord;

        eMan.log('Restarting service '+service.get('name')+'...');
        service.set('status', 'restarting...');

        Ext.Ajax.request({
            url: '/services/'+service.get('name')+'/!restart',
            method: 'POST',
            scope: this,
            success: function (response) {
                var r = Ext.decode(response.responseText);

                eMan.log((r.success?'Successfully restarted service ':'Failed to restart service ')+service.get('name'));

                if (r.status)
                {
                    service.set(r.status);
                    service.commit();
                }
            }
        });
    }
});
