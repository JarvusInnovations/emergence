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

    // default options
    me.options.bootstrapDir = me.options.bootstrapDir || path.resolve(__dirname, '../../php-bootstrap');
    me.options.configPath = me.options.configPath || controller.options.configDir + '/nginx.conf';
    me.options.execPath = me.options.execPath || '/usr/sbin/nginx';
    me.options.bindHost = me.options.bindHost || '127.0.0.1';
    me.options.bindPort = me.options.bindPort || 80;
    me.options.runDir = me.options.runDir || controller.options.runDir + '/nginx';
    me.options.logsDir = me.options.logsDir || controller.options.logsDir + '/nginx';
    me.options.pidPath = me.options.pidPath || me.options.runDir + '/nginx.pid';
    me.options.errorLogPath = me.options.errorLogPath || me.options.logsDir + '/errors.log';
    me.options.miscConfigDir = me.options.miscConfigDir || (process.platform=='darwin'?'/usr/local/etc/nginx':'/etc/nginx');
    me.options.user = me.options.user || controller.options.user;
    me.options.group = me.options.group || controller.options.group;

    // create required directories
    if (!fs.existsSync(me.options.runDir)) {
        fs.mkdirSync(me.options.runDir, '775');
    }

    if (!fs.existsSync(me.options.logsDir)) {
        fs.mkdirSync(me.options.logsDir, '775');
    }

    // check for existing master process
    if (fs.existsSync(me.options.pidPath)) {
        me.pid = parseInt(fs.readFileSync(me.options.pidPath, 'ascii'));
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

    console.log(me.name+': spawning daemon: '+me.options.execPath);

    if (me.pid) {
        console.log(me.name+': already running with PID '+me.pid);
        return false;
    }

    this.writeConfig();

    me.proc = spawn(me.options.execPath, ['-c', me.options.configPath]);

    me.proc.on('exit', function (code) {

        if (code !== 0) {
            me.status = 'offline';
            me.exitCode = code;
            console.log(me.name+': exited with code: '+code);
        }

        // look for pid
        if (fs.existsSync(me.options.pidPath)) {
            me.pid = parseInt(fs.readFileSync(me.options.pidPath, 'ascii'));
            console.log(me.name+': found new PID: '+me.pid);
            me.status = 'online';
        } else {
            console.log(me.name+': failed to find pid after launching, waiting 1000ms and trying again...');
            setTimeout(function() {

                if (fs.existsSync(me.options.pidPath)) {
                    me.pid = parseInt(fs.readFileSync(me.options.pidPath, 'ascii'));
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

    this.writeConfig();

    try {
        process.kill(me.pid, 'SIGHUP');
    } catch (error) {
        console.log(me.name+': failed to restart process: '+error);
        return false;
    }

    console.log(me.name+': reloaded config for process '+me.pid);

    return true;
};


exports.NginxService.prototype.writeConfig = function() {
    fs.writeFileSync(this.options.configPath, this.makeConfig());
};

exports.NginxService.prototype.makeConfig = function() {
    var me = this,
        config = [];

    // configure top-level options
    config.push(
        'user '+me.options.user+' '+me.options.group+';',
        'worker_processes auto;',
        'pid '+me.options.pidPath+';',
        'error_log '+me.options.errorLogPath+' info;'
    );


    // configure connection processing
    config.push(
        'events {',
        '    worker_connections 1024;'
    );

    if (process.platform == 'linux') {
        config.push('    use epoll;');
    }

    config.push(
        '}' // end events block
    );


    // configure http options
    config.push(
        'http {',
        '    include '+me.options.miscConfigDir+'/mime.types;',
        '    default_type application/octet-stream;',

        '    log_format main',
        '        \'$host $remote_addr - $remote_user [$time_local] \'',
        '        \'"$request" $status $bytes_sent \'',
        '        \'"$http_referer" "$http_user_agent" \'',
        '        \'"$gzip_ratio"\';',

        '    client_header_timeout 10m;',
        '    client_body_timeout 10m;',
        '    send_timeout 10m;',

        '    connection_pool_size 256;',
        '    client_max_body_size 200m;',
        '    client_body_buffer_size 128k;',
        '    client_header_buffer_size 1k;',
        '    large_client_header_buffers 8 512k;',
        '    request_pool_size 4k;',
        '    server_names_hash_bucket_size 1024;',
        '    types_hash_max_size 2048;',

        '    gzip on;',
        '    gzip_min_length 1100;',
        '    gzip_buffers 4 8k;',
        '    gzip_types text/plain text/css text/x-scss text/x-html-template text/x-component text/xml application/xml application/javascript application/json application/php application/atom+xml application/rss+xml application/vnd.ms-fontobject application/x-font-ttf application/xhtml+xml font/opentype image/svg+xml image/x-icon;',

        '    output_buffers 1 32k;',
        '    postpone_output 1460;',

        '    sendfile on;',
        '    tcp_nopush on;',
        '    tcp_nodelay on;',

        '    keepalive_timeout 75 20;',

        '    ignore_invalid_headers on;',

        '    index index.php;',

        '    fastcgi_index index.php;',
        '    fastcgi_read_timeout 6h;',
        '    fastcgi_buffers 32 64k;',

        '    server_tokens off;'
/*

        '  server {',
        '      server_name _;',
        '      access_log /emergence/logs/access.log main;',
        '      error_log /emergence/logs/error.log info;',
        '  }',
*/
    );

    _.each(me.controller.sites.sites, function(site, handle) {
        var hostnames = site.hostnames.slice(),
            siteDir = me.controller.sites.options.sitesDir+'/'+handle,
            logsDir = siteDir+'/logs',
            phpSocketPath = me.controller.services['php'].options.socketPath,
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

        // format socket path
        if (phpSocketPath[0] == '/') {
            phpSocketPath = 'unix:'+phpSocketPath;
        }

        siteConfig.push(
            '        access_log '+logsDir+'/access.log main;',
            '        error_log '+logsDir+'/error.log notice;',

            '        location / {',
            '            include '+me.options.miscConfigDir+'/fastcgi_params;',
            '            fastcgi_param HTTPS $php_https;',
            '            fastcgi_pass '+phpSocketPath+';',
            '            fastcgi_param PATH_INFO $fastcgi_script_name;',
            '            fastcgi_param SITE_ROOT '+siteDir+';',
            '            fastcgi_param SCRIPT_FILENAME '+me.options.bootstrapDir+'/web.php;',
            '        }'
        );


        // append config
        config.push(
            '    server {',
            '        listen '+me.options.bindHost+':'+me.options.bindPort+';',
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
                    '        listen '+me.options.bindHost+':443;',
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

    config.push(
        '}' // end http block
    );

    return config.join('\n');
};


exports.NginxService.prototype.onSiteCreated = function(siteData) {
    this.restart();
};
