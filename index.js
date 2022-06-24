const fs = require('fs');
const through = require('through2');
const parseOSM = require('osm-pbf-parser');
const canvas = require('canvas');
const os = require('os');
const cluster = require('cluster');
const arraySort = require('array-sort');
const progress = require('cli-progress');
const readline = require("readline");

let osmProcess = require('./osm.js');

const config = JSON.parse(fs.readFileSync('./config.json'));
// 'C:\\Users\\GurumNyang\\Downloads\\네이버 웨일 다운로드\\exe\\highways1_01.pbf'

let cell;
let nodes;
let ways;

if (cluster.isMaster) {
    let stableWorker = 0;


    console.log(`Primary ${process.pid} is running`);
    osmProcess = new osmProcess(config.lat, config.lon);
    osmProcess.init(true).then(()=>{
        console.log(os.cpus().length + '개의 CPU 코어 확인.');
        cell = osmProcess.cell;
        nodes = osmProcess.nodes;
        ways = osmProcess.ways;

        fs.writeFileSync('./clusterData.json', JSON.stringify({
            cell: osmProcess.cell,
            nodes: osmProcess.nodes,
            ways: osmProcess.ways
        }));

        console.log('OSM 정보 읽기 완료.');

        // Fork workers.
        for (let i = 0; i < os.cpus().length; i++) {
            var worker = cluster.fork();
            let workerId = i;
            worker.on('message', (e)=>{
                switch(e.header){
                    case 'ready':
                    {
                        console.log(`Worker ${workerId} is ready. pid: ${e.data.id}`);
                        stableWorker++;
                        if(stableWorker == os.cpus().length) {
                            stableWorker = 0;
                            console.log('waysCoord 데이터 생성 시작.');
                            broadcast({
                                header: 'waysCoord'
                            });
                        }
                        break;
                    }
                    case 'done_waysCoord':
                    {
                        stableWorker++;
                        if(stableWorker == os.cpus().length) {
                            stableWorker = 0;
                            console.log('waysCoord 데이터 생성 완료.');
                            // broadcast({
                            //     header: 'waysCoord'
                            // });
                        }
                        break;
                    }
                }
            });
        }

    });


    cluster.on('exit', (worker, code, signal) => {
        console.log(`worker ${worker.process.pid} died`);
    });
}
else {
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
                osmProcess.waysCoord(false, e.worker.id, e.length).then(()=>{
                    console.log(`Worker ${e.worker.id} is done_waysCoord`);
                    process.send({header:'done_waysCoord', data:{id:process.pid}});
                });
                break;
            }
        }
    });
}

//cluster broadcast
async function broadcast(data){
    if(cluster.isMaster){
        Object.values(cluster.workers).forEach((worker)=>{
            data.worker = worker;
            data.length = Object.values(cluster.workers).length;
            worker.send(data);
        });
        // for(let i in cluster.workers){
        //     data.worker = cluster.workers[i];
        //     data.length = cluster.workers.length;
        //     cluster.workers[i].send(data);
        // }
    }
}