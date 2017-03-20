Ext.define('eMan.view.site.DeveloperForm', {
    extend: 'Ext.form.Panel',
    xtype: 'developerform',


    config: {
        site: null
    },

    bodyPadding: 15,

    buttons: [{
        xtype: 'button',
        text: 'Cancel',
        action: 'cancel'
    },{
        xtype: 'button',
        text: 'Create Developer &raquo;',
        formBind: true,
        action: 'save'
    }],

    defaultType: 'textfield',
    fieldDefaults: {
        anchor: '100%',
        labelAlign: 'right',
        labelWidth: 110,
        allowBlank: false
    },

    items: [{
        fieldLabel: 'Email',
        name: 'Email',
        listeners: {
            blur: function(emailField) {
                var userField = this.next('field[name=Username]'),
                    email = emailField.getValue();

                if (!userField.getValue() && email) {
                    userField.setValue(email.substr(0, email.indexOf('@')));
                }
            }
        }
    },{
        fieldLabel: 'Username',
        name: 'Username'
    },{
        fieldLabel: 'Password',
        inputType: 'password',
        name: 'Password'
    },{
        fieldLabel: 'First name',
        name: 'FirstName'
    },{
        fieldLabel: 'Last name',
        name: 'LastName'
    }]
});