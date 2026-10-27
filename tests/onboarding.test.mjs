import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../src/game/rules.js';
import {must as act,waitTo} from '../scripts/check-realtime-design.mjs';
import {onboardingStep,tourStep,updateTourProgress} from '../src/onboarding.js';

test('secretary follows real proposal and automatic development without a manual assignment step',()=>{
 let s=createState();assert.equal(onboardingStep(s).id,'project');
 s=act(s,{type:'createProject',name:'First',focus:'coding',plannerId:'avery'});assert.equal(onboardingStep(s).id,'start');
 s=act(s,{type:'resume'});assert.equal(onboardingStep(s).id,'planning');
 s=waitTo(s,2);assert.equal(onboardingStep(s).id,'research');
 s=waitTo(s);assert.equal(onboardingStep(s).id,'release');
 s=act(s,{type:'publish',presenter:'avery'});assert.equal(onboardingStep(s).id,'published');
});
test('guide handles empty staff and a dismissed planner without inventing progress',()=>{
 let s=act(createState(),{type:'createProject',name:'First',focus:'coding',plannerId:'avery'});
 s=act(s,{type:'dismiss',employeeId:'avery'});assert.equal(onboardingStep(s).id,'planner');
 s=act(s,{type:'dismiss',employeeId:'jules'});assert.equal(onboardingStep(s).id,'hire');
 const before=structuredClone(s);assert.equal(onboardingStep(s,{skipped:true}).showGuidance,false);assert.deepEqual(s,before);
});
test('a completed first model still requires a present publisher',()=>{
 let s=waitTo(act(createState(),{type:'createProject',name:'First',focus:'coding',plannerId:'avery'}));
 for(const employeeId of [...s.employees])s=act(s,{type:'dismiss',employeeId});assert.equal(onboardingStep(s).target,'hiring');
 s=act(s,{type:'hire',employeeId:'morgan'});assert.equal(onboardingStep(s).target,'release');
});

test('office tour introduces identity, dashboard, clock and grouped entrances before live advice', () => {
  const company = createState();
  const before = structuredClone(company);
  let progress = updateTourProgress({tourStep:4,tourCompleted:true}, 'restart');
  const visited = [];
  for (let step = 0; step < 5; step++) {
    visited.push(tourStep(progress).id);
    assert.equal(progress.tourCompleted, false);
    progress = updateTourProgress(progress, 'next');
  }
  assert.deepEqual(visited, ['office','dashboard','time','production','business']);
  assert.equal(progress.tourCompleted, true);
  assert.equal(onboardingStep(company).target, 'project');
  assert.deepEqual(company, before);
});

test('tour resumes its saved step, supports back and skip, and restarts independently of company progress', () => {
  const company = act(createState(), {type:'createProject',name:'Existing work',focus:'office',plannerId:'jules'});
  const before = structuredClone(company);
  const saved = JSON.parse(JSON.stringify({tourStep:3,tourCompleted:false}));
  assert.equal(tourStep(saved).id, 'production');
  const back = updateTourProgress(saved, 'back');
  assert.equal(tourStep(back).id, 'time');
  const skipped = updateTourProgress(back, 'skip');
  assert.equal(skipped.tourCompleted, true);
  assert.equal(onboardingStep(company).id, 'start');
  assert.deepEqual(updateTourProgress(skipped, 'restart'), {tourStep:0,tourCompleted:false});
  assert.deepEqual(company, before);
});

test('older settings do not force a tour and invalid presentation preferences stay bounded', () => {
  assert.equal(tourStep({}).completed, true);
  assert.equal(tourStep({tourStep:999,tourCompleted:false}).index, 4);
  assert.equal(tourStep({tourStep:-3,tourCompleted:false}).index, 0);
  assert.deepEqual(updateTourProgress({tourStep:0,tourCompleted:false}, 'back'), {tourStep:0,tourCompleted:false});
});

test('after viewing finances the secretary moves on to the next model',()=>{
  let s=waitTo(act(createState(),{type:'createProject',name:'First',focus:'coding',plannerId:'avery'}));
  s=act(s,{type:'publish',presenter:'avery'});
  assert.equal(onboardingStep(s).target,'finance');
  assert.equal(onboardingStep(s,{financeReviewed:true}).target,'project');
});
