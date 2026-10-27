import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../src/game/rules.js';
import {startupExamples} from '../scripts/check-cost-balance.mjs';
import {encodeSave,decodeSave,SCHEMA_VERSION} from '../src/storage.js';
const act=(state,action)=>{const result=game.applyAction(state,action);assert.ok(result.ok,result.error);return result.state;};
const to=(state,day)=>act(act(state,{type:'resume'}),{type:'advanceTo',targetDay:day});
let cachedFunded;
function fundedCompany(){
  if(!cachedFunded){
    let state=game.replayActions([]);
    for(const action of startupExamples().champion.state.acceptedActions){
      state=act(state,action);
      if(state.funding.includes('overall'))break;
    }
    cachedFunded=state;
  }
  return structuredClone(cachedFunded);
}
const snapshot=state=>({schemaVersion:SCHEMA_VERSION,state:{...state,paused:true},dayProgressMs:0,observedStoryEvents:[],feedbackResponses:{}});

test('new companies enable future subscription growth while existing histories retain their terms',()=>{
  const current=game.createState();assert.equal(current.subscriptionGrowthEnabled,true);
  assert.equal(current.acceptedActions.filter(action=>action.type==='enableSubscriptionGrowth').length,1);
  assert.deepEqual(game.replayActions(current.acceptedActions),current);
  for(const options of [{subscriptionGrowth:false},{profile:'budget112'},{profile:'compact112'},{profile:'classic168'}])assert.equal(game.createState(options).subscriptionGrowthEnabled,undefined);
});
test('opening publication and funding gates do not gain a mature company income',()=>{
  let state=act(game.createState(),{type:'createProject',name:'First',focus:'coding',plannerId:'avery'});
  state=act(to(state,112),{type:'publish'});
  assert.deepEqual(state.funding,[]);assert.equal(game.rank(state),6);
  assert.equal(game.marketSummary(state).weeklyIncome,15);assert.equal(state.cash,74);
});
test('a company that earned overall financing keeps sustainable subscriptions after falling to fourth',()=>{
  const old=to(fundedCompany(),60);assert.equal(game.rank(old),4);assert.equal(game.marketSummary(old).weeklyIncome,25);
  const state=act(old,{type:'enableSubscriptionGrowth'});
  assert.equal(game.marketSummary(state).weeklyIncome,60);
  assert.equal(game.marketSummary(state).subscribers,30000);
  assert.equal(state.cash,old.cash);assert.deepEqual(state.bills,old.bills);assert.deepEqual(state.models,old.models);
  const previousBill=to(old,63).bills.at(-1),billed=to(state,63),bill=billed.bills.at(-1);
  assert.equal(bill.base,60);assert.equal(bill.income-previousBill.income,35);
  assert.deepEqual(billed.funding,old.funding,'does not invent another financing round');
  assert.deepEqual(decodeSave(encodeSave(snapshot(billed))).snapshot,snapshot(billed));
});
test('adoption is one-time, cannot revive an ended company and pays nothing retroactively',()=>{
  const before=fundedCompany(),enabled=act(before,{type:'enableSubscriptionGrowth'});
  assert.equal(enabled.cash,before.cash);assert.deepEqual(enabled.notices,before.notices);assert.deepEqual(enabled.project,before.project);
  const duplicate=game.applyAction(enabled,{type:'enableSubscriptionGrowth'});assert.equal(duplicate.ok,false);assert.equal(duplicate.state,enabled);
  const ended=to(enabled,112);assert.ok(ended.ending);
  assert.equal(game.applyAction(ended,{type:'enableSubscriptionGrowth'}).error,'game-ended');
  assert.deepEqual(game.replayActions(enabled.acceptedActions),enabled);
});
test('mature income uses the current rank, including weaker late-game positions',()=>{
  const state=act(fundedCompany(),{type:'enableSubscriptionGrowth'});
  assert.equal(game.baseSubscriptionIncome(state),75);
  const fourth=to(state,60);assert.equal(game.baseSubscriptionIncome(fourth),60);
  const sixth=to(state,107);assert.equal(game.rank(sixth),6);assert.equal(game.baseSubscriptionIncome(sixth),20);
  assert.equal(game.baseSubscriptionIncome(game.createState()),0);
});
