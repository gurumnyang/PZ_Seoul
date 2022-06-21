const fs = require('fs');
const through = require('through2');
const parseOSM = require('osm-pbf-parser');
const canvas = require('canvas');
const os = require('os');
let cluster = require('cluster');
const arraySort = require('array-sort');
const progress = require('cli-progress');
const readline = require("readline");



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


let src = './highways1_01.pbf';
// 'C:\\Users\\GurumNyang\\Downloads\\네이버 웨일 다운로드\\exe\\highways1_01.pbf'

let lat = [37.6875428, 37.4307532, 111], // 위도 95.012152셀
    lon = [126.7684945, 127.2037614, 88.74] //경도 128.048753셀

let renderCell = [30, 30]

let cell = [];
let nodes = [];
let ways = [];

class Init{
    constructor(lat, lon) {
        this.latCell = toMeter('lat', Math.abs(lat[0]-lat[1]))/300;
        this.lonCell = toMeter('lon', Math.abs(lon[0]-lon[1]))/300;
        this.cellInit(this.latCell, this.lonCell);
        console.log('위도 ',this.latCell,'셀, ', cell.length,'lat');
        console.log('경도 ',this.lonCell,'셀  ', cell[0].length,'lon');
        this.readFile()
            .then(()=>this.waysCoord())
            .then(()=>this.nodeToCell())
            .then(async ()=>{
                await this.generate(50, 50);
                await this.generate(51, 50);
                await this.generate(52, 50);
                await this.generate(50, 51);
                await this.generate(51, 51);
                await this.generate(52, 51);
                await this.generate(50, 52);
                await this.generate(51, 52);
                await this.generate(52, 52);
            });

    }
    cellInit(latCell, lonCell){
        for(let lat=0;lat<Math.floor(latCell);lat++){
            cell[lat] = [];
            for(let lon=0;lon<Math.floor(lonCell);lon++){
                cell[lat][lon] = [];
            }
        }
    }
    readFile(){
        return new Promise(resolve => {
            console.log('불러오는 중');
            fs.createReadStream(src)
                .pipe(osm)
                .pipe(through.obj(function (items, enc, next) {
                    items.forEach(function (item) {
                        if(item.type == 'way'){
                            ways.push(item);
                        }
                        if(item.lat&&item.lon){
                            if(item.type == 'node'){
                                nodes.push(item);
                            }
                        }
                    });
                    next();
                })).on('finish', ()=>{
                ways = arraySort(ways, 'id');
                nodes = arraySort(nodes, 'id');
                resolve();
            });
        })
    }
    waysCoord(){
        return new Promise(resolve=>{
            if (fs.existsSync('./nodes.json') && fs.existsSync('./ways.json')) {
                console.log('저장된 처리 파일 발견됨. 해당 파일을 이용하시겠습니까? 새로운 맵 파일의 경우 N을 권장합니다. (Y/N)');
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout,
                });
                rl.on("line", function (line) {
                    rl.close();
                    if (line == 'y' || line == 'Y') {
                        ways = JSON.parse(fs.readFileSync('./ways.json'));
                        nodes = JSON.parse(fs.readFileSync('./nodes.json'));
                        resolve();
                    } else if (line == 'n' || line == 'N') {

                        /**
                         * @todo 클러스터링을 사용하여 처리속도를 올리도록 알고리즘 개선.
                         */
                        console.log('처리 중 (1차)');
                        let roads = JSON.parse(fs.readFileSync('./new_openAPI_seoul_road.json'));
                        this.bar1 = new progress.SingleBar({}, progress.Presets.shades_classic);
                        this.bar1.start(ways.length, 0);
                        for(var wayIndex in ways){
                            if(ways[wayIndex].tags.name){
                                let roadFound = roadBindFind(ways[wayIndex].tags.name, roads.DATA);
                                if(roadFound){
                                    ways[wayIndex].roadData = roadFound;
                                } else {
                                    ways[wayIndex].roadData = null;
                                    console.log(ways[wayIndex].tags.name);
                                }
                            }
                            this.bar1.increment();
                            for(var obj in ways[wayIndex].refs){
                                //var found = nodes.find(e => e.id==ways[wayIndex].refs[obj]);
                                var found = bindFind(ways[wayIndex].refs[obj], nodes);
                                if(found){
                                    if(nodes[nodes.indexOf(found)].ways){
                                        nodes[nodes.indexOf(found)].ways.push(ways[wayIndex].id);
                                    } else {
                                        nodes[nodes.indexOf(found)].ways = [ways[wayIndex].id];
                                    }
                                    ways[wayIndex].refs[obj] = {
                                        id: found.id,
                                        lat: found.lat,
                                        lon: found.lon
                                    }
                                } else {
                                    console.log('NULL');
                                    ways[wayIndex].refs[obj] = null;
                                }
                            }
                        }
                        this.bar1.stop();
                        console.log('done');
                        fs.writeFileSync('./nodes.json', JSON.stringify(nodes));
                        fs.writeFileSync('./ways.json', JSON.stringify(ways));
                        this.bar1 = null;
                        resolve();
                    }
                });
            } else {
                console.log('처리 중 (1차)');
                let roads = JSON.parse(fs.readFileSync('./new_openAPI_seoul_road.json'));
                this.bar1 = new progress.SingleBar({}, progress.Presets.shades_classic);
                this.bar1.start(ways.length, 0);
                for(var wayIndex in ways){
                    if(ways[wayIndex].tags.name){
                        let roadFound = roadBindFind(ways[wayIndex].tags.name, roads.DATA);
                        if(roadFound){
                            ways[wayIndex].roadData = roadFound;
                        } else {
                            ways[wayIndex].roadData = null;
                        }
                    }

                    if(ways[wayIndex].tags.name)
                        this.bar1.increment();
                    for(var obj in ways[wayIndex].refs){
                        //var found = nodes.find(e => e.id==ways[wayIndex].refs[obj]);
                        var found = bindFind(ways[wayIndex].refs[obj], nodes);
                        if(found){
                            if(nodes[nodes.indexOf(found)].ways){
                                nodes[nodes.indexOf(found)].ways.push(ways[wayIndex].id);
                            } else {
                                nodes[nodes.indexOf(found)].ways = [ways[wayIndex].id];
                            }
                            ways[wayIndex].refs[obj] = {
                                id: found.id,
                                lat: found.lat,
                                lon: found.lon
                            }
                        } else {
                            console.log('NULL');
                            ways[wayIndex].refs[obj] = null;
                        }
                    }
                }
                this.bar1.stop();
                console.log('done');
                fs.writeFileSync('./nodes.json', JSON.stringify(nodes));
                fs.writeFileSync('./ways.json', JSON.stringify(ways));
                this.bar1 = null;
                resolve();
            }
        })

    }
    nodeToCell(){
        return new Promise(resolve => {
            console.log('처리 중 (2차)');
            this.bar1 = new progress.SingleBar({}, progress.Presets.shades_classic);
            this.bar1.start(nodes.length, 0);
            for(let item of nodes){
                this.bar1.increment();
                cell[Math.floor(toMeter('lat', lat[0] - item.lat ) / 300)][Math.floor(toMeter('lon', item.lon - lon[0]) / 300)].push(item);
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
        if(x>=cell[0].length){
            process.send('message', {status:3});
            console.log('NO CELL');
            return;
        }
        if(y>=cell.length){
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
        for(var i=0; i<9;i++){
            var cellObj = cell[y+task[i][0]][x+task[i][1]];
            for(let obj of cellObj){
                if(!obj.ways) continue; //node중엔 경유지점이 없는 것도 있다.
                for(let obj_1 of obj.ways){
                    const found = bindFind(obj_1, ways);
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
                if(pointIdx == 0) {
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


var osm = parseOSM();

function getDistance(lat, lon){
    return Math.sqrt(Math.abs(lat[0]-lat[1]) + Math.abs(lon[0]-lon[1]));
}
function toMeter(type, distance){
    if(type == 'lat') return distance*lat[2]*1000;
    if(type == 'lon') return distance*lon[2]*1000;
}
function toAngle(type, distance){
    if(type == 'lat') return distance/lat[2]/1000;
    if(type == 'lon') return distance/lon[2]/1000;

}
function bindFind(id, data){
    var low = 0;
    var high = data.length - 1;
    var mid =  Math.floor((low + high)/2);
    while(true){
        mid =  Math.floor((low + high)/2);
        if(low>high) return false;
        if(data[mid].id == id){
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
    var low = 0;
    var high = data.length - 1;
    var mid =  Math.floor((low + high)/2);
    while(true){
        mid =  Math.floor((low + high)/2);
        if(low>high) return false;
        if(data[mid].rod_num == id){
            return data[mid];
        }
        if([id, data[mid].rod_num].sort()[0] == id){
            high = mid - 1;
        } else {
            low = mid + 1;
        }
    }
}

if (cluster.isMaster) {
    console.log(`Primary ${process.pid} is running`);

    // Fork workers.
    for (let i = 0; i < 1; i++) {
        var worker = cluster.fork();
        worker.on('message', e=>{
            if(e.status == 1){
                worker.send({status: 2, x:renderCell[0], y: renderCell[1]});
                if(renderCell[0] == 35){
                    renderCell[0] = 30;
                    renderCell[1]++;
                } else {
                    if(renderCell[1] == 35) process.exit();
                    renderCell[0]++;
                }

            }
            // if(e.status == 3){
            //     renderCell[0]=0;
            //     renderCell[1]++;
            //     console.log(renderCell);
            //     worker.send({status: 2, x:renderCell[0], y: renderCell[1]});
            // }
            // if(e.status == 4){
            //     process.exit();
            // }
        })
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`worker ${worker.process.pid} died`);
    });
} else {
    // new Init(lat, lon);
    console.log(`Worker ${process.pid} started`);
    let master = new Init(lat, lon);

    // process.on('message', e => {
    //     if(e.status == 2){
    //         master.generate(e.x, e.y).then(r => {
    //             process.send({status:1});
    //         })
    //     }
    // })
}hg