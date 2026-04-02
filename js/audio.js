// Tone.js 音频引擎：钢琴采样、多音色、延音

const SAMPLER_BASE_URL = 'https://tonejs.github.io/audio/salamander/';

// Salamander Grand Piano 采样映射（每隔几个半音取一个采样，Tone.js 自动插值）
const PIANO_SAMPLES = {
  A3: 'A3.mp3',
  A4: 'A4.mp3',
  A5: 'A5.mp3',
  C3: 'C3.mp3',
  C4: 'C4.mp3',
  C5: 'C5.mp3',
  'D#3': 'Ds3.mp3',
  'D#4': 'Ds4.mp3',
  'F#3': 'Fs3.mp3',
  'F#4': 'Fs4.mp3',
};

// 音名转换：Db3 → C#3（Tone.js 使用 # 而非 b）
function toToneNote(note) {
  return note
    .replace('Db', 'C#')
    .replace('Eb', 'D#')
    .replace('Gb', 'F#')
    .replace('Ab', 'G#')
    .replace('Bb', 'A#');
}

export class AudioEngine {
  constructor() {
    this.sampler = null;
    this.synths = {};
    this.currentInstrument = 'piano';
    this.sustainOn = false;
    this.sustainedNotes = new Set();
    this.isLoaded = false;
    this.reverb = null;
  }

  async init() {
    // 混响效果
    this.reverb = new Tone.Reverb({ decay: 1.5, wet: 0.2 }).toDestination();

    // 钢琴采样
    this.sampler = new Tone.Sampler({
      urls: PIANO_SAMPLES,
      baseUrl: SAMPLER_BASE_URL,
      release: 1,
      onload: () => {
        console.log('Piano samples loaded');
        this.isLoaded = true;
      },
    }).connect(this.reverb);

    // 电钢琴（FM合成）
    this.synths['electric-piano'] = new Tone.PolySynth(Tone.FMSynth, {
      maxPolyphony: 10,
      voice: Tone.FMSynth,
      options: {
        modulationIndex: 3,
        envelope: { attack: 0.01, decay: 0.5, sustain: 0.3, release: 0.8 },
      },
    }).connect(this.reverb);

    // 风琴
    this.synths['organ'] = new Tone.PolySynth(Tone.AMSynth, {
      maxPolyphony: 10,
      voice: Tone.AMSynth,
      options: {
        envelope: { attack: 0.05, decay: 0.1, sustain: 0.9, release: 0.3 },
      },
    }).connect(this.reverb);

    // 等待采样加载
    await Tone.loaded();
    this.isLoaded = true;
  }

  setInstrument(name) {
    this.currentInstrument = name;
  }

  setSustain(on) {
    this.sustainOn = on;
    if (!on) {
      // 释放所有延音中的音符
      for (const note of this.sustainedNotes) {
        this._triggerRelease(note);
      }
      this.sustainedNotes.clear();
    }
  }

  noteOn(note, velocity = 0.7) {
    if (!this.isLoaded) return;

    const toneNote = toToneNote(note);
    const vol = Tone.gainToDb(velocity);

    if (this.currentInstrument === 'piano') {
      this.sampler.triggerAttack(toneNote, Tone.now(), velocity);
    } else {
      const synth = this.synths[this.currentInstrument];
      if (synth) {
        synth.triggerAttack(toneNote, Tone.now(), velocity);
      }
    }
  }

  noteOff(note) {
    if (!this.isLoaded) return;

    if (this.sustainOn) {
      this.sustainedNotes.add(note);
      return;
    }

    this._triggerRelease(note);
  }

  _triggerRelease(note) {
    const toneNote = toToneNote(note);

    if (this.currentInstrument === 'piano') {
      this.sampler.triggerRelease(toneNote, Tone.now());
    } else {
      const synth = this.synths[this.currentInstrument];
      if (synth) {
        synth.triggerRelease(toneNote, Tone.now());
      }
    }
  }

  async ensureStarted() {
    if (Tone.context.state !== 'running') {
      await Tone.start();
    }
  }
}
