var fs    = require('fs'),
    path  = require('path'),
    util  = require('util'),
    spawn = require('child_process').spawn,
    exec  = require('child_process').exec;

function mysql(name, controller, options) {
    var me = this;

    // call parent constructor
    mysql.super_.apply(me, arguments);

    // default options
    me.options.configPath      = me.options.configPath      || controller.options.configDir + '/my.cnf';
    me.options.execPath        = me.options.execPath        || '/usr/sbin/mysqld';
    me.options.bindHost        = me.options.bindHost        || false;
    me.options.runDir          = me.options.runDir          || controller.options.runDir + '/mysqld';
    me.options.pidPath         = me.options.pidPath         || me.options.runDir + '/mysqld.pid';
    me.options.socketPath      = me.options.socketPath      || me.options.runDir + '/mysqld.sock';
    me.options.dataDir         = me.options.dataDir         || controller.options.dataDir + '/mysql';
    me.options.logsDir         = me.options.logsDir         || controller.options.logsDir + '/mysql';
    me.options.errorLogPath    = me.options.errorLogPath    || me.options.logsDir + '/mysqld.err';
    me.options.managerUser     = me.options.managerUser     || 'emergence';
    me.options.managerPassword = me.options.managerPassword || '';

    // check for existing master process
    if (fs.existsSync(me.options.pidPath)) {
        me.pid = parseInt(fs.readFileSync(me.options.pidPath));
        console.log(me.name + ': found existing PID: ' + me.pid);

        if (me.isRunning()) {
            me.status = 'online';

            // instantiate MySQL client
            me.client = require('mysql').createClient({
                port:     me.options.socketPath,
                user:     me.options.managerUser,
                password: me.options.managerPassword
            });
        } else {
            me.status = 'offline';
            me.pid = null;
            console.log(me.name + ': deleting stale PID file');
            fs.unlink(me.options.pidPath);
        }
    }

    // listen for site creation
    controller.sites.on('siteCreated', me.onSiteCreated.bind(me));
}

util.inherits(mysql, require('./abstract.js').AbstractService);

mysql.prototype.start = function (firstRun) {
    var me = this;

    if (me.pid) {
        console.log(me.name + ': mysql already runnig with PID ' + me.pid);
        return false;
    }

    // write configuration file
    this.writeConfig();

    // init logs directory if needed
    if (!fs.existsSync(me.options.logsDir)) {
        console.log(me.name + ': initializing new log directory');
        fs.mkdirSync(me.options.logsDir, 0775);
        exec('chown -R mysql:mysql ' + me.options.logsDir);
    }


    // init run directory if needed
    if (!fs.existsSync(me.options.runDir)) {
        console.log(me.name + ': initializing new run directory');
        fs.mkdirSync(me.options.runDir, 0775);
        exec('chown -R mysql:mysql ' + me.options.runDir);
    }

    // init data directory if needed
    if (!fs.existsSync(me.options.dataDir)) {
        console.log(me.name + ': initializing new data directory...');
        fs.mkdirSync(me.options.dataDir, 0775);
        exec('chown -R mysql:mysql ' + me.options.dataDir);

        exec('mysql_install_db --datadir=' + me.options.dataDir, function (error, stdout, stderr) {
            me.start(true);
        });

        me.status = 'configuring';
        return true; // not really started, we have to try again after mysql_install_db is done
    }

    // instantiate MySQL client
    me.client = require('mysql').createClient({
        port:     me.options.socketPath,
        user:     me.options.managerUser,
        password: me.options.managerPassword
    });

    // spawn process
    console.log(me.name + ': spawning mysql: ' + me.options.execPath);
    me.proc = spawn(me.options.execPath, ['--defaults-file=' + me.options.configPath, '--console'], {detached: true});
    me.pid = me.proc.pid;
    me.status = 'online';

    console.log(me.name + ': spawned mysqld with pid ' + me.pid);

    // add listeners to process
    me.proc.on('exit', function (code) {

        if (code !== 0) {
            me.status = 'offline';
            me.exitCode = code;
            console.log(me.name + ': exited with code: ' + code);
        }
    });

    me.proc.stdout.on('data', function (data) {
        console.log(me.name + ': stdout:\n\t' + data.toString().replace(/\n/g, '\n\t'));
    });

    me.proc.stderr.on('data', function (data) {
        console.log(me.name + ': stderr:\n\t' + data.toString().replace(/\n/g, '\n\t'));

        if (/^execvp\(\)/.test(data)) {
            console.log('Failed to start child process.');
            me.status = 'offline';
        }

        if (/ready for connections/.test(data)) {
            if (firstRun) {
                me.secureInstallation();
            }
        }
    });

    return true;
};

mysql.prototype.stop = function () {
    var me = this;

    if (!me.pid) {
        return false;
    }

    // disconnect client
    if (me.client && me.client.connected) {
        me.client.end();
        console.log(me.name + ': mysql client disconnected');
    }

    try {
        console.log(me.name + ': sending sigterm to ' + me.pid);
        process.kill(me.pid, 'SIGTERM');
    }
    catch (error) {
        console.log(me.name + ': failed to stop process: ' + error);
        return false;
    }

    me.status = 'offline';
    me.pid = null;

    return true;
};

mysql.prototype.restart = function () {
    var me = this;

    if (!me.stop()) {
        return false;
    }

    // wait for pid to disappear before attempting start
    process.stdout.write(me.name + ': waiting for shutdown');

    while (fs.existsSync(me.options.pidPath)) {
        process.stdout.write('.');
        var now = new Date().getTime();
        while (new Date().getTime() < now + 500) {
            // do nothing
        }
    }

    process.stdout.write('\n');

    return me.start();
};

mysql.prototype.writeConfig = function () {
    fs.writeFileSync(this.options.configPath, this.makeConfig());
};


mysql.prototype.makeConfig = function () {
    var me = this,
        c = '';

    c += '[mysqld]\n';
    c += 'character-set-server		= utf8\n';
    c += 'user 						= mysql\n';
    c += 'port 						= 3306\n';
    c += 'socket 					= ' + me.options.socketPath + '\n';
    c += 'pid-file 					= ' + me.options.pidPath + '\n';
//	c += 'log-error 				= '+me.options.errorLogPath+'\n'; // disabled due to http://bugs.mysql.com/bug.php?id=65592 -- errors output to STDIN will usually go into emergence-kernel's log
    c += 'basedir 					= /usr\n';
    c += 'datadir 					= ' + me.options.dataDir + '\n';
    c += 'skip-external-locking\n';
    c += 'key_buffer_size 				= 16M\n';
    c += 'max_allowed_packet 		= 1M\n';
    c += 'table_cache 				= 64\n';
    c += 'sort_buffer_size 			= 512K\n';
    c += 'net_buffer_length 		= 8K\n';
    c += 'read_buffer_size 			= 256K\n';
    c += 'read_rnd_buffer_size 		= 512K\n';
    c += 'myisam_sort_buffer_size 	= 8M\n';
//	c += 'lc-messages-dir 					= /usr/local/share/mysql\n';

    if (me.options.bindHost) {
        c += 'bind-address = ' + me.options.bindHost + '\n';
    } else {
        c += 'skip-networking\n';
    }

    c += 'log-bin					= mysqld-bin\n'
    c += 'server-id 				= 1\n'

    c += 'tmpdir 					= /tmp/\n'

    c += 'innodb_buffer_pool_size = 16M\n'
    c += 'innodb_additional_mem_pool_size = 2M\n'
    c += 'innodb_data_file_path = ibdata1:10M:autoextend:max:128M\n'
    c += 'innodb_log_file_size = 5M\n'
    c += 'innodb_log_buffer_size = 8M\n'
    c += 'innodb_log_files_in_group=2\n'
    c += 'innodb_flush_log_at_trx_commit = 1\n'
    c += 'innodb_lock_wait_timeout = 50\n'
    c += 'innodb_file_per_table\n'

    return c;
};

mysql.prototype.secureInstallation = function () {

    var me = this,
        sql = '';

    console.log(me.name + ': securing installation...');

    // set root password
    sql += 'UPDATE mysql.user SET Password=PASSWORD("' + me.options.managerPassword + '") WHERE User="root";';
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
    require('mysql').createClient({
        port:     me.options.socketPath,
        user:     'root',
        password: ''
    }).query(sql, function (error) {
        if (error) {
            console.log(me.name + ': failed to secure installation: ' + error);
        } else {
            console.log(me.name + ': securing complete, mysql ready: ' + sql);
        }
    });

};

mysql.prototype.onSiteCreated = function (siteData, requestData, callbacks) {
    var me = this,
        sql = '',
        dbConfig = {
            socket:   me.options.socketPath,
            database: siteData.handle,
            username: siteData.handle,
            password: me.controller.sites.generatePassword()
        };

    console.log(me.name + ': creating database `' + siteData.handle + '`');

    sql += 'CREATE DATABASE IF NOT EXISTS `' + siteData.handle + '`;';
    sql += 'CREATE USER \'' + siteData.handle + '\'@\'localhost\' IDENTIFIED BY \'' + dbConfig.password + '\';';
    sql += 'GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, LOCK TABLES  ON `' + siteData.handle + '`.* TO \'' + siteData.handle + '\'@\'localhost\';';
    sql += 'FLUSH PRIVILEGES;';

    me.client.query(sql, function (error, results) {
        if (error) {
            console.log(me.name + ': failed to setup database `' + siteData.handle + '`: ' + error);
            return;
        }

        console.log(me.name + ': database setup complete');
        me.controller.sites.updateSiteConfig(siteData.handle, {
            mysql: dbConfig
        });

        // populate tables
        me.createSkeletonTables(siteData, function () {
            if (callbacks.databaseReady) {
                callbacks.databaseReady(dbConfig, siteData, requestData);
            }
        });
    });
};


mysql.prototype.createSkeletonTables = function (siteData, callback) {
    var me = this,
        sql = '';

    sql += 'USE `' + siteData.handle + '`;';

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
    me.client.query(sql, function (error, results) {
        if (error) {
            console.log(me.name + ': failed to setup skeleton tables on `' + siteData.handle + '`: ' + error);
            return;
        }

        console.log(me.name + ': skeleton table schema setup');

        callback();
    });
};

exports.mysql = mysql;

exports.createService = function createService(name, controller, options) {
    return new mysql(name, controller, options);
};