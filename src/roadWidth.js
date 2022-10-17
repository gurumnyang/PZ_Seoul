//도로명을 넣으면 도로폭을 반환하는 함수

function roadWidth(roadName) {
    var width = 0;
    //도로의 마지막 글자에 따라 도로폭을 정한다.
    switch(roadName[roadName.length-1]) {
        case '로':
            switch(roadName[roadName.length-2]) {
                case '대':
                    width = 32;
                    break;
                /*case '중':
                    width = 17;
                    break;
                case '소':
                    width = 9;
                    break;*/

            }
            break;
        case '길':
            width = 5;
            break;
        default:
            return null;
    }
    return width;
}

module.exports = roadWidth;