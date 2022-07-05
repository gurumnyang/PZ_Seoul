var voronoi = require('d3-voronoi');
const canvas = require('canvas');
const polygonClipping = require('polygon-clipping');
const fs = require('fs');
const path = require("path");

// var sites = new Array(100)
// for(var i=0; i<100; ++i) {
//     sites[i] = [Math.random()*1000, Math.random()*1000]
// }

//config

class voronoi_road {
    constructor(config) {
        if(config){

        }
    }
}

let pAmount = 50;
let canvasSize = 1000;

let img = canvas.createCanvas(1000, 1000);
let ctx = img.getContext('2d');

let sites = new Array(pAmount);
for(var i=0; i<pAmount; ++i) {
    sites[i] = [Math.random()*canvasSize, Math.random()*canvasSize]
}
voronoi = voronoi.voronoi().extent([[0, 0], [canvasSize, canvasSize]]);
let polygons = voronoi.polygons(sites);

ctx.antialias = 'none';
ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, canvasSize, canvasSize);


ctx.fillStyle = '#000';
ctx.strokeStyle = '#000';

for(let obj of polygons){
    if(!obj) continue;
    obj = polygonClipping.intersection([obj], [[[0, 0], [500, 0], [700, 500], [400, 400], [0, 0]]]);
    for(let poly of obj){
        if(poly.length !== 1 ) console.log(poly.length);
        ctx.beginPath();
        ctx.moveTo(poly[0][0][0], poly[0][0][1]);
        for(let point of poly){
        }
        for(let i=1; i<poly[0].length; ++i){
            ctx.lineTo(poly[0][i][0], poly[0][i][1]);
        }
        ctx.closePath();
        ctx.stroke()
    }
}
img.createPNGStream().pipe(fs.createWriteStream('test.png'));
