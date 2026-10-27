import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAudioController } from '../src/audio.js';

class FakeAudio extends EventTarget {
  constructor(source) {
    super();
    this.src = source;
    this.paused = true;
    this.currentTime = 0;
    this.volume = 1;
    this.playCalls = 0;
    this.pauseCalls = 0;
    this.playResult = () => Promise.resolve();
  }
  play() {
    this.playCalls += 1;
    this.paused = false;
    return this.playResult();
  }
  pause() { this.pauseCalls += 1; this.paused = true; }
  finish() { this.paused = true; this.dispatchEvent(new Event('ended')); }
  removeAttribute(name) { if (name === 'src') this.src = ''; }
  load() {}
}

function setup() {
  const created = [];
  const controller = createAudioController({ audioFactory: (source) => {
    const audio = new FakeAudio(source);
    created.push(audio);
    return audio;
  } });
  return { controller, created, get music() { return created[0]; } };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
const liveEffects = (created) => created.slice(1).filter((audio) => !audio.paused);

test('construction is silent; a user enable starts the looping theme at the default volume', async () => {
  const { controller, created } = setup();
  assert.equal(controller.isEnabled(), false);
  assert.equal(controller.play('hire'), false);
  assert.equal(created.some((audio) => audio.playCalls > 0), false);
  assert.equal(await controller.enable(), true);
  assert.equal(controller.isEnabled(), true);
  assert.match(created[0].src, /\/assets\/audio\/office-loop\.wav$/);
  assert.equal(created[0].loop, true);
  assert.equal(created[0].volume, 0.3);
  controller.destroy();
});

test('a rejected or throwing music start returns false and leaves all sound disabled', async () => {
  for (const mode of ['reject', 'throw']) {
    const harness = setup();
    harness.music.playResult = () => {
      if (mode === 'throw') throw new Error('browser blocked playback');
      return Promise.reject(new Error('browser blocked playback'));
    };
    assert.equal(await harness.controller.enable(), false);
    assert.equal(harness.controller.isEnabled(), false);
    assert.equal(harness.music.paused, true);
    assert.equal(harness.controller.play('news'), false);
    harness.controller.destroy();
  }
});

test('disabling while enable is pending prevents its late completion from restarting sound', async () => {
  const harness = setup();
  let resolvePlay;
  harness.music.playResult = () => new Promise((resolve) => { resolvePlay = resolve; });
  const enabling = harness.controller.enable();
  harness.controller.disable();
  resolvePlay();
  assert.equal(await enabling, false);
  assert.equal(harness.controller.isEnabled(), false);
  assert.equal(harness.music.paused, true);
  harness.controller.destroy();
});

test('an old enable rejection cannot disable a newer successful enable', async () => {
  const harness = setup();
  let rejectOldPlay;
  harness.music.playResult = () => new Promise((_, reject) => { rejectOldPlay = reject; });
  const previousEnable = harness.controller.enable();
  harness.controller.disable();
  harness.music.playResult = () => Promise.resolve();
  assert.equal(await harness.controller.enable(), true);
  rejectOldPlay(new Error('superseded play was interrupted'));
  assert.equal(await previousEnable, false);
  assert.equal(harness.controller.isEnabled(), true);
  assert.equal(harness.music.paused, false);
  harness.controller.destroy();
});

test('backgrounding an in-flight enable retains the preference but never lets its completion play while hidden', async () => {
  const harness = setup();
  let resolvePlay;
  harness.music.playResult = () => new Promise((resolve) => { resolvePlay = resolve; });
  const enabling = harness.controller.enable();
  harness.controller.setBackgrounded(true);
  resolvePlay();
  assert.equal(await enabling, false);
  assert.equal(harness.controller.isEnabled(), true);
  assert.equal(harness.music.paused, true);
  harness.music.playResult = () => Promise.resolve();
  harness.controller.setBackgrounded(false);
  await settle();
  assert.equal(harness.music.paused, false);
  harness.controller.destroy();
});

test('backgrounding stops music and effects; returning resumes only an enabled theme', async () => {
  const harness = setup();
  await harness.controller.enable();
  harness.controller.play('hire');
  harness.controller.setBackgrounded(true);
  assert.equal(harness.controller.isEnabled(), true);
  assert.equal(harness.music.paused, true);
  assert.equal(liveEffects(harness.created).length, 0);
  assert.equal(harness.controller.play('news'), false);
  harness.controller.setBackgrounded(false);
  await settle();
  assert.equal(harness.music.paused, false);
  assert.equal(liveEffects(harness.created).length, 0);
  harness.controller.disable();
  const previousCalls = harness.music.playCalls;
  harness.controller.setBackgrounded(true);
  harness.controller.setBackgrounded(false);
  assert.equal(harness.music.playCalls, previousCalls);
  harness.controller.destroy();
});

test('a failed foreground resume is contained and turns off the enabled flag', async () => {
  const harness = setup();
  await harness.controller.enable();
  harness.controller.setBackgrounded(true);
  harness.music.playResult = () => Promise.reject(new Error('device unavailable'));
  harness.controller.setBackgrounded(false);
  await settle();
  assert.equal(harness.controller.isEnabled(), false);
  assert.equal(harness.music.paused, true);
  harness.controller.destroy();
});

test('publish uses the existing jingle, lowers music, and restores the latest music volume on completion', async () => {
  const harness = setup();
  await harness.controller.enable();
  assert.equal(harness.controller.play('publish'), true);
  const jingle = harness.created.at(-1);
  assert.match(jingle.src, /\/release-jingle\.wav$/);
  assert.ok(harness.music.volume < 0.15);
  harness.controller.setMusicVolume(0.6);
  assert.ok(harness.music.volume < 0.3);
  assert.equal(harness.controller.play('funding'), false, 'one release must not queue overlapping reward jingles');
  jingle.finish();
  assert.equal(harness.music.volume, 0.6);
  assert.equal(harness.music.paused, false);
  harness.controller.destroy();
});

test('stopping a named cue ends the release without stopping music or unrelated effects', async () => {
  const harness = setup();
  await harness.controller.enable();
  harness.controller.play('publish');
  const jingle = harness.created.at(-1);
  harness.controller.setMusicVolume(0.4);
  assert.ok(harness.music.volume < 0.4);
  harness.controller.stop('publish');
  assert.equal(jingle.paused, true);
  assert.equal(harness.music.paused, false);
  assert.equal(harness.music.volume, 0.4);
  assert.equal(harness.controller.isEnabled(), true);
  assert.equal(harness.controller.play('funding'), true);
  const funding = harness.created.at(-1);
  harness.controller.play('rankUp');
  const rankUp = harness.created.at(-1);
  const jinglePauseCalls = jingle.pauseCalls;
  harness.controller.stop('publish');
  harness.controller.stop('notARealEvent');
  assert.equal(jingle.pauseCalls, jinglePauseCalls);
  assert.equal(funding.paused, false);
  assert.equal(rankUp.paused, false);
  harness.controller.stop('funding');
  assert.equal(funding.paused, true);
  assert.equal(rankUp.paused, false);
  assert.equal(harness.music.paused, false);
  harness.controller.destroy();
  assert.doesNotThrow(() => harness.controller.stop('publish'));
  assert.equal(harness.controller.isEnabled(), false);
});

test('effects have separate volume; finite values clamp and zero effects volume stops effects', async () => {
  const harness = setup();
  await harness.controller.enable();
  harness.controller.setMusicVolume(0.2);
  harness.controller.setEffectsVolume(0.7);
  harness.controller.play('purchase');
  assert.equal(harness.created.at(-1).volume, 0.7);
  assert.equal(harness.music.volume, 0.2);
  harness.controller.setEffectsVolume(2);
  assert.equal(harness.created.at(-1).volume, 1);
  harness.controller.setMusicVolume(Number.NaN);
  assert.equal(harness.music.volume, 0.2);
  harness.controller.setEffectsVolume(0);
  assert.equal(liveEffects(harness.created).length, 0);
  assert.equal(harness.controller.play('hire'), false);
  harness.controller.setMusicVolume(-1);
  assert.equal(harness.music.volume, 0);
  harness.controller.destroy();
});

test('same-day bursts have at most two effects, do not duplicate a cue, and a release replaces the burst', async () => {
  const harness = setup();
  await harness.controller.enable();
  harness.controller.play('news');
  harness.controller.play('hire');
  assert.equal(harness.controller.play('hire'), false);
  harness.controller.play('funding');
  assert.ok(liveEffects(harness.created).length <= 2);
  harness.controller.play('rankUp');
  assert.ok(liveEffects(harness.created).length <= 2);
  harness.controller.play('publish');
  assert.equal(liveEffects(harness.created).length, 1);
  assert.match(liveEffects(harness.created)[0].src, /release-jingle/);
  harness.controller.destroy();
});

test('failed effects restore ducked music and allow another effect without an unhandled rejection', async () => {
  const created = [];
  const controller = createAudioController({ audioFactory: (source) => {
    const audio = new FakeAudio(source);
    if (/release-jingle/.test(source)) audio.playResult = () => Promise.reject(new Error('decode failed'));
    created.push(audio);
    return audio;
  } });
  await controller.enable();
  controller.play('publish');
  await settle();
  assert.equal(created[0].volume, 0.3);
  assert.equal(controller.isEnabled(), true);
  assert.equal(controller.play('news'), true);
  created.at(-1).dispatchEvent(new Event('error'));
  assert.equal(liveEffects(created).length, 0);
  controller.destroy();
});

test('destroy is final, cancels callbacks and handles completion of an in-flight enable', async () => {
  const harness = setup();
  let resolvePlay;
  harness.music.playResult = () => new Promise((resolve) => { resolvePlay = resolve; });
  const enabling = harness.controller.enable();
  harness.controller.destroy();
  resolvePlay();
  assert.equal(await enabling, false);
  assert.equal(harness.controller.isEnabled(), false);
  assert.equal(await harness.controller.enable(), false);
  assert.equal(harness.controller.play('ending'), false);
  harness.controller.setBackgrounded(false);
  harness.controller.destroy();
  assert.equal(harness.music.paused, true);
});

test('a music media error stops effects and cannot re-enable an explicitly disabled controller', async () => {
  const harness = setup();
  await harness.controller.enable();
  harness.controller.play('publish');
  const jingle = harness.created.at(-1);
  harness.music.dispatchEvent(new Event('error'));
  assert.equal(harness.controller.isEnabled(), false);
  assert.equal(liveEffects(harness.created).length, 0);
  jingle.finish();
  assert.equal(harness.music.paused, true);
  harness.controller.destroy();
});

test('every supported cue resolves to its editable manifest file using the module-relative URL', async () => {
  const manifest = JSON.parse(await readFile(new URL('../assets/audio/events.json', import.meta.url), 'utf8'));
  const harness = setup();
  await harness.controller.enable();
  assert.equal(harness.controller.play('doesNotExist'), false);
  for (const [eventName, config] of Object.entries(manifest.events)) {
    assert.equal(harness.controller.play(eventName), true, eventName);
    assert.equal(harness.created.at(-1).src, new URL(`../assets/audio/${config.file}`, import.meta.url).href);
    harness.created.at(-1).finish();
  }
  harness.controller.destroy();
});
