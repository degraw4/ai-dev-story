// Run against a local server and an isolated Chromium CDP session.
// The browser's monotonic clock is accelerated only in this verification session.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createState, applyAction, recruitmentStatus, rank, rulesFor, replayActions, trainingCost, employeeTerms, mediaCost, mediaCampaign, operatingCosts, employeeAbilities } from '../src/game/rules.js';
import { DIRECTIONS, RULES, EMPLOYEES } from '../src/game/content.js';
import { unreadNotifications } from '../src/notifications.js';
import { STORY_SCENES, storyScene, storyStartMarker } from '../src/story-scenes.js';
import { userFeedback } from '../src/story.js';
import { budgetExamples, startupExamples, subscriptionExamples } from './check-cost-balance.mjs';
import { encodeSave, SAVE_KEY, MIGRATION_SAVE_KEYS, LEGACY_SAVE_KEYS, SCHEMA_VERSION } from '../src/storage.js';

const endpoint = process.env.AI_DEV_BROWSER_URL ?? 'http://127.0.0.1:9338';
const base = process.env.AI_DEV_GAME_URL ?? 'http://127.0.0.1:4173/';
const pages = await fetch(endpoint + '/json/list').then(response => response.json());
const page = pages.find(item => item.type === 'page' && item.url.startsWith(base));
assert(page, 'Open the playable prototype in an isolated debugging browser');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let sequence = 0;
const pending = new Map();
const errors = [];
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject, timer } = pending.get(message.id); clearTimeout(timer); pending.delete(message.id);
    message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
  }
});
function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error('Timed out: ' + method)); }, 15000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression, userGesture = false) {
  const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture });
  assert(!response.exceptionDetails, JSON.stringify(response.exceptionDetails)); return response.result.value;
}
async function until(expression) {
  const result = await evaluate(`new Promise(resolve => { let attempts=0; const check=()=>{if (${expression}) resolve(true); else if(++attempts>400) resolve(false); else setTimeout(check,25);}; check(); })`);
  assert(result, 'Condition not reached: ' + expression);
}
async function reload() { await evaluate('window.__prototypeOldDocument=true'); await command('Page.reload', { ignoreCache: true }); await until("!window.__prototypeOldDocument && document.readyState === 'complete' && document.getElementById('model-name') && document.getElementById('office').dataset.ready === 'true'"); await evaluate('document.fonts.ready'); await evaluate('new Promise(r=>setTimeout(r,100))'); }
async function onNextDocument(source) {
  const hook = await command('Page.addScriptToEvaluateOnNewDocument', { source });
  try { await reload(); }
  finally { await command('Page.removeScriptToEvaluateOnNewDocument', { identifier: hook.identifier }); }
}
const saved = () => evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(SAVE_KEY)}))`);
const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`, true);
async function pointerAt(selector) {
  const point=await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});n.scrollIntoView({block:'nearest'});const r=n.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  assert(point.x>=0&&point.y>=0,'pointer target is visible');
  await command('Input.dispatchMouseEvent',{type:'mouseMoved',...point});return point;
}
async function pointerClick(selector) {
  const point=await pointerAt(selector);
  await command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
  await command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
}
async function pressEscape() {
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
}
const choose = (selector, value) => evaluate(`{const node=document.querySelector(${JSON.stringify(selector)});node.value=${JSON.stringify(value)};node.dispatchEvent(new Event('change',{bubbles:true}));}`, true);
const fill = (selector, value) => evaluate(`document.querySelector(${JSON.stringify(selector)}).value=${JSON.stringify(value)}`);
const submit = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).requestSubmit()`, true);
const output = (process.env.AI_DEV_SCREENSHOT_DIR ?? fileURLToPath(new URL('../docs/previews/prototype/', import.meta.url))).replace(/\/?$/, '/');
await mkdir(output, { recursive: true });
async function screenshot(name, full = false) {
  const options = { format: 'png', captureBeyondViewport: full };
  if (full) { const metrics = await command('Page.getLayoutMetrics'); const size = metrics.cssContentSize; options.clip = { x: 0, y: 0, width: size.width, height: size.height, scale: 1 }; }
  const { data } = await command('Page.captureScreenshot', options); await writeFile(output + name, Buffer.from(data, 'base64'));
}
function act(state, action) { const result = applyAction(state, action); assert(result.ok, result.error); return result.state; }
function advance(state) { return act(act(state, { type: 'resume' }), { type: 'advanceTo', targetDay: rulesFor(state).lastDay }); }
function develop(state, focus) {
  state = act(state, { type: 'createProject', name: `Next ${state.nextProjectId}`, focus, plannerId:state.employees[0] });
  state = advance(state);
  return state.ending ? state : act(state, { type: 'publish', presenter: state.employees[0] });
}
function fixture(state) { return encodeSave({ schemaVersion: SCHEMA_VERSION, state: {...state,paused:true}, dayProgressMs: 0, observedStoryEvents: [...unreadNotifications(state).map(item=>item.id),...(state.funding.length?['milestone-first-funding']:[]),...(state.funding.includes('overall')?['milestone-first-top']:[])], feedbackResponses: {} }); }
async function loadFixture(state) { await onNextDocument(`localStorage.setItem(${JSON.stringify(SAVE_KEY)},${JSON.stringify(fixture(state))})`); }

const economy = ({acceptedActions,paused,...rest}) => rest;
let panelWasPaused=true;
async function drainNotices(){
  for(let i=0;i<100;i++){
    await evaluate('new Promise(r=>setTimeout(r,30))');
    if(await evaluate("document.getElementById('event-dialog').open")){await click('#event-close');continue;}
    if(await evaluate("document.getElementById('story-dialog').open")){await click('#story-skip');continue;}
    if(!await evaluate("document.getElementById('notice-dialog').open")){
      const current=await saved();
      if(!unreadNotifications(current.state,current.observedStoryEvents).length)return;
      continue;
    }
    await click('#notice-close');
  }
  assert.fail('notification queue did not drain');
}
async function runToReadyPrompt(){
  const seen=[];
  for(let i=0;i<300;i++){
    if(await evaluate("document.getElementById('release-dialog').open"))return seen;
    if(await evaluate("document.getElementById('story-dialog').open")){seen.push(await evaluate("document.getElementById('story-title').textContent"));await screenshot('story-first.png');await click('#story-skip');}
    if(await evaluate("document.getElementById('notice-dialog').open")){
      seen.push(await evaluate("document.getElementById('notice-title').textContent"));
      if(seen.length===1)await screenshot('news-popup.png');
      await click('#notice-close');
    }
    await evaluate('new Promise(r=>setTimeout(r,50))');
  }
  assert.fail('research did not lead to an automatic release prompt');
}
const panelNames = ['project','team','hiring','ranking','finance','news','feedback'];
async function openPanel(name) {
  panelWasPaused=(await saved()).state.paused;
  await click(`.office-navigation [data-panel-target="${name}"]`);
  assert(await evaluate(`document.getElementById('panel-${name}').open`));
  assert.equal(await evaluate("document.querySelectorAll('dialog[open]').length"), 1);
  assert((await saved()).state.paused);
}
async function closePanel(name) {
  await click(`#panel-${name} [data-close-panel]`);
  assert.equal(await evaluate("document.querySelectorAll('dialog[open]').length"),0);
  await until(`JSON.parse(localStorage.getItem(${JSON.stringify(SAVE_KEY)})).state.paused===${panelWasPaused}`);
  assert.equal((await saved()).state.paused,panelWasPaused,'a management interruption restores its original running or manual-pause state');
}
const visibleBounds = selector => evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {width:r.width,height:r.height,visible:r.width>0&&r.height>0&&r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1};})()`);
async function inspectViewport(width, height) {
  await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500});
  await evaluate('new Promise(r=>setTimeout(r,200))');
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight'),`main overflow ${width}x${height}`);
  for (const selector of ['#office','#time-toggle','#secretary-action','.office-navigation']) assert((await visibleBounds(selector)).visible,`clipped ${selector} ${width}x${height}`);
  assert(await evaluate(`(()=>{const a=document.getElementById('office').getBoundingClientRect(),b=document.querySelector('.office-scene').getBoundingClientRect();return Math.abs(a.left-b.left)<1&&Math.abs(a.right-b.right)<1&&Math.abs(a.top-b.top)<1&&Math.abs(a.bottom-b.bottom)<1;})()`),'office camera must fill its entire viewport');
  for (const name of panelNames) {
    const button=`.office-navigation [data-panel-target="${name}"]`;
    assert((await visibleBounds(button)).visible,`clipped navigation ${name}`);
    await openPanel(name);
    assert((await visibleBounds(`#panel-${name} [data-close-panel]`)).visible,`clipped return ${name}`);
    assert((await visibleBounds(`#panel-${name} .panel-content`)).visible,`clipped content ${name}`);
    assert(await evaluate('document.documentElement.scrollHeight<=innerHeight'),'dialogs must not extend document');
    await closePanel(name);
  }
  await screenshot(`office-${width}x${height}.png`);
  return {width,height,canvas:await visibleBounds('#office')};
}
function waitTo(state,day) {return act(act(state,{type:'resume'}),{type:'advanceTo',targetDay:day});}
function firstCodingRelease() {return develop(createState(),'coding');}
function recruitAvailable(state,ids) {
  for(const employeeId of ids) if(!state.employees.includes(employeeId)&&recruitmentStatus(state,employeeId).unlocked&&state.employees.length<state.seats&&state.cash>=EMPLOYEES[employeeId].hire)state=act(state,{type:'hire',employeeId});
  return state;
}
// Original saved states come from e41178c (v1) and 13f6f5d (v2).
const legacySlots=await Promise.all(LEGACY_SAVE_KEYS.map(async key=>({key,raw:await readFile(new URL(`../tests/fixtures/legacy-${key.endsWith('v2')?'v2':'v1'}-initial.json`,import.meta.url),'utf8')})));
const legacyUnchanged=async()=>{for(const {key,raw}of legacySlots)assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(key)})`),raw);};
let instrumentation;
try {
  await command('Page.enable'); await command('Runtime.enable');
  instrumentation = await command('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const realNow = performance.now.bind(performance), realFrame = requestAnimationFrame.bind(window), origin = realNow();
    const fastNow = () => origin + (realNow() - origin) * 16;
    Object.defineProperty(performance,'now',{value:fastNow});
    window.requestAnimationFrame = callback => realFrame(() => callback(fastNow()));
    const NativeAudio = window.Audio;
    window.__prototypeProbe = { plays: [], audio: [] };
    window.Audio = function(source) { const audio=new NativeAudio(source), play=audio.play.bind(audio); window.__prototypeProbe.audio.push(audio); audio.play=()=>{window.__prototypeProbe.plays.push(audio.src); return play();}; return audio; };
    window.Audio.prototype = NativeAudio.prototype;
  })()` });
  await command('Emulation.setDeviceMetricsOverride', { width:1440,height:900,deviceScaleFactor:1,mobile:false });
  await command('Emulation.setEmulatedMedia', { features:[{name:'prefers-reduced-motion',value:'no-preference'}] });
  await onNextDocument(`localStorage.clear();${legacySlots.map(({key,raw})=>`localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(raw)});`).join('')}`);
  assert(await evaluate("!document.getElementById('welcome').hidden && !document.getElementById('legacy-save-notice').hidden"));
  const downloadDirectory=await mkdtemp('/tmp/ai-dev-story-legacy-export-');
  await command('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloadDirectory});
  for(const {key,raw}of legacySlots){
    await choose('#legacy-save-slot',key);await click('#export-legacy-save');let exported;
    for(let attempt=0;attempt<50;attempt++){try{exported=await readFile(downloadDirectory+'/'+key+'.json','utf8');break;}catch{await new Promise(resolve=>setTimeout(resolve,50));}}
    assert.equal(exported,raw,'real browser download preserves original legacy bytes');
  }
  await legacyUnchanged();
  await until("document.getElementById('brand-logo').complete && document.getElementById('brand-logo').naturalWidth>0");
  assert(await evaluate("document.getElementById('brand-logo').src.endsWith('logo-v2.png')"));
  const alpha=await evaluate(`(()=>{const img=document.getElementById('brand-logo'),canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);return ctx.getImageData(0,0,1,1).data[3];})()`);
  assert.equal(alpha,0);assert.equal(await evaluate('window.__prototypeProbe.plays.length'),0,'initial page silent');
  await screenshot('welcome.png');
  await fill('#company-name','下一版科技');await submit('#company-form');
  await until("!document.getElementById('game').hidden");
  assert.equal(await evaluate("document.getElementById('rating-value').textContent"),'暂无评价','a company without a published product has no user rating');
  await until("!document.getElementById('office-tour').hidden");
  assert(await evaluate("!document.getElementById('guide-dialog').open && !document.getElementById('panel-project').open"),'introduce the UI before the project form');
  const untaughtState=(await saved()).state;
  assert.equal((await saved()).schemaVersion,SCHEMA_VERSION);await legacyUnchanged();
  const tourSteps=['office','dashboard','time','production','business'];
  const tourViewports=[];
  for(const [width,height]of [[1440,900],[1280,720],[390,844],[360,640]]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<500});
    await evaluate('new Promise(r=>setTimeout(r,100))');
    while(await evaluate("document.getElementById('office-tour').dataset.tourStep!=='office'"))await pointerClick('#tour-back');
    for(const [index,step]of tourSteps.entries()) {
      assert.equal(await evaluate("document.getElementById('office-tour').dataset.tourStep"),step);
      assert(await evaluate('document.documentElement.scrollHeight<=innerHeight && document.documentElement.scrollWidth<=innerWidth'),'tour must fit the viewport');
      for(const selector of ['#office-tour','#tour-next','#tour-skip','.tour-highlight'])assert((await visibleBounds(selector)).visible,`tour ${step} ${selector} clipped at ${width}x${height}`);
      assert.deepEqual((await saved()).state,untaughtState,'tour does not advance business');
      if(width===1440&&step==='office')await screenshot('tour-office.png');
      if(width===1440&&step==='dashboard')await screenshot('tour-dashboard.png');
      if(width===360&&step==='business')await screenshot('tour-mobile.png');
      if(index<tourSteps.length-1)await pointerClick('#tour-next');
    }
    tourViewports.push({width,height,steps:tourSteps.length});
  }
  await reload();assert.equal(await evaluate("document.getElementById('office-tour').dataset.tourStep"),'business','unfinished tour resumes at saved step');
  assert.deepEqual((await saved()).state,untaughtState);
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await pointerClick('#tour-next');await until("document.getElementById('guide-dialog').open");
  assert(await evaluate("document.getElementById('office-tour').hidden"));
  assert.equal(await evaluate("document.getElementById('game').dataset.guideStep"),'project');
  await screenshot('secretary.png');
  // A reload is intentionally silent; enable real media through a user action.
  await click('#guide-close');await click('#settings-open');await click('#audio-toggle');await click('#settings-close');
  await until("window.__prototypeProbe.audio.some(a=>a.loop&&!a.paused&&a.readyState>=2)");
  await click('#guide-help');
  await click('#guide-close');await openPanel('hiring');
  assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('#hiring-list button'),b=>b.dataset.testid)"),['hire-morgan','hire-casey']);
  await closePanel('hiring');await click('#guide-help');await click('#guide-primary');
  assert(await evaluate("document.getElementById('panel-project').open"));
  assert.deepEqual(await evaluate("Array.from(document.getElementById('focus').options,o=>o.value)"),DIRECTIONS);
  assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('#project-planner input[type=radio]'),o=>o.value)"),['avery','jules']);
  assert(await evaluate("document.querySelector('#project-planner [data-employee=avery] [data-direction=coding] strong').textContent==='6' && document.querySelector('#project-planner [data-employee=jules] [data-direction=office] strong').textContent==='6'"));
  await evaluate("document.querySelector('#project-planner input[value=avery]').focus()");
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  assert(await evaluate("document.activeElement.value==='jules' && document.querySelector('#project-planner input:checked').value==='jules'"),'native keyboard selection preserves focus');
  await pointerClick('#project-planner [data-employee=jules]');await choose('#focus','office');
  assert(await evaluate("document.querySelector('#project-planner input:checked').value==='jules' && document.querySelectorAll('#project-planner .planner-stat.is-focus[data-direction=office]').length===2"));
  await screenshot('planner-cards.png');
  assert(await evaluate("document.getElementById('training-budget').textContent.includes('8 万')"));await screenshot('training-budget.png');
  await fill('#model-name','Next 1');await choose('#focus','coding');await pointerClick('#project-planner [data-employee=avery]');await submit('#project-form');
  await until("!document.getElementById('planning-scene').hidden");
  await click('#planning-time-toggle');
  assert((await saved()).state.paused);assert.equal((await saved()).state.project.status,'planning');assert.equal((await saved()).state.cash,100-trainingCost(createState()));
  assert.equal(await evaluate("document.querySelectorAll('[data-testid^=task-]').length"),0,'no manual staff assignment');
  await screenshot('planning.png');
  await command('Emulation.setDeviceMetricsOverride',{width:360,height:640,deviceScaleFactor:1,mobile:true});
  assert((await visibleBounds('#planning-close')).visible);await screenshot('planning-mobile.png');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await choose('#planning-speed','4');await click('#planning-time-toggle');
  await until("!document.getElementById('planning-result').hidden");
  assert.deepEqual((await saved()).state.project.planScores,[37,27,26]);await screenshot('planning-result.png');
  await click('#planning-close');
  const newsSeen=await runToReadyPrompt();assert(newsSeen.length>=2,'industry news must interrupt actual development');
  let snapshot=await saved();assert.equal(snapshot.state.gameDay,12);assert(snapshot.state.paused);
  const expectedFirst=develop(createState(),'coding');assert.deepEqual(snapshot.state.project.scores,expectedFirst.models.findLast(m=>m.company==='player').scores);
  assert.equal(await evaluate("!!document.getElementById('presenter')"),false,'publication has no presenter picker');
  assert.deepEqual(snapshot.state.notices.filter(n=>n.type==='stage-complete').map(n=>n.stageId),['data','pretraining','posttraining','evaluation']);
  assert(snapshot.state.notices.filter(n=>n.type==='research').every(n=>n.employeeIds.includes('avery')&&n.employeeIds.includes('jules')));
  assert.equal(snapshot.state.models.filter(m=>m.company==='player').length,0);
  assert.equal(await evaluate("document.getElementById('game').dataset.guideStep"),'release');
  assert(await evaluate("document.getElementById('publish-cost').textContent.includes('发布费 8 万')"));await choose('#media','新智猿');assert(await evaluate("document.getElementById('publish-cost').textContent.includes('报道费 14 万') && document.getElementById('media-benefit').textContent.includes('共 20 万')"));await screenshot('media-budget.png');await choose('#media','');
  await screenshot('release-prompt.png');await click('#cancel-release');await drainNotices();
  await until(`JSON.parse(localStorage.getItem(${JSON.stringify(SAVE_KEY)})).state.paused===false`);
  await click('#time-toggle');await screenshot('office.png');await click('#secretary-action');
  assert(await evaluate("document.getElementById('release-dialog').open"));await submit('#release-form');
  await until("!document.getElementById('release-scene').hidden");
  const published=(await saved()).state;
  assert.equal(await evaluate("document.getElementById('rating-value').textContent"),'2.1 / 5','first publication enables the customer rating');
  assert.equal(published.models.filter(m=>m.company==='player').length,1);assert.equal(published.cash,expectedFirst.cash);
  assert.equal(published.pendingBonus,6);assert.deepEqual(published.funding,[],'first startup release does not receive funding');
  assert.equal(await evaluate("document.getElementById('release-scoreboard').children.length"),3);
  assert(await evaluate("document.getElementById('game').inert && getComputedStyle(document.getElementById('release-scene')).position==='fixed'"));
  await until("window.__prototypeProbe.plays.some(url=>url.endsWith('release-jingle.wav'))");await screenshot('release.png');
  await click('#skip-release');
  await until("Number(getComputedStyle(document.getElementById('release-report')).opacity)>.99 && Number(getComputedStyle(document.getElementById('release-scoreboard')).opacity)>.99");
  await screenshot('report.png');await click('#release-continue');assert.deepEqual(economy((await saved()).state),economy(published));
  assert(await evaluate("!document.getElementById('event-dialog').open"),'the first release has no financing celebration');
  await until("document.getElementById('notice-dialog').open && document.getElementById('notice-dialog').dataset.kind==='feedback'");
  assert(await evaluate("document.getElementById('feedback-metrics').textContent.includes('活跃用户') && document.getElementById('feedback-metrics').textContent.includes('→')"));
  await screenshot('feedback-popup.png');await click('#notice-next-version');await drainNotices();
  // The release was explicitly opened while manually paused, so it stays paused.
  assert((await saved()).state.paused);
  await openPanel('feedback');
  assert(await evaluate(`document.getElementById('feedback-list').textContent.includes(${JSON.stringify(userFeedback(published.models.findLast(model=>model.company==='player')).copy)})`),'feedback archive matches the model-specific popup');
  await closePanel('feedback');
  await openPanel('finance');await closePanel('finance');
  assert.equal(await evaluate("document.getElementById('game').dataset.guideStep"),'next-project');
  await openPanel('ranking');
  assert.equal(await evaluate("document.getElementById('board-direction').options.length"),4);
  const modelButtons=await evaluate("Array.from(document.querySelectorAll('.model-info-button'),button=>({id:button.dataset.modelId,name:button.querySelector('span').textContent}))");
  assert.equal(modelButtons.length,6);
  const descriptions=[];
  for(const item of modelButtons) {
    await pointerAt(`.model-info-button[data-model-id="${item.id}"]`);
    await until("document.getElementById('model-tooltip').getBoundingClientRect().width>0");
    assert((await visibleBounds('#model-tooltip')).visible,'model hover info fits viewport');
    assert.equal(await evaluate("document.getElementById('model-tooltip-title').textContent"),item.name);
    descriptions.push(await evaluate("document.getElementById('model-tooltip-description').textContent"));
  }
  assert.equal(new Set(descriptions).size,6,'each visible model has its own introduction');
  await screenshot('model-info.png');
  await pressEscape();assert(await evaluate("document.getElementById('panel-ranking').open"),'Escape dismisses model info before closing ranking');
  await evaluate("document.querySelector('.model-info-button').focus()");
  await until("document.getElementById('model-tooltip').getBoundingClientRect().width>0");
  await closePanel('ranking');
  assert.equal(await evaluate("document.getElementById('model-tooltip').getBoundingClientRect().width"),0,'closing ranking hides model info');
  await command('Emulation.setDeviceMetricsOverride',{width:360,height:640,deviceScaleFactor:1,mobile:true});
  await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  await openPanel('ranking');
  const touch=await evaluate("(()=>{const n=document.querySelector('.model-info-button');n.scrollIntoView({block:'nearest'});const r=n.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};})()");
  await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...touch,radiusX:2,radiusY:2}]});
  await command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await until("document.getElementById('model-tooltip').getBoundingClientRect().width>0");
  assert((await visibleBounds('#model-tooltip')).visible,'touch model info fits small viewport');
  await screenshot('model-info-mobile.png');await closePanel('ranking');
  await command('Emulation.setTouchEmulationEnabled',{enabled:false});
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await openPanel('ranking');
  await evaluate("document.getElementById('model-history').parentElement.open=true");
  await click('#model-history button');await click('#release-continue');assert.deepEqual(economy((await saved()).state),economy(published));
  assert(await evaluate("!document.getElementById('event-dialog').open"),'milestone is not replayed');
  await reload();assert.deepEqual(economy((await saved()).state),economy(published));assert.equal(await evaluate('window.__prototypeProbe.plays.length'),0,'restore silent');
  // Existing version-two settings without tour fields restore without a compulsory tour.
  await onNextDocument("{const s=JSON.parse(localStorage.getItem('ai-dev-story-settings-v1'));delete s.tourStep;delete s.tourCompleted;localStorage.setItem('ai-dev-story-settings-v1',JSON.stringify(s));}");
  assert(await evaluate("document.getElementById('office-tour').hidden && !document.getElementById('guide-dialog').open"));
  assert.deepEqual(economy((await saved()).state),economy(published));
  await pointerClick('#tour-replay');assert.equal(await evaluate("document.getElementById('office-tour').dataset.tourStep"),'office');
  await pointerClick('#tour-skip');assert(await evaluate("document.getElementById('office-tour').hidden"));
  assert.deepEqual(economy((await saved()).state),economy(published));
  await openPanel('hiring');
  assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('#hiring-list button'),b=>b.dataset.testid)"),['hire-morgan','hire-casey','hire-alex','hire-max']);
  await closePanel('hiring');
  const viewports=[];
  for(const [w,h]of [[1440,900],[1280,720],[390,844],[360,640]])viewports.push(await inspectViewport(w,h));
  await screenshot('mobile.png');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  // The active project strip and actual working staff must also fit the main screen.
  const activeProject=waitTo(act(createState(),{type:'createProject',name:'自动研发中的模型',focus:'office',plannerId:'jules'}),3);
  await loadFixture(activeProject);await choose('#speed','1');await click('#time-toggle');
  assert.equal(await evaluate("document.getElementById('office').dataset.workingEmployees"),'avery,jules');
  await until("Number(document.getElementById('office').dataset.pointAnimations)>0");
  assert((await saved()).state.project.scores.some((score,index)=>score>activeProject.project.scores[index]),'floating points correspond to actual research gains');
  await screenshot('development.png');await screenshot('research-points.png');await click('#time-toggle');
  assert.equal(await evaluate("document.getElementById('office').dataset.workingEmployees"),'');
  await openPanel('project');
  assert(await evaluate("document.getElementById('research-team-summary').textContent.includes('研发团队 2 人') && document.getElementById('research-team-summary').textContent.includes('编程 8')"));
  await closePanel('project');await openPanel('hiring');await click('[data-testid="hire-casey"]');await closePanel('hiring');await openPanel('project');
  assert(await evaluate("document.getElementById('research-team-summary').textContent.includes('研发团队 3 人') && document.getElementById('research-team-summary').textContent.includes('编程 10') && document.getElementById('research-team-summary').textContent.includes('多模态 9')"));
  await screenshot('research-team.png');await closePanel('project');
  for(const [w,h]of [[1440,900],[1280,720],[390,844],[360,640]])await inspectViewport(w,h);
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  // Later candidates appear on their actual day, regardless of financing.
  for(const [day,ids,unlocked]of [[20,['rebo','tim'],false],[21,['rebo','tim'],true],[41,['karpathy','boris'],false],[42,['karpathy','boris'],true]]) {
    await loadFixture(waitTo(published,day));await openPanel('hiring');
    for(const id of ids)assert.equal(await evaluate(`!!document.querySelector('[data-testid="hire-${id}"]')`),unlocked,`${id} day ${day}`);
    if(day===42)await screenshot('hiring.png');await closePanel('hiring');
  }
  await loadFixture(waitTo(published,42));
  await openPanel('finance');await click('#buy-compute');await click('#expand-office');await closePanel('finance');
  assert.equal(await evaluate("document.getElementById('office').dataset.officeTier"),'headquarters');await screenshot('office-relocation.png');
  await openPanel('hiring');await click('[data-testid="hire-rebo"]');await click('[data-testid="hire-max"]');await closePanel('hiring');
  snapshot=await saved();assert.equal(snapshot.state.compute,3);assert.equal(snapshot.state.seats,8);assert.equal(snapshot.state.employees.length,4);
  const beforeReset=(await saved()).state;
  await openPanel('team');
  assert(await evaluate("!document.getElementById('team-reset-quota').disabled && document.querySelector('[data-ability=max]').textContent.includes('自动特性') && !document.querySelector('[data-ability=max] button')"));
  await pointerAt('#team-reset-quota');await screenshot('rebo-team-ability.png');
  await command('Emulation.setDeviceMetricsOverride',{width:360,height:640,deviceScaleFactor:1,mobile:true});await pointerAt('#team-reset-quota');assert((await visibleBounds('#team-reset-quota')).visible);await screenshot('rebo-team-mobile.png');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await pointerClick('#team-reset-quota');
  assert.equal((await saved()).state.cash,beforeReset.cash-4);assert(await evaluate("document.getElementById('team-reset-quota').disabled && document.getElementById('team-reset-status').textContent.includes('第 43 日')"));
  await closePanel('team');await openPanel('feedback');
  assert(await evaluate("document.getElementById('reset-quota').disabled && document.getElementById('reset-quota').textContent.includes('重置中')"));await click('#reset-quota');assert.equal((await saved()).state.cash,beforeReset.cash-4);await screenshot('rebo-feedback-status.png');
  await closePanel('feedback');await click('#time-toggle');
  await until("document.getElementById('notice-dialog').open && document.getElementById('notice-dialog').dataset.kind==='ability'");
  assert(await evaluate("document.getElementById('notice-copy').textContent.includes('2.6 / 5')"));await screenshot('rebo-complete.png');
  await reload();await until("document.getElementById('notice-dialog').open && document.getElementById('notice-dialog').dataset.kind==='ability'");
  assert.equal((await saved()).state.ratingTenths,26);await click('#notice-close');await drainNotices();if(!(await saved()).state.paused)await click('#time-toggle');
  assert.equal((await saved()).state.ratingTenths,26);
  await openPanel('team');await click('[data-testid="dismiss-max"]');await click('#confirm-cancel');
  assert((await saved()).state.employees.includes('max'));
  const cashBeforeDismiss=(await saved()).state.cash;
  await openPanel('team');await click('[data-testid="dismiss-max"]');await click('#confirm-accept');
  assert.equal((await saved()).state.cash,cashBeforeDismiss-employeeTerms((await saved()).state,'max').salary*2);assert(!(await saved()).state.employees.includes('max'));
  await until("document.getElementById('notice-dialog').open && document.getElementById('notice-dialog').dataset.kind==='farewell'");
  assert(await evaluate("document.getElementById('notice-title').textContent.includes('Max Score') && document.getElementById('notice-copy').textContent.includes('10 万')"));await screenshot('farewell-popup.png');await click('#notice-close');await drainNotices();
  await openPanel('project');const unsafeName='<img src=x onerror=alert(1)>';
  await fill('#model-name',unsafeName);await submit('#project-form');await click('#planning-time-toggle');await click('#planning-close');await openPanel('project');
  assert.equal(await evaluate("document.getElementById('project-name').textContent"),unsafeName);
  assert.equal(await evaluate("document.getElementById('project-name').children.length"),0);await closePanel('project');
  await loadFixture(createState());await openPanel('feedback');assert(await evaluate("document.getElementById('reset-quota').disabled && document.getElementById('reset-quota-status').textContent.includes('需要先招聘 Rebo')"));await closePanel('feedback');
  await click('#settings-open');await click('#audio-toggle');await click('#settings-close');
  await click('#time-toggle');
  await evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))");
  const hiddenState=(await saved()).state;await evaluate('new Promise(r=>setTimeout(r,200))');
  assert((await saved()).state.paused);assert.equal((await saved()).state.gameDay,hiddenState.gameDay);
  assert(await evaluate('window.__prototypeProbe.audio.every(a=>a.paused)'));
  await evaluate("delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))");await until(`JSON.parse(localStorage.getItem(${JSON.stringify(SAVE_KEY)})).state.paused===false`);await click('#time-toggle');
  // A deliberate pause survives both a management window and a visibility change.
  await openPanel('finance');await closePanel('finance');assert((await saved()).state.paused);
  await evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))");assert((await saved()).state.paused);
  await click('#time-toggle');await openPanel('finance');await closePanel('finance');assert.equal((await saved()).state.paused,false);await click('#time-toggle');
  const conflict=act((await saved()).state,{type:'buyCompute',amount:1}),conflictRaw=fixture(conflict);
  await evaluate(`localStorage.setItem(${JSON.stringify(SAVE_KEY)},${JSON.stringify(conflictRaw)});window.dispatchEvent(new StorageEvent('storage',{key:${JSON.stringify(SAVE_KEY)},newValue:${JSON.stringify(conflictRaw)}}))`);
  assert(await evaluate("!document.getElementById('save-alert').hidden && document.getElementById('time-toggle').disabled"));
  await openPanel('finance');await click('#buy-compute');assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(SAVE_KEY)})`),conflictRaw);await closePanel('finance');
  await click('#discard-save');await click('#confirm-accept');assert.equal((await saved()).state.cash,100);await legacyUnchanged();
  assert(await evaluate("!document.getElementById('office-tour').hidden"));
  await pointerClick('#tour-skip');await click('#guide-help');
  await click('#guide-skip');assert.equal((await saved()).state.models.filter(m=>m.company==='player').length,0);
  await reload();assert(await evaluate("!document.getElementById('guide-dialog').open"));
  assert(await evaluate("JSON.parse(localStorage.getItem('ai-dev-story-settings-v1')).guideSkipped"));
  await click('#guide-help');assert.equal(await evaluate("document.getElementById('guide-dialog').dataset.guideStep"),'project');await click('#guide-close');
  await openPanel('finance');
  await evaluate(`window.__setItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===${JSON.stringify(SAVE_KEY)})throw new DOMException('full','QuotaExceededError');return window.__setItem.call(this,key,value);}`);
  await click('#buy-compute');
  assert(await evaluate("document.getElementById('save-status').textContent.includes('保存失败') && document.getElementById('compute-value').textContent.includes('/ 3')"));
  await evaluate('Storage.prototype.setItem=window.__setItem');await click('#buy-compute');assert.equal((await saved()).state.compute,4);await closePanel('finance');
  await onNextDocument(`localStorage.setItem(${JSON.stringify(SAVE_KEY)},'{broken')`);
  assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(SAVE_KEY)})`),'{broken');
  assert(await evaluate("document.getElementById('start-game').disabled && !document.getElementById('save-alert').hidden"));
  await click('#discard-save');await click('#confirm-cancel');assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(SAVE_KEY)})`),'{broken');
  await click('#discard-save');await click('#confirm-accept');assert.equal((await saved()).state.cash,100);
  assert(await evaluate("!document.getElementById('office-tour').hidden"));await pointerClick('#tour-skip');
  const undeliveredRaw=fixture(published);
  await evaluate(`localStorage.setItem(${JSON.stringify(SAVE_KEY)},${JSON.stringify(undeliveredRaw)});window.dispatchEvent(new Event('pagehide'))`);
  assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(SAVE_KEY)})`),undeliveredRaw);
  const routes=budgetExamples(),champion=routes.champion.state,capital=routes.capital.state,ordinary=routes.ordinary.state,failed=waitTo(createState(),RULES.lastDay);
  let beforeTop=replayActions([]);
  for(const action of champion.acceptedActions){const next=act(beforeTop,action);if(action.type==='publish'&&rank(next)===1)break;beforeTop=next;}
  assert.equal(beforeTop.project.status,'ready');await loadFixture(beforeTop);await openPanel('project');await click('#open-release');await choose('#media','新智猿');await submit('#release-form');
  await until("!document.getElementById('release-scene').hidden");await click('#skip-release');await click('#release-continue');
  assert.equal(await evaluate("document.getElementById('event-title').textContent"),'综合榜第一，融资到账');await screenshot('champion-event.png');await click('#event-close');
  await until("document.getElementById('notice-dialog').open && document.getElementById('notice-dialog').dataset.kind==='media'");
  assert(await evaluate("document.getElementById('notice-copy').textContent.includes('新智猿') && !/(付费用户|账单|推广|有效期|不叠加|每期)/.test(document.getElementById('notice-copy').textContent)"));await screenshot('media-popup.png');await click('#notice-close');await drainNotices();
  assert.equal(mediaCampaign((await saved()).state).income,10);await openPanel('finance');assert(await evaluate("document.getElementById('bill-preview').textContent.includes('媒体带来的订阅') && document.getElementById('bill-preview').textContent.includes('10 万 / 期')"));await screenshot('media-income.png');await closePanel('finance');

  // Paid coverage escalates independently for each outlet and survives reload.
  for(const outlet of ['机器之薪','量子味','新智猿']){
    let company=replayActions([]),edition=0;
    for(const original of champion.acceptedActions){
      const action=original.type==='publish'&&original.media?{...original,media:outlet}:original;
      company=act(company,action);
      if(action.type!=='publish'||!action.media||![1,7].includes(++edition))continue;
      const model=company.models.findLast(item=>item.company==='player'),raw=JSON.parse(fixture(company));
      raw.observedStoryEvents=raw.observedStoryEvents.filter(id=>id!==`media:${model.id}`);
      await onNextDocument(`localStorage.setItem(${JSON.stringify(SAVE_KEY)},${JSON.stringify(JSON.stringify(raw))})`);
      await until("document.getElementById('notice-dialog').open && document.getElementById('notice-dialog').dataset.kind==='media'");
      const title=await evaluate("document.getElementById('notice-title').textContent"),copy=await evaluate("document.getElementById('notice-copy').textContent");
      assert(!/付费用户|账单|推广|有效期|不叠加|每期|编辑|稿费/.test(copy));
      if(edition===7)assert(title.includes('平行宇宙'),'later coverage goes beyond the sixth tier');
      await reload();await until("document.getElementById('notice-dialog').open");
      assert.equal(await evaluate("document.getElementById('notice-title').textContent"),title);assert.equal(await evaluate("document.getElementById('notice-copy').textContent"),copy);
      assert.deepEqual(economy((await saved()).state),economy({...company,subscriptionGrowthEnabled:true}),'adopting the future subscription policy leaves media history and past economics unchanged');
      if(outlet==='新智猿'&&edition===7)await command('Emulation.setDeviceMetricsOverride',{width:360,height:640,deviceScaleFactor:1,mobile:true});
      await pointerAt('#notice-close');assert((await visibleBounds('#notice-close')).visible);
      await screenshot(`media-${['机器之薪','量子味','新智猿'].indexOf(outlet)}-${edition}.png`);
      await click('#notice-close');await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
      if(edition===7)break;
    }
    assert.equal(edition,7);
  }

  // Historical budget companies keep their already-agreed first-release funding.
  const initialReady=advance(act(createState({profile:'budget112'}),{type:'createProject',name:'未读融资检查',focus:'coding',plannerId:'avery'}));
  await loadFixture(initialReady);await click('#settings-open');await click('#audio-toggle');await click('#settings-close');
  await openPanel('project');await click('#open-release');await submit('#release-form');await click('#skip-release');
  await until("window.__prototypeProbe.plays.some(url=>url.endsWith('event-funding.wav'))");
  const beforeReload=(await saved()).state;
  assert(!(await saved()).observedStoryEvents.includes('milestone-first-funding'),'opening the release does not acknowledge an unseen event card');
  await reload();assert.deepEqual(economy((await saved()).state),economy(beforeReload));
  await until("document.getElementById('event-dialog').open");await click('#event-close');await drainNotices();
  assert((await saved()).observedStoryEvents.includes('milestone-first-funding'));
  await reload();assert(await evaluate("!document.getElementById('event-dialog').open"),'acknowledged event stays dismissed');

  // Reproduce the user's four ordinary staff, office-focused opening through the UI.
  let startup=createState();for(const employeeId of ['morgan','casey'])startup=act(startup,{type:'hire',employeeId});
  for(let release=1;release<=3;release++){
    startup=advance(act(startup,{type:'createProject',name:`Startup ${release}`,focus:'office',plannerId:'jules'}));
    await loadFixture(startup);await openPanel('project');await click('#open-release');await submit('#release-form');
    const actual=(await saved()).state,expected=act(startup,{type:'publish'});
    assert.deepEqual(economy(actual),economy(expected));
    assert.equal(rank(actual),release===1?5:4);
    assert.deepEqual(actual.funding,[[],['seed'],['seed','specialist']][release-1]);
    assert.equal(actual.cash,[42,73,155][release-1]);
    await click('#skip-release');await until("Number(getComputedStyle(document.getElementById('release-report')).opacity)>.99");
    await screenshot(`startup-release-${release}.png`,true);await click('#release-continue');
    if(release===1)assert(await evaluate("!document.getElementById('event-dialog').open"));
    await drainNotices();await openPanel('finance');
    assert(await evaluate("document.getElementById('funding-records').textContent.includes('至少 2 款') && document.getElementById('funding-records').textContent.includes('180 分') && document.getElementById('funding-records').textContent.includes('至少 4 款')"));
    if(release===1)await screenshot('startup-funding-goals.png');
    await closePanel('finance');startup=actual;
  }

  for(const endingState of [champion,capital,ordinary,failed]) {
    await loadFixture(endingState);assert.equal(await evaluate("document.getElementById('ending-title').textContent"),endingState.ending);
    assert(await evaluate("!document.getElementById('ending-scene').hidden"));if(endingState===champion)await screenshot('ending.png');
    if(endingState===failed)assert(await evaluate("document.getElementById('ending-stats').textContent.includes('暂无评价') && !document.getElementById('ending-stats').textContent.includes('2.1 / 5')"));
    await click('#ending-office');assert(await evaluate("document.getElementById('time-toggle').disabled"));
    if(endingState===champion)await screenshot('office-expanded.png');
    await click('#view-ending');assert(await evaluate("!document.getElementById('ending-scene').hidden"));
  }
  const newsCompany=waitTo(createState(),7),unread=unreadNotifications(newsCompany).filter(n=>n.kind==='news');
  const newsRaw=JSON.parse(fixture(newsCompany));newsRaw.observedStoryEvents=[];
  await onNextDocument(`localStorage.setItem(${JSON.stringify(SAVE_KEY)},${JSON.stringify(JSON.stringify(newsRaw))});`);
  await until("document.getElementById('notice-dialog').open");
  assert.equal(await evaluate("document.getElementById('notice-title').textContent"),unread[0].title);
  await click('#notice-close');await until(`document.getElementById('notice-dialog').open && document.getElementById('notice-title').textContent===${JSON.stringify(unread[1].title)}`);
  assert((await saved()).observedStoryEvents.includes(unread[0].id));assert(!(await saved()).observedStoryEvents.includes(unread[1].id),'displaying the next item must not acknowledge it');
  await reload();await until("document.getElementById('notice-dialog').open");
  assert.equal(await evaluate("document.getElementById('notice-title').textContent"),unread[1].title,'refresh restores the still unread notification');await drainNotices();

  for(const [version,filename]of [[3,'legacy-v3-active.json'],[4,'legacy-v4-active.json']]){
    const raw=await readFile(new URL('../tests/fixtures/'+filename,import.meta.url),'utf8'),previous=JSON.parse(raw),key=`ai-dev-story-save-v${version}`;
    await onNextDocument(`localStorage.removeItem(${JSON.stringify(SAVE_KEY)});${MIGRATION_SAVE_KEYS.map(key=>`localStorage.removeItem(${JSON.stringify(key)});`).join('')}localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(raw)});`);
    const migrated=(await saved()).state;assert.equal(migrated.campaignProfile,'classic168');
    for(const field of ['cash','gameDay','project','models','bills','knowledge'])assert.deepEqual(migrated[field],previous.state[field]);
    assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(key)})`),raw);
  }
  const adoptionState=waitTo(firstCodingRelease(),29),adoptionRaw=JSON.parse(fixture(adoptionState));
  assert(adoptionRaw.observedStoryEvents.includes('headlines'));
  await onNextDocument(`localStorage.setItem(${JSON.stringify(SAVE_KEY)},${JSON.stringify(JSON.stringify(adoptionRaw))});`);
  assert((await saved()).observedStoryEvents.includes('story-start:30'));
  assert(await evaluate("!document.getElementById('story-dialog').open"),'same-day old news must not become a new interruption');
  // Each selected vignette is exercised through the real dialog; choices are
  // presentation state and must never settle money, scores or staff twice.
  const storyBase=firstCodingRelease();let headlineChoice=null;
  for(const definition of STORY_SCENES){
    const day=storyScene(createState(),definition.id).day;
    const storyState=day<storyBase.gameDay?waitTo(createState(),day):waitTo(storyBase,day);
    const progress=[storyStartMarker(0),...(headlineChoice?[headlineChoice]:[])];
    const story=storyScene(storyState,definition.id,progress),raw=JSON.parse(fixture(storyState));
    raw.observedStoryEvents=[...new Set([...raw.observedStoryEvents,...unreadNotifications(storyState,progress).map(item=>item.id),...progress])].filter(id=>id!==definition.id);
    await onNextDocument(`localStorage.setItem(${JSON.stringify(SAVE_KEY)},${JSON.stringify(JSON.stringify(raw))});`);
    await until(`document.getElementById('story-dialog').open && document.getElementById('story-dialog').dataset.sceneId===${JSON.stringify(story.id)}`);
    const economicBefore=economy((await saved()).state);
    if(story.mode==='dialogue'){
      for(let index=1;index<story.lines.length;index++)await click('#story-next');
      await screenshot('story-dialogue.png');
    }else if(story.mode==='reveal'){
      for(let index=1;index<story.cards.length;index++)await click('#story-next');
      if(day===16){
        assert(await evaluate("document.getElementById('story-copy').textContent.includes('Gloglo 仍有上千名员工') && document.getElementById('story-facts').textContent.includes('你公司的在岗员工')"));
        await screenshot('gloglo-departure-copy.png');
      }
      if(day===40||day===52)await screenshot(`story-reveal-${day}.png`);
    }else{
      const choice=story.choices.find(item=>item.id==='again')||story.choices[0];
      await click(`[data-story-choice="${choice.id}"]`);
      const marker=`story-pick:${story.id}:${choice.id}`;
      assert((await saved()).observedStoryEvents.includes(marker));
      if(story.id==='story-headlines'){
        headlineChoice=marker;
        assert(!(await saved()).observedStoryEvents.includes(story.id),'chosen reply remains unread until closed');
        await reload();await until("document.getElementById('story-dialog').open");
        assert(await evaluate(`document.getElementById('story-copy').textContent===${JSON.stringify(choice.reply)}`));
        await screenshot('story-headline-choice.png');
      }
      if(day===85){
        await command('Emulation.setDeviceMetricsOverride',{width:360,height:640,deviceScaleFactor:1,mobile:true});
        await pointerAt('#story-next');assert((await visibleBounds('#story-next')).visible);await screenshot('story-mobile.png');
        await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
      }
    }
    if(day===107){assert(await evaluate("document.getElementById('story-dialog').textContent.includes('又')"),'last scene recalls headline choice');await screenshot('story-final-callback.png');}
    assert.deepEqual(economy((await saved()).state),economicBefore,'reading story preserves economic facts');
    if(day===107&&story.cta){await click('#story-cta');await until(`document.getElementById('panel-${story.cta.panel}').open`);assert.deepEqual(economy((await saved()).state),economicBefore);await closePanel(story.cta.panel);}
    else await click('#story-next');
    await until(`JSON.parse(localStorage.getItem(${JSON.stringify(SAVE_KEY)})).observedStoryEvents.includes(${JSON.stringify(story.id)})`);
    assert.deepEqual(economy((await saved()).state),economicBefore,'closing story preserves economic facts');
    if(story.id==='story-headlines'){
      await openPanel('news');await click(`[data-story-id="${story.id}"]`);await until("document.getElementById('story-dialog').open");
      assert(await evaluate("document.getElementById('story-tag').textContent.includes('回看')"));await click('#story-skip');
      await until("!document.getElementById('story-dialog').open");assert.deepEqual(economy((await saved()).state),economicBefore);
    }
  }

  const compactRaw=await readFile(new URL('../tests/fixtures/legacy-v5-compact.json',import.meta.url),'utf8'),compactPrevious=JSON.parse(compactRaw);
  await onNextDocument(`localStorage.setItem(${JSON.stringify(SAVE_KEY)},${JSON.stringify(compactRaw)});`);
  assert.deepEqual((await saved()).state,compactPrevious.state);await drainNotices();await openPanel('finance');assert(await evaluate("document.getElementById('compute-price').textContent.includes('12 万')"));await closePanel('finance');
  // Adoption preserves past finances; only following bills use the new rates.
  for(const source of [budgetExamples().champion.state,startupExamples().champion.state]){
    let previous=replayActions([]);
    for(const action of source.acceptedActions){previous=act(previous,action);if(previous.funding.includes('overall'))break;}
    previous=waitTo(previous,60);await loadFixture(previous);
    const adopted=(await saved()).state;
    assert.equal(adopted.subscriptionGrowthEnabled,true);
    assert.deepEqual(economy(adopted),economy({...previous,subscriptionGrowthEnabled:true}));
    assert.equal(adopted.acceptedActions.filter(action=>action.type==='enableSubscriptionGrowth').length,1);
    await reload();assert.equal((await saved()).state.acceptedActions.filter(action=>action.type==='enableSubscriptionGrowth').length,1);
    await openPanel('finance');assert(await evaluate("document.getElementById('subscription-status').textContent.includes('档位已提高')"));await closePanel('finance');
  }
  const fundedRoutes=subscriptionExamples();let beforeBill=replayActions([]);
  for(const action of fundedRoutes.mixed.state.acceptedActions){beforeBill=act(beforeBill,action);if(beforeBill.gameDay===104)break;}
  await loadFixture(beforeBill);await openPanel('finance');
  assert(await evaluate("document.getElementById('bill-preview').textContent.includes('当前名次订阅（登顶后档位）60 万')"));
  assert(await evaluate("document.getElementById('subscription-status').textContent.includes('后续掉榜仍保留')"));
  await screenshot('post-funding-finance.png');await closePanel('finance');await click('#time-toggle');
  await until(`JSON.parse(localStorage.getItem(${JSON.stringify(SAVE_KEY)})).state.gameDay>=105`);
  const actualBill=(await saved()).state.bills.find(item=>item.day===105),expectedBill=fundedRoutes.mixed.state.bills.find(item=>item.day===105);
  assert.deepEqual(actualBill,expectedBill,'the browser settles the same expanded-team bill as the rule simulation');

  // Planner comparison uses current learned values at both selection points.
  let fourPeople=createState();for(const employeeId of ['casey','morgan'])fourPeople=act(fourPeople,{type:'hire',employeeId});
  await loadFixture(fourPeople);await openPanel('project');
  assert.equal(await evaluate("document.querySelectorAll('#project-planner .planner-option').length"),4);
  await pointerClick('#project-planner [data-employee=casey]');await screenshot('planner-comparison.png');
  await closePanel('project');await openPanel('project');assert(await evaluate("document.querySelector('#project-planner input:checked').value==='casey'"),'selection survives reopening the panel');
  await command('Emulation.setDeviceMetricsOverride',{width:360,height:640,deviceScaleFactor:1,mobile:true});
  await pointerAt('#project-planner [data-employee=morgan]');assert((await visibleBounds('#project-planner [data-employee=morgan]')).visible);await screenshot('planner-mobile.png');
  await pointerClick('#project-planner [data-employee=morgan]');assert(await evaluate("document.querySelector('#project-planner input:checked').value==='morgan'"));
  await closePanel('project');await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  let trained=replayActions([]);
  for(const action of champion.acceptedActions){trained=act(trained,action);if(action.type==='publish'&&trained.gameDay>=42)break;}
  assert(employeeAbilities(trained,'avery')[0]>EMPLOYEES.avery.abilities[0]);
  await loadFixture(trained);await openPanel('project');
  for(const id of trained.employees){const displayed=await evaluate(`Array.from(document.querySelectorAll('#project-planner [data-employee="${id}"] .planner-stat strong'),n=>Number(n.textContent))`);assert.deepEqual(displayed,employeeAbilities(trained,id));}
  const busy=act(trained,{type:'reset'});await loadFixture(busy);await openPanel('project');
  assert(await evaluate("document.querySelector('#project-planner input[value=rebo]').disabled && document.querySelector('#project-planner [data-employee=rebo]').textContent.includes('重置额度中')"));
  await closePanel('project');
  let replacement=act(trained,{type:'createProject',name:'Replacement planner',focus:'office',plannerId:'avery'});
  replacement=waitTo(replacement,replacement.gameDay+1);replacement=act(replacement,{type:'dismiss',employeeId:'avery'});
  await loadFixture(replacement);await openPanel('project');
  assert(await evaluate("!document.getElementById('planner-reassignment').hidden && document.querySelectorAll('#replacement-planner .planner-stat.is-focus[data-direction=office]').length>0"));
  await pointerClick('#replacement-planner [data-employee=jules]');await screenshot('planner-reassignment.png');
  await evaluate("document.getElementById('planner-reassignment').requestSubmit();document.getElementById('planning-time-toggle').click()",true);
  assert.equal((await saved()).state.project.plannerId,'jules');assert.equal((await saved()).state.project.planProgress,replacement.project.planProgress);assert.equal((await saved()).state.cash,replacement.cash);
  let empty=createState();for(const employeeId of [...empty.employees])empty=act(empty,{type:'dismiss',employeeId});
  await loadFixture(empty);await openPanel('project');assert(await evaluate("document.getElementById('create-project').disabled && document.querySelectorAll('#project-planner input').length===0"));await closePanel('project');
  let solo=act(waitTo(firstCodingRelease(),21),{type:'hire',employeeId:'rebo'});for(const employeeId of ['avery','jules'])solo=act(solo,{type:'dismiss',employeeId});solo=act(solo,{type:'reset'});
  await loadFixture(solo);await openPanel('project');assert(await evaluate("document.getElementById('create-project').disabled && document.querySelector('#project-planner input[value=rebo]').disabled && !document.querySelector('#project-planner input:checked')"));await closePanel('project');
  await loadFixture(waitTo(solo,22));await openPanel('project');assert(await evaluate("!document.getElementById('create-project').disabled && document.querySelector('#project-planner input:checked').value==='rebo'"));await closePanel('project');
  await legacyUnchanged();assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS',viewports,tourViewports,checks:['old budget and startup companies adopt future subscription rates once without repricing history','seven staff and eight compute settle the same fourth-place bill shown in finance','each outlet escalates from its first to seventh report and keeps text after reload','planner radio cards show all current abilities, preserve focus/selection and highlight the project direction','planner replacement preserves progress and money; busy and empty teams cannot submit','planner comparison fits desktop and mobile','ten scheduled vignettes replace matching news, with dialogue, choices and reveals','story choices survive reload and return in the finale without economic side effects','story replay, mobile controls and management handoff','Rebo team and feedback controls share eligibility and prevent duplicate charges','automatic abilities expose their actual trigger and current price','reset completion prompts once and survives reload; team control fits mobile','training budget is charged and shown once; publishing/media prices match actual rules','media articles contain reporting only; benefits remain in financial forecast','existing v5 compact company keeps its original prices','edge-to-edge generated pixel room and distinct headquarters','automatic news, feedback, media, ready and farewell dialogs','automatic resumption with manual pause preserved','finance tutorial advances after viewing','v3 and v4 migration preserve company and source slot','UI tour before projects, back/reload/skip/replay without changing economy','no ratings before first publication or productless ending','model hover, focus, Escape and emulated touch introduction','office and all seven panels fit four viewports','secretary first-project-to-publication flow','guide skip/reopen/new-company reset','native planning, release and funding-event scenes','three directions and three release scores','staged recruitment UI and date boundaries','native legacy JSON download and original retention','selected employee proposal and automatic four stages','publication skip and replay do not settle twice','hire/compute/expansion/dismissal/reset','text-only names','background pause','storage conflict and write failure','corrupt-save confirmation','four legal ending fixtures','native music and funding sound'],boundary:'Clock accelerated only in isolated test browser. Ending/unlock fixtures use legal core actions. Not human duration or online deployment evidence.'}));
} finally {
  if(instrumentation)await command('Page.removeScriptToEvaluateOnNewDocument',{identifier:instrumentation.identifier});
  socket.close();
}
