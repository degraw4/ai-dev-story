const PRIORITY = Object.freeze({
  ui: 0, projectStart: 1, researchReady: 2, publish: 4,
  rankUp: 2, rankDown: 2, funding: 2, hire: 1, dismiss: 1,
  purchase: 1, reset: 1, news: 0, error: 2, bankrupt: 4, ending: 4,
});
const audioUrl = (file) => new URL(`../assets/audio/${file}`, import.meta.url).href;
const effectFile = (eventName) => eventName === 'publish' ? 'release-jingle.wav'
  : `event-${eventName.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}.wav`;
const clampVolume = (value, previous) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : previous;

/** Audio starts only when enable() is called from a user gesture. */
export function createAudioController({ audioFactory = (source) => new Audio(source) } = {}) {
  const music = audioFactory(audioUrl('office-loop.wav'));
  music.loop = true;
  music.preload = 'none';
  const effects = new Set();
  let musicVolume = 0.3;
  let effectsVolume = 0.5;
  let enabled = false;
  let backgrounded = false;
  let destroyed = false;
  let startGeneration = 0;

  function updateMusicVolume() {
    music.volume = musicVolume * ([...effects].some((effect) => effect.priority >= 4) ? 0.22 : 1);
  }
  function stopEffect(effect) {
    if (!effects.delete(effect)) return;
    effect.audio.removeEventListener('ended', effect.finish);
    effect.audio.removeEventListener('error', effect.finish);
    effect.audio.pause();
    effect.audio.removeAttribute('src');
    effect.audio.load();
    updateMusicVolume();
  }
  function stopEffects() {
    for (const effect of effects) stopEffect(effect);
  }
  function disable() {
    enabled = false;
    startGeneration += 1;
    music.pause();
    stopEffects();
  }
  async function startMusic() {
    const generation = ++startGeneration;
    music.preload = 'auto';
    updateMusicVolume();
    try {
      // Call play before the first await to preserve the browser user gesture.
      await music.play();
      if (destroyed || !enabled || backgrounded) {
        music.pause();
        return false;
      }
      return generation === startGeneration;
    } catch {
      if (generation === startGeneration) disable();
      return false;
    }
  }
  music.addEventListener('error', disable);
  updateMusicVolume();

  return {
    async enable() {
      if (destroyed) return false;
      enabled = true;
      return backgrounded ? true : startMusic();
    },
    disable,
    setMusicVolume(value) {
      musicVolume = clampVolume(value, musicVolume);
      updateMusicVolume();
    },
    setEffectsVolume(value) {
      effectsVolume = clampVolume(value, effectsVolume);
      if (effectsVolume === 0) stopEffects();
      for (const effect of effects) effect.audio.volume = effectsVolume;
    },
    play(eventName) {
      if (destroyed || !enabled || backgrounded || effectsVolume === 0
          || !Object.hasOwn(PRIORITY, eventName)) return false;
      if ([...effects].some((effect) => effect.eventName === eventName)) return false;
      const priority = PRIORITY[eventName];
      // Release and ending phrases get the stage. Same-day rewards never queue.
      if (priority >= 4) stopEffects();
      else if ([...effects].some((effect) => effect.priority >= 4)) return false;
      if (effects.size >= 2) {
        const oldestQuietCue = [...effects].sort((left, right) => left.priority - right.priority)[0];
        if (priority < oldestQuietCue.priority) return false;
        stopEffect(oldestQuietCue);
      }
      let audio;
      try { audio = audioFactory(audioUrl(effectFile(eventName))); }
      catch { return false; }
      audio.preload = 'auto';
      audio.volume = effectsVolume;
      const effect = { audio, eventName, priority, finish: null };
      effect.finish = () => stopEffect(effect);
      audio.addEventListener('ended', effect.finish);
      audio.addEventListener('error', effect.finish);
      effects.add(effect);
      updateMusicVolume();
      try { Promise.resolve(audio.play()).catch(effect.finish); }
      catch { effect.finish(); return false; }
      return true;
    },
    stop(eventName) {
      if (destroyed) return;
      for (const effect of effects) {
        if (effect.eventName === eventName) stopEffect(effect);
      }
    },
    setBackgrounded(value) {
      if (destroyed || backgrounded === Boolean(value)) return;
      backgrounded = Boolean(value);
      if (backgrounded) {
        startGeneration += 1;
        music.pause();
        stopEffects();
      } else if (enabled) {
        void startMusic();
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      disable();
      music.removeEventListener('error', disable);
      music.removeAttribute('src');
      music.load();
    },
    isEnabled: () => enabled,
  };
}
