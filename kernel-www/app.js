// enable and configure loader
Ext.Loader.setConfig({
	enabled:true
	,paths:{
		Ext: '//extjs.cachefly.net/ext/gpl/5.0.0/src'
	}
});

Ext.application({
	name: 'eMan'
	,appFolder: 'app'
	
	,controllers: ['Viewport', 'Services', 'Sites', 'Log']
	
	,autoCreateViewport: false
	
	,launch: function() {
		eMan.app = this;
		eMan.log = Ext.bind(eMan.app.log, eMan.app);
		this.viewport = Ext.create('eMan.view.Viewport');
		this.viewport.setLoading(true);
		Ext.Ajax.request({
			url: '/server-config'
			,success: function(response) {
				var r = Ext.decode(response.responseText);
				eMan.app.serverConfig = r;
				eMan.app.viewport.setLoading(false);
			}
		});
		this.fireEvent('log', 'Emergence Manager ready.');
	}
	
	,log: function(message) {
		this.fireEvent('log', message);
	}
});
