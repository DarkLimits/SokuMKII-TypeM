
'use strict';

class Hosting {

    SlaveId: string;

    ClientAddress: string;
    ClientPort: number;

    RelayAddress: string;
    RelayPort: number;

    Created: number;

    get Hash(): string {

        return this.ClientAddress + ':' + this.ClientPort + '@' + this.RelayAddress + ':' + this.RelayPort;

    }

    static GetHash(clientAddress, clientPort, relayAddress, relayPort): string {

        return clientAddress + ':' + clientPort + '@' + relayAddress + ':' + relayPort;

    }

    constructor(slaveId: string, clientAddress: string, clientPort: number, relayAddress: string, relayPort: number) {

        this.SlaveId = slaveId;

        this.ClientAddress = clientAddress;
        this.ClientPort = clientPort;

        this.RelayAddress = relayAddress;
        this.RelayPort = relayPort;

        this.Created = Date.now();

    }

}

export = Hosting;
