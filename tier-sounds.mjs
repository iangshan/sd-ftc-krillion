const minimumGain = 0.0001;
const cueVolume = 0.16;
const triplePulseTimes = [0, 0.15, 0.3];

// Original takes on the FTC field cues. Times are relative to one answer.
const cues = [
  triplePulseTimes.map(at => ({ at, wave: 'square', from: 196, length: 0.09, volume: 0.26 })),
  triplePulseTimes.flatMap(at => [
    { at, wave: 'sine', from: 784, length: 0.21, volume: 0.38 },
    { at, wave: 'sine', from: 1308, length: 0.13, volume: 0.19 },
    { at, wave: 'sine', from: 2217, length: 0.07, volume: 0.07 },
  ]),
  [
    { wave: 'triangle', from: 318, to: 382, length: 0.53, volume: 0.4, attack: 0.11 },
    { wave: 'sine', from: 428, to: 511, length: 0.51, volume: 0.28, attack: 0.14 },
    { wave: 'sine', from: 637, to: 769, length: 0.46, volume: 0.17, attack: 0.14 },
  ],
  [
    { wave: 'sawtooth', from: 175, to: 164, length: 0.46, volume: 0.33, sustain: 0.29 },
    { wave: 'triangle', from: 218, to: 205, length: 0.47, volume: 0.29, sustain: 0.29 },
  ],
  [523.25, 659.25, 783.99, 880, 1046.5].map((from, index) => ({
    at: [0, 0.11, 0.23, 0.35, 0.49][index],
    wave: 'triangle', from, length: index === 4 ? 0.29 : 0.105, volume: 0.48,
  })),
];

let context;
let activeCue;
let request = 0;

async function getContext() {
  try {
    const AudioContext = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AudioContext) return;
    if (!context || context.state === 'closed') context = new AudioContext();
    if (context.state !== 'running') await context.resume();
    if (context.state === 'running') return context;
  } catch {
    // Sound is optional, including when a browser blocks audio playback.
  }
}

export function primeTierSounds() {
  return getContext().then(() => {});
}

export function stopTierSounds() {
  request += 1;
  if (!activeCue) return;
  const { audio, bus, voices } = activeCue;
  activeCue = undefined;

  const now = audio.currentTime;
  bus.gain.setTargetAtTime(0, now, 0.007);
  for (const voice of voices) voice.stop(now + 0.04);
}

function schedule(audio, cue) {
  const bus = audio.createGain();
  bus.gain.value = cueVolume;
  bus.connect(audio.destination);
  const state = { audio, bus, voices: new Set() };
  activeCue = state;
  const start = audio.currentTime + 0.008;

  for (const { at = 0, wave, from, to, length, volume, attack = 0.008, sustain } of cue) {
    const when = start + at;
    const voice = audio.createOscillator();
    const envelope = audio.createGain();
    voice.type = wave;
    voice.frequency.setValueAtTime(from, when);
    if (to) voice.frequency.exponentialRampToValueAtTime(to, when + length);
    envelope.gain.setValueAtTime(minimumGain, when);
    envelope.gain.linearRampToValueAtTime(volume, when + attack);
    if (sustain) envelope.gain.setValueAtTime(volume, when + sustain);
    envelope.gain.exponentialRampToValueAtTime(minimumGain, when + length);
    voice.connect(envelope);
    envelope.connect(bus);
    voice.onended = () => {
      voice.disconnect();
      envelope.disconnect();
      state.voices.delete(voice);
      if (state.voices.size) return;
      bus.disconnect();
      if (activeCue === state) activeCue = undefined;
    };
    voice.start(when);
    state.voices.add(voice);
    voice.stop(when + length + 0.008);
  }
}

export async function playTierSound(level) {
  const cue = Number.isInteger(level) ? cues[level - 1] : undefined;
  if (!cue) return;
  stopTierSounds();
  const current = request;
  const audio = await getContext();
  if (!audio || current !== request) return;
  try {
    schedule(audio, cue);
  } catch {
    stopTierSounds();
  }
}
