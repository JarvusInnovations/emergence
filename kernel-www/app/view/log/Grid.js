Ext.define('eMan.view.log.Grid', {
	extend: 'Ext.grid.Panel'
	,alias: 'widget.loggrid'

	,title: 'System Log'
	,store: 'Log'
	,viewConfig: {
		emptyText: 'No activity'
	}
	
	,initComponent: function() {
	
		this.columns = [{
			xtype: 'datecolumn'
			,text: 'Timestamp'
			,dataIndex: 'timestamp'
			,format: 'Y-m-d h:i:s'
			,width: 120
		},{
			text: 'Message'
			,dataIndex: 'message'
			,flex: 1
		}];

		this.callParent(arguments);
	}
	

});