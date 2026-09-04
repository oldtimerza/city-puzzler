const BAR_SECONDS = 4.8;
const LOOP_SECONDS = BAR_SECONDS * 4;
const HARP_CHORDS: readonly (readonly number[])[] = [
  [293.66, 349.23, 440, 587.33], // D minor add 9
  [233.08, 293.66, 349.23, 440], // B-flat major
  [261.63, 329.63, 392, 523.25], // F major add 9
  [261.63, 329.63, 392, 493.88], // C suspended
];
const ARPEGGIO = [0, 0.32, 0.64, 1.06, 2.4, 2.76] as const;

/** A small Web Audio harp loop that needs no downloaded music asset. */
export class HarpMusic {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;
  private started = false;
  private loopTimer: number | null = null;
  private nextLoopStart = 0;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stopLoop();
      this.setVolume(0.0001);
      return;
    }
    this.started = true;
    this.begin();
  }

  /** Call from a user gesture to comply with browser autoplay policies. */
  unlock(): void {
    if (!this.enabled) return;
    this.started = true;
    this.begin();
  }

  private begin(): void {
    const context = this.getContext();
    if (!context || !this.master || !this.started || !this.enabled) return;
    void context.resume().then(() => {
      if (!this.enabled || !this.started) return;
      this.setVolume(0.07);
      this.scheduleLoop();
    }).catch(() => undefined);
  }

  private scheduleLoop(): void {
    const context = this.context;
    if (!context || !this.enabled || this.loopTimer !== null) return;
    const start = Math.max(context.currentTime + 0.08, this.nextLoopStart);
    HARP_CHORDS.forEach((chord, index) => this.scheduleChord(chord, start + index * BAR_SECONDS));
    this.nextLoopStart = start + LOOP_SECONDS;
    this.loopTimer = window.setTimeout(() => {
      this.loopTimer = null;
      this.scheduleLoop();
    }, Math.max(0, this.nextLoopStart - context.currentTime - 0.25) * 1_000);
  }

  private scheduleChord(chord: readonly number[], startsAt: number): void {
    ARPEGGIO.forEach((offset, index) => {
      const note = chord[index % chord.length]! * (index === 3 ? 2 : 1);
      this.playString(note, startsAt + offset, index === 4 ? 0.085 : 0.12);
    });
  }

  private playString(frequency: number, startsAt: number, volume: number): void {
    const context = this.context;
    if (!context || !this.master) return;
    const oscillator = context.createOscillator();
    const overtone = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, startsAt);
    overtone.type = "sine";
    overtone.frequency.setValueAtTime(frequency * 2, startsAt);
    gain.gain.setValueAtTime(0.0001, startsAt);
    gain.gain.exponentialRampToValueAtTime(volume, startsAt + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + 2.7);
    oscillator.connect(gain);
    overtone.connect(gain);
    gain.connect(this.master);
    oscillator.start(startsAt);
    overtone.start(startsAt);
    oscillator.stop(startsAt + 2.75);
    overtone.stop(startsAt + 2.75);
  }

  private stopLoop(): void {
    if (this.loopTimer !== null) window.clearTimeout(this.loopTimer);
    this.loopTimer = null;
    this.nextLoopStart = 0;
  }

  private setVolume(value: number): void {
    if (this.context && this.master) this.master.gain.setTargetAtTime(value, this.context.currentTime, 0.08);
  }

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (this.context === null) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.0001;
      this.master.connect(this.context.destination);
    }
    return this.context;
  }
}
