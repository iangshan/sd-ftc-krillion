import assert from 'node:assert/strict';
import test from 'node:test';
import { playTierSound, primeTierSounds, stopTierSounds } from './tier-sounds.mjs';

function mockParam() {
  return {
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    setTargetAtTime() {},
  };
}

test('tier cues wait for browser activation and mute cancels pending playback', async () => {
  const original = globalThis.AudioContext;
  const voices = [];
  let finishResume;

  globalThis.AudioContext = class {
    state = 'suspended';
    currentTime = 20;
    destination = {};

    resume() {
      return new Promise(resolve => {
        finishResume = () => {
          this.state = 'running';
          resolve();
        };
      });
    }

    createGain() {
      return { gain: mockParam(), connect() {}, disconnect() {} };
    }

    createOscillator() {
      const oscillator = {
        frequency: mockParam(),
        connect() {},
        disconnect() {},
        start(at) { this.started = at; },
        stop(at) { this.stopped = at; },
      };
      voices.push(oscillator);
      return oscillator;
    }
  };

  try {
    const pending = playTierSound(1);
    assert.equal(voices.length, 0);
    stopTierSounds();
    finishResume();
    await pending;
    assert.equal(voices.length, 0);

    await primeTierSounds();
    const wavePatterns = ['square', 'sine', 'triangle', 'sawtooth', 'triangle'];
    const voiceCounts = [3, 9, 3, 2, 5];
    for (const [index, count] of voiceCounts.entries()) {
      const before = voices.length;
      await playTierSound(index + 1);
      const newVoices = voices.slice(before);
      assert.equal(newVoices.length, count);
      assert.equal(newVoices[0].type, wavePatterns[index]);
      assert.ok(newVoices.every(voice => voice.started > 20 && voice.stopped > voice.started));
    }

    const count = voices.length;
    await playTierSound(6);
    await playTierSound('1');
    assert.equal(voices.length, count);
    stopTierSounds();
    assert.ok(voices.slice(-5).every(voice => voice.stopped <= 20.04));
  } finally {
    stopTierSounds();
    if (original === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = original;
  }
});
