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

        this.STATE= {
            INIT: false,
            GEN_CELL: false,
            LOAD_DATA: false,
            PARSE_DATA: false,
            PARSE_RELATION: false,
            GET_AREA: false,
            LOAD_AREA: false,
            GENERATE: false,
            DONE: false
        }

        this.lat = lat;
        this.lon = lon;
        this.cell = [];
        this.areaCell = [];
        this.trCell = [];

        this.nodeList = [];
        this.wayList = [];
        this.edgeList = [];

        this.nodeList_TR = [];
        this.wayList_TR = [];
        this.relationList_TR = [];

        //nodeHash, wayHash meaning data of nodeList and wayList
        this.nodeHash = {};
        this.wayHash = {};
        this.relationHash = {};

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
            this.STATE.INIT = true;
            resolve();
        });
    }
    genCell(){
        return new Promise((resolve)=>{
            for (let lat = 0; lat < Math.floor(this.latCell); lat++) {
                (this.cell)[lat] = [];
                (this.areaCell)[lat] = [];
                (this.trCell)[lat] = [];
                for (let lon = 0; lon < Math.floor(this.lonCell); lon++) {
                    (this.cell)[lat][lon] = [];
                    (this.areaCell)[lat][lon] = [[], {}];
                    (this.trCell)[lat][lon] = [];
                }
            }
            this.STATE.GEN_CELL = true;
            resolve();
        });
    }
    loadMapData() {
        return new Promise((resolve) => {
            if(!this.STATE.INIT){
                throw new Error('Please Execute init()');
            }
            console.log('불러오는 중');

            fs.createReadStream(config.fileSrc)
                .pipe(this.osm)
                .pipe(through.obj((items, enc, next)=> {
                    items.forEach((item)=> {
                        switch(item.type){
                            case 'node':
                                this.nodeList.push(item.id);
                                this.nodeHash[item.id] = item;
                                break;
                            case 'way':
                                this.wayList.push(item.id);
                                this.wayHash[item.id] = item;
                                break;
                        }
                    });
                    next();
                })).on('finish', ()=>{
                this.wayList.sort(function(a, b){return a-b});
                this.nodeList.sort(function(a, b){return a-b});
                this.STATE.LOAD_DATA = true;
                this.osm = null;
                resolve();
            });
        });
    }
    loadTRData() {
        return new Promise((resolve) => {
            if(!this.STATE.INIT){
                throw new Error('Please Execute init()');
            }

            this.osm = parseOSM();

            console.log('불러오는 중');
            let i = 0;

            fs.createReadStream('./terrain_01.pbf')
                .pipe(this.osm)
                .pipe(through.obj((items, enc, next)=> {
                    items.forEach((item)=> {
                        switch(item.type){
                            case 'node':
                                this.nodeList_TR.push(item.id);
                                if(this.nodeHash[item.id]){
                                    if(!JSON.stringify(this.nodeHash[item.id]) == JSON.stringify(item)){
                                        this.nodeHash[item.id] = item;
                                    }
                                } else {
                                    this.nodeHash[item.id] = item;
                                }
                                break;
                            case 'way':
                                this.wayList_TR.push(item.id);
                                if(this.wayHash[item.id]){
                                    if(!JSON.stringify(this.wayHash[item.id]) == JSON.stringify(item)){
                                        this.wayHash[item.id] = item;
                                    }
                                } else {
                                    this.wayHash[item.id] = item;
                                }
                                break;
                            case "relation":
                                this.relationList_TR.push(item.id);
                                this.relationHash[item.id] = item;
                                break;
                        }

                    });
                    next();
                })).on('finish', ()=>{
                this.wayList.sort(function(a, b){return a-b});
                this.nodeList.sort(function(a, b){return a-b});
                this.STATE.LOAD_DATA = true;
                resolve();
            });
        });
    }
    parseData(){
        return new Promise(async (resolve)=> {
            if(!this.STATE.LOAD_DATA){
                throw new Error('Please Execute loadData()');
            }
            await this.nodeAdd();
            await this.nodeToCell();
            this.STATE.PARSE_DATA = true;
            resolve();
        });
    }
    nodeAdd(){
        //parseData
        let start = new Date();
        for(let way_idx of this.wayList){

            //ADD roadData
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
            //
            for(let refIndex in this.wayHash[way_idx].refs){
                if(refIndex != this.wayHash[way_idx].refs.length - 1){
                    this.edgeList.push([
                        this.wayHash[way_idx].refs[refIndex],
                        this.wayHash[way_idx].refs[Number(refIndex)+1]
                    ]);
                }
            }

        }
        for(let way_idx of this.wayList_TR){
            for(let refIndex in this.wayHash[way_idx].refs){
                if(typeof this.wayHash[way_idx].refs[refIndex] !== 'number') continue;
                let nodeObj = this.nodeHash[this.wayHash[way_idx].refs[refIndex]];
                if(nodeObj){
                    if(!this.nodeHash[this.wayHash[way_idx].refs[refIndex]].ways_TR) this.nodeHash[this.wayHash[way_idx].refs[refIndex]].ways_TR = [];
                    this.nodeHash[this.wayHash[way_idx].refs[refIndex]].ways_TR.push(this.wayHash[way_idx].id);
                    this.wayHash[way_idx].refs[refIndex] = {
                        id: nodeObj.id,
                        lat: nodeObj.lat,
                        lon: nodeObj.lon
                    }
                } else {
                    console.log('노드 누락됨. -' + obj.refs[refIndex]);
                }
            }
        }
        for(let idx of this.relationList_TR){
            for(let memberIndex in this.relationHash[idx].members){
                if(this.relationHash[idx].members[memberIndex].type == 'way'){
                    if(this.wayHash[this.relationHash[idx].members[memberIndex].id]){
                        if(!this.wayHash[this.relationHash[idx].members[memberIndex].id].relation) this.wayHash[this.relationHash[idx].members[memberIndex].id].relation = [];
                        this.wayHash[this.relationHash[idx].members[memberIndex].id].relation.push(this.relationHash[idx].id);
                    }
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
    parseRelation(){
        return new Promise(async (resolve)=> {
            if(!this.STATE.PARSE_DATA){
                throw new Error('Please Execute parseData()');
            }
            let notFound = 0;
            let found = 0;
            for(let idx of this.relationList_TR){
                let relationList = [];

                let closed_outer = [];
                let left_outer = [];

                let closed_inner = [];
                let left_inner = [];

                let data = [];
                let item = this.relationHash[idx];

                for(let memberItem of item.members){
                    let item_way;
                    switch(memberItem.type){
                        case 'way':
                            item_way = this.wayHash[memberItem.id];
                            break;
                        case 'relation':
                            item_way = this.relationHash[memberItem.id];
                            break;
                    }
                    if(!item_way) {
                        notFound++;
                        continue;
                    }
                    switch(memberItem.role){
                        case '':
                            if(item_way.refs[0].id == item_way.refs[item_way.refs.length - 1].id){
                                closed_outer.push(item_way);
                            } else
                            { left_outer.push(item_way); }
                            break;
                        case 'outer':
                            if(item_way.refs[0].id == item_way.refs[item_way.refs.length - 1].id){
                                closed_outer.push(item_way);
                            } else
                            { left_outer.push(item_way); }
                            break;
                        case 'inner':
                            if(item_way.refs[0].id == item_way.refs[item_way.refs.length - 1].id){
                                closed_inner.push(item_way);
                            } else
                            { left_inner.push(item_way);}
                            break;
                        default:
                            console.log('역할 오류', memberItem);
                            break;
                    }

                    found++;
                }

                if(left_outer.length > 1){
                    for(let wayIdx in left_outer){
                        let arr = [];
                        for(let ref of left_outer[wayIdx].refs){
                            arr.push(ref.id);
                        }
                        left_outer[wayIdx] = [...arr];
                    }
                }
                if(left_inner.length > 1){
                    for(let wayIdx in left_inner){
                        let arr = [];
                        for(let ref of left_inner[wayIdx].refs){
                            arr.push(ref.id);
                        }
                        left_inner[wayIdx] = [...arr];
                    }
                }
                for(let wayIdx in closed_outer){
                    let arr = [];
                    for(let ref of closed_outer[wayIdx].refs){
                        arr.push(ref.id);
                    }
                    closed_outer[wayIdx] = [...arr];
                }
                for(let wayIdx in closed_inner){
                    let arr = [];
                    for(let ref of closed_inner[wayIdx].refs){
                        arr.push(ref.id);
                    }
                    closed_inner[wayIdx] = [...arr];
                }

                for(let i = 0; i < left_outer.length; i++){
                    // console.log(left_outer.length);
                    for(let j = 0; j < left_outer.length; j++){
                        if(j == i) continue;
                        if(i >= left_outer.length) break;
                        // console.log(i, j, left_outer.length);
                        if(left_outer[i][0] == left_outer[j][left_outer[j].length - 1]){
                            // console.log('a');
                            left_outer[j].pop()
                            left_outer[i].unshift(...left_outer[j]);
                            left_outer.splice(j, 1);
                            j--;
                        }
                        else if(left_outer[i][left_outer[i].length - 1] == left_outer[j][0]){
                            // console.log('b');
                            left_outer[j].shift();
                            left_outer[i].push(...left_outer[j]);
                            left_outer.splice(j, 1);
                            j--;
                        }
                        else if(left_outer[i][0] == left_outer[j][0]){
                            // console.log('c');
                            left_outer[j].shift();
                            left_outer[i].unshift(...left_outer[j].reverse());
                            left_outer.splice(j, 1);
                            j--;
                        }
                        else if(left_outer[i][left_outer[i].length - 1] == left_outer[j][left_outer[j].length - 1]){
                            // console.log('d');
                            left_outer[j].pop();
                            left_outer[i].push(...left_outer[j].reverse());
                            left_outer.splice(j, 1);
                            j--;
                        }
                    }
                }
                console.log(left_outer.length);
            }
            console.log('notFound: ', notFound);
            console.log('found: ', found);
            this.STATE.PARSE_RELATION = true;
            resolve();
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
    getArea(length){
        return new Promise((resolve) =>
            {
                if(!this.STATE.GEN_CELL){
                    throw new Error('Please Execute genCell()');
                }
                let data = [];
                let i = 0;
                if(length == undefined) length = this.wayList.length;
                for(let wayObj of this.wayList){
                    if(i == length) break;
                    wayObj = this.wayHash[wayObj];
                    if(!wayObj) console.log(wayObj);
                    if(
                        wayObj.tags.highway !== 'primary' &&
                        wayObj.tags.highway !== 'secondary' &&
                        wayObj.tags.highway !== 'trunk' &&

                        wayObj.tags.highway !== 'tertiary'&&
                        wayObj.tags.highway !== 'primary_link'&&
                        wayObj.tags.highway !== 'secondary_link'&&
                        wayObj.tags.highway !== 'trunk_link'
                    ) continue;
                    const bridgeList = [
                        '가양대로',
                        '월드컵대교',
                        '성산대교',
                        '양화로',
                        '국회대로',
                        '경인로',
                        '여의대로',
                        '여의대방로',
                        '한강대로',
                        '양녕로',
                        '동작대교',
                        '잠수교',
                        '반포대교',
                        '한남대로',
                        '논현로',
                        '성수대교',
                        '동일로',
                        '청담대교',
                        '잠실대교',
                        '잠실대로',
                        '잠실철교',
                        '올림픽대교',
                        '천호대로',
                        '구천면로',
                        '양재대로'
                    ]
                    if(wayObj.tags.bridge == 'yes') {
                        if (bridgeList.includes(wayObj.tags.name)) continue;
                    }
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
                this.STATE.GET_AREA = true;
                resolve();
            }
        );
    }
    loadArea(){
        return new Promise((resolve) => {
            if(!this.STATE.GEN_CELL){
                throw new Error('Please Execute genCell()');
            }
            this.GeoJSONArea = JSON.parse(fs.readFileSync(path.join(this.src,'/export/area.json')).toString());
            this.STATE.LOAD_AREA = true;
            resolve();
        }
        );
    }
    areaToCell(){
        if(!this.STATE.GET_AREA && !this.STATE.LOAD_AREA){
            throw new Error('Please Execute genCell()');
        }
        for(let ftrIdx in this.GeoJSONArea.features){
            this.GeoJSONArea.features[ftrIdx].properties.color = `#${Math.floor(Math.random()*16777215).toString(16)}`;
            let item = this.GeoJSONArea.features[ftrIdx];
            for(let coord of item.geometry.coordinates[0]){
                if(this.areaCell
                    [Math.floor(convert.toMeter('lat', config.lat[0] - coord[0] ) / 300)]
                    [Math.floor(convert.toMeter('lon', coord[1] - config.lon[0]) / 300)][1][ftrIdx]) continue;

                this.areaCell
                    [Math.floor(convert.toMeter('lat', config.lat[0] - coord[0] ) / 300)]
                    [Math.floor(convert.toMeter('lon', coord[1] - config.lon[0]) / 300)][1][ftrIdx]
                    = {id:ftrIdx, color:item.properties.color,data:item.geometry.coordinates[0]};
                this.areaCell
                    [Math.floor(convert.toMeter('lat', config.lat[0] - coord[0] ) / 300)]
                    [Math.floor(convert.toMeter('lon', coord[1] - config.lon[0]) / 300)][0].push(ftrIdx);
            }
        }
        //셀 셀안에 있는 그그ㅡ area 모으고
        //그다음이 도로 확인
        /*for (let lat = 0; lat < Math.floor(this.latCell); lat++) {
            for (let lon = 0; lon < Math.floor(this.lonCell); lon++) {
            }
        }*/
    }
    generate(x, y){
        if(!this.STATE.LOAD_AREA&&!this.STATE.PARSE_DATA){
            return('Please Execute previous function');
        }
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
        let cellWays_TR = []
        let cellWays_id = [];
        let cellWays_id_TR = [];
        let cellRelation = [];
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
                if(obj.ways){
                    for(let obj_1 of obj.ways){
                        const found = this.wayHash[obj_1];
                        if(found){
                            if(!cellWays_id.find(e => (e == found.id))){
                                cellWays_TR.push(found);
                                cellWays_id_TR.push(found.id);
                            }
                        } else {
                            console.log('node 확인되지 않음');
                            notFound.push(obj_1);
                        }
                    }
                }
                if(obj.ways_TR){
                    for(let obj_1 of obj.ways_TR){
                        const found = this.wayHash[obj_1];
                        console.log(found);
                        if(found){
                            if(found.relation){
                                for(let rlIdx of found.relation){
                                    cellRelation.push(this.relationHash[rlIdx]);
                                }
                            }
                            if(!cellWays_id_TR.find(e => (e == found.id))){
                                cellWays_TR.push(found);
                                cellWays_id_TR.push(found.id);
                            }
                        } else {
                            console.log('node 확인되지 않음');
                            notFound.push(obj_1);
                        }
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
            ctx.fillStyle = route.color
            route = route.data
            ctx.fillStyle = route.color;
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
            if(route.tags.highway == 'footway') continue;
            if(
                route.tags.highway !== 'primary' &&
                route.tags.highway !== 'secondary' &&
                route.tags.highway !== 'trunk' &&

                route.tags.highway !== 'tertiary' &&
                route.tags.highway !== 'primary_link' &&
                route.tags.highway !== 'secondary_link' &&
                route.tags.highway !== 'trunk_link' &&
                route.tags.bridge !== 'yes'
            ) continue;
            //||route.tags.highway == 'residential'||route.tags.highway=='service'
            ctx.beginPath();
            for(let pointIdx in route.refs){
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#646464';
                /*switch(route.tags.highway){
                    //set rainbow color by highway type
                    case 'primary':
                        ctx.strokeStyle = '#ff0000';
                        break;
                    case 'secondary':
                        ctx.strokeStyle = '#ff8000';
                        break;
                    case 'trunk':
                        ctx.strokeStyle = '#40ff00';
                        break;
                    case 'tertiary':
                        ctx.strokeStyle = '#00ffea';
                        break;
                    case 'primary_link':
                        ctx.strokeStyle = '#0077ff';
                        break;
                    case 'trunk_link':
                        ctx.strokeStyle = '#dd00ff';
                        break;
                }*/
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

                    // console.clear();

                    console.log(`[${x},${y}] rendered in ${(new Date() - start)}ms average: ${Math.floor(this.average*10)/10}ms`);
                    resolve();
                }));
            }));
        });
    }
    /*genResidential(){
        for(let idx of this.nodeList){
            let node = this.nodeHash[idx];
            if(!node.tags || !node.ways) continue;
            for(let wayIdx of node.ways){
                /!**
                 * @todo 이건 어떻게 할까? + 내부에 residential 경로가 얼마나 있는지를 바탕으로 generation을 구성한다
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