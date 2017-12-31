var _ = require('underscore'),
    util = require('util'),
    fs = require('fs'),
    path = require('path'),
    util = require('util'),
    events = require('events'),
    posix = require('posix'),
    spawn = require('child_process').spawn,
    hostile = require('hostile'),
    phpShellScript = path.resolve(__dirname, '../bin/shell'),
    uuidV1 = require('uuid/v1');


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
    me.options.localhost = me.options.localhost || '127.0.0.1';
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
            me.sites[handle] = {
                handle: handle,
                config: JSON.parse(fs.readFileSync(me.options.sitesDir+'/'+handle+'/site.json', 'ascii')),
                jobs: {}
            };
            console.log('-Loaded: '+me.sites[handle].config.primary_hostname);
        } catch (error) {
            console.log('-FAILED to load: '+handle);
        }
    });

};

util.inherits(exports.Sites, events.EventEmitter);

exports.Sites.prototype.handleRequest = function(request, response, server) {
    var me = this,
        site;

    if (request.method == 'GET') {

        if (request.path[1]) {
            site = me.sites[request.path[1]];

            if (!site) {
                console.error('Site not found: ' + request.path[1]);
                response.writeHead(404, {'Content-Type':'application/json'});
                response.end(JSON.stringify({success: false, message: 'Site not found'}));
                return;
            }

            if (request.path[2]) {
                if (request.path[2] == 'jobs') {
                    console.log('Received jobs GET request for ' + request.path[1]);
                    response.writeHead(200, {'Content-Type':'application/json'});

                    // Return specific uid
                    if (request.path[3]) {
                        response.end(JSON.stringify({
                            success: true,
                            message: 'Jobs get request finished',
                            jobs: (site.jobs[request.path[3]]) ? site.jobs[request.path[3]] : false
                        }));
                        return true;

                    // Return all jobs
                    } else {
                        response.end(JSON.stringify({
                            success: true,
                            message: 'Jobs get request finished',
                            jobs: site.jobs
                        }));
                        return true;
                    }

                } else {
                    console.error('Unhandled site sub-resource: ' + request.path[2]);
                    response.writeHead(404, {'Content-Type':'application/json'});
                    response.end(JSON.stringify({success: false, message: 'Site resource not found'}));
                    return;
                }
            }

            response.writeHead(200, {'Content-Type':'application/json'});
            response.end(JSON.stringify({data: site.config}));
            return true;
        }

        response.writeHead(200, {'Content-Type':'application/json'});
        response.end(JSON.stringify({data: _.pluck(_.values(me.sites), 'config')}));
        return true;

    } else if (request.method == 'PATCH') {

        if (request.path[1]) {
            site = me.sites[request.path[1]];

            if (!site) {
                console.error('Site not found: ' + request.path[1]);
                response.writeHead(404, {'Content-Type':'application/json'});
                response.end(JSON.stringify({success: false, message: 'Site not found'}));
                return;
            }

            var handle = request.path[1],
                siteDir = me.options.sitesDir + '/' + handle,
                siteConfigPath = siteDir + '/site.json',
                params = JSON.parse(request.content),
                siteData, siteDataTmp, uid;

            // Get existing site config
            siteData = me.sites[handle];

            // Prune jobs
            pruneJobs(siteData.jobs);

            // Apply updates except handle
            for (var k in params) {
                if (k !== 'handle') {
                    siteData.config[k] = params[k];
                }
            }

            // Update config file
            fs.writeFileSync(siteConfigPath, JSON.stringify(siteData.config, null, 4));

            // Restart nginx
            me.emit('siteUpdated', siteData);

            // Create uid
            uid = uuidV1();

            // Init job
            site.jobs[uid] = {
                'uid': uid,
                'handle': request.path[1],
                'status': 'pending',
                'received': new Date().getTime(),
                'started': null,
                'completed': null,
                'command': {
                    'action': 'config-reload'
                }
            };

            console.log('Added new job');
            console.log(site.jobs[uid]);

            // Emit job request
            me.emit('jobRequested', site.jobs[uid], request.path[1]);

            response.writeHead(200, {'Content-Type':'application/json'});
            response.end(JSON.stringify({
                success: true,
                message: 'Processed patch request',
                job: site.jobs[uid]
            }));
            return;
        }

        response.writeHead(400, {'Content-Type':'application/json'});
        response.end(JSON.stringify({success: false, error: 'Missing site identifier'}));
        return;

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
            site = me.sites[request.path[1]];

            if (!site) {
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

                    phpProc = spawn(phpShellScript, [request.path[1]]);
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

                } else if (request.path[2] == 'developers') {
                    console.log('Creating developer for ' + request.path[1] + ':' + phpShellScript);
                    response.writeHead(200, {'Content-Type':'application/json'});

                    phpProc = spawn(phpShellScript, [request.path[1], '--stdin']);

                    phpProc.stdout.on('data', function(data) {
                        console.log('php-cli stdout: ' + data);
                        response.write(data);
                    });
                    phpProc.stderr.on('data', function(data) { console.log('php-cli stderr: ' + data); });

                    requestData.AccountLevel = 'Developer';

                    phpProc.stdin.write('<?php\n');
                    phpProc.stdin.write('$userClass = User::getStaticDefaultClass();');
                    phpProc.stdin.write('$User = $userClass::create(json_decode(\''+JSON.stringify(requestData).replace(/\\/g, '\\\\').replace(/'/g, '\\\'')+'\', true));');
                    phpProc.stdin.write('$User->setClearPassword(json_decode(\''+JSON.stringify(requestData.Password).replace(/\\/g, '\\\\').replace(/'/g, '\\\'')+'\'));');
                    phpProc.stdin.write('if (!$User->validate()) JSON::respond(["success"=>false,"errors"=>$User->validationErrors]);');
                    phpProc.stdin.write('$User->save();');
                    phpProc.stdin.write('JSON::respond(["success"=>true,"data"=>$User->getData()]);');
                    phpProc.stdin.end();

                    phpProc.on('close', function (code) {
                        console.log('php-cli finished with code ' + code);
                        response.end();
                    });

                    return true;

                } else if (request.path[2] == 'jobs') {

                    console.log('Received job request for ' + request.path[1]);
                    console.log(requestData);

                    var uid, newJobs = [];

                    // Prune jobs
                    pruneJobs(site.jobs);

                    for (i=0; i<requestData.length; i++) {

                        // Create uid
                        uid = uuidV1();

                        // Init job
                        site.jobs[uid] = {
                            'uid': uid,
                            'handle': request.path[1],
                            'status': 'pending',
                            'received': new Date().getTime(),
                            'started': null,
                            'completed': null,
                            'command': requestData[i]
                        };

                        // Append new job
                        newJobs.push(site.jobs[uid]);
                        console.log('Added new job');
                        console.log(site.jobs[uid]);

                        // Emit job request
                        me.emit('jobRequested', site.jobs[uid], request.path[1]);
                    }

                    response.writeHead(200, {'Content-Type':'application/json'});
                    response.end(JSON.stringify({
                        success: true,
                        message: 'job request initiated',
                        jobs: newJobs
                    }));
                    return true;

                } else {
                    console.error('Unhandled site sub-resource: ' + request.path[2]);
                    response.writeHead(404, {'Content-Type':'application/json'});
                    response.end(JSON.stringify({success: false, message: 'Site resource not found'}));
                    return;
                }
            }

            // apply existing site's properties in
            _.defaults(requestData, site);

        }

        // create new site
        try {

            cfgResult = me.writeSiteConfig(requestData);

            if (cfgResult.isNew) {
                // write primary hostname to /etc/hosts
                if (me.options.localhost) {
                    hostile.set(me.options.localhost, cfgResult.site.primary_hostname);
                    console.log('added ' + cfgResult.site.primary_hostname + ' to /etc/hosts');
                }

                // notify plugins
                me.emit('siteCreated', cfgResult.site, requestData, {
                    databaseReady: function() {
                        // execute onSiteCreated within site's container
                        console.log('Executing Site::onSiteCreated() via php-cli');
                        phpProc = spawn(phpShellScript, [cfgResult.site.handle]);

                        phpProc.stdout.on('data', function(data) { console.log('php-cli stdout: ' + data); });
                        phpProc.stderr.on('data', function(data) { console.log('php-cli stderr: ' + data); });

                        function _phpExec(code) {
                            //console.log('php> '+code);
                            phpProc.stdin.write(code+'\n');
                        }

                        _phpExec('Site::$debug = false;');
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

// handle bulk job request
exports.Sites.prototype.handleJobsRequest = function(request, response, server) {
    var me = this;

    console.log('Received bulk job request');

    if (request.method == 'POST') {
        var requestData, cfgResult, phpProc, phpProcInitialized, site, uid, newJobs = [];

        if (request.headers['content-type'] == 'application/json') {
            requestData = JSON.parse(request.content);
        } else {
            requestData = request.content;
        }

        for (a=0; a<requestData.length; a++) {

            // Find site by handle
            site = me.sites[requestData[a].handle];

            if (!site) {
                console.error('Site not found: ' + me.sites[requestData[a].handle]);
                continue;
            }

            // Prune jobs
            pruneJobs(site.jobs);

            // Create uid
            uid = uuidV1();

            // Init job
            site.jobs[uid] = {
                'uid': uid,
                'handle': requestData[a].handle,
                'status': 'pending',
                'received': new Date().getTime(),
                'started': null,
                'completed': null,
                'command': requestData[a]
            };

            // Append new job
            newJobs.push(site.jobs[uid]);
            console.log('Added new job');
            console.log(site.jobs[uid]);

            // Emit job request with job
            me.emit('jobRequested', site.jobs[uid], requestData[a].handle);
        }

        response.writeHead(200, {'Content-Type':'application/json'});
        response.end(JSON.stringify({
            success: true,
            message: 'bulk job request initiated',
            jobs: newJobs
        }));
        return true;
    }

    // Get all jobs
    var jobs = {};
    for (var handle in me.sites) {
        if (Object.keys(me.sites[handle].jobs).length > 0) {
            jobs[handle] = me.sites[handle].jobs;
        }
    }

    response.writeHead(200, {'Content-Type':'application/json'});
    response.end(JSON.stringify({
        success: true,
        message: 'get active jobs',
        jobs: jobs
    }));
    return true;
}

// Clean up completed jobs
function pruneJobs(jobs) {
    var jobKeys = Object.keys(jobs),
        cutoffTime = new Date().getTime() - (60 * 60 * 1000); // 1 hour ago

    for (i=0; i<jobKeys.length; i++) {
        if (jobs[jobKeys[i]].completed && jobs[jobKeys[i]].completed < cutoffTime) {
            console.log('Remove completed job');
            console.log(jobs[jobKeys[i]]);
            delete jobs[jobKeys[i]];
        } else if (jobs[jobKeys[i]].status == 'failed' && jobs[jobKeys[i]].received < cutoffTime) {
            console.log('Remove failed job');
            console.log(jobs[jobKeys[i]]);
            delete jobs[jobKeys[i]];
        }
    }
}

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
    this.sites[siteData.handle] = {
        handle: siteData.handle,
        config: siteData,
        jobs: {}
    };

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

    _.extend(siteData.config, changes);

    create_user = siteData.config.create_user;
    delete siteData.config.create_user;

    fs.writeFileSync(filename, JSON.stringify(this.sites[handle].config, null, 4));

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
