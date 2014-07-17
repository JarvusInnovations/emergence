Ext.define('eMan.controller.Sites', {
	extend: 'Ext.app.Controller'
	,requires: ['Ext.Ajax']

	,views: ['site.Grid', 'site.CreateForm', 'site.Menu']
	,stores: ['Sites','Skeletons']
	,models: ['Site']
	
	,refs: [{
		ref: 'siteMenu'
		,selector: 'sitemenu'
		,autoCreate: true
		,xtype: 'sitemenu'
	},{
		ref: 'createForm'
		,selector: 'sitecreate'
		,autoCreate: true
		,xtype: 'sitecreate'
	}]

	,init: function() {
	    var me = this
	        ,skeletonsStore = me.getSkeletonsStore();

		this.control({
			'sitegrid': {
				itemcontextmenu: me.onSiteContextMenu
			}
			,'sitegrid button[action=create]': {
				click: me.onCreateClick
			}
            ,'sitemenu > menuitem[action=create-inheriting]': {
                click: me.onCreateInheritingClick     
            }
			,'sitecreate button[action=save]': {
				click: me.createSite
			}
			,'sitecreate button[action=cancel]': {
				click: me.cancelCreateSite
			}
		});

		// load and check that at least skeleton-v1 is in the store
		skeletonsStore.load(function(records) {
    		if (!records.length) {
        		skeletonsStore.add({hostname: 'skeleton.emr.ge', key: '8U6kydil36bl3vlJ'});
                skeletonsStore.sync();
    		}
    		
    		// download latest
    		Ext.Ajax.request({
        		method: 'GET'
        		,url: 'http://emr.ge/skeletons.json'
        		,success: function(response) {
        		    var data = Ext.decode(response.responseText, true);
        		    if (data) {
            		    skeletonsStore.loadData(data);
            		    skeletonsStore.sync();
        		    }
        		}
    		});
		});
	}
	
	,showCreateForm: function(siteRecord, animateTarget) {
	
		this.editingSite = siteRecord;
		
		this.getCreateForm().loadRecord(this.editingSite);
	
		this.createWindow = Ext.create('Ext.window.Window', {
			title: 'Create a new site'
			,width: 400
			,modal: true
			,layout: 'fit'
			,items: this.getCreateForm()
			,listeners: {
				scope: this
				,show: {
					fn: function() {
						this.getCreateForm().getForm().findField('label').focus();
					}
					,delay: 500
				}
			}
		});
		
		this.createWindow.show(animateTarget);
	}


	,createSite: function() {
		var data = this.getCreateForm().getValues();
		
		if(data.user_username || data.user_password || data.user_email || data.user_first || data.user_last)
		{
			if(!(data.user_username && data.user_password && data.user_email && data.user_first && data.user_last))
			{
				Ext.Msg.alert('Incomplete user', 'Please fill out all fields for a first user');
				return false;
			}
		
			data.create_user = {
				Username: data.user_username
				,Password: data.user_password
				,Email: data.user_email
				,FirstName: data.user_first
				,LastName: data.user_last
			};
			
			delete data.user_email;
			delete data.user_password;
			delete data.user_email;
			delete data.user_first;
			delete data.user_last;
		}
		
		this.editingSite.set(data);
		this.getSitesStore().add(this.editingSite);
		this.createWindow.close();
	}
	
	,cancelCreateSite: function() {
		this.createWindow.close();
	}
	
	,onSiteContextMenu: function(tree, record, item, index, ev) {
        ev.stopEvent();
        
        var menu = this.getSiteMenu();
        
        menu.siteRecord = record;
        menu.showAt(ev.getXY());
	}

	,onCreateClick: function(btn) {
		var siteRecord = Ext.create('eMan.model.Site');
		this.showCreateForm(siteRecord, btn.el)
	}
	
	,onCreateInheritingClick: function(menuItem) {
	
        var parentSite = menuItem.parentMenu.siteRecord;
		
		var siteRecord = Ext.create('eMan.model.Site', {
			parent_hostname: parentSite.get('primary_hostname')
			,parent_key: parentSite.get('inheritance_key')
		});
		
		this.showCreateForm(siteRecord, menuItem.el);
	}
});