import { applyAction, rulesFor } from './game/rules.js';

// elapsedMs is a foreground interval from a monotonic browser clock.
// The app resets that measurement when hidden or manually paused.
export function advanceClock(state, dayProgressMs, elapsedMs, speed = 1) {
  const dayMs = rulesFor(state).secondsPerDay * 1000;
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error('invalid-elapsed-time');
  if (![1, 2, 4].includes(speed)) throw new Error('invalid-speed');
  if (!Number.isFinite(dayProgressMs) || dayProgressMs < 0 || dayProgressMs >= dayMs) throw new Error('invalid-day-progress');
  if (state.ending) return { state, dayProgressMs: 0, presentationEvents: [] };
  if (state.paused) return { state, dayProgressMs, presentationEvents: [] };
  let budget = dayProgressMs + elapsedMs * speed;
  const presentationEvents = [];
  if (!Number.isFinite(budget)) throw new Error('invalid-time-budget');
  while (budget >= dayMs && !state.paused && !state.ending) {
    const result = applyAction(state, { type: 'advanceTo', targetDay: state.gameDay + 1 });
    if (!result.ok) throw new Error(result.error);
    state = result.state;
    presentationEvents.push(...result.presentationEvents);
    budget -= dayMs;
  }
  return { state, dayProgressMs: state.paused || state.ending ? 0 : budget, presentationEvents };
}
