/**
 * TAIGI FIGHTER 700 - Retro Arcade Audio Engine
 * Pure Web Audio API synthesized sound effects & 16-bit chiptune BGM
 * + MOE authentic Taiwanese voice playback.
 */
class ArcadeAudioManager {
  constructor() {
    this.ctx = null;
    this.bgmNode = null;
    this.bgmTimer = null;
    this.bgmEnabled = true;
    this.sfxEnabled = true;
    this.voiceEnabled = true;
    this.currentTrack = null;
    this.currentVoiceAudio = new Audio();
    this.currentVoiceAudio.crossOrigin = 'anonymous';
    this.unlocked = false;
  }

  init() {
    if (this.unlocked && this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        if (this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
        this.unlocked = true;
      }
    } catch (e) {
      console.warn('AudioContext not available:', e);
    }
  }

  // --- Retro Sound Effects ---

  playCoin() {
    if (!this.sfxEnabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(987.77, now); // B5
    osc.frequency.setValueAtTime(1318.51, now + 0.08); // E6
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.45);
  }

  playSelect() {
    if (!this.sfxEnabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  playStart() {
    if (!this.sfxEnabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const freqs = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99];
    freqs.forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(f, now + idx * 0.05);
      gain.gain.setValueAtTime(0.2, now + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.05);
      osc.stop(now + idx * 0.05 + 0.25);
    });
  }

  playLightHit() {
    if (!this.sfxEnabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Noise snap
    const bufferSize = this.ctx.sampleRate * 0.08;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.02));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
    noise.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);
  }

  playHeavyHit() {
    if (!this.sfxEnabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Low frequency crunch
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.25);
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);

    // Noise burst
    const bufferSize = this.ctx.sampleRate * 0.15;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.04));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const ngain = this.ctx.createGain();
    ngain.gain.setValueAtTime(0.5, now);
    ngain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    noise.connect(ngain);
    ngain.connect(this.ctx.destination);
    noise.start(now);
  }

  playHadouken() {
    if (!this.sfxEnabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Energy whoosh: descending filter over noise + dual tone
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc1.type = 'sawtooth';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(420, now);
    osc1.frequency.exponentialRampToValueAtTime(140, now + 0.4);
    osc2.frequency.setValueAtTime(630, now);
    osc2.frequency.exponentialRampToValueAtTime(210, now + 0.4);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);
    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.45);
    osc2.stop(now + 0.45);
  }

  playShoryuken() {
    if (!this.sfxEnabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Rising roar
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(750, now + 0.35);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  playSuper() {
    if (!this.sfxEnabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Dramatic explosion & chord
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.2);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.7);
    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.75);
  }

  playKO() {
    if (!this.sfxEnabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Arcade Gong / Sub bass explosion
    const freqs = [110, 165, 220, 330];
    freqs.forEach(f => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 1.2);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.3);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 1.3);
    });
  }

  playVictory() {
    if (!this.sfxEnabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    // Classic Capcom victory arpeggio: C - E - G - C - G - C
    const notes = [
      { f: 523.25, t: 0.0, d: 0.15 },
      { f: 659.25, t: 0.15, d: 0.15 },
      { f: 783.99, t: 0.30, d: 0.15 },
      { f: 1046.50, t: 0.45, d: 0.40 },
      { f: 783.99, t: 0.85, d: 0.20 },
      { f: 1046.50, t: 1.05, d: 0.80 }
    ];
    notes.forEach(n => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(n.f, now + n.t);
      gain.gain.setValueAtTime(0.25, now + n.t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.t + n.d);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + n.t);
      osc.stop(now + n.t + n.d);
    });
  }

  playAnnouncer(text) {
    if (!this.sfxEnabled) return;
    // Web Speech API for classic 90s Capcom announcer
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = 1.15;
        utter.pitch = 0.85; // deep announcer
        utter.volume = 0.9;
        utter.lang = 'en-US';
        window.speechSynthesis.speak(utter);
      }
    } catch (e) {
      console.warn('Announcer synth error:', e);
    }
  }

  // --- Real MOE Taiwanese Pronunciation Stream ---

  playTaigiAudio(wordObj, onEnd) {
    if (!this.voiceEnabled || !wordObj || !wordObj.audioId) {
      if (onEnd) onEnd();
      return;
    }
    const audioUrl = `https://static.kiantiong.com/sutiau/${encodeURIComponent(wordObj.audioId)}.mp3`;
    this.currentVoiceAudio.pause();
    this.currentVoiceAudio.currentTime = 0;
    this.currentVoiceAudio.src = audioUrl;

    this.currentVoiceAudio.onended = () => {
      if (onEnd) onEnd();
    };
    this.currentVoiceAudio.onerror = (err) => {
      console.warn('Taigi audio stream failed:', audioUrl, err);
      // Fallback: try Web Speech synthesis for the Hanzi word
      this.playSpeechFallback(wordObj.word, onEnd);
    };

    const playPromise = this.currentVoiceAudio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Autoplay policy or fetch error
        if (onEnd) onEnd();
      });
    }
  }

  playSpeechFallback(text, onEnd) {
    try {
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'zh-TW';
        u.rate = 0.9;
        u.onend = () => { if (onEnd) onEnd(); };
        u.onerror = () => { if (onEnd) onEnd(); };
        window.speechSynthesis.speak(u);
      } else {
        if (onEnd) onEnd();
      }
    } catch (e) {
      if (onEnd) onEnd();
    }
  }

  stopTaigiAudio() {
    try {
      this.currentVoiceAudio.pause();
      this.currentVoiceAudio.currentTime = 0;
    } catch (e) {}
  }

  // --- Procedural 16-bit Retro Chiptune BGM ---

  startBGM(type = 'battle') {
    if (!this.bgmEnabled) return;
    this.init();
    if (!this.ctx) return;
    this.stopBGM();
    this.currentTrack = type;

    // Driving 90s Capcom fight theme synthesizer
    const bpm = (type === 'battle') ? 140 : 120;
    const stepTime = (60 / bpm) / 4; // 16th notes
    let step = 0;

    // Bass notes in D minor / A minor
    const bassline = (type === 'battle') 
      ? [146.83, 146.83, 220.00, 146.83, 174.61, 146.83, 196.00, 164.81] // D3, D3, A3, D3, F3, D3, G3, E3
      : [110.00, 130.81, 146.83, 164.81, 146.83, 130.81, 110.00, 146.83];

    // Melodic lead riff
    const leadRiff = (type === 'battle')
      ? [293.66, 0, 349.23, 0, 440.00, 392.00, 349.23, 0, 392.00, 0, 440.00, 0, 523.25, 440.00, 392.00, 349.23]
      : [220.00, 0, 261.63, 0, 329.63, 0, 261.63, 0, 220.00, 0, 196.00, 0, 220.00, 0, 0, 0];

    const intervalMs = stepTime * 1000;
    this.bgmTimer = setInterval(() => {
      if (!this.bgmEnabled || !this.ctx || this.ctx.state !== 'running') return;
      const t = this.ctx.currentTime;

      // Bass beat on every 2 steps
      if (step % 2 === 0) {
        const bassFreq = bassline[(step / 2) % bassline.length];
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(bassFreq / 2, t);
        gain.gain.setValueAtTime(0.08, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + stepTime * 1.8);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + stepTime * 1.8);
      }

      // Snare noise on beats 4 and 12
      if (step % 8 === 4) {
        const bufferSize = this.ctx.sampleRate * 0.05;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.015));
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.06, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        noise.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(t);
      }

      // Lead melody
      const leadNote = leadRiff[step % leadRiff.length];
      if (leadNote > 0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(leadNote, t);
        gain.gain.setValueAtTime(0.05, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + stepTime * 0.9);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + stepTime * 0.9);
      }

      step++;
    }, intervalMs);
  }

  stopBGM() {
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  toggleBGM() {
    this.bgmEnabled = !this.bgmEnabled;
    if (!this.bgmEnabled) {
      this.stopBGM();
    } else {
      this.startBGM(this.currentTrack || 'battle');
    }
    return this.bgmEnabled;
  }

  toggleSFX() {
    this.sfxEnabled = !this.sfxEnabled;
    return this.sfxEnabled;
  }

  toggleVoice() {
    this.voiceEnabled = !this.voiceEnabled;
    return this.voiceEnabled;
  }
}

window.arcadeAudio = new ArcadeAudioManager();
