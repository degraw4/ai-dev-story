#!/usr/bin/env node
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIRECTIONS } from '../src/game/content.js';
import {
  createState, applyAction, replayActions, rulesFor, rank, total, recruitmentStatus,
  price, employeeAbilities, productionSummary, trainingCost, employeeTerms,
  mediaCampaign, mediaCost, publicationPresenter,
} from '../src/game/rules.js';

const owned = state => state.models.filter(model => model.company === 'player');
const sum = values => values.reduce((total, value) => total + value, 0);
const defaultRecruits = ['max', 'morgan', 'rebo', 'tim', 'karpathy', 'boris'];

// Every balance example uses accepted player actions. No cash or score injection.
// The reserve is a purchasing rule, not an extra resource supplied to the company.
export function runBudgetRoute({
  profile = 'budget112',
  subscriptionGrowth = false,
  recruits = defaultRecruits,
  computeTarget = 2,
  computeAfterOverall = false,
  reserve = 35,
  media = true,
  rotateDirections = false,
  rotateAfterOverall = false,
  retireAfterOverall = false,
  retireAll = false,
  dismissAfterOverall = [],
  burst = true,
} = {}) {
  let state = createState({ profile, burst, subscriptionGrowth });
  let minimumCash = state.cash;
  let retired = false;
  const publications = [];
  const act = action => {
    const result = applyAction(state, action);
    assert(result.ok, `Day ${state.gameDay}, ${action.type}: ${result.error}`);
    state = result.state;
    minimumCash = Math.min(minimumCash, state.cash);
  };
  const shouldRetire = () => retireAfterOverall && state.funding.includes('overall');

  while (!state.ending) {
    if (state.funding.includes('overall')) {
      for (const employeeId of dismissAfterOverall) {
        if (state.employees.includes(employeeId)) act({ type: 'dismiss', employeeId });
      }
    }
    if (shouldRetire() && !retired) {
      for (const employeeId of [...state.employees]) {
        if (retireAll || employeeId !== 'avery') act({ type: 'dismiss', employeeId });
      }
      retired = true;
    }
    if (owned(state).length && !retired) {
      for (const employeeId of recruits) {
        if (state.employees.includes(employeeId) || state.dismissed.includes(employeeId)) continue;
        if (!recruitmentStatus(state, employeeId).unlocked) continue;
        const needsExpansion = state.employees.length === state.seats;
        const cost = employeeTerms(state, employeeId).hire + (needsExpansion ? rulesFor(state).expansionCost : 0);
        if (state.cash < cost + reserve) continue;
        if (needsExpansion) act({ type: 'expand' });
        act({ type: 'hire', employeeId });
      }
      const availableComputeTarget = computeAfterOverall && !state.funding.includes('overall') ? 2 : computeTarget;
      while (state.compute < availableComputeTarget && state.cash >= price(state) + reserve) {
        act({ type: 'buyCompute', amount: 1 });
      }
    }
    if (state.project?.status === 'ready' && state.cash >= rulesFor(state).publicationCost) {
      const billDays = rulesFor(state).billDays;
      const bothCampaignBillsFit = (Math.floor(state.gameDay / billDays) + 2) * billDays <= rulesFor(state).lastDay;
      const wantsMedia = media && bothCampaignBillsFit && !mediaCampaign(state).income
        && state.cash >= rulesFor(state).publicationCost + mediaCost(state, publicationPresenter(state));
      act({ type: 'publish', ...(wantsMedia ? { media: '机器之薪' } : {}) });
      publications.push({ day: state.gameDay, score: total(owned(state).at(-1)), rank: rank(state), cash: state.cash });
    }
    if (!state.project && !shouldRetire() && state.cash >= trainingCost(state) + rulesFor(state).publicationCost) {
      const count = owned(state).length;
      const keepCoding = !rotateDirections || count < 3 || (rotateAfterOverall && !state.funding.includes('overall'));
      const focus = keepCoding ? 'coding' : DIRECTIONS[(count - 3) % DIRECTIONS.length];
      const direction = DIRECTIONS.indexOf(focus);
      const plannerId = [...state.employees].sort((a, b) => employeeAbilities(state, b)[direction] - employeeAbilities(state, a)[direction])[0];
      const action = { type: 'createProject', name: `Next ${count + 1}`, focus, plannerId };
      const preview = applyAction(state, action);
      assert(preview.ok, preview.error);
      // The UI already exposes this estimate. Avoid paying for work past the final release day.
      if (state.gameDay + productionSummary(preview.state).estimatedDays < rulesFor(state).lastDay) act(action);
    }
    act({ type: 'resume' });
    act({ type: 'advanceTo', targetDay: state.gameDay + 1 });
  }
  assert.deepEqual(replayActions(state.acceptedActions), state, 'accepted route must replay without injected resources');
  return { state, minimumCash, publications };
}

// Historical budget112 compatibility examples; existing callers keep this contract.
export function budgetExamples() {
  const examples = {
    champion: runBudgetRoute(),
    capital: runBudgetRoute({ retireAfterOverall: true }),
    ordinary: runBudgetRoute({ recruits: [], media: false }),
    ordinaryMedia: runBudgetRoute({ recruits: [] }),
    reckless: runBudgetRoute({ computeTarget: 8, reserve: 0, media: false }),
    noKarpathy: runBudgetRoute({ recruits: ['max', 'morgan', 'rebo', 'tim', 'casey', 'boris'], computeTarget: 4, rotateDirections: true }),
    noBoris: runBudgetRoute({ recruits: ['max', 'morgan', 'rebo', 'tim', 'karpathy', 'casey'], computeTarget: 4, rotateDirections: true }),
  };
  assert.deepEqual(['champion', 'capital', 'ordinary', 'reckless'].map(id => examples[id].state.ending),
    ['榜单常青树', '融资永动机', '明年一定第一', '发布会照常']);
  assert.deepEqual(Object.values(examples).map(result => result.state.cash), [44, 363, 75, 111, -4, 19, 33]);
  assert.equal(examples.reckless.state.gameDay, 21);
  for (const id of ['champion', 'noKarpathy', 'noBoris']) {
    assert.equal(examples[id].state.ending, '榜单常青树');
    assert(examples[id].minimumCash >= 0 && examples[id].state.cash < 100);
  }
  assert.equal(examples.noKarpathy.state.compute, 4);
  assert.equal(examples.noBoris.state.compute, 4);
  assert.deepEqual(examples.capital.state.employees, ['avery']);
  assert.equal(owned(examples.capital.state).length, 3);
  assert(examples.capital.state.notices.some(notice => notice.type === 'farewell' && notice.compensation > 0));

  const plain = examples.ordinary.state;
  const promoted = examples.ordinaryMedia.state;
  assert.deepEqual(owned(plain).map(model => model.scores), owned(promoted).map(model => model.scores));
  const paidReports = owned(promoted).filter(model => model.media).length;
  const campaignIncome = sum(promoted.bills.map(bill => bill.mediaIncome));
  assert.equal(paidReports, 6);
  assert.equal(campaignIncome, 120);
  assert.equal(promoted.cash - plain.cash, campaignIncome - paidReports * rulesFor(promoted).mediaPrice);
  assert.equal(sum(owned(plain).map(model => model.trainingCost)), 108);
  assert.equal(sum(owned(promoted).map(model => model.trainingCost)), 108);
  return examples;
}

// Historical startup112 routes without subscription growth preserve the original economy.
export function startupExamples() {
  const profile = 'startup112';
  const examples = {
    champion: runBudgetRoute({ profile }),
    capital: runBudgetRoute({ profile, retireAfterOverall: true, retireAll: true }),
    ordinary: runBudgetRoute({ profile, recruits: [], media: false }),
    reckless: runBudgetRoute({ profile, computeTarget: 8, reserve: 0, media: false }),
  };
  assert.deepEqual(Object.values(examples).map(({ state }) => state.ending),
    ['榜单常青树', '融资永动机', '明年一定第一', '发布会照常']);
  assert.deepEqual(Object.values(examples).map(({ state }) => state.cash), [49, 351, 75, -4]);
  assert.deepEqual(Object.values(examples).map(({ publications }) => publications.length), [15, 5, 9, 1]);
  assert.deepEqual(examples.champion.state.notices.filter(notice => notice.type === 'funding').map(notice => [notice.day, notice.id]),
    [[22, 'seed'], [32, 'specialist'], [46, 'overall']]);
  assert.equal(examples.champion.minimumCash, 33);
  assert.deepEqual(examples.capital.state.employees, []);
  assert(examples.capital.state.notices.filter(notice => notice.type === 'farewell').every(notice => notice.compensation > 0));
  assert.equal(examples.ordinary.state.notices.find(notice => notice.type === 'funding').day, 48);
  assert.equal(examples.reckless.state.gameDay, 21);
  for (const { state, publications } of Object.values(examples)) {
    assert.equal(state.campaignProfile, profile);
    assert([5, 6].includes(publications[0].rank));
    assert(!state.notices.some(notice => notice.type === 'funding' && notice.day <= publications[0].day));
  }
  return examples;
}

export function subscriptionExamples() {
  const current = { profile: 'startup112', subscriptionGrowth: true };
  const expandAfterFunding = { ...current, computeAfterOverall: true };
  const examples = {
    champion: runBudgetRoute(current),
    champion4: runBudgetRoute({ ...expandAfterFunding, computeTarget: 4 }),
    champion7: runBudgetRoute({ ...expandAfterFunding, computeTarget: 7 }),
    champion8: runBudgetRoute({ ...expandAfterFunding, computeTarget: 8 }),
    mixed: runBudgetRoute({ ...expandAfterFunding, computeTarget: 8, rotateDirections: true,
      rotateAfterOverall: true, dismissAfterOverall: ['boris'] }),
    capital: runBudgetRoute({ ...current, retireAfterOverall: true, retireAll: true }),
    ordinary: runBudgetRoute({ ...current, recruits: [], media: false }),
    reckless: runBudgetRoute({ ...current, computeTarget: 8, reserve: 0, media: false }),
  };
  assert.deepEqual(['champion', 'capital', 'ordinary', 'reckless'].map(id => examples[id].state.ending),
    ['榜单常青树', '融资永动机', '明年一定第一', '发布会照常']);
  assert.deepEqual(Object.values(examples).map(({ state }) => state.cash),
    [317, 261, 177, 149, 156, 544, 75, -4]);
  for (const id of ['champion4', 'champion7', 'champion8']) assert.equal(examples[id].state.ending, '榜单常青树');
  for (const id of ['champion4', 'champion7', 'champion8', 'mixed']) {
    const { state, minimumCash, publications } = examples[id];
    assert.equal(state.gameDay, 112);
    assert(minimumCash >= 0);
    assert.equal(publications.length, 15, 'expanded teams keep developing through the final weeks');
    const fundingDay = state.notices.find(notice => notice.type === 'funding' && notice.id === 'overall').day;
    assert(publications.some(model => model.day > fundingDay));
  }
  assert.equal(rank(examples.mixed.state), 4);
  assert.deepEqual(examples.capital.state.employees, []);
  assert.equal(examples.reckless.state.gameDay, 21);
  return examples;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const examples = subscriptionExamples();
  console.table(Object.entries(examples).map(([route, result]) => ({
    route, ending: result.state.ending, day: result.state.gameDay, cash: result.state.cash,
    minimumCash: result.minimumCash, models: owned(result.state).length, rank: rank(result.state),
    employees: result.state.employees.length, compute: result.state.compute,
    training: sum(owned(result.state).map(model => model.trainingCost)),
    mediaIncome: sum(result.state.bills.map(bill => bill.mediaIncome)),
  })));
  console.log('PASS: eight current startup112 routes replay with post-funding subscriptions. startupExamples() and budgetExamples() retain historical subscription compatibility routes.');
}
