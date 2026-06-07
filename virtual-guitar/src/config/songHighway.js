export const PRACTICE_SONG = {
    title: 'C G Am F Practice',
    bpm: 64,
    countInMs: 3600,
    chart: [
        { chord: 'C', beat: 0 },
        { chord: 'G', beat: 2 },
        { chord: 'Am', beat: 4 },
        { chord: 'F', beat: 6 },
        { chord: 'C', beat: 8 },
        { chord: 'G', beat: 10 },
        { chord: 'Am', beat: 12 },
        { chord: 'F', beat: 14 },
    ],
};

export const CHORD_COLORS = {
    C: '#f97316',
    D: '#ec4899',
    G: '#3b82f6',
    Em: '#22c55e',
    Am: '#ef4444',
    F: '#8b5cf6',
};

export const HIGHWAY = {
    x: 0.17,
    width: 0.34,
    topY: 0.02,
    hitY: 0.86,
    hitWindow: 0.075,
    noteH: 0.072,
    travelTime: 3600,
    timingWindowMs: 260,
};

export function buildNoteQueue(song = PRACTICE_SONG) {
    const msPerBeat = (60 / song.bpm) * 1000;

    return song.chart.map((note, index) => ({
        id: index,
        chord: note.chord,
        hitTime: song.countInMs + note.beat * msPerBeat,
        hit: false,
        missed: false,
    }));
}

export function getNoteY(note, elapsed, H) {
    const topY = H * HIGHWAY.topY;
    const hitY = H * HIGHWAY.hitY;
    const progress = 1 - (note.hitTime - elapsed) / HIGHWAY.travelTime;

    return topY + (hitY - topY) * progress;
}
