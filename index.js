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
    let stableWorker = 0;

    console.log(`Primary ${process.pid} is running`);
    osmProcess = new osmProcess(config.lat, config.lon);
    osmProcess.init(true).then(()=>{
        console.log(os.cpus().length + '개의 CPU 코어 확인.');

        // Fork workers.
        for (let i = 0; i < os.cpus().length; i++) {
            var worker = cluster.fork();
            let workerId = i;
            worker.on('message', (e)=>
                {
                    switch(e.header){
                        case 'ready':
                        {

                            console.log(`Worker ${workerId} is ready. pid: ${e.data.id}`);
                            stableWorker++;
                            if(stableWorker == os.cpus().length) broadcast({
                                header: 'waysCoord',
                                data: {
                                    ways: osmProcess.ways,
                                    nodes: osmProcess.nodes,
                                    cell: osmProcess.cell
                                }
                            });
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
    osmProcess = new osmProcess(config.lat, config.lon, false);
    osmProcess.init(false).then(()=>
        {
            process.send({header:'ready', data:{id:process.pid}});
        }
    );


    process.on('message', (e)=> {
        switch (e.header) {
            case 'waysCoord':
            {
                osmProcess.ways = e.data.ways;
                osmProcess.nodes = e.data.nodes;
                osmProcess.cell = e.data.cell;
                osmProcess.waysCoord(false, e.worker.id, e.length).then(()=>{

                });
                break;
            }
        }
    });
}

//cluster broadcast
function broadcast(data){
    if(cluster.isMaster){
        Object.values(cluster.workers).forEach((worker)=>{
            data.worker = worker;
            data.length = cluster.workers.length;
            worker.send(data);
        });
        // for(let i in cluster.workers){
        //     data.worker = cluster.workers[i];
        //     data.length = cluster.workers.length;
        //     cluster.workers[i].send(data);
        // }
    }
}