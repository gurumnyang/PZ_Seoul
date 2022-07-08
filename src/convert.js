const fs = require('fs');
const path = require('path');
const appRoot = process.cwd();

let config = JSON.parse(fs.readFileSync(path.join(appRoot, "/config.json")).toString());

module.exports.getDistance = function getDistance(lat, lon){
    return Math.sqrt(Math.abs(lat[0]-lat[1]) + Math.abs(lon[0]-lon[1]));
}
module.exports.getAngle = function getAngle(A, B, C) {
    return Math.atan2( (A.y - B.y), (A.x - B.x) ) - Math.atan2( (C.y - B.y ), (C.x - B.x))*180/Math.PI;
}

module.exports.toMeter = function toMeter(type, distance){
    if(type === 'lat') return distance*config.lat[2]*1000;
    if(type === 'lon') return distance*config.lon[2]*1000;
}

module.exports.toAngle = function toAngle(type, distance) {
    if (type === 'lat') return distance / config.lat[2] / 1000;
    if (type === 'lon') return distance / config.lon[2] / 1000;
}