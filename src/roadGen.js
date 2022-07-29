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
}

function getSize(extent){
    // 정사각형 좌상 좌하 우상 우하 구하기
    let   minX = extent[0].lon
        , minY = extent[0].lat
        , maxX = extent[0].lon
        , maxY = extent[0].lat;

    //가장큰놈 가장작은놈 산출
    for(let i=1; i<extent.length; i++){
        if(extent[i].lon < minX) minX = extent[i].lon;
        if(extent[i].lat < minY) minY = extent[i].lat;
        if(extent[i].lon > maxX) maxX = extent[i].lon;
        if(extent[i].lat > maxY) maxY = extent[i].lat;
    }
    //선언한거 리턴
    return [[minX, minY],[maxX, maxY]];
}