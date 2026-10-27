import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../src/game/rules.js';
import * as story from '../src/story.js';
import {unreadNotifications} from '../src/notifications.js';
const act=(s,a)=>{const r=game.applyAction(s,a);assert.ok(r.ok,r.error);return r.state;};
const to=(s,day)=>act(act(s,{type:'resume'}),{type:'advanceTo',targetDay:day});
function company(profile='budget112'){
  let s=act(game.createState({profile}),{type:'createProject',name:'First',focus:'coding',plannerId:'avery'});
  s=act(to(s,112),{type:'publish'});s=to(s,21);
  return act(s,{type:'hire',employeeId:'rebo'});
}

test('Rebo availability explains recruitment, products, funds, full rating and pending completion',()=>{
  assert.equal(typeof game.quotaResetStatus,'function');
  assert.equal(game.quotaResetStatus(game.createState()).reason,'rebo');
  const noUsers=act(to(game.createState(),21),{type:'hire',employeeId:'rebo'});
  assert.equal(game.quotaResetStatus(noUsers).reason,'no-users');
  const s=company(),status=game.quotaResetStatus(s);
  assert.equal(status.available,true);assert.equal(status.cost,4);assert.equal(status.finishDay,22);assert.equal(status.ratingAfter,26);
  for(const [change,reason]of [[{cash:3},'cash'],[{ratingTenths:50},'rating-full'],[{ending:'明年一定第一'},'game-ended']])assert.equal(game.quotaResetStatus({...s,...change}).reason,reason);
  const busy=act(s,{type:'reset'});assert.equal(game.quotaResetStatus(busy).reason,'reset-running');
  assert.equal(game.quotaResetStatus(busy).finishDay,22);assert.equal(game.applyAction(busy,{type:'reset'}).ok,false);assert.equal(busy.cash,s.cash-4);
});

test('special employee descriptions distinguish manual abilities from actual automatic effects',()=>{
  assert.equal(typeof story.specialAbility,'function');
  const s=company();assert.equal(story.specialAbility(s,'rebo').mode,'主动能力');
  for(const id of ['alex','boris','tim','max','karpathy'])assert.equal(story.specialAbility(s,id).mode,'自动特性');
  assert.equal(story.specialAbility(s,'avery'),null);
  assert.match(story.specialAbility(s,'alex').copy,/14.*10/);
  assert.match(story.specialAbility(game.createState({profile:'compact112'}),'alex').copy,/6.*3/);
  assert.match(story.specialAbility(s,'boris').copy,/\+2/);assert.match(story.specialAbility(s,'tim').copy,/\+1/);
  assert.match(story.specialAbility(s,'max').copy,/评测/);assert.match(story.specialAbility(s,'karpathy').copy,/三项能力/);
});

test('a finished reset produces one readable result and acknowledgment prevents repeats',()=>{
  const before=company(),busy=act(before,{type:'reset'});
  assert.equal(unreadNotifications(busy).some(n=>n.kind==='ability'),false);
  const done=to(busy,22),notices=unreadNotifications(done).filter(n=>n.kind==='ability');assert.equal(notices.length,1);
  assert.match(notices[0].title,/Rebo/);assert.match(notices[0].copy,/2\.6/);
  assert.equal(unreadNotifications(done,[notices[0].id]).some(n=>n.kind==='ability'),false);
  assert.deepEqual(game.replayActions(done.acceptedActions),done);
});
