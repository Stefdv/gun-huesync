/**
 * gun-huesync
 * An interface between your Philips HUE Bridge and Gundb
 * - loads the fullstate from the Bridge and puts it in Gun (soul:'HUE')
 * - Acts on any change that will be made on this Data
 * - Sends these changes to the Bridge.
 *
 *

 *
 * in node just do :
 * ```
 *  gun.hue({
 *  	domain:'my_bridge_ip:port_if_not_port_80',
 *  	key: 'authorisation_key'
 *  })
 * ```
 * NOTE: 
 * You should use gun-huesync on the server only!!

 * @author  S.J.J. de Vries ( Stefdv2@hotmail.com)
 * @gitter @Stefdv
 * @purpose sync Philips Hue Bridge settings with Gun
 *
 */
;(function(){
  if(typeof window !== "undefined"){
    console.warn('gun-huesync should be loaded on your Gun-server!\n' + 
   	' Then from your -connected- application you can access gun.get("HUE") ')

  } else {
    var Gun = require('gun/gun');
    require('gun/lib/path.js');
    var axios = require('axios');
	/*
  		when gun-husync loads, it will fetch the fullState
  		from the bridge and put it in Gun.
  		'_listen'  will prevent the callback from executing
  		during this process.
   */
	var _listen = false; 
	/*
			Some fields in the Hue Bridge JSON are arrays
			that we convert to Objects.
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
	 * Adapted from @amark's "_onward" plugin, 
	 * but modified for HUE!
	 * Listens for changes at any depth, and provides a path to them.
	 *
	 * @author Mark Nadal
	 * @see https://github.com/gundb/_onward
	 *
	 * There is a bug where onward fires twice, the first time it 
	 * will only contain the actual change ( { bri:200}) but the 
	 * second time it contains the whole object.
	 * 
	 * Just make sure you put your data with full path
	 * `Gun.HUE.path('lights.1.state.bri').put(200)` // GOOD fires once
	 * `Gun.HUE.path('lights.1.state').put({bri:200})`  // BAD fires twice
	 */

function _onward(gun,cb, opt) {
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
			          	_onward(this.get(field),cb,o) // subscribe to this path
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
 * sending those back to the bridge.
 *
 * @method huesync
 * @param {Object} auth - your authentication information
 * @param {String} auth.domain - your hue bridge IP address
 * @param {String} auth.key - your hue API key
 * @returns {Promise} - the web request for your hue state
 * @example
 *
 * gun.huesync({
 *   domain: '192.168.1.150',
 *   key: 'ZaJV5zCgoH5cBsbKtDZmFLbg',
 * })
 * 
 *
 * 
 */
function huesync(auth) {
	if(typeof auth.domain !=='string') { console.warn('Hue IP address required.')}
	if(typeof auth.key !=='string') { console.warn('Authentication key required.')}
	let gun = this;
	let rootURL = hueURL(auth.domain, auth.key);
	Gun.HUE = gun.get('HUE');
	
	_onward(Gun.HUE,(change, path) => {
		if(_listen) {
	   console.log('received change')
	    if(change instanceof Object) {
	    	change = Gun.obj.copy(change)
	      delete change._;
	    }
	    if(!change['#']){ 
	    	let str = path.indexOf("HUE")
	      if(str != -1) {
	      	// the path contains 'HUE', we don't need that.
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
	- then store it as `gun.get('HUE').path('groups.1.lights.0').put(1)`

	@method _submitToBridge
	compare the path with convetBack
	if the path exists there we need to convert it back to an array
	send a PUT request to the bridge
 */
function _submitToBridge(auth,path,change){
	let changeURL,body={},key;
	console.log(convertBack[path.join('.')],change)
	change = convertBack[path.join('.')] ? _objToArr(change) : change;
	key = path.pop();
	body[key] = change;
	changeURL = hueURL(auth.domain, auth.key, path);
	console.log('PUT ',changeURL,  Gun.text.ify(body))
	axios
		.put(changeURL,Gun.text.ify(body))
		
}




/**
	* Send GET request to bridge for the fullstate.
	* Run the response thru '_prepareForGun' to convert Arrays to Objects
	* Put the fullstate in gun (gun.get('HUE'))
	*/
function _fullStateToGun(rootURL,gun) {
	console.log('Trying to connect to HUE Bridge @ : "%s" ',rootURL)
	axios
		.get(rootURL)
		.then(function (response) {
			console.log('Connected...Fetching FullState')

			_saveToGun(_prepareForGun(response.data));
		}).catch(function (error) {
    	console.log('Could NOT connect to HUE bridge! Please check your domain and key');
  	});
}

/**
 * Hue bridge returns a JSON with some Array fields
 * Gun doesn't validate Arrays so we need to convert those 
 * to Objects.
 * NOTE: we use 'convertBack' to remember which paths we need to transform back to arrays
 * before sending the commands back to the bridge!!
 */

function _prepareForGun(obj) {
	console.log('converting Arrays to Objects')
  let _iterate = function(o,s) {

		for(var p in o) {
	  	if(o.hasOwnProperty(p)) {
	  		if( Gun.list.is(o[p]) ){
	  			convertBack[s + '.' + p] = true;
	  			console.log('...',s + '.' + p)
	  			o[p] = _arrToObj(o[p]);
	  		} else if( Gun.obj.is(o[p]) ) {
	    		s ? _iterate(o[p], s + '.' + p) : _iterate(o[p],p);
	      } 
	    } 
	  } 
	  return o
	}
  // Start the iteration
  return _iterate(obj);
}

/**
 * Store the fullState in Gun
 * use the paths as keys so we can do
 * `gun.get('HUE').path('lights.1.state')`
 */
function _saveToGun(o) {
	console.log('Putting FullState into Gun ')
	let iterate = function(o,s) {

		for(var p in o) {
	  	if(o.hasOwnProperty(p)) {
	    	if(Gun.obj.is(o[p])) {
	    		s ? iterate(o[p], s + '.' + p) : iterate(o[p],p);
	      } else {
	       let d = {};
	       d[p] = o[p];
	       //console.log(`gun.get('HUE').path(${s}).put(${Gun.text.ify(d)})`)
	       Gun.HUE.path(s).put(d);
	      } 
	    } 
	  } 
	}

	iterate(o);
	_listen = true;
	console.log('Listening for changes that need to be synced to the Hue Bridge')

}

function _arrToObj(a) {
	 let o = {},i;
	 for (i = 0; i < a.length; ++i){o[i] = a[i];}
	 return o;
}

function _objToArr(o) {
		o = Gun.obj.copy(o)
		delete o._
		return Object.values(o);
	}

Gun.chain.huesync = huesync;
};
}());
