const fs = require('fs');
const path = require('path');
const through = require("through2");
const arraySort = require("array-sort");
const parseOSM = require('osm-pbf-parser');
const polygonClipping = require('polygon-clipping');
const convert = require("./convert");
/**
 * @todo PolygonClipping 사용하여 셀별로 강 폴리곤 분리하여 렌더링
 */

module.exports = class osmRead {
    constructor(lat, lon, src){
        this.lat = lat;
        this.lon = lon;
        this.cell = [];
        this.nodes = [];
        this.nodesHash = {};
        this.ways = [];
        this.waysHash = {};
        this.latCell = convert.toMeter('lat', Math.abs(lat[0]-lat[1]))/300;
        this.lonCell = convert.toMeter('lon', Math.abs(lon[0]-lon[1]))/300;
        this.osm = parseOSM();
        this.src = src;
        this.readAndParse();
    }

    readAndParse(){
        return new Promise(async (resolve)=> {
            fs.createReadStream('../terrain_01.pbf')
                .pipe(parseOSM())
                .pipe(through.obj((items, enc, next)=> {
                    items.forEach((item)=> {
                        switch (item.type){
                            case 'node':
                            {

                                break;
                            }
                            case 'way':
                            {

                                break;
                            }
                            case 'relation':
                            {

                                break;
                            }
                        }
                        if(item.type !== 'node'&& item.type !== 'way'){
                            console.log(item.type);
                        }
                    });
                    next();
                })).on('finish', ()=>{
                    resolve();
                }
            );
        });
    }
}

new osmRead([37.6875428, 37.4307532, 111], [126.7684945, 127.2037614, 88.74], '../data/pzw/edited.pzw');