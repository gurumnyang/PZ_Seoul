const fs = require('fs');
const through = require('through2');
const arraySort = require('array-sort');
const convert = require('./convert.js');
const path = require('path')
const os = require('os');

const parseOSM = require('osm-pbf-parser');
const canvas = require("canvas");
const config = JSON.parse(fs.readFileSync('./config.json').toString());
const roadType = JSON.parse(fs.readFileSync('./roadType.json').toString());
const roadData = JSON.parse(fs.readFileSync(config.roadFileSrc).toString());

module.exports = class osmRead {
    constructor(lat, lon, src) {
        this.lat = lat;
        this.lon = lon;
        this.cell = [];
        this.nodeList = [];
        this.wayList = [];
        this.latCell = convert.toMeter('lat', Math.abs(lat[0]-lat[1]))/300;
        this.lonCell = convert.toMeter('lon', Math.abs(lon[0]-lon[1]))/300;
        this.osm = parseOSM();
        this.src = src;
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
                            this.wayList.push(item);
                        }
                        if(item.lat&&item.lon){
                            if(item.type === 'node'){
                                this.nodeList.push(item);
                            }
                        }
                    });
                    next();
                })).on('finish', ()=>{
                this.wayList = arraySort(this.wayList, 'id', {});
                this.nodeList = arraySort(this.nodeList, 'id', {});
                resolve();
            });
        });
    }
    parseData(){
        return new Promise(async (resolve)=> {
            await this.nodeArrayHash();
            await this.nodeAdd();
            await this.nodeToCell();
            await this.wayArrayHash();
            resolve();
        });

    }
    nodeArrayHash(){
        return new Promise(resolve=>{
            this.nodeHash = {};
            for(let node of this.nodeList){
                this.nodeHash[node.id] = node;
            }
            resolve();
        });
    }
    wayArrayHash(){
        return new Promise(resolve=>{
            this.wayHash = {};
            for(let way of this.wayList){
                this.wayHash[way.id] = way;
            }
            resolve();
        });
    }

    nodeAdd(){
        let start = new Date();
        for(let way_index in this.wayList){

            if(this.wayList[way_index].tags.name){
                let roadFound = roadBindFind(this.wayList[way_index].tags.name, roadData.DATA);
                if(roadFound){
                    this.wayList[way_index].roadData = roadFound;
                } else {
                    this.wayList[way_index].roadData = null;
                }
            }

            for(let refIndex in this.wayList[way_index].refs){
                if(typeof this.wayList[way_index].refs[refIndex] !== 'number') continue;
                let nodeObj = this.nodeHash[this.wayList[way_index].refs[refIndex]];
                if(nodeObj){
                    if(!this.nodeHash[this.wayList[way_index].refs[refIndex]].ways) this.nodeHash[this.wayList[way_index].refs[refIndex]].ways = [];
                    this.nodeHash[this.wayList[way_index].refs[refIndex]].ways.push(this.wayList[way_index].id);

                    this.wayList[way_index].refs[refIndex] = {
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
        console.log('하나의 ways당 소요된 시간: ', (new Date() - start)/this.wayList.length/1000, '초');
    }
    nodeToCell(){
        return new Promise(resolve => {
            for(let item of this.nodeList){
                (this.cell)[Math.floor(convert.toMeter('lat', config.lat[0] - item.lat ) / 300)][Math.floor(convert.toMeter('lon', item.lon - config.lon[0]) / 300)].push(item.id);
            }
            resolve();
        });
    }
    generate(x, y){
        let start = new Date();
        let img = canvas.createCanvas(300,300);
        let ctx = img.getContext('2d');

        let coord = {
            x: this.lon[0] + convert.toAngle('lon', x*300),
            y: this.lat[0] - convert.toAngle('lat', y*300)
        }
        ctx.fillStyle = "#787878"
        ctx.fillRect(0,0,300,300);
        ctx.lineWidth = 2;

        //ways will be render.
        let cellWays_id = [];
        let cellWays = [];
        let notFound = [];

        let task = [
            [1,-1],
            [1,0],
            [1,1],
            [0,-1],
            [0,0],
            [0,1],
            [-1,-1],
            [-1,0],
            [-1,1]
        ];

        for(let i = 0; i <task.length; i++){
            if(!this.cell[y + task[i][0]]) continue;
            const cellObj = this.cell[y + task[i][0]][x + task[i][1]];
            if(!cellObj) continue;
            for(let obj_id of cellObj){
                let obj = this.nodeHash[obj_id];
                if(!obj) {
                    console.log(`nodeHash에 해당 노드가 존재하지 않음. ID: ${obj_id}`);
                    notFound.push(obj_id);
                    continue;
                }
                if(!obj.ways) continue; //node중엔 경유지점이 없는 것도 있다.
                for(let obj_1 of obj.ways){
                    const found = this.wayHash[obj_1];
                    if(found){
                        if(!cellWays_id.find(e => (e == found.id))){
                            cellWays.push(found);
                            cellWays_id.push(found.id);
                        }
                    } else {
                        notFound.push(obj_1);
                    }
                }
            }
        }

        //change ctx setting to rendering roads.
        ctx.strokeStyle = '#646464';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 1;
        ctx.antialias = 'none';




        for(let route of cellWays){
            if(route.tags.highway == 'footway') continue;
            ctx.beginPath();
            for(let pointIdx in route.refs){
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#646464';
                if(route.roadData){
                    if(!!roadType[route.roadData["siz_cde_nm2"]]){
                        ctx.lineWidth = roadType[route.roadData["siz_cde_nm2"]];
                    } else {
                        console.log('roadType failed to load', route.roadData["siz_cde_nm2"]);
                    }
                    // ctx.lineWidth = 뭐시기
                } else {
                    // ctx.strokeStyle = '#c86464';
                }
                if(pointIdx === 0) {
                    ctx.moveTo(Math.floor(convert.toMeter('lon', route.refs[pointIdx].lon - this.lon[0]) - (300*x)), Math.floor(convert.toMeter('lat', this.lat[0]-route.refs[pointIdx].lat) - (300*y)));
                }
                else {
                    ctx.lineTo(Math.floor(convert.toMeter('lon', route.refs[pointIdx].lon - this.lon[0]) - (300*x)), Math.floor(convert.toMeter('lat', this.lat[0]-route.refs[pointIdx].lat) - (300*y)));
                }
            };
            ctx.stroke();
        }
        // ctx.fillStyle = 'white';
        // ctx.fillText(coord.x, 0,10);
        // ctx.fillText(coord.y, 0, 20);

        if(!fs.existsSync(path.join(this.src,'/rendered/'))) fs.mkdirSync(path.join(this.src,'/rendered/'));
        return new Promise(resolve => {
            img.createPNGStream().pipe(fs.createWriteStream(path.join(this.src,'/rendered/'+x+'_'+y+'.png'))
                .on('finish', ()=>{

                console.log('\n');
                // console.log(coord);
                // console.log('/rendered/'+x+'_'+y+'.png saved');

                //rendering veg image
                img = canvas.createCanvas(300,300);
                ctx = img.getContext('2d');
                ctx.antialias = 'none';

                ctx.fillStyle = 'black';
                ctx.fillRect(0,0,300,300);

                img.createPNGStream().pipe(fs.createWriteStream(path.join(this.src,'/rendered/'+x+'_'+y+'_veg.png'))
                    .on('finish',()=>{
                    if(notFound.length> 0) console.log(notFound.length, '개의 Node를 찾을 수 없음.');
                    if(!this.average) this.average = (new Date() - start);
                    else this.average = ((this.average*49) + (new Date() - start))/50;

                    console.clear();

                    console.log(`[${x},${y}] rendered in ${(new Date() - start)}ms average: ${Math.floor(this.average*10)/10}ms`);
                    resolve();
                }))
            }));
        });
    }
    showCellData(x, y){
        for(let obj of this.cell[y][x]){
            if(!this.nodeHash[obj].ways) continue;
            for(let way_index of this.nodeHash[obj].ways){
                console.log(this.wayHash[way_index])
            }
        }
    }

}

function roadBindFind(id, data){
    let low = 0;
    let high = data.length - 1;
    let mid = Math.floor((low + high) / 2);
    while(true){
        mid =  Math.floor((low + high)/2);
        if(low>high) return false;
        if(data[mid].rod_num === id){
            return data[mid];
        }
        if([id, data[mid].rod_num].sort()[0] === id){
            high = mid - 1;
        } else {
            low = mid + 1;
        }
    }
}