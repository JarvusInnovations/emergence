var fs    = require('fs'),
    path  = require('path'),
    util  = require('util'),
    spawn = require('child_process').spawn;

function nginx(name, controller, options) {
    var me = this;

    // call parent constructor
    nginx.super_.apply(me, arguments);

    // default options
    me.options.bootstrapDir  = me.options.bootstrapDir  || path.resolve(__dirname, '../../php-bootstrap');
    me.options.configPath    = me.options.configPath    || controller.options.configDir + '/nginx.conf';
    me.options.execPath      = me.options.execPath      || '/usr/sbin/nginx';
    me.options.bindHost      = me.options.bindHost      || '127.0.0.1';
    me.options.bindPort      = me.options.bindPort      || 80;
    me.options.runDir        = me.options.runDir        || controller.options.runDir + '/nginx';
    me.options.logsDir       = me.options.logsDir       || controller.options.logsDir + '/nginx';
    me.options.pidPath       = me.options.pidPath       || me.options.runDir + '/nginx.pid';
    me.options.errorLogPath  = me.options.errorLogPath  || me.options.logsDir + '/errors.log';
    me.options.miscConfigDir = me.options.miscConfigDir || (process.platform == 'darwin' ? '/usr/local/etc/nginx' : '/etc/nginx')
    me.options.user          = me.options.user          || controller.options.user;
    me.options.group         = me.options.group         || controller.options.group;

    me.pid = null;

    // create required directories
    if (!fs.existsSync(me.options.runDir)) {
        fs.mkdirSync(me.options.runDir, 0775);
    }

    if (!fs.existsSync(me.options.logsDir)) {
        fs.mkdirSync(me.options.logsDir, 0775);
    }

    // check for existing master process
    if (fs.existsSync(me.options.pidPath)) {
        me.pid = parseInt(fs.readFileSync(me.options.pidPath));
        console.log(me.name + ': found existing PID: ' + me.pid);

        if (me.isRunning()) {
            me.status = 'online';
        } else {
            me.status = 'offline';
            me.pid = null;
            console.log(me.name + ': deleting stale PID file');
            fs.unlink(me.options.pidPath);
        }
    }

    // listen for site creation
    controller.sites.on('siteCreated', me.onSiteCreated);
}

util.inherits(nginx, require('./abstract.js').AbstractService);

nginx.prototype.start = function () {
    var me = this;

    console.log(me.name + ': spawning daemon: ' + me.options.execPath);

    if (me.isRunning()) {
        console.log(me.name + ': already running with PID ' + me.pid);
        return;
    }

    me.writeConfig();

    me.proc = spawn(me.options.execPath, ['-c', me.options.configPath]);
    me.pid = me.proc.pid;

    me.proc.on('exit', function (code) {

        if (code !== 0) {
            console.log(me.name + ': exited with code: ' + code);
        }

        me.status = 'offline';
        me.exitCode = code;
        me.pid = null;
    });

    me.proc.stdout.on('data', function (data) {
        console.log(me.name + ': stdout:\n\t' + data.toString().replace(/\n/g, '\n\t'));
    });

    me.proc.stderr.on('data', function (data) {
        console.log(me.name + ': stderr:\n\t' + data.toString().replace(/\n/g, '\n\t'));

        if (/^execvp\(\)/.test(data)) {
            console.log('Failed to start child process.');
            me.status = 'offline';
            me.pid = null;
        }
    });

    me.status = 'online';

    return true;
};

nginx.prototype.stop = function () {
    var me = this;

    if (me.pid === null) {
        return false;
    }

    try {
        process.kill(me.pid, 'SIGQUIT');
    } catch (error) {
        console.log(me.name + ': failed to stop process: ' + error);
    }

    me.status = 'offline';
    me.pid = null;

    return true;
};

nginx.prototype.restart = function () {
    var me = this;

    console.log(me + ': restarting');

    if (me.isRunning()) {
        me.stop();
        me.start();
    } else {
        me.start();
    }

    return true;
};

nginx.prototype.writeConfig = function () {
    fs.writeFileSync(this.options.configPath, this.makeConfig());
};

nginx.prototype.makeConfig = function () {
    var me = this,
        c = '',
        handle,
        site,
        hostnames,
        siteDir,
        logsDir,
        phpSocketPath,
        siteCfg,
        sslHostnames,
        sslHostname;

    c += 'user ' + me.options.user + ' ' + me.options.group + ';\n';
    c += 'worker_processes auto;\n';
    c += 'pid ' + me.options.pidPath + ';\n';
    c += 'error_log ' + me.options.errorLogPath + ' info;\n';

    c += 'events {\n';
    c += '	worker_connections 1024;\n';

    if (process.platform == 'linux') {
        c += '	use epoll;\n';
    }

    c += '}\n';

    c += 'http {\n';
    c += '	include ' + me.options.miscConfigDir + '/mime.types;\n';
    c += '	default_type application/octet-stream;\n';

    c += '	log_format main\n';
    c += '		\'$host $remote_addr - $remote_user [$time_local] \'\n';
    c += '		\'"$request" $status $bytes_sent \'\n';
    c += '		\'"$http_referer" "$http_user_agent" \'\n';
    c += '		\'"$gzip_ratio"\';\n';

    c += '	client_header_timeout 10m;\n';
    c += '	client_body_timeout 10m;\n';
    c += '	send_timeout 10m;\n';

    c += '	connection_pool_size 256;\n';
    c += '	client_max_body_size 200m;\n';
    c += '	client_body_buffer_size 128k;\n';
    c += '	client_header_buffer_size 1k;\n';
    c += '	large_client_header_buffers 8 512k;\n';
    c += '	request_pool_size 4k;\n';
    c += '	server_names_hash_bucket_size 1024;\n';
    c += '	types_hash_max_size 2048;\n';

    c += '	gzip on;\n';
    c += '	gzip_min_length 1100;\n';
    c += '	gzip_buffers 4 8k;\n';
    c += '	gzip_types text/plain text/css text/x-scss text/x-html-template text/x-component text/xml application/xml application/javascript application/json application/php application/atom+xml application/rss+xml application/vnd.ms-fontobject application/x-font-ttf application/xhtml+xml font/opentype image/svg+xml image/x-icon;\n';

    c += '	output_buffers 1 32k;\n';
    c += '	postpone_output 1460;\n';

    c += '	sendfile on;\n';
    c += '	tcp_nopush on;\n';
    c += '	tcp_nodelay on;\n';

    c += '	keepalive_timeout 75 20;\n';

    c += '	ignore_invalid_headers on;\n';

    c += '	index index.php;\n';

    c += '	fastcgi_index index.php;\n';
    c += '	fastcgi_read_timeout 6h;\n';
    c += '	fastcgi_buffers 32 64k;\n';

    c += '	server_tokens off;\n';
    /*

     c += '	server {\n';
     c += '		server_name _;\n';
     c += '		access_log /emergence/logs/access.log main;\n';
     c += '		error_log /emergence/logs/error.log info;\n';
     c += '	}\n';
     */

    for (handle in me.controller.sites.sites) {
        site = me.controller.sites.sites[handle];
        siteCfg = '';

        // process hostnames
        hostnames = site.hostnames.slice();

        if (hostnames.indexOf(site.primary_hostname) === -1) {
            hostnames.unshift(site.primary_hostname);
        }

        // process directories
        siteDir = me.controller.sites.options.sitesDir + '/' + handle;
        logsDir = siteDir + '/logs';

        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, 0775);
        }

        siteCfg += '		access_log ' + logsDir + '/access.log main;\n';
        siteCfg += '		error_log ' + logsDir + '/error.log notice;\n';

        phpSocketPath = me.controller.services['php'].options.socketPath;

        if (phpSocketPath[0] == '/') {
            phpSocketPath = 'unix:' + phpSocketPath;
        }

        siteCfg += '		location / {\n';
        siteCfg += '			include ' + me.options.miscConfigDir + '/fastcgi_params;\n';
        siteCfg += '			fastcgi_param HTTPS $php_https;\n';
        siteCfg += '			fastcgi_pass ' + phpSocketPath + ';\n';
        siteCfg += '			fastcgi_param PATH_INFO $fastcgi_script_name;\n';
        siteCfg += '			fastcgi_param SITE_ROOT ' + siteDir + ';\n';
        siteCfg += '			fastcgi_param SCRIPT_FILENAME ' + me.options.bootstrapDir + '/web.php;\n';
        siteCfg += '		}\n';

        // append config
        c += '	server {\n';
        c += '		listen ' + me.options.bindHost + ':' + me.options.bindPort + ';\n';
        c += '		server_name ' + hostnames.join(' ') + ';\n';
        c += '		set $php_https "";\n';
        c += siteCfg;
        c += '	}\n';

        if (site.ssl) {
            if (site.ssl.hostnames) {
                sslHostnames = site.ssl.hostnames;
            } else {
                sslHostnames = {};
                sslHostnames[site.primary_hostname] = site.ssl;
                sslHostnames[site.primary_hostname] = site.ssl;
            }

            for (sslHostname in sslHostnames) {
                c += '	server {\n';
                c += '		listen ' + me.options.bindHost + ':443;\n';
                c += '		server_name ' + sslHostname + ';\n';
                c += '		set $php_https on;\n';

                c += '		ssl on;\n';
                c += '		ssl_protocols TLSv1 TLSv1.1 TLSv1.2;\n';
                c += '		ssl_certificate ' + sslHostnames[sslHostname].certificate + ';\n';
                c += '		ssl_certificate_key ' + sslHostnames[sslHostname].certificate_key + ';\n';

                c += siteCfg;
                c += '	}\n';
            }
        }
    }

    c += '}\n';

    return c;
};

nginx.prototype.onSiteCreated = function onSiteCreated() {
    console.log(this.name + ': reloading config');

    this.writeConfig();

    if (this.proc) {
        this.proc.kill('SIGHUP');
    } else {
        this.restart();
    }
};

exports.nginx = nginx;

exports.createService = function createService(name, controller, options) {
    return new nginx(name, controller, options);
};