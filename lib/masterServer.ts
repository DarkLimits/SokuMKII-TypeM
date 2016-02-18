
'use strict';

import _events = require('events');
import _util = require('util');

var log4js = require('log4js');
log4js.configure({
    appenders: [
        { type: 'console' },
        { type: 'file', filename: 'logs/server.log', category: 'server' },
        { type: 'file', filename: 'logs/server.udp.log', category: 'server.udp' },
        { type: 'file', filename: 'logs/server.io.log', category: 'server.io' },
    ]
});

import Slave = require('./slave');

interface Hosting {
    rinfo: string,
    clientAddress: string,
    clientPort: number,
    relayAddress: string,
    relayPort: number,
}

function Rinfo(rinfo) {

    return rinfo.address + ':' + rinfo.port;

}

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

class MasterServer {

    // Configuration.

    UdpPort: number;
    HttpPort: number;

    // Runtime.

    Logger: any;

    UdpServer: any;
    HttpServer: any;

    expressInstance: any;
    ioInstance: any;

    Slaves: { [id: string]: Slave };
    Hostings: { [rinfo: string]: Hosting };

    constructor(options) {

        if(!options.udpPort) throw new Error('ERROR_NO_UDP_PORT');
        if(!options.httpPort) throw new Error('ERROR_NO_HTTP_PORT');

        this.UdpPort = options.udpPort;
        this.HttpPort = options.httpPort;

        this.prepare();

    }

    prepare() {

        this.Logger = log4js.getLogger('server');

        this.UdpServer = require('dgram').createSocket('udp4');
        this.HttpServer = require('http').createServer();

        this.expressInstance = require('express')();
        this.HttpServer.on('request', this.expressInstance);
        this.ioInstance = require('socket.io')(this.HttpServer);

        this.Slaves = {};
        this.Hostings = {};

        ((udp, logger) => {

            udp.on('message', (msg, rinfo) => {

                if(IsCommand(msg)) {

                    var params = ParseCommand(msg);

                    switch(params[0]) {
                    case 'SOKU_REQUEST':

                        for(let key in this.Slaves) {

                            var slave = this.Slaves[key];
                            SendCommand(udp, rinfo.address, rinfo.port, 'SOKU_SLAVE', slave.Address, slave.Port);

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

            udp.bind(this.UdpPort, () => {
                logger.info('Listening.');
            });

        })(this.UdpServer, log4js.getLogger('server.udp'));

        ((app, logger) => {

            app.set('view engine', 'ejs');
            app.use(require('express').static('static'));

        })(this.expressInstance, log4js.getLogger('server.express'));

        ((io, logger) => {

            io.on('connection', (socket) => {

                var remote = {
                    address: socket.request.connection.remoteAddress,
                    port: socket.request.connection.remotePort,
                };
                logger.info('Unknown %s:%d connected.', remote.address, remote.port);

                socket.on('disconnect', () => {

                    var slave = this.Slaves[socket.id];

                    if(!slave) {

                        logger.info('Unknown %s:%d disconnected.', remote.address, remote.port);
                        return;

                    }

                    delete this.Slaves[socket.id];
                    logger.info('Slave %s %s:%d disconnected.', slave.Name, slave.Address, slave.Port);

                });

                socket.on('register', (data) => {

                    if(!data.name) return;
                    if(!data.port) return;

                    var slave = this.Slaves[socket.id] = new Slave(data.name, remote.address, data.port);
                    logger.info('Slave %s %s:%d registered.', slave.Name, slave.Address, slave.Port);

                    socket.emit('register', {
                        name: slave.Name,
                        address: slave.Address,
                        port: slave.Port,
                    });

                });

                socket.on('host', (data) => {

                    var slave = this.Slaves[socket.id];

                    if(data.relayAddress != slave.Address) {

                        logger.warn('Slave %s:%d: data.relayAddress != slave.Address.');

                    }

                    var hosting = this.Hostings[data.rinfo] = data;
                    logger.info('Slave %s:%d: Client %s:%d hosted.', hosting.relayAddress, hosting.relayPort, hosting.clientAddress, hosting.clientPort);

                });

                socket.on('join', (data) => {

                    logger.info('Slave %s:%d: Host %s:%d has %s:%d joined.', data.relayAddress, data.relayPort, data.hostAddress, data.hostPort, data.guestAddress, data.guestPort);

                });

                socket.on('close', (data) => {

                    var hosting = this.Hostings[data.rinfo];
                    logger.info('Slave %s:%d: Client %s:%d closed.', hosting.relayAddress, hosting.relayPort, hosting.clientAddress, hosting.clientPort);

                    hosting = null;
                    this.Hostings[data.rinfo] = null;
                    delete this.Hostings[data.rinfo];

                });

            });

        })(this.ioInstance, log4js.getLogger('server.io'));

        this.HttpServer.listen(this.HttpPort, '0.0.0.0', () => {
            this.Logger.info('Listening.');
        });

    }

}

export = MasterServer;
