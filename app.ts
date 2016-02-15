
'use strict';

var _util = require('util');
var _dgram = require('dgram');
var _repl = require('repl');

var express = require('express');

var Config = require('./config').Master;

import Util = require('./util');

import Slave = require('./lib/slave');

const BUFFER_SOKU = new Buffer('SOKU');

var Slaves = {};

var socket = _dgram.createSocket('udp4');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

// UDP.
(function(socket) {

    socket.on('message', function(msg, rinfo) {

        if(msg.slice(0, 4).compare(BUFFER_SOKU) == 0) {

            var message = msg.toString('ascii');

            if(message.indexOf('SOKU_REQUEST') == 0) {

                var keys = Object.keys(Slaves);

                for(let i = 0; i < keys.length; i++) {

                    var key = keys[i];
                    var slave = Slaves[key];
                    var msg = _util.format('SOKU_SLAVE %s %d\n', slave.Address, slave.Port);
                    socket.send(msg, 0, msg.length, rinfo.port, rinfo.address);

                }

            }

        }

    });

})(socket);

// Express.
(function(app) {

    app.set('view engine', 'ejs');
    //app.use(express.static('public'));

    app.get('/', function(req, res) {

        return res.render('index', {
            hosts: [],
        });

    });

})(app);

// Socket.IO.
(function(io) {

    io.on('connection', function(socket) {

        var remote = {
            address: socket.request.connection.remoteAddress,
            port: socket.request.connection.remotePort,
        };
        console.log('Unknown %s:%d connected.', remote.address, remote.port);

        socket.on('disconnect', function() {

            var slave = Slaves[socket.id];

            if(!slave) {

                console.log('Unknown %s:%d disconnected.', remote.address, remote.port);
                return;

            }

            delete Slaves[socket.id];
            console.log('Slave %s %s:%d disconnected.', slave.Name, slave.Address, slave.Port);

        });

        socket.on('register', function(data) {

            if(!data.name) return;
            if(!data.port) return;

            var slave = Slaves[socket.id] = new Slave(data.name, remote.address, data.port);
            console.log('Slave %s %s:%d registered.', slave.Name, slave.Address, slave.Port);

        });

    });

})(io);

Util.Flow(function*(cb): any {

    yield socket.bind(Config.port, '0.0.0.0', cb);
    console.log('UDP listens at %d.', Config.port);

    yield http.listen(Config.httpPort, '0.0.0.0', cb);
    console.log('HTTP listens at %d.', Config.httpPort);

    var repl = _repl.start('> ');

    repl.on('exit', function() {

        process.exit();

    });

    repl.context.Slaves = Slaves;

});
