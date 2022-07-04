const XmlReader = require('xml-reader');
const fs = require('fs');
const path = require('path');
const {parse, stringify, toJSON, fromJSON} = require('flatted');

let nodeList = [],
    nodeHash = {},
    wayList = [],
    wayHash = {},
    relationList = [],
    relationHash = {}

/**
 * @todo map.osm 파일 가공하여 residential 도로 지우고 주거건물도 다 날려 최적화할 것.
 * 어차피 버릴껀데
 */

const reader = XmlReader.create({stream: true});

reader.on('tag', (name, data) => {

    switch(name){
    case 'node':
        nodeList.push(data.attributes.id);
        nodeHash[data.id] = data;
        break;
    case 'way':
        wayList.push(data.attributes.id);
        wayHash[data.id] = data;
        break;
    case 'relation':
        if(!!data.parent) console.log('parent 존재함');
        relationList.push(data.attributes.id);
        relationHash[data.id] = data;
        break;
    }
});
reader.on('done', (data) => {
    console.log('\n');
    console.log('finished')
    console.log('nodeList', nodeList);
    console.log('wayList', wayList);
    console.log('relationList', relationList);

    fs.writeFileSync('./nodeList.json', stringify(nodeList));
    fs.writeFileSync('./wayList.json', stringify(wayList));
    fs.writeFileSync('./relationList.json', stringify(relationList));
    fs.writeFileSync('./nodeHash.json', stringify(nodeHash));
    fs.writeFileSync('./wayHash.json', stringify(wayHash));
    fs.writeFileSync('./relationHash.json', stringify(relationHash));

    console.log('\n');
    console.log('nodeHash', nodeHash);
});
// 0
const data = fs.createReadStream('../map.osm');

data.on('data', (chunk) => {
    reader.parse(chunk.toString('utf8'));
});
data.on('end', (e) => console.log('END'));

// Note that we are calling the parse function providing just one char each time