/**
 * Synthesised sound effects (Web Audio, no files). On by default; M or the footer button
 * mutes, and the choice is remembered per device, so a room of laptops can be silenced once.
 *
 * Browsers only allow audio after a user gesture: the presenter calls `unlock()` on the
 * first key press or click. Sounds requested before that are silently skipped.
 */

const STORAGE_KEY = 'mcb:muted';
/** Same sound twice within this many ms plays once (held keys, rapid ticks). */
const MIN_GAP_MS = 60;

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode or blocked storage: the setting just isn't remembered */
  }
}

type Wave = OscillatorType;

class Sound {
  muted = storageGet(STORAGE_KEY) === '1';
  /** Called after mute changes (the footer re-renders). */
  onChange?: () => void;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private last = new Map<string, number>();

  /** Create or resume the audio context. Must run inside a user gesture. */
  unlock(): void {
    if (!this.ctx) {
      const AC =
        typeof window !== 'undefined'
          ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
          : undefined;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.35;
        this.master.connect(this.ctx.destination);
      } catch {
        this.ctx = null;
        return;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggle(): void {
    this.muted = !this.muted;
    storageSet(STORAGE_KEY, this.muted ? '1' : '0');
    this.onChange?.();
    if (!this.muted) this.verdict();
  }

  // ---- the sounds -------------------------------------------------------------------

  /** Dice tumbling: a few short filtered clicks. */
  dice(): void {
    const c = this.begin('dice');
    if (!c) return;
    [0, 0.055, 0.12, 0.2].forEach((t, i) => this.noise(c, t, 0.035, 0.5 - i * 0.08, 2400 - i * 300));
  }

  /** A run starts: a short rising blip. */
  runStart(): void {
    const c = this.begin('runStart');
    if (!c) return;
    this.tone(c, 0, 0.16, 330, 'triangle', 0.35, 520);
  }

  /** One batch of a build-up landed (1, 10, 100, ...). */
  tick(): void {
    const c = this.begin('tick');
    if (!c) return;
    this.tone(c, 0, 0.05, 1100, 'square', 0.08);
  }

  /** A result or verdict lands. */
  verdict(): void {
    const c = this.begin('verdict');
    if (!c) return;
    this.tone(c, 0, 0.14, 523.25, 'sine', 0.35);
    this.tone(c, 0.09, 0.22, 659.25, 'sine', 0.35);
  }

  /** A target band is hit: a brighter three-note chime. */
  targetHit(): void {
    const c = this.begin('targetHit');
    if (!c) return;
    [523.25, 659.25, 783.99].forEach((f, i) => this.tone(c, i * 0.08, 0.35, f, 'sine', 0.3));
  }

  // ---- synthesis helpers --------------------------------------------------------------

  /** The context if this sound may play now, else null (muted, locked, or just played). */
  private begin(name: string): AudioContext | null {
    if (this.muted || !this.ctx || !this.master || this.ctx.state === 'closed') return null;
    const now = performance.now();
    if (now - (this.last.get(name) ?? -Infinity) < MIN_GAP_MS) return null;
    this.last.set(name, now);
    return this.ctx;
  }

  private tone(c: AudioContext, at: number, dur: number, freq: number, wave: Wave, gain: number, freqEnd?: number): void {
    const t0 = c.currentTime + at;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(c: AudioContext, at: number, dur: number, gain: number, cutoff: number): void {
    const t0 = c.currentTime + at;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    // Cosmetic randomness only: never touches the simulation's seeded RNG.
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = cutoff;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(this.master!);
    src.start(t0);
  }
}

/** The app's shared sound player. */
export const sound = new Sound();
