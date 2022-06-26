const fs = require('fs');
const through = require('through2');
const arraySort = require('array-sort');
const convert = require('./convert.js');

const parseOSM = require('osm-pbf-parser');
const config = JSON.parse(fs.readFileSync('./config.json').toString());

module.exports = class osmRead {
    constructor(lat, lon) {
        this.lat = lat;
        this.lon = lon;
        this.cell = [];
        this.nodes = [];
        this.ways = [];
        this.latCell = convert.toMeter('lat', Math.abs(lat[0]-lat[1]))/300;
        this.lonCell = convert.toMeter('lon', Math.abs(lon[0]-lon[1]))/300;
        this.osm = parseOSM();
    }
    init(){
        return new Promise(async resolve=>{
            await this.genCell();
            console.log('위도 ',Math.floor(this.latCell),'셀, ', this.cell.length,'lat');
            console.log('경도 ',Math.floor(this.lonCell),'셀  ', this.cell[0].length,'lon');
            resolve();
        });
    }
    genCell(){
        return new Promise(resolve=>{
            for (let lat = 0; lat < Math.floor(this.latCell); lat++) {
                (this.cell)[lat] = [];
                for (let lon = 0; lon < Math.floor(this.lonCell); lon++) {
                    (this.cell)[lat][lon] = [];
                }
            }
            resolve();
        });
    }
    loadData() {
        return new Promise((resolve) => {

            console.log('불러오는 중');

            fs.createReadStream(config.fileSrc)
                .pipe(this.osm)
                .pipe(through.obj((items, enc, next)=> {
                    items.forEach((item)=> {
                        if(item.type === 'way'){
                            this.ways.push(item);
                        }
                        if(item.lat&&item.lon){
                            if(item.type === 'node'){
                                this.nodes.push(item);
                            }
                        }
                    });
                    next();
                })).on('finish', ()=>{
                this.ways = arraySort(this.ways, 'id', {});
                this.nodes = arraySort(this.nodes, 'id', {});
                resolve();
            });
        });
    }
    parseData(){
        return new Promise(async (resolve)=> {
            await this.nodeArrayHash();
            await this.nodeAdd();
            resolve();
        });

    }
    nodeArrayHash(){
        return new Promise(resolve=>{
            this.nodeHash = {};
            for(let node of this.nodes){
                this.nodeHash[node.id] = node;
            }
            resolve();
        });
    }
    wayArrayHash(){
    }

    nodeAdd(){
        let start = new Date();
        for(let obj of this.ways){
            for(let refIndex in obj.refs){
                if(typeof obj.refs[refIndex] !== 'number') continue;
                let nodeObj = this.nodeHash[obj.refs[refIndex]];
                if(nodeObj){
                    if(!this.nodeHash[obj.refs[refIndex]].ways) this.nodeHash[obj.refs[refIndex]].ways = [];
                    this.nodeHash[obj.refs[refIndex]].ways.push(obj.id);

                    obj.refs[refIndex] = {
                        id: nodeObj.id,
                        lat: nodeObj.lat,
                        lon: nodeObj.lon
                    }

                } else {
                    console.log('노드 누락됨. -' + obj.refs[refIndex]);
                }
            }
        }
        console.log(new Date() - start+'ms');
        console.log('하나의 ways당 소요된 시간: ', (new Date() - start)/this.ways.length, 'ms');
    }
}