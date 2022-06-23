const fs = require('fs');
const through = require('through2');
const parseOSM = require('osm-pbf-parser');
const canvas = require('canvas');
const arraySort = require('array-sort');
const progress = require('cli-progress');
const readline = require("readline");

let config = JSON.parse(fs.readFileSync("./config.json"));
let roadType = JSON.parse(fs.readFileSync('./roadType.json'));

// console.log(roadType["6m미만"]);

// 위도 37.6875428, 37.4307532 111km
// 경도 126.7684945, 127.2037614

// 어두운 잔디               | 90 100 35
// 일반 잔디                 | 117 117 47
// 밝은 잔디                 | 145 135 60
// 모래                     | 210 200 160
// 밝은 아스팔트              | 165 160 140
// 어두운 아스팔트 (기본 도로)  | 100 100 100
// 일반 아스팔트              | 120 120 120
// 자갈흙                    | 140 70 15
// 흙                       | 120 70 20
// 어두운 아스팔트 균열        | 110 100 100
// 밝은 아스팔트 균열          | 130 120 120
// 물                       | 0 138 255
// 밀집한 숲                 | 255 0 0
// 밀집한 나무와 어두운 잔디    | 127 0 0
// 나무와 잔디                | 64 0 0
// 기본 잔디와, 약간의 나무     | 0 128 0
// 밝고 긴 잔디               | 0 255 0
// 없음 (black)              | 0 0 0


// 'C:\\Users\\GurumNyang\\Downloads\\네이버 웨일 다운로드\\exe\\highways1_01.pbf'

let lat = config.lat, // 위도 95.012152셀
    lon = config.lon //경도 128.048753셀


/**
 * @todo clustering must be finished!!
 */

class Init{
    constructor(lat, lon) {

        this.cell = [];
        this.ways = [];
        this.nodes = [];

        this.latCell = toMeter('lat', Math.abs(lat[0]-lat[1]))/300;
        this.lonCell = toMeter('lon', Math.abs(lon[0]-lon[1]))/300;

    }
    init(isMaster){
        return new Promise(async resolve=>{
            if(isMaster){
                this.osm = parseOSM();
                await this.cellInit(this.latCell, this.lonCell);
                console.log('위도 ',this.latCell,'셀, ', this.cell.length,'lat');
                console.log('경도 ',this.lonCell,'셀  ', this.cell[0].length,'lon');
                await this.readFile();
                resolve();
                //     .then(()=>this.waysCoord())
                //     .then(()=>this.nodeToCell())
                //     .then(async ()=>{
                //     });

            }
            resolve();
        })
    }
    cellInit(latCell, lonCell){
        return new Promise(resolve=>{
            for (let lat = 0; lat < Math.floor(latCell); lat++) {
                (this.cell)[lat] = [];
                for (let lon = 0; lon < Math.floor(lonCell); lon++) {
                    (this.cell)[lat][lon] = [];
                }
            }
            resolve();
        })
    }
    readFile(){
        return new Promise(resolve => {
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
                    this.ways = arraySort(this.ways, 'id');
                    this.nodes = arraySort(this.nodes, 'id');
                    resolve();
                });
        });
    }
    waysCoord(isMaster, workerNumber, length){
        /**
         * @todo workerNumber이랑 length를 기반으로 range 만들어야 함
         */
        return new Promise(resolve=>{
            if (fs.existsSync('./nodes.json') && fs.existsSync('./ways.json')) {
                console.log('저장된 처리 파일 발견됨. 해당 파일을 이용하시겠습니까? 새로운 맵 파일의 경우 N을 권장합니다. (Y/N)');
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout,
                });
                rl.on("line", (line) => {
                    rl.close();
                    if (line === 'y' || line === 'Y') {
                        this.ways = JSON.parse(fs.readFileSync('./ways.json').toString());
                        this.nodes = JSON.parse(fs.readFileSync('./nodes.json').toString());
                        resolve();
                    } else if (line === 'n' || line === 'N') {
                        console.log('처리 중 (1차)');
                        let roads = JSON.parse(fs.readFileSync('./new_openAPI_seoul_road.json').toString());
                        this.bar1 = new progress.SingleBar({}, progress.Presets.shades_classic);
                        this.bar1.start(this.ways.length, 0);
                        for(const wayIndex in this.ways){
                            if(this.ways[wayIndex].tags.name){
                                let roadFound = roadBindFind(this.ways[wayIndex].tags.name, roads.DATA);
                                if(roadFound){
                                    this.ways[wayIndex].roadData = roadFound;
                                } else {
                                    this.ways[wayIndex].roadData = null;
                                    console.log(this.ways[wayIndex].tags.name);
                                }
                            }
                            this.bar1.increment();
                            for(const obj in this.ways[wayIndex].refs){
                                //var found = this.nodes.find(e => e.id==this.ways[wayIndex].refs[obj]);
                                const found = bindFind(this.ways[wayIndex].refs[obj], this.nodes);
                                if(found){
                                    if(this.nodes[this.nodes.indexOf(found)].ways){
                                        this.nodes[this.nodes.indexOf(found)].ways.push(this.ways[wayIndex].id);
                                    } else {
                                        this.nodes[this.nodes.indexOf(found)].ways = [this.ways[wayIndex].id];
                                    }
                                    this.ways[wayIndex].refs[obj] = {
                                        id: found.id,
                                        lat: found.lat,
                                        lon: found.lon
                                    }
                                } else {
                                    console.log('NULL');
                                    this.ways[wayIndex].refs[obj] = null;
                                }
                            }
                        }
                        this.bar1.stop();
                        console.log('done');
                        fs.writeFileSync('./nodes.json', JSON.stringify(this.nodes));
                        fs.writeFileSync('./ways.json', JSON.stringify(this.ways));
                        this.bar1 = null;
                        resolve();
                    }
                });
            }
            else {
                console.log('처리 중 (1차)');
                let roads = JSON.parse(fs.readFileSync(config.roadFileSrc));
                this.bar1 = new progress.SingleBar({}, progress.Presets.shades_classic);
                this.bar1.start(this.ways.length, 0);

                for(const wayIndex in this.ways){
                    console.log(this.ways);
                    if(this.ways[wayIndex].tags.name){
                        let roadFound = roadBindFind(this.ways[wayIndex].tags.name, roads.DATA);
                        if(roadFound){
                            this.ways[wayIndex].roadData = roadFound;
                        } else {
                            this.ways[wayIndex].roadData = null;
                        }
                    }

                    if(this.ways[wayIndex].tags.name)
                        this.bar1.increment();
                    for(const obj in this.ways[wayIndex].refs){
                        //var found = this.nodes.find(e => e.id==this.ways[wayIndex].refs[obj]);
                        const found = bindFind(this.ways[wayIndex].refs[obj], this.nodes);
                        if(found){
                            if(this.nodes[this.nodes.indexOf(found)].ways){
                                this.nodes[this.nodes.indexOf(found)].ways.push(this.ways[wayIndex].id);
                            } else {
                                this.nodes[this.nodes.indexOf(found)].ways = [this.ways[wayIndex].id];
                            }
                            this.ways[wayIndex].refs[obj] = {
                                id: found.id,
                                lat: found.lat,
                                lon: found.lon
                            }
                        } else {
                            console.log('NULL');
                            this.ways[wayIndex].refs[obj] = null;
                        }
                    }
                }
                this.bar1.stop();
                console.log('done');
                this.bar1 = null;
                resolve();
            }
        })

    }
    nodeToCell(){
        return new Promise(resolve => {
            console.log('처리 중 (2차)');
            this.bar1 = new progress.SingleBar({}, progress.Presets.shades_classic);
            this.bar1.start(this.nodes.length, 0);
            for(let item of this.nodes){
                this.bar1.increment();
                (this.cell)[Math.floor(toMeter('lat', lat[0] - item.lat ) / 300)][Math.floor(toMeter('lon', item.lon - lon[0]) / 300)].push(item);
            }

            this.bar1.stop();
            this.bar1 = null;
            console.log('완료');
            resolve();
        })
    }
    generate(x,y){
        // 0 1 2
        // 1 2 3
        // 2 3 4
        if(x>=this.cell[0].length){
            process.send('message', {status:3});
            console.log('NO CELL');
            return;
        }
        if(y>=this.cell.length){
            process.send('message', {status:4});
            console.log('NO CELL');
            process.exit();
            return;
        }

        let img = canvas.createCanvas(300,300);
        let ctx = img.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        let coord = {
            x: lon[0] + toAngle('lon', x*300),
            y: lat[0] - toAngle('lat', y*300)
        }

        ctx.fillRect(0,0,300,300);

        ctx.lineWidth = 2;

        let notFound = [];
        let cellWays = [];
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
        for(let i=0; i<9; i++){
            const cellObj = this.cell[y + task[i][0]][x + task[i][1]];
            for(let obj of cellObj){
                if(!obj.ways) continue; //node중엔 경유지점이 없는 것도 있다.
                for(let obj_1 of obj.ways){
                    const found = bindFind(obj_1, this.ways);
                    if(found){
                        cellWays.push(found);
                    } else {
                        notFound.push(obj_1);
                    }
                }
            }
        }

        ctx.strokeStyle = '#646464';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 1;


        /**
         * @todo lineWidth Object .roadDATA USE
         */
        let widthData = [
            {
                name:'4이상8미만',
                width:6
            }
        ]
        for(let route of cellWays){
            ctx.beginPath();
            for(let pointIdx in route.refs){

                if(route.roadData){
                    console.log(route.roadData);
                    // ctx.lineWidth = 뭐시기
                }
                if(pointIdx === 0) {
                    ctx.moveTo(toMeter('lon', route.refs[pointIdx].lon - lon[0]) - (300*x), toMeter('lat', lat[0]-route.refs[pointIdx].lat) - (300*y));
                }
                else {
                    ctx.lineTo(toMeter('lon', route.refs[pointIdx].lon - lon[0]) - (300*x), toMeter('lat', lat[0]-route.refs[pointIdx].lat) - (300*y));
                }
            }
            ctx.stroke();
        }





        ctx.fillStyle = 'white';
        ctx.fillText(coord.x, 0,10);
        ctx.fillText(coord.y, 0, 20);

        return new Promise(resolve => {
            img.createPNGStream().pipe(fs.createWriteStream('./rendered/'+x+'_'+y+'.png').on('finish', ()=>{
                console.log('\n');
                console.log(coord);
                console.log('./rendered/'+x+'_'+y+'.png saved');
                ctx.fillStyle = 'black';
                ctx.fillRect(0,0,300,300);
                img.createPNGStream().pipe(fs.createWriteStream('./rendered/'+x+'_'+y+'_veg.png').on('finish',()=>{
                    if(notFound.length> 0) console.log(notFound.length, '개의 Node를 찾을 수 없음.');
                    console.log('./rendered/'+x+'_'+y+'_veg.png saved');
                    resolve();
                }))
            }));
        })
    }
}

//아 일 타일이 1m 그리고 일 serie 삼백미터 그랬을 때 위도 95 셀은 95 × 300 미터 경도는 161 × 300 미터 엔터




function getDistance(lat, lon){
    return Math.sqrt(Math.abs(lat[0]-lat[1]) + Math.abs(lon[0]-lon[1]));
}
function toMeter(type, distance){
    if(type === 'lat') return distance*lat[2]*1000;
    if(type === 'lon') return distance*lon[2]*1000;
}
function toAngle(type, distance){
    if(type === 'lat') return distance/lat[2]/1000;
    if(type === 'lon') return distance/lon[2]/1000;

}
function bindFind(id, data){
    let low = 0;
    let high = data.length - 1;
    let mid = Math.floor((low + high) / 2);
    while(true){
        mid =  Math.floor((low + high)/2);
        if(low>high) return false;
        if(data[mid].id === id){
            return data[mid];
        }
        if(data[mid].id < id){
            low = mid + 1;
        } else {
            high = mid - 1;
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

module.exports = Init;