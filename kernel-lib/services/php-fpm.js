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

    // initialize configuration
    me.packagePath = options.packagePath;
    me.execPath = me.packagePath + '/sbin/php-fpm';

    me.phpConfigPath = '/hab/svc/emergence-kernel/config/php.ini';
    me.fpmConfigPath = '/hab/svc/emergence-kernel/config/php-fpm';
    me.pidPath = '/hab/svc/emergence-kernel/var/run/php-fpm.pid';
    me.socketPath = '/hab/svc/emergence-kernel/var/run/php-fpm.sock';
    me.errorLogPath = '/hab/svc/emergence-kernel/var/log/php-fpm.err';
    me.dataDir = '/hab/svc/emergence-kernel/var/mariadb';
    me.bootstrapDir = '/hab/svc/emergence-kernel/static/php-bootstrap';


    // check for existing master process
    if (fs.existsSync(me.pidPath)) {
        me.pid = parseInt(fs.readFileSync(me.pidPath, 'ascii'));
        console.log(me.name+': found existing PID: '+me.pid);
        me.status = 'online';
    }

    // listen for site updated
    controller.sites.on('siteUpdated', _.bind(me.onSiteUpdated, me));
};

util.inherits(exports.PhpFpmService, require('./abstract.js').AbstractService);



exports.PhpFpmService.prototype.start = function() {
    var me = this;

    console.log(me.name+': spawning daemon: '+me.execPath);

    if (me.pid) {
        console.log(me.name+': already running with PID '+me.pid);
        return false;
    }

    me.proc = spawn(me.execPath, ['-c', me.phpConfigPath, '--fpm-config', me.fpmConfigPath]);

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

    try {
        process.kill(me.pid, 'SIGUSR2');
    } catch (error) {
        console.log(me.name+': failed to restart process: '+error);
        return false;
    }

    console.log(me.name+': reloaded config for process '+me.pid);

    return true;
};


exports.PhpFpmService.prototype.onSiteUpdated = function(siteData) {
    var me = this,
        siteRoot = me.controller.sites.sitesDir + '/' + siteData.handle,
        phpClient;

    console.log(me.name+': clearing config cache for '+siteRoot);

    // Connect to FPM worker pool
    phpClient = new phpfpm({
        sockFile: me.socketPath,
        documentRoot: me.bootstrapDir + '/'
    });

    // Clear cached site.json
    phpClient.run({
        uri: 'cache.php',
        json: [
            { action: 'delete', key: siteRoot }
        ]
    }, function(err, output, phpErrors) {
        if (err == 99) console.error('PHPFPM server error');
        console.log(output);
        if (phpErrors) console.error(phpErrors);
    });
};
