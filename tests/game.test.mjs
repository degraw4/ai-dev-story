import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../src/game/rules.js';
import { DIRECTIONS, RULES, EMPLOYEES } from '../src/game/content.js';
const { applyAction, total, rank, recruitmentStatus } = game;
const createState=(options={})=>game.createState({profile:'compact112',...options});
const act = (state, action) => { const result = applyAction(state,action); assert.equal(result.ok,true,`${action.type}: ${result.error}`); return result.state; };
const advance = (state, day) => act(act(state,{type:'resume'}),{type:'advanceTo',targetDay:day});
const start = (state=createState(), focus='coding', plannerId='avery') => act(state,{type:'createProject',name:'新模型',focus,plannerId});
const finish = state => advance(state,game.rulesFor(state).lastDay);
const release = state => act(finish(state),{type:'publish',presenter:state.employees[0]});

test('new companies declare compact rules while historic action streams remain classic',()=>{
  assert.equal(typeof game.rulesFor,'function');
  const current=createState();
  assert.equal(current.campaignProfile,'compact112');
  assert.deepEqual(current.acceptedActions[0],{type:'beginCampaign',profile:'compact112'});
  assert.equal(game.rulesFor(current).lastDay,112);
  assert.equal(game.rulesFor(current).experiencePerPoint,120);
  const legacy=game.replayActions([{type:'enableGrowth'}]);
  assert.equal(legacy.campaignProfile,'classic168');
  assert.equal(game.rulesFor(legacy).lastDay,168);
  assert.equal(game.rulesFor(legacy).experiencePerPoint,40);
  assert.equal(applyAction(current,{type:'beginCampaign',profile:'classic168'}).ok,false);
  assert.throws(()=>game.replayActions([{type:'pause'},{type:'beginCampaign',profile:'compact112'}]));
});

test('a compact publication records actual market changes without replacing income rules',()=>{
  assert.equal(typeof game.marketSummary,'function');
  const initial=createState();
  assert.deepEqual(game.marketSummary(initial),{users:0,subscribers:0,weeklyIncome:0,ratingTenths:null});
  const ready=advance(start(initial),112),state=act(ready,{type:'publish'});
  const model=state.models.at(-1),market=game.marketSummary(state);
  assert.deepEqual(model.releaseFeedback.before,game.marketSummary(ready));
  assert.deepEqual(model.releaseFeedback.after,market);
  assert.equal(market.subscribers,market.weeklyIncome*500);
  assert.equal(market.users,market.subscribers*10+1200);
  assert.equal(model.releaseFeedback.nextBillIncome,market.weeklyIncome+state.pendingBonus+state.pendingNews);
  assert.equal(state.ratingTenths,21);
  const nextReady=advance(start(state),112);
  const second=act(nextReady,{type:'publish',media:'机器之薪'});
  assert.equal(second.ratingTenths,22);
  assert.equal(game.marketSummary(second).users,game.marketSummary(second).subscribers*10+2400+2500);
  const classic=advance(start(createState({profile:'classic168'})),168);
  const classicPublished=act(classic,{type:'publish',media:'机器之薪'});
  assert.equal(classicPublished.ratingTenths,21);
  assert.equal(classicPublished.models.at(-1).releaseFeedback,undefined);
});

test('company profiles retain their calendar, knowledge share and employee growth limits',()=>{
  for(const [profile,lastDay,divisor,growthCap] of [['compact112',112,10,6],['classic168',168,2,20]]){
    const ready=finish(start(createState({profile}))),published=act(ready,{type:'publish'});
    assert.deepEqual(published.knowledge,ready.knowledge.map((value,index)=>value+Math.floor((ready.project.scores[index]-ready.project.initialScores[index])/divisor)));
    assert.equal(game.rulesFor(published).lastDay,lastDay);
    assert.equal(game.rulesFor(published).maxAbilityGrowth,growthCap);
    assert.equal(game.releasesFor(published).find(model=>model.name==='DeepPeek R1').day,profile==='compact112'?35:53);
    assert.deepEqual(game.releasesFor(published).map(model=>model.id).sort(),game.releasesFor(createState()).map(model=>model.id).sort());
  }
  const current=createState();
  assert.equal(game.campaignDay(current,17),12);assert.equal(game.campaignDay(current,152),102);
  assert.equal(game.price({...current,gameDay:19}),9);
  assert.equal(game.price({...createState({profile:'classic168'}),gameDay:19}),12);
});

test('rank losses reduce active users and base subscription without erasing release history',()=>{
  let state=createState();
  for(const employeeId of ['morgan','casey'])state=act(state,{type:'hire',employeeId});
  state=act(state,{type:'buyCompute',amount:2});state=act(finish(start(state)),{type:'publish'});
  const before=game.marketSummary(state),history=structuredClone(state.models.filter(model=>model.company==='player'));
  state=advance(state,18);const after=game.marketSummary(state);
  assert.ok(after.weeklyIncome<before.weeklyIncome);assert.ok(after.users<before.users);
  assert.deepEqual(state.models.filter(model=>model.company==='player'),history);
});

test('release rating is bounded and does not participate in income, funding or rankings',()=>{
  const ready=finish(start(release(start())));
  const low=structuredClone(ready),high=structuredClone(ready);low.ratingTenths=10;high.ratingTenths=49;
  const a=act(low,{type:'publish'}),b=act(high,{type:'publish'});
  assert.equal(a.ratingTenths,12);assert.equal(b.ratingTenths,50);
  for(const key of ['cash','pendingBonus','pendingNews','funding','knowledge'])assert.deepEqual(a[key],b[key]);
  assert.equal(rank(a),rank(b));assert.equal(game.marketSummary(a).weeklyIncome,game.marketSummary(b).weeklyIncome);
  const third=finish(start(a));third.ratingTenths=10;
  assert.equal(act(third,{type:'publish',media:'量子味'}).ratingTenths,10);
});

test('project requires one present available planner and only three directions',()=>{
  assert.deepEqual(DIRECTIONS,['coding','office','multimodal']);
  for(const focus of DIRECTIONS) {const state=start(createState(),focus);assert.equal(state.project.status,'planning');assert.deepEqual(state.project.scores,[25,25,25]);}
  for(const action of [{type:'createProject',name:'无负责人',focus:'coding'},{type:'createProject',name:'离岗',focus:'coding',plannerId:'karpathy'},{type:'createProject',name:'移除方向',focus:'agent',plannerId:'avery'}]) {
    const state=createState(), before=structuredClone(state), result=applyAction(state,action);assert.equal(result.ok,false);assert.equal(result.state,state);assert.deepEqual(state,before);
  }
});

test('planner spends two days alone and supplies three ability-based proposal values',()=>{
  let state=advance(start(),1);
  assert.equal(state.project.status,'planning');assert.equal(state.project.planProgress,1);assert.deepEqual(state.project.scores,[25,25,25]);
  assert.deepEqual(state.notices.filter(n=>n.type==='planning').map(n=>n.employeeId),['avery']);
  state=advance(state,2);
  const expected=EMPLOYEES.avery.abilities.map((ability,index)=>25+ability*(index===0?2:1));
  assert.equal(state.project.status,'researching');assert.equal(state.paused,false);assert.deepEqual(state.project.planScores,expected);assert.deepEqual(state.project.scores,expected);assert.equal(state.project.work,0);
  const other=advance(start(createState(),'coding','jules'),2);assert.notDeepEqual(other.project.planScores,state.project.planScores);
});

test('all available employees automatically research every ordered stage',()=>{
  let state=advance(start(),3);
  const facts=state.notices.filter(n=>n.type==='research');assert.deepEqual(facts[0].employeeIds,['avery','jules']);assert.ok(facts[0].compute>0);assert.ok(state.project.work>0);
  assert.equal(applyAction(state,{type:'assign',employeeId:'avery',mode:'sprint'}).ok,false);
  state=finish(state);assert.equal(state.project.status,'ready');assert.equal(state.paused,true);assert.equal(state.project.work,40);
  assert.deepEqual(state.notices.filter(n=>n.type==='stage-complete').map(n=>n.stageId),['data','pretraining','posttraining','evaluation']);
  assert.equal(state.notices.filter(n=>n.type==='ready').length,1);
});

test('more compute shortens a fixed-team project without changing final three scores',()=>{
  const slow=finish(start());
  const fast=finish(start(act(createState(),{type:'buyCompute',amount:4})));
  assert.ok(fast.gameDay<slow.gameDay);assert.deepEqual(fast.project.planScores,slow.project.planScores);assert.deepEqual(fast.project.scores,slow.project.scores);assert.deepEqual(fast.project.scoreRemainders,slow.project.scoreRemainders);
  for(const state of [slow,fast]) {assert.equal(state.notices.filter(n=>n.type==='research').reduce((sum,n)=>sum+n.work,0),40);assert.ok(state.notices.filter(n=>n.type==='research').every(n=>n.work<=12));}
});

test('new hires join the next research day and dismissal preserves earned work',()=>{
  let state=advance(start(),3), before=structuredClone(state.project);
  state=act(state,{type:'hire',employeeId:'casey'});assert.deepEqual(state.project,before);
  state=advance(state,4);assert.ok(state.notices.filter(n=>n.type==='research').at(-1).employeeIds.includes('casey'));
  const earned=structuredClone(state.project), cash=state.cash;
  state=act(state,{type:'dismiss',employeeId:'casey'});assert.deepEqual(state.project,earned);assert.equal(state.cash,cash-6);
  state=advance(state,5);assert.equal(state.notices.filter(n=>n.type==='research').at(-1).employeeIds.includes('casey'),false);
});

test('dismissed planner pauses and a deliberate replacement continues without resetting progress',()=>{
  let state=advance(start(),1);
  state=act(state,{type:'dismiss',employeeId:'avery'});assert.equal(state.paused,true);assert.equal(state.project.planProgress,1);assert.equal(state.project.plannerId,null);
  assert.equal(applyAction(state,{type:'resume'}).ok,false);
  state=act(state,{type:'selectPlanner',employeeId:'jules'});assert.equal(state.project.planProgress,1);
  state=advance(state,2);assert.equal(state.project.status,'researching');assert.deepEqual(state.project.planScores,EMPLOYEES.jules.abilities.map((value,index)=>25+value*(index===0?2:1)));
  assert.equal(applyAction(state,{type:'selectPlanner',employeeId:'jules'}).ok,false);
});

test('Rebo reset occupies that day, completes once, and rejoins the following day',()=>{
  let state=advance(release(start()),42);state=act(state,{type:'hire',employeeId:'rebo'});state=advance(start(state),44);state=act(state,{type:'reset'});
  state=advance(state,45);assert.equal(state.ratingTenths,26);assert.equal(state.notices.filter(n=>n.type==='research').at(-1).employeeIds.includes('rebo'),false);
  state=advance(state,46);assert.ok(state.notices.filter(n=>n.type==='research').at(-1).employeeIds.includes('rebo'));
  assert.equal(state.notices.filter(n=>n.type==='reset-complete').length,1);
});

test('locked recruitment cannot consume cash, slots, history or notices',()=>{
  for(const employeeId of ['alex','max','rebo','tim','karpathy','boris']){const state=createState(),before=structuredClone(state),result=applyAction(state,{type:'hire',employeeId});assert.equal(result.error,'candidate-locked');assert.equal(result.state,state);assert.deepEqual(state,before);}
  const ready=finish(start());for(const id of ['alex','max'])assert.equal(recruitmentStatus(ready,id).unlocked,false);
  const published=act(ready,{type:'publish',presenter:'avery'});for(const id of ['alex','max'])assert.equal(recruitmentStatus(published,id).unlocked,true);
  for(const [day,ids] of [[21,['rebo','tim']],[42,['karpathy','boris']]]) {const before=advance(createState(),day-1),after=advance(before,day);for(const id of ids){assert.equal(recruitmentStatus(before,id).unlocked,false);assert.equal(recruitmentStatus(after,id).unlocked,true);}}
});

test('publication is one-time and future projects preserve published snapshots',()=>{
  let state=finish(start());const scores=[...state.project.scores];state=act(state,{type:'publish',presenter:'avery'});assert.deepEqual(state.models.at(-1).scores,scores);assert.equal(applyAction(state,{type:'publish',presenter:'avery'}).ok,false);
  const model=structuredClone(state.models.at(-1));state=finish(start(state,'office','jules'));assert.deepEqual(state.models.find(m=>m.id===model.id),model);
});

test('activity and progress helpers report actual planning, research and paused work',()=>{
  let state=start();assert.equal(game.employeeActivity(state,'avery').kind,'planning');assert.equal(game.employeeActivity(state,'jules').kind,'idle');assert.equal(game.employeeActivity(state,'avery').active,false);
  state=advance(state,2);assert.equal(game.employeeActivity(state,'jules').kind,'research');assert.equal(game.employeeActivity(state,'jules').active,true);
  const summary=game.productionSummary(state);assert.deepEqual(summary.activeEmployeeIds,['avery','jules']);assert.equal(summary.usedCompute,state.compute);assert.equal(summary.phaseId,'data');assert.ok(summary.estimatedDays>0);
});

test('publication automatically selects available staff and keeps marketing discounts',()=>{
  const ready=finish(start());
  const first=act(ready,{type:'publish'});assert.equal(first.models.at(-1).presenter,'avery');
  let company=act(first,{type:'hire',employeeId:'alex'});company=finish(start(company));
  const cash=company.cash;
  const published=act(company,{type:'publish',media:'机器之薪'});
  assert.equal(published.models.at(-1).presenter,'alex');
  assert.equal(published.notices.findLast(n=>n.type==='published').cost,6);
  assert.ok(published.cash>=cash-6);
});

test('real work grows employee abilities and inactive employees receive no experience',()=>{
  let state=start();const before=EMPLOYEES.avery.abilities;
  state=finish(state);
  state=act(state,{type:'publish'});state=finish(start(state,'office','jules'));
  assert.equal(typeof game.employeeAbilities,'function');
  assert.ok(game.employeeAbilities(state,'avery')[0]>before[0]);
  assert.ok(game.employeeAbilities(state,'jules')[1]>EMPLOYEES.jules.abilities[1]);
  assert.deepEqual(game.employeeAbilities(state,'karpathy'),EMPLOYEES.karpathy.abilities);
  assert.ok(state.notices.some(n=>n.type==='employee-growth'&&n.employeeId==='avery'));
  const experience=structuredClone(state.employeeExperience);
  state=act(state,{type:'publish'});state=advance(state,state.gameDay+1);assert.deepEqual(state.employeeExperience,experience);
});
