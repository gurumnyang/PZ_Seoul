const fs = require('fs');
const progress = require('cli-progress');
const readline = require("readline");
const path = require('path');

const appRoot = process.cwd();

let config = JSON.parse(fs.readFileSync(path.join(appRoot, "/config.json")).toString());
let roadType = JSON.parse(fs.readFileSync(path.join(appRoot, '/roadType.json')).toString());

const readOsm = new (require('./src/readOsm.js'))(config.lat, config.lon, __dirname);


// 위도 37.6875428, 37.4307532 111km
// 경도 126.7684945, 127.2037614


(async () => {
    await readOsm.init();
    await readOsm.loadData();
    await readOsm.parseData();
    for(let x = 0; x < readOsm.lonCell; x++){
        for(let y = 0; y < readOsm.latCell; y++){
            await readOsm.generate(x, y);
        }
    }
    await readOsm.showCellData(26, 60);
})();