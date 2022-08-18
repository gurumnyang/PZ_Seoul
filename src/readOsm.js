const fs = require('fs'),
    through = require('through2'),
    path = require('path'),
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
            LOAD_RL_DATA: false,
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
                    (this.areaCell)[lat][lon] = [];
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

            fs.createReadStream(config.terrainFileSrc)
                .pipe(this.osm)
                .pipe(through.obj((items, enc, next)=> {
                    items.forEach((item)=> {
                        switch(item.type){
                            case 'node':
                                this.nodeList_TR.push(item.id);
                                if(this.nodeHash[item.id]){
                                    if(JSON.stringify(this.nodeHash[item.id]) !== JSON.stringify(item)){
                                        this.nodeHash[item.id] = item;
                                    }
                                } else {
                                    this.nodeHash[item.id] = item;
                                }
                                break;
                            case 'way':
                                this.wayList_TR.push(item.id);
                                if(this.wayHash[item.id]){
                                    if(JSON.stringify(this.wayHash[item.id]) !== JSON.stringify(item)){
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
                this.STATE.LOAD_RL_DATA = true;
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
                if(refIndex !== this.wayHash[way_idx].refs.length - 1){
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
                    //ways 배열이 없으면 생성
                    if(!this.nodeHash[this.wayHash[way_idx].refs[refIndex]].ways_TR) this.nodeHash[this.wayHash[way_idx].refs[refIndex]].ways_TR = [];
                    //ways 배열에 way_idx 추가
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
                if(Math.floor(convert.toMeter('lat', config.lat[0] - item.lat ) / 300) < 0 || Math.floor(convert.toMeter('lon', item.lon - config.lon[0]) / 300) < 0) continue;
                if(Math.floor(convert.toMeter('lat', config.lat[0] - item.lat ) / 300) >= this.cell.length || Math.floor(convert.toMeter('lon', item.lon - config.lon[0]) / 300) >= this.cell[0].length) continue;
                (this.cell)[Math.floor(convert.toMeter('lat', config.lat[0] - item.lat ) / 300)][Math.floor(convert.toMeter('lon', item.lon - config.lon[0]) / 300)].push(item.id);

            }
            for(let idx of this.nodeList_TR){
                let item = this.nodeHash[idx];
                if(Math.floor(convert.toMeter('lat', config.lat[0] - item.lat ) / 300) < 0 || Math.floor(convert.toMeter('lon', item.lon - config.lon[0]) / 300) < 0) continue;
                if(Math.floor(convert.toMeter('lat', config.lat[0] - item.lat ) / 300) >= this.cell.length || Math.floor(convert.toMeter('lon', item.lon - config.lon[0]) / 300) >= this.cell[0].length) continue;
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
            if(!this.STATE.LOAD_RL_DATA){
                throw new Error('Please Execute loadData()');
            }
            await this.rlAdd();
            await this.rlToCell();
            this.STATE.PARSE_DATA = true;
            resolve();
        });
    }
    rlAdd(){
        return new Promise(async (resolve)=> {
            if(!this.STATE.LOAD_RL_DATA){
                throw new Error('Please Execute loadData()');
            }
            console.log('');
            let notFound = 0;
            let found = 0;
            for(let idx of this.relationList_TR){
                let relationList = {
                    outer:[],
                    inner:[]
                };

                let closed_outer = [];
                let left_outer = [];

                let closed_inner = [];
                let left_inner = [];
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
                            if(item_way.refs[0].id === item_way.refs[item_way.refs.length - 1].id){
                                closed_outer.push(item_way);
                            } else
                            { left_outer.push(item_way); }
                            break;
                        case 'outer':
                            if(item_way.refs[0].id === item_way.refs[item_way.refs.length - 1].id){
                                closed_outer.push(item_way);
                            } else
                            { left_outer.push(item_way); }
                            break;
                        case 'inner':
                            if(item_way.refs[0].id === item_way.refs[item_way.refs.length - 1].id){
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

                if(left_outer.length > 0){
                    for(let wayIdx in left_outer){
                        let arr = [];
                        for(let ref of left_outer[wayIdx].refs){
                            arr.push(ref.id);
                        }
                        left_outer[wayIdx] = [...arr];
                    }
                }
                if(left_inner.length > 0){
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

                // console.log('\n');
                // console.log(closed_outer.length, closed_inner.length, left_outer.length, left_inner.length);
                for(let i = 0; i < left_outer.length; i++){
                    // console.log(left_outer.length);
                    for(let j = 0; j < left_outer.length; j++){
                        if(j === i) continue;
                        if(i >= left_outer.length) break;
                        // console.log(i, j, left_outer.length);
                        if(left_outer[i][0] === left_outer[j][left_outer[j].length - 1]){
                            // console.log('a');
                            left_outer[j].pop()
                            left_outer[i].unshift(...left_outer[j]);
                            left_outer.splice(j, 1);
                            i--;
                            i = 0;
                        }
                        else if(left_outer[i][left_outer[i].length - 1] === left_outer[j][0]){
                            // console.log('b');
                            left_outer[j].shift();
                            left_outer[i].push(...left_outer[j]);
                            left_outer.splice(j, 1);
                            i--;
                            i = 0;
                        }
                        else if(left_outer[i][0] === left_outer[j][0]){
                            // console.log('c');
                            left_outer[j].shift();
                            left_outer[i].unshift(...left_outer[j].reverse());
                            left_outer.splice(j, 1);
                            i--;
                            i = 0;
                        }
                        else if(left_outer[i][left_outer[i].length - 1] === left_outer[j][left_outer[j].length - 1]){
                            // console.log('d');
                            left_outer[j].pop();
                            left_outer[i].push(...left_outer[j].reverse());
                            left_outer.splice(j, 1);
                            i--;
                            i = 0;
                        }
                    }
                }
                for(let i = 0; i < left_inner.length; i++){
                    // console.log(left_inner.length);
                    for(let j = 0; j < left_inner.length; j++){
                        if(j === i) continue;
                        if(i >= left_inner.length) break;
                        // console.log(i, j, left_inner.length);
                        if(left_inner[i][0] === left_inner[j][left_inner[j].length - 1]){
                            // console.log('a');
                            left_inner[j].pop()
                            left_inner[i].unshift(...left_inner[j]);
                            left_inner.splice(j, 1);
                            j--;
                            i = 0;
                        }
                        else if(left_inner[i][left_inner[i].length - 1] === left_inner[j][0]){
                            // console.log('b');
                            left_inner[j].shift();
                            left_inner[i].push(...left_inner[j]);
                            left_inner.splice(j, 1);
                            j--;
                            i = 0;
                        }
                        else if(left_inner[i][0] === left_inner[j][0]){
                            // console.log('c');
                            left_inner[j].shift();
                            left_inner[i].unshift(...left_inner[j].reverse());
                            left_inner.splice(j, 1);
                            j--;
                            i = 0;
                        }
                        else if(left_inner[i][left_inner[i].length - 1] === left_inner[j][left_inner[j].length - 1]){
                            // console.log('d');
                            left_inner[j].pop();
                            left_inner[i].push(...left_inner[j].reverse());
                            left_inner.splice(j, 1);
                            j--;
                            i = 0;
                        }
                    }
                }

                for(let i = 0; i < left_outer.length; i++){
                    if(left_outer[0][0] === left_outer[0][left_outer[0].length - 1]){
                        closed_outer.push(left_outer[i]);
                        left_outer.splice(i, 1);
                        i--
                    }
                }
                for(let i = 0; i < left_inner.length; i++){
                    if(left_inner[0][0] === left_inner[0][left_inner[0].length - 1]){
                        closed_inner.push(left_inner[i]);
                        left_inner.splice(i, 1);
                        i--
                    }
                }
                if(left_outer.length > 0){
                    for(let wayIdx in left_outer){
                        console.log('닫히지 않은 지형 영역:outer');
                        console.log(`relation:${item.id} Node1:${left_outer[wayIdx][0]} Node2:${left_outer[wayIdx][left_outer[0].length - 1]}`)
                        left_outer[wayIdx].push(left_outer[wayIdx][0]);
                        closed_outer.push(left_outer[wayIdx]);
                        left_outer.splice(wayIdx, 1);
                    }
                }
                if(left_inner.length > 0){
                    for(let wayIdx in left_inner){
                        console.log('닫히지 않은 지형 영역:inner');
                        console.log(`relation:${item.id} Node1:${left_inner[wayIdx][0]} Node2:${left_inner[wayIdx][left_inner[0].length - 1]}`)
                        left_inner[wayIdx].push(left_inner[wayIdx][0]);
                        closed_outer.push(left_inner[wayIdx]);
                        left_inner.splice(wayIdx, 1);
                    }
                }

                for(let idx in closed_outer){
                    for(let nodeIdx in closed_outer[idx]){
                        let nodeObj = this.nodeHash[closed_outer[idx][nodeIdx]];
                        if(!nodeObj){
                            console.log('ERROR: node not found. nodeId:', closed_outer[idx][nodeIdx]);
                            console.log(closed_outer[idx]);
                            continue;
                        }
                        closed_outer[idx][nodeIdx] = {
                            id: nodeObj.id,
                            lat: nodeObj.lat,
                            lon: nodeObj.lon
                        }
                    }
                }
                for(let idx in closed_inner){
                    for(let nodeIdx in closed_inner[idx]){
                        let nodeObj = this.nodeHash[closed_inner[idx][nodeIdx]];
                        if(!nodeObj){
                            console.log('ERROR: node not found. nodeId:', closed_inner[idx][nodeIdx]);
                            continue;
                        }
                        closed_inner[idx][nodeIdx] = {
                            id: nodeObj.id,
                            lat: nodeObj.lat,
                            lon: nodeObj.lon
                        }
                    }
                }


                relationList.outer.push(...closed_outer);
                relationList.inner.push(...closed_inner);

                this.relationHash[idx].data = {
                    outer: relationList.outer,
                    inner: relationList.inner
                }
                // console.log(closed_outer.length, closed_inner.length, left_outer.length, left_inner.length);
            }
            this.STATE.PARSE_RELATION = true;
            resolve();
        });
    }
    rlToCell(){
        return new Promise((resolve) => {
            if(!this.STATE.PARSE_RELATION){
                throw new Error('parse relation first');
            }
            for(let rlIdx of this.relationList_TR){
                let rlObj = this.relationHash[rlIdx];
                if(!rlObj.data){
                    console.log('ERROR: relation data not found. relationId:', rlObj.id);
                    continue;
                }
                for(let outer of rlObj.data.outer){
                    for(let nodeObj of outer){
                        let cellCoord = [
                            Math.floor(convert.toMeter('lat', config.lat[0] - nodeObj.lat ) / 300),
                            Math.floor(convert.toMeter('lon', nodeObj.lon - config.lon[0]) / 300)
                        ]
                        if(!this.trCell[cellCoord[0]] || !this.trCell[cellCoord[0]][cellCoord[1]]) continue;
                        if(!this.trCell[cellCoord[0]][cellCoord[1]].includes(rlIdx))
                        {
                            this.trCell[cellCoord[0]][cellCoord[1]].push(rlIdx);
                        }
                    }
                    this.objToCell(rlIdx, outer, "trCell");
                }
                for(let inner of rlObj.data.inner){
                    for(let nodeObj of inner){
                        let cellCoord = [
                            Math.floor(convert.toMeter('lat', config.lat[0] - nodeObj.lat ) / 300),
                            Math.floor(convert.toMeter('lon', nodeObj.lon - config.lon[0]) / 300)
                        ]
                        if(!this.trCell[cellCoord[0]] || !this.trCell[cellCoord[0]][cellCoord[1]]) continue;
                        if(!this.trCell[cellCoord[0]][cellCoord[1]].includes(rlIdx))
                        {
                            this.trCell[cellCoord[0]][cellCoord[1]].push(rlIdx);
                        }
                    }
                    this.objToCell(rlIdx, inner, "trCell");
                }
            }
            resolve();
        });
    }
    objToCell(srcId, srcRefs, dstVarName){
        if(!srcRefs){
            throw new Error('srcRefs has no refs');
        }
        if(srcRefs.length < 3){
            throw new Error('srcRefs node is less then 3');
        }
        if(JSON.stringify(srcRefs[0]) !== JSON.stringify(srcRefs[srcRefs.length - 1])){
            throw new Error('srcRefs refs is not closed');
        }
        if(srcRefs.length === 3){
            return;
        }
        let poly = (!!srcRefs[0].id) ? turf.polygon([srcRefs.map(node => [node.lat, node.lon])]) : turf.polygon([srcRefs]);

        let cellList = [];

        //node에 따른 cell list 추가(초기 태스크가 됨)
        for(let nodeObj of srcRefs){
            let cellCoord =
                (!!srcRefs[0].id) ? [
                Math.floor(convert.toMeter('lat', config.lat[0] - nodeObj.lat ) / 300),
                Math.floor(convert.toMeter('lon', nodeObj.lon - config.lon[0]) / 300)
            ] : [
                    Math.floor(convert.toMeter('lat', config.lat[0] - nodeObj[0] ) / 300),
                    Math.floor(convert.toMeter('lon', nodeObj[1] - config.lon[0]) / 300)
                ]
            cellList.push([cellCoord[0], cellCoord[1]]);
        }

        for(let taskCell of cellList){
            let taskList = [
                [taskCell[0]+1, taskCell[1]+0],
                [taskCell[0]+0, taskCell[1]+1],
                [taskCell[0]-0, taskCell[1]+0],
                [taskCell[0]+0, taskCell[1]-0]
            ];
            for(let cell of taskList){
                if(!this[dstVarName][cell[0]] || !this[dstVarName][cell[0]][cell[1]]) continue;
                if(cellList.includes(cell)) continue;

                //셀 가운데 지점을 실제 좌표로 변환
                let realCoord = [
                    config.lat[0] - (convert.toAngle('lat', cell[0] ) * 300),
                    (convert.toAngle('lon', cell[1]) * 300)  + config.lon[0]
                ]
                //변환된 가운데 지점을 turf 포인트로 바꿈.
                let point = turf.point(realCoord);
                //만약 가운데 지점이 영역에 포함되어 있지 않다면, 셀을 제외한다.
                if(!turf.booleanPointInPolygon(point, poly)) continue;
                //만약 해당 셀이 존재하지 않는다면, 셀을 제외한다.
                if(!this[dstVarName][cell[0]] || !this[dstVarName][cell[0]][cell[1]]) continue;
                //만약 해당 셀에 아이디가 추가되어 있지 않는다면 추가한다.
                if(!this[dstVarName][cell[0]][cell[1]].includes(srcId))
                {
                    this[dstVarName][cell[0]][cell[1]].push(srcId);

                    //인접셀을 태스크에 올린다.
                    for(let n of [[cell[0]+1, cell[1]], [cell[0], cell[1]+1], [cell[0]-1, cell[1]], [cell[0], cell[1]-1]]) {
                        if(
                            this[dstVarName][n[0]]?.[n[1]] &&
                            !this[dstVarName][n[0]][n[1]].includes(srcId) &&
                            !taskList.includes([n[0], n[1]]) &&
                            !cellList.includes([n[0], n[1]])
                        )
                        {
                            taskList.push([n[0], n[1]]);
                        }
                    }
                }
            }
        }

        //return cellData array;
    }


    showCellData(x, y){
        for(let obj of this.cell[y][x]){
            if(!this.nodeHash[obj].ways) continue;

            for(let way_index of this.nodeHash[obj].ways)
            {
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
                    if(i === length) break;
                    wayObj = this.wayHash[wayObj];
                    if(!wayObj) console.log(wayObj);
                    if(
                        wayObj.tags.highway !== 'primary' &&
                        wayObj.tags.highway !== 'secondary' &&
                        wayObj.tags.highway !== 'trunk'
                    ) continue;
                    // wayObj.tags.highway !== 'tertiary'&&
                    // wayObj.tags.highway !== 'primary_link'&&
                    // wayObj.tags.highway !== 'secondary_link'&&
                    // wayObj.tags.highway !== 'trunk_link'
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
                    if(wayObj.tags.bridge === 'yes') {
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
                let cellCoord = [
                    Math.floor(convert.toMeter('lat', config.lat[0] - coord[0] ) / 300),
                    Math.floor(convert.toMeter('lon', coord[1] - config.lon[0]) / 300)
                ];
                if(!this.areaCell[cellCoord[0]] || !this.areaCell[cellCoord[0]][cellCoord[1]]) continue;
                this.areaCell[cellCoord[0]][cellCoord[1]].push(ftrIdx);
            }
            this.objToCell(ftrIdx, item.geometry.coordinates[0], "areaCell");
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

        /*
        레이어 구분
        -------------------
        merge: result
        layer0 editLayer
        layer1 floor
        layer2 TR_water
        layer3 TR_groundTR
        layer4 roadArea
        layer5 road
        ------
         */
        let start = new Date();
        let merge = canvas.createCanvas(300,300);
        let ctxM = merge.getContext('2d');
        let layer0 = canvas.createCanvas(300,300);
        let ctx0 = layer0.getContext('2d');
        let layer1 = canvas.createCanvas(300,300);
        let ctx1 = layer1.getContext('2d');
        let layer2 = canvas.createCanvas(300,300);
        let ctx2 = layer2.getContext('2d');
        let layer3 = canvas.createCanvas(300,300);
        let ctx3 = layer3.getContext('2d');
        let layer4 = canvas.createCanvas(300,300);
        let ctx4 = layer4.getContext('2d');
        let layer5 = canvas.createCanvas(300,300);
        let ctx5 = layer5.getContext('2d');


        ctxM.antialias = 'none';
        ctx0.antialias = 'none';
        ctx1.antialias = 'none';
        ctx2.antialias = 'none';
        ctx3.antialias = 'none';
        ctx4.antialias = 'none';
        ctx5.antialias = 'none';
        ctx5.lineCap = 'round';


        let coord = {
            x: this.lon[0] + convert.toAngle('lon', x*300),
            y: this.lat[0] - convert.toAngle('lat', y*300)
        }
        ctx1.fillStyle = "#787878"
        ctx1.fillRect(0,0,300,300);
        ctx1.lineWidth = 2;

        //ways will be render.
        let cellWays = [];
        let cellWays_id = [];
        let cellRelation_id = [];
        let cellTRWays_id = [];
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

        //road 처리 + 일부 TR 처리 포함
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
                                cellWays.push(found);
                                cellWays_id.push(found.id);
                            }
                        } else {
                            console.log('node 확인되지 않음');
                            notFound.push(obj_1);
                        }
                    }
                }
                if(obj.ways_TR){
                    for(let wayIdx of obj.ways_TR){
                        let wayObj = this.wayHash[obj.ways_TR[0]];
                        if(wayObj){
                            if(!wayObj.relation){
                                //it meaning it is terrain but not relation. so it is terrain way.
                                cellTRWays_id.push(wayObj.id);
                            }
                        }
                    }

                }
            }
        }

        //relation 처리
        for(let i = 0; i <task.length; i++){
            if(!this.trCell[y + task[i][0]]) continue;
            const cellObj = this.trCell[y + task[i][0]][x + task[i][1]];
            if(!cellObj) continue;
            for(let obj_id of cellObj){
                if(cellRelation_id.includes(obj_id)) continue;
                cellRelation_id.push(obj_id);
            }
        }
        //for this.areaCell
        for(let i = 0; i <task.length; i++){
            if(!this.areaCell[y + task[i][0]]) continue;
            const cellObj = this.areaCell[y + task[i][0]][x + task[i][1]];
            if(!cellObj) continue;
            for(let obj_id of cellObj){
                if(cellArea.includes(obj_id)) continue;
                cellArea.push(obj_id);
            }
        }

        //------------------------------RENDER-------------------------------------

        //change ctx setting to rendering roads.
        ctx1.strokeStyle = '#646464';
        ctx1.lineWidth = 2;
        ctx1.globalAlpha = 1;
        ctx1.antialias = 'none';


        //렌더링
        //area layer 4
        for(let route_id of cellArea){
            let route = this.GeoJSONArea.features[route_id];
            ctx4.fillStyle = route.properties.color
            ctx4.beginPath();
            for(let pointIdx in route.geometry.coordinates[0]){
                if(pointIdx === 0) {
                    ctx4.moveTo(Math.floor(convert.toMeter('lon', route.geometry.coordinates[0][pointIdx][1] - this.lon[0]) - (300*x)), Math.floor(convert.toMeter('lat', this.lat[0]-route.geometry.coordinates[0][pointIdx][0]) - (300*y)));
                } else {
                    ctx4.lineTo(Math.floor(convert.toMeter('lon', route.geometry.coordinates[0][pointIdx][1] - this.lon[0]) - (300*x)), Math.floor(convert.toMeter('lat', this.lat[0]-route.geometry.coordinates[0][pointIdx][0]) - (300*y)));
                }
            }
            ctx4.closePath();
            ctx4.fill();
        }

        //terrain layer 0,1,2,3
        for(let rlID of cellRelation_id){
            let rl = this.relationHash[rlID];
            ctx0.lineWidth = 2;
            switch(rl.tags.natural){
                case 'water':
                    ctx0.strokeStyle = '#008aff';
                    ctx0.fillStyle = '#008aff';
                    break;
                case 'wood':
                    ctx0.strokeStyle = '#75752f';
                    ctx0.fillStyle = '#75752f';
                    break;
                default:
                    console.log(rl.tags.natural);
                    ctx0.strokeStyle = '#d2c8a0';
                    ctx0.fillStyle = '#d2c8a0';
                    break;
            }
            for(let outer of rl.data.outer){
                ctx0.globalCompositeOperation = 'source-over';
                ctx0.beginPath();
                for(let routeIdx in outer){
                    if(routeIdx === 0) {
                        ctx0.moveTo(Math.floor(convert.toMeter('lon', outer[routeIdx].lon - this.lon[0]) - (300*x)), Math.floor(convert.toMeter('lat', this.lat[0]-outer[routeIdx].lat) - (300*y)));
                    } else {
                        ctx0.lineTo(Math.floor(convert.toMeter('lon', outer[routeIdx].lon - this.lon[0]) - (300*x)), Math.floor(convert.toMeter('lat', this.lat[0]-outer[routeIdx].lat) - (300*y)));
                    }
                }
                ctx0.closePath();
                ctx0.stroke();
                ctx0.fill();
            }
            for(let inner of rl.data.inner){
                ctx0.globalCompositeOperation = 'destination-out';
                ctx0.beginPath();
                for(let routeIdx in inner){
                    if(routeIdx === 0) {
                        ctx0.moveTo(Math.floor(convert.toMeter('lon', inner[routeIdx].lon - this.lon[0]) - (300*x)), Math.floor(convert.toMeter('lat', this.lat[0]-inner[routeIdx].lat) - (300*y)));
                    } else {
                        ctx0.lineTo(Math.floor(convert.toMeter('lon', inner[routeIdx].lon - this.lon[0]) - (300*x)), Math.floor(convert.toMeter('lat', this.lat[0]-inner[routeIdx].lat) - (300*y)));
                    }
                }
                ctx0.closePath();
                ctx0.stroke();
                ctx0.fill();
            }

            switch(rl.tags.natural){
                case 'water':
                    ctx2.drawImage(layer0, 0, 0);
                    break;
                case 'wood':
                    ctx3.drawImage(layer0, 0, 0);
                    break;
                default:
                    ctx3.drawImage(layer0, 0, 0);
                    break;
            }
            ctx0.clearRect(0, 0, layer0.width, layer0.height);
        }

        //terrain layer 0,1,2,3 - but not a relation
        for(let wayID of cellTRWays_id){
            let way = this.wayHash[wayID];
            ctx0.lineWidth = 2;

            switch(way.tags.natural){
                case 'water':
                    ctx0.strokeStyle = '#008aff';
                    ctx0.fillStyle = '#008aff';
                    break;
                case 'wood':
                    ctx0.strokeStyle = '#75752f';
                    ctx0.fillStyle = '#75752f';
                    break;
                default:
                    ctx0.strokeStyle = '#d2c8a0';
                    ctx0.fillStyle = '#d2c8a0';
                    break;
            }

            ctx0.beginPath();
            for(let pointIdx in way.data){
                if(pointIdx === 0) {
                    ctx0.moveTo(Math.floor(convert.toMeter('lon', way.data[pointIdx].lon - this.lon[0]) - (300*x)), Math.floor(convert.toMeter('lat', this.lat[0]-way.data[pointIdx].lat) - (300*y)));
                } else {
                    ctx0.lineTo(Math.floor(convert.toMeter('lon', way.data[pointIdx].lon - this.lon[0]) - (300*x)), Math.floor(convert.toMeter('lat', this.lat[0]-way.data[pointIdx].lat) - (300*y)));
                }
            }
            ctx0.closePath();
            ctx0.fill();

            switch(way.tags.natural){
                case 'water':
                    ctx2.drawImage(layer0, 0, 0);
                    break;
                case 'wood':
                    ctx3.drawImage(layer0, 0, 0);
                    break;
                default:
                    ctx3.drawImage(layer0, 0, 0);
                    break;
            }
            ctx0.clearRect(0, 0, layer0.width, layer0.height);
        }

        //road layer 5
        for(let route of cellWays){
            if(route.tags.highway === 'footway') continue;
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
            ctx5.beginPath();
            for(let pointIdx in route.refs){
                ctx5.lineWidth = 4;
                ctx5.strokeStyle = '#646464';
                /*switch(route.tags.highway){
                    //set rainbow color by highway type
                    case 'primary':
                        ctx1.strokeStyle = '#ff0000';
                        break;
                    case 'secondary':
                        ctx1.strokeStyle = '#ff8000';
                        break;
                    case 'trunk':
                        ctx1.strokeStyle = '#40ff00';
                        break;
                    case 'tertiary':
                        ctx1.strokeStyle = '#00ffea';
                        break;
                    case 'primary_link':
                        ctx1.strokeStyle = '#0077ff';
                        break;
                    case 'trunk_link':
                        ctx1.strokeStyle = '#dd00ff';
                        break;
                }*/
                if(route.roadData){
                    if(!!roadType[route.roadData["siz_cde_nm2"]]){
                        ctx5.lineWidth = roadType[route.roadData["siz_cde_nm2"]];
                    } else {
                        console.log('roadType failed to load', route.roadData["siz_cde_nm2"]);
                    }
                    // ctx.lineWidth = 뭐시기
                } else {
                    // ctx.strokeStyle = '#c86464';
                }
                if(pointIdx === 0) {
                    ctx5.moveTo(Math.floor(convert.toMeter('lon', route.refs[pointIdx].lon - this.lon[0]) - (300*x)), Math.floor(convert.toMeter('lat', this.lat[0]-route.refs[pointIdx].lat) - (300*y)));
                }
                else {
                    ctx5.lineTo(Math.floor(convert.toMeter('lon', route.refs[pointIdx].lon - this.lon[0]) - (300*x)), Math.floor(convert.toMeter('lat', this.lat[0]-route.refs[pointIdx].lat) - (300*y)));
                }
            };
            ctx5.stroke();
        }
        // ctx.fillStyle = 'white';
        // ctx.fillText(coord.x, 0,10);
        // ctx.fillText(coord.y, 0, 20);

        //merge layer 1
        ctxM.drawImage(layer1, 0, 0);
        ctxM.drawImage(layer4, 0, 0);
        ctxM.drawImage(layer2, 0, 0);
        ctxM.drawImage(layer3, 0, 0)
        ctxM.drawImage(layer5, 0, 0);

        if(!fs.existsSync(path.join(this.src,'/rendered/'))) fs.mkdirSync(path.join(this.src,'/rendered/'));
        return new Promise(resolve => {
            merge.createPNGStream().pipe(fs.createWriteStream(path.join(this.src,'/rendered/'+x+'_'+y+'.png'))
                .on('finish', ()=>{

                console.log('');
                // console.log(coord);
                // console.log('/rendered/'+x+'_'+y+'.png saved');

                //rendering veg image
                layer1 = canvas.createCanvas(300,300);
                ctx1 = layer1.getContext('2d');
                ctx1.antialias = 'none';

                ctx1.fillStyle = 'black';
                ctx1.fillRect(0,0,300,300);

                layer1.createPNGStream().pipe(fs.createWriteStream(path.join(this.src,'/rendered/'+x+'_'+y+'_veg.png'))
                    .on('finish',()=>{
                    if(notFound.length> 0) console.log(notFound.length, '개의 Node를 찾을 수 없음.');
                    if(!this.average) this.average = (new Date() - start);
                    else this.average = ((this.average*49) + (new Date() - start))/50;
                    console.clear();

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