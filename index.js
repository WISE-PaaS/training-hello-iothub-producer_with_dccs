const express = require('express');
const mqtt      = require('mqtt');      // Using MQTT.js npm
const https     = require('https');
const app = express();

app.get('/', (req, res) => {
  res.send('Hello WISE-PaaS!');
});

// Typically in the hosting environment for node application, there's an env variable called 'PORT'
const port = process.env.PORT || 3030;
const server = app.listen(port, () => console.log(`Listening on port ${port}...`));

// Start Config
var config                   = {};

config.mqtt                  = {};
config.mqtt.topic            = ".training";
config.mqtt.retain           = true; // MQTT Publish Retain
config.mqtt.publish_interval = 3000;

config.dccs                  = {};
config.dccs.apiEndPoint      = 'SELECT_DCCS_API_OF_YOUR_DOMAIN' // 'https://api-dccs.wise-paas.com/v1/serviceCredentials/';
config.dccs.key              = 'MODIFY_YOUR_DCCS_KEY';

// 1. Get Credential from DCCS
// 2. Make MQTT Client by Credential
const getCredentialByDCCS = new Promise((resolve, reject) => {
    https.get(config.dccs.apiEndPoint+config.dccs.key, (res) => {
      var rawData = '';
      res.on('data', (d) => {
        rawData += d;
      });

      res.on('end', function(){
        console.log('Status:', res.statusCode);
        //process.stdout.write(d);
        if (res.statusCode === 200) {
          vcap_services = JSON.parse(rawData);
          //console.log(vcap_services);
          resolve(vcap_services);
        }
        else if (res.statusCode === 400) {
          const reason = "Check DCCS Key and Retry";
          console.log(reason);
          reject(reason);
        }
        else if (res.statusCode === 404) {
          const reason = "Not Exists, STOP MQTT Client and DCCS Retry";
          console.log(reason);
          reject(reason);
        }
        else if (res.statusCode === 410) {
          const reason = "Key Disable, STOP MQTT Client and DCCS Retry";
          console.log(reason);
          reject(reason);
        }
      });

    }).on('error', (e) => {
      console.error(e);
      reject(e);
    });          
});

async function main() {
  try {
      console.log("1. Get Credential from DCCS");
      let credentials = await getCredentialByDCCS;
      //console.log(credentials);
      console.log("2. Make MQTT Client by Credential");
      // Parsing credentials from VCAP_SERVICES for binding service
      
      config.mqtt.broker		= "mqtt://" + credentials.credential.externalHosts;
      config.mqtt.username	= credentials.credential.protocols.mqtt.username.trim();
      config.mqtt.password	= credentials.credential.protocols.mqtt.password.trim();
      config.mqtt.port		= credentials.credential.protocols.mqtt.port;

      config.mqtt.options = {
          broker: config.mqtt.broker,
          reconnectPeriod: 1000,
          port: config.mqtt.port,
          username: config.mqtt.username,
          password: config.mqtt.password
      };

      console.log(config.mqtt.options);

        // Start MQTT
        var client    = mqtt.connect(config.mqtt.broker,config.mqtt.options);

        client.on('connect', function () {            
            console.log("[MQTT]:", "Connected.");
            setInterval(function(){
                var publish_payload = 'Hello DCCS, client time:'+new Date();
                console.log("Publish: "+publish_payload);
                client.publish(config.mqtt.topic,publish_payload);
            },config.mqtt.publish_interval);
        });
         
        client.on('message', function (topic, message) {
            console.log("[" + topic + "]:" + message.toString());
        });

        client.on('error', function(err) {
            console.log(err);
        });

        client.on('close', function() {
            console.log("[MQTT]: close");
        });

        client.on('offline', function() {
            console.log("[MQTT]: offline");
        });

          } catch (error) {
              console.log(error.message);
          }
        }

(async() => {
    await main();
})();