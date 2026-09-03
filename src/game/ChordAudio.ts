import type { ServiceType } from "../jigsaw/types.js";

const PLACEMENT_PITCHES: Readonly<Record<ServiceType, number>> = {
  generator: 523.25,
  water: 587.33,
  farm: 659.25,
  factory: 392,
};

export class ChordAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;

    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(enabled ? 0.4 : 0.0001, this.context.currentTime, 0.02);
    }
  }

  playPlacement(service: ServiceType): void {
    this.playCharm(PLACEMENT_PITCHES[service], 0.28, 0.06);
  }

  playActivation(): void {
    this.playCharm(659.25, 0.24, 0.045);
    this.playCharm(783.99, 0.3, 0.038, 0.075);
  }

  playConnectionChain(services: readonly ServiceType[]): void {
    services.forEach((service, index) => {
      this.playCharm(PLACEMENT_PITCHES[service], 0.22, 0.035, 0.06 + index * 0.085);
    });
  }

  playCompletion(): void {
    this.playCharm(523.25, 0.5, 0.045);
    this.playCharm(659.25, 0.5, 0.04, 0.07);
    this.playCharm(783.99, 0.58, 0.035, 0.14);
  }

  playUndo(): void {
    this.playCharm(293.66, 0.16, 0.035);
  }

  private playCharm(frequency: number, duration: number, volume: number, delay = 0): void {
    this.playTone(frequency, duration, volume, "triangle", delay);
    this.playTone(frequency * 2, duration * 0.62, volume * 0.11, "sine", delay + 0.008);
    this.playTone(frequency * 3, duration * 0.44, volume * 0.035, "sine", delay + 0.016);
  }

  private playTone(frequency: number, duration: number, volume: number, type: OscillatorType, delay = 0): void {
    const context = this.getContext();

    if (!context || !this.master) {
      return;
    }

    const startsAt = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startsAt);
    gain.gain.setValueAtTime(0.0001, startsAt);
    const attack = Math.min(0.008, duration * 0.1);
    const releaseStartsAt = startsAt + Math.max(attack, duration * 0.16);

    gain.gain.exponentialRampToValueAtTime(volume, startsAt + attack);
    gain.gain.setValueAtTime(volume * 0.82, releaseStartsAt);
    gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(startsAt);
    oscillator.stop(startsAt + duration + 0.02);
  }

  private getContext(): AudioContext | null {
    if (!this.enabled || typeof window === "undefined") {
      return null;
    }

    if (this.context === null) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.4;
      this.master.connect(this.context.destination);
    }

    if (this.context.state === "suspended") {
      void this.context.resume();
    }

    return this.context;
  }
}
