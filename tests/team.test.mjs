import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,applyAction,replayActions,rulesFor,productionSummary,employeeAbilities} from '../src/game/rules.js';
const act=(state,action)=>{const result=applyAction(state,action);assert.ok(result.ok,result.error);return result.state;};
const to=(state,day)=>act(act(state,{type:'resume'}),{type:'advanceTo',targetDay:day});
function firstProject(recruits=[],profile='startup112'){
  let state=createState({profile,burst:false});
  for(const employeeId of recruits)state=act(state,{type:'hire',employeeId});
  state=act(state,{type:'createProject',name:'Team comparison',focus:'multimodal',plannerId:'avery'});
  return to(state,rulesFor(state).lastDay);
}

test('more employees improve final model scores with the same knowledge, planner, focus, compute and work',()=>{
  for(const profile of ['startup112','budget112','compact112','classic168']){
    const two=firstProject([],profile),three=firstProject(['morgan'],profile),four=firstProject(['morgan','casey'],profile);
    for(const state of [two,three,four]){assert.equal(state.project.work,40);assert.equal(state.compute,2);assert.deepEqual(state.project.initialScores,[25,25,25]);assert.deepEqual(state.project.planScores,two.project.planScores);}
    for(let i=0;i<3;i++){assert.ok(three.project.scores[i]>two.project.scores[i]);assert.ok(four.project.scores[i]>three.project.scores[i]);}
  }
  assert.deepEqual(firstProject().project.scores,[47,43,39]);
  assert.deepEqual(firstProject(['morgan','casey']).project.scores,[55,59,75]);
});

test('equal-size teams reflect employee strengths instead of only headcount',()=>{
  const office=firstProject(['morgan']),multimodal=firstProject(['casey']);
  assert.equal(office.employees.length,multimodal.employees.length);assert.equal(office.gameDay,multimodal.gameDay);
  assert.deepEqual(office.project.planScores,multimodal.project.planScores);
  assert.deepEqual(office.project.scores,[51,53,51]);assert.deepEqual(multimodal.project.scores,[51,49,63]);
});

test('research summary reports current team abilities; hiring and dismissal affect only future work',()=>{
  let state=act(createState({burst:false}),{type:'createProject',name:'Live team',focus:'coding',plannerId:'avery'});
  state=to(state,3);assert.deepEqual(productionSummary(state).teamAbilities,[8,8,3]);
  const earned=structuredClone(state.project);
  state=act(state,{type:'hire',employeeId:'casey'});
  assert.deepEqual(state.project,earned);assert.deepEqual(productionSummary(state).teamAbilities,[10,11,9]);
  state=act(state,{type:'dismiss',employeeId:'casey'});
  assert.deepEqual(state.project,earned);assert.deepEqual(productionSummary(state).teamAbilities,[8,8,3]);
});

test('staff resetting quota are excluded from the research total and return after completion',()=>{
  let state=act(firstProject(),{type:'publish'});state=to(state,21);state=act(state,{type:'hire',employeeId:'rebo'});
  state=act(state,{type:'createProject',name:'Reset comparison',focus:'coding',plannerId:'avery'});state=to(state,24);
  const before=productionSummary(state);assert.ok(before.activeEmployeeIds.includes('rebo'));
  state=act(state,{type:'reset'});const busy=productionSummary(state);
  assert.ok(!busy.activeEmployeeIds.includes('rebo'));
  assert.deepEqual(busy.teamAbilities,before.teamAbilities.map((value,i)=>value-employeeAbilities(state,'rebo')[i]));
  state=to(state,25);assert.ok(productionSummary(state).activeEmployeeIds.includes('rebo'));
  assert.ok(!state.notices.findLast(notice=>notice.type==='research').employeeIds.includes('rebo'));
});

test('grown staff improve the finished model with identical knowledge, planner and team size',()=>{
  function grow(recruit){
    // The fixed budget profile gives both legal histories identical knowledge,
    // isolating employee experience from company inheritance.
    let state=act(createState({profile:'budget112',burst:false}),{type:'hire',employeeId:recruit});
    for(let i=0;i<2;i++){
      state=act(state,{type:'createProject',name:`Practice ${i+1}`,focus:'coding',plannerId:'avery'});
      state=act(to(state,112),{type:'publish'});
    }
    return state;
  }
  let veteran=grow('casey'),newHire=grow('morgan');
  newHire=act(act(newHire,{type:'dismiss',employeeId:'morgan'}),{type:'hire',employeeId:'casey'});
  assert.deepEqual(veteran.knowledge,[35,29,27]);assert.deepEqual(veteran.knowledge,newHire.knowledge);
  assert.deepEqual(veteran.employees,newHire.employees);assert.equal(veteran.compute,newHire.compute);
  for(const id of ['avery','jules'])assert.deepEqual(employeeAbilities(veteran,id),employeeAbilities(newHire,id));
  assert.deepEqual(employeeAbilities(veteran,'casey'),[3,3,6]);assert.deepEqual(employeeAbilities(newHire,'casey'),[2,3,6]);
  const finish=state=>to(act(state,{type:'createProject',name:'Controlled model',focus:'coding',plannerId:'avery'}),112);
  veteran=finish(veteran);newHire=finish(newHire);
  assert.equal(veteran.gameDay,newHire.gameDay);assert.deepEqual(veteran.project.planScores,newHire.project.planScores);
  assert.deepEqual(veteran.project.scores,[102,53,46]);assert.deepEqual(newHire.project.scores,[98,53,46]);
  for(const state of [veteran,newHire])assert.deepEqual(replayActions(state.acceptedActions),state);
});
