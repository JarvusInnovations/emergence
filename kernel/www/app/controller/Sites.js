Ext.define('eMan.controller.Sites', {
	extend: 'Ext.app.Controller'

	,views: ['site.Grid', 'site.CreateForm']
	,stores: ['Sites']
	,models: ['Site']

	,init: function() {
		this.control({
			'sitegrid button[action=create]': {
				click: this.showCreateForm
			}
			,'sitecreate button[action=save]': {
				click: this.createSite
			}
			,'sitecreate button[action=cancel]': {
				click: this.cancelCreateSite
			}
		});
	}
	
	,showCreateForm: function(btn) {
	
		this.editingSite = Ext.create('eMan.model.Site');
	
		this.createForm = Ext.widget('sitecreate');
		
		this.createForm.getForm().loadRecord(this.editingSite);
	
		this.createWindow = Ext.create('Ext.window.Window', {
			title: 'Create a new site'
			,width: 400
			,height: 350
			,modal: true
			,layout: 'fit'
			,items: this.createForm
			,listeners: {
				scope: this
				,activate: function() {
					this.createForm.getForm().findField('label').focus();
				}
			}
		});
		
		this.createWindow.show(btn.el);
	}


	,createSite: function() {
		this.createForm.getForm().updateRecord(this.editingSite);
		this.getSitesStore().add(this.editingSite);
		this.createWindow.close();
	}
	
	,cancelCreateSite: function() {
		this.createWindow.close();
	}
});