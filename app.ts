
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

interface Hosting {
    rinfo: string,
    clientAddress: string,
    clientPort: number,
    relayAddress: string,
    relayPort: number,
}

var Slaves: { [id: string]: Slave } = {};
var Hostings: { [id: string]: Hosting } = {};

var socket = _dgram.createSocket('udp4');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

function IsCommand(msg: Buffer): boolean {

    if(msg.indexOf('SOKU') == 0) return true;
    else return false;

}

function ParseCommand(msg: Buffer): string[] {

    return msg.toString('ascii').split('\n')[0].split(' ');

}

function SendCommand(socket: any, address: string, port: number, ...params) {

    var msg = new Buffer(params.join(' ') + '\n');

    socket.send(msg, 0, msg.length, port, address);

}

// UDP.
(function(socket, logger) {

    socket.on('message', function(msg, rinfo) {

        if(IsCommand(msg)) {

            var params = ParseCommand(msg);

            switch(params[0]) {
            case 'SOKU_REQUEST':

                var keys = Object.keys(Slaves);

                for(let i = 0; i < keys.length; i++) {

                    var key = keys[i];
                    var slave = Slaves[key];
                    SendCommand(socket, rinfo.address, rinfo.port, 'SOKU_SLAVE', slave.Address, slave.Port);

                }

                logger.info('%s:%d: Request.', rinfo.address, rinfo.port);

                break;
            default:
                logger.warn('%s:%d: Unknown command.', rinfo.address, rinfo.port);
                break;
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

            var hosting = Hostings[data.rinfo] = data;
            logger.info('Slave %s:%d: Client %s:%d hosted.', hosting.relayAddress, hosting.relayPort, hosting.clientAddress, hosting.clientPort);

        });

        socket.on('join', function(data) {

            logger.info('Slave %s:%d: Host %s:%d has %s:%d joined.', data.relayAddress, data.relayPort, data.hostAddress, data.hostPort, data.guestAddress, data.guestPort);

        });

        socket.on('close', function(data) {

            var hosting = Hostings[data.rinfo];
            logger.info('Slave %s:%d: Client %s:%d closed.', hosting.relayAddress, hosting.relayPort, hosting.clientAddress, hosting.clientPort);

            hosting = null;
            Hostings[data.rinfo] = null;
            delete Hostings[data.rinfo];

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
