#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIRECTIONS, RULES, EMPLOYEES, STAGES, RIVALS, RELEASES } from '../src/game/content.js';
import { createState as createCompany, applyAction, rank, total, recruitmentStatus, usedCompute, rulesFor, campaignDay, price, employeeAbilities } from '../src/game/rules.js';
// Compatibility regression for the published compact112 rules.
const createState=(options={})=>createCompany({profile:'compact112',...options});
export function must(state, action) {const result=applyAction(state,action);assert(result.ok,`${action.type}: ${result.error}`);return result.state;}
export function waitTo(state,day=rulesFor(state).lastDay) {return must(must(state,{type:'resume'}),{type:'advanceTo',targetDay:day});}
export function develop(state,focus='coding',plannerId=state.employees[0]) {
  state=must(state,{type:'createProject',name:`Next ${state.nextProjectId}`,focus,plannerId});
  state=waitTo(state);
  return state.ending?state:must(state,{type:'publish',presenter:state.employees[0]});
}
const owned=state=>state.models.filter(model=>model.company==='player');
// These routes send ordinary game actions through the sole economic reducer.
export function runPacingRoute(route='special',stopAfter=Infinity) {
  let state=createState(),firstSpecial=null,firstOverall=null;
  const publications=[],timeline=[];
  const observe=()=>{
    if(state.funding.includes('specialist')&&firstSpecial===null)firstSpecial=state.gameDay;
    if(state.funding.includes('overall')&&firstOverall===null)firstOverall=state.gameDay;
    const entry={day:state.gameDay,rank:rank(state),ranks:DIRECTIONS.map((_,index)=>rank(state,index)),cash:state.cash};
    if(timeline.at(-1)?.day===state.gameDay)timeline[timeline.length-1]=entry;else timeline.push(entry);
  };
  const act=action=>{state=must(state,action);observe();};
  const afford=cost=>state.cash>=cost+35;
  function recruitAndPurchase(){
    if(!owned(state).length||route==='two')return;
    const wanted=route==='four'?['morgan','casey']:route==='noKarpathy'?['max','morgan','rebo','tim','casey','boris']:route==='noBoris'?['max','morgan','rebo','tim','karpathy','casey']:['max','morgan','rebo','tim','karpathy','boris'];
    for(const employeeId of wanted){
      if(state.employees.includes(employeeId)||!recruitmentStatus(state,employeeId).unlocked||!afford(EMPLOYEES[employeeId].hire))continue;
      if(state.employees.length===state.seats){if(route==='four'||!afford(RULES.expansionCost+EMPLOYEES[employeeId].hire))continue;act({type:'expand'});}
      act({type:'hire',employeeId});
    }
    const target=route==='four'?4:state.employees.length>=6?6:4;
    while(state.compute<target&&afford(price(state)))act({type:'buyCompute',amount:1});
  }
  observe();
  while(!state.ending){
    recruitAndPurchase();
    if(state.project?.status==='ready'){
      act({type:'publish'});
      publications.push({day:state.gameDay,total:total(owned(state).at(-1)),rank:rank(state),cash:state.cash});
    }
    if(!state.project&&owned(state).length<stopAfter){
      const count=owned(state).length,focus=count<3?'coding':DIRECTIONS[(count-3)%DIRECTIONS.length];
      const direction=DIRECTIONS.indexOf(focus);
      const plannerId=[...state.employees].sort((a,b)=>employeeAbilities(state,b)[direction]-employeeAbilities(state,a)[direction])[0];
      act({type:'createProject',name:`Next ${count+1}`,focus,plannerId});
    }
    act({type:'resume'});act({type:'advanceTo',targetDay:state.gameDay+1});
  }
  const losses=timeline.filter((item,index)=>index&&timeline[index-1].rank===1&&item.rank!==1).map(item=>({lost:item.day,recovered:timeline.find(next=>next.day>item.day&&next.rank===1)?.day??null}));
  const stableOverall=timeline.find((item,index)=>item.rank===1&&timeline.slice(index).every(next=>next.rank===1))?.day??null;
  return {state,firstSpecial,firstOverall,stableOverall,losses,publications};
}
export function runExamples() {
  const champion=runPacingRoute().state,capital=runPacingRoute('special',15).state;
  const ordinary=runPacingRoute('two').state,failed=waitTo(createState());
  const states={champion,capital,ordinary,failed};
  assert.deepEqual(Object.values(states).map(s=>s.ending),['榜单常青树','融资永动机','明年一定第一','发布会照常']);
  assert.deepEqual(Object.values(states).map(s=>s.cash),[398,356,260,-4]);
  return states;
}
export function checkBoundaries() {
  let count=0;const check=(value,message)=>{assert(value,message);count++;};
  let s=createState();const original=structuredClone(s);
  check(DIRECTIONS.join(',')==='coding,office,multimodal','three directions');
  check(STAGES.map(stage=>stage.id).join(',')==='data,pretraining,posttraining,evaluation'&&STAGES.reduce((sum,stage)=>sum+stage.work,0)===RULES.projectWork,'four ordered phases');
  check(Object.values(EMPLOYEES).every(e=>e.abilities.length===3&&e.abilities.every(Number.isSafeInteger)),'employees have three abilities');
  check(RIVALS.length===5&&RIVALS.every(r=>r.models.length===4)&&RELEASES.length===15,'rival release cap');
  check(RELEASES.find(m=>m.name==='DeepPeek R1').day===campaignDay(createState(),53),'cost breakthrough remains early');
  check(!applyAction(s,{type:'advanceTo',targetDay:7}).ok,'paused cannot advance');
  check(['alex','max','rebo','tim','karpathy','boris'].every(employeeId=>applyAction(s,{type:'hire',employeeId}).error==='candidate-locked'),'locked hires');
  assert.deepEqual(s,original);count++;
  check(!applyAction(s,{type:'createProject',name:'x',focus:'coding'}).ok,'planner required');
  s=must(s,{type:'createProject',name:'x',focus:'coding',plannerId:'avery'});
  check(!applyAction(s,{type:'createProject',name:'y',focus:'office',plannerId:'jules'}).ok,'single project');
  check(usedCompute(s)===0,'planning does not train');
  s=waitTo(s,1);check(s.project.planProgress===1&&s.project.scores.every(x=>x===25),'planning takes time');
  s=waitTo(s,2);check(s.project.status==='researching'&&!s.paused&&s.project.planScores[0]===37,'plan delivery starts research');
  check(usedCompute(s)===2,'research occupies compute');
  const partial=waitTo(s,3);check(partial.notices.at(-1).employeeIds.length===2,'all staff work without assignment');
  const slow=waitTo(s),fast=waitTo(must(s,{type:'buyCompute',amount:4}));
  check(fast.gameDay<slow.gameDay,'compute speeds research');
  check(JSON.stringify(fast.project.scores)===JSON.stringify(slow.project.scores),'equal work yields equal attributes');
  check(slow.project.work===40&&slow.project.status==='ready'&&slow.paused&&usedCompute(slow)===0,'ready pauses and releases compute');
  check(slow.notices.filter(n=>n.type==='stage-complete').length===4,'every stage completes once');
  let released=must(slow,{type:'publish',presenter:'avery'});
  check(!applyAction(released,{type:'publish',presenter:'avery'}).ok,'publication once');
  check(released.funding.includes('seed')&&released.pendingBonus===6,'real first funding and pending subscription');
  const captured=structuredClone(owned(released)[0]);
  const second=develop(released,'office','jules');assert.deepEqual(owned(second)[0],captured);count++;
  for(const [day,ids]of [[21,['rebo','tim']],[42,['karpathy','boris']]]){const before=waitTo(released,day-1),after=waitTo(before,day);check(ids.every(id=>!recruitmentStatus(before,id).unlocked&&recruitmentStatus(after,id).unlocked),'recruitment date boundary');}
  let missing=must(waitTo(must(createState(),{type:'createProject',name:'plan',focus:'coding',plannerId:'avery'}),1),{type:'dismiss',employeeId:'avery'});
  check(missing.paused&&missing.project.plannerId===null&&!applyAction(missing,{type:'resume'}).ok,'planner dismissal pauses safely');
  missing=must(missing,{type:'selectPlanner',employeeId:'jules'});check(waitTo(missing,2).project.planScores[0]===29,'replacement actually designs');
  let empty=partial;for(const employeeId of [...empty.employees])empty=must(empty,{type:'dismiss',employeeId});
  const idle=waitTo(empty,4);check(idle.project.work===empty.project.work&&usedCompute(idle)===0,'no staff no phantom work');
  let reset=must(waitTo(released,42),{type:'hire',employeeId:'rebo'});reset=must(reset,{type:'reset'});reset=waitTo(reset,43);check(reset.ratingTenths===26&&!reset.assignments.rebo,'reset completed once');
  check(!applyAction(released,{type:'buyCompute',amount:99}).ok,'compute cap');
  const deadline=waitTo(released,RULES.lastDay-1);check(!deadline.ending&&waitTo(deadline,RULES.lastDay).ending,'final day settlement');
  const failed=waitTo(createState());check(failed.gameDay===91&&failed.cash===-4&&!applyAction(failed,{type:'resume'}).ok,'bankruptcy terminal');
  const events=waitTo(released);check(events.models.filter(m=>m.company!=='player').length===20&&new Set(events.appliedEvents).size===events.appliedEvents.length,'competitor events exactly once');
  const classic=createState({profile:'classic168'});
  check(rulesFor(classic).lastDay===168&&rulesFor(classic).experiencePerPoint===40&&rulesFor(classic).inheritancePercent===50,'classic rules are retained');
  const classicPublished=develop(classic);
  const classicEnd=waitTo(classicPublished,168);
  check(classicEnd.gameDay===168&&classicEnd.models.filter(model=>model.company!=='player').length===20,'classic companies finish their original calendar');
  const championRoute=runPacingRoute();
  check(championRoute.firstSpecial===20&&championRoute.firstOverall===26,'specialist precedes overall victory');
  assert.deepEqual(championRoute.losses,[{lost:35,recovered:44},{lost:51,recovered:56},{lost:79,recovered:86},{lost:101,recovered:104}]);count++;
  check(championRoute.stableOverall===104,'final releases can overtake the player');
  for(const [route,cash,best,stable] of [['noKarpathy',408,1412,110],['noBoris',424,1460,104]]){
    const result=runPacingRoute(route);
    check(result.state.ending==='榜单常青树'&&result.state.cash===cash&&Math.max(...owned(result.state).map(total))===best&&result.stableOverall===stable,route+' can win');
  }
  return count;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const states=runExamples();
  console.table(Object.entries(states).map(([route,s])=>({route,ending:s.ending,day:s.gameDay,cash:s.cash,models:owned(s).length,best:owned(s).length?Math.max(...owned(s).map(total)):0,rank:rank(s),employees:s.employees.length,funding:s.funding.join(',')})));
  console.log(`PASS: ${checkBoundaries()} automatic-development boundaries; four reachable endings.`);
}
