const fs = require('fs'),
    through = require('through2'),
    path = require('path'),
    arraySort = require('array-sort'),
    GeoJSON = require('geojson'),
    convert = require('./convert.js'),
    canvas = require("canvas"),
    turf = require('turf'),
    parseOSM = require('osm-pbf-parser');

const appRoot = process.cwd();

// await readOsm.init();
// await readOsm.loadData();
// await readOsm.parseData();
// await readOsm.getArea();
// or await readOsm.loadArea();
// for(let x = 0; x < readOsm.lonCell; x++){
//     for(let y = 0; y < readOsm.latCell; y++){
//         await readOsm.generate(x, y);
//     }
// }

const config = JSON.parse(fs.readFileSync(path.join(appRoot, '/config.json')).toString());
const roadType = JSON.parse(fs.readFileSync(path.join(appRoot, '/roadType.json')).toString());
const roadData = JSON.parse(fs.readFileSync(config.roadFileSrc).toString());

module.exports = class osmRead {
    constructor(lat, lon, src) {
        this.lat = lat;
        this.lon = lon;
        this.cell = [];
        this.areaCell = [];

        this.nodeList = [];
        this.wayList = [];
        this.edgeList = [];

        //nodeHash, wayHash meaning data of nodeList and wayList
        this.nodeHash = {};
        this.wayHash = {};
        this.edgeHash = {};

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
            for (let lat = 0; lat < Math.floor(this.latCell); lat++) {
                (this.areaCell)[lat] = [];
                for (let lon = 0; lon < Math.floor(this.lonCell); lon++) {
                    (this.areaCell)[lat][lon] = [[], {}];
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
                            this.wayList.push(item.id);
                            this.wayHash[item.id] = item;
                        }
                        if(item.type === 'node'){
                            this.nodeList.push(item.id);
                            this.nodeHash[item.id] = item;
                        }
                    });
                    next();
                })).on('finish', ()=>{
                this.wayList.sort(function(a, b){return a-b});
                this.nodeList.sort(function(a, b){return a-b});
                resolve();
            });
        });
    }
    parseData(){
        return new Promise(async (resolve)=> {
            await this.nodeAdd();
            await this.nodeToCell();
            resolve();
        });
    }
    nodeAdd(){
        //parseData
        let start = new Date();
        for(let way_idx of this.wayList){

            if(this.wayHash[way_idx].tags.name){
                let roadFound = roadBindFind(this.wayHash[way_idx].tags.name, roadData.DATA);
                if(roadFound){
                    this.wayHash[way_idx].roadData = roadFound;
                } else {
                    this.wayHash[way_idx].roadData = null;
                }
            }

            for(let refIndex in this.wayHash[way_idx].refs){

                if(typeof this.wayHash[way_idx].refs[refIndex] !== 'number') continue;

                let nodeObj = this.nodeHash[this.wayHash[way_idx].refs[refIndex]];
                if(nodeObj){

                    //ways 배열이 없으면 생성
                    if(!this.nodeHash[this.wayHash[way_idx].refs[refIndex]].ways) this.nodeHash[this.wayHash[way_idx].refs[refIndex]].ways = [];
                    //ways 배열에 way_idx 추가
                    this.nodeHash[this.wayHash[way_idx].refs[refIndex]].ways.push(this.wayHash[way_idx].id);

                    this.wayHash[way_idx].refs[refIndex] = {
                        id: nodeObj.id,
                        lat: nodeObj.lat,
                        lon: nodeObj.lon
                    }
                } else {
                    console.log('노드 누락됨. -' + obj.refs[refIndex]);
                }
            }
            for(let refIndex in this.wayHash[way_idx].refs){
                if(refIndex != this.wayHash[way_idx].refs.length - 1){
                    this.edgeList.push([
                        this.wayHash[way_idx].refs[refIndex],
                        this.wayHash[way_idx].refs[Number(refIndex)+1]
                    ]);
                }
            }

        }
        console.log(new Date() - start+'ms');
        console.log('하나의 ways당 소요된 시간: ', (new Date() - start)/this.wayList.length, 'ms');
    }
    nodeToCell(){
        //parseData
        return new Promise(resolve => {
            for(let idx of this.nodeList){
                let item = this.nodeHash[idx];
                (this.cell)[Math.floor(convert.toMeter('lat', config.lat[0] - item.lat ) / 300)][Math.floor(convert.toMeter('lon', item.lon - config.lon[0]) / 300)].push(item.id);
            }
            resolve();
        });
    }
    areaToCell(){
        for(let ftrIdx in this.GeoJSONArea.features){
            let item = this.GeoJSONArea.features[ftrIdx];
            for(let coord of item.geometry.coordinates[0]){
                if(this.areaCell
                    [Math.floor(convert.toMeter('lat', config.lat[0] - coord[0] ) / 300)]
                    [Math.floor(convert.toMeter('lon', coord[1] - config.lon[0]) / 300)][1][ftrIdx]) continue;

                this.areaCell
                    [Math.floor(convert.toMeter('lat', config.lat[0] - coord[0] ) / 300)]
                    [Math.floor(convert.toMeter('lon', coord[1] - config.lon[0]) / 300)][1][ftrIdx]
                    = {id:ftrIdx, data:item.geometry.coordinates[0]};
                this.areaCell
                    [Math.floor(convert.toMeter('lat', config.lat[0] - coord[0] ) / 300)]
                    [Math.floor(convert.toMeter('lon', coord[1] - config.lon[0]) / 300)][0].push(ftrIdx);
            }
        }

    }

    showCellData(x, y){
        for(let obj of this.cell[y][x]){
            if(!this.nodeHash[obj].ways) continue;
            for(let way_index of this.nodeHash[obj].ways){
                console.log(this.wayHash[way_index])
            }
        }
    }

    getArea(length){
        return new Promise((resolve) =>
            {
                let data = [];
                let i = 0;
                if(length == undefined) length = this.wayList.length;
                for(let wayObj of this.wayList){
                    if(i == length) break;
                    wayObj = this.wayHash[wayObj];
                    if(
                        wayObj.tags.highway !== 'primary' &&
                        wayObj.tags.highway !== 'secondary' &&
                        wayObj.tags.highway !== 'trunk' &&
                        wayObj.tags.highway !== 'tertiary'
                    ) continue;
                    let obj = {
                        id: wayObj.id,
                        coord: []
                    }

                    for(let refsObj of wayObj.refs){
                        obj.coord.push([
                            refsObj.lat,
                            refsObj.lon
                        ]);
                    }
                    data.push(obj);
                    i++
                }
                this.GeoJSONWays = GeoJSON.parse(data, {'LineString': 'coord'});
                console.log('처리 시작', i+'개의 ways를 처리하는 중...');
                console.log('보통 분 단위의 시간이 소요됩니다. 잠시만 기다려주세요.');
                let time = new Date().getTime();
                this.GeoJSONArea = turf.polygonize(this.GeoJSONWays);
                console.log('처리 완료', new Date().getTime() - time, 'ms', this.GeoJSONArea.features.length+'개 확인됨');
                fs.writeFileSync(path.join(this.src,'/export/area.json'), JSON.stringify(this.GeoJSONArea));
                resolve();
            }
        );
    }
    loadArea(){
        return new Promise((resolve) => {
                this.GeoJSONArea = JSON.parse(fs.readFileSync(path.join(this.src,'/export/area.json')).toString());
                resolve();
            }
        );
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
        let cellWays = [];
        let cellWays_id = [];
        let notFound = [];
        //area will be render
        let cellArea = [];

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
        //for this.areaCell
        for(let i = 0; i <task.length; i++){
            if(!this.areaCell[y + task[i][0]]) continue;
            var cellObj = this.areaCell[y + task[i][0]][x + task[i][1]];
            if(!cellObj) continue;
            for(let obj of cellObj[0]){
                cellArea.push(cellObj[1][obj]);
            }
        }
        //change ctx setting to rendering roads.
        ctx.strokeStyle = '#646464';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 1;
        ctx.antialias = 'none';


        //렌더링
        for(let route of cellArea){
            route = route.data
            ctx.fillStyle = `#${Math.floor(Math.random()*16777215).toString(16)}`;
            ctx.beginPath();
            for(let pointIdx in route){
                if(pointIdx === 0) {
                    ctx.moveTo(Math.floor(convert.toMeter('lon', route[pointIdx][1] - this.lon[0]) - (300*x)), Math.floor(convert.toMeter('lat', this.lat[0]-route[pointIdx][0]) - (300*y)));
                } else {
                    ctx.lineTo(Math.floor(convert.toMeter('lon', route[pointIdx][1] - this.lon[0]) - (300*x)), Math.floor(convert.toMeter('lat', this.lat[0]-route[pointIdx][0]) - (300*y)));
                }
            }
            ctx.closePath();
            ctx.fill();
        }
        for(let route of cellWays){
            if(route.tags.highway == 'footway'||route.tags.highway == 'residential'||route.tags.highway=='service') continue;
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

    /*genResidential(){
        for(let idx of this.nodeList){
            let node = this.nodeHash[idx];
            if(!node.tags || !node.ways) continue;
            for(let wayIdx of node.ways){
                /!**
                 * @todo 이건 어떻게 할까?
                 * 일단 ways 훑으면서 주거지역 area를 extract하는 것으로 하자.
                 *!/
            }
        }
    }*/
    exportData(){
        return new Promise(resolve => {
            if(!fs.existsSync(path.join(this.src,'/export/'))) fs.mkdirSync(path.join(this.src,'/export/'));
            let exportNodeList = this.nodeList;
            let exportNodeHash = this.nodeHash;
            let exportEdgeList = this.edgeList;

            let exportNodeData = {
                nodeList: exportNodeList,
                nodeHash: exportNodeHash
            }
            let exportEdgeData = {
                edgeList: exportEdgeList
            }
            fs.writeFileSync(path.join(this.src,'/export/node.json'), JSON.stringify(exportNodeData));
            fs.writeFileSync(path.join(this.src,'/export/edge.json'), JSON.stringify(exportEdgeData));
            console.log('완료');
            resolve();
        });
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