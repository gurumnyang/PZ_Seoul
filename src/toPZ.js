const convert = require('xml-js');
const fs = require('fs');
const fsE = require('fs-extra');
const path = require('path');
const polygonClipping = require('polygon-clipping');

module.exports = class toPZ{
    constructor(saveSrc, mapName) {
        this.saveSrc = saveSrc;
        this.mapName = mapName;
    }
    init(){
        if (!fs.existsSync(this.saveSrc)){
            fs.mkdirSync(path.join(this.saveSrc, this.mapName));
            fs.writeFileSync(path.join(this.saveSrc, 'mod.info'), 'empty');
            fs.writeFileSync(path.join(this.saveSrc, 'poster.png'), 'empty');
            fs.mkdirSync(path.join(this.saveSrc, this.mapName, 'maps'));
            fs.mkdirSync(path.join(this.saveSrc, this.mapName, 'maps', this.mapName));
            /**
             * @todo 추가로 저장 데이터 넣어야 함.
             */

        }
    }

    initData(data){
        let xml = fs.readFileSync('../data/pzw/templete.xml', 'utf8').toString();
        let templete = JSON.parse(convert.xml2json(xml, {compact: true, spaces: 4}));
        console.log('파일 읽어옴');
        templete.world.bmp = []
        /*    data
    {
        x_start: n,
        x-end: n,
        y-start: n,
        y-end: n
    }*/

        for (let x = data.x_start; x < data.x_end - 1; x++) {
            for (let y = data.x_start; y < data.y_end - 1; y++) {
                let root = `../../rendered/${x}_${y}.png`;
                templete.world.bmp.push(
                    {_attributes:{
                        "path": root,
                        "x": x,
                        "y": y,
                        "width": "1",
                        "height": "1"
                        }
                    })
            }
        }
        fs.writeFileSync('../data/pzw/edited.pzw',convert.json2xml(templete, {compact: true, spaces: 4}));
        fs.writeFileSync('../data/pzw/edited.pzw.bak',convert.json2xml(templete, {compact: true, spaces: 4}));
    }

}
let pz = new (module.exports)(null, null)
pz.initData({
    x_start: 45,
    x_end: 55,
    y_start: 45,
    y_end: 55
});
