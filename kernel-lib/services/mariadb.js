var _ = require('underscore'),
    fs = require('fs'),
    path = require('path'),
    util = require('util'),
    spawn = require('child_process').spawn,
    exec = require('child_process').exec,
    shell = require('shelljs'),
    semver = require('semver'),
    mariasql = require('mariasql');

exports.createService = function(name, controller, options) {
    return new exports.MysqlService(name, controller, options);
};

exports.MysqlService = function(name, controller, options) {
    var me = this,
        versionMatch;

    // call parent constructor
    exports.MysqlService.super_.apply(me, arguments);

    // initialize configuration
    me.packagePath = options.packagePath;
    me.execPath = me.packagePath + '/bin/mysqld';

    me.configPath = '/hab/svc/emergence-kernel/config/mariadb';
    me.pidPath = '/hab/svc/emergence-kernel/var/run/mariadb.pid';
    me.socketPath = '/hab/svc/emergence-kernel/var/run/mariadb.sock';
    me.dataDir = '/hab/svc/emergence-kernel/data/services/mariadb';
    me.statePath = me.dataDir+'/state.json';

    me.execOptions = ['--defaults-file='+me.configPath, '--basedir='+me.packagePath];

    // load state
    if (fs.existsSync(me.statePath)) {
        me.state = JSON.parse(fs.readFileSync(me.statePath, 'ascii'));
    }

    // check for existing mysqld process
    if (fs.existsSync(me.pidPath)) {
        me.pid = parseInt(fs.readFileSync(me.pidPath, 'ascii'));
        console.log(me.name+': found existing PID: '+me.pid+', checking /proc/'+me.pid);

        if (fs.existsSync('/proc/'+me.pid)) {
            me.status = 'online';

            // instantiate MySQL client
            if (me.state) {
                me.client = new mariasql({
                    unixSocket: me.socketPath,
                    user: 'root',
                    password: me.state.rootPassword,
                    multiStatements: true
                });
            }
        } else {
            console.log(me.name+': process '+me.pid + ' not found, deleting .pid file');
            fs.unlinkSync(me.pidPath);
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

    // init data directory if needed
    if (!fs.existsSync(me.dataDir)) {
        console.log('creating datadir as ', require("os").userInfo().username);
        me.status = 'configuring';

        console.log(me.name+': initializing new data directory...');
        fs.mkdirSync(me.dataDir);
        fs.chownSync(me.dataDir, me.controller.sites.dataUid, me.controller.sites.dataGid);
        fs.chmodSync(me.dataDir, '750');

        // initialize state
        me.state = {
            rootPassword: me.controller.sites.generatePassword()
        };

        fs.writeFileSync(me.statePath, JSON.stringify(me.state, null, 4));
        fs.chmodSync(me.statePath, '600');

        // use mysql_install_db to finish init
        exec(
            me.packagePath + '/scripts/mysql_install_db '+me.execOptions.join(' '),
            function(error, stdout, stderr) {
                if (error) {
                    console.log(me.name+': failed to initialize data directory', error);
                    return;
                }

                me.start(true);
            }
        );

        return true; // not really started, we have to try again after mysql_install_db is done
    }

    // instantiate MySQL client
    if (me.state) {
        me.client = new mariasql({
            unixSocket: me.socketPath,
            user: 'root',
            password: me.state.rootPassword,
            multiStatements: true
        });
    }

    // spawn process
    console.log(me.name+': spawning mysql: '+me.execPath);
    me.proc = spawn(me.execPath, me.execOptions.concat(['--console']), {detached: true});
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

    // disconnect client
    if (me.client && me.client.connected) {
        me.client.end();
        console.log(me.name+': mysql client disconnected');
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
    while (fs.existsSync(me.pidPath)) {
        process.stdout.write('.');
        now = new Date().getTime();

        while (new Date().getTime() < now + 500) {
            // do nothing
        }
    }

    process.stdout.write('\n');

    return me.start();
};


exports.MysqlService.prototype.secureInstallation = function() {
    var me = this,
        sql = '';

    console.log(me.name+': securing installation...');

    // set root password
    sql += 'UPDATE mysql.user SET Password=PASSWORD("'+me.state.rootPassword+'") WHERE User="root";';

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
    (new mariasql({
        unixSocket: me.socketPath,
        user: 'root',
        password: '',
        multiStatements: true
    })).query(sql, function(error) {
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
            socket: me.socketPath,
            database: siteData.handle,
            username: siteData.handle,
            password: me.controller.sites.generatePassword()
        };

    console.log(me.name+': creating database `'+siteData.handle+'`');

    sql += 'CREATE DATABASE IF NOT EXISTS `'+siteData.handle+'`;';
    sql += 'CREATE USER \''+siteData.handle+'\'@\'localhost\' IDENTIFIED BY \''+dbConfig.password+'\';';
    sql += 'GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, LOCK TABLES ON `'+siteData.handle+'`.* TO \''+siteData.handle+'\'@\'localhost\';';
    sql += 'FLUSH PRIVILEGES;';

    me.client.query(sql, function(error, results) {
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
    me.client.query(sql, function(error, results) {
        if (error) {
            console.log(me.name+': failed to setup skeleton tables on `'+siteData.handle+'`: '+error);
            return;
        }

        console.log(me.name+': skeleton table schema setup');

        callback();
    });
};
