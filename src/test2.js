const fs = require('fs');
const path = require('path');

let nodeList = JSON.parse(fs.readFileSync('/nodeList.json', 'utf8').toString());
let wayList = JSON.parse(fs.readFileSync('/wayList.json', 'utf8').toString());
let relationList = JSON.parse(fs.readFileSync('/relationList.json', 'utf8').toString());

let nodeHash = JSON.parse(fs.readFileSync('/nodeHash.json', 'utf8').toString());
let wayHash = JSON.parse(fs.readFileSync('/wayHash.json', 'utf8').toString());
let relationHash = JSON.parse(fs.readFileSync('/relationHash.json', 'utf8').toString());
