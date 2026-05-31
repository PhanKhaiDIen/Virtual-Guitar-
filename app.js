const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const W = canvasElement.width;   // 1280
const H = canvasElement.height;  // 720

// 1. CẤU HÌNH VÙNG CHỌN HỢP ÂM TAY TRÁI (Bên Phải Màn Hình)
const chordsConfig = [
    { name: 'C',  xMin: W*0.84, xMax: W*0.95, yMin: H*0.06, yMax: H*0.17 },
    { name: 'D',  xMin: W*0.84, xMax: W*0.95, yMin: H*0.21, yMax: H*0.32 },
    { name: 'G',  xMin: W*0.84, xMax: W*0.95, yMin: H*0.36, yMax: H*0.47 },
    { name: 'Em', xMin: W*0.84, xMax: W*0.95, yMin: H*0.51, yMax: H*0.62 },
    { name: 'Am', xMin: W*0.84, xMax: W*0.95, yMin: H*0.67, yMax: H*0.78 },
    { name: 'F',  xMin: W*0.84, xMax: W*0.95, yMin: H*0.82, yMax: H*0.93 },
];

// 2. CẤU HÌNH MỚI: 6 Ô BẤM XẾP THEO HÀNG NGANG CHỐNG TRƯỢT TAY
// Toàn bộ các ô có cùng chiều cao (Y: 150px đến 400px), xếp rộng từ X: 40px đến 580px
// Thứ tự từ trái sang phải: Dây 6 (Trầm nhất) -> Dây 1 (Cao nhất) để thuận tay gảy xuôi
const stringStartX = W * 0.55;
const stringEndX   = W * 0.95;
const stringWidth  = (stringEndX - stringStartX) / 6;

const stringsConfig = [
    { index: 5, label: 'Dây 6 (E)', xMin: stringStartX + stringWidth*0, xMax: stringStartX + stringWidth*1, yMin: H*0.21, yMax: H*0.56 },
    { index: 4, label: 'Dây 5 (A)', xMin: stringStartX + stringWidth*1, xMax: stringStartX + stringWidth*2, yMin: H*0.21, yMax: H*0.56 },
    { index: 3, label: 'Dây 4 (D)', xMin: stringStartX + stringWidth*2, xMax: stringStartX + stringWidth*3, yMin: H*0.21, yMax: H*0.56 },
    { index: 2, label: 'Dây 3 (G)', xMin: stringStartX + stringWidth*3, xMax: stringStartX + stringWidth*4, yMin: H*0.21, yMax: H*0.56 },
    { index: 1, label: 'Dây 2 (B)', xMin: stringStartX + stringWidth*4, xMax: stringStartX + stringWidth*5, yMin: H*0.21, yMax: H*0.56 },
    { index: 0, label: 'Dây 1 (E)', xMin: stringStartX + stringWidth*5, xMax: stringStartX + stringWidth*6, yMin: H*0.21, yMax: H*0.56 },
];

// Căn chỉnh lại chính xác tọa độ X cho các ô xếp hàng ngang không bị lệch
stringsConfig[0] = { index: 5, label: 'Dây 6 (E)', xMin: 50, xMax: 130, yMin: 150, yMax: 400 };
stringsConfig[1] = { index: 4, label: 'Dây 5 (A)', xMin: 140, xMax: 220, yMin: 150, yMax: 400 };
stringsConfig[2] = { index: 3, label: 'Dây 4 (D)', xMin: 230, xMax: 310, yMin: 150, yMax: 400 };
stringsConfig[3] = { index: 2, label: 'Dây 3 (G)', xMin: 320, xMax: 400, yMin: 150, yMax: 400 };
stringsConfig[4] = { index: 1, label: 'Dây 2 (B)', xMin: 410, xMax: 490, yMin: 150, yMax: 400 };
stringsConfig[5] = { index: 0, label: 'Dây 1 (E)', xMin: 500, xMax: 580, yMin: 150, yMax: 400 };

const AppState = {
    leftHand: { hoveredChord: null, selectedChord: null, touchStartTime: 0 },
    isStrummingFlash: false, smoothedHands: [],
    rightHand: { 
    activeStringIndex: null, 
    lostFrameCount: 0, 
    lastTriggerTimes: [0,0,0,0,0,0], 
    prevX: null,
    prevY: null  // ← thêm
}
};

const SMOOTHING_LEFT = 0.40; const SMOOTHING_RIGHT = 0.70;

// ==========================================
// AUDIO ENGINE: MÔ PHỎNG GUITAR CLASSIC CHUYÊN SÂU (GIỮ NGUYÊN)
// ==========================================
let audioCtx = null;
const chordStringsFrequencies = {
    'C': [329.63, 261.63, 196.00, 146.83, 130.81, 82.41],
    'D': [440.00, 369.99, 293.66, 220.00, 146.83, 98.00],
    'G': [392.00, 196.00, 146.83, 123.47, 98.00, 98.00],
    'Em': [329.63, 196.00, 164.81, 130.81, 82.41, 82.41],
    'Am': [440.00, 261.63, 220.00, 146.83, 110.00, 82.41],
    'F': [349.23, 261.63, 174.61, 130.81, 87.31, 87.31]
};

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playSingleString(chordName, stringIndex) {
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const chordFreqs = chordStringsFrequencies[chordName];
    if (!chordFreqs) return;

    const freq = chordFreqs[stringIndex];
    if (freq === 0 || !freq) return;

    const now = audioCtx.currentTime;

    // ==========================================
    // CẤU HÌNH THỜI GIAN NGÂN THEO ĐẶC TÍNH VẬT LÝ DÂY
    // ==========================================
    let sustainTime = 5.0; // Mặc định dây treble ngân tầm 5 giây
    let decayConstant = 0.25; // Tốc độ giảm âm lượng ban đầu (càng nhỏ càng tắt nhanh)

    if (stringIndex === 5) {         // Dây 6 (Bass trầm nhất): Ngân cực lâu
        sustainTime = 12.0;
        decayConstant = 0.60;
    } else if (stringIndex === 4) {  // Dây 5 (Bass): Ngân lâu
        sustainTime = 10.0;
        decayConstant = 0.50;
    } else if (stringIndex === 3) {  // Dây 4 (Bass): Ngân vừa dài
        sustainTime = 8.5;
        decayConstant = 0.40;
    }

    // Tự động điều chỉnh âm lượng gốc để bù trừ năng lượng loa
    const isDay6 = (stringIndex === 5);
    const baseVolume = isDay6 ? 0.55 : 0.45;

    const noteGain = audioCtx.createGain();
    noteGain.gain.setValueAtTime(0, now);

    // Kích hoạt tiếng búng ngón tay (Attack)
    noteGain.gain.linearRampToValueAtTime(baseVolume, now + 0.008);

    // Giai đoạn lịm dần (Decay) áp dụng hằng số thời gian riêng cho từng dây
    noteGain.gain.exponentialRampToValueAtTime(baseVolume * decayConstant, now + 0.3);
    // Xuống đáy âm thanh dựa trên tổng thời gian ngân sustainTime riêng biệt
    noteGain.gain.exponentialRampToValueAtTime(0.000001, now + sustainTime);

    // MIX HỌA ÂM TỐI ƯU (Giữ nguyên phần kích âm dây 6 bạn đã ưng ý)
    if (isDay6) {
        createOscillator(freq, 'sine', 0.85, now, sustainTime, noteGain);
        createOscillator(freq * 2, 'triangle', 0.20, now, sustainTime * 0.8, noteGain);
        createOscillator(freq * 3, 'sine', 0.05, now, sustainTime * 0.5, noteGain);
    } else {
        // Dây 5, 4, 3, 2, 1
        createOscillator(freq, 'sine', 0.85, now, sustainTime, noteGain);
        createOscillator(freq * 2, 'triangle', 0.12, now, sustainTime * 0.6, noteGain);
        createOscillator(freq * 3, 'sine', 0.03, now, sustainTime * 0.3, noteGain);
    }

    // MÔ PHỎNG BỘ LỌC THÙNG GỖ CỘNG HƯƯỞNG BIQUAD
    const filterNode = audioCtx.createBiquadFilter();
    filterNode.type = 'lowpass';

    const filterFreq = isDay6 ? 650 : 450;
    filterNode.frequency.setValueAtTime(filterFreq, now);
    // Cho phép bộ lọc giữ dải trầm ngân dài luồn lách theo thời gian sustain mới
    filterNode.frequency.exponentialRampToValueAtTime(110, now + sustainTime);

    noteGain.connect(filterNode);
    filterNode.connect(audioCtx.destination);
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
// LOGIC ĐỒ HỌA MỚI: Ô BẤM DỌC XẾP THEO HÀNG NGANG (MÀU XANH NEON)
// ==========================================
function drawGuitarStrings() {
    const fretboardX = stringsConfig[0].xMin - 14;
    const fretboardY = H * 0.18;
    const fretboardW = stringsConfig[5].xMax - stringsConfig[0].xMin + 28;
    const fretboardH = H * 0.42;
    const fretCount = 7;
    const now = performance.now();

    // Nền gỗ rosewood
    canvasCtx.save();
    const grad = canvasCtx.createLinearGradient(fretboardX, fretboardY, fretboardX + fretboardW, fretboardY);
    grad.addColorStop(0,    '#1A0A0A');
    grad.addColorStop(0.5,  '#3D1C02');
    grad.addColorStop(1,    '#1A0A0A');
    canvasCtx.fillStyle = grad;
    canvasCtx.shadowColor = 'rgba(0,0,0,0.6)';
    canvasCtx.shadowBlur = 24;
    canvasCtx.shadowOffsetY = 12;
    canvasCtx.beginPath();
    canvasCtx.roundRect(fretboardX, fretboardY, fretboardW, fretboardH, 18);
    canvasCtx.fill();
    canvasCtx.restore();

    // Fret lines — nét liền ngang
    canvasCtx.save();
    canvasCtx.strokeStyle = 'rgba(200,200,200,0.30)';
    canvasCtx.lineWidth = 1.5;
    for (let f = 0; f <= fretCount; f++) {
        const y = fretboardY + (fretboardH / fretCount) * f;
        canvasCtx.beginPath();
        canvasCtx.moveTo(fretboardX + 10, y);
        canvasCtx.lineTo(fretboardX + fretboardW - 10, y);
        canvasCtx.stroke();
    }
    canvasCtx.restore();

    // Dot markers fret 3, 5, 7
    canvasCtx.save();
    canvasCtx.fillStyle = 'rgba(245,230,200,0.80)';
    [3, 5, 7].forEach(fret => {
        if (fret > fretCount) return;
        const y = fretboardY + (fretboardH / fretCount) * fret - (fretboardH / fretCount) * 0.5;
        const x = fretboardX + fretboardW * 0.5;
        canvasCtx.beginPath();
        canvasCtx.arc(x, y, 6, 0, Math.PI * 2);
        canvasCtx.fill();
    });
    canvasCtx.restore();

    // 6 dây đàn
    stringsConfig.forEach(string => {
        const centerX = (string.xMin + string.xMax) / 2;
        const isActive = AppState.rightHand.activeStringIndex === string.index;

        // Độ dày: dây 1 (index 0) mỏng nhất, dây 6 (index 5) dày nhất
        const thickness = 1.2 + string.index * 0.65;

        // Màu: dây 1-3 (index 0-2) bạc, dây 4-6 (index 3-5) vàng đồng
        const baseColor = string.index <= 2 ? '#C0C0C0' : '#B8860B';

        // Vibration
        const vibAge = now - (AppState.rightHand.lastTriggerTimes[string.index] || 0);
        const amp = Math.max(0, 7 - vibAge * 0.007);

        canvasCtx.save();
        canvasCtx.lineWidth = isActive ? thickness + 1.5 : thickness;
        canvasCtx.strokeStyle = isActive ? '#FFFFFF' : baseColor;
        canvasCtx.shadowColor = isActive ? 'rgba(255,255,255,0.85)' : 'transparent';
        canvasCtx.shadowBlur  = isActive ? 20 : 0;

        canvasCtx.beginPath();
        for (let t = 0; t <= 1; t += 0.02) {
            const y = string.yMin + (string.yMax - string.yMin) * t;
            const wave = Math.sin(t * Math.PI * 5 + now * 0.018) * amp;
            const x = centerX + wave;
            t === 0 ? canvasCtx.moveTo(x, y) : canvasCtx.lineTo(x, y);
        }
        canvasCtx.stroke();

        // Label dây
        canvasCtx.scale(-1, 1);
        canvasCtx.font = 'bold 12px sans-serif';
        canvasCtx.fillStyle = isActive ? '#FFFFFF' : 'rgba(245,230,200,0.55)';
        canvasCtx.textAlign = 'center';
        canvasCtx.textBaseline = 'middle';
        canvasCtx.fillText(
            string.label.split(' ')[0] + ' ' + string.label.split(' ')[1],
            -centerX,
            string.yMax - 22
        );
        canvasCtx.restore();
    });
}

function drawChordCards() {
    chordsConfig.forEach(chord => {
        const isSelected = AppState.leftHand.selectedChord === chord.name;
        const isHovered  = AppState.leftHand.hoveredChord  === chord.name;
        const cw = chord.xMax - chord.xMin;
        const ch = chord.yMax - chord.yMin;

        canvasCtx.save();

        // Nền gỗ gradient
        const woodGrad = canvasCtx.createLinearGradient(chord.xMin, chord.yMin, chord.xMin, chord.yMax);
        woodGrad.addColorStop(0,   '#3D2010');
        woodGrad.addColorStop(0.5, '#2C1810');
        woodGrad.addColorStop(1,   '#1A0A00');
        canvasCtx.fillStyle = woodGrad;

        // Viền + glow
        canvasCtx.strokeStyle = isSelected ? '#D4A017'
                               : isHovered  ? '#F5E6C8'
                               : 'rgba(245,230,200,0.18)';
        canvasCtx.lineWidth   = isSelected ? 2.5 : 1.5;
        canvasCtx.shadowColor = isSelected ? 'rgba(212,160,23,0.55)'
                               : isHovered  ? 'rgba(245,230,200,0.30)'
                               : 'rgba(0,0,0,0.45)';
        canvasCtx.shadowBlur  = isSelected ? 22 : isHovered ? 14 : 10;
        canvasCtx.shadowOffsetY = isSelected || isHovered ? 0 : 8;

        canvasCtx.beginPath();
        canvasCtx.roundRect(chord.xMin, chord.yMin, cw, ch, 20);
        canvasCtx.fill();
        canvasCtx.stroke();

        // Chữ tên hợp âm
        canvasCtx.translate(chord.xMin + cw / 2, chord.yMin + ch / 2);
        canvasCtx.scale(-1, 1);
        canvasCtx.font = 'bold 30px Georgia, serif';
        canvasCtx.fillStyle = isSelected ? '#D4A017' : '#F5E6C8';
        canvasCtx.textAlign = 'center';
        canvasCtx.textBaseline = 'middle';
        canvasCtx.shadowColor = isSelected ? 'rgba(212,160,23,0.7)' : 'transparent';
        canvasCtx.shadowBlur  = isSelected ? 12 : 0;
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
                console.log(`%c🎵 HỢP ÂM [ ${currentHit.name} ]`, "color: #10b981; font-weight: bold;");
            }
        }
    } else {
        AppState.leftHand.hoveredChord = null;
    }
}

function handleRightHandPicking(handLandmarks) {
    const now = performance.now();
    const currentX = handLandmarks[8].x * canvasElement.width;
    const currentY = handLandmarks[8].y * canvasElement.height;

    // Tính deltaY
    const deltaY = AppState.rightHand.prevY !== null 
        ? currentY - AppState.rightHand.prevY 
        : 0;
    AppState.rightHand.prevY = currentY;

    const currentStringHit = stringsConfig.find(string =>
        currentX >= string.xMin && currentX <= string.xMax &&
        currentY >= string.yMin && currentY <= string.yMax
    );

    // Cập nhật dây đang đặt ngón (chưa phát tiếng)
    if (currentStringHit) {
    // Chỉ trigger khi là dây MỚI, không phải dây đang đứng
    if (AppState.rightHand.activeStringIndex !== currentStringHit.index) {
        AppState.rightHand.activeStringIndex = currentStringHit.index;

        if (now - AppState.rightHand.lastTriggerTimes[currentStringHit.index] > 160) {
            if (AppState.leftHand.selectedChord) {
                playSingleString(AppState.leftHand.selectedChord, currentStringHit.index);
            }
            AppState.rightHand.lastTriggerTimes[currentStringHit.index] = now;
        }
    }
} else {
    AppState.rightHand.activeStringIndex = null;
}
}

function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    drawGuitarStrings();
    drawChordCards();

    let leftHandDetected = false; let rightHandDetected = false;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        AppState.rightHand.lostFrameCount = 0;

        if (!AppState.smoothedHands || AppState.smoothedHands.length !== results.multiHandLandmarks.length) {
            AppState.smoothedHands = results.multiHandLandmarks.map(hand =>
                hand.map(lm => ({ x: lm.x, y: lm.y, z: lm.z }))
            );
        }

        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const rawLandmarks = results.multiHandLandmarks[i];
            let realHandLabel = (results.multiHandedness[i].label === 'Left') ? 'TAY PHẢI' : 'TAY TRÁI';

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
                handleRightHandPicking(landmarks);
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
            handleRightHandPicking(AppState.smoothedHands[fallbackHandIndex]);
        } else if (AppState.rightHand.lostFrameCount > 20) {
            AppState.rightHand.activeStringIndex = null;
            AppState.smoothedHands = [];
        }
    }

    canvasCtx.restore();
}

const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.35, minTrackingConfidence: 0.40 });
hands.onResults(onResults);

const camera = new Camera(videoElement, { onFrame: async () => { await hands.send({ image: videoElement }); }, width: 1280, height: 720 });
window.addEventListener('click', () => { initAudio(); });
camera.start().catch(err => console.error(err));