var _ = require('underscore'),
    fs = require('fs'),
    path = require('path'),
    util = require('util'),
    spawn = require('child_process').spawn;

exports.createService = function(name, controller, options) {
    return new exports.NginxService(name, controller, options);
};

exports.NginxService = function(name, controller, options) {
    var me = this;

    // call parent constructor
    exports.NginxService.super_.apply(me, arguments);

    // initialize configuration
    me.packagePath = options.packagePath;
    me.execPath = me.packagePath + '/bin/nginx';

    me.configPath = '/hab/svc/emergence-kernel/config/nginx';
    me.sitesConfigPath = '/hab/svc/emergence-kernel/var/config/nginx.sites';
    me.pidPath = '/hab/svc/emergence-kernel/var/run/nginx.pid';

    me.bindHost = options.bindHost || '127.0.0.1';
    me.bindPort = options.bindPort || 80;


    // check for existing master process
    if (fs.existsSync(me.pidPath)) {
        me.pid = parseInt(fs.readFileSync(me.pidPath, 'ascii'));
        console.log(me.name+': found existing PID: '+me.pid);
        me.status = 'online';
    }

    // listen for site creation
    controller.sites.on('siteCreated', _.bind(me.onSiteCreated, me));

    // listen for site updated
    controller.sites.on('siteUpdated', _.bind(me.onSiteCreated, me));
};

util.inherits(exports.NginxService, require('./abstract.js').AbstractService);



exports.NginxService.prototype.start = function() {
    var me = this;

    console.log(me.name+': spawning daemon: '+me.execPath);

    if (me.pid) {
        console.log(me.name+': already running with PID '+me.pid);
        return false;
    }

    this.writeSitesConfig();

    me.proc = spawn(me.execPath, ['-c', me.configPath]);

    me.proc.on('exit', function (code) {

        if (code !== 0) {
            me.status = 'offline';
            me.exitCode = code;
            console.log(me.name+': exited with code: '+code);
        }

        // look for pid
        if (fs.existsSync(me.pidPath)) {
            me.pid = parseInt(fs.readFileSync(me.pidPath, 'ascii'));
            console.log(me.name+': found new PID: '+me.pid);
            me.status = 'online';
        } else {
            console.log(me.name+': failed to find pid after launching, waiting 1000ms and trying again...');
            setTimeout(function() {

                if (fs.existsSync(me.pidPath)) {
                    me.pid = parseInt(fs.readFileSync(me.pidPath, 'ascii'));
                    console.log(me.name+': found new PID: '+me.pid);
                    me.status = 'online';
                } else {
                    console.log(me.name+': failed to find pid after launching');
                    me.status = 'unknown';
                    me.pid = null;
                }
            }, 1000);
        }
    });

    me.proc.stdout.on('data', function (data) {
        console.log(me.name+': stdout:\n\t' + data.toString().replace(/\n/g,'\n\t'));
    });

    me.proc.stderr.on('data', function (data) {
        console.log(me.name+': stderr:\n\t' + data.toString().replace(/\n/g,'\n\t'));

        if (/^execvp\(\)/.test(data)) {
            console.log('Failed to start child process.');
            me.status = 'offline';
        }
    });

    this.status = 'online';
    return true;
};


exports.NginxService.prototype.stop = function() {
    var me = this;

    if (!me.pid) {
        return false;
    }

    try {
        process.kill(me.pid, 'SIGQUIT');
    } catch (error) {
        console.log(me.name+': failed to stop process: '+error);
        return false;
    }

    me.status = 'offline';
    me.pid = null;
    return true;
};


exports.NginxService.prototype.restart = function() {
    var me = this;

    if (!me.pid) {
        return false;
    }

    this.writeSitesConfig();

    try {
        process.kill(me.pid, 'SIGHUP');
    } catch (error) {
        console.log(me.name+': failed to restart process: '+error);
        return false;
    }

    console.log(me.name+': reloaded config for process '+me.pid);

    return true;
};


exports.NginxService.prototype.writeSitesConfig = function() {
    fs.writeFileSync(this.sitesConfigPath, this.makeSitesConfig());
};

exports.NginxService.prototype.makeSitesConfig = function() {
    var me = this,
        phpSocketPath = me.controller.services['php'].socketPath,
        phpBootstrapDir = me.controller.services['php'].bootstrapDir,
        config = [];

    // format socket path
    if (phpSocketPath[0] == '/') {
        phpSocketPath = 'unix:'+phpSocketPath;
    }

    // configure each site
    _.each(me.controller.sites.sites, function(site, handle) {
        var hostnames = site.hostnames.slice(),
            siteDir = me.controller.sites.sitesDir+'/'+handle,
            logsDir = siteDir+'/logs',
            siteConfig = [],
            sslHostnames, sslHostname;

        // process hostnames
        if (_.indexOf(hostnames, site.primary_hostname) == -1) {
            hostnames.unshift(site.primary_hostname);
        }

        // process directories
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, '775');
        }

        siteConfig.push(
            '        access_log '+logsDir+'/access.log main;',
            '        error_log '+logsDir+'/error.log notice;',

            '        location / {',
            '            fastcgi_pass '+phpSocketPath+';',
            '            include '+me.packagePath+'/config/fastcgi_params;',
            '            fastcgi_param HTTPS $php_https;',
            '            fastcgi_param PATH_INFO $fastcgi_script_name;',
            '            fastcgi_param SITE_ROOT '+siteDir+';',
            '            fastcgi_param SCRIPT_FILENAME '+phpBootstrapDir+'/web.php;',
            '        }'
        );


        // append config
        config.push(
            '    server {',
            '        listen '+me.bindHost+':'+me.bindPort+';',
            '        server_name '+hostnames.join(' ')+';',
            '        set $php_https "";'
        );

        config.push.apply(config, siteConfig);

        config.push(
            '    }'
        );

        if (site.ssl) {
            if (site.ssl.hostnames) {
                sslHostnames = site.ssl.hostnames;
            } else {
                sslHostnames = {};
                sslHostnames[site.primary_hostname] = site.ssl;

                site.hostnames.forEach(function(hostname) {
                    sslHostnames[hostname] = site.ssl;
                });
            }

            for (sslHostname in sslHostnames) {
                config.push(
                    '    server {',
                    '        listen '+me.bindHost+':443;',
                    '        server_name '+sslHostname+';',
                    '        set $php_https on;',

                    '        ssl on;',
                    '        ssl_protocols TLSv1 TLSv1.1 TLSv1.2;',
                    '        ssl_certificate '+sslHostnames[sslHostname].certificate+';',
                    '        ssl_certificate_key '+sslHostnames[sslHostname].certificate_key+';'
                );

                config.push.apply(config, siteConfig);

                config.push('    }');
            }
        }
    });

    return config.join('\n');
};


exports.NginxService.prototype.onSiteCreated = function(siteData) {
    this.restart();
};
