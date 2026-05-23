const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// CẤU HÌNH MÀN HÌNH HD 1280x720:
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

// ĐIỀU CHỈNH LỌC MƯỢT: Khóa chặt và bám dính khung xương khi di chuyển
const SMOOTHING_LEFT = 0.40;
const SMOOTHING_RIGHT = 0.70;

// ==========================================
// AUDIO ENGINE: GUITAR NYLON SIÊU ẤM - SUSTAIN 7 GIÂY
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

    // Giới hạn nhẹ đỉnh âm lượng để giữ chất mộc ấm, không bị vỡ/gắt tiếng
    const baseVolume = Math.min(Math.max(velocity / 65, 0.35), 0.65);
    const now = audioCtx.currentTime;

    freqs.forEach((fundamentalFreq, stringIndex) => {
        const strumDelay = stringIndex * 0.025; // Rải dây mượt mà, tự nhiên
        const startTime = now + strumDelay;

        // ĐẨY SUSTAIN LÊN ĐÚNG 7.0 GIÂY
        const sustainTime = 7.0;

        const noteGain = audioCtx.createGain();
        noteGain.gain.setValueAtTime(0, startTime);
        noteGain.gain.linearRampToValueAtTime(baseVolume, startTime + 0.025); // Tạo lực búng ngón tay mượt mà hơn

        // Vuốt đuôi âm thanh nhỏ dần theo hàm Logarit cực mịn trong suốt 7 giây
        noteGain.gain.exponentialRampToValueAtTime(0.000001, startTime + sustainTime);

        // 🎻 MIX ĐA TẦNG SÓNG TỐI ƯU ĐỘ ẤM:
        // Tăng tỷ lệ sóng SIN tròn nốt lên 75%, giảm bớt họa âm cao chói
        createOscillator(fundamentalFreq, 'sine', 0.75, startTime, sustainTime, noteGain);
        createOscillator(fundamentalFreq * 2, 'triangle', 0.20, startTime, sustainTime, noteGain);
        createOscillator(fundamentalFreq * 3, 'sine', 0.05, startTime, sustainTime, noteGain);

        // 🎛️ BỘ LỌC TẦN SỐ TRẦM ẤM SÂU (Cắt hoàn toàn dải treble chói)
        const filterNode = audioCtx.createBiquadFilter();
        filterNode.type = 'lowpass';
        // Hạ tần số bắt đầu xuống 550Hz để tiếng đàn cực kỳ ấm áp và dầy dặn
        filterNode.frequency.setValueAtTime(550, startTime);
        // Đuôi âm thanh lịm dần về dải bass sâu 120Hz
        filterNode.frequency.exponentialRampToValueAtTime(120, startTime + sustainTime);

        noteGain.connect(filterNode);
        filterNode.connect(audioCtx.destination);
    });
}

function createOscillator(freq, type, volumeRatio, startTime, duration, destinationGain) {
    const osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    oscGain.gain.setValueAtTime(volumeRatio, startTime);
    osc.connect(oscGain);
    oscGain.connect(destinationGain);
    osc.start(startTime);
    osc.stop(startTime + duration);
}

// ==========================================
// LOGIC HIỂN THỊ & XỬ LÝ KHUNG HÌNH (GIỮ NGUYÊN BẢN CHỐNG MẤT TAY)
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
        const radius = 8;
        const x = chord.xMin;
        const y = chord.yMin;
        const width = chord.xMax - chord.xMin;
        const height = chord.yMax - chord.yMin;
        canvasCtx.roundRect(x, y, width, height, radius);
        canvasCtx.fill();
        canvasCtx.stroke();

        canvasCtx.translate(chord.xMin + width / 2, chord.yMin + height / 2);
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

    const rawY = (
        handLandmarks[0].y +
        handLandmarks[5].y +
        handLandmarks[9].y +
        handLandmarks[13].y +
        handLandmarks[17].y
    ) / 5 * canvasElement.width;

    AppState.rightHand.historyY.push(rawY);
    if (AppState.rightHand.historyY.length > 4) {
        AppState.rightHand.historyY.shift();
    }

    const sumY = AppState.rightHand.historyY.reduce((sum, val) => sum + val, 0);
    const smoothedY = sumY / AppState.rightHand.historyY.length;

    if (AppState.rightHand.prevSmoothedY !== null) {
        const deltaY = smoothedY - AppState.rightHand.prevSmoothedY;

        if (deltaY > 24 && (now - AppState.rightHand.lastStrumTime) > 220) {
            if (!isStrummingActive) {
                if (AppState.leftHand.selectedChord) {
                    triggerPlaySound(AppState.leftHand.selectedChord, deltaY);
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
        if (AppState.rightHand.lostFrameCount <= 20 && AppState.smoothedHands.length > 0) {
            rightHandDetected = true;
            const fallbackHandIndex = AppState.smoothedHands.length - 1;
            handleRightHandStrum(AppState.smoothedHands[fallbackHandIndex]);
        } else if (AppState.rightHand.lostFrameCount > 20) {
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
    minDetectionConfidence: 0.35,
    minTrackingConfidence: 0.40
});

hands.onResults(onResults);

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