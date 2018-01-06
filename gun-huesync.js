/**
 * gun-huesync
 * @author  S.J.J. de Vries ( Stefdv2@hotmail.com)
 * @gitter @Stefdv
 * @purpose sync Philips Hue Bridge settings with Gun
 *
 */
;(function(){
  if(typeof window !== "undefined"){
    var Gun = window.Gun;
  } else {
    var Gun = require('gun/gun');
    require('gun/lib/path.js');
    var axios = require('axios');
  }
	/*
  		when gun-husync loads, it will fetch the fullState
  		from the bridge and put it in Gun.
  		'_listen'  will prevent the callback from executing
  		during this process.
   */
	var _listen = false; 
	/*
			Some fields in the Hue Bridge JSON are arrays
			that are converted to Objects.
			'convertBack' will hold the paths to those fields
			so we can compare them on changes and convert them
		  back to an array before sending it to the bridge again.
	 */ 
	var convertBack = {};
	/**
 * Generate a url to the hue API root,
 * optionally taking an array of routes.
 *
 * @private
 * @param  {String} domain - the ip/domain name of the hue bridge
 * @param  {String} key - your private authentication key
 * @param  {Array} [path] - a list of routes to append to the url
 * @returns {String} - the fully formatted url
 */
function hueURL (domain, key, path) {
	return ([ 'http:/', domain, 'api', key ])
		.concat(path || [])
		.join('/');
};



	/**
	 * Adapted from @amark's "hue_onward" plugin, 
	 * but modified for HUE!
	 * Listens for changes at any depth, and provides a path to them.
	 *
	 * @author Mark Nadal
	 * @see https://github.com/gundb/hue_onward
	 *
	 * There is a bug where onward fires twice, the first time it 
	 * will only contain the actual change ( { bri:200}) but the 
	 * second time it contains the whole object.
	 * 
	 * Just make sure you put your data with full path
	 * `Gun.HUE.path('lights.1.state.bri').put(200)` // GOOD fires once
	 * `Gun.HUE.path('lights.1.state').put({bri:200})`  // BAD fires twice
	 */

	Gun.chain.hue_onward= function (cb, opt) {
		  var gun = this;

	    cb = cb || function(){};
		  opt = (opt === true ? {full: true} : opt || {});

		  opt.ctx = opt.ctx || {};
		  opt.path = opt.path || [];
		  if(opt.path !==['HUE']) {
			  gun.on(function(change, field){
			  		// IMPORTANT: copy your node due to 'leak' bug;
			      change = Gun.obj.copy(change);
			      let o = Gun.obj.copy(opt);
			      o.path = opt.path.slice(0); // copy array
			      if(field){ o.path.push(field) }

			      Gun.obj.map(change, function(val, field){
			        if(Gun._.meta == field){ return }
			        if(Gun.obj.is(val)){
			          delete change[field];
			          let soul = Gun.val.rel.is(val);
			          let objectID = soul + field;
			          if(opt.ctx[objectID]){ return } 	// do not re-subscribe.
			          opt.ctx[objectID] = true; 				// unique subscribe!
			        	if(field !== '_' && field!=='>') { // no need to subscribe to those
			        		//console.log('subscribe to ', o.path.join('.') + '.' + field)
			          	this.get(field).hue_onward(cb,o) // subscribe to this path
			        	}

			          return;
			        }
			      }, gun);

		      if(Gun.obj.empty(change, Gun._.meta)){ return }
		      if(opt._ === false){ delete change._ }
		      cb(change, o.path);
		    }, !opt.full); 
		   }
		    return gun;
	};






/**
 * Reads the state of hue and imports it into your
 * gun instance, while listening for changes and
 * sending back to the bridge.
 *
 * @method hue
 * @param {Object} auth - your authentication information
 * @param {String} auth.domain - your hue bridge IP address
 * @param {String} auth.key - your hue API key
 * @returns {Promise} - the web request for your hue state
 * @example
 * let gun = new Gun().get('hue')
 *
 * gun.hue({
 *   domain: '192.168.1.150',
 *   key: 'ZaJV5zCgoH5cBsbKtDZmFLbg',
 * })
 * 
 *
 * 
 */
function subscribe(auth) {
console.log(auth)
	if(typeof auth.domain !=='string') { console.warn('Hue IP address required.')}
	if(typeof auth.key !=='string') { console.warn('Authentication key required.')}
	let gun = this;
	let rootURL = hueURL(auth.domain, auth.key);
	Gun.HUE = gun.get('HUE');
	gun.get('HUE').hue_onward( (change, path) => {


		if(_listen) {// The first run i don't want to do anything
	   console.log('received change')
	    if(change instanceof Object) {
	    	change = Gun.obj.copy(change)
	      delete change._;
	    }
	    if(!change['#']){ 
	    	let str = path.indexOf("HUE")
	      if(str != -1) {
	      	// the path contains 'HUE', we don't want need that.
	        path.splice(str, 1);
	      }
	     	let changeURL = hueURL(auth.domain, auth.key, path);
	      _submitToBridge(auth,path,change);
	    }
	 } 
  },false);

  _fullStateToGun(rootURL,gun)
}

/*
	TODO:
	There is still a problem when setting lights on groups.
	`gun.get('HUE').path('groups.1.lights').put({0:1,1:6})` does work but fires twice
	`gun.get('HUE').path('groups.1.lights').put({0:1,1:2,2:3,3:4})`
	`gun.get('HUE').path('groups.1.lights').put({0:1})` fails
	So i need to 
	- first get the object back from Gun {0:1,1:6}
	- then store it as ``gun.get('HUE').path('groups.1.lights.0').put(1)`
 */
function _submitToBridge(auth,path,change){
	function ObjToArray(obj) {
		obj = Gun.obj.copy(obj)
		delete obj._
		return Object.values(obj);
	}
	let changeURL;
	//console.log(convertBack)
	//console.log(path.join('.'))
	if(convertBack[path.join('.')]) {
		// remove last from changeUrl
		let key = path.pop(); // will remove last from path also !
		// convert change back to Array.
		let val = ObjToArray(change);
		// reset change
		change = {};
		// create new change
		change[key] = val
	}
	changeURL = hueURL(auth.domain, auth.key, path);
	console.log('PUT ',changeURL,  Gun.text.ify(change))
	axios.put(changeURL,Gun.text.ify(change))
	
}


/**
	* Send GET request to bridge for the fullstate.
	* Run the response to 'gunalize' to convert Arrays to Objects
	* Put the fullstate in gun (gun.get('HUE'))
	*/
function _fullStateToGun(rootURL,gun) {
	console.log('_fullStateToGun')


	axios
		.get(rootURL)
		.then(function (response) {
			/** Put the data into the gun instance*/
			let d = _gunalize(response.data);
			_processToGun(d);
		});
}

/**
 * Hue bridge returns a JSON with some Array fields
 * Gun doesn't validate Arrays so we need to convert those 
 * to Objects.
 * NOTE: remember that you will have to transform them back to arrays
 * before sending the commands back to the bridge!!
 */

function _gunalize(obj) {
  // convert Array to Object 
  let _arrayToObject = (arr) =>{
	  let rv = {};
	  let i;
	  for (i = 0; i < arr.length; ++i){
	    rv[i] = arr[i];
	  }
	  return rv;
  };
  let path=[]
  // iterate (deep) over the JSON Object and convert every Array to an Object
  var _iterate = function(obj,stack) {

		for(var prop in obj) {
	  	if(obj.hasOwnProperty(prop)) {
	  		if(Array.isArray(obj[prop])){
	  			convertBack[stack + '.' + prop] = true;
	  			obj[prop] = _arrayToObject(obj[prop])
	  		} else if(typeof obj[prop] == "object") {
	    		stack ? _iterate(obj[prop], stack + '.' + prop) : _iterate(obj[prop],prop);
	      } 
	    } 
	  } 
	  return obj
	}

  // Start the iteration
  return _iterate(obj);
}

function _processToGun(obj) {

	var iterate = function(obj,stack) {
		for(var property in obj) {
	  	if(obj.hasOwnProperty(property)) {
	    	if(typeof obj[property] == "object") {
	    		if(!stack) { iterate(obj[property],property);} 
	    		else { iterate(obj[property], stack + '.' + property);}
	      } else {
	       let data = {};
	       data[property] = obj[property];
	     //  console.log(`gun.get('HUE').path("${stack}").put(${Gun.text.ify(data)})`)
	       Gun.HUE.path(stack).put(data);
	      } 
	    } 
	  } 
	}
	iterate(obj);
	_listen = true;
}

Gun.prototype.hue = subscribe;

}());
