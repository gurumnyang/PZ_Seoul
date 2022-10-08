const fs = require('fs');
const progress = require('cli-progress');
const readline = require("readline");
const path = require('path');

const appRoot = process.cwd();

let config = JSON.parse(fs.readFileSync(path.join(appRoot, "/config.json")).toString());
let roadType = JSON.parse(fs.readFileSync(path.join(appRoot, '/roadType.json')).toString());

const readOsm = new (require('./src/readOsm.js'))(config.lat, config.lon, __dirname);

//redis for clusturing
const redis = require('redis');
let client = redis.createClient(6379,'127.0.0.1');


const
    cluster = require('cluster'),
    os = require('os');
const convert = require("./src/convert");
const parseOSM = require("osm-pbf-parser");

let worker_count = 8;
if(process.argv[2]) worker_count = Number(process.argv[2]);

// 위도 37.6875428, 37.4307532 111km
// 경도 126.7684945, 127.2037614

if(cluster.isWorker)
{
    (async () => {
        await client.connect();


        /*this.lat = lat;
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
        this.src = src;*/
        console.log('워커 생성 : ' + cluster.worker.id);

        readOsm.lat = await JSON.parse(await client.get('lat'));
        readOsm.lon = await JSON.parse(await client.get('lon'));
        readOsm.cell = await JSON.parse(await client.get('cell'));
        readOsm.areaCell = await JSON.parse(await client.get('areaCell'));
        readOsm.trCell = await JSON.parse(await client.get('trCell'));
        readOsm.nodeList = await JSON.parse(await client.get('nodeList'));
        readOsm.wayList = await JSON.parse(await client.get('wayList'));

        readOsm.nodeList_TR = await JSON.parse(await client.get('nodeList_TR'));
        readOsm.wayList_TR = await JSON.parse(await client.get('wayList_TR'));
        readOsm.relationList_TR = await JSON.parse(await client.get('relationList_TR'));

        readOsm.nodeHash = await JSON.parse(await client.get('nodeHash'));
        readOsm.wayHash = await JSON.parse(await client.get('wayHash'));
        readOsm.relationHash = await JSON.parse(await client.get('relationHash'));

        readOsm.GeoJSONArea = await JSON.parse(await client.get('GeoJSONArea'));

        readOsm.latCell = await JSON.parse(await client.get('latCell'));
        readOsm.lonCell = await JSON.parse(await client.get('lonCell'));
        readOsm.STATE = await JSON.parse(await client.get('STATE'));
        await client.disconnect();

        readOsm.send = async (data) => {
            process.send({
                key: data.key,
                value: data.value
            });
        }
        for(let x = cluster.worker.id - 1; x < readOsm.lonCell; x+=worker_count){
            if(x >= readOsm.lonCell) break;
            for(let y = 0; y < readOsm.latCell; y++){
                await readOsm.generate(x, y);
            }
        }
    })();
} else
{
    (async () => {
        console.log('worker_count:', worker_count);
        await client.connect();
        await readOsm.init();
        await readOsm.loadMapData();
        await readOsm.loadTRData();
        await readOsm.parseData();
        await readOsm.parseRelation();
        if(process.argv[3] == '-ga'){
            await readOsm.getArea();
        } else {
            await readOsm.loadArea();
        }
        await readOsm.areaToCell();

        await client.set('lat', JSON.stringify(readOsm.lat));
        await client.set('lon', JSON.stringify(readOsm.lon));
        await client.set('cell', JSON.stringify(readOsm.cell));
        await client.set('areaCell', JSON.stringify(readOsm.areaCell));
        await client.set('trCell', JSON.stringify(readOsm.trCell));
        await client.set('nodeList', JSON.stringify(readOsm.nodeList));
        await client.set('wayList', JSON.stringify(readOsm.wayList));
        await client.set('edgeList', JSON.stringify(readOsm.edgeList));

        await client.set('nodeList_TR', JSON.stringify(readOsm.nodeList_TR));
        await client.set('wayList_TR', JSON.stringify(readOsm.wayList_TR));
        await client.set('relationList_TR', JSON.stringify(readOsm.relationList_TR));

        await client.set('nodeHash', JSON.stringify(readOsm.nodeHash));
        await client.set('wayHash', JSON.stringify(readOsm.wayHash));
        await client.set('relationHash', JSON.stringify(readOsm.relationHash));

        await client.set('GeoJSONArea', JSON.stringify(readOsm.GeoJSONArea));

        await client.set('latCell', JSON.stringify(readOsm.latCell));
        await client.set('lonCell', JSON.stringify(readOsm.lonCell));
        await client.set('STATE', JSON.stringify(readOsm.STATE));
        await client.disconnect();


        let tile_length = (readOsm.cell.length) * (readOsm.cell[0].length);
        let tile_count = 0;
        let average = null;

        let start = new Date();
        for(let cpu = 0; cpu < worker_count; cpu++){
            let worker = cluster.fork();
            worker.on('message', async (msg) => {
                console.clear();
                if(msg.key == 'done'){
                    tile_count++;
                    if(tile_count == tile_length){
                        console.log('전체 진행완료');
                        console.log('총 소요 시간 : ' + (new Date() - start)/1000 + '초');
                        process.exit();
                    } else {
                        if(average){
                            average = (average + msg.value.average) / 2;
                        } else {
                            average = msg.value.average;
                        }
                        console.log(`진행중 : [${tile_count}/${tile_length}] ${average / worker_count}ms`);
                    }
                }
            });
        }



        // // await readOsm.showCellData(26, 60);
        // // readOsm.genResidential();
    })();
}