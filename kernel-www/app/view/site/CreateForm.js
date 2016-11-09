Ext.define('eMan.view.site.CreateForm', {
	extend: 'Ext.form.Panel'
	,alias: 'widget.sitecreate'

	,bodyPadding: 15
	,autoScroll: true
	,border: false
	,defaultType: 'textfield'
	,fieldDefaults: {
		anchor: '100%'
		,labelAlign: 'right'
		,labelWidth: 110
	}

	,initComponent: function() {

		this.buttons = [{
			xtype: 'button'
			,text: 'Cancel'
			,action: 'cancel'
		},{
			xtype: 'button'
			,text: 'Save Site &raquo;'
			,formBind: true
			//,disabled: true
			,action: 'save'
		}];

		this.items = [{
            fieldLabel: 'Site Label'
            ,name: 'label'
            ,allowBlank: false
            ,listeners: {
                scope: this
                ,blur: function(labelfield) {
                    var handleField = this.getForm().findField('handle');
                    if(!handleField.getValue() && labelfield.getValue())
                    {
                        handleField.setValue(labelfield.getValue().toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9\-]/g,''));
                    }
                }
            }
        },{
            fieldLabel: 'Handle'
            ,name: 'handle'
            ,allowBlank: false
            ,maxLength: 16
        },{
            fieldLabel: 'Primary Hostname'
            ,name: 'primary_hostname'
            ,allowBlank: false
            ,listeners: {
                scope: this
                ,focus: function(priField) {
                    var handleField = this.getForm().findField('handle')
                        ,defaultSuffix = eMan.app.serverConfig.defaultSuffix;;

                    if(!priField.getValue() && handleField.getValue() && defaultSuffix)
                    {
                        priField.setValue(handleField.getValue() + '.' + defaultSuffix);
                    }
                }
                ,blur: function(priField) {
                    var secField = this.getForm().findField('hostnames');
                    if(!secField.getValue() && priField.getValue())
                    {
                        if(priField.getValue().substr(0,4) == 'www.')
                            priField.setValue(priField.getValue().substr(4));

                        if(priField.getValue().split('.').length == 2)
                            secField.setValue('www.'+priField.getValue());
                    }
                }
            }
        },{
            fieldLabel: 'Alt. Hostnames'
            ,name: 'hostnames'
            ,listeners: {
                scope: this
                ,focus: function(secField) {
                    var handleField = this.getForm().findField('handle')
                        ,defaultSuffix = eMan.app.serverConfig.defaultSuffix
                        ,defaultHostname = defaultSuffix && (handleField.getValue() + '.' + defaultSuffix)
                        ,altHostnames = Ext.Array.clean(secField.getValue().split(/\s*,\s*/));

                    if (defaultHostname && !secField.defaultAdded && !Ext.Array.contains(altHostnames, defaultHostname)) {
                        altHostnames.push(defaultHostname);
                        secField.setValue(altHostnames.join(', '));
                        secField.defaultAdded = true;
                    }
                }
            }
        },{
            fieldLabel: 'Parent Site'
            ,xtype: 'combo'
            ,name: 'parent_hostname'
            ,autoSelect: false
            ,emptyText: 'Select or enter hostname'
            ,displayField: 'hostname'
            ,valueField: 'hostname'
            ,store: 'Skeletons'
            ,queryMode: 'local'
            ,listeners: {
                scope: this
                ,select: function(hostField) {
                    var keyField = this.getForm().findField('parent_key');

                    if(hostField.getValue())
                    {
                    	var hostRecord = hostField.findRecordByValue(hostField.getValue());

                    	if(hostRecord && hostRecord.get('key'))
                    		keyField.setValue(hostRecord.get('key'));
                    	else
                    		keyField.focus();
                    }
                    else
                    {
                    	keyField.setValue('');
                    }
                }
            }
        },{
            fieldLabel: 'Parent Access Key'
            ,name: 'parent_key'
        },{
            xtype: 'fieldset'
            ,title: 'First User'
            ,defaultType: 'textfield'
            ,fieldDefaults: {
                anchor: '100%'
            }
            ,items: [{
                fieldLabel: 'Email'
                ,name: 'user_email'
                ,listeners: {
                    scope: this
                    ,blur: function(emailField) {
                        var userField = this.getForm().findField('user_username')
                            ,email = emailField.getValue();

                        if(!userField.getValue() && email)
                        {
                            userField.setValue(email.substr(0, email.indexOf('@')));
                        }
                    }
                }
            },{
                fieldLabel: 'Username'
                ,name: 'user_username'
            },{
                fieldLabel: 'Password'
                ,inputType: 'password'
                ,name: 'user_password'
            },{
                fieldLabel: 'First name'
                ,name: 'user_first'
            },{
                fieldLabel: 'Last name'
                ,name: 'user_last'
            }]
        }];

		this.callParent(arguments);
	}
});
