import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as game from '../src/game/rules.js';
import { advanceClock } from '../src/clock.js';
import { decodeSave, encodeSave, SCHEMA_VERSION } from '../src/storage.js';

const result = (state, action) => {
  const next = game.applyAction(state, action);
  assert.ok(next.ok, next.error);
  return next;
};
const act = (state, action) => result(state, action).state;
const to = (state, day) => result(act(state, { type: 'resume' }), { type: 'advanceTo', targetDay: day });
const start = (state = game.createState(), focus = 'coding', plannerId = 'avery') => act(state, { type: 'createProject', name: `Model ${state.nextProjectId}`, focus, plannerId });
const finish = state => to(state, 112);
const snapshot = state => ({ schemaVersion: SCHEMA_VERSION, state, dayProgressMs: 0, observedStoryEvents: [], feedbackResponses: {} });
const pointSums = events => ['coding', 'office', 'multimodal'].map(direction => events.filter(event => event.direction === direction).reduce((sum, event) => sum + event.amount, 0));

// These tests first ran against the original reducer/clock and failed on missing
// enableBurst and presentationEvents behavior, before the draft implementation.
test('new budget companies enable bursts through a replayable action; historical starts stay unchanged', () => {
  const current = game.createState({subscriptionGrowth:false});
  assert.equal(current.burstEnabled, true);
  assert.deepEqual(current.acceptedActions.map(action => action.type), ['beginCampaign', 'enableBurst']);
  assert.deepEqual(game.replayActions(current.acceptedActions), current);
  for (const options of [{ burst: false }, { profile: 'compact112' }, { profile: 'classic168' }]) {
    const old = game.createState({...options,subscriptionGrowth:false});
    assert.equal(Object.hasOwn(old, 'burstEnabled'), false);
    assert.deepEqual(old.acceptedActions.map(action => action.type), ['beginCampaign']);
    assert.deepEqual(game.replayActions(old.acceptedActions), old);
  }
});

test('enabling on an existing company affects the next project, never the current project or past notices', () => {
  const original = start(game.createState({ burst: false }));
  const enabled = result(original, { type: 'enableBurst' });
  assert.deepEqual(enabled.state.project, original.project);
  assert.deepEqual(enabled.state.notices, original.notices);
  assert.equal(enabled.state.cash, original.cash);
  assert.deepEqual(enabled.presentationEvents, []);
  const duplicate = game.applyAction(enabled.state, { type: 'enableBurst' });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.state, enabled.state);
  const completed = finish(enabled.state);
  assert.deepEqual(completed.state.project.scores, [69, 43, 32]);
  assert.equal(completed.presentationEvents.some(event => event.burst), false);
  const published = act(completed.state, { type: 'publish' });
  assert.equal(Object.hasOwn(published.models.at(-1), 'burstBonus'), false);
  const next = start(published);
  assert.deepEqual(next.project.burst, { startWork: 16, endWork: 20, employeeId: null, earned: 0 });
});

test('every normal emitted icon owns exactly one settled point and all daily gains are conserved', () => {
  const completed = finish(start(game.createState({ burst: false })));
  const { state, presentationEvents } = completed;
  assert.ok(Array.isArray(presentationEvents));
  assert.deepEqual(pointSums(presentationEvents), state.project.scores.map((value, index) => value - state.project.planScores[index]));
  assert.deepEqual(pointSums(presentationEvents), [32, 16, 6]);
  for (const event of presentationEvents) {
    assert.equal(event.type, 'research-point');
    assert.equal(event.projectId, state.project.id);
    assert.equal(event.amount, 1);
    assert.ok(event.workUnit >= 0 && event.workUnit < 40);
    assert.ok(['avery', 'jules'].includes(event.employeeId));
    assert.equal(event.source, 'research');
    assert.equal(event.burst, false);
  }
  assert.equal(Object.hasOwn(state, 'presentationEvents'), false);
  const daily = state.notices.filter(notice => notice.type === 'research');
  assert.deepEqual(['coding', 'office', 'multimodal'].map((_, index) => daily.reduce((sum, notice) => sum + notice.gains[index], 0)), pointSums(presentationEvents));
  assert.ok(daily.every(notice => !Object.hasOwn(notice, 'presentationEvents')));
});

test('one burst awards four real focus points once without buying work or experience', () => {
  const ordinary = finish(start(game.createState({ burst: false })));
  const hot = finish(start());
  assert.deepEqual(hot.state.project.scores, ordinary.state.project.scores.map((value, index) => value + (index === 0 ? 4 : 0)));
  assert.deepEqual(hot.state.employeeExperience, ordinary.state.employeeExperience);
  assert.equal(hot.state.cash, ordinary.state.cash);
  assert.equal(hot.state.project.work, 40);
  assert.equal(hot.state.gameDay, ordinary.state.gameDay);
  const bonus = hot.presentationEvents.filter(event => event.source === 'burst');
  assert.deepEqual(bonus.map(event => event.workUnit), [12, 13, 14, 15]);
  assert.ok(bonus.every(event => event.burst && event.employeeId === 'avery' && event.direction === 'coding' && event.amount === 1));
  assert.equal(hot.state.project.burst.earned, 4);
  assert.deepEqual(pointSums(hot.presentationEvents), hot.state.project.scores.map((value, index) => value - hot.state.project.planScores[index]));
  const published = act(hot.state, { type: 'publish' });
  assert.equal(published.models.at(-1).burstBonus, 4);
  assert.equal(game.applyAction(published, { type: 'publish' }).ok, false);
});

test('extra compute changes duration, not point ownership, burst total or final scores', () => {
  const slow = finish(start());
  const fast = finish(start(act(game.createState(), { type: 'buyCompute', amount: 2 })));
  assert.ok(fast.state.gameDay < slow.state.gameDay);
  assert.deepEqual(fast.state.project.scores, slow.state.project.scores);
  assert.deepEqual(fast.presentationEvents, slow.presentationEvents);
  assert.equal(fast.state.project.burst.earned, 4);
});

test('dismissing the chosen employee during a burst skips remaining awards instead of transferring them', () => {
  let state = start(act(game.createState(), { type: 'hire', employeeId: 'morgan' }));
  const first = to(state, 5); state = first.state;
  assert.equal(state.project.work, 13);
  assert.equal(state.project.burst.employeeId, 'avery');
  assert.equal(state.project.burst.earned, 1);
  state = act(state, { type: 'dismiss', employeeId: 'avery' });
  const rest = finish(state);
  assert.equal(rest.state.project.burst.employeeId, 'avery');
  assert.equal(rest.state.project.burst.earned, 1);
  assert.equal(rest.presentationEvents.some(event => event.employeeId === 'avery' || event.burst), false);
  assert.deepEqual(game.replayActions(rest.state.acceptedActions), rest.state);
});

test('a chosen Rebo working on quota reset misses those burst units and never receives catch-up points', () => {
  let state = act(finish(start()).state, { type: 'publish' });
  state = to(state, 21).state;
  state = act(state, { type: 'dismiss', employeeId: 'jules' });
  state = act(state, { type: 'hire', employeeId: 'rebo' });
  state = act(state, { type: 'hire', employeeId: 'morgan' });
  state = to(start(state), 27).state;
  assert.equal(state.project.work, 18);
  assert.equal(state.project.burst.employeeId, 'rebo');
  assert.equal(state.project.burst.earned, 2);
  state = act(state, { type: 'reset' });
  const absent = to(state, 28);
  assert.equal(absent.state.project.work, 20);
  assert.equal(absent.presentationEvents.some(event => event.employeeId === 'rebo' || event.burst), false);
  assert.equal(absent.state.project.burst.earned, 2);
  const complete = finish(absent.state);
  assert.equal(complete.state.project.burst.earned, 2);
  assert.equal(complete.presentationEvents.some(event => event.source === 'burst'), false);
  assert.ok(complete.presentationEvents.some(event => event.employeeId === 'rebo'));
});

test('clock catch-up aggregates points in order; pauses and sub-day ticks never emit them again', () => {
  const initial = act(start(), { type: 'resume' });
  const whole = advanceClock(initial, 0, 999999, 1);
  let state = initial, events = [];
  while (!state.paused) { const tick = advanceClock(state, 0, 20000); state = tick.state; events.push(...tick.presentationEvents); }
  assert.deepEqual(whole.state, state);
  assert.deepEqual(whole.presentationEvents, events);
  assert.deepEqual(advanceClock(state, 0, 999999).presentationEvents, []);
  assert.deepEqual(advanceClock(initial, 0, 1).presentationEvents, []);
  assert.equal(whole.dayProgressMs, 0);
});

test('current budget and prior company snapshots still validate exactly; burst progress round-trips', async () => {
  for (const name of ['legacy-v5-budget-active.json', 'legacy-v5-compact.json']) {
    const raw = await readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
    const old = JSON.parse(raw), restored = decodeSave(raw);
    assert.ok(restored.ok, restored.error);
    assert.deepEqual(restored.snapshot, old);
    assert.equal(Object.hasOwn(restored.snapshot.state, 'burstEnabled'), false);
  }
  const state = act(to(start(act(game.createState(), { type: 'hire', employeeId: 'morgan' })), 5).state, { type: 'pause' });
  const saved = snapshot(state), restored = decodeSave(encodeSave(saved));
  assert.ok(restored.ok, restored.error);
  assert.deepEqual(restored.snapshot, saved);
  assert.equal(restored.snapshot.state.project.burst.earned, 1);
  assert.deepEqual(finish(restored.snapshot.state).state, finish(state).state);
});
