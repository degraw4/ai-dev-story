// Design arithmetic worksheet, not the game runtime or playtest evidence.
import assert from 'node:assert/strict';

export const GAME_WEEKS = 24;
export const EMPLOYEES = {
  avery: { name: 'Avery Loop', specialty: 'arithmetic', hire: 0, salary: 2 },
  jules: { name: 'Jules Page', specialty: 'language', hire: 0, salary: 2 },
  morgan: { name: 'Morgan Byte', specialty: 'arithmetic', hire: 8, salary: 2 },
  casey: { name: 'Casey Deck', specialty: 'language', hire: 8, salary: 2 },
  wang: { name: 'Alexandr Wang', specialty: 'language', hire: 12, salary: 2 },
  rebo: { name: 'Rebo', specialty: 'language', hire: 12, salary: 3 },
  karpathy: { name: '卡帕题', specialty: 'arithmetic', hire: 18, salary: 4 },
  boris: { name: 'Boris Cherry', specialty: 'language', hire: 14, salary: 4 },
  tim: { name: 'Tim Detmer', specialty: 'arithmetic', hire: 14, salary: 3 },
  max: { name: 'Max Score', specialty: 'arithmetic', hire: 10, salary: 2 },
};
const RESEARCH = {
  organize: { compute: 0, cost: 0, match: 2, other: 1 },
  train: { compute: 1, cost: 1, match: 5, other: 3 },
  sprint: { compute: 2, cost: 3, match: 8, other: 4 },
};
export const COMPANIES = ['CloseAI', 'AntiThropic', 'Gloglo', 'Meeta', 'DeepPeek'];
export const RIVAL_SCHEDULE = [
  [0, [31,25], [24,30], [25,25], [22,23], [23,21]],
  [3, [38,33], [31,38], [32,30], [29,29], [32,32]],
  [6, [56,49], [48,56], [47,45], [43,41], [52,48]],
  [9, [82,73], [73,85], [67,63], [60,58], [77,72]],
  [12, [118,106], [106,122], [92,88], [83,81], [113,105]],
  [15, [159,147], [145,167], [121,115], [107,104], [155,145]],
  [18, [204,192], [188,214], [149,141], [130,125], [201,190]],
  [21, [249,237], [231,262], [174,166], [150,144], [246,235]],
  [24, [291,279], [278,299], [205,195], [178,172], [290,280]],
];
export const MEDIA = ['机器之胃', '量子味', '新纸元'];
const BOARDS = ['arithmetic', 'language', 'overall'];
const pointsOnBoard = (points, board) => board === 'overall'
  ? points.arithmetic + points.language : points[board];
export function newsAt(week) {
  return {
    computePrice: week === 4 || week === 5 ? 9 : week === 12 ? 16
      : week === 20 || week === 21 ? 10 : 12,
    subscriptionAdjustment: week === 8 ? 4 : week === 16 ? -4 : 0,
  };
}
export function researchResult(employee, action, target) {
  const person = EMPLOYEES[employee], rule = RESEARCH[action];
  assert(person && rule, 'unknown employee or research action');
  assert(['arithmetic', 'language'].includes(target), 'unknown target');
  let points = person.specialty === target ? rule.match : rule.other;
  let cost = rule.cost, compute = rule.compute;
  if (employee === 'wang') points = Math.max(1, points - 1);
  if (employee === 'karpathy') points += 2;
  if (employee === 'boris') { points += 4; cost += 2; }
  if (employee === 'tim') compute = Math.max(0, compute - 1);
  if (employee === 'max' && action === 'organize') points += 3;
  return { points, cost, compute };
}
export function classifyEnding(cash, week, overallRank, financingCount) {
  if (cash < 0) return '发布会照常';
  if (week < GAME_WEEKS) return null;
  if (overallRank === 1) return '榜单常青树';
  if (financingCount >= 2 && cash >= 260) return '融资永动机';
  return '明年一定第一';
}
export function runScenario(plans, weekLimit = GAME_WEEKS) {
  assert(Number.isInteger(weekLimit) && weekLimit >= 1 && weekLimit <= GAME_WEEKS);
  const state = {
    cash: 70, employees: ['avery', 'jules'], computeCapacity: 2,
    draft: { arithmetic: 20, language: 20 }, models: [],
    paidFinancing: new Set(), ratingTenths: 21,
  };
  const rows = [];
  let ending = null;
  for (let week = 1; week <= weekLimit; week++) {
    const plan = plans[week - 1] ?? {}, news = newsAt(week);
    const recruits = plan.recruits ?? [], purchase = plan.computePurchase ?? 0;
    const assignments = plan.assignments ?? [], publisher = plan.publisher ?? null;
    const resetter = plan.resetter ?? null, media = plan.media ?? null;
    const employees = [...state.employees, ...recruits];
    assert(recruits.every(id => Object.hasOwn(EMPLOYEES, id)
      && !['avery', 'jules'].includes(id)), 'unknown or non-recruitable employee');
    assert.equal(new Set(employees).size, employees.length, 'duplicate employee');
    assert(employees.length <= 4, 'employee capacity exceeded');
    assert(Number.isInteger(purchase) && purchase >= 0, 'invalid compute purchase');
    const computeCapacity = state.computeCapacity + purchase;
    assert(computeCapacity <= 4, 'compute capacity exceeded');
    const occupied = assignments.map(item => item.employee);
    if (publisher) occupied.push(publisher);
    if (resetter) occupied.push(resetter);
    assert(occupied.every(id => employees.includes(id)), 'employee not hired');
    assert.equal(new Set(occupied).size, occupied.length, 'employee has multiple actions');
    if (resetter) {
      assert.equal(resetter, 'rebo', 'only Rebo can reset quotas');
      assert(state.models.length > 0, 'quota reset requires an existing published model');
      assert(state.ratingTenths < 50, 'customer rating already at maximum');
    }
    const draft = { ...state.draft };
    let computeUsed = 0, researchCost = 0;
    const contributions = [];
    for (const work of assignments) {
      const result = researchResult(work.employee, work.action, work.target);
      computeUsed += result.compute; researchCost += result.cost;
      draft[work.target] += result.points;
      contributions.push({ ...work, ...result });
    }
    assert(computeUsed <= computeCapacity, 'insufficient compute');
    if (publisher) {
      assert(pointsOnBoard(draft, 'overall') >
        pointsOnBoard(state.models.at(-1)?.points ?? { arithmetic: 20, language: 20 }, 'overall'),
      'release requires additional points');
    }
    // Both article styles belong to this actual release. No prepayment or later repurchase.
    let mediaCost = 0;
    if (media) {
      assert(MEDIA.includes(media.outlet), 'unknown media outlet');
      assert(['prelaunch', 'followup'].includes(media.timing), 'unknown media timing');
      assert(publisher, 'article requires this week release');
      mediaCost = publisher === 'wang' ? 3 : 6;
    }
    const hireCost = recruits.reduce((sum, id) => sum + EMPLOYEES[id].hire, 0);
    const purchaseCost = purchase * news.computePrice;
    const resetCost = resetter ? 4 : 0, publicationCost = publisher ? 3 : 0;
    const upfrontCost = hireCost + purchaseCost + researchCost
      + resetCost + publicationCost + mediaCost;
    const openingCash = state.cash;
    assert(upfrontCost <= openingCash, 'cannot spend future income');
    state.cash -= upfrontCost;
    state.employees = employees; state.computeCapacity = computeCapacity; state.draft = draft;
    if (resetter) state.ratingTenths = Math.min(50, state.ratingTenths + 5);
    if (publisher) state.models.push({
      points: { ...draft }, releaseOrder: week * 10, publisher,
      media: media ? { ...media, week } : null,
    });
    const rivalRow = RIVAL_SCHEDULE.filter(row => row[0] <= week).at(-1);
    const rivals = COMPANIES.map((company, index) => ({
      company, points: { arithmetic: rivalRow[index + 1][0], language: rivalRow[index + 1][1] },
      releaseOrder: rivalRow[0] * 10 + index + 1,
    }));
    const ranks = Object.fromEntries(BOARDS.map(board => {
      const best = [...state.models].sort((left, right) =>
        pointsOnBoard(right.points, board) - pointsOnBoard(left.points, board)
        || left.releaseOrder - right.releaseOrder)[0];
      if (!best) return [board, null];
      const score = pointsOnBoard(best.points, board);
      return [board, 1 + rivals.filter(rival =>
        pointsOnBoard(rival.points, board) > score ||
        (pointsOnBoard(rival.points, board) === score && rival.releaseOrder < best.releaseOrder)
      ).length];
    }));
    const financingAwards = [];
    const claim = (key, amount, eligible) => {
      if (eligible && !state.paidFinancing.has(key)) {
        state.paidFinancing.add(key); financingAwards.push({ key, amount });
      }
    };
    claim('seed', 30, state.models.some(model => pointsOnBoard(model.points, 'overall') >= 48));
    claim('specialist', 60, ranks.arithmetic === 1 || ranks.language === 1);
    claim('overall', 100, ranks.overall === 1);
    const financingIncome = financingAwards.reduce((sum, award) => sum + award.amount, 0);
    const baseSubscription = ranks.overall === null ? 0 : [0,18,14,10,7,5,3][ranks.overall];
    const releaseSubscription = publisher ? 5 : 0;
    const mediaSubscription = media ? (ranks.overall <= 3 ? 10 : 3) : 0;
    const newsSubscription = ranks.overall === null ? 0 : news.subscriptionAdjustment;
    const subscriptionIncome = Math.max(0,
      baseSubscription + releaseSubscription + mediaSubscription + newsSubscription);
    const salaryCost = employees.reduce((sum, id) => sum + EMPLOYEES[id].salary, 0);
    const recurringCost = salaryCost + computeCapacity;
    state.cash += financingIncome + subscriptionIncome - recurringCost;
    ending = classifyEnding(state.cash, week, ranks.overall, state.paidFinancing.size);
    rows.push({
      week, openingCash, employeeCount: employees.length, computeCapacity, computeUsed,
      contributions, draft: { ...draft }, published: Boolean(publisher),
      publishedPoints: state.models.at(-1)?.points ?? null, ranks,
      hireCost, purchaseCost, researchCost, resetCost, publicationCost, mediaCost,
      upfrontCost, financingAwards, financingIncome, baseSubscription,
      releaseSubscription, mediaSubscription, newsSubscription, subscriptionIncome,
      salaryCost, recurringCost, closingCash: state.cash,
      ratingTenths: state.ratingTenths, ending,
    });
    assert.equal(state.cash,
      openingCash - upfrontCost + financingIncome + subscriptionIncome - recurringCost);
    assert(state.paidFinancing.size <= 3);
    if (ending) break;
  }
  return {
    ending, cash: state.cash, publishedPoints: state.models.at(-1)?.points ?? null,
    releaseCount: state.models.length, financingCount: state.paidFinancing.size,
    ratingTenths: state.ratingTenths, models: state.models, rows,
  };
}
export const assignment = (employee, action, target) => ({ employee, action, target });
const launch = { assignments: [assignment('avery', 'sprint', 'arithmetic')], publisher: 'jules' };
const expanded = {
  assignments: [assignment('avery', 'train', 'arithmetic'),
    assignment('karpathy', 'sprint', 'arithmetic'), assignment('boris', 'train', 'language')],
  publisher: 'jules',
};
const expansion = { ...expanded, recruits: ['karpathy', 'boris'], computePurchase: 2 };
export const PLANS = {
  crown: Array.from({ length: GAME_WEEKS }, (_, index) => index < 2 ? launch : index === 2 ? expansion : expanded),
  financing: Array.from({ length: GAME_WEEKS }, (_, index) => index < 4 ? launch : {
    assignments: [assignment('avery', 'organize', 'arithmetic')], publisher: 'jules',
  }),
  ordinary: Array.from({ length: GAME_WEEKS }, () => launch),
  failure: [{ recruits: ['karpathy', 'boris'], computePurchase: 2 }],
  early: Array.from({ length: GAME_WEEKS }, (_, index) => index === 0 ? launch : index === 1 ? expansion : expanded),
  delayed: Array.from({ length: GAME_WEEKS }, (_, index) => index === 0 ? {
    assignments: [assignment('avery', 'train', 'arithmetic'), assignment('jules', 'train', 'language')],
  } : index === 1 ? launch : index === 2 ? expansion : expanded),
};
export const RESULTS = Object.fromEntries(Object.entries(PLANS).map(([name, sequence]) => [name, runScenario(sequence)]));
for (const [name, ending, cash, overall] of [
  ['crown','榜单常青树',145,584], ['financing','融资永动机',276,112],
  ['ordinary','明年一定第一',233,232], ['failure','发布会照常',-2,null],
  ['early','榜单常青树',135,600], ['delayed','榜单常青树',141,586],
]) {
  assert.equal(RESULTS[name].ending, ending);
  assert.equal(RESULTS[name].cash, cash);
  assert.equal(RESULTS[name].publishedPoints ? pointsOnBoard(RESULTS[name].publishedPoints,'overall') : null, overall);
}
assert.deepEqual(researchResult('wang','train','language'), {points:4,cost:1,compute:1});
assert.deepEqual(researchResult('karpathy','train','arithmetic'), {points:7,cost:1,compute:1});
assert.deepEqual(researchResult('boris','train','language'), {points:9,cost:3,compute:1});
assert.deepEqual(researchResult('tim','train','arithmetic'), {points:5,cost:1,compute:0});
assert.deepEqual(researchResult('tim','sprint','arithmetic'), {points:8,cost:3,compute:1});
assert.deepEqual(researchResult('max','organize','arithmetic'), {points:5,cost:0,compute:0});
assert.deepEqual(researchResult('max','train','arithmetic'), {points:5,cost:1,compute:1});
const media = {outlet:'量子味',timing:'prelaunch'};
const weakArticle = runScenario([{...launch,media}],1).rows[0];
const strongArticle = runScenario([PLANS.delayed[0], {...launch,media}],2).rows[1];
const wangArticle = runScenario([{
  recruits:['wang'], assignments:[assignment('avery','sprint','arithmetic')],publisher:'wang',media,
}],1).rows[0];
assert.equal(weakArticle.mediaCost,6); assert.equal(weakArticle.mediaSubscription,3);
assert.equal(strongArticle.mediaCost,6); assert.equal(strongArticle.mediaSubscription,10);
assert.equal(wangArticle.mediaCost,3);
assert.equal(runScenario([{...launch,media:{...media,timing:'followup'}}],1).cash,runScenario([{...launch,media}],1).cash);
assert.throws(()=>runScenario([launch,{media:{...media,timing:'followup'}}],2),/this week release/);
assert.throws(()=>runScenario([{publisher:'jules'}],1),/additional points/);
assert.throws(()=>runScenario([{...launch,publisher:'avery'}],1),/multiple actions/);
assert.throws(()=>runScenario([{recruits:['Sam Allman']}],1),/non-recruitable/);
assert.throws(()=>runScenario([{recruits:['rebo'],resetter:'rebo'}],1),/existing published model/);
assert.throws(()=>runScenario([{...expansion,media,assignments:[
  assignment('karpathy','sprint','arithmetic'),assignment('boris','sprint','language')]}],1),/future income/);
const zero = runScenario([{
  recruits:['karpathy','rebo'],computePurchase:2,
  assignments:[assignment('avery','train','arithmetic'),assignment('jules','organize','language'),
    assignment('karpathy','organize','arithmetic'),assignment('rebo','organize','language')],
}],1);
assert.equal(zero.cash,0); assert.equal(zero.ending,null);
const rescued = runScenario([{
  recruits:['karpathy','boris'],computePurchase:2,publisher:'jules',
  assignments:[assignment('avery','train','arithmetic'),assignment('karpathy','train','arithmetic'),assignment('boris','train','language')],
}],1);
assert.equal(rescued.cash,203);
const resetPlans=Array.from({length:24},(_,index)=>index===0?launch:index===1?{...launch,recruits:['rebo'],resetter:'rebo'}:launch);
const restPlans=resetPlans.map((plan,index)=>index===1?{...plan,resetter:null}:plan);
const resetRun=runScenario(resetPlans), restRun=runScenario(restPlans);
assert.equal(resetRun.ratingTenths,26); assert.equal(restRun.ratingTenths,21);
assert.equal(resetRun.cash,restRun.cash-4);
assert.equal(resetRun.ending,restRun.ending);
assert.deepEqual(resetRun.rows.map(row=>row.ranks),restRun.rows.map(row=>row.ranks));
const cappedPlans=Array.from({length:8},(_,index)=>index===0?launch:{
  ...launch,...(index===1?{recruits:['rebo']}:{}),...(index<=6?{resetter:'rebo'}:{}),
});
assert.equal(runScenario(cappedPlans,7).ratingTenths,50);
assert.throws(()=>runScenario([...cappedPlans.slice(0,7),{...launch,resetter:'rebo'}],8),/maximum/);
assert.equal(runScenario([]).rows.at(-1).week,12);
assert.equal(RESULTS.ordinary.rows[1].ranks.overall,2);
assert.equal(runScenario([launch,launch,{assignments:[assignment('avery','organize','arithmetic')],publisher:'jules'}],3).rows[2].ranks.arithmetic,1);
assert.equal(runScenario([{assignments:[assignment('avery','organize','arithmetic')],publisher:'jules'}],1).financingCount,0);
assert.equal(RESULTS.crown.rows.reduce((sum,row)=>sum+row.financingIncome,0),190);
assert.equal(classifyEnding(-1,24,1,3),'发布会照常');
assert.equal(classifyEnding(260,24,1,3),'榜单常青树');
assert.equal(classifyEnding(260,24,2,2),'融资永动机');
assert.equal(classifyEnding(259,24,2,2),'明年一定第一');
const pricesRun=runScenario(PLANS.financing);
assert.deepEqual([newsAt(4).computePrice,newsAt(5).computePrice,newsAt(6).computePrice,newsAt(12).computePrice,newsAt(20).computePrice],[9,9,12,16,10]);
assert.equal(pricesRun.rows[7].newsSubscription,4);
assert.equal(pricesRun.rows[15].newsSubscription,-4);
assert(RESULTS.crown.rows.every(row=>Object.values(row.ranks).every(rank=>rank===null||rank>=1&&rank<=6)));
const before=JSON.stringify(PLANS); assert.deepEqual(runScenario(PLANS.crown),RESULTS.crown); assert.equal(JSON.stringify(PLANS),before);
const report = {
  verified:true,
  scenarios:Object.fromEntries(Object.entries(RESULTS).map(([name,result])=>[name,{
    ending:result.ending,cash:result.cash,points:result.publishedPoints,
    releases:result.releaseCount,financingCount:result.financingCount,
    trace:result.rows.map(row=>[row.week,row.draft.arithmetic,row.draft.language,row.ranks.overall,
      row.upfrontCost,row.financingIncome,row.subscriptionIncome,row.recurringCost,row.closingCash]),
  }])),
  checks:{employeeTraits:6,media:'rank-sensitive; one article per release; presentation timing equivalent',
    resetCashDifference:resetRun.cash-restRun.cash,ratingCap:50,zeroCash:zero.cash,
    rescuedCash:rescued.cash,idleFailureWeek:12,news:'purchase prices and subscription adjustments'},
};
console.log(JSON.stringify(report));
