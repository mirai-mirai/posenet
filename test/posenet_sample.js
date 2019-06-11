var head = document.getElementsByTagName("head");
var script = document.createElement("script");
script.setAttribute("src", "../jquery.min.js");
script.setAttribute("type", "text/javascript");
script.addEventListener("load", function () {


    const imageScaleFactor = 0.3;
    const outputStride = 16;
    const flipHorizontal = false;
    const contentWidth = 800;
    const contentHeight = 600;
    const scoreThreshold = 0.3;

    bindPage();

    async function bindPage() {
        const net = await posenet.load(); // posenetの呼び出し
        let video;
        try {
            video = await loadVideo(); // video属性をロード
        } catch (e) {
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
                'video': true
            });
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

    var keepPose = 0;
    var keptPose = 5;
    var arrMarkPos = [];
    var tmpMarkPos = [];
    var flgHandsUp = false;

    function detectPoseInRealTime(video, net) {
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        const flipHorizontal = true; // since images are being fed from a webcam
        var _isHandsUp = false;
        ctx.fillStyle = "red";
        var stillCount = 0;
        let oldPos = {
            x: 0,
            y: 0
        };

        /*
        poseの構成
        {keypoints:[
            {score:0.3,part:"leftEye",position:{x:100,y:100}},
            {score:0.3,part:"rightEyes",position:{x:100,y:100}},,,
        ],
         score:0.33}
        
        
        */
        async function poseDetectionFrame() {
            const pose = await net.estimateSinglePose(video, imageScaleFactor, flipHorizontal, outputStride);

            ctx.clearRect(0, 0, contentWidth, contentHeight);
            ctx.save();
            ctx.scale(-1, 1);
            ctx.translate(-contentWidth, 0);
            ctx.drawImage(video, 0, 0, contentWidth, contentHeight);
            ctx.restore();

            if (pose.score > scoreThreshold) {
                let txtScore = "score:" + Math.round(pose.score * 100) + "%";
                console.log(txtScore);
                $("#score").text(txtScore);
                var namePos = {};
                pose.keypoints.forEach(({
                    part,
                    position,
                    score
                }) => {
                    pos = "(" + Math.round(position.x) + "," + Math.round(position.y) + ")";
                    s = Math.round(score * 100) + "%";
                    $("#" + part).text(part + ":" + s + pos);
                    namePos[part] = position;
                });
                $("#json").text(JSON.stringify(pose));


                if (isHandsUp(namePos)) {
                    if (!flgHandsUp) {
                        flgHandsUp = true;
                        tmpMarkPos = [];
                        arrMarkPos = [];
                    }
                    let p = namePos['rightWrist'];
                    dist = calcDist(p, oldPos);
                    if (dist < 100) {
                        stillCount++;
                        if (stillCount > 5) {
                            arrMarkPos.push(p);
                            stillCount = 0;
                        }
                    } else {
                        stillCount = 0;
                    }
                    tmpMarkPos.push(p);
                    oldPos = p;
                    drawLines(arrMarkPos, ctx);
                } else {
                    flgHandsUp = false;
                }

                drawCircle(namePos['rightWrist'], (10 - stillCount) * 5, ctx);

            }
            requestAnimationFrame(poseDetectionFrame);
        }
        poseDetectionFrame();

    }

    // 2点の距離を計算する
    function calcDist(p1, p2) {
        dist = (p2.x - p1.x) * (p2.x - p1.x) + (p2.y - p1.y) * (p2.y - p1.y);
        return dist;
    }

    /*
        軌跡を四角と直掩で描く
        　positions:座標の配列
        　ctx:canvasオブジェクト
        */
    function drawLines(positions, ctx) {
        if (positions.length == 0) {
            return;
        }
        var p = positions[0];
        var ox = p.x;
        var oy = p.y;
        positions.forEach((p) => {
            drawRect(p, ctx);
            drawLine(ox, oy, p.x, p.y, ctx);
            ox = p.x;
            oy = p.y;
        });
    }

    /* 太さがランダムなデラックス直線を描画　*/
    function drawLine(x, y, x2, y2, ctx) {
        // 線の太さを乱数で指定
        const width = Math.floor(Math.random() * 20) + 10;

        // 透明で太い線の上に、不透明で細い線を上書きする
        for (var i = 0; i < width; i += 2) {
            ctx.lineWidth = width - i;
            ctx.strokeStyle = "rgba(0,0,255," + i / width / 4 + ")";
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
        // 最後に中心に細い線を描く
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(255,255,255,1)";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    /*
    複数の小さい四角を描く
    　positions:座標の配列
    　ctx:canvasオブジェクト
    */
    function drawRects(positions, ctx) {
        const r = 2;
        positions.forEach(p => {
            ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
        });
    }

    /*
    小さい四角を描く
    　p:座標 (p.x:x座標、p.y:y座標)
    　ctx:canvasオブジェクト
    */
    function drawRect(p, ctx) {
        const r = 10;
        ctx.fillStyle = "rgba(255,0,0,0.25)";
        ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    }

    function drawCircle(pos, r, ctx) {
        ctx.beginPath();
        ctx.strokeStyle = "rgba(255,0,0,0.5)";
        ctx.lineWidth = 4;
        ctx.arc(pos.x, pos.y, r, 0, 2 * 3.14);
        ctx.stroke();
    }

    function isHandsUp(namePos) {
        var noseY = namePos['nose'].y;
        var rightWristY = namePos['rightWrist'].y;
        return rightWristY < noseY ? true : false;
    }
});
document.head.appendChild(script);
