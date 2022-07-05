const fs = require('fs');
const path = require('path');

let config = JSON.parse(fs.readFileSync(path.join(__dirname + "/config.json")).toString());

module.exports.getDistance = function getDistance(lat, lon){
    return Math.sqrt(Math.abs(lat[0]-lat[1]) + Math.abs(lon[0]-lon[1]));
}

module.exports.toMeter = function toMeter(type, distance){
    if(type === 'lat') return distance*config.lat[2]*1000;
    if(type === 'lon') return distance*config.lon[2]*1000;
}

module.exports.toAngle = function toAngle(type, distance) {
    if (type === 'lat') return distance / config.lat[2] / 1000;
    if (type === 'lon') return distance / config.lon[2] / 1000;
}