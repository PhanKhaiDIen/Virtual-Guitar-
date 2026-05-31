export const getChordsConfig = (W, H) => [
    { name:'C',  xMin:W*0.85, xMax:W*0.95, yMin:H*0.06, yMax:H*0.17 },
    { name:'D',  xMin:W*0.85, xMax:W*0.95, yMin:H*0.21, yMax:H*0.32 },
    { name:'G',  xMin:W*0.85, xMax:W*0.95, yMin:H*0.36, yMax:H*0.47 },
    { name:'Em', xMin:W*0.85, xMax:W*0.95, yMin:H*0.51, yMax:H*0.62 },
    { name:'Am', xMin:W*0.85, xMax:W*0.95, yMin:H*0.67, yMax:H*0.78 },
    { name:'F',  xMin:W*0.85, xMax:W*0.95, yMin:H*0.82, yMax:H*0.93 },
];

export const getStringsConfig = (W, H) => {
    const startX = W * 0.05;
    const endX   = W * 0.35;
    const sw     = (endX - startX) / 6;

    return [
        { index: 5, xMin:startX+sw*0, xMax:startX+sw*1, yMin:H*0.21, yMax:H*0.56 },
        { index: 4, xMin:startX+sw*1, xMax:startX+sw*2, yMin:H*0.21, yMax:H*0.56 },
        { index: 3, xMin:startX+sw*2, xMax:startX+sw*3, yMin:H*0.21, yMax:H*0.56 },
        { index: 2, xMin:startX+sw*3, xMax:startX+sw*4, yMin:H*0.21, yMax:H*0.56 },
        { index: 1, xMin:startX+sw*4, xMax:startX+sw*5, yMin:H*0.21, yMax:H*0.56 },
        { index: 0, xMin:startX+sw*5, xMax:startX+sw*6, yMin:H*0.21, yMax:H*0.56 },
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