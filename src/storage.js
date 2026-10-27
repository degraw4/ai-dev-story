import { replayActions, applyAction, rulesFor } from './game/rules.js';

export const SCHEMA_VERSION = 5;
export const SAVE_KEY = 'ai-dev-story-save-v5';
export const MIGRATION_SAVE_KEYS = ['ai-dev-story-save-v4','ai-dev-story-save-v3'];
export const MIGRATION_SAVE_KEY = MIGRATION_SAVE_KEYS[0];
export const LEGACY_SAVE_KEYS = ['ai-dev-story-save-v2', 'ai-dev-story-save-v1'];
export const LEGACY_SAVE_KEY = LEGACY_SAVE_KEYS[0];
const assert = (condition, field) => { if (!condition) throw new Error(`存档数据无效：${field}`); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function equal(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right,key) && equal(left[key],right[key]));
}
function validateSnapshot(snapshot, allowLegacy = false) {
  assert(record(snapshot), 'snapshot');
  const fields = ['schemaVersion','state','dayProgressMs','observedStoryEvents','feedbackResponses'];
  assert(Object.keys(snapshot).length === fields.length && fields.every(field=>Object.hasOwn(snapshot,field)), 'snapshot-fields');
  if ([1,2].includes(snapshot.schemaVersion)) throw new Error('这是自动研发之前的旧版存档。原存档可保留和导出，请明确开张新公司体验方案与自动研发。');
  const legacy=allowLegacy&&[3,4].includes(snapshot.schemaVersion);
  assert(snapshot.schemaVersion === SCHEMA_VERSION || legacy, 'schemaVersion');
  assert(Number.isFinite(snapshot.dayProgressMs) && snapshot.dayProgressMs >= 0, 'dayProgressMs');
  const observed = snapshot.observedStoryEvents;
  assert(Array.isArray(observed) && observed.length<=2048 && observed.every(id=>typeof id==='string' && id.length<=160) && new Set(observed).size===observed.length, 'observedStoryEvents');
  assert(record(snapshot.state) && typeof snapshot.state.paused==='boolean', 'state');
  // Reuse the sole economic reducer. The snapshot is a readable cache, not a
  // second source for scores, hires, bills, funding or the development stages.
  if(legacy)assert(Array.isArray(snapshot.state.acceptedActions)&&snapshot.state.acceptedActions.every(action=>action?.type!=='beginCampaign'),'legacy-campaign-history');
  const replayed = replayActions(snapshot.state.acceptedActions);
  assert(snapshot.dayProgressMs < rulesFor(replayed).secondsPerDay*1000,'dayProgressMs');
  // Restoring or blocking an external write can pause a company without an
  // economic action. A snapshot may never silently resume a paused replay.
  if (snapshot.state.paused) replayed.paused = true;
  const expected={...replayed};
  if(legacy){delete expected.campaignProfile;assert(replayed.campaignProfile==='classic168','legacy-profile');}
  if(snapshot.schemaVersion===3){delete expected.growthEnabled;delete expected.employeeExperience;assert(replayed.growthEnabled===false,'legacy-growth');}
  assert(equal(snapshot.state,expected), 'state-history');
  const owned = replayed.models.filter(model=>model.company==='player');
  assert(record(snapshot.feedbackResponses) && Object.entries(snapshot.feedbackResponses).every(([id,text])=>owned.some(model=>model.id===id) && typeof text==='string' && text.length<=2000), 'feedbackResponses');
  return replayed;
}
export function encodeSave(snapshot) {
  validateSnapshot(snapshot);
  const raw=JSON.stringify(snapshot);
  assert(raw.length<=2_000_000,'raw-size');
  return raw;
}
export function decodeSave(raw) {
  try {
    assert(typeof raw==='string' && raw.length<=2_000_000,'raw');
    let snapshot=JSON.parse(raw);
    const replayed=validateSnapshot(snapshot,true);
    const migratedFrom=snapshot.schemaVersion===SCHEMA_VERSION?null:snapshot.schemaVersion;
    if(migratedFrom){
      let migrated=replayed;
      if(!replayed.growthEnabled&&!replayed.ending){const result=applyAction(replayed,{type:'enableGrowth'});assert(result.ok,'growth-migration');migrated=result.state;}
      snapshot={...snapshot,schemaVersion:SCHEMA_VERSION,state:migrated};
    }
    snapshot.state.paused=true;
    return migratedFrom?{ok:true,snapshot,migratedFrom}:{ok:true,snapshot};
  } catch(error) {
    return {ok:false,error:error instanceof SyntaxError?'存档无法解析，请保留原存档或明确选择重新开始。':error.message};
  }
}
