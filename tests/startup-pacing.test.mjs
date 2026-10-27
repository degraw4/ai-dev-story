import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createState,applyAction,rank,rulesFor,replayActions,releasesFor} from '../src/game/rules.js';
import {DIRECTIONS} from '../src/game/content.js';
import {encodeSave,decodeSave,SCHEMA_VERSION} from '../src/storage.js';
import * as balance from '../scripts/check-cost-balance.mjs';

const act=(state,action)=>{const result=applyAction(state,action);assert(result.ok,result.error);return result.state;};
function develop(state,focus='coding',plannerId='avery'){
  state=act(state,{type:'createProject',name:`Next ${state.nextProjectId}`,focus,plannerId});
  state=act(act(state,{type:'resume'}),{type:'advanceTo',targetDay:rulesFor(state).lastDay});
  assert(!state.ending,'the early company can afford development');
  return act(state,{type:'publish'});
}
test('a first ordinary model enters at fifth or sixth without financing, including the four-person opening',()=>{
  for(const hires of [[],['morgan'],['casey'],['morgan','casey']]){
    let company=createState();
    for(const employeeId of hires)company=act(company,{type:'hire',employeeId});
    for(const focus of DIRECTIONS)for(const plannerId of company.employees){
      const first=develop(company,focus,plannerId);
      assert(rank(first)>=5,`${hires} ${focus} ${plannerId}: first rank ${rank(first)}`);
      assert.deepEqual(first.funding,[],'the first model cannot receive any financing');
      for(let direction=0;direction<3;direction++)assert(rank(first,direction)>1,'ordinary first models cannot win a specialist board');
      assert(first.cash>0);
    }
  }
});
test('financing milestones require repeated releases and an actual score or leaderboard result',()=>{
  let state=createState();
  const fundingMinimum=rulesFor(state).fundingPublications;
  assert.deepEqual(fundingMinimum,{seed:2,specialist:3,overall:4});
  for(let release=1;release<=4;release++){
    const before=state;state=develop(state);
    for(const grant of state.funding.filter(id=>!before.funding.includes(id)))assert(release>=fundingMinimum[grant]);
    if(state.funding.includes('seed'))assert(state.models.some(model=>model.company==='player'&&model.scores.reduce((a,b)=>a+b,0)>=rulesFor(state).seedScore));
  }
  assert(state.funding.includes('seed'),'a cautious two-person company can earn the first funding through iteration');
  assert.deepEqual(replayActions(state.acceptedActions),state);
});
test('new pacing is saved explicitly while existing budget companies keep their historical results',async()=>{
  const state=develop(createState());
  assert.equal(state.campaignProfile,'startup112');
  const snapshot={schemaVersion:SCHEMA_VERSION,state,dayProgressMs:0,observedStoryEvents:[],feedbackResponses:{}};
  assert.deepEqual(decodeSave(encodeSave(snapshot)).snapshot,snapshot);
  const legacy=JSON.parse(await readFile(new URL('./fixtures/legacy-v5-budget-active.json',import.meta.url),'utf8'));
  assert.deepEqual(decodeSave(JSON.stringify(legacy)).snapshot,legacy);
  const oldFirst=develop(createState({profile:'budget112'}));
  assert.deepEqual(oldFirst.funding,['seed']);assert.equal(oldFirst.cash,114);
  assert.equal(releasesFor(state).length,15,'rival companies still have four models including the opening');
});

test('startup routes reach four endings through replayable actions and complete save round trips',()=>{
  assert.equal(typeof balance.startupExamples,'function');
  const examples=balance.startupExamples();
  assert.deepEqual(Object.values(examples).map(({state})=>state.ending),['榜单常青树','融资永动机','明年一定第一','发布会照常']);
  for(const {state} of Object.values(examples)){
    assert.equal(state.campaignProfile,'startup112');
    assert.deepEqual(replayActions(state.acceptedActions),state);
    const snapshot={schemaVersion:SCHEMA_VERSION,state,dayProgressMs:0,observedStoryEvents:[],feedbackResponses:{}};
    const restored=decodeSave(encodeSave(snapshot));assert.ok(restored.ok,restored.error);
    assert.deepEqual(restored.snapshot,snapshot);
  }
  assert.deepEqual(examples.capital.state.employees,[]);
  const dismissals=examples.capital.state.notices.filter(notice=>notice.type==='farewell');
  assert.ok(dismissals.length>0&&dismissals.every(notice=>notice.compensation>0));
});

test('the four-person office opening separates its first three publications and financing',()=>{
  let state=createState();
  for(const employeeId of ['morgan','casey'])state=act(state,{type:'hire',employeeId});
  const reports=[];
  for(let index=0;index<3;index++){
    state=develop(state,'office','jules');
    reports.push({day:state.gameDay,scores:state.models.at(-1).scores,rank:rank(state),cash:state.cash,funding:[...state.funding]});
  }
  assert.deepEqual(reports,[
    {day:10,scores:[51,105,51],rank:5,cash:42,funding:[]},
    {day:20,scores:[53,121,53],rank:4,cash:73,funding:['seed']},
    {day:30,scores:[55,141,55],rank:4,cash:155,funding:['seed','specialist']},
  ]);
});
