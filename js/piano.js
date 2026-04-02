// 虚拟钢琴键盘：布局、碰撞检测、状态管理

const NOTES_IN_OCTAVE = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const WHITE_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const BLACK_NOTES = ['Db', 'Eb', 'Gb', 'Ab', 'Bb'];
const TIP_INDICES = [4, 8, 12, 16, 20];

// 滑动平均滤波
const SMOOTHING_ALPHA = 0.4;

export class Piano {
  constructor() {
    this.keys = [];
    this.pressedKeys = new Set();
    this.onNoteOn = null;
    this.onNoteOff = null;

    // 每个指尖的平滑坐标 { handIdx_tipIdx: {x, y} }
    this.smoothedTips = {};
    // 每个指尖上一帧的按键状态 { handIdx_tipIdx: noteName | null }
    this.tipStates = {};
  }

  buildLayout(canvasWidth, canvasHeight) {
    this.keys = [];

    const startOctave = 3;
    const endOctave = 4;
    const whiteKeysTotal = WHITE_NOTES.length * (endOctave - startOctave + 1);

    const keyboardHeight = canvasHeight * 0.28;
    const keyboardY = (canvasHeight - keyboardHeight) / 2;
    const whiteKeyWidth = canvasWidth / whiteKeysTotal;
    const blackKeyWidth = whiteKeyWidth * 0.6;
    const blackKeyHeight = keyboardHeight * 0.6;

    let whiteIdx = 0;
    for (let oct = startOctave; oct <= endOctave; oct++) {
      for (const note of NOTES_IN_OCTAVE) {
        const noteName = `${note}${oct}`;
        const isBlack = BLACK_NOTES.includes(note);

        if (!isBlack) {
          this.keys.push({
            note: noteName,
            label: `${note}${oct}`,
            isBlack: false,
            rect: {
              x: whiteIdx * whiteKeyWidth,
              y: keyboardY,
              w: whiteKeyWidth,
              h: keyboardHeight,
            },
          });
          whiteIdx++;
        } else {
          // 黑键位于前一个白键和后一个白键之间
          const bx = whiteIdx * whiteKeyWidth - blackKeyWidth / 2;
          this.keys.push({
            note: noteName,
            label: note,
            isBlack: true,
            rect: {
              x: bx,
              y: keyboardY,
              w: blackKeyWidth,
              h: blackKeyHeight,
            },
          });
        }
      }
    }

    return this.keys;
  }

  hitTest(px, py) {
    // 优先检测黑键
    for (const key of this.keys) {
      if (!key.isBlack) continue;
      const { x, y, w, h } = key.rect;
      if (px >= x && px <= x + w && py >= y && py <= y + h) {
        return key.note;
      }
    }
    // 再检测白键
    for (const key of this.keys) {
      if (key.isBlack) continue;
      const { x, y, w, h } = key.rect;
      if (px >= x && px <= x + w && py >= y && py <= y + h) {
        return key.note;
      }
    }
    return null;
  }

  update(multiHandLandmarks, canvasWidth, canvasHeight) {
    if (!multiHandLandmarks || this.keys.length === 0) return;

    const currentPressed = new Set();
    const firstWhiteKey = this.keys.find((k) => !k.isBlack);
    const keyboardTop = firstWhiteKey?.rect.y ?? canvasHeight * 0.36;
    const keyboardHeight = firstWhiteKey?.rect.h ?? canvasHeight * 0.28;
    // 按压触发线：琴键区域上方 40% 为悬停区，下方 60% 为按压区
    const pressThreshold = keyboardTop + keyboardHeight * 0.4;

    // DIP 关节索引（每个指尖对应的上一级关节）
    const DIP_FOR_TIP = { 4: 3, 8: 7, 12: 11, 16: 15, 20: 19 };

    for (let hIdx = 0; hIdx < multiHandLandmarks.length; hIdx++) {
      const landmarks = multiHandLandmarks[hIdx];

      for (const tipIdx of TIP_INDICES) {
        const id = `${hIdx}_${tipIdx}`;
        const lm = landmarks[tipIdx];
        const dipLm = landmarks[DIP_FOR_TIP[tipIdx]];
        const rawX = (1 - lm.x) * canvasWidth;
        const rawY = lm.y * canvasHeight;
        const dipY = dipLm.y * canvasHeight;

        // 滑动平均滤波
        if (!this.smoothedTips[id]) {
          this.smoothedTips[id] = { x: rawX, y: rawY, dipY };
        } else {
          this.smoothedTips[id].x =
            SMOOTHING_ALPHA * rawX + (1 - SMOOTHING_ALPHA) * this.smoothedTips[id].x;
          this.smoothedTips[id].y =
            SMOOTHING_ALPHA * rawY + (1 - SMOOTHING_ALPHA) * this.smoothedTips[id].y;
          this.smoothedTips[id].dipY =
            SMOOTHING_ALPHA * dipY + (1 - SMOOTHING_ALPHA) * this.smoothedTips[id].dipY;
        }

        const sx = this.smoothedTips[id].x;
        const sy = this.smoothedTips[id].y;
        const sdipY = this.smoothedTips[id].dipY;

        // 按压判定：指尖在琴键区域内 且 指尖 y 超过按压线 且 手指弯曲（指尖低于 DIP 关节）
        const inKeyArea = sy >= keyboardTop && sy <= keyboardTop + keyboardHeight;
        const pastPressLine = sy >= pressThreshold;
        const fingerCurled = sy > sdipY; // 指尖在 DIP 下方 = 手指弯曲按压

        if (inKeyArea && pastPressLine && fingerCurled) {
          const hitNote = this.hitTest(sx, sy);
          if (hitNote) {
            currentPressed.add(hitNote);

            const prevNote = this.tipStates[id];
            if (prevNote !== hitNote) {
              if (prevNote && this.onNoteOff) {
                this.onNoteOff(prevNote);
              }
              // 力度：基于按压深度
              const depth = (sy - pressThreshold) / (keyboardHeight * 0.6);
              const velocity = Math.min(1, Math.max(0.3, depth * 1.2));
              if (this.onNoteOn) {
                this.onNoteOn(hitNote, velocity);
              }
            }
            this.tipStates[id] = hitNote;
          } else {
            this._releaseIfNeeded(id);
          }
        } else {
          this._releaseIfNeeded(id);
        }
      }
    }

    // 释放不再被任何指尖按住的键
    for (const note of this.pressedKeys) {
      if (!currentPressed.has(note) && this.onNoteOff) {
        this.onNoteOff(note);
      }
    }
    this.pressedKeys = currentPressed;
  }

  _releaseIfNeeded(id) {
    const prevNote = this.tipStates[id];
    if (prevNote) {
      if (this.onNoteOff) {
        this.onNoteOff(prevNote);
      }
      this.tipStates[id] = null;
    }
  }

  // 清除追踪状态（手消失时调用）
  clearTracking() {
    for (const id in this.tipStates) {
      this._releaseIfNeeded(id);
    }
    this.smoothedTips = {};
    this.tipStates = {};
    this.pressedKeys.clear();
  }
}
