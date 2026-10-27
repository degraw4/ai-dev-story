import { DIRECTIONS, RULES, EMPLOYEES, STAGES, CAMPAIGN_PROFILES, DEFAULT_CAMPAIGN_PROFILE, mapCampaignDay, SUBSCRIPTION_INCOME } from './content.js';

const sum = values => values.reduce((total, value) => total + value, 0);
export const total = model => sum(model.scores);
function profileFor(state) {
  const profile = state.campaignProfile ?? 'classic168';
  if (!Object.hasOwn(CAMPAIGN_PROFILES,profile)) throw new Error('unknown-campaign-profile');
  return profile;
}
export function rulesFor(state) { return CAMPAIGN_PROFILES[profileFor(state)].rules; }
export function rivalsFor(state) { return CAMPAIGN_PROFILES[profileFor(state)].rivals; }
export function releasesFor(state) { return CAMPAIGN_PROFILES[profileFor(state)].releases; }
export function campaignDay(state, classicDay) { return mapCampaignDay(profileFor(state),classicDay); }
export function price(stateOrDay) {
  const state = typeof stateOrDay === 'number' ? {campaignProfile:'classic168',gameDay:stateOrDay} : stateOrDay;
  const day=state.gameDay, at=classicDay=>campaignDay(state,classicDay);
  const base=day >= at(28) && day <= at(35) ? 9 : day >= at(84) && day <= at(90) ? 16 : day >= at(140) && day <= at(147) ? 10 : 12;
  return Math.ceil(base*(rulesFor(state).computePriceMultiplier??1));
}
export function employeeTerms(state,id) {
  const employee=EMPLOYEES[id];
  return rulesFor(state).trainingBase ? {hire:Math.ceil(employee.hire*1.5),salary:employee.salary+1} : {hire:employee.hire,salary:employee.salary};
}
export function trainingCost(state) {
  const rules=rulesFor(state);
  return rules.trainingBase?Math.min(rules.trainingCap,rules.trainingBase+owned(state).length*rules.trainingStep):0;
}
export function mediaCost(state,presenter=publicationPresenter(state)) {
  const rules=rulesFor(state);
  return presenter==='alex'?(rules.mediaAlexPrice??3):(rules.mediaPrice??6);
}
export function operatingCosts(state) {
  return {salaries:sum(state.employees.map(id=>employeeTerms(state,id).salary)),running:state.compute*(rulesFor(state).computeRunningCost??1)};
}
export function mediaCampaign(state,day=(Math.floor(state.gameDay/rulesFor(state).billDays)+1)*rulesFor(state).billDays) {
  const model=state.models.findLast(model=>model.company==='player'&&model.media&&model.mediaUntilDay!==undefined);
  if(!model||day>model.mediaUntilDay||day>rulesFor(state).lastDay)return {income:0,untilDay:null,modelId:null};
  return {income:rulesFor(state).mediaIncome,untilDay:model.mediaUntilDay,modelId:model.id};
}
function initialState(profile = 'classic168') {
  const configuration=CAMPAIGN_PROFILES[profile];
  if(!configuration)throw new Error('unknown-campaign-profile');
  return { campaignProfile:profile, gameDay: 0, paused: true, cash: configuration.rules.initialCash, seats: 4, compute: 2, employees: ['avery','jules'], dismissed: [], assignments: {}, project: null, nextProjectId: 1, knowledge: DIRECTIONS.map(() => 25), models: configuration.rivals.map((rival, index) => ({ id: `initial-${index}`, company: rival.company, name: rival.models[0].name, scores: [...rival.models[0].scores], day: 0, sequence: index + 1 })), nextSequence: 6, funding: [], pendingBonus: 0, pendingNews: 0, ratingTenths: 21, appliedEvents: [], bills: [], notices: [], acceptedActions: [], growthEnabled:false, employeeExperience:Object.fromEntries(Object.keys(EMPLOYEES).map(id=>[id,DIRECTIONS.map(()=>0)])), ending: null };
}
export function createState({profile=DEFAULT_CAMPAIGN_PROFILE,burst=['budget112','startup112'].includes(profile),subscriptionGrowth=profile==='startup112'}={}) {
  const result=applyAction(initialState(),{type:'beginCampaign',profile});
  if(!result.ok)throw new Error(result.error);
  let state=result.state;
  for(const type of [burst&&'enableBurst',subscriptionGrowth&&'enableSubscriptionGrowth'])if(type){
    const enabled=applyAction(state,{type});
    if(!enabled.ok)throw new Error(enabled.error);
    state=enabled.state;
  }
  return state;
}
export function employeeAbilities(state, employeeId) {
  return EMPLOYEES[employeeId].abilities.map((base,index)=>base+Math.floor((state.employeeExperience?.[employeeId]?.[index]||0)/rulesFor(state).experiencePerPoint));
}
function addExperience(state,employeeId,focus,work){
  if(!state.growthEnabled)return;
  const values=state.employeeExperience[employeeId];
  DIRECTIONS.forEach((direction,index)=>{values[index]=Math.min(rulesFor(state).experiencePerPoint*rulesFor(state).maxAbilityGrowth,values[index]+work*(direction===focus?2:1));});
}
function recordGrowth(state,employeeId,before){
  const abilities=employeeAbilities(state,employeeId),gains=abilities.map((value,index)=>value-before[index]);
  if(gains.some(value=>value>0))state.notices.push({day:state.gameDay,type:'employee-growth',employeeId,gains,abilities});
}
export function board(state, direction = null) {
  const getScore = model => direction === null ? total(model) : model.scores[direction];
  const selected = new Map();
  for (const model of state.models) {
    const current = selected.get(model.company);
    if (!current || getScore(model) > getScore(current) || getScore(model) === getScore(current) && model.sequence < current.sequence) selected.set(model.company, model);
  }
  return [...selected.values()].sort((a,b) => getScore(b)-getScore(a) || a.sequence-b.sequence);
}
export function rank(state, direction = null) { const index = board(state,direction).findIndex(model => model.company === 'player'); return index < 0 ? null : index + 1; }
function owned(state) { return state.models.filter(model => model.company === 'player'); }
export function baseSubscriptionIncome(state) {
  const currentRank=rank(state);if(currentRank===null)return 0;
  const rates=state.subscriptionGrowthEnabled&&state.funding.includes('overall')?SUBSCRIPTION_INCOME.established:SUBSCRIPTION_INCOME.standard;
  return rates[currentRank-1];
}
export function marketSummary(state) {
  const published=owned(state);
  if(!published.length)return {users:0,subscribers:0,weeklyIncome:0,ratingTenths:null};
  const weeklyIncome=baseSubscriptionIncome(state)+mediaCampaign(state).income;
  const subscribers=weeklyIncome*500;
  return {users:subscribers*10+published.length*1200+(rulesFor(state).trainingBase?0:published.filter(model=>model.media).length*2500),subscribers,weeklyIncome,ratingTenths:state.ratingTenths};
}
// Unlock progress only; employment, dismissed status, seats and cash are separate hire checks.
export function recruitmentStatus(state, employeeId) {
  const employee = EMPLOYEES[employeeId];
  if (!employee) return { unlocked: false, hint: '无此候选人' };
  const requirements = [];
  if (state.gameDay < employee.unlockDay) requirements.push(`第 ${employee.unlockDay} 日开放`);
  if (owned(state).length < employee.unlockPublications) requirements.push(`正式发布 ${employee.unlockPublications} 款模型后开放`);
  return { unlocked: requirements.length === 0, hint: requirements.join('，') || '已开放' };
}
function availableEmployees(state) { return state.employees.filter(id => state.assignments[id]?.kind !== 'reset'); }
function teamAbilities(state,employeeIds) {
  return DIRECTIONS.map((_,index)=>sum(employeeIds.map(id=>employeeAbilities(state,id)[index])));
}
export function publicationPresenter(state) {
  const available=availableEmployees(state);
  return available.includes('alex')?'alex':available.includes(state.project?.plannerId)?state.project.plannerId:available[0]??null;
}
export function proposalScores(state) {
  const project=state.project,employee=EMPLOYEES[project?.plannerId];
  return employee?project.initialScores.map((score,index)=>score+employeeAbilities(state,project.plannerId)[index]*(DIRECTIONS[index]===project.focus?2:1)):null;
}
export function productionSummary(state) {
  const project = state.project;
  const result = { phaseId:'idle', phaseLabel:'等待立项', phaseProgress:0, phaseTotal:0, totalWork:0, progressPerDay:0, usedCompute:0, activeEmployeeIds:[], teamAbilities:DIRECTIONS.map(()=>0), estimatedDays:0, blockedReason:'' };
  if (!project) return result;
  result.totalWork = project.work;
  if (project.status === 'ready') return {...result,phaseId:'ready',phaseLabel:'等待发布',phaseProgress:rulesFor(state).projectWork,phaseTotal:rulesFor(state).projectWork};
  const available = availableEmployees(state);
  const speed = available.length ? available.length + state.compute + (available.includes('boris') ? 2 : 0) + (available.includes('tim') ? 1 : 0) : 0;
  if (project.status === 'planning') {
    const plannerAvailable = available.includes(project.plannerId);
    const blockedReason = project.plannerId === null ? '请重新选择方案负责人' : !plannerAvailable ? '方案负责人正在处理额度重置' : '';
    return {...result,phaseId:'planning',phaseLabel:'设计方案',phaseProgress:project.planProgress,phaseTotal:rulesFor(state).planningDays,progressPerDay:plannerAvailable ? 1 : 0,activeEmployeeIds:plannerAvailable ? [project.plannerId] : [],estimatedDays:plannerAvailable && speed ? rulesFor(state).planningDays-project.planProgress+STAGES.reduce((days,stage)=>days+Math.ceil(stage.work/speed),0) : null,blockedReason};
  }
  const stage = STAGES[project.stageIndex];
  return {...result,phaseId:stage.id,phaseLabel:stage.label,phaseProgress:project.stageWork,phaseTotal:stage.work,progressPerDay:speed,usedCompute:available.length ? state.compute : 0,activeEmployeeIds:available,teamAbilities:teamAbilities(state,available),estimatedDays:speed ? Math.ceil((stage.work-project.stageWork)/speed)+STAGES.slice(project.stageIndex+1).reduce((days,next)=>days+Math.ceil(next.work/speed),0) : null,blockedReason:available.length ? '' : '需要至少一名可工作的员工'};
}
export function employeeActivity(state, employeeId) {
  let kind = 'idle', label = '等待项目';
  if (state.employees.includes(employeeId)) {
    if (state.assignments[employeeId]?.kind === 'reset') { kind = 'reset'; label = '重置额度'; }
    else if (state.project?.status === 'planning' && state.project.plannerId === employeeId) { kind = 'planning'; label = '设计方案'; }
    else if (state.project?.status === 'researching') { kind = 'research'; label = STAGES[state.project.stageIndex].label; }
  }
  return {kind,label,active:kind !== 'idle' && !state.paused && !state.ending};
}
export function quotaResetStatus(state) {
  const reason=state.ending?'game-ended':!state.employees.includes('rebo')?'rebo':!owned(state).length?'no-users':state.ratingTenths>=50?'rating-full':state.assignments.rebo?.kind==='reset'?'reset-running':state.cash<4?'cash':null;
  return {available:reason===null,reason,cost:4,finishDay:state.assignments.rebo?.finishDay??state.gameDay+1,ratingAfter:Math.min(50,state.ratingTenths+5)};
}
export function usedCompute(state) { return productionSummary(state).usedCompute; }
function progressProject(state,presentationEvents) {
  const project = state.project;
  if (!project || project.status === 'ready') return;
  const summary = productionSummary(state);
  if (!summary.activeEmployeeIds.length) return;
  if (project.status === 'planning') {
    project.planProgress++;
    state.notices.push({day:state.gameDay,type:'planning',employeeId:project.plannerId,projectId:project.id,progress:project.planProgress});
    if (project.planProgress === rulesFor(state).planningDays) {
      project.planScores = proposalScores(state);
      project.scores = [...project.planScores]; project.status = 'researching';
      state.notices.push({day:state.gameDay,type:'plan-ready',employeeId:project.plannerId,projectId:project.id,scores:[...project.planScores]});
      const before=employeeAbilities(state,project.plannerId);addExperience(state,project.plannerId,project.focus,4);recordGrowth(state,project.plannerId,before);
    }
    return;
  }
  const stage = STAGES[project.stageIndex];
  const work = Math.min(summary.progressPerDay,stage.work-project.stageWork);
  const gains=DIRECTIONS.map(()=>0);
  const previousAbilities=Object.fromEntries(summary.activeEmployeeIds.map(id=>[id,employeeAbilities(state,id)]));
  // Unit work, rather than frame/day batching, owns both experience and score.
  // Thus buying compute cannot change the result merely by grouping days.
  for(let unit=0;unit<work;unit++){
    const workUnit=project.work+unit;
    const burst=project.burst;
    if(burst&&workUnit===burst.startWork&&burst.employeeId===null){
      burst.employeeId=summary.activeEmployeeIds[(project.id-1)%summary.activeEmployeeIds.length];
    }
    const burstActive=!!burst&&workUnit>=burst.startWork&&workUnit<burst.endWork&&summary.activeEmployeeIds.includes(burst.employeeId);
    DIRECTIONS.forEach((direction,index)=>{
      // The employee who completes a shared score unit submits its point.
      // Rotate contribution order by absolute work, never by calendar day.
      const offset=(project.id+workUnit+index)%summary.activeEmployeeIds.length;
      for(let step=0;step<summary.activeEmployeeIds.length;step++){
        const employeeId=summary.activeEmployeeIds[(offset+step)%summary.activeEmployeeIds.length];
        let ability=employeeAbilities(state,employeeId)[index];
        if(stage.id==='evaluation'&&direction===project.focus&&employeeId==='max')ability+=4;
        const numerator=project.scoreRemainders[index]+ability*(direction===project.focus?2:1);
        const gain=Math.floor(numerator/rulesFor(state).scoreDivisor);
        project.scoreRemainders[index]=numerator%rulesFor(state).scoreDivisor;
        project.scores[index]+=gain;gains[index]+=gain;
        if(presentationEvents)for(let point=0;point<gain;point++)presentationEvents.push({type:'research-point',projectId:project.id,workUnit,employeeId,direction,amount:1,burst:burstActive&&employeeId===burst.employeeId,source:'research'});
      }
    });
    if(burstActive&&burst.earned<4){
      const index=DIRECTIONS.indexOf(project.focus);
      project.scores[index]++;gains[index]++;burst.earned++;
      if(presentationEvents)presentationEvents.push({type:'research-point',projectId:project.id,workUnit,employeeId:burst.employeeId,direction:project.focus,amount:1,burst:true,source:'burst'});
    }
    for(const id of summary.activeEmployeeIds)addExperience(state,id,project.focus,1);
  }
  for(const id of summary.activeEmployeeIds)recordGrowth(state,id,previousAbilities[id]);
  project.work += work; project.stageWork += work;
  state.notices.push({day:state.gameDay,type:'research',projectId:project.id,focus:project.focus,stageId:stage.id,employeeIds:[...summary.activeEmployeeIds],work,gains,compute:summary.usedCompute});
  if (project.stageWork === stage.work) {
    state.notices.push({day:state.gameDay,type:'stage-complete',projectId:project.id,stageId:stage.id});
    project.stageIndex++; project.stageWork = 0;
    if (project.stageIndex === STAGES.length) {
      project.status = 'ready'; state.paused = true;
      state.notices.push({day:state.gameDay,type:'ready',projectId:project.id});
    }
  }
}
function grantFunding(state) {
  const published=owned(state),rules=rulesFor(state);
  const eligible = [ ['seed', published.some(model => total(model) >= rules.seedScore), 40], ['specialist', DIRECTIONS.some((_,index) => rank(state,index) === 1), 80], ['overall', rank(state) === 1, 160] ];
  for (const [id, condition, amount] of eligible) if (condition && published.length>=(rules.fundingPublications?.[id]??0) && !state.funding.includes(id)) { state.funding.push(id); state.cash += amount; state.notices.push({ day: state.gameDay, type: 'funding', id, amount }); }
}
function endIfNeeded(state) {
  if (state.cash < 0) state.ending = '发布会照常';
  else if (state.gameDay === rulesFor(state).lastDay) state.ending = rank(state) === 1 ? '榜单常青树' : state.funding.length >= 2 && state.cash >= rulesFor(state).capitalCash ? '融资永动机' : '明年一定第一';
  if (state.ending) state.paused = true;
}
function advanceDay(state,presentationEvents) {
  state.gameDay += 1;
  progressProject(state,presentationEvents);
  for (const [id,task] of Object.entries(state.assignments)) if (task.kind === 'reset' && task.finishDay === state.gameDay) {
    state.ratingTenths = Math.min(50,state.ratingTenths+5); delete state.assignments[id];
    state.notices.push({ day: state.gameDay, type: 'reset-complete', employeeId: id, ratingTenths: state.ratingTenths });
  }
  for (const release of releasesFor(state).filter(release => release.day === state.gameDay)) {
    state.models.push({ ...release, scores: [...release.scores], sequence: state.nextSequence++ }); state.appliedEvents.push(release.id);
  }
  for (const event of [{ id:'N02', day:campaignDay(state,10), amount:4 },{ id:'N05', day:campaignDay(state,98), amount:-4 }]) if (event.day === state.gameDay) {
    if (owned(state).length) state.pendingNews += event.amount;
    state.appliedEvents.push(event.id);
  }
  grantFunding(state);
  if (state.gameDay % rulesFor(state).billDays === 0) {
    const currentRank = rank(state);
    const base = baseSubscriptionIncome(state);
    const mediaIncome=mediaCampaign(state,state.gameDay).income;
    const income = Math.max(0,base+mediaIncome+state.pendingBonus+state.pendingNews);
    const {salaries,running}=operatingCosts(state);
    state.cash += income-salaries-running;
    state.bills.push({ day: state.gameDay, rank: currentRank, base, ...(rulesFor(state).trainingBase?{mediaIncome}:{}), bonus: state.pendingBonus, news: state.pendingNews, income, salaries, running, cash: state.cash });
    state.pendingBonus = 0; state.pendingNews = 0;
  }
  endIfNeeded(state);
}
function validate(condition, message) { if (!condition) throw new Error(message); }
function executeAction(original, action, recordHistory) {
  const state = structuredClone(original);
  const presentationEvents=recordHistory?[]:null;
  try {
    validate(!state.ending,'game-ended');
    action = canonicalAction(action);
    validate(!recordHistory || state.acceptedActions.length < rulesFor(state).maxAcceptedActions,'history-full');
    if (action.type === 'beginCampaign') { validate(state.acceptedActions.length===0 && state.gameDay===0 && !state.growthEnabled,'campaign-already-started');validate(Object.hasOwn(CAMPAIGN_PROFILES,action.profile),'unknown-campaign-profile');Object.assign(state,initialState(action.profile));state.growthEnabled=true; }
    else if (action.type === 'enableSubscriptionGrowth') {validate(!!rulesFor(state).trainingBase,'subscription-growth-unavailable');validate(!state.subscriptionGrowthEnabled,'subscription-growth-already-enabled');state.subscriptionGrowthEnabled=true;}
    else if (action.type === 'enableBurst') {validate(!state.burstEnabled,'burst-already-enabled');state.burstEnabled=true;}
    else if (action.type === 'enableGrowth') {validate(!state.growthEnabled,'growth-already-enabled');state.growthEnabled=true;}
    else if (action.type === 'resume') { validate(!(state.project?.status === 'planning' && state.project.plannerId === null),'planner-required'); state.paused = false; }
    else if (action.type === 'pause') state.paused = true;
    else if (action.type === 'expand') { validate(state.seats === 4,'already-expanded'); validate(state.cash >= rulesFor(state).expansionCost,'cash'); state.cash -= rulesFor(state).expansionCost; state.seats = 8; }
    else if (action.type === 'hire') { const employee = EMPLOYEES[action.employeeId]; validate(employee && employee.hire > 0,'candidate'); validate(!state.employees.includes(action.employeeId) && !state.dismissed.includes(action.employeeId),'unavailable'); validate(recruitmentStatus(state,action.employeeId).unlocked,'candidate-locked'); validate(state.employees.length < state.seats,'seats'); validate(state.cash >= employeeTerms(state,action.employeeId).hire,'cash'); state.cash -= employeeTerms(state,action.employeeId).hire; state.employees.push(action.employeeId); }
    else if (action.type === 'dismiss') { validate(state.employees.includes(action.employeeId),'employee'); const compensation = employeeTerms(state,action.employeeId).salary * 2; validate(state.cash >= compensation,'cash'); state.cash -= compensation; state.employees = state.employees.filter(id => id !== action.employeeId); state.dismissed.push(action.employeeId); delete state.assignments[action.employeeId]; if (state.project?.status === 'planning' && state.project.plannerId === action.employeeId) {state.project.plannerId = null; state.paused = true;} state.notices.push({ day:state.gameDay, type:'farewell', employeeId:action.employeeId, compensation }); }
    else if (action.type === 'buyCompute') { validate(Number.isInteger(action.amount) && action.amount > 0 && state.compute+action.amount <= rulesFor(state).maxCompute,'capacity'); const cost = price(state)*action.amount; validate(state.cash >= cost,'cash'); state.cash -= cost; state.compute += action.amount; }
    else if (action.type === 'createProject') { validate(!state.project,'project-exists'); validate(DIRECTIONS.includes(action.focus),'focus'); validate(typeof action.name === 'string' && action.name.trim().length > 0 && action.name.trim().length <= 40,'name'); validate(state.employees.includes(action.plannerId),'planner'); validate(state.assignments[action.plannerId]?.kind !== 'reset','employee-busy'); const budget=trainingCost(state); validate(state.cash>=budget,'cash'); state.cash-=budget; const projectId=state.nextProjectId++,startWork=12+((projectId-1)%3)*4; state.project = { id:projectId, ...(rulesFor(state).trainingBase?{trainingCost:budget}:{}), ...(state.burstEnabled?{burst:{startWork,endWork:startWork+4,employeeId:null,earned:0}}:{}), name:action.name.trim(), focus:action.focus, plannerId:action.plannerId, status:'planning', planProgress:0, planScores:null, work:0, stageIndex:0, stageWork:0, scoreRemainders:DIRECTIONS.map(()=>0), initialScores:[...state.knowledge], scores:[...state.knowledge] }; }
    else if (action.type === 'selectPlanner') {validate(state.project?.status === 'planning' && state.project.plannerId === null,'planner-not-missing'); validate(state.employees.includes(action.employeeId),'planner'); validate(state.assignments[action.employeeId]?.kind !== 'reset','employee-busy'); state.project.plannerId = action.employeeId; state.notices.push({day:state.gameDay,type:'planner-selected',projectId:state.project.id,employeeId:action.employeeId});}
    else if (action.type === 'reset') { const reset=quotaResetStatus(state);validate(reset.available,reset.reason);state.cash-=reset.cost;state.assignments.rebo={kind:'reset',finishDay:reset.finishDay}; }
    else if (action.type === 'publish') {
      const presenter = action.presenter ?? publicationPresenter(state);
      validate(state.project?.status === 'ready','project-not-ready'); validate(state.employees.includes(presenter),'presenter'); validate(state.assignments[presenter]?.kind !== 'reset','presenter-busy');
      validate(action.media === undefined || ['机器之薪','量子味','新智猿'].includes(action.media),'media');
      const articleCost = action.media ? mediaCost(state,presenter) : 0;
      validate(state.cash >= rulesFor(state).publicationCost+articleCost,'cash'); state.cash -= rulesFor(state).publicationCost+articleCost;
      const project = state.project;
      const beforeMarket=marketSummary(state), compact=profileFor(state)!=='classic168';
      if(compact){const variation=[0,2,-1,1,-2][owned(state).length%5]-(action.media?1:0);state.ratingTenths=Math.max(10,Math.min(50,state.ratingTenths+variation));}
      state.models.push({ id:`player-${project.id}`, company:'player', ...(rulesFor(state).trainingBase?{trainingCost:project.trainingCost,...(action.media?{mediaUntilDay:Math.min(rulesFor(state).lastDay,(Math.floor(state.gameDay/7)+2)*7),mediaIncome:rulesFor(state).mediaIncome}:{})}:{}), ...(project.burst?{burstBonus:project.burst.earned}:{}), name:project.name, focus:project.focus, scores:[...project.scores], day:state.gameDay, sequence:state.nextSequence++, presenter:presenter, media:action.media ?? null });
      state.notices.push({ day: state.gameDay, type: 'published', modelId: `player-${project.id}`, cost: rulesFor(state).publicationCost + articleCost });
      state.knowledge = state.knowledge.map((score,index) => score + Math.floor((project.scores[index]-project.initialScores[index])*rulesFor(state).inheritancePercent/100));
      state.pendingBonus += rulesFor(state).publicationBonus + (action.media&&!rulesFor(state).trainingBase ? rank(state) <= 3 ? 10 : 3 : 0);
      state.project = null;
      state.paused = true;
      grantFunding(state);
      if(compact)state.models.at(-1).releaseFeedback={before:beforeMarket,after:marketSummary(state),nextBillIncome:Math.max(0,marketSummary(state).weeklyIncome+state.pendingBonus+state.pendingNews)};
    }
    else if (action.type === 'advanceTo') { validate(Number.isInteger(action.targetDay) && action.targetDay > state.gameDay && action.targetDay <= rulesFor(state).lastDay,'target-day'); validate(!state.paused,'paused'); while (state.gameDay < action.targetDay && !state.paused && !state.ending) advanceDay(state,presentationEvents); }
    else validate(false,'unknown-action');
    if (action.type === 'hire') state.notices.push({ day: state.gameDay, type: 'hired', employeeId: action.employeeId, cost: employeeTerms(state,action.employeeId).hire });
    if (action.type === 'expand') state.notices.push({ day: state.gameDay, type: 'expanded', cost: rulesFor(state).expansionCost, seats: state.seats });
    if (action.type === 'buyCompute') state.notices.push({ day: state.gameDay, type: 'compute-purchased', amount: action.amount, cost: price(state) * action.amount });
    if (action.type === 'createProject') state.notices.push({ day: state.gameDay, type: 'project-created', projectId: state.project.id, ...(rulesFor(state).trainingBase?{cost:state.project.trainingCost}:{}) });
    if (action.type === 'reset') state.notices.push({ day: state.gameDay, type: 'reset-started', employeeId: 'rebo', cost: 4, finishDay: state.gameDay + 1 });
    if (recordHistory) state.acceptedActions.push(action);
    return recordHistory?{ok:true,state,presentationEvents}:{ok:true,state};
  } catch (error) { return { ok:false,state:original,error:error.message }; }
}

const ACTION_FIELDS = {
  beginCampaign:['type','profile'],enableGrowth:['type'],enableBurst:['type'],enableSubscriptionGrowth:['type'],pause:['type'],resume:['type'],expand:['type'],hire:['type','employeeId'],dismiss:['type','employeeId'],buyCompute:['type','amount'],
  createProject:['type','name','focus','plannerId'],selectPlanner:['type','employeeId'],reset:['type'],publish:['type','presenter','media'],advanceTo:['type','targetDay'],
};
function canonicalAction(action) {
  validate(action && typeof action === 'object' && !Array.isArray(action) && Object.hasOwn(ACTION_FIELDS,action.type),'unknown-action');
  const fields = ACTION_FIELDS[action.type];
  validate(Object.keys(action).every(key=>fields.includes(key)),'action-fields');
  const canonical = {};
  for (const field of fields) if (Object.hasOwn(action,field) && action[field] !== undefined) {
    validate(['string','number'].includes(typeof action[field]) && (typeof action[field] !== 'number' || Number.isSafeInteger(action[field])),'action-value');
    canonical[field] = action[field];
  }
  return canonical;
}
export function applyAction(original, action) { return executeAction(original,action,true); }
export function replayActions(actions) {
  validate(Array.isArray(actions) && actions.length <= RULES.maxAcceptedActions,'action-history');
  let state = initialState();
  for (const [index,action] of actions.entries()) {
    validate(action?.type !== 'beginCampaign' || index === 0,'campaign-must-be-first');
    const canonical = canonicalAction(action);
    validate(JSON.stringify(canonical) === JSON.stringify(action),'action-history-canonical');
    const result = executeAction(state,canonical,false);
    validate(result.ok,'action-history:'+result.error);
    state = result.state;
  }
  state.acceptedActions = structuredClone(actions);
  return state;
}
