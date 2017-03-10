var _ = require('underscore'),
    fs = require('fs'),
    path = require('path'),
    util = require('util'),
    spawn = require('child_process').spawn,
    phpfpm = require('node-phpfpm');

exports.createService = function(name, controller, options) {
    return new exports.PhpFpmService(name, controller, options);
};

exports.PhpFpmService = function(name, controller, options) {
    var me = this;

    // call parent constructor
    exports.PhpFpmService.super_.apply(me, arguments);

    // default options
    me.options.bootstrapDir = me.options.bootstrapDir || path.resolve(__dirname, '../../php-bootstrap');
    me.options.configPath = me.options.configPath || controller.options.configDir + '/php-fpm.conf';
    me.options.execPath = me.options.execPath || '/usr/bin/php-fpm';
    me.options.statScripts = me.options.statScripts || false;
    me.options.runDir = me.options.runDir || controller.options.runDir + '/php-fpm';
    me.options.logsDir = me.options.logsDir || controller.options.logsDir + '/php-fpm';
    me.options.pidPath = me.options.pidPath || me.options.runDir + '/php-fpm.pid';
    me.options.socketPath = me.options.socketPath || me.options.runDir + '/php-fpm.sock';
    me.options.errorLogPath = me.options.errorLogPath || me.options.logsDir + '/errors.log';
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

    // listen for site updated
    controller.sites.on('siteUpdated', _.bind(me.onSiteUpdated, me));
};

util.inherits(exports.PhpFpmService, require('./abstract.js').AbstractService);



exports.PhpFpmService.prototype.start = function() {
    var me = this;

    console.log(me.name+': spawning daemon: '+me.options.execPath);

    if (me.pid) {
        console.log(me.name+': already running with PID '+me.pid);
        return false;
    }

    this.writeConfig();

    me.proc = spawn(me.options.execPath, ['--fpm-config', me.options.configPath]);

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
            console.log(me.name+': failed to find pid after launching');
            me.status = 'unknown';
            me.pid = null;
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
}


exports.PhpFpmService.prototype.stop = function() {
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


exports.PhpFpmService.prototype.restart = function() {
    var me = this;

    if (!me.pid) {
        return false;
    }

    this.writeConfig();

    try {
        process.kill(me.pid, 'SIGUSR2');
    } catch (error) {
        console.log(me.name+': failed to restart process: '+error);
        return false;
    }

    console.log(me.name+': reloaded config for process '+me.pid);

    return true;
};


exports.PhpFpmService.prototype.writeConfig = function() {
    fs.writeFileSync(this.options.configPath, this.makeConfig());
};

exports.PhpFpmService.prototype.makeConfig = function() {
    var me = this,
        config = [];

    config.push(
        '[global]',
        'pid                                            = '+me.options.pidPath,
        'error_log                                      = '+me.options.errorLogPath
    );

    config.push(
        '[www]',
        'user                                           = '+me.options.user,
        'group                                          = '+me.options.group,
        'catch_workers_output                           = on',
        'listen                                         = '+me.options.socketPath,
        'listen.owner                                   = '+me.options.user,
        'listen.group                                   = '+me.options.group,
        'pm                                             = dynamic',
        'pm.max_children                                = '+(me.options.maxClients||50),
        'pm.start_servers                               = '+(me.options.startServers||5),
        'pm.min_spare_servers                           = '+(me.options.minSpareServers||1),
        'pm.max_spare_servers                           = '+Math.round((me.options.maxClients||50)/(me.options.startServers||5))
    );

    if (me.options.statusPath) {
        config.push('pm.status_path                         = '+me.options.statusPath);
    }

    config.push(
        'php_admin_flag[short_open_tag]                 = on',
        'php_admin_value[apc.shm_size]                  = 512M',
        'php_admin_value[apc.shm_segments]              = 1',
        'php_admin_value[apc.slam_defense]              = 0',
        'php_admin_value[apc.stat]                      = '+(me.options.statScripts?'1':'0'),
        'php_admin_value[opcache.validate_timestamps]   = '+(me.options.statScripts?'1':'0'),
        'php_admin_value[upload_max_filesize]           = '+(me.options.uploadMaxSize ? me.options.uploadMaxSize : '200M'),
        'php_admin_value[post_max_size]                 = '+(me.options.postMaxSize ? me.options.postMaxSize : '200M'),
        'php_admin_value[memory_limit]                  = '+(me.options.memoryLimit ? me.options.memoryLimit : '200M'),
        'php_admin_value[error_reporting]               = '+(me.options.errorReporting ? me.options.errorReporting : 'E_ALL & ~E_NOTICE'),
        'php_admin_value[date.timezone]                 = '+(me.options.defaultTimezone ? me.options.defaultTimezone : 'America/New_York')
    );

    return config.join('\n');
};

exports.PhpFpmService.prototype.onSiteUpdated = function(siteData) {
    var me = this,
        siteRoot = me.controller.sites.options.sitesDir + '/' + siteData.handle,
        phpClient;

    console.log(me.name+': clearing config cache for '+siteRoot);

    // Connect to FPM worker pool
    phpClient = new phpfpm({
        sockFile: me.options.socketPath,
        documentRoot: me.options.bootstrapDir + '/'
    });

    // Clear cached site.json
    phpClient.run({
        uri: 'cache.php',
        form: {
            cacheKey: siteRoot
        }
    }, function(err, output, phpErrors) {
        if (err == 99) console.error('PHPFPM server error');
        console.log(output);
        if (phpErrors) console.error(phpErrors);
    });
};
