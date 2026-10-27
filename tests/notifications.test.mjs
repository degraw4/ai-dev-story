import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../src/game/rules.js';
import {must,waitTo,develop} from '../scripts/check-realtime-design.mjs';
import {unreadNotifications} from '../src/notifications.js';
import {FAREWELLS} from '../src/story.js';
test('news is prompted only after its real day and feedback requires a publication',()=>{
 const initial=createState();assert.deepEqual(unreadNotifications(initial),[]);
 const s=waitTo(initial,10),before=structuredClone(s),items=unreadNotifications(s);
 assert.ok(items.some(n=>n.id==='N02'));assert.ok(items.every(n=>n.day<=10));assert.equal(items.some(n=>n.kind==='feedback'),false);assert.deepEqual(s,before);
 const published=develop(createState());assert.equal(unreadNotifications(published).filter(n=>n.kind==='feedback').length,1);
});
test('ready-model prompt has priority and acknowledged notifications do not repeat',()=>{
 const s=waitTo(must(createState(),{type:'createProject',name:'First',focus:'coding',plannerId:'avery'}));
 const items=unreadNotifications(s);assert.equal(items[0].kind,'ready');assert.equal(items[0].id,'release-prompt:1');
 assert.deepEqual(unreadNotifications(s,items.map(n=>n.id)),[]);
 const afterOne=unreadNotifications(s,[items[0].id]);assert.equal(afterOne.length,items.length-1);assert.ok(afterOne.every(n=>n.kind!=='ready'));
});

test('dismissal immediately gets its own farewell, real employee and compensation',()=>{
  let s=waitTo(createState(),10);s=must(s,{type:'dismiss',employeeId:'avery'});
  const next=unreadNotifications(s)[0];assert.equal(next.kind,'farewell');assert.match(next.title,/Avery Loop/);assert.match(next.copy,/8 万/);assert.ok(next.copy.includes(FAREWELLS.avery));
});

test('paid media article and user feedback are distinct, acknowledged release reactions',()=>{
  let s=waitTo(must(createState(),{type:'createProject',name:'Paper',focus:'coding',plannerId:'avery'}));
  s=must(s,{type:'publish',media:'新智猿'});
  const items=unreadNotifications(s),article=items.find(n=>n.kind==='media'),feedback=items.find(n=>n.kind==='feedback');
  assert.ok(article);assert.ok(feedback);assert.notEqual(article.id,feedback.id);assert.match(article.title,/Paper/);assert.match(article.copy,/新智猿/);
  assert.ok(feedback.impact.after.users>feedback.impact.before.users);
  assert.ok(unreadNotifications(s,[article.id]).some(n=>n.id===feedback.id));
});
