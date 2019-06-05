var head = document.getElementsByTagName("head");
var script = document.createElement("script");
script.setAttribute("src", "jquery-1.12.4.min.js");
script.setAttribute("type", "text/javascript");
script.addEventListener("load", function() {

const imageScaleFactor = 0.5;
const outputStride = 16;
const flipHorizontal = false;
const stats = new Stats();
const contentWidth = 800;
const contentHeight = 600;
const scoreThreshold = 0.7;
const keptThisIsIt = 10;

bindPage();

async function bindPage() {
    const net = await posenet.load(); // posenetの呼び出し
    let video;
    try {
        video = await loadVideo(); // video属性をロード
    } catch(e) {
        console.error(e);
        return;
    }
    detectPoseInRealTime(video, net);
}

// video属性のロード
async function loadVideo() {
    const video = await setupCamera(); // カメラのセットアップ
    video.play();
    return video;
}

// カメラのセットアップ
// video属性からストリームを取得する
async function setupCamera() {
    const video = document.getElementById('video');
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
            'audio': false,
            'video': true});
        video.srcObject = stream;

        return new Promise(resolve => {
            video.onloadedmetadata = () => {
                resolve(video);
            };
        });
    } else {
        const errorMessage = "This browser does not support video capture, or this device does not have a camera";
        alert(errorMessage);
        return Promise.reject(errorMessage);
    }
}

var keepThisIsItOn = 0;
var keepThisIsItOff = 0;

var audio_on = $('#audio_on');
var audio_off = $('#audio_off');


// 取得したストリームをestimateSinglePose()に渡して姿勢予測を実行
// requestAnimationFrameによってフレームを再描画し続ける
function detectPoseInRealTime(video, net) {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const flipHorizontal = true; // since images are being fed from a webcam

    async function poseDetectionFrame() {
        stats.begin();
        const pose = await net.estimateSinglePose(video, imageScaleFactor, flipHorizontal, outputStride);
        ctx.clearRect(0, 0, contentWidth,contentHeight);

        ctx.save();
        ctx.scale(-1, 1);
        ctx.translate(-contentWidth, 0);
        ctx.drawImage(video, 0, 0, contentWidth, contentHeight);
        ctx.restore();



        if(pose.score > scoreThreshold){
            if(isThisIsItOn(pose)){
                keepThisIsItOn++;
                if(keepThisIsItOn >= keptThisIsIt){
                    url = "https://maker.ifttt.com/trigger/[event name]/with/key/[your sercret key]";
                    audio_on[0].play();
                    return;
                }
            }else if(isThisIsItOff(pose)){
                keepThisIsItOff++;
                if(keepThisIsItOff >= keptThisIsIt){
                    url = "https://maker.ifttt.com/trigger/[event name]/with/key/[your sercret key]";
                    audio_off[0].play();            
                    return;
                }
            }
            pose.keypoints.forEach(({position}) => {
                drawPoint(position,ctx);
            });

        }

        stats.end();

        requestAnimationFrame(poseDetectionFrame);
    }

    poseDetectionFrame();


}

// 与えられたKeypointをcanvasに描画する
function drawPoint(position,ctx){
    ctx.beginPath();
    ctx.arc(position.x , position.y, 10, 0, 2 * Math.PI);
    ctx.fillStyle = "pink";
    ctx.fill();
}

function isThisIsItOn(pose){
    var keypoints = pose.keypoints
    if(keypoints[5].position.y < keypoints[9].position.y && keypoints[6].position.y > keypoints[10].position.y){
        console.log("turn On")
        return true;
    }
    return false;
}

function isThisIsItOff(pose){
    var keypoints = pose.keypoints
    if(keypoints[5].position.y > keypoints[9].position.y && keypoints[6].position.y < keypoints[10].position.y){
        console.log("turn Off")
        return true;
    }
    return false;
}
});
document.head.appendChild(script);
