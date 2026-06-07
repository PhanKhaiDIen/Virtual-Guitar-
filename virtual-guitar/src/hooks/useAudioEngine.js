import { useRef } from 'react';
import { chordStringsFrequencies } from '../config/chordsConfig';

export function useAudioEngine() {
    const audioCtxRef = useRef(null);

    function initAudio() {
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume();
        }

        return audioCtxRef.current;
    }

    function createOscillator(freq, type, volumeRatio, startTime, duration, destinationGain) {
        const ctx = audioCtxRef.current;
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, startTime);
        oscGain.gain.setValueAtTime(volumeRatio, startTime);
        osc.connect(oscGain);
        oscGain.connect(destinationGain);
        osc.start(startTime);
        osc.stop(startTime + duration);
    }

    function playSingleString(chordName, stringIndex, startTime = null, volumeScale = 1) {
        const ctx = initAudio();

        const freq = chordStringsFrequencies[chordName]?.[stringIndex];
        if (!freq) return;

        const now = startTime ?? ctx.currentTime;
        let sustainTime = 5.0;
        let decayConstant = 0.25;

        if (stringIndex === 5)      { sustainTime = 12.0; decayConstant = 0.60; }
        else if (stringIndex === 4) { sustainTime = 10.0; decayConstant = 0.50; }
        else if (stringIndex === 3) { sustainTime = 8.5;  decayConstant = 0.40; }

        const isDay6 = stringIndex === 5;
        const baseVolume = (isDay6 ? 0.55 : 0.45) * volumeScale;

        const noteGain = ctx.createGain();
        noteGain.gain.setValueAtTime(0, now);
        noteGain.gain.linearRampToValueAtTime(baseVolume, now + 0.008);
        noteGain.gain.exponentialRampToValueAtTime(baseVolume * decayConstant, now + 0.3);
        noteGain.gain.exponentialRampToValueAtTime(0.000001, now + sustainTime);

        if (isDay6) {
            createOscillator(freq,     'sine',     0.85, now, sustainTime,       noteGain);
            createOscillator(freq * 2, 'triangle', 0.20, now, sustainTime * 0.8, noteGain);
            createOscillator(freq * 3, 'sine',     0.05, now, sustainTime * 0.5, noteGain);
        } else {
            createOscillator(freq,     'sine',     0.85, now, sustainTime,       noteGain);
            createOscillator(freq * 2, 'triangle', 0.12, now, sustainTime * 0.6, noteGain);
            createOscillator(freq * 3, 'sine',     0.03, now, sustainTime * 0.3, noteGain);
        }

        const filterNode = ctx.createBiquadFilter();
        filterNode.type = 'lowpass';
        filterNode.frequency.setValueAtTime(isDay6 ? 650 : 450, now);
        filterNode.frequency.exponentialRampToValueAtTime(110, now + sustainTime);

        noteGain.connect(filterNode);
        filterNode.connect(ctx.destination);
    }

    function playChordStrum(chordName, startTime = null, volumeScale = 0.35) {
        const ctx = initAudio();
        const start = startTime ?? ctx.currentTime;

        [5, 4, 3, 2, 1, 0].forEach((stringIndex, order) => {
            playSingleString(chordName, stringIndex, start + order * 0.025, volumeScale);
        });
    }

    function getCurrentTime() {
        return audioCtxRef.current?.currentTime ?? 0;
    }

    return { initAudio, playSingleString, playChordStrum, getCurrentTime };
}
