import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, applyAction, rulesFor } from '../src/game/rules.js';
import { RULES } from '../src/game/content.js';
import { encodeSave, decodeSave, SCHEMA_VERSION, SAVE_KEY, LEGACY_SAVE_KEYS, MIGRATION_SAVE_KEYS } from '../src/storage.js';
import { runExamples, develop, must, waitTo } from '../scripts/check-realtime-design.mjs';
const snapshot=(state=createState())=>({schemaVersion:SCHEMA_VERSION,state,dayProgressMs:1350,observedStoryEvents:[],feedbackResponses:{}});
const initial=()=>must(createState(),{type:'createProject',name:'First',focus:'coding',plannerId:'avery'});

test('automatic-development format preserves separate legacy slots and rejects old raw records',()=>{
  assert.equal(SAVE_KEY,'ai-dev-story-save-v5');assert.deepEqual(LEGACY_SAVE_KEYS,['ai-dev-story-save-v2','ai-dev-story-save-v1']);
  for(const schemaVersion of [1,2]){const raw=JSON.stringify({...snapshot(),schemaVersion});const before=raw;const result=decodeSave(raw);assert.equal(result.ok,false);assert.match(result.error,/旧版存档/);assert.equal(raw,before);}
});
test('every intermediate day restores paused, with identical subsequent economic work',()=>{
  let continuous=must(initial(),{type:'resume'});
  while(continuous.project.status!=='ready'){
    continuous=must(continuous,{type:'advanceTo',targetDay:continuous.gameDay+1});
    const decoded=decodeSave(encodeSave(snapshot(continuous)));assert(decoded.ok,decoded.error);assert(decoded.snapshot.state.paused);assert.equal(decoded.snapshot.dayProgressMs,1350);
    const recovered=decoded.snapshot.state;assert.doesNotThrow(()=>encodeSave(snapshot(recovered)));
    if(continuous.project.status!=='ready'){
      const nextA=waitTo(continuous,continuous.gameDay+1),nextB=waitTo(recovered,recovered.gameDay+1);
      const {acceptedActions:a,...actual}=nextA,{acceptedActions:b,...expected}=nextB;assert.deepEqual(actual,expected);
    }
  }
});
test('forged scores, proposal, phases, staff, cash, grants and notices are rejected',()=>{
  const original=snapshot(waitTo(initial(),3));
  const mutations=[s=>s.state.cash++,s=>s.state.project.scores[0]++,s=>s.state.project.planScores[0]++,s=>s.state.project.plannerId='jules',s=>s.state.project.stageIndex++,s=>s.state.project.scoreRemainders[0]++,s=>s.state.project.work++,s=>s.state.employees.push('karpathy'),s=>s.state.funding.push('overall'),s=>s.state.notices.pop(),s=>s.state.knowledge[1]++,s=>s.state.ratingTenths=50];
  for(const mutate of mutations){const changed=structuredClone(original);mutate(changed);assert.throws(()=>encodeSave(changed));assert.equal(decodeSave(JSON.stringify(changed)).ok,false);}
});
test('historical recruitment cannot be forged by altering present day or deleting a successful action',()=>{
  const hired=must(waitTo(develop(createState()),42),{type:'hire',employeeId:'rebo'});
  const changed=snapshot(hired);changed.state.acceptedActions=changed.state.acceptedActions.filter(a=>a.type!=='hire');assert.equal(decodeSave(JSON.stringify(changed)).ok,false);
  const early=snapshot(createState());early.state.acceptedActions=[{type:'hire',employeeId:'rebo'}];early.state.gameDay=42;assert.equal(decodeSave(JSON.stringify(early)).ok,false);
});
test('malformed and oversized snapshots, duplicate observations and unsupported actions are rejected',()=>{
  for(const raw of ['{broken','null','[]','{}',' '.repeat(2_000_001)])assert.equal(decodeSave(raw).ok,false);
  for(const change of [s=>s.schemaVersion=99,s=>s.extra=1,s=>s.dayProgressMs=Infinity,s=>s.observedStoryEvents=['x','x'],s=>s.feedbackResponses={'player-1':'fake'},s=>s.state.acceptedActions=[{type:'assign',employeeId:'avery'}],s=>s.state.acceptedActions=Array(RULES.maxAcceptedActions+1).fill({type:'pause'})]){const value=snapshot();change(value);assert.throws(()=>encodeSave(value));}
});
test('planner replacement, live hiring and reset histories all remain replayable',()=>{
  let state=waitTo(initial(),1);state=must(state,{type:'dismiss',employeeId:'avery'});state=must(state,{type:'selectPlanner',employeeId:'jules'});state=waitTo(state);state=must(state,{type:'publish',presenter:'jules'});state=waitTo(state,42);state=must(state,{type:'hire',employeeId:'rebo'});state=must(state,{type:'reset'});state=waitTo(state,43);
  const result=decodeSave(encodeSave(snapshot(state)));assert(result.ok,result.error);assert.equal(result.snapshot.state.ratingTenths,26);
});
test('all four complete automatic-development histories round trip without duplicate settlement',()=>{
  for(const state of Object.values(runExamples())){const source=snapshot(state),decoded=decodeSave(encodeSave(source));assert(decoded.ok,decoded.error);assert.deepEqual(decoded.snapshot,source);assert.equal(applyAction(decoded.snapshot.state,{type:'publish',presenter:'avery'}).ok,false);}
});

test('version-three companies migrate without changing current work, money, or existing scores',async()=>{
  const {readFile}=await import('node:fs/promises');
  const raw=await readFile(new URL('./fixtures/legacy-v3-active.json',import.meta.url),'utf8'),old=JSON.parse(raw);
  const result=decodeSave(raw);assert(result.ok,result.error);
  assert.equal(result.snapshot.schemaVersion,5);assert.equal(result.snapshot.state.growthEnabled,true);
  for(const field of ['gameDay','cash','project','models','knowledge','bills','notices'])assert.deepEqual(result.snapshot.state[field],old.state[field]);
  assert.equal(result.snapshot.state.acceptedActions.at(-1).type,'enableGrowth');
  assert.equal(result.snapshot.dayProgressMs,old.dayProgressMs);
  assert.doesNotThrow(()=>encodeSave(result.snapshot));
  const tampered=JSON.parse(raw);tampered.state.cash+=100;assert.equal(decodeSave(JSON.stringify(tampered)).ok,false);
});

test('schema five preserves the established version-four company before future work',async()=>{
  const {readFile}=await import('node:fs/promises');
  const LEGACY_V4_RAW=await readFile(new URL('./fixtures/legacy-v4-active.json',import.meta.url),'utf8');
  assert.equal(SCHEMA_VERSION,5);
  const original=JSON.parse(LEGACY_V4_RAW),result=decodeSave(LEGACY_V4_RAW);
  assert(result.ok,result.error);
  assert.equal(result.migratedFrom,4);
  assert.equal(result.snapshot.state.campaignProfile,'classic168');
  for(const field of ['gameDay','cash','project','models','knowledge','bills','notices','employeeExperience','acceptedActions'])assert.deepEqual(result.snapshot.state[field],original.state[field]);
  assert.equal(result.snapshot.state.acceptedActions.filter(action=>action.type==='enableGrowth').length,1);
  assert.doesNotThrow(()=>encodeSave(result.snapshot));
  const tampered=JSON.parse(LEGACY_V4_RAW);tampered.state.cash++;
  assert.equal(decodeSave(JSON.stringify(tampered)).ok,false);
  assert.deepEqual(MIGRATION_SAVE_KEYS,['ai-dev-story-save-v4','ai-dev-story-save-v3']);
  assert.equal(rulesFor(result.snapshot.state).lastDay,168);
  assert.equal(rulesFor(result.snapshot.state).experiencePerPoint,40);
  const resumed=waitTo(result.snapshot.state,result.snapshot.state.gameDay+1);
  assert.ok(resumed.employeeExperience.avery[0]>result.snapshot.state.employeeExperience.avery[0]);
  assert.doesNotThrow(()=>encodeSave(snapshot(resumed)));
});

test('profile switches, schema downgrades and forged market feedback are rejected',()=>{
  const source=snapshot(develop(createState()));
  for(const change of [
    value=>value.state.campaignProfile='classic168',
    value=>value.state.campaignProfile='unknown',
    value=>{value.schemaVersion=4;delete value.state.campaignProfile;},
    value=>value.state.models.find(model=>model.company==='player').releaseFeedback.after.users++,
    value=>value.state.models.find(model=>model.company==='player').releaseFeedback.nextBillIncome++,
    value=>value.state.acceptedActions.push({type:'beginCampaign',profile:'classic168'}),
  ]){const changed=structuredClone(source);change(changed);assert.equal(decodeSave(JSON.stringify(changed)).ok,false);}
  const decoded=decodeSave(encodeSave(source));assert(decoded.ok,decoded.error);
  assert.deepEqual(decoded.snapshot.state.models,source.state.models);
});
