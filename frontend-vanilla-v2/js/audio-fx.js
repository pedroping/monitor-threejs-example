// Web Audio API procedural retro sound synthesizer (zero asset weight).

let audioCtx = null;
let soundEnabled = true;
let userHasInteracted = false;

// Browsers only allow audio after a user gesture; unlock on the first one.
const onUserGesture = () => {
  userHasInteracted = true;
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  window.removeEventListener("pointerdown", onUserGesture);
  window.removeEventListener("keydown", onUserGesture);
  window.removeEventListener("touchstart", onUserGesture);
};
window.addEventListener("pointerdown", onUserGesture, { passive: true });
window.addEventListener("keydown", onUserGesture, { passive: true });
window.addEventListener("touchstart", onUserGesture, { passive: true });

function getAudioContext() {
  if (!userHasInteracted) return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx && audioCtx.state === "running" ? audioCtx : null;
}

/** Returns a running AudioContext when sound is enabled and unlocked, else null. */
function getPlayableContext() {
  return soundEnabled ? getAudioContext() : null;
}

export function setSoundEnabled(enabled) {
  soundEnabled = enabled;
}

/** Short band-passed white-noise burst. */
function playNoiseBurst(ctx, now, { duration, frequency, q, volume }) {
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const output = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    output[i] = Math.random() * 2 - 1;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(frequency, now);
  filter.Q.setValueAtTime(q, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  noise.start(now);
  noise.stop(now + duration);
}

/** Oscillator whose pitch sweeps exponentially from `from` to `to` Hz. */
function playSweep(ctx, now, { type, from, to, duration, volume, fadeDuration = duration }) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, now);
  osc.frequency.exponentialRampToValueAtTime(to, now + duration);

  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + fadeDuration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + fadeDuration);
}

// 1. Mechanical keyboard click
export function playKeyClick() {
  try {
    const ctx = getPlayableContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Filtered noise burst for tactile switch snap
    playNoiseBurst(ctx, now, { duration: 0.008, frequency: 3400, q: 2.5, volume: 0.24 });
    // Bottom-out mechanical switch body thump
    playSweep(ctx, now, { type: "triangle", from: 180, to: 45, duration: 0.015, volume: 0.16 });
  } catch {
    // Silently ignore audio context errors
  }
}

// 2. Enter key / command execution thump
export function playEnterKey() {
  try {
    const ctx = getPlayableContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Rich mechanical return snap
    playNoiseBurst(ctx, now, { duration: 0.012, frequency: 2600, q: 2.0, volume: 0.32 });
    // Resonant terminal chassis echo
    playSweep(ctx, now, { type: "sine", from: 120, to: 30, duration: 0.035, volume: 0.22 });
  } catch {
    // Silently ignore
  }
}

// 3. Tab autocomplete confirmation blip
export function playTabComplete() {
  try {
    const ctx = getPlayableContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(920, now); // A5#
    osc.frequency.setValueAtTime(1380, now + 0.035); // F6

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.09);
  } catch {
    // Silently ignore
  }
}

// 4. CRT screen degauss / boot coil pulse
export function playDegauss() {
  try {
    const ctx = getPlayableContext();
    if (!ctx) return;
    playSweep(ctx, ctx.currentTime, {
      type: "sine",
      from: 260,
      to: 35,
      duration: 0.45,
      volume: 0.25,
      fadeDuration: 0.5,
    });
  } catch {
    // Silently ignore
  }
}
