Ext.define('eMan.view.site.Grid', {
	extend: 'Ext.grid.Panel'
	,alias: 'widget.sitegrid'

	,title: 'Sites'
	,store: 'Sites'
	,viewConfig: {
		emptyText: 'No sites loaded'
	}
	
	,initComponent: function() {
	
		this.dockedItems = [{
			xtype: 'toolbar'
			,dock: 'top'
			,items: [{
				xtype: 'button'
				,action: 'create'
				,text: 'Create Site'
				,scope: this
				,handler: this.onCreateSitePress
			}]
		}];
		
		this.columns = [{
			text: 'Label'
			,dataIndex: 'label'
			,width: 200
			,renderer: function(v, metaData) {
				if(v)
					return v;
				
				metaData.tdCls = 'x-cell-empty';
				return 'Unlabeled Site';
			}
		},{
			text: 'Handle'
			,dataIndex: 'handle'
			,width: 150
		},{
			text: 'Primary Hostname'
			,dataIndex: 'primary_hostname'
			,width: 150
		},{
			text: 'Hostnames'
			,dataIndex: 'hostnames'
			,flex: 1
			,renderer: function(v) {
				return typeof v == 'string' ? v : v.join(', ');
			}
		},{
			text: 'Parent Hostname'
			,dataIndex: 'parent_hostname'
			,width: 150
			,renderer: function(v, metaData) {
				if(v)
					return v;
				
				metaData.tdCls = 'x-cell-empty';
				return 'None';
			}
		}];

		this.callParent(arguments);
	}
	
	
	


});