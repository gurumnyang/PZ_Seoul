const fs = require('fs');
const path = require('path');
const through = require("through2");
const arraySort = require("array-sort");
const parseOSM = require('osm-pbf-parser');
const polygonClipping = require('polygon-clipping');
const convert = require("./convert");
const appRoot = process.cwd();
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
        this.relations = [];
        this.relationsHash = {};

        this.latCell = convert.toMeter('lat', Math.abs(lat[0]-lat[1]))/300;
        this.lonCell = convert.toMeter('lon', Math.abs(lon[0]-lon[1]))/300;
        this.osm = parseOSM();
        this.src = src;
        this.readAndParse().then(r => {});
    }

    readAndParse(){
        return new Promise(async (resolve)=> {
            fs.createReadStream(path.join(appRoot, '/terrain_01.pbf'))
                .pipe(parseOSM())
                .pipe(through.obj((items, enc, next)=> {
                    items.forEach((item)=> {
                        switch (item.type){
                            case 'node':
                            {
                                if(!this.nodesHash[item.id]){
                                    this.nodesHash[item.id] = item;
                                    this.nodes.push(item);
                                }
                                break;
                            }
                            case 'way':
                            {
                                if(!this.waysHash[item.id]){
                                    this.waysHash[item.id] = item;
                                    this.ways.push(item);
                                }
                                break;
                            }
                            case 'relation':
                            {
                                if(!this.relationsHash[item.id]){
                                    this.relationsHash[item.id] = item;
                                    this.relations.push(item);
                                }
                                break;
                            }
                        }
                    });
                    next();
                })).on('finish', ()=>{
                    console.log('finish');
                    resolve();
                }
            );
        });
    }
}