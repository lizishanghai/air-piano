// 教学模式：预设曲目 + 引导提示

const SONGS = {
  twinkle: {
    name: '小星星',
    notes: [
      'C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'G4', null,
      'F4', 'F4', 'E4', 'E4', 'D4', 'D4', 'C4', null,
      'G4', 'G4', 'F4', 'F4', 'E4', 'E4', 'D4', null,
      'G4', 'G4', 'F4', 'F4', 'E4', 'E4', 'D4', null,
      'C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'G4', null,
      'F4', 'F4', 'E4', 'E4', 'D4', 'D4', 'C4',
    ],
  },
  'ode-to-joy': {
    name: '欢乐颂',
    notes: [
      'E4', 'E4', 'F4', 'G4', 'G4', 'F4', 'E4', 'D4',
      'C4', 'C4', 'D4', 'E4', 'E4', null, 'D4', 'D4', null,
      'E4', 'E4', 'F4', 'G4', 'G4', 'F4', 'E4', 'D4',
      'C4', 'C4', 'D4', 'E4', 'D4', null, 'C4', 'C4',
    ],
  },
  mary: {
    name: '玛丽有只小羊羔',
    notes: [
      'E4', 'D4', 'C4', 'D4', 'E4', 'E4', 'E4', null,
      'D4', 'D4', 'D4', null, 'E4', 'G4', 'G4', null,
      'E4', 'D4', 'C4', 'D4', 'E4', 'E4', 'E4', 'E4',
      'D4', 'D4', 'E4', 'D4', 'C4',
    ],
  },
};

export class Teaching {
  constructor() {
    this.isActive = false;
    this.currentSong = null;
    this.noteIndex = 0;
    this.correctCount = 0;
    this.totalCount = 0;
    this.onStatusUpdate = null;
  }

  start(songId) {
    const song = SONGS[songId];
    if (!song) return false;

    this.isActive = true;
    this.currentSong = song;
    this.noteIndex = 0;
    this.correctCount = 0;
    this.totalCount = 0;
    this._skipRests();
    return true;
  }

  stop() {
    this.isActive = false;
    this.currentSong = null;
    this.noteIndex = 0;
  }

  getCurrentTargetNote() {
    if (!this.isActive || !this.currentSong) return null;
    if (this.noteIndex >= this.currentSong.notes.length) return null;
    return this.currentSong.notes[this.noteIndex];
  }

  onNotePlayed(note) {
    if (!this.isActive) return null;

    const target = this.getCurrentTargetNote();
    if (!target) return null;

    this.totalCount++;
    const isCorrect = note === target;

    if (isCorrect) {
      this.correctCount++;
      this.noteIndex++;
      this._skipRests();

      // 曲子结束
      if (this.noteIndex >= this.currentSong.notes.length) {
        const accuracy = Math.round((this.correctCount / this.totalCount) * 100);
        const result = { finished: true, accuracy, song: this.currentSong.name };
        if (this.onStatusUpdate) this.onStatusUpdate(result);
        return result;
      }
    }

    const result = {
      finished: false,
      correct: isCorrect,
      target,
      played: note,
      progress: `${this.noteIndex}/${this.currentSong.notes.filter((n) => n).length}`,
    };
    if (this.onStatusUpdate) this.onStatusUpdate(result);
    return result;
  }

  _skipRests() {
    while (
      this.noteIndex < this.currentSong.notes.length &&
      this.currentSong.notes[this.noteIndex] === null
    ) {
      this.noteIndex++;
    }
  }

  getProgress() {
    if (!this.currentSong) return '';
    const total = this.currentSong.notes.filter((n) => n).length;
    return `${this.currentSong.name}: ${this.noteIndex}/${total}`;
  }

  static getSongList() {
    return Object.entries(SONGS).map(([id, song]) => ({ id, name: song.name }));
  }
}
