// 录制与回放

export class Recorder {
  constructor(audioEngine) {
    this.audio = audioEngine;
    this.isRecording = false;
    this.isPlaying = false;
    this.events = [];
    this.startTime = 0;
    this.playbackTimer = null;
    this.onPlaybackEnd = null;
    this.onNoteHighlight = null;
  }

  startRecording() {
    this.events = [];
    this.startTime = performance.now();
    this.isRecording = true;
  }

  stopRecording() {
    this.isRecording = false;
    // 关闭所有未结束的音符
    for (const evt of this.events) {
      if (evt.type === 'noteOn' && evt.duration === undefined) {
        evt.duration = performance.now() - this.startTime - evt.time;
      }
    }
    return this.events.length > 0;
  }

  recordNoteOn(note, velocity) {
    if (!this.isRecording) return;
    this.events.push({
      type: 'noteOn',
      note,
      velocity,
      time: performance.now() - this.startTime,
    });
  }

  recordNoteOff(note) {
    if (!this.isRecording) return;
    const now = performance.now() - this.startTime;
    // 找到最近一个同音符的 noteOn 并计算 duration
    for (let i = this.events.length - 1; i >= 0; i--) {
      const evt = this.events[i];
      if (evt.type === 'noteOn' && evt.note === note && evt.duration === undefined) {
        evt.duration = now - evt.time;
        break;
      }
    }
  }

  play() {
    if (this.events.length === 0 || this.isPlaying) return;
    this.isPlaying = true;

    const noteOnEvents = this.events.filter((e) => e.type === 'noteOn');
    let idx = 0;

    const scheduleNext = () => {
      if (idx >= noteOnEvents.length) {
        this.isPlaying = false;
        if (this.onPlaybackEnd) this.onPlaybackEnd();
        return;
      }

      const evt = noteOnEvents[idx];
      const delay = idx === 0 ? 0 : evt.time - noteOnEvents[idx - 1].time;

      this.playbackTimer = setTimeout(() => {
        this.audio.noteOn(evt.note, evt.velocity);
        if (this.onNoteHighlight) this.onNoteHighlight(evt.note);

        // 自动 noteOff
        const dur = evt.duration || 300;
        setTimeout(() => {
          this.audio.noteOff(evt.note);
          if (this.onNoteHighlight) this.onNoteHighlight(null);
        }, dur);

        idx++;
        scheduleNext();
      }, delay);
    };

    scheduleNext();
  }

  stopPlayback() {
    this.isPlaying = false;
    if (this.playbackTimer) {
      clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
    }
  }

  exportJSON() {
    return JSON.stringify(this.events, null, 2);
  }

  importJSON(json) {
    try {
      const data = JSON.parse(json);
      if (Array.isArray(data)) {
        this.events = data;
        return true;
      }
    } catch (e) {
      console.error('Import failed:', e);
    }
    return false;
  }

  hasRecording() {
    return this.events.length > 0;
  }
}
