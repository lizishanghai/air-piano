// 主入口：初始化各模块，连接事件

import { HandTracker } from './hand-tracker.js';
import { Renderer } from './renderer.js';
import { Piano } from './piano.js';
import { AudioEngine } from './audio.js';
import { Recorder } from './recorder.js';
import { Teaching } from './teaching.js';

const handTracker = new HandTracker();
const renderer = new Renderer(document.getElementById('canvas'));
const piano = new Piano();
const audio = new AudioEngine();
const recorder = new Recorder(audio);
const teaching = new Teaching();

// DOM
const loadingScreen = document.getElementById('loading-screen');
const loadingText = document.getElementById('loading-text');
const app = document.getElementById('app');
const video = document.getElementById('webcam');
const canvas = document.getElementById('canvas');
const fpsDisplay = document.getElementById('fps-display');
const handsDisplay = document.getElementById('hands-display');
const modeDisplay = document.getElementById('mode-display');

// Controls
const instrumentSelect = document.getElementById('instrument-select');
const sustainBtn = document.getElementById('sustain-btn');
const recordBtn = document.getElementById('record-btn');
const playBtn = document.getElementById('play-btn');
const exportBtn = document.getElementById('export-btn');
const importBtn = document.getElementById('import-btn');
const importInput = document.getElementById('import-input');
const teachBtn = document.getElementById('teach-btn');
const songSelect = document.getElementById('song-select');

// State
let lastFrameTime = 0;
let frameCount = 0;
let fps = 0;
let teachingHighlightNote = null;
let latestResults = null;
let animFrameId = null;

// -- Resize --
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  renderer.resize(canvas.width, canvas.height);
  piano.buildLayout(canvas.width, canvas.height);
}
window.addEventListener('resize', resizeCanvas);

// -- FPS counter --
function updateFPS() {
  frameCount++;
  const now = performance.now();
  if (now - lastFrameTime >= 1000) {
    fps = frameCount;
    frameCount = 0;
    lastFrameTime = now;
    fpsDisplay.textContent = `FPS: ${fps}`;
  }
}

// -- MediaPipe results callback --
function onHandResults(results) {
  latestResults = results;
}

// -- Main render loop --
function renderLoop() {
  animFrameId = requestAnimationFrame(renderLoop);
  updateFPS();

  renderer.clear();

  if (cameraAvailable && latestResults) {
    renderer.drawCamera(latestResults.image);
    const hands = latestResults.multiHandLandmarks;
    handsDisplay.textContent = `手: ${hands ? hands.length : 0}`;

    if (hands && hands.length > 0) {
      piano.update(hands, canvas.width, canvas.height);
      renderer.drawHands(hands);
      renderer.drawFingerTips(hands, piano.keys);
    } else {
      piano.clearTracking();
    }
  } else if (cameraAvailable) {
    // Camera active but no results yet — draw dark bg
    const ctx = renderer.ctx;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('正在加载手部追踪模型...', canvas.width / 2, canvas.height * 0.35);
    ctx.textAlign = 'left';
  } else {
    // No camera — dark bg with hint
    const ctx = renderer.ctx;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('摄像头未可用 — 可用鼠标/触摸点击琴键', canvas.width / 2, canvas.height * 0.35);
    ctx.textAlign = 'left';
  }

  renderer.drawPianoKeys(piano.keys, piano.pressedKeys, teachingHighlightNote);
}

// -- Piano note events --
piano.onNoteOn = (note, velocity) => {
  audio.noteOn(note, velocity);
  recorder.recordNoteOn(note, velocity);

  if (teaching.isActive) {
    const result = teaching.onNotePlayed(note);
    if (result) {
      teachingHighlightNote = teaching.getCurrentTargetNote();
      if (result.finished) {
        modeDisplay.textContent = `${result.song} 完成! 准确率: ${result.accuracy}%`;
        setTimeout(() => {
          teaching.stop();
          teachBtn.classList.remove('active');
          songSelect.classList.add('hidden');
          teachingHighlightNote = null;
          modeDisplay.textContent = '';
        }, 3000);
      } else {
        modeDisplay.textContent = teaching.getProgress();
      }
    }
  }
};

piano.onNoteOff = (note) => {
  audio.noteOff(note);
  recorder.recordNoteOff(note);
};

// -- Controls --
instrumentSelect.addEventListener('change', (e) => {
  audio.setInstrument(e.target.value);
});

sustainBtn.addEventListener('click', () => {
  const active = !sustainBtn.classList.contains('active');
  sustainBtn.classList.toggle('active', active);
  audio.setSustain(active);
});

recordBtn.addEventListener('click', async () => {
  await audio.ensureStarted();

  if (recorder.isRecording) {
    const hasData = recorder.stopRecording();
    recordBtn.textContent = '录制';
    recordBtn.classList.remove('recording');
    playBtn.disabled = !hasData;
    exportBtn.disabled = !hasData;
    modeDisplay.textContent = '';
  } else {
    recorder.startRecording();
    recordBtn.textContent = '停止';
    recordBtn.classList.add('recording');
    modeDisplay.textContent = '录制中...';
  }
});

playBtn.addEventListener('click', async () => {
  await audio.ensureStarted();

  if (recorder.isPlaying) {
    recorder.stopPlayback();
    playBtn.textContent = '回放';
    modeDisplay.textContent = '';
  } else {
    playBtn.textContent = '停止';
    modeDisplay.textContent = '回放中...';
    recorder.onPlaybackEnd = () => {
      playBtn.textContent = '回放';
      modeDisplay.textContent = '';
    };
    recorder.play();
  }
});

exportBtn.addEventListener('click', () => {
  const json = recorder.exportJSON();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `air-piano-recording-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

importBtn.addEventListener('click', () => {
  importInput.click();
});

importInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    if (recorder.importJSON(ev.target.result)) {
      playBtn.disabled = false;
      exportBtn.disabled = false;
      modeDisplay.textContent = '录制已导入';
      setTimeout(() => {
        modeDisplay.textContent = '';
      }, 2000);
    }
  };
  reader.readAsText(file);
  importInput.value = '';
});

teachBtn.addEventListener('click', async () => {
  await audio.ensureStarted();

  if (teaching.isActive) {
    teaching.stop();
    teachBtn.classList.remove('active');
    songSelect.classList.add('hidden');
    teachingHighlightNote = null;
    modeDisplay.textContent = '';
  } else {
    teachBtn.classList.add('active');
    songSelect.classList.remove('hidden');
    teaching.start(songSelect.value);
    teachingHighlightNote = teaching.getCurrentTargetNote();
    modeDisplay.textContent = teaching.getProgress();
  }
});

songSelect.addEventListener('change', () => {
  if (teaching.isActive) {
    teaching.start(songSelect.value);
    teachingHighlightNote = teaching.getCurrentTargetNote();
    modeDisplay.textContent = teaching.getProgress();
  }
});

// -- Mouse/Touch fallback (when camera unavailable) --
let mouseDown = false;

canvas.addEventListener('mousedown', async (e) => {
  await audio.ensureStarted();
  mouseDown = true;
  handlePointer(e.clientX, e.clientY);
});

canvas.addEventListener('mousemove', (e) => {
  if (mouseDown) handlePointer(e.clientX, e.clientY);
});

canvas.addEventListener('mouseup', () => {
  mouseDown = false;
  for (const note of piano.pressedKeys) {
    piano.onNoteOff(note);
  }
  piano.pressedKeys.clear();

});

canvas.addEventListener('touchstart', async (e) => {
  e.preventDefault();
  await audio.ensureStarted();
  for (const touch of e.touches) {
    handlePointer(touch.clientX, touch.clientY);
  }
});

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  // Release all, then re-detect
  for (const note of piano.pressedKeys) {
    audio.noteOff(note);
  }
  piano.pressedKeys.clear();
  for (const touch of e.touches) {
    handlePointer(touch.clientX, touch.clientY);
  }
});

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  for (const note of piano.pressedKeys) {
    piano.onNoteOff(note);
  }
  piano.pressedKeys.clear();

});

function handlePointer(px, py) {
  const hitNote = piano.hitTest(px, py);
  if (hitNote && !piano.pressedKeys.has(hitNote)) {
    piano.pressedKeys.add(hitNote);
    piano.onNoteOn(hitNote, 0.7);
  }

}

let cameraAvailable = false;

// -- Init --
async function init() {
  try {
    resizeCanvas();

    loadingText.textContent = '正在加载音频采样...';
    await audio.init();

    loadingText.textContent = '正在初始化手部追踪...';

    try {
      await handTracker.init(video, onHandResults);
      loadingText.textContent = '正在启动摄像头...';
      await handTracker.start();
      cameraAvailable = true;
    } catch (camErr) {
      console.warn('Camera unavailable, using mouse/touch fallback:', camErr.message);
      cameraAvailable = false;
    }

    // 隐藏加载画面
    loadingScreen.classList.add('hidden');
    app.classList.remove('hidden');

    // 启动渲染循环
    renderLoop();

    // 首次点击启动音频上下文
    document.addEventListener(
      'click',
      async () => {
        await audio.ensureStarted();
      },
      { once: true }
    );
  } catch (err) {
    loadingText.textContent = `加载失败: ${err.message}`;
    console.error(err);
  }
}

init();
