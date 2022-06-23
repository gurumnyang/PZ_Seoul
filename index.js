const fs = require('fs');
const through = require('through2');
const parseOSM = require('osm-pbf-parser');
const canvas = require('canvas');
const os = require('os');
let cluster = require('cluster');
const arraySort = require('array-sort');
const progress = require('cli-progress');
const readline = require("readline");

let osmProcess = require('./osm.js');

const config = JSON.parse(fs.readFileSync('./config.json'));
// 'C:\\Users\\GurumNyang\\Downloads\\네이버 웨일 다운로드\\exe\\highways1_01.pbf'

let cell = [];
let nodes = [];
let ways = [];

if (cluster.isMaster) {

    let workers = [];
    let stableWorker = 0;

    console.log(`Primary ${process.pid} is running`);
    osmProcess = new osmProcess(config.lat, config.lon, true).then(()=>{
        console.log(os.cpus().length + '개의 CPU 코어 확인.');
        // Fork workers.
        for (let i = 0; i < os.cpus().length; i++) {
            var worker = cluster.fork();
            let workerId = i;
            workers.push({
                index: i,
                worker: worker,
                status: -1
            });
            worker.on('message', (e)=>
                {
                    switch(e.header){
                        case 'ready':
                        {
                            workers[i].status = 0;
                            workers[i].pid = e.data.id;
                            console.log(`Worker ${workerId} is ready. pid: ${e.data.id}`);
                            stableWorker++;
                            if(stableWorker == os.cpus().length) broadcast({
                                header: 'waysCoord',
                                data: osmProcess.ways //osm class 추가 편집 필요.
                            }, workers);
                            break;
                        }
                    }
                    // console.log(e);
                }
            );
        }

    });


    cluster.on('exit', (worker, code, signal) => {
        console.log(`worker ${worker.process.pid} died`);
    });
} else {
    process.send({header:'ready', data:{id:process.pid}});

    process.on('message', (e)=> {
        switch (e.header) {
            case 'waysCoord':
            {
                cell = e.data.cell;
                ways = e.data.ways;
                nodes = e.data.nodes;
            }
        }
    });
}

function broadcast(data, workers){
    for(let worker of workers){
        worker.send(data);
    }
}