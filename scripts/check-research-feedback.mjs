// Uses a separate tab in an isolated debugging browser, never a user's save.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createState,applyAction,replayActions} from '../src/game/rules.js';
import {unreadNotifications} from '../src/notifications.js';
import {encodeSave,SAVE_KEY,SCHEMA_VERSION} from '../src/storage.js';
import {subscriptionExamples} from './check-cost-balance.mjs';

const endpoint=process.env.AI_DEV_BROWSER_URL||'http://127.0.0.1:9338';
const base=process.env.AI_DEV_GAME_URL||'http://127.0.0.1:4173/';
// A distinct origin isolates localStorage from other test tabs.
const isolated=new URL(base);isolated.hostname=isolated.hostname==='127.0.0.1'?'localhost':'127.0.0.1';
const page=await fetch(`${endpoint}/json/new?${encodeURIComponent(isolated.href)}`,{method:'PUT'}).then(r=>r.json());
const socket=new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve=>socket.addEventListener('open',resolve,{once:true}));
let sequence=0;const pending=new Map(),errors=[];
socket.addEventListener('message',event=>{
  const message=JSON.parse(event.data);
  if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);
  if(pending.has(message.id)){const {resolve,reject,timer}=pending.get(message.id);clearTimeout(timer);pending.delete(message.id);message.error?reject(Error(JSON.stringify(message.error))):resolve(message.result);}
});
const command=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++sequence,timer=setTimeout(()=>reject(Error(`Timeout: ${method}`)),45000);
  pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
});
const evaluate=async expression=>{
  const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});
  assert(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));return result.result.value;
};
const wait=expression=>evaluate(`new Promise((resolve,reject)=>{let count=0;const poll=()=>{if(${expression})resolve(true);else if(++count>1800)reject(Error(${JSON.stringify(expression)}));else setTimeout(poll,20)};poll()})`);
const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const saved=()=>evaluate(`JSON.parse(localStorage.getItem('${SAVE_KEY}'))`);
const scores=()=>evaluate("[...document.querySelectorAll('#development-attributes .score-cell>strong')].map(n=>Number(n.textContent))");
const sleep=ms=>evaluate(`new Promise(r=>setTimeout(r,${ms}))`);
const act=(state,action)=>{const result=applyAction(state,action);assert(result.ok,result.error);return result.state;};
const to=(state,day)=>act(act(state,{type:'resume'}),{type:'advanceTo',targetDay:day});
const output=process.env.AI_DEV_SCREENSHOT_DIR||'/tmp/ai-point-feedback';
await mkdir(output,{recursive:true});
const screenshot=async name=>{const {data}=await command('Page.captureScreenshot',{format:'png'});await writeFile(`${output}/${name}`,Buffer.from(data,'base64'));};
async function reload(){
  await evaluate('window.oldPointDocument=true');await command('Page.reload',{ignoreCache:true});
  await wait("!window.oldPointDocument&&document.getElementById('office')?.dataset.ready==='true'");
  await evaluate('document.fonts.ready');
}
async function fixture(state,{progress=0,speed=1,future=state}={}){
  const observed=['story-start:0','milestone-first-funding','milestone-first-top',...unreadNotifications(future,['story-start:0']).filter(item=>item.kind!=='ready').map(item=>item.id)];
  const raw=encodeSave({schemaVersion:SCHEMA_VERSION,state:{...state,paused:true},dayProgressMs:progress,observedStoryEvents:[...new Set(observed)],feedbackResponses:{}});
  await evaluate(`localStorage.setItem('${SAVE_KEY}',${JSON.stringify(raw)});localStorage.setItem('ai-dev-story-settings-v1',JSON.stringify({companyName:'点数验证',sound:false,tourCompleted:true,guideSkipped:true,speed:${speed}}))`);
  await reload();
}
await command('Runtime.enable');await command('Page.enable');
const instrumentation=await command('Page.addScriptToEvaluateOnNewDocument',{source:`{
  const now=performance.now.bind(performance),raf=requestAnimationFrame.bind(window);
  window.pointTestOffset=0;Object.defineProperty(performance,'now',{value:()=>now()+window.pointTestOffset});
  window.requestAnimationFrame=callback=>raf(time=>callback(time+window.pointTestOffset));
}`});
try{
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  let team=createState();for(const employeeId of ['morgan','casey'])team=act(team,{type:'hire',employeeId});
  const project=act(team,{type:'createProject',name:'Pixel 1',focus:'coding',plannerId:'avery'});
  const future=to(project,112),before=to(project,4);
  for(const speed of [1,4]){
    await fixture(before,{progress:19900,speed,future});
    assert.equal(await evaluate("document.querySelectorAll('#development-attributes .direction-icon').length"),3);
    const initial=await scores();
    // Watch real UI frames: every emitted icon corresponds to one displayed point.
    await evaluate(`window.pointSamples=[];window.pointSampling=true;function samplePoints(){if(!window.pointSampling)return;const values=[...document.querySelectorAll('#development-attributes .score-cell>strong')].map(n=>Number(n.textContent));const office=document.getElementById('office');window.pointSamples.push({values,emitted:Number(office.dataset.emittedPoints),at:performance.now(),ids:office.dataset.pointEmployees?.split(',').filter(Boolean)||[],employee:office.dataset.lastPointEmployee,duration:Number(office.dataset.lastPointDuration)});requestAnimationFrame(samplePoints)}requestAnimationFrame(samplePoints)`);
    await click('#time-toggle');
    await wait("document.getElementById('office').dataset.burstEmployees.length>0");
    await click('#time-toggle');
    const hot=(await saved()).state;
    assert(hot.project.burst.earned>0);
    const frozen=await evaluate("({points:document.getElementById('office').dataset.emittedPoints,hot:document.getElementById('office').dataset.burstEmployees})");
    await sleep(150);
    assert.deepEqual(await evaluate("({points:document.getElementById('office').dataset.emittedPoints,hot:document.getElementById('office').dataset.burstEmployees})"),frozen);
    if(speed===1){
      await screenshot('research-fire-desktop.png');
      await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
      await screenshot('research-fire-mobile.png');
      await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
    }
    await evaluate(`window.batchStopped=false;window.batchWatcher=new MutationObserver(()=>{const office=document.getElementById('office');if(office.dataset.feedbackPending==='false'){window.batchWatcher.disconnect();document.getElementById('time-toggle').click();window.batchStopped=true;}});window.batchWatcher.observe(document.getElementById('office'),{attributes:true,attributeFilter:['data-feedback-pending']});`);
    await click('#time-toggle');await wait('window.batchStopped');
    await sleep(250);
    await evaluate('window.pointSampling=false');
    const samples=await evaluate('window.pointSamples');
    assert(samples.some(sample=>sample.emitted>0));
    const emitted=samples.filter((sample,index)=>sample.emitted>0&&(!index||sample.emitted!==samples[index-1].emitted));
    assert(emitted.at(-1).at-emitted[0].at>20000/speed*.7,'points remain distributed across the day');
    for(const sample of samples){assert.equal(sample.values.reduce((sum,value,index)=>sum+value-initial[index],0),sample.emitted,'one displayed point for every emitted icon');assert.equal(new Set(sample.ids).size,sample.ids.length,'one icon per employee head');}
    for(let index=1;index<emitted.length;index++){assert.equal(emitted[index].emitted-emitted[index-1].emitted,1);assert(emitted[index].at-emitted[index-1].at>=120,'emissions are visibly staggered');assert(emitted[index].duration>=650);}
    const previousByEmployee=new Map();for(const event of emitted){const last=previousByEmployee.get(event.employee);if(last)assert(event.at-last.at>=last.duration-40,'an icon remains readable before replacement');previousByEmployee.set(event.employee,event);}
    assert.deepEqual(await scores(),(await saved()).state.project.scores);
    assert((await saved()).state.paused);
    const actual=(await saved()).state.project.scores;
    await reload();assert.deepEqual(await scores(),actual);
    assert.equal(await evaluate("document.getElementById('office').dataset.emittedPoints"),'0','restoration does not replay previous points');
  }
  // Ready pauses the economy, but its last point animation still has a working pause button.
  const tailProject=act(createState(),{type:'createProject',name:'Final points',focus:'coding',plannerId:'avery'}),tailBefore=to(tailProject,11);
  await fixture(tailBefore,{progress:19900,speed:4,future:to(tailBefore,112)});await click('#time-toggle');
  await wait(`JSON.parse(localStorage.getItem('${SAVE_KEY}')).state.project.status==='ready'&&document.getElementById('office').dataset.feedbackPending==='true'`);
  assert(await evaluate("document.getElementById('time-toggle').textContent.includes('暂停')"));
  await click('#time-toggle');const tailFrozen=await evaluate("document.getElementById('office').dataset.emittedPoints");await sleep(200);
  assert.equal(await evaluate("document.getElementById('office').dataset.emittedPoints"),tailFrozen);assert.equal((await saved()).state.gameDay,12);
  assert(await evaluate("document.getElementById('time-toggle').textContent.includes('继续')"));await click('#time-toggle');
  await wait("document.getElementById('release-dialog').open");assert.deepEqual(await scores(),(await saved()).state.project.scores);
  assert.equal((await saved()).state.gameDay,12,'playing the last points does not charge another day');
  // Fractional foreground time fills the current phase before its daily settlement.
  await fixture(before,{speed:4,future});await click('#time-toggle');
  const stageBefore=(await saved()).state.project.stageWork,dayBefore=(await saved()).state.gameDay;
  await sleep(300);const progress1=await evaluate("document.getElementById('development-progress').value");
  await sleep(300);const progress2=await evaluate("document.getElementById('development-progress').value");
  assert(progress1>stageBefore&&progress2>progress1,'progress fills continuously within one day');
  assert.equal((await saved()).state.gameDay,dayBefore);
  await click('#time-toggle');const pausedProgress=await evaluate("document.getElementById('development-progress').value");
  await sleep(150);assert.equal(await evaluate("document.getElementById('development-progress').value"),pausedProgress);
  await reload();assert(Math.abs(await evaluate("document.getElementById('development-progress').value")-pausedProgress)<0.001,'saved fractional day preserves paused progress');
  await click('.office-navigation [data-panel-target=project]');
  assert.equal(await evaluate("document.getElementById('research-progress').value"),pausedProgress);
  await click('#panel-project [data-close-panel]');
  // Management interruption ends only the cosmetic queue.
  await fixture(before,{progress:19900,future});await click('#time-toggle');
  await wait("Number(document.getElementById('office').dataset.pointAnimations)>0");
  const actualBefore=(await saved()).state.project.scores;
  await click('.office-navigation [data-panel-target=team]');
  assert.deepEqual(await scores(),actualBefore);assert.equal(await evaluate("document.getElementById('office').dataset.pointAnimations"),'0');
  await click('#panel-team [data-close-panel]');await wait(`!JSON.parse(localStorage.getItem('${SAVE_KEY}')).state.paused`);
  // Reduced motion preserves real bonus but skips moving effects.
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await fixture(before,{progress:19900,future});await click('#time-toggle');await wait(`JSON.parse(localStorage.getItem('${SAVE_KEY}')).state.gameDay===5`);
  assert.deepEqual(await scores(),(await saved()).state.project.scores);
  assert((await saved()).state.project.burst.earned>0);assert.equal(await evaluate("document.getElementById('office').dataset.pointAnimations"),'0');
  await command('Emulation.setEmulatedMedia',{features:[]});
  // A long frame cannot enqueue a whole project's worth of visible points.
  await fixture(project,{future});await click('#time-toggle');await evaluate('window.pointTestOffset+=300000');
  await wait(`JSON.parse(localStorage.getItem('${SAVE_KEY}')).state.gameDay===1`);
  assert.equal((await saved()).state.project.status,'planning');
  // Reduced motion can still catch up without a visual queue or ready deadlock.
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await evaluate('window.pointTestOffset+=300000');
  await wait("document.getElementById('release-dialog').open");
  assert.deepEqual(await scores(),(await saved()).state.project.scores);
  await command('Emulation.setEmulatedMedia',{features:[]});
  // Completing during the last day must leave the office at final actual scores.
  let ending=act(to(act(createState(),{type:'createProject',name:'First',focus:'coding',plannerId:'avery'}),112),{type:'publish'});
  ending=act(to(ending,106),{type:'createProject',name:'Unfinished',focus:'coding',plannerId:'avery'});
  ending=to(ending,111);
  await fixture(ending,{progress:19900});await click('#time-toggle');
  await wait(`!!JSON.parse(localStorage.getItem('${SAVE_KEY}')).state.ending`);await click('#ending-office');
  assert.deepEqual(await scores(),(await saved()).state.project.scores);
  // A high-output day stays readable at 4x and cannot create the following batch early.
  let dense=replayActions([]);
  const history=subscriptionExamples().champion8.state.acceptedActions;
  for(const action of history){dense=act(dense,action);if(dense.gameDay===104)break;}
  const denseFuture=to(dense,112);
  await fixture(dense,{progress:19900,speed:4,future:denseFuture});
  const denseInitial=await scores();await click('#time-toggle');
  await wait(`JSON.parse(localStorage.getItem('${SAVE_KEY}')).state.gameDay===105`);
  await sleep(6500);
  assert.equal((await saved()).state.gameDay,105,'unread points hold the next daily settlement');
  const denseView=await evaluate("({ids:document.getElementById('office').dataset.pointEmployees.split(',').filter(Boolean),count:Number(document.getElementById('office').dataset.emittedPoints),pending:document.getElementById('office').dataset.feedbackPending})");
  assert.equal(new Set(denseView.ids).size,denseView.ids.length);assert.equal(denseView.pending,'true');
  assert.equal((await scores()).reduce((sum,value,index)=>sum+value-denseInitial[index],0),denseView.count);
  const denseActual=(await saved()).state.project.scores;assert.notDeepEqual(await scores(),denseActual);
  await click('#time-toggle');await screenshot('research-dense-readable.png');
  await click('.office-navigation [data-panel-target=project]');assert.deepEqual(await scores(),denseActual);
  // Existing budget company adopts exactly once; ongoing project stays unchanged.
  const previous=JSON.parse(await readFile(new URL('../tests/fixtures/legacy-v5-budget-active.json',import.meta.url),'utf8'));
  await fixture(previous.state);
  const adopted=(await saved()).state;
  assert(adopted.burstEnabled);assert.deepEqual(adopted.project,previous.state.project);
  assert.deepEqual(adopted.bills,previous.state.bills);assert.equal(adopted.cash,previous.state.cash);
  assert.equal(adopted.acceptedActions.filter(action=>action.type==='enableBurst').length,1);
  await reload();assert.equal((await saved()).state.acceptedActions.filter(action=>action.type==='enableBurst').length,1);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS',checks:['readable real-time points at 1x and 4x: no head overlap, staggered emissions and exact +1','dense day holds the following settlement without losing points','fire awards real bonus and freezes on manual pause','final point batch can pause and resume before automatic release','desktop and mobile fire screenshots','reload never replays points','stage progress fills within each day, freezes and restores exactly','management flushes cosmetic queue only','reduced motion preserves real scores','planning-to-ready catch-up opens release','ending office shows final scores','old budget adoption leaves current project unchanged and happens once'],boundary:'Isolated browser, legal reducer fixtures and one explicitly simulated delayed frame. Not human pacing verification.'}));
}catch(error){
  console.error(await evaluate(`({state:JSON.parse(localStorage.getItem('${SAVE_KEY}'))?.state?.paused,day:JSON.parse(localStorage.getItem('${SAVE_KEY}'))?.state?.gameDay,progress:JSON.parse(localStorage.getItem('${SAVE_KEY}'))?.dayProgressMs,hidden:document.hidden,dialogs:[...document.querySelectorAll('dialog[open]')].map(n=>n.id),pending:document.getElementById('office')?.dataset.feedbackPending,emitted:document.getElementById('office')?.dataset.emittedPoints,shown:[...document.querySelectorAll('#development-attributes .score-cell>strong')].map(n=>Number(n.textContent))})`));throw error;
}finally{
  await command('Page.removeScriptToEvaluateOnNewDocument',{identifier:instrumentation.identifier});
  socket.close();await fetch(`${endpoint}/json/close/${page.id}`);
}
