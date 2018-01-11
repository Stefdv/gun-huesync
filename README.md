Gun-Huesync
---------------------------------
*Real-time updates with hue and gunDB*

Inspired by `gun-hue` from @PsychoLlama, but rewritten from scratch.

## What it is
'gun-huesync' will fetch the fullstate from your Philips Hue bridge and puts it in Gun. Then you can control your bridge/lights/schedules/groups etc with the Gun API.

By using gun, you get some immediate benefits:

 - simpler API interface
 - easy real-time UI updates
 - real-time updates on other client's apps
 - offline editing
 
## Don't have a HUE bridge but want to develop for it anyway ?

I have a fork of hue-simulator here https://github.com/Stefdv/hueSimulator
( the original installs global )
```
 npm install Stefdv/hue-simulator
```

## How to use it

```sh
npm install gun-huesync
```

```js
require('gun-huesync');
```
This will add 

`gun.huesync()` takes an object with the IP of the bridge and your private key. To find the bridge and get an API key, read [this great guide](http://www.developers.meethue.com/documentation/getting-started).

```javascript
gun.huesync({
  domain: '192.168.1.337',
  key: 'HfBwAl0gNPUQnmqCaxZCcNfd',
})
```

Once you've done that, it'll fetch the hue state and plug it in your gun instance. 

##NOTE: 

Due to the changed Gun API, `map()` does not work as before 
( like with Gun 0.3 ;p)

I recommend to use the `each()` snippet and also to import `path.js` from 'gun/libs/path.js'


```javascript
var HUE = gun.get('HUE');
var lights = HUE.get('lights');
var groups = HUE.get('groups');
// Print out your available lights
 lights.each(nr => {
    lights.path('nr.state').val(state=>{
        console.log(state)
    })
 })

// Turn on all the lights
 lights.each(nr => {
    lights.path('nr.state.on').put(true)
 })

// Print out all the groups
groups.each(nr => {
    groups.path('nr').val( group => {
        console.log(group)
    })
})

// Listen for changes to a lights' brightness

// Change the brightness
lights.get(5).get('state').get('bri').put(42)
```
or if you loaded `path.js`
```
lights.path('5.state.bri').put(42)
```

But i probably will include methods for this later on

## TODO
Provide examples 

## Warning
If you change the state of the lights through something other than gun after it's already connected, the state won't sync. This is because this library doesn't poll the rest service. 
However...if you manage to link your Hue app to the server where gun-huesync is running...well... gun-huesync will send all requests to the bridge anyway, but it will also update your Gun data.


## Support
Have questions? Either post an issue or tag me on [Gitter](https://gitter.im/amark/gun/) (I usually hang out there as @Stefdv).


