// enable and configure loader
Ext.Loader.setConfig({
	enabled:true
	,paths:{
		Ext: 'http://extjs.cachefly.net/ext-4.0.2a/src'
	}
});

Ext.application({
	name: 'eMan'
	,appFolder: 'app'
	,defaultPrimaryDomain: 'sites.emr.ge'
	
	,controllers: ['Viewport', 'Services', 'Sites', 'Log']
	
	,autoCreateViewport: false
	
	,launch: function() {
		eMan.app = this;
		eMan.log = Ext.bind(eMan.app.log, eMan.app);
		this.viewport = Ext.create('eMan.view.Viewport');
		this.fireEvent('log', 'Emergence Manager ready.');
	}
	
	,log: function(message) {
		this.fireEvent('log', message);
	}
});