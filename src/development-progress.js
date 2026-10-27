import { productionSummary, rulesFor } from './game/rules.js';

export function developmentProgress(state, dayProgressMs = 0) {
  const summary = productionSummary(state);
  const dayMs = rulesFor(state).secondsPerDay * 1000;
  const fraction = Number.isFinite(dayProgressMs) ? Math.min(1, Math.max(0, dayProgressMs / dayMs)) : 0;
  const work = state.ending || summary.phaseId === 'ready' ? 0 : Math.min(summary.progressPerDay, summary.phaseTotal - summary.phaseProgress);
  return { ...summary, displayProgress: summary.phaseProgress + work * fraction };
}
