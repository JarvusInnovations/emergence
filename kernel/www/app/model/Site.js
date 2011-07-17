Ext.define('eMan.model.Site', {
	extend: 'Ext.data.Model'

	,fields: ['handle','primary_hostname','hostnames','label','parent_hostname']
	,idProperty: 'handle'
	,proxy: {
		type: 'rest'
		,url: '/sites'
		,reader: {
			type: 'json'
			,root: 'data'
		}
		,writer: {
			type: 'json'
		}
	}

});