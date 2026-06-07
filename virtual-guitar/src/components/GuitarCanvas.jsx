import { useCallback, useRef, useState } from 'react';
import { useHandTracking } from '../hooks/useHandTracking';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { getChordsConfig, getStringsConfig } from '../config/chordsConfig';
import { PRACTICE_SONG, CHORD_COLORS, HIGHWAY, buildNoteQueue, getNoteY } from '../config/songHighway';

export default function GuitarCanvas() {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const { initAudio, playSingleString, playChordStrum, getCurrentTime } = useAudioEngine();

    const [score, setScore] = useState(0);
    const [combo, setCombo] = useState(0);
    const [feedback, setFeedback] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);

    const elapsedRef = useRef(0);
    const audioStartTimeRef = useRef(0);
    const scoreRef = useRef(0);
    const comboRef = useRef(0);
    const feedbackTimer = useRef(null);
    const notesRef = useRef(buildNoteQueue(PRACTICE_SONG));

    const appState = useRef({
        leftHand: { hoveredChord: null, selectedChord: null, touchStartTime: 0 },
        rightHand: {
            activeStringIndex: null,
            lostFrameCount: 0,
            lastTriggerTimes: [0, 0, 0, 0, 0, 0],
            stringVibrations: [0, 0, 0, 0, 0, 0],
            prevX: null,
            strumStartTime: 0,
            strumStrings: new Set(),
            lastStrumTime: 0,
        },
        smoothedHands: [],
    });

    const SMOOTHING_LEFT = 0.4;
    const SMOOTHING_RIGHT = 0.7;

    function showFeedback(text) {
        setFeedback(text);
        clearTimeout(feedbackTimer.current);
        feedbackTimer.current = setTimeout(() => setFeedback(null), 520);
    }

    function resetSong() {
        elapsedRef.current = 0;
        notesRef.current = buildNoteQueue(PRACTICE_SONG);
        scoreRef.current = 0;
        comboRef.current = 0;
        setScore(0);
        setCombo(0);
        setFeedback(null);
        setIsPlaying(false);
    }

    function startSong() {
        initAudio();
        notesRef.current = buildNoteQueue(PRACTICE_SONG);
        elapsedRef.current = 0;
        scoreRef.current = 0;
        comboRef.current = 0;
        setScore(0);
        setCombo(0);
        setFeedback(null);

        const startTime = getCurrentTime();
        audioStartTimeRef.current = startTime;
        scheduleBackingSong(PRACTICE_SONG, startTime, playChordStrum);
        setIsPlaying(true);
    }

    function handleStrumHit(strumChord) {
        const now = elapsedRef.current;
        const target = notesRef.current.find(note => {
            if (note.hit || note.missed) return false;
            return Math.abs(note.hitTime - now) <= HIGHWAY.timingWindowMs;
        });

        if (!target) {
            comboRef.current = 0;
            setCombo(0);
            showFeedback('MISS');
            return;
        }

        if (strumChord === target.chord) {
            target.hit = true;
            comboRef.current += 1;
            scoreRef.current += comboRef.current >= 5 ? 200 : 100;
            setCombo(comboRef.current);
            setScore(scoreRef.current);
            showFeedback(comboRef.current >= 5 ? 'PERFECT' : 'HIT');
            return;
        }

        target.missed = true;
        comboRef.current = 0;
        setCombo(0);
        showFeedback('WRONG');
    }

    const onResults = useCallback((results) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        const state = appState.current;
        const chords = getChordsConfig(W, H);
        const strings = getStringsConfig(W, H);

        if (isPlaying) {
            elapsedRef.current = Math.max(0, (getCurrentTime() - audioStartTimeRef.current) * 1000);
        }

        ctx.save();
        ctx.clearRect(0, 0, W, H);

        ctx.save();
        ctx.translate(W, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(results.image, 0, 0, W, H);
        ctx.restore();

        drawHighway(ctx, W, H, elapsedRef.current, notesRef.current, isPlaying);
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
                const label = results.multiHandedness[i].label === 'Left' ? 'TAY PHAI' : 'TAY TRAI';
                const factor = label === 'TAY TRAI' ? SMOOTHING_LEFT : SMOOTHING_RIGHT;

                for (let j = 0; j < raw.length; j++) {
                    state.smoothedHands[i][j].x += factor * (raw[j].x - state.smoothedHands[i][j].x);
                    state.smoothedHands[i][j].y += factor * (raw[j].y - state.smoothedHands[i][j].y);
                }

                const lm = state.smoothedHands[i];
                const color = label === 'TAY TRAI' ? '#38bdf8' : '#fbbf24';
                const flippedLm = lm.map(p => ({ ...p, x: 1 - p.x }));

                window.drawConnectors(ctx, flippedLm, window.HAND_CONNECTIONS, { color, lineWidth: 3.5 });
                window.drawLandmarks(ctx, flippedLm, { color: '#ffffff', lineWidth: 1, radius: 3.5 });

                if (label === 'TAY TRAI') {
                    leftDetected = true;
                    handleLeftHand(lm[8], chords, state);
                } else {
                    rightDetected = true;
                    const strumEvent = handleRightHand(lm, strings, state, playSingleString);

                    if (strumEvent) {
                        handleStrumHit(strumEvent.chord);
                    }
                }

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
                state.rightHand.prevX = null;
                state.rightHand.strumStrings.clear();
                state.smoothedHands = [];
            }
        }

        ctx.restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [getCurrentTime, isPlaying, playSingleString]);

    useHandTracking({ videoRef, onResults });

    return (
        <div
            onClick={initAudio}
            style={{
                position: 'relative',
                width: '90vw',
                maxWidth: 1280,
                aspectRatio: '16/9',
                margin: '0 auto',
                borderRadius: 12,
                overflow: 'hidden',
            }}
        >
            <video ref={videoRef} style={{ display: 'none' }} autoPlay playsInline />
            <canvas ref={canvasRef} width={1280} height={720} style={{ width: '100%', height: '100%' }} />

            <div style={{
                position: 'absolute',
                top: 14,
                right: 18,
                color: '#F5E6C8',
                fontSize: 15,
                textAlign: 'right',
                textShadow: '0 1px 8px #000',
                pointerEvents: 'none',
            }}>
                <div>Score: <strong style={{ color: '#D4A017', fontSize: 22 }}>{score}</strong></div>
                <div>Combo: <strong style={{ color: '#4ade80', fontSize: 18 }}>x{combo}</strong></div>
            </div>

            <button onClick={resetSong} style={{
                position: 'absolute',
                left: 18,
                bottom: 16,
                background: '#D4A017',
                color: '#111',
                border: 'none',
                borderRadius: 8,
                padding: '8px 14px',
                fontWeight: 700,
                cursor: 'pointer',
            }}>
                Restart
            </button>

            <button onClick={startSong} style={{
                position: 'absolute',
                left: 112,
                bottom: 16,
                background: isPlaying ? '#2C1810' : '#4ade80',
                color: isPlaying ? '#F5E6C8' : '#111',
                border: isPlaying ? '1px solid #D4A017' : 'none',
                borderRadius: 8,
                padding: '8px 14px',
                fontWeight: 700,
                cursor: 'pointer',
            }}>
                {isPlaying ? 'Restart Song' : 'Start Song'}
            </button>

            <div style={{
                position: 'absolute',
                left: 18,
                top: 14,
                color: '#F5E6C8',
                fontSize: 14,
                textShadow: '0 1px 8px #000',
                pointerEvents: 'none',
            }}>
                <div>{PRACTICE_SONG.title}</div>
                <div style={{ color: '#94a3b8', fontSize: 12 }}>
                    Strum: 4 strings
                </div>
            </div>

            {feedback && (
                <div style={{
                    position: 'absolute',
                    top: '36%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    color: feedback === 'HIT' || feedback === 'PERFECT' ? '#4ade80' : '#ef4444',
                    fontSize: 44,
                    fontWeight: 800,
                    textShadow: '0 0 18px currentColor',
                    pointerEvents: 'none',
                }}>
                    {feedback}
                </div>
            )}
        </div>
    );
}

function scheduleBackingSong(song, audioStartTime, playChordStrum) {
    const msPerBeat = (60 / song.bpm) * 1000;

    song.chart.forEach(note => {
        const chordTime = audioStartTime + (song.countInMs + note.beat * msPerBeat) / 1000;
        playChordStrum(note.chord, chordTime, 0.22);
    });
}

function handleLeftHand(tip, chords, state) {
    const now = performance.now();
    const x = (1 - tip.x) * 1280;
    const y = tip.y * 720;
    const hit = chords.find(c => x >= c.xMin && x <= c.xMax && y >= c.yMin && y <= c.yMax);

    if (hit) {
        if (state.leftHand.hoveredChord !== hit.name) {
            state.leftHand.hoveredChord = hit.name;
            state.leftHand.touchStartTime = now;
        } else if (state.leftHand.selectedChord !== hit.name && now - state.leftHand.touchStartTime >= 120) {
            state.leftHand.selectedChord = hit.name;
        }

        return;
    }

    state.leftHand.hoveredChord = null;
}

function handleRightHand(lm, strings, state, playSingleString) {
    const now = performance.now();
    const x = (1 - lm[8].x) * 1280;
    const y = lm[8].y * 720;
    const prevX = state.rightHand.prevX;
    let strumEvent = null;

    if (now - state.rightHand.strumStartTime > 700) {
        state.rightHand.strumStartTime = now;
        state.rightHand.strumStrings.clear();
    }

    if (prevX !== null) {
        strings.forEach(string => {
            const stringX = (string.xMin + string.xMax) / 2;
            const crossed = (prevX < stringX && x >= stringX) || (prevX > stringX && x <= stringX);
            const insideY = y >= string.yMin && y <= string.yMax;

            if (!crossed || !insideY) return;

            state.rightHand.activeStringIndex = string.index;
            state.rightHand.strumStrings.add(string.index);

            if (now - state.rightHand.lastTriggerTimes[string.index] > 120) {
                if (state.leftHand.selectedChord) {
                    playSingleString(state.leftHand.selectedChord, string.index);
                    state.rightHand.stringVibrations[string.index] = now;
                }

                state.rightHand.lastTriggerTimes[string.index] = now;
            }

            if (
                state.rightHand.strumStrings.size >= 4 &&
                state.leftHand.selectedChord &&
                now - state.rightHand.lastStrumTime > 500
            ) {
                state.rightHand.lastStrumTime = now;
                strumEvent = { chord: state.leftHand.selectedChord };
                state.rightHand.strumStrings.clear();
            }
        });
    }

    state.rightHand.prevX = x;
    return strumEvent;
}

function drawHighway(ctx, W, H, elapsed, notes, isPlaying) {
    const hx = W * HIGHWAY.x;
    const highwayW = W * HIGHWAY.width;
    const hitY = H * HIGHWAY.hitY;
    const noteH = H * HIGHWAY.noteH;
    const hitWindow = H * HIGHWAY.hitWindow;

    ctx.save();
    const bg = ctx.createLinearGradient(hx, 0, hx + highwayW, 0);
    bg.addColorStop(0, 'rgba(0,0,0,0)');
    bg.addColorStop(0.12, 'rgba(0,0,0,0.58)');
    bg.addColorStop(0.88, 'rgba(0,0,0,0.58)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(hx, 0, highwayW, H);

    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach(p => {
        ctx.beginPath();
        ctx.moveTo(hx + highwayW * p, 0);
        ctx.lineTo(hx + highwayW * p, H);
        ctx.stroke();
    });

    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 7]);
    ctx.beginPath();
    ctx.moveTo(hx + 8, hitY);
    ctx.lineTo(hx + highwayW - 8, hitY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.textAlign = 'left';
    ctx.fillText('STRUM HIT ZONE', hx + 12, hitY - hitWindow - 8);
    ctx.restore();

    notes.forEach(note => {
        if (note.hit || note.missed) return;

        const y = getNoteY(note, elapsed, H);

        if (isPlaying && y > hitY + hitWindow) {
            note.missed = true;
            return;
        }

        if (y < -noteH || y > H + noteH) return;

        const color = CHORD_COLORS[note.chord] || '#ffffff';
        const inHitZone = y >= hitY - hitWindow && y <= hitY + hitWindow;

        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = inHitZone ? 24 : 10;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(hx + 10, y, highwayW - 20, noteH, 8);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.font = `bold ${Math.max(22, noteH * 0.64)}px Georgia, serif`;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(note.chord, hx + highwayW / 2, y + noteH / 2);
        ctx.restore();
    });
}

function drawStrings(ctx, strings, state, W, H) {
    const fretboardX = strings[0].xMin - 14;
    const fretboardY = H * 0.18;
    const fretboardW = strings[5].xMax - strings[0].xMin + 28;
    const fretboardH = H * 0.42;
    const fretCount = 7;
    const now = performance.now();

    ctx.save();
    const grad = ctx.createLinearGradient(fretboardX, 0, fretboardX + fretboardW, 0);
    grad.addColorStop(0, '#1A0A0A');
    grad.addColorStop(0.5, '#3D1C02');
    grad.addColorStop(1, '#1A0A0A');
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
        ctx.shadowBlur = isActive ? 20 : 0;
        ctx.beginPath();

        for (let t = 0; t <= 1; t += 0.02) {
            const y = string.yMin + (string.yMax - string.yMin) * t;
            const wave = Math.sin(t * Math.PI * 5 + now * 0.018) * amp;

            if (t === 0) {
                ctx.moveTo(cx + wave, y);
            } else {
                ctx.lineTo(cx + wave, y);
            }
        }

        ctx.stroke();
        ctx.restore();
    });
}

function drawChords(ctx, chords, state) {
    chords.forEach(chord => {
        const isSelected = state.leftHand.selectedChord === chord.name;
        const isHovered = state.leftHand.hoveredChord === chord.name;
        const cw = chord.xMax - chord.xMin;
        const ch = chord.yMax - chord.yMin;

        ctx.save();
        const grad = ctx.createLinearGradient(chord.xMin, chord.yMin, chord.xMin, chord.yMax);
        grad.addColorStop(0, '#3D2010');
        grad.addColorStop(0.5, '#2C1810');
        grad.addColorStop(1, '#1A0A00');
        ctx.fillStyle = grad;
        ctx.strokeStyle = isSelected ? '#D4A017' : isHovered ? '#F5E6C8' : 'rgba(245,230,200,0.18)';
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.shadowColor = isSelected ? 'rgba(212,160,23,0.55)' : 'rgba(0,0,0,0.45)';
        ctx.shadowBlur = isSelected ? 22 : 10;
        ctx.beginPath();
        ctx.roundRect(chord.xMin, chord.yMin, cw, ch, 20);
        ctx.fill();
        ctx.stroke();

        ctx.font = 'bold 30px Georgia, serif';
        ctx.fillStyle = isSelected ? '#D4A017' : '#F5E6C8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(chord.name, chord.xMin + cw / 2, chord.yMin + ch / 2);
        ctx.restore();
    });
}
