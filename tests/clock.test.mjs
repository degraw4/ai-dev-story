import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, applyAction, operatingCosts } from '../src/game/rules.js';
import { advanceClock } from '../src/clock.js';

const act = (state, action) => {
  const result = applyAction(state, action);
  assert.equal(result.ok, true, result.error);
  return result.state;
};

test('paused clock preserves fraction and ignores elapsed background time', () => {
  const state = createState();
  const result = advanceClock(state, 1500, 999999, 4);
  assert.equal(result.state, state);
  assert.equal(result.dayProgressMs, 1500);
});

test('elapsed budget advances each day at the selected speed and retains only the fraction', () => {
  const state = act(createState(), { type: 'resume' });
  const result = advanceClock(state, 1000, 35500, 4);
  assert.equal(result.state.gameDay, 7);
  assert.equal(result.dayProgressMs, 3000);
  assert.equal(result.state.bills.length, 1);
  assert.equal(result.state.cash, state.cash-operatingCosts(state).salaries-operatingCosts(state).running);
  assert.equal(state.gameDay, 0);
});

test('ready project interrupts catch-up and discards remaining budget', () => {
  let state = act(createState(), { type: 'createProject', name: '及时停止', focus: 'coding', plannerId:'avery' });
  state = act(state, { type: 'resume' });
  const result = advanceClock(state, 1000, 600000, 4);
  assert.equal(result.state.gameDay, 12);
  assert.equal(result.state.project.status, 'ready');
  assert.equal(result.state.paused, true);
  assert.equal(result.dayProgressMs, 0);
  const resumed = act(result.state, { type: 'resume' });
  assert.equal(advanceClock(resumed, result.dayProgressMs, 1).state.gameDay, 12);
});

test('a terminal bill stops the clock and clears remaining budget', () => {
  const state = act(createState(), { type: 'resume' });
  const result = advanceClock(state, 0, 1e9, 4);
  assert.equal(result.state.gameDay, 77);
  assert.equal(result.state.ending, '发布会照常');
  assert.equal(result.dayProgressMs, 0);
});

test('invalid elapsed values, speeds, or fractions are rejected', () => {
  const state = act(createState(), { type: 'resume' });
  for (const elapsed of [-1, NaN, Infinity, '20']) assert.throws(() => advanceClock(state, 0, elapsed));
  for (const speed of [0, 3, -1, Infinity]) assert.throws(() => advanceClock(state, 0, 1, speed));
  for (const fraction of [-1, 20000, NaN]) assert.throws(() => advanceClock(state, fraction, 1));
});

test('the clock finishes each company at its own campaign deadline',()=>{
  for(const [profile,lastDay] of [['compact112',112],['classic168',168]]){
    let state=act(createState({profile}),{type:'createProject',name:'持续经营',focus:'coding',plannerId:'avery'});
    state=act(state,{type:'resume'});state=act(state,{type:'advanceTo',targetDay:lastDay});
    state=act(state,{type:'publish'});state=act(state,{type:'resume'});
    const result=advanceClock(state,0,1e9,4);
    assert.equal(result.state.gameDay,lastDay);assert.ok(result.state.ending);
    assert.equal(result.dayProgressMs,0);
  }
});
