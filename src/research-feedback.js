// Presentation only. Scores are committed once by the reducer, then revealed
// one point at a time. Loading/interrupting can always snap to the real totals.
const directions=['coding','office','multimodal'];
const globalInterval=140,normalLifetime=950;
export function createResearchFeedback(){
  let projectId=null,target=[],display=[],queue=[],time=0,tailUntil=0,nextGlobal=0;
  const nextEmployee=new Map();
  const pending=()=>queue.length>0||time<tailUntil;
  function flush(){queue=[];display=[...target];tailUntil=time;nextGlobal=time;nextEmployee.clear();}
  return {
    // durationMs is the real display time available for this game day.
    sync(state,events=[],durationMs=20000){
      const project=state.project;
      if(!project){projectId=null;target=[];flush();return;}
      if(projectId!==project.id){projectId=project.id;target=[...project.scores];flush();return;}
      const previous=[...target],delta=project.scores.map((value,index)=>value-target[index]);target=[...project.scores];
      if(delta.every(value=>value===0))return;
      const points=events.filter(event=>event.type==='research-point'&&event.projectId===projectId);
      const sums=directions.map(direction=>points.filter(point=>point.direction===direction).reduce((sum,point)=>sum+point.amount,0));
      const planDelivered=project.planScores&&project.initialScores&&previous.every((value,index)=>value===project.initialScores[index])&&delta.every((value,index)=>value===sums[index]+project.planScores[index]-previous[index]);
      if(points.some(point=>point.amount!==1||!directions.includes(point.direction))||(!planDelivered&&delta.some((value,index)=>value<0||value!==sums[index]))){flush();return;}
      if(planDelivered)display=[...project.planScores];
      const groups=new Map(),nextByEmployee=new Map(nextEmployee);
      for(const point of queue)nextByEmployee.set(point.employeeId,Math.max(nextByEmployee.get(point.employeeId)||time,point.at+point.interval));
      for(const point of points){
        if(!groups.has(point.employeeId))groups.set(point.employeeId,[]);
        groups.get(point.employeeId).push(point);
      }
      const span=Math.max(0,durationMs-normalLifetime-(groups.size-1)*globalInterval);
      let employeeIndex=0;
      for(const [employeeId,contributions]of groups){
        const start=time+employeeIndex++*globalInterval;
        for(const [index,point]of contributions.entries()){
          const interval=point.burst?750:1100,lifetime=point.burst?650:normalLifetime;
          const spread=contributions.length>1?span*index/(contributions.length-1):0;
          const at=Math.max(start+spread,nextByEmployee.get(employeeId)||time);
          queue.push({...point,at,interval,lifetime});nextByEmployee.set(employeeId,at+interval);
        }
      }
      queue.sort((a,b)=>a.at-b.at);
    },
    advance(elapsedMs,playing){
      if(!playing)return [];
      time+=Math.max(0,elapsedMs);
      if(time<nextGlobal)return [];
      const index=queue.findIndex(point=>point.at<=time&&(nextEmployee.get(point.employeeId)||0)<=time);
      if(index<0)return [];
      const [point]=queue.splice(index,1);
      display[directions.indexOf(point.direction)]++;
      nextGlobal=time+globalInterval;nextEmployee.set(point.employeeId,time+point.interval);
      tailUntil=Math.max(tailUntil,time+point.lifetime);
      // A delayed frame starts one fresh icon instead of replaying expired ones.
      return [{...point,at:time,age:0}];
    },
    clockElapsed(elapsedMs,dayProgressMs,dayMs,speed){
      const remaining=Math.max(0,dayMs-(pending()?1:0)-dayProgressMs);
      return Math.min(Math.max(0,elapsedMs),remaining/speed);
    },
    flush,
    get pending(){return pending();},
    scores(state){return state.project?.id===projectId?[...display]:[...(state.project?.scores||[])];},
  };
}
