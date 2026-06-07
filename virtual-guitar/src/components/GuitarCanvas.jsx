import { useRef, useCallback } from 'react';
import { useHandTracking } from '../hooks/useHandTracking';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { getChordsConfig, getStringsConfig } from '../config/chordsConfig';

export default function GuitarCanvas() {
    const videoRef  = useRef(null);
    const canvasRef = useRef(null);
    const { initAudio, playSingleString } = useAudioEngine();

    const appState = useRef({
        leftHand:  { hoveredChord: null, selectedChord: null, touchStartTime: 0 },
        rightHand: {
            activeStringIndex: null,
            lostFrameCount: 0,
            lastTriggerTimes: [0,0,0,0,0,0],
            stringVibrations: [0,0,0,0,0,0],
            prevY: null,
        },
        smoothedHands: [],
    });

    const SMOOTHING_LEFT  = 0.40;
    const SMOOTHING_RIGHT = 0.70;

    const onResults = useCallback((results) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        const state = appState.current;
        const chords  = getChordsConfig(W, H);
        const strings = getStringsConfig(W, H);

        ctx.save();
        ctx.clearRect(0, 0, W, H);

        // Vẽ ảnh camera đã mirror (1 lần duy nhất)
        ctx.save();
        ctx.translate(W, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(results.image, 0, 0, W, H);
        ctx.restore();

        drawStrings(ctx, strings, state, W, H);
        drawChords(ctx, chords, state);

        let leftDetected = false;
        let rightDetected = false;

        if (results.multiHandLandmarks?.length > 0) {
            state.rightHand.lostFrameCount = 0;

            if (state.smoothedHands.length !== results.multiHandLandmarks.length) {
                state.smoothedHands = results.multiHandLandmarks.map(hand =>
                    hand.map(lm => ({ x: lm.x, y: lm.y, z: lm.z }))
                );
            }

            for (let i = 0; i < results.multiHandLandmarks.length; i++) {
                const raw = results.multiHandLandmarks[i];
                let label = results.multiHandedness[i].label === 'Left' ? 'TAY PHẢI' : 'TAY TRÁI';

                const factor = label === 'TAY TRÁI' ? SMOOTHING_LEFT : SMOOTHING_RIGHT;
                for (let j = 0; j < raw.length; j++) {
                    state.smoothedHands[i][j].x += factor * (raw[j].x - state.smoothedHands[i][j].x);
                    state.smoothedHands[i][j].y += factor * (raw[j].y - state.smoothedHands[i][j].y);
                }

                const lm = state.smoothedHands[i];
                const color = label === 'TAY TRÁI' ? '#38bdf8' : '#fbbf24';

                // Flip landmark trước khi vẽ để khớp với ảnh đã mirror
                const flippedLm = lm.map(p => ({ ...p, x: 1 - p.x }));
                window.drawConnectors(ctx, flippedLm, window.HAND_CONNECTIONS, { color, lineWidth: 3.5 });
                window.drawLandmarks(ctx, flippedLm, { color: '#ffffff', lineWidth: 1, radius: 3.5 });

                if (label === 'TAY TRÁI') {
                    leftDetected = true;
                    handleLeftHand(lm[8], chords, state);
                } else {
                    rightDetected = true;
                    handleRightHand(lm, strings, state, playSingleString);
                }

                // Vẽ label tay — dùng tọa độ đã flip
                ctx.save();
                ctx.translate((1 - lm[0].x) * W, lm[0].y * H);
                ctx.font = 'bold 16px sans-serif';
                ctx.fillStyle = color;
                ctx.textAlign = 'center';
                ctx.fillText(label, 0, 25);
                ctx.restore();
            }
        }

        if (!leftDetected) {
            state.leftHand.hoveredChord = null;
        }

        if (!rightDetected) {
            state.rightHand.lostFrameCount++;
            if (state.rightHand.lostFrameCount > 20) {
                state.rightHand.activeStringIndex = null;
                state.smoothedHands = [];
            }
        }

        ctx.restore();
    }, [playSingleString]);

    useHandTracking({ videoRef, onResults });

    return (
        <div onClick={initAudio} style={{ width:'90vw', maxWidth:1280, aspectRatio:'16/9',
            margin:'0 auto', borderRadius:12, overflow:'hidden' }}>
            <video ref={videoRef} style={{ display:'none' }} autoPlay playsInline />
            <canvas ref={canvasRef} width={1280} height={720}
                style={{ width:'100%', height:'100%' }} />
        </div>
    );
}

// ── Helper functions ──────────────────────────────────────────

function handleLeftHand(tip, chords, state) {
    const now = performance.now();
    const x = (1 - tip.x) * 1280;
    const y = tip.y * 720;

    const hit = chords.find(c =>
        x >= c.xMin && x <= c.xMax &&
        y >= c.yMin && y <= c.yMax
    );
    if (hit) {
        if (state.leftHand.hoveredChord !== hit.name) {
            state.leftHand.hoveredChord = hit.name;
            state.leftHand.touchStartTime = now;
        } else if (state.leftHand.selectedChord !== hit.name &&
                now - state.leftHand.touchStartTime >= 120) {
            state.leftHand.selectedChord = hit.name;
        }
    } else {
        state.leftHand.hoveredChord = null;
    }
}

function handleRightHand(lm, strings, state, playSingleString) {
    const now = performance.now();
    const x = (1 - lm[8].x) * 1280;
    const y = lm[8].y * 720;

    const hit = strings.find(s =>
        x >= s.xMin && x <= s.xMax &&
        y >= s.yMin && y <= s.yMax
    );

    if (hit) {
        if (state.rightHand.activeStringIndex !== hit.index) {
            state.rightHand.activeStringIndex = hit.index;
            if (now - state.rightHand.lastTriggerTimes[hit.index] > 160) {
                if (state.leftHand.selectedChord) {
                    playSingleString(state.leftHand.selectedChord, hit.index);
                    state.rightHand.stringVibrations[hit.index] = now;
                }
                state.rightHand.lastTriggerTimes[hit.index] = now;
            }
        }
    } else {
        state.rightHand.activeStringIndex = null;
    }
}

function drawStrings(ctx, strings, state, W, H) {
    const fretboardX = strings[0].xMin - 14;
    const fretboardY = H * 0.18;
    const fretboardW = strings[5].xMax - strings[0].xMin + 28;
    const fretboardH = H * 0.42;
    const fretCount  = 7;
    const now = performance.now();

    ctx.save();
    const grad = ctx.createLinearGradient(fretboardX, 0, fretboardX + fretboardW, 0);
    grad.addColorStop(0,   '#1A0A0A');
    grad.addColorStop(0.5, '#3D1C02');
    grad.addColorStop(1,   '#1A0A0A');
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.roundRect(fretboardX, fretboardY, fretboardW, fretboardH, 18);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(200,200,200,0.30)';
    ctx.lineWidth = 1.5;
    for (let f = 0; f <= fretCount; f++) {
        const y = fretboardY + (fretboardH / fretCount) * f;
        ctx.beginPath();
        ctx.moveTo(fretboardX + 10, y);
        ctx.lineTo(fretboardX + fretboardW - 10, y);
        ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.fillStyle = 'rgba(245,230,200,0.80)';
    [3, 5, 7].forEach(fret => {
        const y = fretboardY + (fretboardH / fretCount) * fret - (fretboardH / fretCount) * 0.5;
        ctx.beginPath();
        ctx.arc(fretboardX + fretboardW * 0.5, y, 6, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();

    strings.forEach(string => {
        const cx = (string.xMin + string.xMax) / 2;
        const isActive = state.rightHand.activeStringIndex === string.index;
        const thickness = 1.2 + string.index * 0.65;
        const baseColor = string.index <= 2 ? '#C0C0C0' : '#B8860B';
        const vibAge = now - (state.rightHand.stringVibrations[string.index] || 0);
        const amp = Math.max(0, 7 - vibAge * 0.007);

        ctx.save();
        ctx.lineWidth = isActive ? thickness + 1.5 : thickness;
        ctx.strokeStyle = isActive ? '#FFFFFF' : baseColor;
        ctx.shadowColor = isActive ? 'rgba(255,255,255,0.85)' : 'transparent';
        ctx.shadowBlur  = isActive ? 20 : 0;
        ctx.beginPath();
        for (let t = 0; t <= 1; t += 0.02) {
            const y = string.yMin + (string.yMax - string.yMin) * t;
            const wave = Math.sin(t * Math.PI * 5 + now * 0.018) * amp;
            t === 0 ? ctx.moveTo(cx + wave, y) : ctx.lineTo(cx + wave, y);
        }
        ctx.stroke();
        ctx.restore();
    });
}

function drawChords(ctx, chords, state) {
    chords.forEach(chord => {
        const isSelected = state.leftHand.selectedChord === chord.name;
        const isHovered  = state.leftHand.hoveredChord  === chord.name;
        const cw = chord.xMax - chord.xMin;
        const ch = chord.yMax - chord.yMin;

        ctx.save();
        const grad = ctx.createLinearGradient(chord.xMin, chord.yMin, chord.xMin, chord.yMax);
        grad.addColorStop(0,   '#3D2010');
        grad.addColorStop(0.5, '#2C1810');
        grad.addColorStop(1,   '#1A0A00');
        ctx.fillStyle = grad;
        ctx.strokeStyle = isSelected ? '#D4A017' : isHovered ? '#F5E6C8' : 'rgba(245,230,200,0.18)';
        ctx.lineWidth   = isSelected ? 2.5 : 1.5;
        ctx.shadowColor = isSelected ? 'rgba(212,160,23,0.55)' : 'rgba(0,0,0,0.45)';
        ctx.shadowBlur  = isSelected ? 22 : 10;
        ctx.beginPath();
        ctx.roundRect(chord.xMin, chord.yMin, cw, ch, 20);
        ctx.fill();
        ctx.stroke();

        // Chữ không cần flip vì đã bỏ CSS mirror
        ctx.font = 'bold 30px Georgia, serif';
        ctx.fillStyle = isSelected ? '#D4A017' : '#F5E6C8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(chord.name, chord.xMin + cw / 2, chord.yMin + ch / 2);
        ctx.restore();
    });
}