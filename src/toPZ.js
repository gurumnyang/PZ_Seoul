const convert = require('xml-js');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

module.exports = class toPZ{
    constructor(imgPath, saveSrc, mapName) {
        this.imgPath = imgPath;
        this.saveSrc = saveSrc;
        this.mapName = mapName;
        if(saveSrc&&mapName){
            this.init();
            console.log('기본 프리셋 작성 완료');
        }
    }
    init(){
        if (!fs.existsSync(path.join(this.saveSrc, this.mapName))){
            fs.mkdirSync(path.join(this.saveSrc, this.mapName));
            fs.writeFileSync(path.join(this.saveSrc, this.mapName, '/mod.info'), 'empty');
            fs.writeFileSync(path.join(this.saveSrc, this.mapName, '/poster.png'), 'empty');
            fs.mkdirSync(path.join(this.saveSrc, this.mapName, '/media'));
            this.mediaSrc = path.join(this.saveSrc, this.mapName, '/media');
            fs.mkdirSync(path.join(this.mediaSrc, 'tmxWorld'))

            /**
             * @todo 추가로 저장 데이터 넣어야 함.
             */

        } else {
            //delete old data
            console.error('이미 존재하는 맵입니다.');
            process.exit();
        }
    }

    initData(data){
        let xml = fs.readFileSync('../data/pzw/templete.xml', 'utf8').toString();
        let templete = JSON.parse(convert.xml2json(xml, {compact: true, spaces: 4}));
        console.log('파일 읽어옴');
        templete.world.BMPToTMX.tmxexportdir = {
            _attributes:{
                path: 'tmxWorld'
            }
        }
        // templete.world._attributes.x
        templete.world.bmp = []
        /*    data
    {
        x_start: n,
        x-end: n,
        y-start: n,
        y-end: n
    }*/

        if(!fs.existsSync(path.join(path.relative(this.mediaSrc, this.imgPath), '/.pzeditor'))){
            console.log('폴더 없음');
            fs.mkdirSync(path.join(this.imgPath, '/.pzeditor'));
        }
        for (let x = data.x_start; x < data.x_end - 1; x++) {
            for (let y = data.x_start; y < data.y_end - 1; y++) {
                let root = path.join(path.relative(this.mediaSrc, this.imgPath), `/${x}_${y}.png`);
                templete.world.bmp.push(
                    {_attributes:{
                        "path": root,
                        "x": x,
                        "y": y,
                        "width": "1",
                        "height": "1"
                        }
                    });

                const rotateImage = () => {
                    sharp(path.join(path.relative(this.mediaSrc, this.imgPath), `/${x}_${y}.png`))
                        .rotate(45)
                        .toFile(path.join(this.imgPath, '/.pzeditor',`/${x}_${y}_png.png`))
                }

                rotateImage()
            }
        }
        fs.writeFileSync(path.join(this.mediaSrc, '/edited.pzw'),convert.json2xml(templete, {compact: true, spaces: 4}));
        fs.writeFileSync(path.join(this.mediaSrc, '/edited.pzw.bak'),convert.json2xml(templete, {compact: true, spaces: 4}));
    }

}
let pz = new (module.exports)('C:\\Users\\GurumNyang\\Documents\\Github\\PZ_seoul\\rendered', 'C:\\Users\\GurumNyang\\Documents\\Github\\PZ_seoul\\data', 'testMap1')
pz.initData({
    x_start: 35,
    x_end: 65,
    y_start: 35,
    y_end: 65
});
