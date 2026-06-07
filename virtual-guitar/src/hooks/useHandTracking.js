import { useRef, useEffect } from 'react';

export function useHandTracking({ videoRef, onResults }) {
    const cameraRef = useRef(null);
    const onResultsRef = useRef(onResults);

    useEffect(() => {
        onResultsRef.current = onResults;
    }, [onResults]);

    useEffect(() => {
        if (!videoRef.current) return;

        const hands = new window.Hands({
            locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
        });

        hands.setOptions({
            maxNumHands: 2,
            modelComplexity: 1,
            minDetectionConfidence: 0.35,
            minTrackingConfidence: 0.40,
        });

        hands.onResults((results) => {
            onResultsRef.current(results);
        });

        cameraRef.current = new window.Camera(videoRef.current, {
            onFrame: async () => {
                await hands.send({ image: videoRef.current });
            },
            width: 1280,
            height: 720,
        });

        cameraRef.current.start();

        return () => {
            if (cameraRef.current) cameraRef.current.stop();
        };
    }, []);
}
