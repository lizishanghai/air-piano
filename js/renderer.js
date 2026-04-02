// Canvas 渲染：摄像头画面、彩虹骨骼、琴键

const FINGER_COLORS = [
  '#FFFF00', // 拇指 - 黄
  '#8000FF', // 食指 - 紫
  '#00FFFF', // 中指 - 青
  '#00FF00', // 无名指 - 绿
  '#FF0000', // 小指 - 红
];

const FINGER_CONNECTIONS = [
  [0, 1, 2, 3, 4],       // 拇指
  [0, 5, 6, 7, 8],       // 食指
  [0, 9, 10, 11, 12],    // 中指
  [0, 13, 14, 15, 16],   // 无名指
  [0, 17, 18, 19, 20],   // 小指
];

const TIP_INDICES = [4, 8, 12, 16, 20];

// 手掌额外连线（腕部到各指根）
const PALM_CONNECTIONS = [
  [0, 5], [5, 9], [9, 13], [13, 17], [0, 17],
];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawCamera(image) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.save();
    // 镜像翻转
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(image, 0, 0, w, h);
    ctx.restore();
  }

  drawHands(multiHandLandmarks) {
    if (!multiHandLandmarks) return;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    for (const landmarks of multiHandLandmarks) {
      // 转换为像素坐标（已镜像）
      const pts = landmarks.map((lm) => ({
        x: (1 - lm.x) * w,
        y: lm.y * h,
        z: lm.z,
      }));

      // 绘制手掌连线
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 2;
      for (const [i, j] of PALM_CONNECTIONS) {
        ctx.beginPath();
        ctx.moveTo(pts[i].x, pts[i].y);
        ctx.lineTo(pts[j].x, pts[j].y);
        ctx.stroke();
      }

      // 绘制彩虹手指骨骼
      for (let f = 0; f < FINGER_CONNECTIONS.length; f++) {
        const color = FINGER_COLORS[f];
        const indices = FINGER_CONNECTIONS[f];

        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.shadowColor = color;
        ctx.shadowBlur = 6;

        for (let i = 0; i < indices.length - 1; i++) {
          const start = pts[indices[i]];
          const end = pts[indices[i + 1]];
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();
        }
      }
      ctx.shadowBlur = 0;

      // 绘制关节点
      for (let i = 0; i < pts.length; i++) {
        const isTip = TIP_INDICES.includes(i);
        const radius = isTip ? 6 : 3;
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, radius, 0, Math.PI * 2);
        ctx.fillStyle = isTip ? '#fff' : 'rgba(255, 255, 255, 0.7)';
        ctx.fill();
        if (isTip) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  }

  drawPianoKeys(keys, pressedKeys, teachingHighlight) {
    const ctx = this.ctx;

    for (const key of keys) {
      if (key.isBlack) continue; // 先画白键
      this._drawKey(ctx, key, pressedKeys, teachingHighlight);
    }
    for (const key of keys) {
      if (!key.isBlack) continue; // 再画黑键（叠在上面）
      this._drawKey(ctx, key, pressedKeys, teachingHighlight);
    }
  }

  _drawKey(ctx, key, pressedKeys, teachingHighlight) {
    const isPressed = pressedKeys.has(key.note);
    const isTeaching = teachingHighlight === key.note;

    ctx.save();

    if (key.isBlack) {
      if (isPressed) {
        ctx.fillStyle = 'rgba(79, 195, 247, 0.9)';
      } else if (isTeaching) {
        ctx.fillStyle = 'rgba(255, 193, 7, 0.8)';
      } else {
        ctx.fillStyle = 'rgba(20, 20, 20, 0.85)';
      }
    } else {
      if (isPressed) {
        ctx.fillStyle = 'rgba(79, 195, 247, 0.7)';
      } else if (isTeaching) {
        ctx.fillStyle = 'rgba(255, 193, 7, 0.5)';
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      }
    }

    const r = 4;
    const { x, y, w, h } = key.rect;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, [0, 0, r, r]);
    ctx.fill();

    // 边框
    ctx.strokeStyle = key.isBlack
      ? 'rgba(255, 255, 255, 0.1)'
      : 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 音名标签
    if (!key.isBlack) {
      ctx.fillStyle = isPressed ? '#fff' : 'rgba(255, 255, 255, 0.4)';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(key.label, x + w / 2, y + h - 8);
    }

    // 按下时发光效果
    if (isPressed) {
      ctx.shadowColor = '#4fc3f7';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, [0, 0, r, r]);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawFingerTips(multiHandLandmarks, pianoKeys) {
    if (!multiHandLandmarks) return;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    for (const landmarks of multiHandLandmarks) {
      for (const tipIdx of TIP_INDICES) {
        const lm = landmarks[tipIdx];
        const px = (1 - lm.x) * w;
        const py = lm.y * h;

        // 指尖在琴键区域时画下压指示线
        const keyArea = pianoKeys.length > 0 ? pianoKeys[0].rect.y : h * 0.7;
        if (py > keyArea - 30) {
          ctx.save();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = 'rgba(79, 195, 247, 0.5)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px, keyArea - 30);
          ctx.lineTo(px, py);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }
}
