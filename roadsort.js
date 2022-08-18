const fs = require('fs');

let roadData = JSON.parse(fs.readFileSync('./openAPI_seoul_road_2.json').toString());

console.log(roadData.DATA.sort(function compare(a, b) {
    if(a.rod_num > b.rod_num) return 1;
    if(a.rod_num < b.rod_num) return -1;
    return 0;
}));
fs.writeFileSync('./openAPI_seoul_road_2.json', JSON.stringify(roadData));