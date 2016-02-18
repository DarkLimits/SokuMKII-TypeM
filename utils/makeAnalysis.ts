
'use strict';

import _path = require('path');

var reader = require('readline').createInterface({
    input: require('fs').createReadStream(_path.join(__dirname, '../logs/io.log')),
});

var mmdb = require('maxmind-db-reader').openSync(_path.join(__dirname, './GeoLite2-City.mmdb'));

var RawData: {
    [date: string]: {
        hosts: {
            slaveAddress: string,
            slavePort: number,
            clientAddress: string,
            clientPort: number,
        }[],
        joins: {
            slaveAddress: string,
            slavePort: number,
            hostAddress: string,
            hostPort: number,
            guestAddress: string,
            guestPort: number,
        }[],
    }
} = {};

const REGEX_HOST = /^\[([0-9-]+) .+?\] .+? Slave ([0-9\.]+):(\d+): Client ([0-9\.]+):(\d+) hosted.$/;
const REGEX_JOIN = /^\[([0-9-]+) .+?\] .+? Slave ([0-9\.]+):(\d+): Host ([0-9\.]+):(\d+) has ([0-9\.]+):(\d+) joined.$/;

function MakeEchartsOption(rawData) {

    var option = {
        title: {
            left: 'center',
            top: 'top',
            text: 'SokuMKII Analysis',
            subtext: 'Generated at ' + new Date().toString(),
        },
        geo: {
            map: 'china',
            label: {
                emphasis: false
            },
        },
        legend: {
            left: 'right',
            top: 'bottom',
            data: [],
        },
        tooltip: {
            trigger: 'item',
        },
        series: [],
    };

    for(let date in rawData) {

        for(let host of rawData[date].hosts) {

            let index = -1;
            if((index = option.legend.data.indexOf(host.slaveAddress)) == -1) {

                option.legend.data.push(host.slaveAddress);
                option.series.push({
                    name: host.slaveAddress,
                    type: 'scatter',
                    coordinateSystem: 'geo',
                    roam: true,
                    data: [],
                });
                index = option.legend.data.length - 1;

            }

            option.series[index].data.push([host.clientAddress, 1, 0]);

        }

        for(let join of rawData[date].joins) {

            let index = -1;
            if((index = option.legend.data.indexOf(join.slaveAddress)) == -1) {

                option.legend.data.push(join.slaveAddress);
                option.series.push({
                    name: join.slaveAddress,
                    type: 'scatter',
                    coordinateSystem: 'geo',
                    roam: true,
                    data: [],
                });
                index = option.legend.data.length - 1;

            }

            option.series[index].data.push([join.guestAddress, 0, 1]);

        }

    }

    for(let single of option.series) {

        let addressCollection = {};
        let cityCollection = {};

        for(let item of single.data) {

            if(!addressCollection[item[0]]) addressCollection[item[0]] = [];

            addressCollection[item[0]].push([item[1], item[2]]);

        }

        for(let address in addressCollection) {

            addressCollection[address] = addressCollection[address].reduce((previousValue, currentValue, currentIndex, array) => {

                return [previousValue[0] + currentValue[0], previousValue[1] + currentValue[1]];

            });

        }

        single.data = [];
        for(let address in addressCollection) {

            let geoData = mmdb.getGeoDataSync(address);
            if(!geoData) continue;

            if(!geoData.city) {

                console.log(address, geoData);
                continue;

            }

            var city = geoData.city.names['zh-CN'];
            if(!cityCollection[city]) {
                cityCollection[city] = [geoData.location.longitude, geoData.location.latitude, 0, 0];
            }

            cityCollection[city][2] += addressCollection[address][0];
            cityCollection[city][3] += addressCollection[address][1];

        }

        for(let city in cityCollection) {

            single.data.push([cityCollection[city][0], cityCollection[city][1], city, cityCollection[city][2], cityCollection[city][3]]);

        }

    }

    return option;

}

reader.on('line', (line: string) => {

    if(REGEX_HOST.test(line)) {

        let [, date, slaveAddress, slavePort, clientAddress, clientPort] = line.match(REGEX_HOST);

        //console.log(date, slaveAddress, slavePort, clientAddress, clientPort);

        if(!RawData[date]) RawData[date] = { hosts: [], joins: [] };
        RawData[date].hosts.push({
            slaveAddress: slaveAddress,
            slavePort: parseInt(slavePort),
            clientAddress: clientAddress,
            clientPort: parseInt(clientPort),
        });

    }

    if(REGEX_JOIN.test(line)) {

        let [, date, slaveAddress, slavePort, hostAddress, hostPort, guestAddress, guestPort] = line.match(REGEX_JOIN);

        //console.log(date, slaveAddress, slavePort, hostAddress, hostPort, guestAddress, guestPort);

        if(!RawData[date]) RawData[date] = { hosts: [], joins: [] };
        RawData[date].joins.push({
            slaveAddress: slaveAddress,
            slavePort: parseInt(slavePort),
            hostAddress: hostAddress,
            hostPort: parseInt(hostPort),
            guestAddress: guestAddress,
            guestPort: parseInt(guestPort),
        });

    }

});

reader.on('close', () => {

    //console.log(JSON.stringify(RawData, null, 4));

    require('fs').writeFileSync(_path.join(__dirname, '../static/analysisData.js'), 'window.analysisData = ' + JSON.stringify(MakeEchartsOption(RawData), null, 0));

});
