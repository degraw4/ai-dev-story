// Shared game configuration. Ability array order is part of the save format.
export const DIRECTIONS = ['coding', 'office', 'multimodal'];
export const SUBSCRIPTION_INCOME = {standard:[50,40,32,25,20,15],established:[75,70,65,60,30,20]};
const CLASSIC_RULES = { lastDay: 168, secondsPerDay: 20, billDays: 7, maxEmployees: 8, maxCompute: 8, projectWork: 40, planningDays: 2, scoreDivisor: 20, experiencePerPoint: 40, maxAbilityGrowth: 20, maxAcceptedActions: 4096, initialCash: 100, expansionCost: 30, publicationCost: 3, publicationBonus: 6, seedScore: 120, capitalCash: 320, inheritancePercent: 50 };
export const EMPLOYEES = {
  avery: { name: 'Avery Loop', specialty: 'coding', hire: 0, salary: 3, unlockDay: 0, unlockPublications: 0, abilities: [6, 2, 1] },
  jules: { name: 'Jules Page', specialty: 'office', hire: 0, salary: 3, unlockDay: 0, unlockPublications: 0, abilities: [2, 6, 2] },
  morgan: { name: 'Morgan Byte', specialty: 'office', hire: 8, salary: 3, unlockDay: 0, unlockPublications: 0, abilities: [2, 5, 3] },
  casey: { name: 'Casey Deck', specialty: 'multimodal', hire: 8, salary: 3, unlockDay: 0, unlockPublications: 0, abilities: [2, 3, 6] },
  alex: { name: 'Alex Weng', specialty: 'office', hire: 12, salary: 4, unlockDay: 0, unlockPublications: 1, abilities: [1, 4, 1] },
  rebo: { name: 'Rebo', specialty: 'coding', hire: 12, salary: 4, unlockDay: 21, unlockPublications: 0, abilities: [7, 5, 3] },
  karpathy: { name: '卡帕题', specialty: 'coding', hire: 18, salary: 6, unlockDay: 42, unlockPublications: 0, abilities: [12, 8, 7] },
  boris: { name: 'Boris Cherry', specialty: 'coding', hire: 14, salary: 6, unlockDay: 42, unlockPublications: 0, abilities: [10, 5, 4] },
  tim: { name: 'Tim Detmer', specialty: 'multimodal', hire: 14, salary: 5, unlockDay: 21, unlockPublications: 0, abilities: [4, 4, 8] },
  max: { name: 'Max Score', specialty: 'coding', hire: 10, salary: 4, unlockDay: 0, unlockPublications: 1, abilities: [5, 2, 2] },
};
export const STAGES = [
  { id: 'data', label: '数据处理', work: 8 },
  { id: 'pretraining', label: '预训练', work: 12 },
  { id: 'posttraining', label: '后训练', work: 12 },
  { id: 'evaluation', label: '评测', work: 8 },
];
const CLASSIC_RIVALS = [
  { company: 'CloseAI', models: [
    { day:0, name:'TalkGPT 3', scores:[60,85,50] },
    { day:16, name:'TalkGPT 4', scores:[75,97,64] },
    { day:78, name:'TalkGPT 5', scores:[120,163,106] },
    { day:151, name:'TalkGPT Astra', scores:[135,185,120] },
  ] },
  { company: 'AntiThropic', models: [
    { day:0, name:'Cloud Opus 3', scores:[80,65,50] },
    { day:17, name:'Cloud Opus 4', scores:[105,83,64] },
    { day:77, name:'Cloud Opus 5', scores:[180,137,106] },
    { day:152, name:'Cloud Fable', scores:[205,155,120] },
  ] },
  { company: 'Gloglo', models: [
    { day:0, name:'Geminot 1', scores:[45,70,75] },
    { day:27, name:'Geminot 2', scores:[57,87,93] },
    { day:90, name:'Geminot 3', scores:[81,121,129] },
    { day:159, name:'Geminot 4', scores:[105,155,165] },
  ] },
  { company: 'Meeta', models: [
    { day:0, name:'Drama 2', scores:[40,45,52] },
    { day:9, name:'Drama 3', scores:[50,56,66] },
    { day:69, name:'Drama 4', scores:[70,78,94] },
    { day:137, name:'Drama 5', scores:[90,100,122] },
  ] },
  { company: 'DeepPeek', models: [
    { day:0, name:'DeepPeek V2', scores:[65,50,55] },
    { day:22, name:'DeepPeek V3', scores:[84,62,68] },
    { day:53, name:'DeepPeek R1', scores:[100,86,94] },
    { day:118, name:'DeepPeek R2', scores:[160,110,120] },
  ] },
];
const releasesOf = rivals => rivals.flatMap((rival, companyOrder) => rival.models.slice(1).map((model, index) => ({ id: `rival-${companyOrder}-${index + 1}`, ...model, scores:[...model.scores], company:rival.company, companyOrder }))).sort((a,b) => a.day - b.day || a.companyOrder - b.companyOrder);
export const DEFAULT_CAMPAIGN_PROFILE = 'startup112';
export function mapCampaignDay(profile, classicDay) {
  if (profile === 'classic168') return classicDay;
  if (!['compact112','budget112','startup112'].includes(profile)) throw new Error('unknown-campaign-profile');
  if (classicDay === 17) return 12;
  if (classicDay === 152) return 102;
  return Math.round(classicDay * 2 / 3);
}
const compactRivals = CLASSIC_RIVALS.map(rival => ({ ...rival, models: rival.models.map((model,index) => ({
  ...model, day:mapCampaignDay('compact112',model.day),
  scores:model.scores.map(score => index < 2 ? score : Math.round(score * (index === 2 ? 1.6 : 2.9))),
})) }));
export const CAMPAIGN_PROFILES = {
  budget112: { rules:{...CLASSIC_RULES,lastDay:112,experiencePerPoint:120,maxAbilityGrowth:6,inheritancePercent:10,trainingBase:8,trainingStep:1,trainingCap:16,computePriceMultiplier:1.5,computeRunningCost:1,publicationCost:8,publicationBonus:6,mediaPrice:14,mediaAlexPrice:10,mediaIncome:10}, rivals:compactRivals, releases:releasesOf(compactRivals) },
  classic168: { rules:CLASSIC_RULES, rivals:CLASSIC_RIVALS, releases:releasesOf(CLASSIC_RIVALS) },
  compact112: { rules:{...CLASSIC_RULES,lastDay:112,experiencePerPoint:120,maxAbilityGrowth:6,inheritancePercent:10}, rivals:compactRivals, releases:releasesOf(compactRivals) },
};
// Early incumbents leave room for iteration before a small team can win boards.
// The existing budget profile stays immutable for historical action replay.
const startupScores=[
  [[80,110,75],[90,120,85]],
  [[100,80,70],[115,90,80]],
  [[65,85,100],[75,100,110]],
  [[50,65,70],[60,70,80]],
  [[70,60,70],[85,65,75]],
];
const startupRivals=compactRivals.map((rival,companyIndex)=>({...rival,models:rival.models.map((model,index)=>({...model,scores:[...(startupScores[companyIndex][index]??model.scores)]}))}));
CAMPAIGN_PROFILES.startup112={
  rules:{...CAMPAIGN_PROFILES.budget112.rules,inheritancePercent:11,seedScore:180,fundingPublications:{seed:2,specialist:3,overall:4}},
  rivals:startupRivals,releases:releasesOf(startupRivals),
};
// Stateless consumers use the new-company defaults. Live companies use rulesFor(state).
export const RULES = CAMPAIGN_PROFILES[DEFAULT_CAMPAIGN_PROFILE].rules;
export const RIVALS = CAMPAIGN_PROFILES[DEFAULT_CAMPAIGN_PROFILE].rivals;
export const RELEASES = CAMPAIGN_PROFILES[DEFAULT_CAMPAIGN_PROFILE].releases;
