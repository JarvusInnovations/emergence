var _ = require('underscore')
    ,fs = require('fs')
    ,path = require('path')
    ,util = require('util')
    ,spawn = require('child_process').spawn;

exports.createService = function(name, controller, options) {
    return new exports.phpFpm(name, controller, options);
};

exports.phpFpm = function(name, controller, options) {
    var me = this;

    // call parent constructor
    exports.phpFpm.super_.apply(me, arguments);

    // default options
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
    if(!fs.existsSync(me.options.runDir))
        fs.mkdirSync(me.options.runDir, 0775);

    if(!fs.existsSync(me.options.logsDir))
        fs.mkdirSync(me.options.logsDir, 0775);

    // check for existing master process
    if(fs.existsSync(me.options.pidPath))
    {
        me.pid = parseInt(fs.readFileSync(me.options.pidPath));
        console.log(me.name+': found existing PID: '+me.pid);
        me.status = 'online';
    }

}
util.inherits(exports.phpFpm, require('./abstract.js').AbstractService);



exports.phpFpm.prototype.start = function() {
    var me = this;

    console.log(me.name+': spawning daemon: '+me.options.execPath);

    if(me.pid)
    {
        console.log(me.name+': already running with PID '+me.pid);
        return false;
    }

    this.writeConfig();

    me.proc = spawn(me.options.execPath, ['--fpm-config', me.options.configPath]);

    me.proc.on('exit', function (code) {

        if (code !== 0)
        {
            me.status = 'offline';
            me.exitCode = code;
            console.log(me.name+': exited with code: '+code);
        }

        // look for pid
        if(fs.existsSync(me.options.pidPath))
        {
            me.pid = parseInt(fs.readFileSync(me.options.pidPath));
            console.log(me.name+': found new PID: '+me.pid);
            me.status = 'online';
        }
        else
        {
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


exports.phpFpm.prototype.stop = function() {
    var me = this;

    if(!me.pid)
        return false;

    try
    {
        process.kill(me.pid, 'SIGQUIT');
    }
    catch(error)
    {
        console.log(me.name+': failed to stop process: '+error);
        return false;
    }

    me.status = 'offline';
    me.pid = null;
    return true;
}


exports.phpFpm.prototype.restart = function() {
    var me = this;

    if(!me.pid)
        return false;

    this.writeConfig();

    try
    {
        process.kill(me.pid, 'SIGUSR2');
    }
    catch(error)
    {
        console.log(me.name+': failed to restart process: '+error);
        return false;
    }

    console.log(me.name+': reloaded config for process '+me.pid);

    return true;
}


exports.phpFpm.prototype.writeConfig = function() {
    fs.writeFileSync(this.options.configPath, this.makeConfig());
};

exports.phpFpm.prototype.makeConfig = function() {
    var me = this
        ,c = '';

    c += '[global]\n';
    c += 'pid = '+me.options.pidPath+'\n';
    c += 'error_log = '+me.options.errorLogPath+'\n';
    c += '[www]\n';
    c += 'user = '+me.options.user+'\n';
    c += 'group = '+me.options.group+'\n';
    c += 'listen = '+me.options.socketPath+'\n';
    c += 'listen.owner = '+me.options.user+'\n';
    c += 'listen.group = '+me.options.group+'\n';
    c += 'pm = dynamic\n';
    c += 'pm.max_children = '+(me.options.maxClients||50)+'\n';
    c += 'pm.start_servers = 5\n';
    c += 'pm.min_spare_servers = 1\n';
    c += 'pm.max_spare_servers = '+Math.round((me.options.maxClients||50)/5)+'\n';
    if (me.options.statusPath) {
        c += 'pm.status_path = '+me.options.statusPath+'\n';
    }
    c += 'php_admin_flag[short_open_tag]=on\n';
    c += 'php_admin_value[apc.shm_size]=512M\n';
    c += 'php_admin_value[apc.shm_segments]=1\n';
    c += 'php_admin_value[apc.slam_defense]=0\n';
    c += 'php_admin_value[apc.stat]='+(me.options.statScripts?'1':'0')+'\n';
    c += 'php_admin_value[opcache.validate_timestamps]='+(me.options.statScripts?'1':'0')+'\n';
    c += 'php_admin_value[upload_max_filesize]=200M\n';
    c += 'php_admin_value[post_max_size]=200M\n';
    c += 'php_admin_value[memory_limit]='+(me.options.memoryLimit ? me.options.memoryLimit : '200M')+'\n';
    c += 'php_admin_value[error_reporting]=E_ALL & ~E_NOTICE\n';
    c += 'php_admin_value[date.timezone]=America/New_York\n';

    return c;
};
