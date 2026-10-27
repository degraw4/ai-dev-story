import { RULES, DIRECTIONS, EMPLOYEES, STAGES } from './game/content.js';
import { createState, applyAction, board, rank, total, price, productionSummary, employeeActivity, employeeAbilities, publicationPresenter, proposalScores, usedCompute, recruitmentStatus, rulesFor, campaignDay, marketSummary, employeeTerms, trainingCost, mediaCost, operatingCosts, mediaCampaign, quotaResetStatus, baseSubscriptionIncome } from './game/rules.js';
import { advanceClock } from './clock.js';
import { onboardingStep, tourStep, updateTourProgress } from './onboarding.js';
import { SCHEMA_VERSION, SAVE_KEY, MIGRATION_SAVE_KEYS, LEGACY_SAVE_KEYS, encodeSave, decodeSave } from './storage.js';
import { unreadNotifications } from './notifications.js';
import { storyScene, reachedStoryScenes, storyStartMarker, selectedStoryChoice } from './story-scenes.js';
import { createAudioController } from './audio.js';
import { createOfficeRenderer } from './office.js';
import { createDirectionIcon } from './point-icons.js';
import { createResearchFeedback } from './research-feedback.js';
import { developmentProgress } from './development-progress.js';
import { drawPlanning, drawRelease, drawCelebration } from './stage-art.js';
import { DIRECTION_LABELS, EMPLOYEE_TRAITS, FAREWELLS, chapterAt, newsFor, mediaHeadline, playerReleaseCopy, userFeedback, rivalCopy, ENDING_COPY, modelIntroduction, specialAbility } from './story.js';

const $ = id => document.getElementById(id);
const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
const clear = id => { const node = typeof id === 'string' ? $(id) : id; node.replaceChildren(); return node; };
const option = (value,text) => { const node = element('option',text); node.value = value; return node; };
const money = value => `${value} 万`;
const ratingLabel = company => company.models.some(model=>model.company==='player')?`${(company.ratingTenths/10).toFixed(1)} / 5`:'暂无评价';
const SETTINGS_KEY = 'ai-dev-story-settings-v1';
const ERROR_TEXT = { cash:'当前现金不足。待到账收益暂时不能使用。', compute:'可用算力不足，请换一个档位或购买设备。', seats:'办公室没有空工位，请先扩张或支付赔偿辞退员工。', 'project-exists':'当前模型尚未发布，请先完成这一款。', 'project-not-ready':'研发尚未完成。', 'project-not-researching':'当前没有正在研发的项目。', 'reset-running':'额度重置正在进行，需要到下个游戏日完成。', 'employee-busy':'这位员工正在重置额度。', 'presenter-busy':'发布负责人正在重置额度，请换一位。', 'rating-full':'客户评价已满，无需再重置。', 'no-users':'发布第一款模型后，才能为用户重置额度。', 'game-ended':'本局已经结束，可以查看记录或开始新局。', capacity:'算力数量已达到上限。', name:'型号需要 1 至 40 个字符。', 'already-expanded':'办公室已经扩张。', unavailable:'该员工已入职或已离职。', 'candidate-locked':'这位员工还未进入人才市场。请查看解锁提示。', rebo:'需要先招聘 Rebo。', presenter:'请选择一名在岗且不忙于重置的负责人。', employee:'这位员工目前不在公司。', candidate:'这位人物不能招聘。', focus:'请选择一种研发方向。', planner:'请选择在岗且可工作的方案负责人。', 'planner-required':'方案负责人已离岗，请先重选负责人。', 'planner-not-missing':'当前方案已有负责人。', 'history-full':'本局操作记录已满，请先导出存档。', mode:'请选择一种有效任务。' };
let settings = { companyName:'明日智能', music:35, effects:60, speed:1, sound:false, guideSkipped:false, tourStep:0, tourCompleted:true };
try { const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)); if (saved && typeof saved === 'object') { if (typeof saved.companyName === 'string') settings.companyName = saved.companyName.slice(0,30); for (const key of ['music','effects']) if (Number.isFinite(saved[key])) settings[key] = Math.max(0,Math.min(100,saved[key])); if ([1,2,4].includes(saved.speed)) settings.speed=saved.speed; if (typeof saved.sound === 'boolean') settings.sound = saved.sound; if (typeof saved.guideSkipped === 'boolean') settings.guideSkipped=saved.guideSkipped; if(Number.isInteger(saved.tourStep))settings.tourStep=Math.max(0,Math.min(4,saved.tourStep)); if(typeof saved.tourCompleted==='boolean')settings.tourCompleted=saved.tourCompleted; } } catch {}
let state = createState();
let dayProgressMs = 0;
let observedStoryEvents = [];
let feedbackResponses = {};
let started = false;
let writeBlocked = false;
let lastKnownRaw = null;
let storageProblem = '';
let closingTab = false;
let presentationTimers = [];
let presentationCue = null;
let reportShown = false;
let lastFrame = performance.now();
let lastFractionSave = lastFrame;
let confirmAction = null;
let lastSuggestedName = '';
let tourActive = false;
let planningRevealTimer = null;
let activeMilestone = null;
let lastPlanFrame = -1;
let tooltipAnchor = null;
let tooltipPinned = false;
let resumeAfterInterruption = false;
let resumeQueued = false;
let activeNotification = null;
let activeStory = null;
const audio = createAudioController();
audio.setMusicVolume(settings.music / 100);
audio.setEffectsVolume(settings.effects / 100);
const office = createOfficeRenderer($('office'));
const researchFeedback=createResearchFeedback();
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches)flushResearchFeedback();});

function snapshot() { return { schemaVersion:SCHEMA_VERSION, state, dayProgressMs, observedStoryEvents, feedbackResponses }; }
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings)); } catch {} }
function showMessage(text,error=false) {
  $('action-message').textContent=text; $('action-message').classList.toggle('error',error);
  const panelMessage=document.querySelector('.management-panel[open] .panel-message');
  if(panelMessage){panelMessage.textContent=text;panelMessage.hidden=false;panelMessage.classList.toggle('error',error);}
}
function displayStorageProblem() {
  $('save-alert').hidden = !storageProblem;
  $('save-alert-text').textContent = storageProblem;
  $('reload-save').hidden = !writeBlocked;
  $('discard-save').hidden = !writeBlocked;
}
function blockConflictingSave() {
  resumeAfterInterruption=false;
  writeBlocked=true;
  state={...state,paused:true};
  storageProblem='另一个页面更改了这份存档。本页已暂停，不会覆盖对方进度。请重新载入最新存档。';
  $('save-status').textContent='存档已变化，本页暂停';
  audio.setBackgrounded(true);
  displayStorageProblem();
  render();
}
function save(explicitOverwrite=false) {
  if (!started || writeBlocked) return false;
  try {
    const raw=encodeSave(snapshot());
    if (!explicitOverwrite && localStorage.getItem(SAVE_KEY)!==lastKnownRaw) { blockConflictingSave(); return false; }
    localStorage.setItem(SAVE_KEY,raw);
    lastKnownRaw=raw;
    $('save-status').textContent='已保存到此浏览器'; storageProblem=''; displayStorageProblem(); return true;
  }
  catch { $('save-status').textContent='保存失败，当前进度仅在本页'; storageProblem='保存失败：浏览器未能写入存档。你可以继续经营，请先保留此页面。'; displayStorageProblem(); return false; }
}
function restoreBeforeConflict(before, progress, observed) {
  state={...before,paused:true}; dayProgressMs=progress; observedStoryEvents=observed;
  render(); showMessage('存档已被其他页面修改，本次操作没有保存。请重新载入最新进度。',true);
}
function restore() {
  let raw,migrating=false;
  try { raw = localStorage.getItem(SAVE_KEY); lastKnownRaw=raw;if(!raw){for(const key of MIGRATION_SAVE_KEYS){const previous=localStorage.getItem(key);if(previous){raw=previous;migrating=true;break;}}} } catch { storageProblem='无法读取浏览器存档。当前可以开始新局，但存档功能可能不可用。'; displayStorageProblem(); return; }
  if (!raw) {
    try { const slots=LEGACY_SAVE_KEYS.filter(key=>localStorage.getItem(key)!==null);$('legacy-save-notice').hidden=!slots.length;const select=clear('legacy-save-slot');for(const key of slots)select.append(option(key,key.endsWith('v2')?'手动研发三方向存档':'五方向存档')); } catch {}
    return;
  }
  const decoded = decodeSave(raw);
  if (!decoded.ok) { writeBlocked=true; storageProblem='已有存档无法读取，原内容已保留。请重新载入检查，或明确开始新局后替换。'; displayStorageProblem(); return; }
  ({state,dayProgressMs,observedStoryEvents,feedbackResponses} = decoded.snapshot);
  started=true;
  const enableNewBurst=state.campaignProfile==='budget112'&&!state.burstEnabled&&!state.ending;
  if(enableNewBurst){const enabled=applyAction(state,{type:'enableBurst'});if(enabled.ok)state=enabled.state;}
  const enableSubscriptions=!!rulesFor(state).trainingBase&&!state.subscriptionGrowthEnabled&&!state.ending;
  if(enableSubscriptions){const enabled=applyAction(state,{type:'enableSubscriptionGrowth'});if(enabled.ok)state=enabled.state;}
  const initializeStories=!observedStoryEvents.some(id=>/^story-start:\d+$/.test(id));
  if(initializeStories)observedStoryEvents.push(storyStartMarker(state.gameDay+1));
  if((initializeStories||enableNewBurst||enableSubscriptions)&&!migrating)save();
  if(migrating){save();showMessage('已有公司按原日历接续，旧进度原文已保留；新公司采用更紧凑的经营期。');}
  $('save-status').textContent='存档已恢复，时间暂停';
  if(enableNewBurst)showMessage('员工火爆已加入后续研发，下一款模型开始自动触发；当前项目保留原进度。');
  if(enableSubscriptions)showMessage('后续账单已采用新的订阅档位：拿到综合榜首融资后，跌出第一仍能保留较高订阅收入。已有资金和账单保留。');
}
function safeSound(name) { audio.play(name); }
function observeNews(before) {
  for(const news of newsFor(state).filter(item=>item.id.startsWith('chapter-')))if(!observedStoryEvents.includes(news.id))observedStoryEvents.push(news.id);
  return state.gameDay>before.gameDay&&unreadNotifications(state,observedStoryEvents).some(item=>item.kind==='news'&&item.day>before.gameDay);
}
function effectsFor(before, publication = false) {
  if (before.project?.id === state.project?.id && before.project?.status !== 'ready' && state.project?.status === 'ready') { safeSound('researchReady'); showMessage('研发完成，模型待发布。经营继续，准备好后召开发布会。');if(!before.paused&&!state.ending){resumeAfterInterruption=true;scheduleAutomaticResume();} }
  if (!publication && state.funding.length > before.funding.length) safeSound('funding');
  if (state.ratingTenths > before.ratingTenths) safeSound('reset');
  const oldRank=rank(before),newRank=rank(state);
  if (!publication && oldRank !== null && newRank !== null && oldRank !== newRank) safeSound(newRank<oldRank?'rankUp':'rankDown');
  if (!before.ending && state.ending) { safeSound(state.cash<0?'bankrupt':'ending'); showEnding(); }
}
function act(action, sound, message) {
  for(const node of document.querySelectorAll('.panel-message')){node.textContent='';node.hidden=true;}
  if (writeBlocked) { showMessage('另一个页面或无法读取的存档需要先处理，当前经营已暂停。',true); safeSound('error'); return null; }
  const before=state, beforeProgress=dayProgressMs, beforeObserved=[...observedStoryEvents];
  const result=applyAction(state,action);
  if (!result.ok) { showMessage(ERROR_TEXT[result.error] || `当前无法执行此操作：${result.error}`,true); safeSound('error'); render(); return null; }
  state=result.state;
  if(action.type==='resume')resumeAfterInterruption=false;
  const hasNews=observeNews(before);
  // Saving precedes every presentation. Closing or replaying a scene never reapplies this action.
  save();
  if(writeBlocked){restoreBeforeConflict(before,beforeProgress,beforeObserved);return null;}
  researchFeedback.sync(state,result.presentationEvents,rulesFor(state).secondsPerDay*1000/settings.speed);
  if(reducedMotion.matches)researchFeedback.flush();
  render();
  if(hasNews)safeSound('news');
  if (sound) safeSound(sound);
  if (message) showMessage(message);
  effectsFor(before,action.type==='publish');
  scheduleAutomaticResume();
  return {before,after:state};
}
function pauseForReading() {
  flushResearchFeedback();
  if(started&&!state.paused&&!state.ending){resumeAfterInterruption=true;act({type:'pause'});}
  lastFrame=performance.now();
}
function scheduleAutomaticResume(){
  if(resumeQueued)return;
  resumeQueued=true;
  setTimeout(()=>{
    resumeQueued=false;
    if(!started||state.ending||writeBlocked||document.hidden||closingTab||tourActive||document.querySelector('dialog[open]')||!$('release-scene').hidden||!$('ending-scene').hidden||!$('planning-scene').hidden)return;
    if(researchFeedback.pending)return;
    if(showNextNotification())return;
    if(!resumeAfterInterruption)return;
    if(state.project?.status==='planning'&&state.project.plannerId===null)return;
    resumeAfterInterruption=false;
    if(state.paused)act({type:'resume'});
    lastFrame=performance.now();
  },0);
}
function toggleTime(){
  if(state.project?.status==='ready'&&state.paused&&researchFeedback.pending){
    resumeAfterInterruption=!resumeAfterInterruption;render();safeSound('ui');lastFrame=performance.now();return;
  }
  resumeAfterInterruption=false;
  act({type:state.paused?'resume':'pause'},'ui');lastFrame=performance.now();
}
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('close',scheduleAutomaticResume);
function showConfirm(title,copy,action) { pauseForReading(); closeDialogs(); $('confirm-title').textContent=title; $('confirm-copy').textContent=copy; confirmAction=action; $('confirm-dialog').showModal(); }
function newGameConfirmed(explicitOverwrite=false) {
  resumeAfterInterruption=false;
  activeNotification=null;activeStory=null;
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
  stopPresentation(); stopPresentationAudio(); closePlanning(); activeMilestone=null; $('event-dialog').close(); $('release-scene').hidden=true; $('ending-scene').hidden=true; setPresentationInert(false);
  writeBlocked=false; storageProblem=''; displayStorageProblem();
  audio.setBackgrounded(document.hidden);
  state=createState(); dayProgressMs=0; observedStoryEvents=[storyStartMarker(0)]; feedbackResponses={}; started=true;
  settings.guideSkipped=false;
  Object.assign(settings,updateTourProgress(settings,'restart'));
  settings.companyName=$('company-name').value.trim().slice(0,30)||settings.companyName||'明日智能';
  saveSettings(); observeNews(state); save(explicitOverwrite); render();
  if(writeBlocked){showMessage('已有进度发生变化，请重新载入或明确确认替换存档。',true);return;}
  showMessage('公司开张！先跟小满认识办公室，再开始第一款模型。');
  showTour();
}
function requestNewGame() { showConfirm('开始新的一局？','这会替换当前浏览器中的新版经营存档，并重新开启小满引导。旧版五方向与手动研发存档均保留，不会被删除。',()=>newGameConfirmed(true)); }
function ledger(target,rows) { clear(target); for (const [name,value,isTotal] of rows) { const dt=element('dt',name,isTotal?'total':''); const dd=element('dd',String(value),isTotal?'total':''); target.append(dt,dd); } }
function renderScores(target,scores,focus,animate=true) {
  const key=scores.join(',')+':'+focus;
  if(target.dataset.scores===key)return;
  const previous=[...target.querySelectorAll('strong')].map(node=>Number(node.textContent));
  const token={};target._scoreAnimation=token;target.dataset.scores=key;clear(target);
  const shouldAnimate=animate&&previous.length===3&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const counters=[];
  DIRECTIONS.forEach((direction,index)=>{
    const cell=element('div',undefined,`score-cell${focus===direction?' focused':''}`),counter=element('strong',String(shouldAnimate?previous[index]:scores[index]));
    counter.dataset.target=String(scores[index]);const label=element('span',undefined,'score-label');label.append(createDirectionIcon(direction),element('span',DIRECTION_LABELS[direction]));cell.append(label,counter);counters.push(counter);
    const gain=scores[index]-(previous[index]??scores[index]);
    if(shouldAnimate&&gain>0){const pop=element('em',`+${gain}`,'score-gain');cell.append(pop);setTimeout(()=>pop.remove(),1000);}
    target.append(cell);
  });
  if(shouldAnimate){const began=Date.now();const frame=()=>{const now=Date.now();if(target._scoreAnimation!==token)return;const ratio=Math.min(1,(now-began)/650),eased=1-(1-ratio)**3;counters.forEach((node,index)=>{node.textContent=String(Math.round(previous[index]+(scores[index]-previous[index])*eased));});if(ratio<1)requestAnimationFrame(frame);};requestAnimationFrame(frame);}
}

function render() {
  $('welcome').hidden=started; $('game').hidden=!started;
  $('start-game').disabled=writeBlocked;
  if (!started) return;
  const currentRank=rank(state),currentChapter=chapterAt(state.gameDay,state),locked=writeBlocked||!!state.ending;
  $('company-title').textContent=settings.companyName;
  $('chapter-label').textContent=currentChapter.title;
  $('cash-value').textContent=state.cash;
  $('rank-value').textContent=currentRank===null?'未发布':`# ${currentRank}`;
  $('compute-value').textContent=`${usedCompute(state)} / ${state.compute}`;
  $('rating-value').textContent=ratingLabel(state);
  $('user-count').textContent=new Intl.NumberFormat('zh-CN',{notation:'compact',maximumFractionDigits:1}).format(marketSummary(state).users);
  $('day-value').textContent=`第 ${state.gameDay} / ${rulesFor(state).lastDay} 日`;
  renderTimeButton();
  $('time-toggle').disabled=locked;
  $('view-ending').hidden=!state.ending;
  $('speed').value=String(settings.speed); $('speed').disabled=locked;
  $('office-capacity').textContent=`${state.employees.length} / ${state.seats} 工位`;
  $('office-title').textContent=state.seats===8?'城市总部':'创业办公室';
  $('office-caption').textContent=state.ending?'经营已结束，可以查看公司记录。':state.paused?'经营暂停 · 点击继续经营':state.project?.status==='planning'?'负责人正在设计方案':state.project?.status==='researching'?'全员自动研发中':'等待新模型立项';
  researchFeedback.sync(state);
  office.render(state); positionOfficeLabels();
  $('deadline-warning').hidden=state.gameDay<campaignDay(state,148)||!!state.ending;
  $('deadline-warning').textContent=`最后可发布日：第 ${rulesFor(state).lastDay-1} 日。第 ${rulesFor(state).lastDay} 日结算并进入结局，请及时发布。`;
  $('project-empty').hidden=!!state.project;
  $('project-active').hidden=!state.project;
  $('project-state').textContent=state.project?.status==='ready'?'完成待发布':productionSummary(state).phaseLabel;
  renderPlannerChoices();
  $('training-budget').textContent=`立项预付训练预算 ${money(trainingCost(state))}，覆盖四个研发阶段；发布另需 ${money(rulesFor(state).publicationCost)}，工资和设备运行费按账单结算。账上 ${money(state.cash)}。`;
  if (!state.project && (!$('model-name').value || $('model-name').value===lastSuggestedName)) {lastSuggestedName=`Next ${state.nextProjectId}`; $('model-name').value=lastSuggestedName;}
  const summary=productionSummary(state);
  if (state.project) {
    const project=state.project;
    for(const id of ['project-scores','development-attributes'])if($(id).dataset.projectId!==String(project.id)){$(id).dataset.projectId=String(project.id);$(id).dataset.scores='';$(id)._scoreAnimation=null;clear(id);}
    $('project-name').textContent=project.name;
    $('training-paid').textContent=project.trainingCost===undefined?'':`本款训练预算 ${money(project.trainingCost)} 已预付；继续研发不重复扣款。`;
    $('project-description').textContent=`主攻${DIRECTION_LABELS[project.focus]} · 方案负责人 ${EMPLOYEES[project.plannerId]?.name||'待重选'}`;
    renderScores($('project-scores'),project.scores,project.focus);
    $('plan-score-summary').textContent=project.planScores?`方案初始成绩：${project.planScores.join(' · ')}。当前成绩包含全员后续贡献。`:'方案正在设计，当前展示的是公司积累。';
    $('research-estimate').textContent=project.status==='ready'?'研发已完成，经营时间继续。正式发布后才入榜。':summary.blockedReason||`每天推进 ${summary.progressPerDay}，占用算力 ${summary.usedCompute} / ${state.compute}。按当前团队与算力，约剩 ${summary.estimatedDays} 日；更多算力提高研发速度。`;
    $('research-team-summary').textContent=project.status==='planning'?'方案由负责人设计；交付后，全体可工作的员工都会按自己的三项能力为模型加分。':project.status==='ready'?'当前三项成绩由方案和团队实际研发共同积累；已经完成的成果不会因员工离职而减少。':`研发团队 ${summary.activeEmployeeIds.length} 人 · 能力合计：${DIRECTIONS.map((direction,index)=>`${DIRECTION_LABELS[direction]} ${summary.teamAbilities[index]}`).join(' · ')}。参与人数和员工能力直接决定榜分，主攻${DIRECTION_LABELS[project.focus]}的贡献加倍。${summary.phaseId==='evaluation'&&summary.activeEmployeeIds.includes('max')?'Max 额外提供 4 点主攻能力贡献。':''}`;
    $('planner-reassignment').hidden=project.status!=='planning'||project.plannerId!==null;
    $('view-planning').hidden=project.status!=='planning';
    $('open-release').hidden=project.status!=='ready';$('open-release').disabled=locked;
  }
  $('development-strip').hidden=!state.project;
  if(state.project){
    renderScores($('development-attributes'),researchFeedback.scores(state),state.project.focus,false);
  }
  updateDevelopmentProgress();
  renderPlanning();
  $('knowledge').textContent=`公司积累：${DIRECTIONS.map((direction,index)=>`${DIRECTION_LABELS[direction]} ${state.knowledge[index]}`).join(' · ')}`;
  renderEmployees(locked); renderBoard(); renderMoney(locked); renderHiring(locked); renderNews(); renderFeedback(locked); renderHistory(); renderGuide(); renderTour();
  $('office-project-summary').textContent=state.project?`${state.project.name} · ${state.project.status==='ready'?'等待发布':`${state.project.work} / ${RULES.projectWork}`}`:'还没有在研项目';
  $('nav-project-status').textContent=state.project?.status==='ready'?'可以发布':state.project?'研发中':'等待立项';
  $('new-game').disabled=false;
  displayStorageProblem();
}
function abilityText(id) {return DIRECTIONS.map((d,i)=>`${DIRECTION_LABELS[d]} ${employeeAbilities(state,id)[i]}`).join(' · ');}
function selectedPlanner(id){
  return $(id).querySelector('input[type=radio]:checked:not(:disabled)')?.value||'';
}
function updatePlannerSelection(){
  const selected=selectedPlanner('project-planner');
  $('planner-abilities').textContent=selected?`已选择 ${EMPLOYEES[selected].name} 制定方案。`:state.employees.length?'目前没有可安排的负责人，请等待额度重置完成。':'当前没有员工，请先到人才市场招聘。';
  $('create-project').disabled=writeBlocked||!!state.ending||!!state.project||!selected||state.cash<trainingCost(state);
  $('confirm-planner').disabled=writeBlocked||!!state.ending||!selectedPlanner('replacement-planner')||state.project?.status!=='planning'||state.project.plannerId!==null;
}
function renderPlannerChoices(){
  const locked=writeBlocked||!!state.ending;
  const available=state.employees.filter(id=>state.assignments[id]?.kind!=='reset');
  const key=JSON.stringify([locked,state.employees.map(id=>[id,employeeAbilities(state,id),state.assignments[id]?.finishDay??null])]);
  for(const id of ['project-planner','replacement-planner']){
    const target=$(id),previous=target.querySelector('input:checked')?.value;
    const selection=available.includes(previous)?previous:available[0];
    if(target.dataset.roster!==key){
      const focused=target.contains(document.activeElement)?document.activeElement.value:null;
      target.replaceChildren();target.dataset.roster=key;
      for(const employeeId of state.employees){
        const busy=state.assignments[employeeId]?.kind==='reset';
        const card=element('label',undefined,`planner-option${busy?' is-busy':''}`);card.dataset.employee=employeeId;
        const heading=element('span',undefined,'planner-option-heading'),input=element('input');
        input.type='radio';input.name=id;input.value=employeeId;input.required=true;input.disabled=locked||busy;input.checked=employeeId===selection;
        const selectedTag=element('span','已选','planner-selected');selectedTag.setAttribute('aria-hidden','true');
        heading.append(input,element('strong',EMPLOYEES[employeeId].name),selectedTag);
        const stats=element('span',undefined,'planner-stats'),abilities=employeeAbilities(state,employeeId);
        DIRECTIONS.forEach((direction,index)=>{const stat=element('span',undefined,'planner-stat');stat.dataset.direction=direction;const label=element('span',undefined,'score-label');label.append(createDirectionIcon(direction),element('span',DIRECTION_LABELS[direction]));stat.append(label,element('strong',String(abilities[index])));stats.append(stat);});
        card.append(heading,stats);
        if(busy)card.append(element('span',`重置额度中 · 第 ${state.assignments[employeeId].finishDay} 日完成`,'planner-unavailable'));
        target.append(card);
      }
      if(!state.employees.length)target.append(element('p','暂无可选员工。','muted'));
      if(focused)Array.from(target.querySelectorAll('input')).find(input=>input.value===focused&&!input.disabled)?.focus({preventScroll:true});
    }
    const focus=id==='replacement-planner'?state.project?.focus:$('focus').value;
    for(const stat of target.querySelectorAll('.planner-stat'))stat.classList.toggle('is-focus',stat.dataset.direction===focus);
  }
  updatePlannerSelection();
}
function renderResetControl(button,statusLine) {
  const reset=quotaResetStatus(state);
  button.disabled=writeBlocked||!reset.available;
  button.textContent=reset.reason==='reset-running'?`重置中 · 第 ${reset.finishDay} 日完成`:`重置额度 · ${reset.cost} 万`;
  statusLine.textContent=writeBlocked?'请先处理存档冲突，再使用能力。':reset.reason==='reset-running'?`需要推进游戏时间；预计第 ${reset.finishDay} 日完成。`:reset.available?`预计第 ${reset.finishDay} 日完成，用户评价 ${(state.ratingTenths/10).toFixed(1)} → ${(reset.ratingAfter/10).toFixed(1)} / 5。`:(ERROR_TEXT[reset.reason]||'暂时不可用')+(reset.reason==='rebo'?` ${recruitmentStatus(state,'rebo').hint}。`:'');
}
function useResetAbility() {
  const reset=quotaResetStatus(state);
  act({type:'reset'},'reset',`Rebo 已开始重置，支付 ${reset.cost} 万；预计第 ${reset.finishDay} 日完成，期间暂不参与方案和研发。`);
}
function renderSpecialAbility(id) {
  const ability=specialAbility(state,id);if(!ability)return null;
  const box=element('section',undefined,`staff-ability${id==='rebo'?' active-ability':''}`),heading=element('div',undefined,'ability-heading');
  box.dataset.ability=id;heading.append(element('strong',ability.name),element('span',ability.mode,'badge'));
  box.append(heading,element('p',ability.copy));
  if(id==='rebo'){
    const button=element('button',undefined,'primary'),status=element('p',undefined,'ability-status');button.id='team-reset-quota';status.id='team-reset-status';status.setAttribute('role','status');
    button.addEventListener('click',useResetAbility);renderResetControl(button,status);box.append(button,status);
  }else box.append(element('p',ability.status,'ability-status'));
  return box;
}
function renderEmployees(locked) {
  const list=clear('employee-list');
  if(!state.employees.length)list.append(element('p','先去人才市场招聘。新同事会自动加入后续研发。','muted'));
  for(const id of state.employees){
    const employee={...EMPLOYEES[id],...employeeTerms(state,id)},activity=employeeActivity(state,id),row=element('div',undefined,'employee-row');row.dataset.employee=id;
    const growth=rulesFor(state);
    const experience=DIRECTIONS.map((d,i)=>`${DIRECTION_LABELS[d]}${state.employeeExperience[id][i]>=growth.experiencePerPoint*growth.maxAbilityGrowth?'成长已满':`经验 ${state.employeeExperience[id][i]%growth.experiencePerPoint} / ${growth.experiencePerPoint}`}`).join(' · ');
    const text=element('div');text.append(element('strong',employee.name),element('p',abilityText(id)),element('p',experience,'employee-experience'),element('p',`工资 ${employee.salary} 万 / 7 日 · ${activity.label}${state.paused?'（时间暂停）':''}`));
    const dismiss=element('button','辞退');dismiss.dataset.testid=`dismiss-${id}`;dismiss.disabled=locked;
    dismiss.addEventListener('click',()=>showConfirm(`辞退 ${employee.name}？`,`支付 ${money(employee.salary*2)} 赔偿，已产生的成果保留。方案尚未交付时需重选负责人；未完成的额度重置取消且不退款。`,()=>{if(act({type:'dismiss',employeeId:id},'dismiss'))showMessage(`${employee.name}：${FAREWELLS[id]}`);}));
    row.append(text,dismiss);const ability=renderSpecialAbility(id);row.append(ability||element('span',EMPLOYEE_TRAITS[id],'task-detail'));list.append(row);
  }
}
function renderBoard() {
  const direction=$('board-direction').value==='overall'?null:Number($('board-direction').value);
  hideModelTooltip();
  const list=clear('leaderboard');
  board(state,direction).forEach((model,index)=>{
    const row=element('li',undefined,model.company==='player'?'player-row':'');
    const info=element('button',undefined,'model-info-button');info.type='button';info.dataset.modelId=model.id;
    const company=model.company==='player'?settings.companyName:model.company;
    info.setAttribute('aria-label',`${company} ${model.name}，查看模型介绍`);info.setAttribute('aria-expanded','false');
    info.append(element('strong',company),element('span',model.name));
    info.addEventListener('pointerenter',event=>{if(event.pointerType!=='touch')showModelTooltip(info,model);});
    info.addEventListener('pointerleave',event=>{if(tooltipAnchor===info&&!tooltipPinned&&!$('model-tooltip').contains(event.relatedTarget)&&document.activeElement!==info)hideModelTooltip();});
    info.addEventListener('focus',()=>showModelTooltip(info,model));
    info.addEventListener('blur',()=>{if(tooltipAnchor===info&&!tooltipPinned)hideModelTooltip();});
    info.addEventListener('click',()=>{if(tooltipAnchor===info&&tooltipPinned)hideModelTooltip();else showModelTooltip(info,model,true);});
    row.append(element('b',String(index+1)),info,element('strong',String(direction===null?total(model):model.scores[direction]),'board-score'));list.append(row);
  });
}
function renderMoney(locked) {
  const market=marketSummary(state),promotion=mediaCampaign(state);$('audience-summary').textContent=`活跃用户 ${market.users.toLocaleString()} · 付费订阅 ${market.subscribers.toLocaleString()} · 预计订阅 ${market.weeklyIncome} 万 / 7 日`;
  const base=baseSubscriptionIncome(state),established=state.subscriptionGrowthEnabled&&state.funding.includes('overall');
  $('subscription-status').textContent=established?'已取得综合榜首融资，订阅档位已提高；后续掉榜仍保留这个档位，具体金额按当前名次变化。':state.subscriptionGrowthEnabled?'取得综合榜首融资后，订阅档位会提高；之后无需一直第一，也能保留这个档位。':'订阅收入按当前综合名次计算。';
  const {salaries,running}=operatingCosts(state),income=Math.max(0,market.weeklyIncome+state.pendingBonus+state.pendingNews),nextBill=Math.min(rulesFor(state).lastDay,(Math.floor(state.gameDay/7)+1)*7);
  $('next-bill-day').textContent=state.ending?'已完成最终结算':`第 ${nextBill} 日到账`;
  ledger($('bill-preview'),[[established?'当前名次订阅（登顶后档位）':'当前名次基础订阅',money(base)],['媒体带来的订阅',promotion.income?`${money(promotion.income)} / 期，至第 ${promotion.untilDay} 日`:'无有效推广'],[rulesFor(state).mediaIncome?'发布奖励待到账':'发布与报道奖励待到账',money(state.pendingBonus)],['行业消息待调整',`${state.pendingNews>=0?'+':''}${state.pendingNews} 万`],['工资与设备运行',`−${salaries+running} 万`],['下次账单预计净额',`${income-salaries-running>=0?'+':''}${income-salaries-running} 万`,true]]);
  $('compute-price').textContent=`每单位 ${price(state)} 万 · 每 7 日运行费 ${rulesFor(state).computeRunningCost??1} 万 · 容量 ${state.compute} / 8`;
  $('buy-compute').disabled=locked||state.compute>=8;
  $('expansion-detail').textContent=state.seats===8?'新总部已经启用，会议室与八个工位就绪。':'30 万 · 搬入更大的新总部，提供 8 个工位';
  $('expand-office').disabled=locked||state.seats===8;
  const funding=clear('funding-records');
  const fundingRules=rulesFor(state),minimum=fundingRules.fundingPublications;
  const count=id=>minimum?`已发布至少 ${minimum[id]} 款，`:'';
  const names={seed:`${count('seed')}模型达到 ${fundingRules.seedScore} 分：40 万`,specialist:`${count('specialist')}专项榜首：80 万`,overall:`${count('overall')}综合榜首：160 万`};
  for(const [id,text]of Object.entries(names))funding.append(element('p',`${state.funding.includes(id)?'已到账':'尚未达成'} · ${text}`,'fineprint'));
  const bills=clear('bill-history');
  if(!state.bills.length)bills.append(element('p','第一张账单尚未结算。','muted'));
  for(const bill of state.bills.slice(-4).reverse())bills.append(element('p',`第 ${bill.day} 日：收入 ${bill.income}，工资 ${bill.salaries}，运行 ${bill.running}；余额 ${bill.cash} 万。`,'fineprint'));
}
function renderHiring(locked) {
  const list=clear('hiring-list');
  const hints=[...new Set(Object.keys(EMPLOYEES).filter(id=>EMPLOYEES[id].hire&&!recruitmentStatus(state,id).unlocked&&!state.employees.includes(id)&&!state.dismissed.includes(id)).map(id=>recruitmentStatus(state,id).hint))];
  $('hiring-unlocks').textContent=hints.length?`后续人才：${hints.join('；')}`:'所有阶段的人才都已开放。已离职员工本局不会再次应聘。';
  for(const [id,identity]of Object.entries(EMPLOYEES)){
    const employee={...identity,...employeeTerms(state,id)};
    if(!employee.hire)continue;
    const eligibility=recruitmentStatus(state,id);
    if(!eligibility.unlocked&&!state.employees.includes(id)&&!state.dismissed.includes(id))continue;
    const card=element('div',undefined,'candidate');card.append(element('h3',employee.name),element('p',abilityText(id),'employee-abilities'),element('p',`${DIRECTION_LABELS[employee.specialty]} · 招聘 ${employee.hire} 万 · 工资 ${employee.salary} 万`),element('p',specialAbility(state,id)?`${specialAbility(state,id).mode} · ${specialAbility(state,id).copy}`:EMPLOYEE_TRAITS[id]));
    const employed=state.employees.includes(id),dismissed=state.dismissed.includes(id);
    const button=element('button',employed?'已入职':dismissed?'已离职':'招聘');button.dataset.testid=`hire-${id}`;button.disabled=locked||employed||dismissed;
    button.addEventListener('click',()=>act({type:'hire',employeeId:id},'hire',`${employee.name} 入职，新的工位已经亮起。${id==='rebo'?'可在「团队能力」的 Rebo 卡片使用重置额度。':''}`));card.append(button);list.append(card);
  }
}
function renderNews() {
  const list=clear('news-list');
  const scenes=reachedStoryScenes(state,observedStoryEvents);
  if(scenes.length){
    const archive=element('details',undefined,'story-archive');archive.append(element('summary','办公室片段 · 回看'));
    for(const scene of [...scenes].reverse()){
      const button=element('button',`第 ${scene.day} 日 · ${scene.title}`);button.dataset.storyId=scene.id;
      button.addEventListener('click',()=>openStory(scene.id,observedStoryEvents.includes(scene.id)));archive.append(button);
    }
    list.append(archive);
  }
  for(const news of newsFor(state).slice(0,32)){
    const article=element('article',undefined,'news-item');article.dataset.newsId=news.id;
    article.append(element('span',`第 ${news.day} 日`,'eyebrow'),element('h3',news.title),element('p',news.copy));
    if(news.model){const button=element('button',news.model.company==='DeepPeek'?'查看模型资料与成绩':'查看发布会与成绩');button.addEventListener('click',()=>{pauseForReading();present(news.model,null,true);});article.append(button);}
    list.append(article);
  }
}
function renderFeedback(locked) {
  const list=clear('feedback-list'),models=state.models.filter(model=>model.company==='player');
  if(!models.length){list.append(element('p','还没发布模型，暂时没有用户留言。','muted'));}
  for(const model of models.slice(-3).reverse()){
    const box=element('div',undefined,'feedback');box.append(element('strong',`${model.name} · 用户留言`));
    box.append(element('p',userFeedback(model).copy));
    for(const answer of ['已收到','下版处理']){const button=element('button',feedbackResponses[model.id]===answer?`✓ ${answer}`:answer);button.disabled=locked;button.addEventListener('click',()=>{if(writeBlocked)return;const previous=feedbackResponses[model.id];feedbackResponses[model.id]=answer;save();if(writeBlocked){if(previous===undefined)delete feedbackResponses[model.id];else feedbackResponses[model.id]=previous;render();return;}safeSound('ui');renderFeedback(locked);});box.append(button);}list.append(box);
  }
  renderResetControl($('reset-quota'),$('reset-quota-status'));
}
function renderHistory() {
  const target=clear('model-history');
  const models=state.models.filter(model=>model.company==='player').reverse();
  if(!models.length)target.append(element('p','尚未发布。完成研发后需要正式召开发布会。','muted'));
  for(const model of models){const row=element('div',undefined,'history-row');row.append(element('span',`第 ${model.day} 日 · ${model.name} · ${total(model)} 分`));const button=element('button','回看发布');button.addEventListener('click',()=>{pauseForReading();present(model,null,true);});row.append(button);target.append(row);}
}
function releaseCost() { const host=publicationPresenter(state);const cost=rulesFor(state).publicationCost+($('media').value?mediaCost(state,host):0);$('publish-model').disabled=!host||writeBlocked||state.cash<cost;$('publish-error').textContent=host?'':'等待一位员工结束手头工作后即可发布。';$('publish-cost').textContent=`发布费 ${money(rulesFor(state).publicationCost)}${$('media').value?` + 报道费 ${money(mediaCost(state,host))}`:''}，此次支出 ${money(cost)}。训练预算已支付，账上现金 ${money(state.cash)}。`;
  const promotion=mediaCampaign(state),periods=Math.max(0,Math.min(2,Math.floor(rulesFor(state).lastDay/7)-Math.floor(state.gameDay/7)));
  $('media-benefit').textContent=rulesFor(state).mediaIncome?`报道带来接下来 ${periods} 次账单各 ${money(rulesFor(state).mediaIncome)} 订阅收入（共 ${money(rulesFor(state).mediaIncome*periods)}），对应 ${rulesFor(state).mediaIncome*500} 名推广付费用户；提前再投只刷新有效期，不叠加。${promotion.income?`已有推广至第 ${promotion.untilDay} 日。`:''}`:'报道奖励在下一张账单到账。'; }
function openRelease() {
  pauseForReading();if(state.project?.status!=='ready')return;closeDialogs();
  $('release-plan').textContent=`${state.project.name} · 主攻${DIRECTION_LABELS[state.project.focus]} · 综合分 ${total(state.project)}`;
  $('publish-error').textContent='';
  const promptId=`release-prompt:${state.project.id}`;if(!observedStoryEvents.includes(promptId)){observedStoryEvents.push(promptId);save();}
  $('media').value='';releaseCost();$('release-dialog').showModal();
}
function stopPresentation() { for(const timer of presentationTimers)clearTimeout(timer);presentationTimers=[]; }
function stopPresentationAudio() { audio.stop('publish'); if(presentationCue)audio.stop(presentationCue); presentationCue=null; }
function setPresentationInert(active) { $('game').inert=active;document.querySelector('.masthead').inert=active;document.querySelector('footer').inert=active; }
function historicRank(model) {const historical={...state,models:state.models.filter(item=>item.sequence<=model.sequence)};return board(historical).findIndex(item=>item.company===model.company)+1;}
function present(model,result,replay=false) {
  closePlanning();closeDialogs();stopPresentation();stopPresentationAudio();reportShown=false;setPresentationInert(true);
  if(result&&!replay){
    const oldRank=rank(result.before),newRank=rank(result.after);
    presentationCue=result.after.funding.length>result.before.funding.length?'funding':oldRank!==null&&newRank!==null&&oldRank!==newRank?(newRank<oldRank?'rankUp':'rankDown'):null;
  }
  const scene=$('release-scene'),isPlayer=model.company==='player',modelRank=historicRank(model);
  scene.hidden=false;scene.dataset.phase='reveal';scene.dataset.modelId=model.id;scene.classList.toggle('quiet-release',model.company==='DeepPeek');
  scene.querySelector('.stage-art').hidden=model.company==='DeepPeek';
  $('release-tag').textContent=replay?'发布回顾 · 不重复结算':'正式发布 · 成绩已入榜';
  $('release-company').textContent=`${isPlayer?settings.companyName:model.company} · 第 ${model.day} 日`;
  $('release-title').textContent=model.name;
  $('release-subtitle').textContent=isPlayer?`主攻${DIRECTION_LABELS[model.focus]} · 主持人：${EMPLOYEES[model.presenter]?.name||'公司团队'}`:model.company==='DeepPeek'?'模型文件、技术报告和价格表已上线。资料署名：Liang Wenfong。':`${model.company} 公布了 ${model.name} 的评测成绩。`;
  renderScores($('release-scoreboard'),model.scores,model.focus,false);
  drawRelease($('release-art'),{presenter:model.presenter||'avery'});
  $('release-headline').textContent=isPlayer?mediaHeadline(model,modelRank,state.models):`${model.company} · 发布时综合榜第 ${modelRank}`;
  const rows=[['综合成绩',`${total(model)} 分`],['发布时公司综合名次',`第 ${modelRank} 名`]];
  if(result){const beforeRank=rank(result.before),afterRank=rank(result.after),newFunding=result.after.notices.slice(result.before.notices.length).filter(notice=>notice.type==='funding').reduce((value,notice)=>value+notice.amount,0);rows.push(['本次公司名次变化',`${beforeRank===null?'未上榜':`第 ${beforeRank} 名`} → 第 ${afterRank} 名`],['发布与媒体支出',`−${rulesFor(state).publicationCost+(model.media?mediaCost(state,model.presenter):0)} 万`],['本次融资已到账',`+${newFunding} 万`],['本次奖励待下期到账',`+${result.after.pendingBonus-result.before.pendingBonus} 万`],['当前可用现金',money(result.after.cash),true]);}
  else if(isPlayer)rows.push(['当次发布与媒体支出',money(rulesFor(state).publicationCost+(model.media?mediaCost(state,model.presenter):0))],['本次为回看','不扣费，不发钱']);
  if(model.burstBonus!==undefined)rows.push(['火爆额外贡献',`${model.burstBonus} 点主攻属性（已计入成绩）`]);
  if(model.trainingCost!==undefined)rows.push(['训练预算（立项已支付）',money(model.trainingCost)]);
  if(model.mediaUntilDay!==undefined)rows.push(['报道转化',`每次账单加 ${money(model.mediaIncome)}，至第 ${model.mediaUntilDay} 日；推广不叠加`]);
  ledger($('release-ledger'),rows);
  $('release-comment').textContent=isPlayer?playerReleaseCopy(model):rivalCopy(model);
  $('skip-release').hidden=false;
  $('release-title').focus();
  if(!replay)safeSound('publish');
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches||replay)finishPresentation();
  else {presentationTimers.push(setTimeout(()=>{scene.dataset.phase='scores';},900),setTimeout(finishPresentation,2600));}
}
function finishPresentation() { if(reportShown)return; reportShown=true; stopPresentation(); audio.stop('publish'); $('release-scene').dataset.phase='report'; $('skip-release').hidden=true; if(presentationCue)safeSound(presentationCue); }
function closePresentation() {stopPresentation();stopPresentationAudio();$('release-scene').hidden=true;setPresentationInert(false);$('secretary-action').focus();lastFrame=performance.now();showMilestone();scheduleAutomaticResume();}
function showEnding() {
  flushResearchFeedback();
  resumeAfterInterruption=false;
  closePlanning();closeDialogs();stopPresentation();stopPresentationAudio();$('release-scene').hidden=true;setPresentationInert(true);$('ending-scene').hidden=false;
  $('ending-title').textContent=state.ending;$('ending-copy').textContent=ENDING_COPY[state.ending];
  const owned=state.models.filter(model=>model.company==='player');
  ledger($('ending-stats'),[['经营时间',`${state.gameDay} 日`],['发布模型',`${owned.length} 款`],['最后综合名次',rank(state)===null?'未上榜':`第 ${rank(state)} 名`],['获得融资',`${state.funding.length} 项`],['员工与算力',`${state.employees.length} 人 · ${state.compute} 单位`],['用户评价',ratingLabel(state)],['最终现金',money(state.cash),true]]);
  $('ending-unpublished').textContent=state.project?`未发布成果：${state.project.name}，进度 ${state.project.work} / ${RULES.projectWork}。它留在报告里，没有自动上榜。`:'所有已发布成绩都保留在公司记录中。';
  $('ending-title').focus();
}


function closeDialogs() {
  hideTour(); hideModelTooltip();
  for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
}
function openPanel(name) {
  const panel=$(`panel-${name}`);
  if (!panel?.classList.contains('management-panel') || !started) return;
  pauseForReading(); closeDialogs();
  if(name==='finance'&&state.models.some(model=>model.company==='player')&&!observedStoryEvents.includes('guide-finance-reviewed')){observedStoryEvents.push('guide-finance-reviewed');save();}
  render(); panel.querySelector('.panel-message').hidden=true; panel.showModal(); safeSound('ui');
}
function renderGuide() {
  const step=onboardingStep(state,{skipped:settings.guideSkipped,financeReviewed:observedStoryEvents.includes('guide-finance-reviewed')});
  $('guide-dialog').dataset.guideStep=step.id;
  $('game').dataset.guideStep=step.id;
  $('guide-title').textContent=step.title;
  $('guide-copy').textContent=step.copy;
  $('guide-goal').textContent=`当前目标：${step.goal}`;
  $('guide-primary').textContent=step.action;
  $('guide-primary').disabled=writeBlocked;
  $('guide-skip').hidden=!!step.complete;
  $('secretary-summary').textContent=settings.guideSkipped?'需要帮忙就叫我。':step.goal;
  $('secretary-action').textContent=settings.guideSkipped?'查看当前目标':step.action;
  $('secretary-action').disabled=writeBlocked;
  document.querySelectorAll('[data-panel-target]').forEach(button=>button.classList.toggle('current-goal',!tourActive && step.showGuidance && button.dataset.panelTarget===step.target));
  $('time-toggle').classList.toggle('current-goal',!tourActive && step.showGuidance && step.target==='resume');
}
function showGuide() {
  if (!started) return;
  pauseForReading(); closeDialogs(); renderGuide(); $('guide-dialog').showModal();
}
function followGuide() {
  const step=onboardingStep(state,{financeReviewed:observedStoryEvents.includes('guide-finance-reviewed')});
  closeDialogs();
  if (step.target==='release') openRelease();
  else if (step.target==='resume') {act({type:'resume'},'ui');lastFrame=performance.now();}
  else openPanel(step.target);
}
for(const button of document.querySelectorAll('[data-panel-target]'))button.addEventListener('click',()=>openPanel(button.dataset.panelTarget));
for(const button of document.querySelectorAll('[data-close-panel],[data-return-office]'))button.addEventListener('click',()=>{closeDialogs();$('secretary-action').focus();});
$('guide-primary').addEventListener('click',followGuide);
$('secretary-action').addEventListener('click',()=>settings.guideSkipped?showGuide():followGuide());
$('guide-help').addEventListener('click',()=>{settings.guideSkipped=false;saveSettings();showGuide();});
$('guide-skip').addEventListener('click',()=>{settings.guideSkipped=true;saveSettings();$('guide-dialog').close();renderGuide();showMessage('引导已收起，需要时可以随时问小满。');});
$('guide-close').addEventListener('click',()=>$('guide-dialog').close());
$('export-legacy-save').addEventListener('click',()=>{
  try {
    const key=$('legacy-save-slot').value;if(!LEGACY_SAVE_KEYS.includes(key))return;const raw=localStorage.getItem(key);
    if(raw===null){showMessage('没有找到旧版存档。',true);return;}
    const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));
    const link=element('a');link.href=url;link.download=key+'.json';link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    showMessage('旧版存档已导出，浏览器中的原文仍然保留。');
  }catch{showMessage('浏览器无法导出旧版存档，请检查下载权限。',true);}
});


function positionOfficeLabels() {
  const canvas=$('office'),scene=canvas.parentElement,box=canvas.getBoundingClientRect(),bounds=scene.getBoundingClientRect();
  for(const [id,prefix]of [['office-boss-label','boss'],['office-secretary-label','secretary']]){
    const label=$(id),x=Number(canvas.dataset[`${prefix}LabelX`]),y=Number(canvas.dataset[`${prefix}LabelY`]);
    label.hidden=!Number.isFinite(x)||!Number.isFinite(y)||box.width<=0;
    if(label.hidden)continue;
    const left=box.left-bounds.left+x*box.width/canvas.width;
    const top=box.top-bounds.top+y*box.height/canvas.height;
    const half=label.offsetWidth/2;
    label.style.left=`${Math.max(half+3,Math.min(scene.clientWidth-half-3,left))}px`;
    label.style.top=`${Math.max(2,Math.min(scene.clientHeight-label.offsetHeight-2,top))}px`;
  }
}
new ResizeObserver(positionOfficeLabels).observe($('office'));
$('office').addEventListener('office-layout',positionOfficeLabels);
function hideTour() {
  tourActive=false;
  $('office-tour').hidden=true;
  document.body.classList.remove('tour-active');
  delete document.body.dataset.tourStep;
  document.querySelectorAll('.tour-highlight').forEach(node=>node.classList.remove('tour-highlight'));
  if(started)renderGuide();
}
function renderTour() {
  const step=tourStep(settings);
  $('office-tour').hidden=!tourActive;
  document.body.classList.toggle('tour-active',tourActive);
  document.querySelectorAll('.tour-highlight').forEach(node=>node.classList.remove('tour-highlight'));
  if(!tourActive){delete document.body.dataset.tourStep;return;}
  $('office-tour').dataset.tourStep=step.id;document.body.dataset.tourStep=step.id;
  $('tour-count').textContent=`${step.index+1} / ${step.count}`;
  $('tour-title').textContent=step.title;$('tour-copy').textContent=step.copy;
  clear('tour-list');for(const text of step.items)$('tour-list').append(element('li',text));
  $('tour-back').disabled=step.index===0;
  $('tour-next').textContent=step.index===step.count-1?'看看当前任务':'下一步';
  for(const selector of step.targets)document.querySelector(selector)?.classList.add('tour-highlight');
}
function showTour(restart=false) {
  if(!started)return;
  pauseForReading();closeDialogs();
  if(restart)Object.assign(settings,updateTourProgress(settings,'restart'));
  tourActive=true;saveSettings();renderGuide();renderTour();
  $('tour-next').focus({preventScroll:true});
}
function moveTour(action) {
  Object.assign(settings,updateTourProgress(settings,action));saveSettings();
  if(settings.tourCompleted){hideTour();if(action==='next')showGuide();else {showMessage('办公室介绍已收起，可以随时点“办公室介绍”重看。');scheduleAutomaticResume();}}
  else {renderTour();$('tour-title').focus({preventScroll:true});}
}
function hideModelTooltip() {
  const tooltip=$('model-tooltip');
  if(tooltip.hidePopover&&tooltip.matches(':popover-open'))tooltip.hidePopover();
  tooltip.hidden=true;
  if(tooltipAnchor){tooltipAnchor.removeAttribute('aria-describedby');tooltipAnchor.setAttribute('aria-expanded','false');}
  tooltipAnchor=null;tooltipPinned=false;
}
function positionModelTooltip() {
  if(!tooltipAnchor)return;
  const tooltip=$('model-tooltip'),anchor=tooltipAnchor.getBoundingClientRect();
  const width=tooltip.offsetWidth,height=tooltip.offsetHeight,margin=8;
  const left=Math.max(margin,Math.min(innerWidth-width-margin,anchor.left));
  const desiredTop=anchor.bottom+height+margin*2<=innerHeight?anchor.bottom+margin:anchor.top-height-margin;
  const top=Math.max(margin,Math.min(innerHeight-height-margin,desiredTop));
  tooltip.style.left=`${left}px`;tooltip.style.top=`${top}px`;
}
function showModelTooltip(anchor,model,pinned=false) {
  if(tooltipAnchor&&tooltipAnchor!==anchor)hideModelTooltip();
  const tooltip=$('model-tooltip'),intro=modelIntroduction(model);
  tooltipAnchor=anchor;tooltipPinned=pinned||tooltipPinned;
  $('model-tooltip-title').textContent=model.name;
  $('model-tooltip-description').textContent=intro.description;
  $('model-tooltip-focus').textContent=`${model.company==='player'?'主攻':'榜分强项'}：${intro.focus}`;
  $('model-tooltip-release').textContent=intro.release;
  tooltip.hidden=false;
  if(tooltip.showPopover&&!tooltip.matches(':popover-open'))tooltip.showPopover();
  anchor.setAttribute('aria-describedby','model-tooltip');anchor.setAttribute('aria-expanded','true');
  positionModelTooltip();
}
$('tour-next').addEventListener('click',()=>moveTour('next'));
$('tour-back').addEventListener('click',()=>moveTour('back'));
$('tour-skip').addEventListener('click',()=>moveTour('skip'));
$('tour-replay').addEventListener('click',()=>showTour(true));
$('model-tooltip').addEventListener('pointerleave',event=>{if(!tooltipPinned&&!tooltipAnchor?.contains(event.relatedTarget)&&document.activeElement!==tooltipAnchor)hideModelTooltip();});
document.addEventListener('pointerdown',event=>{if(tooltipAnchor&&!tooltipAnchor.contains(event.target)&&!$('model-tooltip').contains(event.target))hideModelTooltip();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&tooltipAnchor){event.preventDefault();event.stopPropagation();hideModelTooltip();}});
$('panel-ranking').addEventListener('close',hideModelTooltip);
$('panel-ranking').querySelector('.panel-content').addEventListener('scroll',hideModelTooltip);
window.addEventListener('resize',()=>{positionOfficeLabels();hideModelTooltip();});

function openStory(id,replay=false){
  if($('story-dialog').open)return;
  const scene=storyScene(state,id,observedStoryEvents);if(!scene)return;
  pauseForReading();closeDialogs();
  activeStory={scene,index:0,choice:selectedStoryChoice(observedStoryEvents,id),replay};
  renderStory();$('story-dialog').showModal();$('story-title').focus();safeSound('news');
}
function renderStory(){
  if(!activeStory)return;
  const {scene,index,choice,replay}=activeStory;
  $('story-dialog').dataset.mode=scene.mode;$('story-dialog').dataset.sceneId=scene.id;
  $('story-tag').textContent=replay?'办公室片段 · 回看':({dialogue:'办公室对话',choice:'老板，你怎么看',reveal:'翻开看看'})[scene.mode];
  $('story-date').textContent=replay?`回看第 ${scene.day} 日片段 · 公司数据为当前第 ${state.gameDay} 日`:`第 ${scene.day} 日 · 办公室片段`;
  $('story-title').textContent=scene.title;$('story-intro').textContent=scene.intro;
  ledger($('story-facts'),(scene.facts||[]).map(fact=>[fact.label,fact.value]));$('story-facts').hidden=!scene.facts?.length;
  const options=clear('story-options');let complete=false;
  $('story-card-title').textContent='';$('story-speaker').textContent='';$('story-count').textContent='';
  if(scene.mode==='dialogue'){
    const line=scene.lines[index];$('story-speaker').textContent=line.speaker;$('story-copy').textContent=line.text;
    $('story-count').textContent=`${index+1} / ${scene.lines.length}`;complete=index===scene.lines.length-1;
  }else if(scene.mode==='reveal'){
    const card=scene.cards[index];$('story-card-title').textContent=card.title;$('story-copy').textContent=card.copy;
    $('story-count').textContent=`${index+1} / ${scene.cards.length}`;complete=index===scene.cards.length-1;
    scene.cards.forEach((card,cardIndex)=>{const button=element('button',card.label);button.setAttribute('aria-pressed',String(index===cardIndex));button.addEventListener('click',()=>{activeStory.index=cardIndex;renderStory();});options.append(button);});
  }else{
    const picked=scene.choices.find(item=>item.id===choice);
    $('story-speaker').textContent=picked?'':'请选择';$('story-copy').textContent=picked?picked.reply:'点一个选项，看看接下来发生什么。';complete=!!picked;
    for(const item of scene.choices){
      const button=element('button',item.label);button.dataset.storyChoice=item.id;button.setAttribute('aria-pressed',String(item.id===choice));button.disabled=!!picked||(!replay&&writeBlocked);
      button.addEventListener('click',()=>{
        if(!activeStory||(!activeStory.replay&&writeBlocked))return;
        const previous=[...observedStoryEvents];
        if(!activeStory.replay){observedStoryEvents.push(`story-pick:${scene.id}:${item.id}`);if(!save()&&writeBlocked){observedStoryEvents=previous;return;}}
        activeStory.choice=item.id;renderStory();$('story-next').focus();
      });options.append(button);
    }
  }
  $('story-outro').textContent=scene.outro||'';$('story-outro').hidden=!complete;
  $('story-next').hidden=scene.mode==='choice'&&!complete;
  $('story-next').textContent=complete?'回到办公室':scene.mode==='reveal'?'翻开下一张':'接着听';
  $('story-cta').hidden=!complete||!scene.cta;$('story-cta').textContent=scene.cta?.label||'';
}
$('story-next').addEventListener('click',()=>{
  if(!activeStory)return;
  const {scene,index}=activeStory,steps=scene.mode==='dialogue'?scene.lines:scene.mode==='reveal'?scene.cards:[];
  if(index<steps.length-1){activeStory.index++;renderStory();}else $('story-dialog').close();
});
$('story-skip').addEventListener('click',()=>$('story-dialog').close());
$('story-cta').addEventListener('click',()=>{const panel=activeStory?.scene.cta?.panel;if(!panel)return;$('story-dialog').close();openPanel(panel);});
$('story-dialog').addEventListener('close',()=>{
  const finished=activeStory;activeStory=null;
  if(finished&&!finished.replay&&!writeBlocked&&!observedStoryEvents.includes(finished.scene.id)){observedStoryEvents.push(finished.scene.id);save();}
  render();scheduleAutomaticResume();
});

function renderFeedbackImpact(notice){
  const target=clear('feedback-metrics');target.hidden=notice.kind!=='feedback';if(target.hidden)return;
  const impact=notice.impact;
  if(!impact){const now=marketSummary(state);ledger(target,[['当前活跃用户',now.users.toLocaleString()],['当前付费订阅',now.subscribers.toLocaleString()],['预计订阅收入',`${now.weeklyIncome} 万 / 7 日`],['当前用户评分',ratingLabel(state)]]);return;}
  const {before,after,nextBillIncome}=impact;
  const change=(a,b,suffix='')=>`${a.toLocaleString()} → ${b.toLocaleString()}${suffix}（${b-a>=0?'+':''}${(b-a).toLocaleString()}${suffix}）`;
  ledger(target,[['活跃用户',change(before.users,after.users)],['付费订阅',change(before.subscribers,after.subscribers)],['预计订阅收入',change(before.weeklyIncome,after.weeklyIncome,' 万 / 7 日')],['用户评分',`${before.ratingTenths===null?'暂无评价':(before.ratingTenths/10).toFixed(1)} → ${(after.ratingTenths/10).toFixed(1)} / 5`],['下期预计总收入',`${nextBillIncome} 万（含发布与报道奖励）`]]);
}
function showNextNotification(){
  const next=unreadNotifications(state,observedStoryEvents)[0];
  if(next?.kind==='ready'){openRelease();return true;}
  if(showMilestone())return true;
  if(!next)return false;
  if(next.kind==='story'){openStory(next.id);return true;}
  activeNotification=next;pauseForReading();
  $('notice-category').textContent=({feedback:'用户反馈',media:'媒体报道',farewell:'离职告别',ability:'员工能力',news:'行业快讯'})[next.kind];
  $('notice-icon').textContent=next.kind==='farewell'?'“':next.kind==='media'?'▧':'▤';
  renderFeedbackImpact(next);
  $('notice-date').textContent=`第 ${next.day} 日`;$('notice-title').textContent=next.title;$('notice-copy').textContent=next.copy;
  $('notice-dialog').dataset.kind=next.kind;
  $('notice-next-version').hidden=next.kind!=='feedback';$('notice-open-model').hidden=!next.model;
  $('notice-dialog').showModal();if(next.kind!=='ability')safeSound('news');return true;
}
$('notice-close').addEventListener('click',()=>$('notice-dialog').close());
$('notice-next-version').addEventListener('click',()=>{if(activeNotification?.modelId)feedbackResponses[activeNotification.modelId]='下版处理';$('notice-dialog').close();});
$('notice-open-model').addEventListener('click',()=>{const model=activeNotification?.model;$('notice-dialog').close();if(model)present(model,null,true);});
$('notice-dialog').addEventListener('close',()=>{
  if(activeNotification&&!observedStoryEvents.includes(activeNotification.id)){observedStoryEvents.push(activeNotification.id);save();}
  activeNotification=null;render();scheduleAutomaticResume();
});

function openPlanning(){
  if(!state.project||state.project.status!=='planning')return;
  $('planning-contribution-scores').dataset.scores='';clear('planning-contribution-scores');
  hideTour();closeDialogs();$('planning-scene').hidden=false;setPresentationInert(true);renderPlanning();$('planning-title').focus();
}
function closePlanning(){
  clearTimeout(planningRevealTimer);planningRevealTimer=null;$('planning-scene').hidden=true;setPresentationInert(false);lastFrame=performance.now();scheduleAutomaticResume();
}
function renderPlanningPreview(){
  const project=state.project;if(!project||$('planning-scene').hidden)return;
  const target=project.planScores||proposalScores(state);if(!target)return;
  const ratio=project.planScores?1:Math.min(1,(project.planProgress+dayProgressMs/(RULES.secondsPerDay*1000))/RULES.planningDays);
  const values=target.map((score,index)=>Math.floor((score-project.initialScores[index])*ratio));
  renderScores($('planning-contribution-scores'),values,project.focus);
}
function renderPlanning(){
  if($('planning-scene').hidden)return;
  const project=state.project;if(!project||state.ending){closePlanning();return;}
  const done=!!project.planScores;
  $('planning-title').textContent=project.name;$('planning-person-name').textContent=`${EMPLOYEES[project.plannerId]?.name||'待重新选择'} · 方案负责人`;
  $('planning-stage-title').textContent=done?'方案完成，团队开始研发':'正在设计整体方案';
  $('planning-copy').textContent=done?'方案已交付，下面是三项初始属性。团队接下来开始数据处理。':productionSummary(state).blockedReason||'负责人正在选训练资料、列评测题目，其他同事等方案定下来后开工。';
  $('planning-progress').value=project.planProgress;$('planning-progress-label').textContent=`设计进度 ${project.planProgress} / ${RULES.planningDays} 日`;
  $('planning-result').hidden=!done;if(done)renderScores($('planning-initial-scores'),project.planScores,project.focus);renderPlanningPreview();
  $('planning-time-toggle').textContent=state.paused?'▶ 继续设计':'Ⅱ 暂停';$('planning-time-toggle').disabled=writeBlocked||project.plannerId===null;
  $('planning-speed').value=String(settings.speed);$('planning-day').textContent=`第 ${state.gameDay} 日`;
  if(done&&!planningRevealTimer)planningRevealTimer=setTimeout(closePlanning,1600);
}
$('view-planning').addEventListener('click',openPlanning);$('planning-close').addEventListener('click',closePlanning);
$('planning-settings').addEventListener('click',()=>{closePlanning();$('settings-open').click();});
$('planning-time-toggle').addEventListener('click',toggleTime);
$('planning-speed').addEventListener('change',()=>{settings.speed=Number($('planning-speed').value);saveSettings();$('speed').value=String(settings.speed);});
function showMilestone(){
  if(writeBlocked||state.ending||document.hidden||document.querySelector('dialog[open]'))return false;
  const grants=state.notices.filter(notice=>notice.type==='funding');
  const first=grants[0],top=grants.find(notice=>notice.id==='overall');
  const fundingUnread=first&&!observedStoryEvents.includes('milestone-first-funding');
  const topUnread=top&&!observedStoryEvents.includes('milestone-first-top');
  if(!fundingUnread&&!topUnread)return false;
  const day=fundingUnread?first.day:top.day;
  const champion=topUnread&&top.day===day;
  const ids=[];if(fundingUnread)ids.push('milestone-first-funding');if(champion)ids.push('milestone-first-top');
  const grant=grants.filter(notice=>notice.day===day).reduce((sum,notice)=>sum+notice.amount,0);
  activeMilestone={ids,champion};pauseForReading();
  $('event-title').textContent=champion?'综合榜第一，融资到账':'首笔融资，到账了';
  $('event-copy').textContent=champion?`第 ${day} 日，公司以综合榜第一的成绩达成融资条件，当天到账 ${grant} 万。老板让大家赶紧截图。小满：“把日期带上，别家还会发新模型。”`:`第 ${day} 日，融资 ${grant} 万到账。老板打开了显卡报价单。小满：“工资还得付，先算算能买多少。”`;
  drawCelebration($('event-art'),activeMilestone);$('event-dialog').showModal();return true;
}
$('event-close').addEventListener('click',()=>$('event-dialog').close());
$('event-dialog').addEventListener('close',()=>{
  if(activeMilestone){for(const id of activeMilestone.ids)if(!observedStoryEvents.includes(id))observedStoryEvents.push(id);save();}
  activeMilestone=null;scheduleAutomaticResume();
});

$('brand-logo').addEventListener('error',()=>{$('brand-logo').hidden=true;});
$('company-name').value=settings.companyName;
$('company-form').addEventListener('submit',async event=>{event.preventDefault();if(writeBlocked)return;settings.companyName=$('company-name').value.trim().slice(0,30)||'明日智能';newGameConfirmed();const enabled=await audio.enable();settings.sound=enabled;saveSettings();renderAudio();});
$('project-form').addEventListener('submit',event=>{event.preventDefault();if(act({type:'createProject',name:$('model-name').value,focus:$('focus').value,plannerId:selectedPlanner('project-planner')},'projectStart')){closeDialogs();act({type:'resume'});openPlanning();}});
$('project-planner').addEventListener('change',updatePlannerSelection);
$('replacement-planner').addEventListener('change',updatePlannerSelection);
$('focus').addEventListener('change',renderPlannerChoices);
$('planner-reassignment').addEventListener('submit',event=>{event.preventDefault();if(act({type:'selectPlanner',employeeId:selectedPlanner('replacement-planner')})){closeDialogs();act({type:'resume'});openPlanning();}});
$('time-toggle').addEventListener('click',()=>{toggleTime();if(settings.sound&&!audio.isEnabled())audio.enable().then(renderAudio);});
$('speed').addEventListener('change',()=>{settings.speed=Number($('speed').value);saveSettings();safeSound('ui');});
$('board-direction').addEventListener('change',()=>{renderBoard();safeSound('ui');});
$('buy-compute').addEventListener('click',()=>act({type:'buyCompute',amount:1},'purchase','新设备到位。可用算力增加，运行费也会增加。'));
$('expand-office').addEventListener('click',()=>act({type:'expand'},'purchase','已搬入新的城市总部，八个工位准备就绪。'));
$('reset-quota').addEventListener('click',useResetAbility);
$('open-release').addEventListener('click',openRelease);
$('media').addEventListener('change',releaseCost);
$('cancel-release').addEventListener('click',()=>$('release-dialog').close());
$('release-form').addEventListener('submit',event=>{event.preventDefault();const action={type:'publish'};if($('media').value)action.media=$('media').value;const result=act(action);if(result){$('release-dialog').close();const model=state.models.findLast(item=>item.company==='player');present(model,result);}else{$('publish-error').textContent=$('action-message').textContent;}});
$('skip-release').addEventListener('click',finishPresentation);$('release-continue').addEventListener('click',closePresentation);
$('confirm-cancel').addEventListener('click',()=>{$('confirm-dialog').close();confirmAction=null;});
$('confirm-accept').addEventListener('click',()=>{const callback=confirmAction;confirmAction=null;$('confirm-dialog').close();callback?.();});
$('confirm-dialog').addEventListener('cancel',()=>{confirmAction=null;});
$('settings-open').addEventListener('click',()=>{pauseForReading();closeDialogs();$('settings-dialog').showModal();});
$('settings-close').addEventListener('click',()=>$('settings-dialog').close());
function renderAudio(){$('audio-toggle').textContent=audio.isEnabled()?'关闭全部声音':'开启声音';}
$('audio-toggle').addEventListener('click',async()=>{if(audio.isEnabled()){audio.disable();settings.sound=false;}else settings.sound=await audio.enable();saveSettings();renderAudio();});
for(const [id,key,setter]of [['music-volume','music',value=>audio.setMusicVolume(value)],['effects-volume','effects',value=>audio.setEffectsVolume(value)]]){$(id).value=settings[key];$(id).addEventListener('input',()=>{settings[key]=Number($(id).value);setter(settings[key]/100);saveSettings();});}
$('new-game').addEventListener('click',requestNewGame);$('ending-new').addEventListener('click',requestNewGame);$('discard-save').addEventListener('click',requestNewGame);
$('reload-save').addEventListener('click',()=>location.reload());
$('view-ending').addEventListener('click',showEnding);
$('ending-office').addEventListener('click',()=>{$('ending-scene').hidden=true;setPresentationInert(false);render();});
window.addEventListener('storage',event=>{if(event.key!==SAVE_KEY&&event.key!==null)return;blockConflictingSave();});
document.addEventListener('visibilitychange',()=>{audio.setBackgrounded(document.hidden);if(document.hidden){pauseForReading();save();}lastFrame=performance.now();if(!document.hidden)scheduleAutomaticResume();});
window.addEventListener('pagehide',()=>{closingTab=true;pauseForReading();save();});
window.addEventListener('pageshow',()=>{closingTab=false;lastFrame=performance.now();scheduleAutomaticResume();});
function updateDevelopmentScores(){
  if(!state.project)return;
  const target=$('development-attributes'),scores=researchFeedback.scores(state),counters=target.querySelectorAll('.score-cell>strong');
  if(counters.length!==3){renderScores(target,scores,state.project.focus,false);return;}
  target.dataset.scores=scores.join(',')+':'+state.project.focus;
  counters.forEach((counter,index)=>{counter.textContent=String(scores[index]);counter.dataset.target=String(scores[index]);});
}
function renderTimeButton(){
  const playingTail=state.project?.status==='ready'&&researchFeedback.pending&&resumeAfterInterruption;
  const label=state.ending?'本局已结束':state.paused&&!playingTail?'▶ 继续经营':'Ⅱ 暂停';
  if($('time-toggle').textContent!==label)$('time-toggle').textContent=label;
}
function updateDevelopmentProgress(){
  if(!state.project)return;
  const {phaseLabel,phaseTotal,displayProgress}=developmentProgress(state,dayProgressMs);
  const label=`${phaseLabel} · ${Math.floor(displayProgress/(phaseTotal||1)*100)}%`;
  for(const id of ['development-stage','project-stage-label'])if($(id).textContent!==label)$(id).textContent=label;
  for(const id of ['development-progress','research-progress']){$(id).max=phaseTotal||1;$(id).value=displayProgress;}
}
function flushResearchFeedback(){
  researchFeedback.flush();office.clearPoints();updateDevelopmentScores();
}
function tick(now) {
  const elapsed=Math.max(0,now-lastFrame); lastFrame=now;
  if(started&&!writeBlocked&&!document.hidden&&!closingTab&&!state.ending&&!state.paused){
    const before=state, beforeProgress=dayProgressMs, beforeObserved=[...observedStoryEvents];
    const dayMs=rulesFor(state).secondsPerDay*1000;
    const pacingPoints=!reducedMotion.matches&&(researchFeedback.pending||['planning','researching'].includes(state.project?.status));
    const clockElapsed=pacingPoints?researchFeedback.clockElapsed(elapsed,dayProgressMs,dayMs,settings.speed):elapsed;
    const result=advanceClock(state,dayProgressMs,clockElapsed,settings.speed);
    state=result.state; dayProgressMs=result.dayProgressMs;
    if(state!==before){
      const hasNews=observeNews(before); save();
      if(writeBlocked)restoreBeforeConflict(before,beforeProgress,beforeObserved);
      else {researchFeedback.sync(state,result.presentationEvents,rulesFor(state).secondsPerDay*1000/settings.speed);if(reducedMotion.matches)researchFeedback.flush();render();if(hasNews)safeSound('news');effectsFor(before);scheduleAutomaticResume();}
    } else if(now-lastFractionSave>5000){
      save(); lastFractionSave=now;
      if(writeBlocked)restoreBeforeConflict(before,beforeProgress,beforeObserved);
    }
  }
  const wasPending=researchFeedback.pending;
  const pointPlayback=started&&!writeBlocked&&!document.hidden&&!closingTab&&!state.ending&&!tourActive&&!document.querySelector('dialog[open]')&&$('planning-scene').hidden&&$('release-scene').hidden&&(!state.paused||(state.project?.status==='ready'&&resumeAfterInterruption));
  if(reducedMotion.matches&&researchFeedback.pending)flushResearchFeedback();
  const points=researchFeedback.advance(elapsed,pointPlayback);
  office.step(elapsed,pointPlayback);office.showPoints(points);
  if(points.length)updateDevelopmentScores();
  if(wasPending&&!researchFeedback.pending){updateDevelopmentScores();scheduleAutomaticResume();}
  if(pointPlayback&&state.project){
    const hot=$('office').dataset.burstEmployees;
    $('office-caption').textContent=hot?`${hot.split(',').map(id=>EMPLOYEES[id].name).join('、')} 火爆中 · 连续贡献 +1`:researchFeedback.pending?'图标每跳一次，对应属性 +1':state.project.status==='ready'?'研发完成，准备发布':state.project.status==='researching'?'全员自动研发中':'负责人正在设计方案';
  }
  renderTimeButton();
  $('office').dataset.feedbackPending=String(researchFeedback.pending);
  if(!$('planning-scene').hidden)renderPlanningPreview();
  updateDevelopmentProgress();
  const frame=Math.floor(now/240);if(!$('planning-scene').hidden&&frame!==lastPlanFrame){lastPlanFrame=frame;drawPlanning($('planning-art'),{employeeId:state.project?.plannerId||'avery',frame:state.paused?0:frame,done:!!state.project?.planScores});}
  $('day-progress').value=dayProgressMs; requestAnimationFrame(tick);
}
restore();render();renderAudio();if(started&&state.ending)showEnding();else if(started&&!settings.tourCompleted)showTour();scheduleAutomaticResume();requestAnimationFrame(tick);
