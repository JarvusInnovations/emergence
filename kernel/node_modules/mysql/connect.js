var net = require('net');

var socket = new net.Socket();
socket.connect(9391, 'badhost');
