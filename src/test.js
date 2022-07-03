const XmlReader = require('xml-reader');
const fs = require('fs');
const path = require('path');

const reader = XmlReader.create({stream: true});

let i = 0;

reader.on('tag', (name, data) => {
    if(data.children.length > 0){
        console.log(data);
    }
});
reader.on('done', (data) => console.log(data.children.length));
// 0
const data = fs.createReadStream('../map.osm');

data.on('data', (chunk) => reader.parse(chunk.toString('utf8')));

// Note that we are calling the parse function providing just one char each time