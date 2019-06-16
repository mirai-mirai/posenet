/**
 * @license
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */


const videoWidth = 1280;
const videoHeight = 960;
const stats = new Stats();
var imgFace;
var imgBody;
var imgArmL;
var imgArmR;


/**
 * Loads a the camera to be used in the demo
 *
 */
async function setupCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
            'Browser API navigator.mediaDevices.getUserMedia not available');
    }

    const video = document.getElementById('video');
    video.width = videoWidth;
    video.height = videoHeight;

    const mobile = isMobile();
    const stream = await navigator.mediaDevices.getUserMedia({
        'audio': false,
        'video': {
            facingMode: 'user',
            width: mobile ? undefined : videoWidth,
            height: mobile ? undefined : videoHeight,
        },
    });
    video.srcObject = stream;

    return new Promise((resolve) => {
        video.onloadedmetadata = () => {
            resolve(video);
        };
    });
}

async function loadVideo() {
    const video = await setupCamera();
    video.play();

    return video;
}

const defaultQuantBytes = 2;

const defaultMobileNetMultiplier = isMobile() ? 0.50 : 0.75;
const defaultMobileNetStride = 16;
const defaultMobileNetInputResolution = 353;

const defaultResNetMultiplier = 1.0;
const defaultResNetStride = 32;
const defaultResNetInputResolution = 257;

const guiState = {
    algorithm: 'multi-pose',
    input: {
        architecture: 'MobileNetV1',
        outputStride: defaultMobileNetStride,
        inputResolution: defaultMobileNetInputResolution,
        multiplier: defaultMobileNetMultiplier,
        quantBytes: defaultQuantBytes
    },
    singlePoseDetection: {
        minPoseConfidence: 0.1,
        minPartConfidence: 0.3,
    },
    multiPoseDetection: {
        maxPoseDetections: 5,
        minPoseConfidence: 0.15,
        minPartConfidence: 0.3,
        nmsRadius: 30.0,
    },
    output: {
        showVideo: true,
        showSkeleton: true,
        showPoints: true,
        showBoundingBox: false,
        showFace: true,
        faceType: 'face1.png',
    },
    net: null,
};

/**
 * Sets up dat.gui controller on the top-right of the window
 */
function setupGui(cameras, net) {
    guiState.net = net;

    if (cameras.length > 0) {
        guiState.camera = cameras[0].deviceId;
    }

    const gui = new dat.GUI({
        width: 300
    });

    let architectureController = null;


    // The single-pose algorithm is faster and simpler but requires only one
    // person to be in the frame or results will be innaccurate. Multi-pose works
    // for more than 1 person
    const algorithmController =
        gui.add(guiState, 'algorithm', ['single-pose', 'multi-pose']);

    // The input parameters have the most effect on accuracy and speed of the
    // network
    let input = gui.addFolder('Input');
    // Architecture: there are a few PoseNet models varying in size and
    // accuracy. 1.01 is the largest, but will be the slowest. 0.50 is the
    // fastest, but least accurate.
    architectureController =
        input.add(guiState.input, 'architecture', ['MobileNetV1', 'ResNet50']);
    guiState.architecture = guiState.input.architecture;
    // Input resolution:  Internally, this parameter affects the height and width
    // of the layers in the neural network. The higher the value of the input
    // resolution the better the accuracy but slower the speed.
    let inputResolutionController = null;

    function updateGuiInputResolution(
        inputResolution,
        inputResolutionArray,
    ) {
        if (inputResolutionController) {
            inputResolutionController.remove();
        }
        guiState.inputResolution = inputResolution;
        guiState.input.inputResolution = inputResolution;
        inputResolutionController =
            input.add(guiState.input, 'inputResolution', inputResolutionArray);
        inputResolutionController.onChange(function (inputResolution) {
            guiState.changeToInputResolution = inputResolution;
        });
    }

    // Output stride:  Internally, this parameter affects the height and width of
    // the layers in the neural network. The lower the value of the output stride
    // the higher the accuracy but slower the speed, the higher the value the
    // faster the speed but lower the accuracy.
    let outputStrideController = null;

    function updateGuiOutputStride(outputStride, outputStrideArray) {
        if (outputStrideController) {
            outputStrideController.remove();
        }
        guiState.outputStride = outputStride;
        guiState.input.outputStride = outputStride;
        outputStrideController =
            input.add(guiState.input, 'outputStride', outputStrideArray);
        outputStrideController.onChange(function (outputStride) {
            guiState.changeToOutputStride = outputStride;
        });
    }

    // Multiplier: this parameter affects the number of feature map channels in
    // the MobileNet. The higher the value, the higher the accuracy but slower the
    // speed, the lower the value the faster the speed but lower the accuracy.
    let multiplierController = null;

    function updateGuiMultiplier(multiplier, multiplierArray) {
        if (multiplierController) {
            multiplierController.remove();
        }
        guiState.multiplier = multiplier;
        guiState.input.multiplier = multiplier;
        multiplierController =
            input.add(guiState.input, 'multiplier', multiplierArray);
        multiplierController.onChange(function (multiplier) {
            guiState.changeToMultiplier = multiplier;
        });
    }

    // QuantBytes: this parameter affects weight quantization in the ResNet50
    // model. The available options are 1 byte, 2 bytes, and 4 bytes. The higher
    // the value, the larger the model size and thus the longer the loading time,
    // the lower the value, the shorter the loading time but lower the accuracy.
    let quantBytesController = null;

    function updateGuiQuantBytes(quantBytes, quantBytesArray) {
        if (quantBytesController) {
            quantBytesController.remove();
        }
        guiState.quantBytes = +quantBytes;
        guiState.input.quantBytes = +quantBytes;
        quantBytesController =
            input.add(guiState.input, 'quantBytes', quantBytesArray);
        quantBytesController.onChange(function (quantBytes) {
            guiState.changeToQuantBytes = +quantBytes;
        });
    }

    function updateGui() {
        if (guiState.input.architecture === 'MobileNetV1') {
            updateGuiInputResolution(
                defaultMobileNetInputResolution, [257, 353, 449, 513, 801]);
            updateGuiOutputStride(defaultMobileNetStride, [8, 16]);
            updateGuiMultiplier(defaultMobileNetMultiplier, [0.50, 0.75, 1.0])
        } else { // guiState.input.architecture === "ResNet50"
            updateGuiInputResolution(
                defaultResNetInputResolution, [257, 353, 449, 513, 801]);
            updateGuiOutputStride(defaultResNetStride, [32, 16]);
            updateGuiMultiplier(defaultResNetMultiplier, [1.0]);
        }
        updateGuiQuantBytes(defaultQuantBytes, [1, 2, 4]);
    }

    updateGui();
    input.open();
    // Pose confidence: the overall confidence in the estimation of a person's
    // pose (i.e. a person detected in a frame)
    // Min part confidence: the confidence that a particular estimated keypoint
    // position is accurate (i.e. the elbow's position)
    let single = gui.addFolder('Single Pose Detection');
    single.add(guiState.singlePoseDetection, 'minPoseConfidence', 0.0, 1.0);
    single.add(guiState.singlePoseDetection, 'minPartConfidence', 0.0, 1.0);

    let multi = gui.addFolder('Multi Pose Detection');
    multi.add(guiState.multiPoseDetection, 'maxPoseDetections')
        .min(1)
        .max(20)
        .step(1);
    multi.add(guiState.multiPoseDetection, 'minPoseConfidence', 0.0, 1.0);
    multi.add(guiState.multiPoseDetection, 'minPartConfidence', 0.0, 1.0);
    // nms Radius: controls the minimum distance between poses that are returned
    // defaults to 20, which is probably fine for most use cases
    multi.add(guiState.multiPoseDetection, 'nmsRadius').min(0.0).max(40.0);
    multi.open();

    let output = gui.addFolder('Output');
    output.add(guiState.output, 'showVideo');
    output.add(guiState.output, 'showSkeleton');
    output.add(guiState.output, 'showPoints');
    output.add(guiState.output, 'showBoundingBox');
    output.add(guiState.output, 'showFace');
    const faceTypeController =
        output.add(guiState.output, 'faceType', ['face1.png', 'face2.png', 'face3.png']);
    output.open();

    faceTypeController.onChange(faceType => {
        const faceElement = document.getElementById(faceType);
        imgFace = faceElement;
    })

    architectureController.onChange(function (architecture) {
        // if architecture is ResNet50, then show ResNet50 options
        updateGui();
        guiState.changeToArchitecture = architecture;
    });

    algorithmController.onChange(function (value) {
        switch (guiState.algorithm) {
            case 'single-pose':
                multi.close();
                single.open();
                break;
            case 'multi-pose':
                single.close();
                multi.open();
                break;
        }
    });
}

/**
 * Sets up a frames per second panel on the top-left of the window
 */
function setupFPS() {
    stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
    document.getElementById('main').appendChild(stats.dom);
}

/**
 * Feeds an image to posenet to estimate poses - this is where the magic
 * happens. This function loops with a requestAnimationFrame method.
 */
function detectPoseInRealTime(video, net) {
    const canvas = document.getElementById('output');
    const ctx = canvas.getContext('2d');
    imgFace = document.getElementById("face1.png");
    imgBody = document.getElementById("body1.png");
    imgArmL = document.getElementById("armL1.png");
    imgArmR = document.getElementById("armR1.png");


    // since images are being fed from a webcam, we want to feed in the
    // original image and then just flip the keypoints' x coordinates. If instead
    // we flip the image, then correcting left-right keypoint pairs requires a
    // permutation on all the keypoints.
    const flipPoseHorizontal = true;

    canvas.width = videoWidth;
    canvas.height = videoHeight;

    async function poseDetectionFrame() {
        if (guiState.changeToArchitecture) {
            // Important to purge variables and free up GPU memory
            guiState.net.dispose();
            toggleLoadingUI(true);
            guiState.net = await posenet.load({
                architecture: guiState.changeToArchitecture,
                outputStride: guiState.outputStride,
                inputResolution: guiState.inputResolution,
                multiplier: guiState.multiplier,
            });
            toggleLoadingUI(false);
            guiState.architecture = guiState.changeToArchitecture;
            guiState.changeToArchitecture = null;
        }

        if (guiState.changeToMultiplier) {
            guiState.net.dispose();
            toggleLoadingUI(true);
            guiState.net = await posenet.load({
                architecture: guiState.architecture,
                outputStride: guiState.outputStride,
                inputResolution: guiState.inputResolution,
                multiplier: +guiState.changeToMultiplier,
                quantBytes: guiState.quantBytes
            });
            toggleLoadingUI(false);
            guiState.multiplier = +guiState.changeToMultiplier;
            guiState.changeToMultiplier = null;
        }

        if (guiState.changeToOutputStride) {
            // Important to purge variables and free up GPU memory
            guiState.net.dispose();
            toggleLoadingUI(true);
            guiState.net = await posenet.load({
                architecture: guiState.architecture,
                outputStride: +guiState.changeToOutputStride,
                inputResolution: guiState.inputResolution,
                multiplier: guiState.multiplier,
                quantBytes: guiState.quantBytes
            });
            toggleLoadingUI(false);
            guiState.outputStride = +guiState.changeToOutputStride;
            guiState.changeToOutputStride = null;
        }

        if (guiState.changeToInputResolution) {
            // Important to purge variables and free up GPU memory
            guiState.net.dispose();
            toggleLoadingUI(true);
            guiState.net = await posenet.load({
                architecture: guiState.architecture,
                outputStride: guiState.outputStride,
                inputResolution: +guiState.changeToInputResolution,
                multiplier: guiState.multiplier,
                quantBytes: guiState.quantBytes
            });
            toggleLoadingUI(false);
            guiState.inputResolution = +guiState.changeToInputResolution;
            guiState.changeToInputResolution = null;
        }

        if (guiState.changeToQuantBytes) {
            // Important to purge variables and free up GPU memory
            guiState.net.dispose();
            toggleLoadingUI(true);
            guiState.net = await posenet.load({
                architecture: guiState.architecture,
                outputStride: guiState.outputStride,
                inputResolution: guiState.inputResolution,
                multiplier: guiState.multiplier,
                quantBytes: guiState.changeToQuantBytes
            });
            toggleLoadingUI(false);
            guiState.quantBytes = guiState.changeToQuantBytes;
            guiState.changeToQuantBytes = null;
        }

        // Begin monitoring code for frames per second
        stats.begin();

        let poses = [];
        let minPoseConfidence;
        let minPartConfidence;
        switch (guiState.algorithm) {
            case 'single-pose':
                const pose = await guiState.net.estimatePoses(video, {
                    flipHorizontal: flipPoseHorizontal,
                    decodingMethod: 'single-person'
                });
                poses = poses.concat(pose);
                minPoseConfidence = +guiState.singlePoseDetection.minPoseConfidence;
                minPartConfidence = +guiState.singlePoseDetection.minPartConfidence;
                break;
            case 'multi-pose':
                let all_poses = await guiState.net.estimatePoses(video, {
                    flipHorizontal: flipPoseHorizontal,
                    decodingMethod: 'multi-person',
                    maxDetections: guiState.multiPoseDetection.maxPoseDetections,
                    scoreThreshold: guiState.multiPoseDetection.minPartConfidence,
                    nmsRadius: guiState.multiPoseDetection.nmsRadius
                });

                poses = poses.concat(all_poses);
                minPoseConfidence = +guiState.multiPoseDetection.minPoseConfidence;
                minPartConfidence = +guiState.multiPoseDetection.minPartConfidence;
                break;
        }

        ctx.clearRect(0, 0, videoWidth, videoHeight);

        if (guiState.output.showVideo) {

            ctx.save();
            ctx.scale(-1, 1);
            ctx.translate(-videoWidth, 0);
            ctx.drawImage(video, 0, 0, videoWidth, videoHeight);
            ctx.restore();

        }

        // For each pose (i.e. person) detected in an image, loop through the poses
        // and draw the resulting skeleton and keypoints if over certain confidence
        // scores
        poses.forEach(({
            score,
            keypoints
        }) => {
            if (score >= minPoseConfidence) {
                if (guiState.output.showPoints) {
                    drawKeypoints(keypoints, minPartConfidence, ctx);
                }
                if (guiState.output.showSkeleton) {
                    drawSkeleton(keypoints, minPartConfidence, ctx);
                }
                if (guiState.output.showBoundingBox) {
                    drawBoundingBox(keypoints, ctx);
                }
            }


            /* 両肩のスコアが高いかチェック　*/
            let isOK = true;
            for (let i = 5; i < 7; i++) {
                isOK = keypoints[i].score > minPartConfidence ? isOK : false;
            }


            if (isOK && guiState.output.showFace) {
                leftShoulder = keypoints[5].position;
                rightShoulder = keypoints[6].position;

                cx = Math.round((leftShoulder.x + rightShoulder.x) / 2);
                cy = Math.round((leftShoulder.y + rightShoulder.y) / 2);

                let vx = rightShoulder.x - leftShoulder.x;
                let vy = rightShoulder.y - leftShoulder.y;
                let vSize = Math.sqrt(vx * vx + vy * vy)
                let rotate = Math.acos(vx / vSize);
                rotate = vy > 0 ? rotate : -rotate;

                let imgWidth = vSize * 1.5;
                let imgHeight = vSize * 2;
                ctx.save();
                ctx.translate(cx * 0.9, cy);
                ctx.rotate(rotate);
                ctx.translate(-imgWidth / 2, -imgHeight / 5);
                ctx.drawImage(imgBody, 0, 0, imgWidth, imgHeight);
                ctx.restore();
            }

            /* 鼻と両目のスコアが高いかチェック */
            let isScoreOK = true;
            for (let i = 0; i < 3; i++) {
                partScore = keypoints[i].score;
                if (partScore < minPartConfidence) {
                    isScoreOK = false;
                }
            }
            if (isScoreOK && guiState.output.showFace) {
                nosePos = keypoints[0].position;
                leftEyePos = keypoints[1].position;
                rightEyePos = keypoints[2].position;

                let vx = rightEyePos.x - leftEyePos.x;
                let vy = rightEyePos.y - leftEyePos.y;
                let vSize = Math.sqrt(vx * vx + vy * vy)
                let rotate = Math.acos(vx / vSize);
                rotate = vy > 0 ? rotate : -rotate;

                let imgWidth = vSize * 4.5;
                let imgHeight = vSize * 4.5;
                ctx.save();
                ctx.translate(nosePos.x, nosePos.y);
                ctx.rotate(rotate);
                ctx.translate(-imgWidth / 2, -imgHeight / 2);
                ctx.drawImage(imgFace, 0, 0, imgWidth, imgHeight);
                ctx.restore();
            }

            /* 右手のスコアが高いかチェック　*/
            partID1 = 9; //leftShoulder
            partID2 = 5; //leftWrist
            let imgParts = imgArmL;
            let imgW = imgParts.width;
            let imgH = imgParts.height;

            s1 = keypoints[partID1].score;
            s2 = keypoints[partID2].score;

            isScoreOK = s1 > minPartConfidence ? true : false;
            isScoreOK = s2 > minPartConfidence ? isScoreOK : false;

            if (isScoreOK && guiState.output.showFace) {
                p1 = keypoints[partID1].position;
                p2 = keypoints[partID2].position;

                let vx = p1.x - p2.x;
                let vy = p1.y - p2.y;
                let vSize = Math.sqrt(vx * vx + vy * vy)
                let rotate = Math.acos(vx / vSize);
                rotate = vy > 0 ? rotate : -rotate;
                rotate -= Math.PI / 180 * 120;

                let imgWidth = imgW * vSize / 100;
                let imgHeight = imgH * vSize / 100;

                ctx.save();
                ctx.translate(p2.x * 1.01, p2.y * 0.9);
                ctx.rotate(rotate);
                ctx.translate(-imgWidth, 0);
                ctx.drawImage(imgParts, 0, 0, imgWidth, imgHeight);
                ctx.restore();
            }

        });

        // End monitoring code for frames per second
        stats.end();

        requestAnimationFrame(poseDetectionFrame);
    }

    poseDetectionFrame();
}

/**
 * Kicks off the demo by loading the posenet model, finding and loading
 * available camera devices, and setting off the detectPoseInRealTime function.
 */
async function bindPage() {
    toggleLoadingUI(true);
    const net = await posenet.load({
        architecture: guiState.input.architecture,
        outputStride: guiState.input.outputStride,
        inputResolution: guiState.input.inputResolution,
        multiplier: guiState.input.multiplier,
        quantBytes: guiState.input.quantBytes
    });
    toggleLoadingUI(false);

    let video;

    try {
        video = await loadVideo();
    } catch (e) {
        let info = document.getElementById('info');
        info.textContent = 'this browser does not support video capture,' +
            'or this device does not have a camera';
        info.style.display = 'block';
        throw e;
    }

    setupGui([], net);
    setupFPS();
    detectPoseInRealTime(video, net);
}

navigator.getUserMedia = navigator.getUserMedia ||
    navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
// kick off the demo
bindPage();
