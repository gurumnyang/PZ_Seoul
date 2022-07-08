const fs = require('fs');
const path = require('path');
const appRoot = process.cwd();
const convert = require(path.join(process.cwd(), '/src/convert.js'));


/**
 *
 * @param extent
 * @param options
 */

module.exports = function generate(extent, options){
    /**
     * @todo extent.length / 5만큼
     * 주요 꼭짓점 산출하여 폴리곤 단순화 + 중로 산출
     * @todo seed 값 활용하여 중로 외 소로급 세부 연결도로 산출할 것
     * @todo seed 값 활용하여 주거단지 내 세부 소로 및 통행도로 생성해낼 것
     * 건물 배치도 넣어주면 좋을 것이라 봄
     */

    let size = getSize(extent);
    let seed = Math.floor(Math.random()*10);

    // sequential road type
    /*
    중로1로
    소로3로
    소로2로
    */

    let primary = [],
        secondary = [],
        residential = [];

    //5 maximum road angle
    let maxAngle = [];
    let angleLength = Math.floor(extent.length/5);

    //메인도로 구하기
    for(let index in extent){
        if(index === 0 || index === extent.length - 1) continue;
        // 각도 구하는 공식 적어야 함     여기해야함 여기해야함
        let angle = convert.getAngle(extent[index-1], extent[index], extent[index+1]);
        if(maxAngle.length < angleLength){
            maxAngle.push(angle);
            primary.push(extent[index][2]);
        }
        if(angle > maxAngle[maxAngle.length - 1]){
            for(let numIndex in maxAngle){
                if(angle > maxAngle[numIndex]){
                    //마지막꺼 지우고
                    maxAngle.shift();
                    primary.shift();
                    //사이에 끼우고
                    maxAngle.splice(maxAngle.length - 1, 0, angle);
                    primary.splice(maxAngle.length - 1, 0, extent[index][2]);
                    //종료
                    break;
                }
            }
        }
    }
}

function getSize(extent){
    let   minX = extent[0].lon
        , minY = extent[0].lat
        , maxX = extent[0].lon
        , maxY = extent[0].lat;

    for(let i=1; i<extent.length; i++){
        if(extent[i].lon < minX) minX = extent[i].lon;
        if(extent[i].lat < minY) minY = extent[i].lat;
        if(extent[i].lon > maxX) maxX = extent[i].lon;
        if(extent[i].lat > maxY) maxY = extent[i].lat;
    }
    return [[minX, minY],[maxX, maxY]];
}