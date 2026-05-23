const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

const chordsConfig = [
    { name: 'C', xMin: 480, xMax: 580, yMin: 60, yMax: 140 },
    { name: 'D', xMin: 480, xMax: 580, yMin: 180, yMax: 260 },
    { name: 'G', xMin: 480, xMax: 580, yMin: 300, yMax: 380 }
];

const AppState = {
    leftHand: {
        hoveredChord: null,
        selectedChord: null,
        touchStartTime: 0
    },
    rightHand: {
        historyY: [],
        prevSmoothedY: null,
        lastStrumTime: 0
    },
    isStrummingFlash: false,
    smoothedHands: []
};

const SMOOTHING_FACTOR = 0.35;

function drawChordCards() {
    chordsConfig.forEach(chord => {
        const isSelected = AppState.leftHand.selectedChord === chord.name;
        const isHovered = AppState.leftHand.hoveredChord === chord.name;

        canvasCtx.save();
        canvasCtx.lineWidth = 3;

        if (isSelected) {
            canvasCtx.fillStyle = AppState.isStrummingFlash ? "rgba(255, 255, 255, 0.6)" : "rgba(16, 185, 129, 0.2)";
            canvasCtx.strokeStyle = AppState.isStrummingFlash ? "#ffffff" : "#10b981";
        } else if (isHovered) {
            canvasCtx.fillStyle = "rgba(56, 189, 248, 0.1)";
            canvasCtx.strokeStyle = "#38bdf8";
        } else {
            canvasCtx.fillStyle = "rgba(51, 65, 85, 0.3)";
            canvasCtx.strokeStyle = "#475569";
        }

        canvasCtx.fillRect(chord.xMin, chord.yMin, chord.xMax - chord.xMin, chord.yMax - chord.yMin);
        canvasCtx.strokeRect(chord.xMin, chord.yMin, chord.xMax - chord.xMin, chord.yMax - chord.yMin);

        canvasCtx.translate(chord.xMin + (chord.xMax - chord.xMin) / 2, chord.yMin + (chord.yMax - chord.yMin) / 2);
        canvasCtx.scale(-1, 1);
        canvasCtx.font = "bold 24px sans-serif";
        canvasCtx.fillStyle = isSelected ? (AppState.isStrummingFlash ? "#ffffff" : "#10b981") : (isHovered ? "#38bdf8" : "#94a3b8");
        canvasCtx.textAlign = "center";
        canvasCtx.textBaseline = "middle";
        canvasCtx.fillText(chord.name, 0, 0);

        canvasCtx.restore();
    });
}

function handleLeftHandChord(indexFingerLandmark) {
    const now = performance.now();
    const posX = indexFingerLandmark.x * canvasElement.width;
    const posY = indexFingerLandmark.y * canvasElement.height;

    const currentHit = chordsConfig.find(chord =>
        posX >= chord.xMin && posX <= chord.xMax &&
        posY >= chord.yMin && posY <= chord.yMax
    );

    if (currentHit) {
        if (AppState.leftHand.hoveredChord !== currentHit.name) {
            AppState.leftHand.hoveredChord = currentHit.name;
            AppState.leftHand.touchStartTime = now;
        } else {
            if (AppState.leftHand.selectedChord !== currentHit.name && (now - AppState.leftHand.touchStartTime) >= 180) {
                AppState.leftHand.selectedChord = currentHit.name;
                console.log(`%c🎵 HỢP ÂM [ ${currentHit.name} ] SẴN SÀNG!`, "color: #10b981; font-weight: bold;");
            }
        }
    } else {
        AppState.leftHand.hoveredChord = null;
        AppState.leftHand.selectedChord = null;
    }
}

let isStrummingActive = false;

function handleRightHandStrum(wristLandmark) {
    const now = performance.now();
    const rawY = wristLandmark.y * canvasElement.height;

    AppState.rightHand.historyY.push(rawY);
    if (AppState.rightHand.historyY.length > 3) {
        AppState.rightHand.historyY.shift();
    }

    const sumY = AppState.rightHand.historyY.reduce((sum, val) => sum + val, 0);
    const smoothedY = sumY / AppState.rightHand.historyY.length;

    if (AppState.rightHand.prevSmoothedY !== null) {
        const deltaY = smoothedY - AppState.rightHand.prevSmoothedY;

        if (deltaY > 22 && (now - AppState.rightHand.lastStrumTime) > 300) {
            if (!isStrummingActive) {
                if (AppState.leftHand.selectedChord) {
                    triggerPlaySound(AppState.leftHand.selectedChord, deltaY);
                } else {
                    console.log("⚠️ Tay phải gảy nhưng Tay Trái chưa chọn hợp âm nào!");
                }
                AppState.rightHand.lastStrumTime = now;
                isStrummingActive = true;
            }
        }
        if (deltaY < 1) {
            isStrummingActive = false;
        }
    }
    AppState.rightHand.prevSmoothedY = smoothedY;
}

function triggerPlaySound(chordName, velocity) {
    console.log(`%c🎸 [KÍCH HOẠT CHUẨN] Hợp âm: ${chordName} | Lực gảy: ${Math.round(velocity)}px`, "color: #fbbf24; font-weight: bold; font-size: 14px;");
    AppState.isStrummingFlash = true;
    setTimeout(() => {
        AppState.isStrummingFlash = false;
    }, 120);
}

function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    drawChordCards();

    let leftHandDetected = false;
    let rightHandDetected = false;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        if (!AppState.smoothedHands || AppState.smoothedHands.length !== results.multiHandLandmarks.length) {
            AppState.smoothedHands = results.multiHandLandmarks.map(hand =>
                hand.map(lm => ({ x: lm.x, y: lm.y, z: lm.z }))
            );
        }

        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const rawLandmarks = results.multiHandLandmarks[i];

            for (let j = 0; j < rawLandmarks.length; j++) {
                AppState.smoothedHands[i][j].x += SMOOTHING_FACTOR * (rawLandmarks[j].x - AppState.smoothedHands[i][j].x);
                AppState.smoothedHands[i][j].y += SMOOTHING_FACTOR * (rawLandmarks[j].y - AppState.smoothedHands[i][j].y);
            }

            const landmarks = AppState.smoothedHands[i];
            const wrist = landmarks[0];
            const wristPixelX = wrist.x * canvasElement.width;

            const rawLabel = results.multiHandedness[i].label;
            let realHandLabel = (rawLabel === 'Left') ? 'TAY PHẢI' : 'TAY TRÁI';

            if (wristPixelX > 320 && realHandLabel === 'TAY PHẢI') {
                realHandLabel = 'TAY TRÁI';
            }
            if (wristPixelX <= 320 && realHandLabel === 'TAY TRÁI') {
                realHandLabel = 'TAY PHẢI';
            }

            const handColor = (realHandLabel === 'TAY TRÁI') ? '#38bdf8' : '#fbbf24';

            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: handColor, lineWidth: 3 });
            drawLandmarks(canvasCtx, landmarks, { color: '#ffffff', lineWidth: 1, radius: 3 });

            if (realHandLabel === 'TAY TRÁI') {
                leftHandDetected = true;
                handleLeftHandChord(landmarks[8]);
            } else if (realHandLabel === 'TAY PHẢI') {
                rightHandDetected = true;
                handleRightHandStrum(landmarks[0]);
            }

            canvasCtx.save();
            canvasCtx.translate(wrist.x * canvasElement.width, wrist.y * canvasElement.height);
            canvasCtx.scale(-1, 1);
            canvasCtx.font = "bold 16px sans-serif";
            canvasCtx.fillStyle = handColor;
            canvasCtx.textAlign = "center";
            canvasCtx.fillText(realHandLabel, 0, 25);
            canvasCtx.restore();
        }
    } else {
        AppState.smoothedHands = [];
    }

    if (!leftHandDetected) {
        AppState.leftHand.hoveredChord = null;
        AppState.leftHand.selectedChord = null;
    }
    if (!rightHandDetected) {
        AppState.rightHand.prevSmoothedY = null;
    }

    canvasCtx.restore();
}

const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.55,
    minTrackingConfidence: 0.55
});

hands.onResults(onResults);

const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({ image: videoElement });
    },
    width: 640,
    height: 480
});

camera.start().catch(err => console.error(err));