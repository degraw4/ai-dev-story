import { newsFor, userFeedback, mediaArticle } from './story.js';
import { rank } from './game/rules.js';
import { EMPLOYEES } from './game/content.js';
import { reachedStoryScenes } from './story-scenes.js';

// Presentation facts remain outside the economic reducer. Acknowledged IDs are
// saved with existing observations; unread items can be rebuilt after a reload.
export function unreadNotifications(state, observedIds = []) {
  const seen=new Set(observedIds),scenes=reachedStoryScenes(state,observedIds),replaced=new Set(scenes.flatMap(scene=>scene.replaces));
  const items=newsFor(state).filter(item=>!item.id.startsWith('chapter-')&&!replaced.has(item.id)).map(item=>item.employeeId?{...item,kind:'farewell',title:`${EMPLOYEES[item.employeeId].name} 的离职告别`,copy:`${item.copy}\n赔偿 ${item.compensation} 万已支付，已有研发成果保留。`}:{...item,kind:'news'});
  for(const [index,notice]of state.notices.entries())if(notice.type==='reset-complete')items.push({id:`reset-complete:${index}`,day:notice.day,kind:'ability',title:'Rebo 已重置用户额度',copy:`Rebo：“好了，让他们再试试。下次先别等投诉来了才叫我。”\n重置完成，用户评价为 ${(notice.ratingTenths/10).toFixed(1)} / 5。他已经回到研发岗位。`});
  for(const model of state.models.filter(model=>model.company==='player')){items.push({...userFeedback(model),kind:'feedback'});const historical={...state,models:state.models.filter(item=>item.sequence<=model.sequence)};const article=mediaArticle(model,rank(historical),historical.models);if(article)items.push(article);}
  items.push(...scenes.map(scene=>({...scene,kind:'story'})));
  const unread=items.filter(item=>!seen.has(item.id)).sort((a,b)=>(Number(a.kind!=='farewell')-Number(b.kind!=='farewell'))||a.day-b.day||({farewell:0,ability:1,story:2,news:3,media:4,feedback:5}[a.kind]-{farewell:0,ability:1,story:2,news:3,media:4,feedback:5}[b.kind])||a.id.localeCompare(b.id));
  if(state.project?.status==='ready'&&!state.ending){
    const id=`release-prompt:${state.project.id}`;
    if(!seen.has(id))unread.unshift({id,kind:'ready',day:state.gameDay});
  }
  return unread;
}
