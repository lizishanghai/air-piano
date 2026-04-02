// MediaPipe Hands 封装
export class HandTracker {
  constructor() {
    this.hands = null;
    this.camera = null;
    this.onResults = null;
    this.isRunning = false;
  }

  async init(videoElement, onResults) {
    this.onResults = onResults;

    this.hands = new window.Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`,
    });

    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.5,
    });

    this.hands.onResults((results) => {
      if (this.onResults) this.onResults(results);
    });

    this.camera = new window.Camera(videoElement, {
      onFrame: async () => {
        if (this.isRunning) {
          await this.hands.send({ image: videoElement });
        }
      },
      width: 1280,
      height: 720,
    });
  }

  async start() {
    this.isRunning = true;
    await this.camera.start();
  }

  stop() {
    this.isRunning = false;
    if (this.camera) this.camera.stop();
  }
}
