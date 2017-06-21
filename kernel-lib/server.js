var net = require('net'),
    http = require('http'),
    util = require('util'),
    fs = require('fs'),
    path = require('path'),
    _ = require('underscore'),
    util = require('util'),
    url = require('url'),
    static = require('node-static'),
    events = require('events');

exports.Server = function(paths, config) {
    var me = this,
        options = config.server;

    // call events constructor
    events.EventEmitter.call(me);

    // initialize configuration
    me.socketPath = '/hab/svc/emergence-kernel/var/run/kernel.sock';
    me.staticDir = '/hab/svc/emergence-kernel/static/kernel-www';
    me.usersPath = '/hab/svc/emergence-kernel/data/users.htpasswd';

    me.paths = paths || {};
    me.host = options.host || '0.0.0.0';
    me.port = options.port || 9083;
    me.defaultSuffix = options.defaultSuffix || null;
    me.sslKey = options.sslKey || null;
    me.sslCert = options.sslCert || null;
};

util.inherits(exports.Server, events.EventEmitter);


exports.Server.prototype.start = function() {
    var me = this,
        testConnection;

    // test if socket connection is already open
    if (!me.socketPath || !fs.existsSync(me.socketPath)) {
        _doStart();
        return;
    }

    testConnection = net.createConnection(me.socketPath);

    testConnection.on('connect', function() {
        testConnection.close();
        throw 'Socket file already exists and is live: '+me.socketPath;
    });

    testConnection.on('error', function() {
        console.log('Deleting stale socket file:', me.socketPath);
        fs.unlinkSync(me.socketPath);
        _doStart();
    });

    function _doStart() {
        // create authenticator
        me.httpAuth = require('http-auth')({
            authRealm: 'Emergence Node Management',
            authFile: me.usersPath
        });

        // create static fileserver
        me.fileServer = new static.Server(me.staticDir);

        // listen on web port
        if (me.sslKey && me.sslCert) {
            me.webServer = require('https').createServer({
                key: fs.readFileSync(me.sslKey),
                cert: fs.readFileSync(me.sslCert)
            }, me.handleWebRequest.bind(me)).listen(me.port, me.host);

            me.webProtocol = 'https';
        } else {
            me.webServer = require('http').createServer(me.handleWebRequest.bind(me)).listen(me.port, me.host);

            me.webProtocol = 'http';
        }

        // listen on unix socket
        if (me.socketPath) {
            me.socketServer = require('http').createServer(me.handleRequest.bind(me)).listen(me.socketPath);
            fs.chmodSync(me.socketPath, '400');
        }

        // clean up on exit
        process.on('exit', me.close.bind(me));

        console.log('Management server listening on '+me.webProtocol+'://'+me.host+':'+me.port);
    }
};

exports.createServer = function(paths, options) {
    return new exports.Server(paths, options);
};


exports.Server.prototype.handleWebRequest = function(request, response) {
    var me = this;

    me.httpAuth.apply(request, response, function(username) {
        me.handleRequest(request, response);
    });
};

exports.Server.prototype.handleRequest = function(request, response) {
    var me = this;

    request.content = '';

    request.addListener('data', function(chunk) {
        request.content += chunk;
    });

    request.addListener('end', function() {
        request.urlInfo = url.parse(request.url)
        request.path = request.urlInfo.pathname.substr(1).split('/');
        console.log(request.method+' '+request.url);

        if (request.path[0] == 'server-config') {
            response.writeHead(200, {'Content-Type':'application/json'});
            response.end(JSON.stringify({
                host: me.host,
                port: me.port,
                defaultSuffix: me.defaultSuffix
            }));
            return;
        }

        if (request.path[0] == 'package-info') {
            response.writeHead(200, {'Content-Type':'application/json'});
            response.end(JSON.stringify(require('../package.json')));
            return;
        }

        if (me.paths.hasOwnProperty(request.path[0])) {
            var result = me.paths[request.path[0]].handleRequest(request, response, me);

            if (result===false)  {
                response.writeHead(404);
                response.end();
            } else if (result !== true) {
                response.writeHead(200, {'Content-Type':'application/json'});
                response.end(JSON.stringify(result));
            }
        } else {
            me.fileServer.serve(request, response);
        }
    });
};

exports.Server.prototype.close = function(options, error) {
    var me = this;

    console.log('Shutting down management server...');

    if (me.webServer) {
        me.webServer.close();
    }

    if (me.socketServer) {
        me.socketServer.close();
    }
};