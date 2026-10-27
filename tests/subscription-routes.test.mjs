import test from 'node:test';
import assert from 'node:assert/strict';
import * as balance from '../scripts/check-cost-balance.mjs';
import {replayActions,rank} from '../src/game/rules.js';
import {encodeSave,decodeSave,SCHEMA_VERSION} from '../src/storage.js';

test('the route runner can opt into post-funding subscription income without changing compatibility examples',()=>{
  const current=balance.runBudgetRoute({profile:'startup112',subscriptionGrowth:true});
  assert.equal(current.state.subscriptionGrowthEnabled,true);
  assert.equal(current.state.cash,317);
  assert.equal(balance.startupExamples().champion.state.cash,49);
  assert.equal(balance.budgetExamples().champion.state.cash,44);
});

test('post-funding routes support expansion, continued research, four endings and complete save round trips',()=>{
  const examples=balance.subscriptionExamples();
  assert.deepEqual(['champion','capital','ordinary','reckless'].map(id=>examples[id].state.ending),
    ['榜单常青树','融资永动机','明年一定第一','发布会照常']);
  for(const {state,publications} of Object.values(examples)){
    assert.equal(state.campaignProfile,'startup112');
    assert.equal(state.subscriptionGrowthEnabled,true);
    assert.deepEqual(replayActions(state.acceptedActions),state);
    const snapshot={schemaVersion:SCHEMA_VERSION,state,dayProgressMs:0,observedStoryEvents:[],feedbackResponses:{}};
    const decoded=decodeSave(encodeSave(snapshot));
    assert(decoded.ok,decoded.error);assert.deepEqual(decoded.snapshot,snapshot);
    assert([5,6].includes(publications[0].rank));
    assert(!state.notices.some(notice=>notice.type==='funding'&&notice.day<=publications[0].day));
  }
  assert.equal(examples.champion7.state.compute,7);
  assert.equal(examples.champion8.state.compute,8);
  assert.equal(examples.champion8.state.employees.length,8);
  assert.equal(examples.champion8.state.cash,149);
  assert.equal(examples.ordinary.state.cash,75,'a low-ranked two-person company gets no maturity windfall');
  assert.equal(examples.reckless.state.gameDay,21,'overspending before commercial success can still bankrupt the company');

  const mixed=examples.mixed.state;
  assert.equal(mixed.employees.length,7);assert.equal(mixed.compute,8);
  assert.equal(rank(mixed),4);assert.equal(mixed.cash,156);
  assert.deepEqual(mixed.notices.filter(notice=>notice.type==='farewell').map(notice=>[notice.day,notice.employeeId,notice.compensation]),[[47,'boris',14]]);
  const bill=mixed.bills.find(bill=>bill.day===105);
  assert.deepEqual([bill.rank,bill.base,bill.mediaIncome,bill.bonus,bill.income,bill.salaries,bill.running],[4,60,10,6,76,35,8]);
  assert.equal(examples.capital.state.employees.length,0);
  assert(examples.capital.state.notices.filter(notice=>notice.type==='farewell').every(notice=>notice.compensation>0));
});
