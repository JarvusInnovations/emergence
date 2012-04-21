/*
 * wrapper.js: Example for running daemons using friendly wrapper methods exposed in Javascript.
 *
 * (C) 2010, Charlie Robbins.
 *
 */

var util = require('util'),
    fs = require('fs'),
    http = require('http');

var daemon;
try {
  daemon = require('../lib/daemon');
}
catch (ex) {
  util.puts("Couldn't find 'daemon' add-on, did you install it yet?");
  process.exit(0);
}

var config = {
  // Location of lockFile
  lockFile: process.argv[3] || '/tmp/testd.pid',  
  // Location of logFile (or stdout if `process.argv[5]` exists).
  outFile:  process.argv[4] || '/tmp/testd.log',
  // Location of stderr file
  errFile:  process.argv[5] || null
};

var args = process.argv;

// Handle start stop commands
switch(args[2]) {
  case "stop":
    daemon.kill(config.lockFile, function (err, pid) {
      if (err) {
        return util.puts('Error stopping daemon: ' + err);
      }
      
      util.puts('Successfully stopped daemon with pid: ' + pid);
    });
    break;
    
  case "start":
    // Start HTTP Server
    http.createServer(function(req, res) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.write('I know nodejitsu.');
      res.end();
    }).listen(8000);
    
    var fds = config.errFile 
      ? { stdout: config.outFile, stderr: config.errFile }
      : config.outFile;
    
    daemon.daemonize(fds, config.lockFile, function (err, started) {
      if (err) {
        console.dir(err.stack);
        return util.puts('Error starting daemon: ' + err);      
      }
      
      util.puts('Successfully started daemon');
    });
    break;
    
  default:
    util.puts('Usage: [start|stop]');
    break;
}

