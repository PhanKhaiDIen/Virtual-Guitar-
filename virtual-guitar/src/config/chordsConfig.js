export const getChordsConfig = (W, H) => [
    { name: 'C',  xMin: W*0.02, xMax: W*0.14, yMin: H*0.06, yMax: H*0.17 },
    { name: 'D',  xMin: W*0.02, xMax: W*0.14, yMin: H*0.21, yMax: H*0.32 },
    { name: 'G',  xMin: W*0.02, xMax: W*0.14, yMin: H*0.36, yMax: H*0.47 },
    { name: 'Em', xMin: W*0.02, xMax: W*0.14, yMin: H*0.51, yMax: H*0.62 },
    { name: 'Am', xMin: W*0.02, xMax: W*0.14, yMin: H*0.67, yMax: H*0.78 },
    { name: 'F',  xMin: W*0.02, xMax: W*0.14, yMin: H*0.82, yMax: H*0.93 },
];

export const getStringsConfig = (W, H) => {
    const startX = W * 0.55;
    const endX   = W * 0.95;
    const GAP    = 10;
    const totalW = endX - startX;
    const sw     = (totalW - GAP * 5) / 6;
    return [
        { index: 5, label: 'Dây 6 (E)', xMin: startX + (sw+GAP)*0, xMax: startX + (sw+GAP)*0 + sw, yMin: H*0.18, yMax: H*0.62 },
        { index: 4, label: 'Dây 5 (A)', xMin: startX + (sw+GAP)*1, xMax: startX + (sw+GAP)*1 + sw, yMin: H*0.18, yMax: H*0.62 },
        { index: 3, label: 'Dây 4 (D)', xMin: startX + (sw+GAP)*2, xMax: startX + (sw+GAP)*2 + sw, yMin: H*0.18, yMax: H*0.62 },
        { index: 2, label: 'Dây 3 (G)', xMin: startX + (sw+GAP)*3, xMax: startX + (sw+GAP)*3 + sw, yMin: H*0.18, yMax: H*0.62 },
        { index: 1, label: 'Dây 2 (B)', xMin: startX + (sw+GAP)*4, xMax: startX + (sw+GAP)*4 + sw, yMin: H*0.18, yMax: H*0.62 },
        { index: 0, label: 'Dây 1 (E)', xMin: startX + (sw+GAP)*5, xMax: startX + (sw+GAP)*5 + sw, yMin: H*0.18, yMax: H*0.62 },
    ];
};
export const chordStringsFrequencies = {
    'C':  [329.63, 261.63, 196.00, 146.83, 130.81, 82.41],
    'D':  [440.00, 369.99, 293.66, 220.00, 146.83, 98.00],
    'G':  [392.00, 196.00, 146.83, 123.47, 98.00,  98.00],
    'Em': [329.63, 196.00, 164.81, 130.81, 82.41,  82.41],
    'Am': [440.00, 261.63, 220.00, 146.83, 110.00, 82.41],
    'F':  [349.23, 261.63, 174.61, 130.81, 87.31,  87.31],
};