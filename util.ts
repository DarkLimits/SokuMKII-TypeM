
export function Flow(generator) {

	var instance = generator(cb);

	function cb(argument) {

		//try {

			return instance.next(arguments);

		//}
		//catch(err) {

			//console.error(err);

		//}

	}

	instance.next();

}

export function RinfoKey(rinfo) {

	return rinfo.address + ":" + rinfo.port;

}
