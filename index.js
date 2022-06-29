const fs = require('fs');
const progress = require('cli-progress');
const readline = require("readline");


let config = JSON.parse(fs.readFileSync("./config.json").toString());
let roadType = JSON.parse(fs.readFileSync('./roadType.json').toString());

const readOsm = new (require('./src/readOsm.js'))(config.lat, config.lon, __dirname);


// 위도 37.6875428, 37.4307532 111km
// 경도 126.7684945, 127.2037614

/*
어두운 잔디               | 90 100 35
일반 잔디                 | 117 117 47
밝은 잔디                 | 145 135 60
모래                     | 210 200 160
밝은 아스팔트              | 165 160 140
어두운 아스팔트 (기본 도로)  | 100 100 100
일반 아스팔트              | 120 120 120
자갈흙                    | 140 70 15
흙                       | 120 70 20
어두운 아스팔트 균열        | 110 100 100
밝은 아스팔트 균열          | 130 120 120
물                       | 0 138 255
밀집한 숲                 | 255 0 0
밀집한 나무와 어두운 잔디    | 127 0 0
나무와 잔디                | 64 0 0
기본 잔디와, 약간의 나무     | 0 128 0
밝고 긴 잔디               | 0 255 0
없음 (black)              | 0 0 0
*/

(async () => {
    await readOsm.init();
    await readOsm.loadData();
    await readOsm.parseData();
    for(let x = 0; x < readOsm.lonCell; x++){
        for(let y = 0; y < readOsm.latCell; y++){
            await readOsm.generate(x, y);
        }
    }
})();