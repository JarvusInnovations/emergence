Ext.define('eMan.view.services.Grid', {
	extend: 'Ext.grid.Panel'
	,alias: 'widget.servicesgrid'

	,title: 'System Services'
	,store: 'Services'
	,viewConfig: {
		emptyText: 'No sites loaded'
	}
	
	,initComponent: function() {
	
		this.tools = [{
			type: 'refresh'
			,tooltip: 'Refresh services status'
		}];
	
		this.columns = [{
			text: 'Name'
			,dataIndex: 'name'
			,flex: 1
		},{
			text: 'Status'
			,dataIndex: 'status'
			,width: 100
		}];

		this.callParent(arguments);
	}
	

});