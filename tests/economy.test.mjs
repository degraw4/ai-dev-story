import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as game from '../src/game/rules.js';
import {encodeSave,decodeSave,SCHEMA_VERSION} from '../src/storage.js';
import {budgetExamples} from '../scripts/check-cost-balance.mjs';
import {newsFor} from '../src/story.js';
const act=(s,a)=>{const r=game.applyAction(s,a);assert.ok(r.ok,r.error);return r.state;};
const to=(s,day)=>act(act(s,{type:'resume'}),{type:'advanceTo',targetDay:day});
const start=(s=game.createState())=>act(s,{type:'createProject',name:'Paid training',focus:'coding',plannerId:'avery'});
const ready=s=>to(start(s),112);
const snap=state=>({schemaVersion:SCHEMA_VERSION,state,dayProgressMs:0,observedStoryEvents:[],feedbackResponses:{}});

test('new companies pay a quoted training budget once; invalid projects cannot consume it',()=>{
  const initial=game.createState();assert.equal(initial.campaignProfile,'startup112');
  const cost=game.trainingCost(initial);assert.ok(cost>0);
  const project=start(initial);assert.equal(project.cash,initial.cash-cost);assert.equal(project.project.trainingCost,cost);
  const progressed=to(project,3);assert.equal(progressed.cash,project.cash);
  const paused=act(progressed,{type:'pause'});assert.equal(act(paused,{type:'resume'}).cash,paused.cash);
  const low={...initial,cash:cost-1};assert.equal(game.applyAction(low,{type:'createProject',name:'x',focus:'coding',plannerId:'avery'}).error,'cash');
  for(const s of [low,project]){const before=structuredClone(s);const result=game.applyAction(s,{type:'createProject',name:'x',focus:'coding',plannerId:'avery'});assert.equal(result.state,s);assert.deepEqual(s,before);}
  const fast=ready(act(initial,{type:'buyCompute',amount:2})),slow=ready(initial);
  assert.ok(fast.gameDay<slow.gameDay);assert.equal(fast.project.trainingCost,slow.project.trainingCost);assert.deepEqual(fast.project.scores,slow.project.scores);
  const published=act(slow,{type:'publish'});assert.equal(published.models.at(-1).trainingCost,cost);
});

test('all requested prices are higher and the weekly bill uses the same displayed costs',()=>{
  const current=game.createState(),legacy=game.createState({profile:'compact112'});
  for(const id of ['avery','morgan','alex','karpathy']){
    const now=game.employeeTerms(current,id),old=game.employeeTerms(legacy,id);
    assert.ok(now.salary>old.salary);if(old.hire)assert.ok(now.hire>old.hire);
  }
  assert.ok(game.price(current)>game.price(legacy));
  assert.ok(game.rulesFor(current).publicationCost>game.rulesFor(legacy).publicationCost);
  assert.ok(game.mediaCost(current,'avery')>game.mediaCost(legacy,'avery'));
  const costs=game.operatingCosts(current),billed=to(current,7),bill=billed.bills.at(-1);
  assert.equal(bill.salaries,costs.salaries);assert.equal(bill.running,costs.running);assert.equal(costs.running,current.compute);
  const dismissed=act(current,{type:'dismiss',employeeId:'avery'});assert.equal(current.cash-dismissed.cash,2*game.employeeTerms(current,'avery').salary);
});

test('paid articles add real subscribers and two bill payments without stacking or repeat settlement',()=>{
  const prepared=ready(game.createState()),plain=act(prepared,{type:'publish'}),promoted=act(prepared,{type:'publish',media:'新智猿'});
  const model=promoted.models.at(-1),campaign=game.mediaCampaign(promoted);
  assert.ok(campaign.income>0);assert.ok(game.marketSummary(promoted).subscribers>game.marketSummary(plain).subscribers);
  assert.equal(promoted.cash,plain.cash-game.mediaCost(prepared,game.publicationPresenter(prepared)));
  const firstBill=(Math.floor(promoted.gameDay/7)+1)*7;
  let a=plain,b=promoted;
  for(const day of [firstBill,firstBill+7,firstBill+14]){
    a=to(a,day);b=to(b,day);assert.equal(b.bills.at(-1).income-a.bills.at(-1).income,day<=model.mediaUntilDay?campaign.income:0);
  }
  assert.equal(game.mediaCampaign(b).income,0);
  const decoded=decodeSave(encodeSave(snap(b)));assert.ok(decoded.ok,decoded.error);assert.equal(decoded.snapshot.state.cash,b.cash);
  assert.equal(game.applyAction(b,{type:'publish',media:'新智猿'}).ok,false);
  // A newer article replaces the active promotion instead of adding permanent income.
  const overlapping={...promoted,models:[...promoted.models,{...model,id:'overlap',sequence:model.sequence+1}]};
  assert.equal(game.mediaCampaign(overlapping).income,campaign.income);
});

test('existing v5 companies retain exact economic history and cannot be silently repriced',async()=>{
  const raw=await readFile(new URL('./fixtures/legacy-v5-compact.json',import.meta.url),'utf8');
  const source=JSON.parse(raw),result=decodeSave(raw);assert.ok(result.ok,result.error);
  assert.deepEqual(result.snapshot,source);assert.equal(result.snapshot.state.campaignProfile,'compact112');
  assert.equal(game.trainingCost(result.snapshot.state),0);
  const changed=structuredClone(source);changed.state.campaignProfile='budget112';assert.equal(decodeSave(JSON.stringify(changed)).ok,false);
  const current=start();const altered=snap(current);altered.state.project.trainingCost++;assert.equal(decodeSave(JSON.stringify(altered)).ok,false);
});

test('all budget endings round trip, including real media bill income and training expenses',()=>{
  for(const {state} of Object.values(budgetExamples())){
    const snapshot=snap(state),decoded=decodeSave(encodeSave(snapshot));assert.ok(decoded.ok,decoded.error);assert.deepEqual(decoded.snapshot,snapshot);
  }
});

test('a late promotion stops at the campaign deadline and cannot collect a nonexistent bill',()=>{
  const first=act(ready(game.createState()),{type:'publish'}),second=ready(first);
  const late=to(second,111),promoted=act(late,{type:'publish',media:'量子味'});
  assert.equal(promoted.models.at(-1).mediaUntilDay,112);
  const ended=to(promoted,112);assert.equal(ended.bills.at(-1).mediaIncome,10);assert.equal(game.mediaCampaign(ended).income,0);
});

test('equipment news quotes the company price on the event day, including historic companies',()=>{
  for(const profile of ['startup112','budget112','compact112','classic168']){
    const company=game.createState({profile});
    for(const [id,classicDay] of [['N01-low',28],['N01-high',84],['N01-sale',140]]){
      const eventDay=game.campaignDay(company,classicDay),later={...company,gameDay:game.rulesFor(company).lastDay};
      const quote=game.price({...company,gameDay:eventDay});
      assert.ok(newsFor(later).find(news=>news.id===id).copy.includes(`${quote} 万`),`${profile}: ${id}`);
    }
  }
});
