var _ = require('underscore'),
    util = require('util'),
    fs = require('fs'),
    path = require('path'),
    util = require('util'),
    events = require('events'),
    posix = require('posix'),
    spawn = require('child_process').spawn,
    hostile = require('hostile');


exports.createSites = function(config) {
    return new exports.Sites(config);
};

exports.Sites = function(config) {
    var me = this,
       options = config.sites;

    // call events constructor
    events.EventEmitter.call(me);

    // initialize options and apply defaults
    me.options = options || {};
    me.options.sitesDir = me.options.sitesDir || '/emergence/sites';
    me.options.dataUID = me.options.dataUID || posix.getpwnam(config.user).uid;
    me.options.dataGID = me.options.dataGID || posix.getgrnam(config.group).gid;
    me.options.dataMode = me.options.dataMode || '775';

    // create required directories
    if (!fs.existsSync(me.options.sitesDir)) {
        fs.mkdirSync(me.options.sitesDir, '775');
    }

    // load sites
    console.log('Loading sites from '+me.options.sitesDir+'...');

    me.sites = {};
    _.each(fs.readdirSync(me.options.sitesDir), function(handle) {
        try {
            me.sites[handle] = JSON.parse(fs.readFileSync(me.options.sitesDir+'/'+handle+'/site.json', 'ascii'));
            me.sites[handle].handle = handle;
            console.log('-Loaded: '+me.sites[handle].primary_hostname);
        } catch (error) {
            console.log('-FAILED to load: '+handle);
        }
    });

};

util.inherits(exports.Sites, events.EventEmitter);


exports.Sites.prototype.handleRequest = function(request, response, server) {
    var me = this;

    if (request.method == 'GET') {
        response.writeHead(200, {'Content-Type':'application/json'});
        response.end(JSON.stringify({data: _.values(me.sites)}));
        return true;
    } else if (request.method == 'POST') {
        // TODO: prevent accidentally overwritting existing site -- require different VERB/PATH
        var requestData, cfgResult, phpProc, phpProcInitialized;

        if (request.headers['content-type'] == 'application/json') {
            requestData = JSON.parse(request.content);
        } else {
            requestData = request.content;
        }

        // handle post to an individual site
        if (request.path[1]) {
            if (!me.sites[request.path[1]]) {
                console.error('Site not found: ' + request.path[1]);
                response.writeHead(404, {'Content-Type':'application/json'});
                response.end(JSON.stringify({success: false, message: 'Site not found'}));
                return;
            }

            if (request.path[2]) {
                if (request.path[2] == 'php-shell') {
                    response.writeHead(200, {'Content-Type':'text/plain'});

                    console.log('Executing shell post for ' + request.path[1] + ':');
                    console.log(requestData);

                    phpProc = spawn('emergence-shell', [request.path[1]]);
                    phpProcInitialized = false;

                    phpProc.stderr.on('data', function(data) {
                        console.log('php-cli stderr: ' + data);
                    });

                    phpProc.stdout.on('data', function(data) {
                        console.log('php-cli stdout: ' + data);

                        // skip first chunk from PHP process
                        if (!phpProcInitialized) {
                            phpProcInitialized = true;
                            return;
                        }

                        response.write(data);
                    });

                    phpProc.stdin.write(requestData+'\n');
                    phpProc.stdin.end();

                    phpProc.on('close', function (code) {
                        console.log('php-cli finished with code ' + code);
                        response.end();
                    });

                    return true;
                } else {
                    console.error('Unhandled site sub-resource: ' + request.path[2]);
                    response.writeHead(404, {'Content-Type':'application/json'});
                    response.end(JSON.stringify({success: false, message: 'Site resource not found'}));
                    return;
                }
            }

            // apply existing site's properties in
            _.defaults(requestData, me.sites[request.path[1]]);
        }

        // create new site
        try {
            cfgResult = me.writeSiteConfig(requestData);

            if (cfgResult.isNew) {
                // write primary hostname to /etc/hosts
                hostile.set('127.0.0.1', cfgResult.site.primary_hostname);
                console.log('added ' + cfgResult.site.primary_hostname + ' to /etc/hosts');

                // notify plugins
                me.emit('siteCreated', cfgResult.site, requestData, {
                    databaseReady: function() {
                        // execute onSiteCreated within site's container
                        console.log('Executing Site::onSiteCreated() via php-cli');
                        phpProc = spawn('emergence-shell', [cfgResult.site.handle]);

                        phpProc.stdout.on('data', function(data) { console.log('php-cli stdout: ' + data); });
                        phpProc.stderr.on('data', function(data) { console.log('php-cli stderr: ' + data); });

                        function _phpExec(code) {
                            //console.log('php> '+code);
                            phpProc.stdin.write(code+'\n');
                        }

                        _phpExec('Site::onSiteCreated(json_decode(\''+JSON.stringify(requestData).replace(/\\/g, '\\\\').replace(/'/g, '\\\'')+'\', true));');
                        phpProc.stdin.end();

                        phpProc.on('close', function (code) {
                            console.log('php-cli finished with code ' + code);
                            // return created response
                            response.writeHead(201, {'Content-Type':'application/json','Location': '/'+request.path[0]+'/'+cfgResult.site.handle});
                            response.end(JSON.stringify({success: code === 0, data: cfgResult.site}));
                        });
                    }
                });
            } else {
                response.writeHead(200, {'Content-Type':'application/json'});
                response.end(JSON.stringify({success: true, data: cfgResult.site}));
            }

        } catch (error) {
            response.writeHead(400, {'Content-Type':'application/json'});
            response.end(JSON.stringify({success: false, error: error}));
            throw error;
        }

        return true;
    }

    return false;
};


exports.Sites.prototype.writeSiteConfig = function(requestData) {
    var me = this,
        siteData = _.clone(requestData);

    // validate mandatory fields
    if (!siteData.primary_hostname) {
        throw 'primary_hostname required';
    }

    // apply defaults
    if (!siteData.handle) {
        siteData.handle = siteData.primary_hostname;
    }

    if (!siteData.label) {
        siteData.label = null;
    }

    // generate inheritance key
    if (!siteData.inheritance_key) {
        siteData.inheritance_key = me.generatePassword(16);
    }

    // parent hostname
    if (!siteData.parent_hostname) {
        siteData.parent_hostname = null;
    }

    // hostnames
    if (siteData.hostnames && _.isString(siteData.hostnames)) {
        siteData.hostnames = siteData.hostnames.split(/\s*[\s,;]\s*/);
    }

    if (!_.isArray(siteData.hostnames)) {
        siteData.hostnames = [];
    }

    // create site directory
    var siteDir = me.options.sitesDir+'/'+siteData.handle,
        dataDir = siteDir + '/data',
        siteDataDir = siteDir + '/site-data',
        siteConfigPath = siteDir + '/site.json';

    if (!fs.existsSync(siteDir)) {
        console.log('sites: creating site directory '+siteDir);
        fs.mkdirSync(siteDir, '775');
    }

    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, me.options.dataMode);
        fs.chownSync(dataDir, me.options.dataUID, me.options.dataGID);
    }

    if (!fs.existsSync(siteDataDir)) {
        fs.mkdirSync(siteDataDir, me.options.dataMode);
        fs.chownSync(siteDataDir, me.options.dataUID, me.options.dataGID);
    }

    // write site config to file
    this.sites[siteData.handle] = siteData;

    var isNew = !fs.existsSync(siteConfigPath);

    delete siteData.create_user;

    fs.writeFileSync(siteConfigPath, JSON.stringify(siteData, null, 4));

    return {site: siteData, isNew: isNew};
};

exports.Sites.prototype.updateSiteConfig = function(handle, changes) {
    var me = this,
        siteDir = me.options.sitesDir+'/'+handle,
        filename = siteDir+'/site.json',
        siteData = this.sites[handle],
        create_user;

    _.extend(siteData, changes);

    create_user = siteData.create_user;
    delete siteData.create_user;

    fs.writeFileSync(filename, JSON.stringify(this.sites[handle], null, 4));

    if (create_user) {
        siteData.create_user = create_user;
    }
};


exports.generatePassword = exports.Sites.prototype.generatePassword = function(length) {
    length = length || 16;

    var pass = '',
        chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';

    for (var x = 0; x < length; x++) {
        pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return pass;
};