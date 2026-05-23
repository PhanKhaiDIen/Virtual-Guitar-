const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// 1. CẤU HÌNH VÙNG CHỌN HỢP ÂM TAY TRÁI (Bên Phải Màn Hình)
const chordsConfig = [
    { name: 'C', xMin: 1080, xMax: 1220, yMin: 40, yMax: 120 },
    { name: 'D', xMin: 1080, xMax: 1220, yMin: 150, yMax: 230 },
    { name: 'G', xMin: 1080, xMax: 1220, yMin: 260, yMax: 340 },
    { name: 'Em', xMin: 1080, xMax: 1220, yMin: 370, yMax: 450 },
    { name: 'Am', xMin: 1080, xMax: 1220, yMin: 480, yMax: 560 },
    { name: 'F', xMin: 1080, xMax: 1220, yMin: 590, yMax: 670 }
];

// 2. CẤU HÌNH MỚI: 6 Ô BẤM XẾP THEO HÀNG NGANG CHỐNG TRƯỢT TAY
// Toàn bộ các ô có cùng chiều cao (Y: 150px đến 400px), xếp rộng từ X: 40px đến 580px
// Thứ tự từ trái sang phải: Dây 6 (Trầm nhất) -> Dây 1 (Cao nhất) để thuận tay gảy xuôi
const stringsConfig = [
    { index: 5, label: 'Dây 6 (E)', xMin: 40, xMax: 120, yMin: 150, yMax: 400 },
    { index: 4, label: 'Dây 5 (A)', xMin: 130, xMax: 210, yMin: 150, yMax: 400 },
    { index: 3, label: 'Dây 4 (D)', xMin: 220, xMax: 300, yMin: 150, yMax: 400 },
    { index: 2, label: 'Dây 3 (G)', xMin: 310, xMax: 390, yMin: 150, yMax: 400 },
    { index: 1, label: 'Dây 2 (B)', xMin: 40, xMax: 480, yMin: 150, yMax: 400 }, // Sửa khoảng cách X thưa đều
    { index: 0, label: 'Dây 1 (E)', xMin: 490, xMax: 570, yMin: 150, yMax: 400 }
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
    rightHand: { activeStringIndex: null, lostFrameCount: 0, lastTriggerTimes: [0, 0, 0, 0, 0, 0] },
    isStrummingFlash: false, smoothedHands: []
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
    stringsConfig.forEach(string => {
        const isActive = AppState.rightHand.activeStringIndex === string.index;
        canvasCtx.save();

        // ==========================================
        // CẤU HÌNH MÀU NỀN ĐỤC (BACKGROUND) CHO CÁC Ô PHÍM
        // ==========================================
        if (isActive) {
            // Khi ngón tay chạm vào: Ô phím đổi sang nền Vàng Hổ Phách đục (độ mờ 0.45) để báo hiệu cực rõ
            canvasCtx.fillStyle = "rgba(251, 191, 36, 0.45)";
            canvasCtx.strokeStyle = "#fbbf24";
            canvasCtx.lineWidth = 3;
        } else {
            // Khi bình thường: Đổ màu Xám Đen Đục (độ mờ 0.85 - gần như che hẳn nền video phía sau)
            // Giúp tách biệt hoàn toàn ô bấm ra khỏi quần áo hay khung cảnh phía sau của bạn
            canvasCtx.fillStyle = "rgba(21, 32, 43, 0.85)";
            canvasCtx.strokeStyle = "rgba(16, 185, 129, 0.5)"; // Viền xanh lục neon mờ
            canvasCtx.lineWidth = 2;
        }

        // Vẽ khối hộp ô phím gảy
        canvasCtx.beginPath();
        canvasCtx.roundRect(string.xMin, string.yMin, string.xMax - string.xMin, string.yMax - string.yMin, 10);
        canvasCtx.fill();
        canvasCtx.stroke();

        // Vẽ một "Sợi dây" chạy dọc ở chính giữa ô phím
        canvasCtx.beginPath();
        canvasCtx.strokeStyle = isActive ? "#fbbf24" : "rgba(16, 185, 129, 0.6)";
        canvasCtx.lineWidth = 1.5 + string.index * 0.6; // Độ dày sợi chỉ lõi tăng dần theo độ trầm của dây
        canvasCtx.moveTo(string.xMin + (string.xMax - string.xMin) / 2, string.yMin);
        canvasCtx.lineTo(string.xMin + (string.xMax - string.xMin) / 2, string.yMax);
        canvasCtx.stroke();

        // Vẽ nhãn chữ "Dây 6"..."Dây 1" xoay dọc
        canvasCtx.save();
        canvasCtx.translate(string.xMin + (string.xMax - string.xMin) / 2, string.yMax - 30);
        canvasCtx.scale(-1, 1);
        canvasCtx.font = "bold 14px sans-serif";
        canvasCtx.fillStyle = isActive ? "#fbbf24" : "#10b981"; // CHỮ XANH NEON RỰC RỠ
        canvasCtx.textAlign = "center";
        canvasCtx.textBaseline = "middle";
        canvasCtx.fillText(string.label.split(" ")[0] + " " + string.label.split(" ")[1], 0, 0);
        canvasCtx.restore();

        canvasCtx.restore();
    });
}

function drawChordCards() {
    chordsConfig.forEach(chord => {
        const isSelected = AppState.leftHand.selectedChord === chord.name;
        const isHovered = AppState.leftHand.hoveredChord === chord.name;

        canvasCtx.save();
        canvasCtx.lineWidth = 3;

        if (isSelected) {
            canvasCtx.fillStyle = "rgba(16, 185, 129, 0.2)";
            canvasCtx.strokeStyle = "#10b981";
        } else if (isHovered) {
            canvasCtx.fillStyle = "rgba(56, 189, 248, 0.1)";
            canvasCtx.strokeStyle = "#38bdf8";
        } else {
            canvasCtx.fillStyle = "rgba(51, 65, 85, 0.3)";
            canvasCtx.strokeStyle = "#475569";
        }

        canvasCtx.beginPath();
        canvasCtx.roundRect(chord.xMin, chord.yMin, chord.xMax - chord.xMin, chord.yMax - chord.yMin, 8);
        canvasCtx.fill();
        canvasCtx.stroke();

        canvasCtx.translate(chord.xMin + (chord.xMax - chord.xMin) / 2, chord.yMin + (chord.yMax - chord.yMin) / 2);
        canvasCtx.scale(-1, 1);
        canvasCtx.font = "bold 28px sans-serif";
        canvasCtx.fillStyle = isSelected ? "#059669" : "#10b981"; // CHỮ XANH NEON
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
                console.log(`%c🎵 HỢP ÂM [ ${currentHit.name} ]`, "color: #10b981; font-weight: bold;");
            }
        }
    } else {
        AppState.leftHand.hoveredChord = null;
        AppState.leftHand.selectedChord = null;
    }
}

function handleRightHandPicking(handLandmarks) {
    const now = performance.now();
    const currentX = handLandmarks[8].x * canvasElement.width;
    const currentY = handLandmarks[8].y * canvasElement.height;

    // Quét kiểm tra tọa độ xem ngón trỏ đang lọt lòng ô đứng nào
    const currentStringHit = stringsConfig.find(string =>
        currentX >= string.xMin && currentX <= string.xMax &&
        currentY >= string.yMin && currentY <= string.yMax
    );

    if (currentStringHit) {
        if (AppState.rightHand.activeStringIndex !== currentStringHit.index) {
            AppState.rightHand.activeStringIndex = currentStringHit.index;

            // Bộ lọc chặn lặp giữ ở mức 160ms để bạn vuốt ngang mượt và nhạy hơn
            if (now - AppState.rightHand.lastTriggerTimes[currentStringHit.index] > 160) {
                if (AppState.leftHand.selectedChord) {
                    playSingleString(AppState.leftHand.selectedChord, currentStringHit.index);
                    console.log(`🎸 Gảy Ô Ngang [${currentStringHit.label}]`);
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