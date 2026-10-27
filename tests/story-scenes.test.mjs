import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,applyAction,rulesFor,campaignDay,price} from '../src/game/rules.js';
import {unreadNotifications} from '../src/notifications.js';
import {STORY_SCENES,storyScene,selectedStoryChoice} from '../src/story-scenes.js';
import {newsFor} from '../src/story.js';
import {encodeSave,decodeSave,SCHEMA_VERSION} from '../src/storage.js';
const act=(s,a)=>{const r=applyAction(s,a);assert.ok(r.ok,r.error);return r.state;};
const to=(s,day)=>act(act(s,{type:'resume'}),{type:'advanceTo',targetDay:day});
const beginning=['story-start:0'];
function survivingCompany(){
  let s=act(createState(),{type:'createProject',name:'One real release',focus:'coding',plannerId:'avery'});
  return act(to(s,112),{type:'publish'});
}

test('the first story replaces its matching news and reading cannot change the company',()=>{
  const early=to(createState(),4);assert.equal(unreadNotifications(early,beginning).some(n=>n.kind==='story'),false);
  const state=to(early,5),before=structuredClone(state),items=unreadNotifications(state,beginning);
  assert.ok(items.some(n=>n.id==='story-bill'&&n.kind==='story'));
  assert.equal(items.some(n=>n.id==='bill-first'),false);assert.deepEqual(state,before);
  const seen=unreadNotifications(state,[...beginning,'story-bill']);
  assert.equal(seen.some(n=>n.id==='story-bill'||n.id==='bill-first'),false);
});

test('ten spaced stories span the campaign without retroactively queuing a previous save',()=>{
  const company=to(survivingCompany(),111);
  const all=unreadNotifications(company,beginning).filter(n=>n.kind==='story').sort((a,b)=>a.day-b.day);
  assert.deepEqual(all.map(n=>n.day),[5,16,29,40,52,63,74,85,93,107]);
  assert.equal(new Set(all.map(n=>n.id)).size,10);
  const resumed=unreadNotifications(company,['story-start:90']).filter(n=>n.kind==='story');
  assert.deepEqual(resumed.map(n=>n.day).sort((a,b)=>a-b),[93,107]);
  assert.equal(unreadNotifications(company).some(n=>n.kind==='story'),false);
});

test('rival results remain available and the neighboring releases are not both swallowed',()=>{
  const state=to(survivingCompany(),52),items=unreadNotifications(state,beginning);
  assert.ok(items.some(n=>n.id==='rival-1-2'&&n.kind==='news'));
  assert.equal(items.some(n=>n.id==='rival-0-2'&&n.kind==='news'),false);
  assert.ok(items.some(n=>n.kind==='story'&&n.day===52));
  assert.ok(state.models.some(m=>m.name==='TalkGPT 5'));
});

test('scenes support all company calendars and have bounded interactions without modifying facts',()=>{
  for(const profile of ['budget112','compact112','classic168']){
    const state=createState({profile}),before=structuredClone(state);
    const modes=new Set();
    for(const definition of STORY_SCENES){
      const scene=storyScene(state,definition.id,beginning);modes.add(scene.mode);
      assert.equal(scene.day,campaignDay(state,definition.classicDay));
      const steps=scene.lines||scene.cards||scene.choices;assert.ok(steps.length>=2&&steps.length<=3);
      assert.equal(typeof scene.intro,'string');assert.equal(typeof scene.outro,'string');
      assert.ok(scene.facts.every(fact=>typeof fact.label==='string'&&typeof fact.value==='string'));
    }
    assert.deepEqual([...modes].sort(),['choice','dialogue','reveal']);assert.deepEqual(state,before);
    const quoteDay=campaignDay(state,140),quote=price({...state,gameDay:quoteDay});
    assert.ok(storyScene(state,'story-steady').intro.includes(`${quote} 万`));
  }
});

test('replaying industry scenes does not leak later model versions into their original day',()=>{
  const state=to(survivingCompany(),111);
  const contacts=JSON.stringify(storyScene(state,'story-contacts'));
  assert.ok(contacts.includes('Geminot 1'));assert.ok(!contacts.includes('Geminot 2'));
  const pencil=JSON.stringify(storyScene(state,'story-pencil'));
  assert.ok(pencil.includes('Cloud Opus 5')&&pencil.includes('TalkGPT 5'));
  assert.ok(!pencil.includes('Cloud Fable')&&!pencil.includes('TalkGPT Astra'));
  const items=unreadNotifications(state,[...beginning,'story-soon']);
  assert.equal(items.some(item=>item.id==='countdown'),false);
  assert.ok(newsFor(state).some(item=>item.id==='countdown'),'original newspaper remains in archive');
});

test('the finale distinguishes actual unpublished, ready and too-late projects',()=>{
  const empty=storyScene(createState(),'story-deadline');
  assert.match(empty.choices.find(c=>c.id==='record').reply,/尚未发布/);
  assert.match(empty.choices.find(c=>c.id==='progress').reply,/没有在研/);
  const published=survivingCompany();
  const project=act(published,{type:'createProject',name:'Actual ready',focus:'office',plannerId:'jules'}),ready=to(project,112);
  const readyScene=storyScene(ready,'story-deadline');
  assert.match(readyScene.choices[0].reply,/Actual ready.*已完成/);
  assert.ok(readyScene.choices[0].reply.includes(`${rulesFor(ready).publicationCost} 万`));
  const late=act(to(published,106),{type:'createProject',name:'Too late',focus:'coding',plannerId:'avery'});
  assert.match(storyScene(late,'story-deadline').choices[0].reply,/晚于/);
});

test('headline selection survives save and is recalled without creating an economic action',()=>{
  const state=act(to(survivingCompany(),107),{type:'pause'}),before=structuredClone(state);
  const observedStoryEvents=[...beginning,'story-pick:story-headlines:again','story-headlines'];
  const snapshot={schemaVersion:SCHEMA_VERSION,state,dayProgressMs:0,observedStoryEvents,feedbackResponses:{}};
  const restored=decodeSave(encodeSave(snapshot));assert.ok(restored.ok,restored.error);assert.deepEqual(restored.snapshot,snapshot);
  assert.equal(selectedStoryChoice(restored.snapshot.observedStoryEvents,'story-headlines'),'again');
  assert.match(storyScene(state,'story-deadline',observedStoryEvents).outro,/你上次选的“又”/);
  assert.ok(!storyScene(state,'story-deadline',beginning).outro.includes('你上次选的'));
  assert.deepEqual(state,before);
});

test('an existing company adopting stories does not replay an already read same-day headline',()=>{
  const state=to(survivingCompany(),29);
  assert.equal(unreadNotifications(state,['headlines']).some(item=>item.id==='story-headlines'),false);
  assert.equal(unreadNotifications(state,['story-start:30','headlines']).some(item=>item.kind==='story'),false);
});

test('Gloglo remains a thousand-person company while the scene labels the player team separately',()=>{
  for(const hires of [[],['morgan','casey']]){
    let state=createState();
    for(const employeeId of hires)state=act(state,{type:'hire',employeeId});
    state=to(state,18);
    const before=structuredClone(state),scene=storyScene(state,'story-contacts');
    assert.match(scene.intro,/Gloglo.*千人以上/);
    assert.match(scene.cards[1].copy,/Jeff 走后，Gloglo 仍有上千名员工/);
    assert.equal(scene.facts[0].label,'你公司的在岗员工');
    assert.equal(scene.facts[0].value,`${state.employees.length} 人`);
    assert.deepEqual(state,before);
  }
});
