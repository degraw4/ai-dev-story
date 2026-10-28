import test from 'node:test';
import assert from 'node:assert/strict';
import { DIRECTIONS, RIVALS } from '../src/game/content.js';
import * as story from '../src/story.js';

const models = RIVALS.flatMap(rival => rival.models.map(model => ({ ...model, company:rival.company })));

test('each configured rival model has its own introduction and reads its published scores and date', () => {
  assert.equal(typeof story.modelIntroduction, 'function');
  const descriptions = new Set();
  for (const model of models) {
    const before = structuredClone(model);
    const introduction = story.modelIntroduction(model);
    for (const field of ['description', 'focus', 'release']) assert.equal(typeof introduction[field], 'string');
    assert.ok(introduction.description.trim().length > 0, model.name);
    descriptions.add(introduction.description);
    const highest = model.scores.indexOf(Math.max(...model.scores));
    assert.equal(introduction.focus, story.DIRECTION_LABELS[DIRECTIONS[highest]]);
    assert.equal(introduction.release, model.day === 0 ? '开局已有模型' : `第 ${model.day} 日发布`);
    assert.deepEqual(model, before);
  }
  assert.equal(models.length, 20);
  assert.equal(descriptions.size, models.length, 'Each actual model needs distinct copy, rather than a company-wide fallback.');
  const changedRecord = {...models[0], day:12, scores:[25,26,90]};
  const changed = story.modelIntroduction(changedRecord);
  assert.equal(changed.release, '第 12 日发布');
  assert.equal(changed.focus, '多模态');
});

test('introductions respect the model release chapter without leaking later controversies', () => {
  assert.equal(typeof story.modelIntroduction, 'function');
  for (const model of models) {
    const {description} = story.modelIntroduction(model);
    if (model.company === 'Meeta' && model.day < 87) assert.doesNotMatch(description, /收紧|关闭|商务|封闭|下载门关/);
    if (model.company === 'DeepPeek') {
      assert.doesNotMatch(description, /回应|反驳|回击|指控|采访/);
      if (model.name === 'DeepPeek R1') assert.match(description, /推理成本/);
      if (model.day < 53) assert.doesNotMatch(description, /成本突破|预算恐慌|同行恐慌|股价下跌/);
    }
    if (model.company === 'AntiThropic' && model.day === 0) assert.doesNotMatch(description, /访问限制|核验|行为检测/);
    if (model.company === 'CloseAI' && model.day < 154) assert.doesNotMatch(description, /上市|招股|IPO/);
  }
});

test('player introductions describe the actual focus, score, publication and paid media', () => {
  assert.equal(typeof story.modelIntroduction, 'function');
  const player = {company:'player', name:'My Model', day:41, focus:'office', scores:[150,40,25], media:null};
  const before = structuredClone(player);
  const introduction = story.modelIntroduction(player);
  assert.equal(introduction.focus, '办公', 'The chosen focus need not be the inherited highest score.');
  assert.equal(introduction.release, '第 41 日发布');
  assert.match(introduction.description, /办公/);
  assert.match(introduction.description, /215/);
  assert.match(introduction.description, /没有买媒体报道/);
  const paid = story.modelIntroduction({...player, scores:[150,60,25], media:'机器之薪'});
  assert.match(paid.description, /235/);
  assert.match(paid.description, /机器之薪/);
  assert.doesNotMatch(paid.description, /没有买媒体报道/);
  assert.deepEqual(player, before);
});

test('media have distinct voices and every publication gets a new title and excerpt',()=>{
  const media=['机器之薪','量子味','新智猿'];
  const all=[];
  for(const name of media){const history=[];for(let index=1;index<=8;index++){
    const model={id:`player-${index}`,company:'player',sequence:index,name:`Next ${index}`,day:index*6,focus:'coding',scores:[80+index,50,45],media:name};
    history.push(model);const article=story.mediaArticle(model,3,history);assert.match(article.copy,new RegExp(name));assert.match(article.title,new RegExp(model.name));assert.match(article.copy,/第 3 名/);all.push(article);
  }}
  assert.equal(new Set(all.map(item=>item.title)).size,24);assert.equal(new Set(all.map(item=>item.copy)).size,24);
  assert.match(all.find(item=>item.copy.startsWith('机器之薪')).title,/评测|技术|测试/);
  assert.match(all.find(item=>item.copy.startsWith('新智猿')).title,/刚刚.*发布/);
});

test('release and user comments follow model focus without changing published data',()=>{
  const comments=new Set(),releases=new Set();
  for(const focus of DIRECTIONS)for(let serial=1;serial<=5;serial++){
    const model={id:`player-${serial}`,company:'player',name:`Next ${serial}`,day:serial*10,focus,scores:[80,70,60],media:null,releaseFeedback:{before:{users:0},after:{users:10}}};
    const before=structuredClone(model),feedback=story.userFeedback(model);
    assert.equal(feedback.id,`feedback:${model.id}`);assert.equal(feedback.impact,model.releaseFeedback);
    assert.match(feedback.title,new RegExp(model.name));
    comments.add(feedback.copy);releases.add(story.playerReleaseCopy(model));
    assert.deepEqual(model,before);
  }
  assert.equal(comments.size,15);assert.equal(releases.size,9);
});
