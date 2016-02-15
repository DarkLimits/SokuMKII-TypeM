
'use strict';

var _util = require('util');
var _dgram = require('dgram');
var _repl = require('repl');

var log4js = require('log4js');
log4js.configure({
    appenders: [
        { type: 'console' },
        { type: 'file', filename: 'logs/udp.log', category: 'udp' },
        { type: 'file', filename: 'logs/http.log', category: 'http' },
        { type: 'file', filename: 'logs/io.log', category: 'io' }
    ]
});

var express = require('express');

var Config = require('./config').Master;

import Util = require('./util');

import Slave = require('./lib/slave');
import Hosting = require('./lib/hosting');

const BUFFER_SOKU = new Buffer('SOKU');

var Slaves: { [id: string]: Slave } = {};
var Hostings: { [id: string]: Hosting } = {};

var socket = _dgram.createSocket('udp4');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

// UDP.
(function(socket, logger) {

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

                logger.info('%s:%d: Request.', rinfo.address, rinfo.port);

            }
            else {

                logger.warn('%s:%d: Unknown command.', rinfo.address, rinfo.port);

            }

        }
        else {

            logger.warn('%s:%d: Invalid data.', rinfo.address, rinfo.port);

        }

    });

})(socket, log4js.getLogger('udp'));

// Express.
(function(app, logger) {

    app.set('view engine', 'ejs');
    //app.use(express.static('public'));

    app.get('/', function(req, res) {

        return res.render('index', {
            hosts: [],
        });

    });

})(app, log4js.getLogger('http'));

// Socket.IO.
(function(io, logger) {

    io.on('connection', function(socket) {

        var remote = {
            address: socket.request.connection.remoteAddress,
            port: socket.request.connection.remotePort,
        };
        logger.info('Unknown %s:%d connected.', remote.address, remote.port);

        socket.on('disconnect', function() {

            var slave = Slaves[socket.id];

            if(!slave) {

                logger.info('Unknown %s:%d disconnected.', remote.address, remote.port);
                return;

            }

            delete Slaves[socket.id];
            logger.info('Slave %s %s:%d disconnected.', slave.Name, slave.Address, slave.Port);

        });

        socket.on('register', function(data) {

            if(!data.name) return;
            if(!data.port) return;

            var slave = Slaves[socket.id] = new Slave(data.name, remote.address, data.port);
            logger.info('Slave %s %s:%d registered.', slave.Name, slave.Address, slave.Port);

            socket.emit('register', {
                name: slave.Name,
                address: slave.Address,
                port: slave.Port,
            });

        });

        socket.on('host', function(data) {

            var slave = Slaves[socket.id];

            if(data.relayAddress != slave.Address) {

                logger.warn('Slave %s:%d: data.relayAddress != slave.Address.');

            }

            var hosting = new Hosting(socket.id, data.clientAddress, data.clientPort, data.relayAddress, data.relayPort);
            Hostings[hosting.Hash] = hosting;
            logger.info('Slave %s:%d: Client %s:%d hosted.', hosting.RelayAddress, hosting.RelayPort, hosting.ClientAddress, hosting.ClientPort);

        });

        socket.on('release', function(data) {

            var hash = Hosting.GetHash(data.clientAddress, data.clientPort, data.relayAddress, data.relayPort);
            var hosting = Hostings[hash];
            logger.info('Slave %s:%d: Client %s:%d released.', hosting.RelayAddress, hosting.RelayPort, hosting.ClientAddress, hosting.ClientPort);

            hosting = null;
            Hostings[hash] = null;
            delete Hostings[hash];

        });

    });

})(io, log4js.getLogger('io'));

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
    repl.context.Hostings = Hostings;

});
