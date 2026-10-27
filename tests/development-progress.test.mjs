import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, applyAction, productionSummary, rulesFor } from '../src/game/rules.js';
import { developmentProgress } from '../src/development-progress.js';

const act = (state, action) => {
  const result = applyAction(state, action);
  assert.ok(result.ok, result.error);
  return result.state;
};
const to = (state, day) => act(act(state, { type: 'resume' }), { type: 'advanceTo', targetDay: day });
const start = (state = createState()) => act(state, { type: 'createProject', name: 'Continuous progress', focus: 'coding', plannerId: 'avery' });

test('planning and research display continuous fractions of the next actual daily work', () => {
  const planning = start();
  assert.equal(developmentProgress(planning, 10000).displayProgress, 0.5);
  const research = to(planning, 2);
  assert.deepEqual([0, 5000, 10000, 15000].map(time => developmentProgress(research, time).displayProgress), [0, 1, 2, 3]);
  assert.equal(developmentProgress(research, 10000).phaseProgress, 0);
  assert.equal(developmentProgress(research, 10000).phaseId, 'data');
});

test('the last day only interpolates the remaining stage work and never enters the next stage', () => {
  const partial = to(start(), 3);
  const fast = act(partial, { type: 'buyCompute', amount: 4 });
  assert.equal(productionSummary(fast).progressPerDay, 8);
  assert.equal(developmentProgress(fast, 10000).displayProgress, 6);
  const completeDisplay = developmentProgress(fast, 20000);
  assert.equal(completeDisplay.displayProgress, 8);
  assert.equal(completeDisplay.phaseId, 'data');
  assert.equal(fast.project.stageIndex, 0);
  assert.equal(fast.project.stageWork, 4);
});

test('pausing preserves the display at the same saved fraction', () => {
  const running = to(start(), 3);
  const paused = act(running, { type: 'pause' });
  assert.equal(developmentProgress(running, 8000).displayProgress, 5.6);
  assert.deepEqual(developmentProgress(paused, 8000), developmentProgress(running, 8000));
});

test('ready and ended companies only show their committed phase progress', () => {
  const ready = to(start(), 112);
  const readyProgress = developmentProgress(ready, 10000);
  assert.equal(readyProgress.phaseId, 'ready');
  assert.equal(readyProgress.displayProgress, readyProgress.phaseProgress);
  let ending = act(ready, { type: 'publish' });
  ending = to(ending, 106);
  ending = to(start(ending), 112);
  assert.ok(ending.ending);
  assert.equal(ending.project.status, 'researching');
  assert.equal(developmentProgress(ending, 10000).displayProgress, productionSummary(ending).phaseProgress);
});

test('missing planners and empty teams add no estimated work and retain earned progress', () => {
  const missingPlanner = act(to(start(), 1), { type: 'dismiss', employeeId: 'avery' });
  assert.equal(developmentProgress(missingPlanner, 10000).displayProgress, 1);
  assert.ok(developmentProgress(missingPlanner, 10000).blockedReason);
  let noStaff = to(start(), 3);
  for (const employeeId of [...noStaff.employees]) noStaff = act(noStaff, { type: 'dismiss', employeeId });
  assert.equal(developmentProgress(noStaff, 10000).displayProgress, 4);
  assert.equal(developmentProgress(noStaff, 10000).progressPerDay, 0);
  assert.equal(developmentProgress(createState(), 10000).displayProgress, 0);
});

test('compute changes the displayed work rate through the same production summary', () => {
  const normal = to(start(), 2);
  const fast = act(normal, { type: 'buyCompute', amount: 2 });
  assert.equal(developmentProgress(normal, 10000).displayProgress, 2);
  assert.equal(developmentProgress(fast, 10000).displayProgress, 3);
  assert.equal(fast.project.work, normal.project.work);
  assert.deepEqual(fast.project.scores, normal.project.scores);
});

test('fractions clamp to one day and read-only display never changes company state', () => {
  const state = to(start(), 3), before = structuredClone(state);
  assert.equal(developmentProgress(state, -1000).displayProgress, 4);
  assert.equal(developmentProgress(state, rulesFor(state).secondsPerDay * 2000).displayProgress, 8);
  assert.equal(developmentProgress(state).displayProgress, 4);
  assert.deepEqual(state, before);
  const { displayProgress, ...summary } = developmentProgress(state, 5000);
  assert.equal(displayProgress, 5);
  assert.deepEqual(summary, productionSummary(state));
});
