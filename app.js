const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// CẤU HÌNH CHO MÀN HÌNH 1280x720:
// Đẩy tọa độ X ra vùng từ 1080px đến 1220px (Sát rìa phải màn hình lớn)
// Tăng chiều cao mỗi ô lên 80px và kéo dài chiều rộng để dễ bấm trúng bằng ngón tay
const chordsConfig = [
    { name: 'C', xMin: 1080, xMax: 1220, yMin: 40, yMax: 120 },
    { name: 'D', xMin: 1080, xMax: 1220, yMin: 150, yMax: 230 },
    { name: 'G', xMin: 1080, xMax: 1220, yMin: 260, yMax: 340 },
    { name: 'Em', xMin: 1080, xMax: 1220, yMin: 370, yMax: 450 },
    { name: 'Am', xMin: 1080, xMax: 1220, yMin: 480, yMax: 560 },
    { name: 'F', xMin: 1080, xMax: 1220, yMin: 590, yMax: 670 }
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
        lastStrumTime: 0,
        lostFrameCount: 0
    },
    isStrummingFlash: false,
    smoothedHands: []
};

const SMOOTHING_LEFT = 0.35;
const SMOOTHING_RIGHT = 0.55;

// ==========================================
// AUDIO ENGINE: KHÔNG ĐỔI
// ==========================================
let audioCtx = null;
const chordFrequencies = {
    'C': [130.81, 164.81, 196.00, 261.63, 329.63],
    'D': [146.83, 220.00, 293.66, 369.99, 440.00],
    'G': [98.00, 123.47, 146.83, 196.00, 392.00],
    'Em': [82.41, 130.81, 164.81, 196.00, 329.63],
    'Am': [110.00, 146.83, 220.00, 261.63, 440.00],
    'F': [87.31, 130.81, 174.61, 261.63, 349.23]
};

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playGuitarChord(chordName, velocity) {
    initAudio();
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const freqs = chordFrequencies[chordName];
    if (!freqs) return;

    const volume = Math.min(Math.max(velocity / 60, 0.2), 0.85); // Tăng trần âm lượng một chút cho màn hình rộng
    const now = audioCtx.currentTime;

    freqs.forEach((freq, index) => {
        const strumDelay = index * 0.012;
        const time = now + strumDelay;

        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, time);

        gainNode.gain.setValueAtTime(0, time);
        gainNode.gain.linearRampToValueAtTime(volume, time + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, time + 1.1);

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc.start(time);
        osc.stop(time + 1.1);
    });
}

// ==========================================
// LOGIC HIỂN THỊ & XỬ LÝ KHUNG HÌNH LỚN
// ==========================================
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

        canvasCtx.beginPath();
        const radius = 8; // Tăng bo tròn cho hợp với ô to
        const x = chord.xMin;
        const y = chord.yMin;
        const width = chord.xMax - chord.xMin;
        const height = chord.yMax - chord.yMin;
        canvasCtx.roundRect(x, y, width, height, radius);
        canvasCtx.fill();
        canvasCtx.stroke();

        canvasCtx.translate(chord.xMin + width / 2, chord.yMin + height / 2);
        canvasCtx.scale(-1, 1);
        canvasCtx.font = "bold 24px sans-serif"; // Trả lại font size 24px vì ô bấm đã to lên
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
            if (AppState.leftHand.selectedChord !== currentHit.name && (now - AppState.leftHand.touchStartTime) >= 120) {
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

function handleRightHandStrum(handLandmarks) {
    const now = performance.now();
    const rawY = (handLandmarks[0].y + handLandmarks[5].y + handLandmarks[9].y + handLandmarks[17].y) / 4 * canvasElement.height;

    AppState.rightHand.historyY.push(rawY);
    if (AppState.rightHand.historyY.length > 3) {
        AppState.rightHand.historyY.shift();
    }

    const sumY = AppState.rightHand.historyY.reduce((sum, val) => sum + val, 0);
    const smoothedY = sumY / AppState.rightHand.historyY.length;

    if (AppState.rightHand.prevSmoothedY !== null) {
        const deltaY = smoothedY - AppState.rightHand.prevSmoothedY;

        // Trên màn hình to, quãng đường vung tay dài hơn -> tăng nhẹ ngưỡng kích hoạt lên 28px để chống gảy nhầm
        if (deltaY > 28 && (now - AppState.rightHand.lastStrumTime) > 250) {
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
    playGuitarChord(chordName, velocity);
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
        AppState.rightHand.lostFrameCount = 0;

        if (!AppState.smoothedHands || AppState.smoothedHands.length !== results.multiHandLandmarks.length) {
            AppState.smoothedHands = results.multiHandLandmarks.map(hand =>
                hand.map(lm => ({ x: lm.x, y: lm.y, z: lm.z }))
            );
        }

        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const rawLandmarks = results.multiHandLandmarks[i];
            const rawLabel = results.multiHandedness[i].label;
            let realHandLabel = (rawLabel === 'Left') ? 'TAY PHẢI' : 'TAY TRÁI';

            // BIÊN GIỚI CHỐNG LOẠN NHÃN MỚI: Đổi mốc phân đôi màn hình thành 640 (1280 / 2)
            const wristPixelX = rawLandmarks[0].x * canvasElement.width;
            if (wristPixelX > 640 && realHandLabel === 'TAY PHẢI') realHandLabel = 'TAY TRÁI';
            if (wristPixelX <= 640 && realHandLabel === 'TAY TRÁI') realHandLabel = 'TAY PHẢI';

            const currentFactor = (realHandLabel === 'TAY TRÁI') ? SMOOTHING_LEFT : SMOOTHING_RIGHT;

            for (let j = 0; j < rawLandmarks.length; j++) {
                AppState.smoothedHands[i][j].x += currentFactor * (rawLandmarks[j].x - AppState.smoothedHands[i][j].x);
                AppState.smoothedHands[i][j].y += currentFactor * (rawLandmarks[j].y - AppState.smoothedHands[i][j].y);
            }

            const landmarks = AppState.smoothedHands[i];
            const handColor = (realHandLabel === 'TAY TRÁI') ? '#38bdf8' : '#fbbf24';

            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: handColor, lineWidth: 3.5 });
            drawLandmarks(canvasCtx, landmarks, { color: '#ffffff', lineWidth: 1, radius: 3.5 });

            if (realHandLabel === 'TAY TRÁI') {
                leftHandDetected = true;
                handleLeftHandChord(landmarks[8]);
            } else if (realHandLabel === 'TAY PHẢI') {
                rightHandDetected = true;
                handleRightHandStrum(landmarks);
            }

            canvasCtx.save();
            canvasCtx.translate(landmarks[0].x * canvasElement.width, landmarks[0].y * canvasElement.height);
            canvasCtx.scale(-1, 1);
            canvasCtx.font = "bold 16px sans-serif";
            canvasCtx.fillStyle = handColor;
            canvasCtx.textAlign = "center";
            canvasCtx.fillText(realHandLabel, 0, 25);
            canvasCtx.restore();
        }
    }

    if (!leftHandDetected) {
        AppState.leftHand.hoveredChord = null;
        AppState.leftHand.selectedChord = null;
    }

    if (!rightHandDetected) {
        AppState.rightHand.lostFrameCount++;
        if (AppState.rightHand.lostFrameCount > 8) {
            AppState.rightHand.prevSmoothedY = null;
            AppState.rightHand.historyY = [];
            AppState.smoothedHands = [];
        }
    }

    canvasCtx.restore();
}

const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.45,
    minTrackingConfidence: 0.50
});

hands.onResults(onResults);

// CẬP NHẬT CAMERA: Chuyển luồng bắt hình ảnh của Webcam lên HD 1280x720
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await hands.send({ image: videoElement });
    },
    width: 1280,
    height: 720
});

window.addEventListener('click', () => {
    initAudio();
});

camera.start().catch(err => console.error(err));