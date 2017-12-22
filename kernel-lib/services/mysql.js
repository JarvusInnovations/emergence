var _ = require('underscore'),
    fs = require('fs'),
    path = require('path'),
    util = require('util'),
    spawn = require('child_process').spawn,
    exec = require('child_process').exec,
    shell = require('shelljs'),
    semver = require('semver'),
    mysql = require('mysql2');

exports.createService = function(name, controller, options) {
    return new exports.MysqlService(name, controller, options);
};

exports.MysqlService = function(name, controller, options) {
    var me = this,
        versionMatch;

    // call parent constructor
    exports.MysqlService.super_.apply(me, arguments);

    // default options
    me.options.configPath = me.options.configPath || controller.options.configDir + '/my.cnf';
    me.options.execPath = me.options.execPath || '/usr/sbin/mysqld';
    me.options.bindHost = me.options.bindHost || false;
    me.options.runDir = me.options.runDir || controller.options.runDir + '/mysqld';
    me.options.pidPath = me.options.pidPath || me.options.runDir + '/mysqld.pid';
    me.options.socketPath = me.options.socketPath || me.options.runDir + '/mysqld.sock';
    me.options.dataDir = me.options.dataDir || controller.options.dataDir + '/mysql';
    me.options.logsDir = me.options.logsDir || controller.options.logsDir + '/mysql';
    me.options.errorLogPath = me.options.errorLogPath || me.options.logsDir + '/mysqld.err';
    me.options.managerUser = me.options.managerUser || 'emergence';
    me.options.managerPassword = me.options.managerPassword || '';


    // verify binary
    if (!fs.existsSync(me.options.execPath)) {
        throw 'execPath not found: ' + me.options.execPath;
    }

    // check binary version
    console.log(me.name+': detecting mysqld version...');
    versionMatch = shell.exec(me.options.execPath+' --version').output.match(/mysqld\s+Ver\s+(\d+(\.\d+)*)(-MariaDB)?/);

    if (!versionMatch) {
        throw 'Failed to detect mysql version';
    }

    me.mysqldVersion = versionMatch[1];
    me.mysqldIsMaria = versionMatch[3] == '-MariaDB';
    console.log('%s: determined mysqld version: %s', me.name, me.mysqldVersion + (me.mysqldIsMaria ? ' (MariaDB)' : ''));

    // check for existing mysqld process
    if (fs.existsSync(me.options.pidPath)) {
        me.pid = parseInt(fs.readFileSync(me.options.pidPath, 'ascii'));
        console.log(me.name+': found existing PID: '+me.pid+', checking /proc/'+me.pid);

        if (fs.existsSync('/proc/'+me.pid)) {
            me.status = 'online';
        } else {
            console.log(me.name+': process '+me.pid + ' not found, deleting .pid file');
            fs.unlinkSync(me.options.pidPath);
        }
    }

    // listen for site creation
    controller.sites.on('siteCreated', _.bind(me.onSiteCreated, me));
};

util.inherits(exports.MysqlService, require('./abstract.js').AbstractService);



exports.MysqlService.prototype.start = function(firstRun) {
    var me = this;

    if (me.pid) {
        console.log(me.name+': mysql already runnig with PID '+me.pid);
        return false;
    }

    // write configuration file
    this.writeConfig();

    // init logs directory if needed
    if (!fs.existsSync(me.options.logsDir)) {
        console.log(me.name+': initializing new log directory');
        fs.mkdirSync(me.options.logsDir, '775');
        exec('chown -R mysql:mysql '+me.options.logsDir);
    }


    // init run directory if needed
    if (!fs.existsSync(me.options.runDir)) {
        console.log(me.name+': initializing new run directory');
        fs.mkdirSync(me.options.runDir, '775');
        exec('chown -R mysql:mysql '+me.options.runDir);
    }

    // init data directory if needed
    if (!fs.existsSync(me.options.dataDir)) {
        console.log(me.name+': initializing new data directory...');
        fs.mkdirSync(me.options.dataDir, '775');
        exec('chown -R mysql:mysql '+me.options.dataDir);

        if (semver.lt(me.mysqldVersion, '5.7.6') || me.mysqldIsMaria) {
            exec('mysql_install_db --defaults-file='+me.options.configPath, function(error, stdout, stderr) {
                me.start(true);
            });
        } else {
            exec('mysqld --initialize-insecure --user=mysql --datadir='+me.options.dataDir, function(error, stdout, stderr) {
                me.start(true);
            });
        }

        me.status = 'configuring';
        return true; // not really started, we have to try again after mysql_install_db is done
    }

    // spawn process
    console.log(me.name+': spawning mysql: '+me.options.execPath);
    me.proc = spawn(me.options.execPath, ['--defaults-file='+me.options.configPath, '--console'], {detached: true});
    me.pid = me.proc.pid;
    me.status = 'online';

    console.log(me.name+': spawned mysqld with pid '+me.pid);

    // add listeners to process
    me.proc.on('exit', function (code) {

        if (code !== 0) {
            me.status = 'offline';
            me.exitCode = code;
            console.log(me.name+': exited with code: '+code);
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

        if (/ready for connections/.test(data) && firstRun) {
            me.secureInstallation();
        }
    });

    return true;
};


exports.MysqlService.prototype.stop = function() {
    var me = this;

    if (!me.pid) {
        return false;
    }

    try {
        console.log(me.name+': sending sigterm to '+me.pid);
        process.kill(me.pid, 'SIGTERM');
    } catch (error) {
        console.log(me.name+': failed to stop process: '+error);
        return false;
    }

    me.status = 'offline';
    me.pid = null;
    return true;
};

exports.MysqlService.prototype.restart = function() {
    var me = this,
        now;

    if (!me.stop()) {
        return false;
    }

    // wait for pid to disappear before attempting start
    process.stdout.write(me.name+': waiting for shutdown');
    while (fs.existsSync(me.options.pidPath)) {
        process.stdout.write('.');
        now = new Date().getTime();

        while (new Date().getTime() < now + 500) {
            // do nothing
        }
    }

    process.stdout.write('\n');

    return me.start();
};

exports.MysqlService.prototype.writeConfig = function() {
    fs.writeFileSync(this.options.configPath, this.makeConfig());
};

exports.MysqlService.prototype.makeConfig = function() {
    var me = this,
        config = [];

    config.push(
        '[mysqld]',
        'character-set-server               = utf8',
        'user                               = mysql',
        'port                               = 3306',
        'socket                             = '+me.options.socketPath,
        'pid-file                           = '+me.options.pidPath,
//      'log-error                          = '+me.options.errorLogPath, // disabled due to http://bugs.mysql.com/bug.php?id=65592 -- errors output to STDIN will usually go into emergence-kernel's log
        'basedir                            = /usr',
        'datadir                            = '+me.options.dataDir,
        'skip-external-locking',
        'key_buffer_size                    = 16M',
        'max_allowed_packet                 = 512M',
        'sort_buffer_size                   = 512K',
        'net_buffer_length                  = 8K',
        'read_buffer_size                   = 256K',
        'read_rnd_buffer_size               = 512K',
        'myisam_sort_buffer_size            = 8M',
        'explicit_defaults_for_timestamp    = 1',
//      'lc-messages-dir                    = /usr/local/share/mysql',

        'log-bin                            = mysqld-bin',
        'expire_logs_days                   = 2',
        'server-id                          = 1',

        'tmpdir                             = /tmp/',

        'innodb_buffer_pool_size            = 16M',
        'innodb_data_file_path              = ibdata1:10M:autoextend:max:128M',
        'innodb_log_file_size               = 5M',
        'innodb_log_buffer_size             = 8M',
        'innodb_log_files_in_group          = 2',
        'innodb_flush_log_at_trx_commit     = 1',
        'innodb_lock_wait_timeout           = 50',
        'innodb_file_per_table',
        'max_binlog_size                    = 100M',
        'binlog_format                      = row'
    );

    if (semver.gt(me.mysqldVersion, '5.6.0')) {
        config.push('table_open_cache                   = 64');
    } else {
        config.push('table_cache                        = 64');
    }

    if (semver.lt(me.mysqldVersion, '5.7.4')) {
        config.push('innodb_additional_mem_pool_size    = 2M');
    }

    if (me.options.bindHost) {
        config.push('bind-address               = '+me.options.bindHost);
    } else {
        config.push('skip-networking');
    }

    return config.join('\n');
};

exports.MysqlService.prototype.secureInstallation = function() {
    var me = this,
        sql = '';

    console.log(me.name+': securing installation...');

    // set root password
    if (semver.lt(me.mysqldVersion, '5.7.0') || me.mysqldIsMaria) {
        sql += 'UPDATE mysql.user SET Password=PASSWORD("'+me.options.managerPassword+'") WHERE User="root";';
    } else {
        sql += 'UPDATE mysql.user SET authentication_string=PASSWORD("'+me.options.managerPassword+'") WHERE User="root";';
    }

    // remove anonymous users
    sql += 'DELETE FROM mysql.user WHERE User="";';

    // delete remote roots
    sql += 'DELETE FROM mysql.user WHERE User="root" AND Host NOT IN ("localhost", "127.0.0.1", "::1");';

    // remove test database
    sql += 'DROP DATABASE IF EXISTS test;';
    sql += 'DELETE FROM mysql.db WHERE Db="test" OR Db="test\\_%";';

    // reload privs
    sql += 'FLUSH PRIVILEGES;';

    // open a temporary connection to the new non-secured installation
    var connection = mysql.createConnection({
        socketPath: me.options.socketPath,
        user: 'root',
        password: '',
        multipleStatements: true
    });

    connection.query(sql, function(error) {
        connection.end();

        if (error) {
            console.log(me.name+': failed to secure installation: ' + error);
        } else {
            console.log(me.name+': securing complete, mysql ready.');
        }
    });
};


exports.MysqlService.prototype.onSiteCreated = function(siteData, requestData, callbacks) {
    var me = this,
        sql = '',
        dbConfig = {
            socket: me.options.socketPath,
            database: siteData.handle,
            username: siteData.handle,
            password: me.controller.sites.generatePassword()
        };

    console.log(me.name+': creating database `'+siteData.handle+'`');

    sql += 'CREATE DATABASE IF NOT EXISTS `'+siteData.handle+'`;';
    sql += 'CREATE USER \''+siteData.handle+'\'@\'localhost\' IDENTIFIED BY \''+dbConfig.password+'\';';
    sql += 'GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, LOCK TABLES ON `'+siteData.handle+'`.* TO \''+siteData.handle+'\'@\'localhost\';';
    sql += 'FLUSH PRIVILEGES;';

    me.executeSQL(sql, function(error, results) {
        if (error) {
            console.log(me.name+': failed to setup database `'+siteData.handle+'`: '+error);
            return;
        }

        console.log(me.name+': database setup complete');
        me.controller.sites.updateSiteConfig(siteData.handle, {
            mysql: dbConfig
        });

        // populate tables
        me.createSkeletonTables(siteData, function() {
            if (callbacks.databaseReady) {
                callbacks.databaseReady(dbConfig, siteData, requestData);
            }
        });
    });
};



exports.MysqlService.prototype.createSkeletonTables = function(siteData, callback) {
    var me = this,
        sql = '';

    sql += 'USE `'+siteData.handle+'`;';

    // Table: _e_file_collections
    sql += 'CREATE TABLE `_e_file_collections` (';
    sql += '`ID` int(10) unsigned NOT NULL AUTO_INCREMENT';
    sql += ',`Site` ENUM(\'Local\',\'Remote\') NOT NULL';
    sql += ',`Handle` varchar(255) CHARACTER SET utf8 COLLATE utf8_bin NOT NULL';
    sql += ',`Status` enum(\'Normal\',\'Deleted\') NOT NULL DEFAULT \'Normal\'';
    sql += ',`Created` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP';
    sql += ',`CreatorID` int(10) unsigned DEFAULT NULL';
    sql += ',`ParentID` int(10) unsigned DEFAULT NULL';
    sql += ',`PosLeft` int(10) unsigned DEFAULT NULL';
    sql += ',`PosRight` int(10) unsigned DEFAULT NULL';
    sql += ',PRIMARY KEY (`ID`)';
    sql += ',UNIQUE KEY `PosLeft` (`PosLeft`)';
    sql += ',UNIQUE KEY `SiteCollection` (`Site`,`ParentID`,`Handle`,`Status`)';
    sql += ') ENGINE=MyISAM DEFAULT CHARSET=utf8;';

    // Table: _e_files
    sql += 'CREATE TABLE `_e_files` (';
    sql += '`ID` int(10) unsigned NOT NULL AUTO_INCREMENT';
    sql += ',`CollectionID` int(10) unsigned NOT NULL';
    sql += ',`Handle` varchar(255) CHARACTER SET utf8 COLLATE utf8_bin NOT NULL';
    sql += ',`Status` enum(\'Phantom\',\'Normal\',\'Deleted\') NOT NULL DEFAULT \'Phantom\'';
    sql += ',`SHA1` char(40) DEFAULT NULL';
    sql += ',`Size` int(10) unsigned DEFAULT NULL';
    sql += ',`Type` varchar(255) DEFAULT NULL';
    sql += ',`Timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP';
    sql += ',`AuthorID` int(10) unsigned DEFAULT NULL';
    sql += ',`AncestorID` int(10) unsigned DEFAULT NULL';
    sql += ',PRIMARY KEY (`ID`)';
    sql += ',KEY `CollectionID` (`CollectionID`)';
    sql += ') ENGINE=MyISAM DEFAULT CHARSET=utf8;';

    // run tables
    me.executeSQL(sql, function(error, results) {
        if (error) {
            console.log(me.name+': failed to setup skeleton tables on `'+siteData.handle+'`: '+error);
            return;
        }

        console.log(me.name+': skeleton table schema setup');

        callback();
    });
};



exports.MysqlService.prototype.executeSQL = function(sql, callback) {
    var connection = mysql.createConnection({
        socketPath: this.options.socketPath,
        user: this.options.managerUser,
        password: this.options.managerPassword,
        multipleStatements: true
    });

    connection.query(sql, function(err, results) {
        connection.end();

        callback(err, results);
    });
};