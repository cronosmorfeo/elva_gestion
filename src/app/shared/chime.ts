// A short, neutral two-note chime made with the Web Audio API (no sound file to download or license).
// Browsers only allow sound after the person has clicked or typed on the page once, so the audio is
// unlocked on that first gesture. After that it also plays while the tab is in the background or minimized.
let context: AudioContext | undefined;

function audioContext(): AudioContext | undefined {
  if (context) return context;
  const Ctx =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return undefined;
  context = new Ctx();
  return context;
}

// Call once at start: the first click or key press unlocks the audio for the rest of the visit.
export function unlockChimeOnFirstGesture(): void {
  if (typeof document === 'undefined') return;
  const unlock = (): void => {
    try {
      void audioContext()?.resume();
    } catch {
      // No Web Audio: the system notification sound is used instead.
    }
    document.removeEventListener('pointerdown', unlock, true);
    document.removeEventListener('keydown', unlock, true);
  };
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);
}

// Plays the chime and returns true, or returns false when the browser does not allow sound yet
// (nobody has clicked the page since it opened), so the caller can let the system sound play instead.
export function playChime(): boolean {
  try {
    const ctx = audioContext();
    if (!ctx || ctx.state !== 'running') return false;
    const start = ctx.currentTime + 0.01;
    note(ctx, 880, start); // A5
    note(ctx, 1318.5, start + 0.16); // E6
    return true;
  } catch {
    return false;
  }
}

function note(ctx: AudioContext, frequency: number, at: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  // Soft attack and fade, so it is noticeable without being harsh.
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.18, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, at + 0.35);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.36);
}
