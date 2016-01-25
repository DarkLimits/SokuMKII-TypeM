module.exports = {
    "Master": {
        "port": 54678,
        "httpPort": 54680,
        "trustedSlaves": ["121.42.136.163:23333"],
    },
    "Slave": {
        //"masterAddress": "121.42.136.163",
        "masterAddress": "127.0.0.1",
        "masterPort": 54680,
        "port": 23333,
        "name": "NONAME",
    },
};
