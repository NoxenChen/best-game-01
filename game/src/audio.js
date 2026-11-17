// All sound is synthesized with WebAudio: no audio files, nothing fetched.
// Short effects are one oscillator or noise burst each; the music is a quiet
// generative loop (a minor-pentatonic pluck over a low drone) on a scheduler.
export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let muted = false;
  let musicTimer = null;
  let musicStep = 0;

  /** A minor-pentatonic walk, one note per step, looped. */
  const MELODY = [0, 3, 5, 7, 10, 12, 10, 7, 5, 3, 5, 7, 10, 12, 15, 12];
  const ROOT = 220; // A3

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.12;
      musicGain.connect(master);
      return true;
    } catch {
      return false;
    }
  }

  function tone({ type = 'sine', from = 440, to = null, dur = 0.12, vol = 0.2, at = 0, dest = null }) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(dest ?? master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise({ dur = 0.2, vol = 0.25, low = 400, at = 0 }) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + at;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = low;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  function musicTick() {
    if (!ctx || muted) return;
    const note = MELODY[musicStep % MELODY.length];
    const freq = ROOT * Math.pow(2, note / 12);
    tone({ type: 'triangle', from: freq, dur: 0.5, vol: 0.16, dest: musicGain });
    if (musicStep % 8 === 0) tone({ type: 'sine', from: ROOT / 2, dur: 1.6, vol: 0.22, dest: musicGain });
    if (musicStep % 16 === 14) tone({ type: 'sine', from: ROOT * Math.pow(2, 3 / 12), dur: 0.9, vol: 0.12, dest: musicGain });
    musicStep += 1;
  }

  return {
    /** Call from any user gesture: browsers block audio before one. */
    unlock() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (musicTimer === null) {
        musicTimer = window.setInterval(musicTick, 300);
      }
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() {
      return muted;
    },
    shoot() {
      tone({ type: 'square', from: 880, to: 320, dur: 0.07, vol: 0.08 });
    },
    hit() {
      noise({ dur: 0.05, vol: 0.1, low: 1800 });
    },
    die() {
      noise({ dur: 0.22, vol: 0.22, low: 900 });
      tone({ type: 'sine', from: 160, to: 40, dur: 0.25, vol: 0.25 });
    },
    hurt() {
      tone({ type: 'sawtooth', from: 220, to: 70, dur: 0.25, vol: 0.22 });
    },
    lanternHit() {
      tone({ type: 'sawtooth', from: 140, to: 55, dur: 0.3, vol: 0.2 });
      noise({ dur: 0.15, vol: 0.14, low: 500 });
    },
    pickup() {
      tone({ type: 'sine', from: 660, dur: 0.08, vol: 0.14 });
      tone({ type: 'sine', from: 990, dur: 0.12, vol: 0.14, at: 0.06 });
    },
    waveHorn() {
      tone({ type: 'sawtooth', from: 196, dur: 0.5, vol: 0.12 });
      tone({ type: 'sawtooth', from: 294, dur: 0.5, vol: 0.1, at: 0.02 });
    },
    upgrade() {
      [523, 659, 784].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.22, vol: 0.16, at: i * 0.07 }));
    },
    gameOver() {
      [392, 330, 262, 196].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.4, vol: 0.16, at: i * 0.18 }));
    },
    victory() {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ type: 'triangle', from: f, dur: 0.35, vol: 0.16, at: i * 0.09 }));
    },
  };
}
