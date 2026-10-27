import test from 'node:test';
import assert from 'node:assert/strict';
import {mediaArticle,mediaHeadline} from '../src/story.js';
import {unreadNotifications} from '../src/notifications.js';
import {createState,applyAction,rank} from '../src/game/rules.js';
const model=(sequence,media='新智猿')=>({id:`player-${sequence}`,company:'player',sequence,name:'Example',day:sequence,focus:'coding',scores:[80,60,50],media,mediaIncome:10,mediaUntilDay:28});

test('a media article contains reporting only and never explains the paid campaign mechanics',()=>{
  for(const name of ['机器之薪','量子味','新智猿'])for(let sequence=1;sequence<=9;sequence++){
    const history=Array.from({length:sequence},(_,i)=>model(i+1,name));
    const article=mediaArticle(history.at(-1),3,history);
    assert.doesNotMatch(article.copy,/付费用户|账单|不叠加|推广|有效期|报道费|每期|可复用|编辑|稿费/);
    assert.match(article.copy,/第 3 名/);assert.match(article.copy,/190/);
  }
});
test('each outlet escalates by its own paid articles, with no four-article reset or future-history drift',()=>{
  const one=model(1),unpaid=model(2,null),other=model(3,'机器之薪'),two=model(4);
  const first=mediaArticle(one,3,[one]);
  assert.equal(mediaArticle(two,3,[two]).title,first.title,'a late model can still be this outlet\'s first article');
  const second=mediaArticle(two,3,[one,unpaid,other,two]);
  assert.notEqual(second.title,first.title);
  assert.equal(mediaHeadline(two,3,[one,unpaid,other,two]),second.title);
  const history=Array.from({length:10},(_,i)=>model(i+1));
  const titles=history.map(item=>mediaArticle(item,3,history).title);
  assert.equal(new Set(titles).size,10,'later coverage never returns to an earlier headline tier');
  assert.deepEqual(mediaArticle(two,3,[one,unpaid,other,two,...history.filter(item=>item.sequence>4)]),second,'future reports do not rewrite the old report');
});
test('notification articles and release headlines use the same history without changing saved economics',()=>{
  const act=(state,action)=>{const result=applyAction(state,action);assert(result.ok,result.error);return result.state;};
  let state=createState();
  for(let i=0;i<2;i++){
    state=act(state,{type:'createProject',name:`Release ${i}`,focus:'coding',plannerId:'avery'});
    state=act(act(state,{type:'resume'}),{type:'advanceTo',targetDay:112});
    state=act(state,{type:'publish',media:'新智猿'});
  }
  const before=structuredClone(state),notices=unreadNotifications(state).filter(item=>item.kind==='media');
  assert.equal(notices.length,2);
  for(const notice of notices){
    const history=state.models.filter(item=>item.sequence<=notice.model.sequence);
    assert.equal(notice.title,mediaHeadline(notice.model,rank({...state,models:history}),history));
  }
  assert.deepEqual(state,before);
});
