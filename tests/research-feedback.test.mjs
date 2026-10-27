import test from 'node:test';
import assert from 'node:assert/strict';
import {createResearchFeedback} from '../src/research-feedback.js';
const directions=['coding','office','multimodal'];
const state=(scores,id=1)=>({project:{id,scores},employees:['avery','jules']});
const point=(employeeId,direction,burst=false)=>({type:'research-point',projectId:1,employeeId,direction,amount:1,burst,source:burst?'burst':'research'});
function drain(feedback,step=20){
  const events=[];
  for(let elapsed=0;feedback.pending&&elapsed<120000;elapsed+=step)events.push(...feedback.advance(step,true));
  assert.equal(feedback.pending,false,'a finite batch must finish');
  return events;
}
function batch(points,duration=20000){
  const feedback=createResearchFeedback(),scores=directions.map(direction=>points.filter(point=>point.direction===direction).length);
  feedback.sync(state([0,0,0]));feedback.sync(state(scores),points,duration);
  return feedback;
}

test('each emitted icon advances one attribute once, without changing committed scores',()=>{
  const feedback=createResearchFeedback(),before=state([25,25,25]),after=state([27,26,25]),snapshot=structuredClone(after);
  feedback.sync(before);feedback.sync(after,[point('avery','coding'),point('jules','office'),point('avery','coding')]);
  assert.equal(feedback.pending,true);assert.deepEqual(feedback.scores(after),before.project.scores);
  let expected=[25,25,25],count=0;
  for(let elapsed=0;feedback.pending&&elapsed<30000;elapsed+=20){
    const events=feedback.advance(20,true);assert(events.length<=1);
    for(const event of events){assert.equal(event.amount,1);expected[directions.indexOf(event.direction)]++;count++;}
    assert.deepEqual(feedback.scores(after),expected);
  }
  assert.equal(count,3);assert.equal(feedback.pending,false);assert.deepEqual(expected,after.project.scores);assert.deepEqual(after,snapshot);
});
test('manual pause freezes a batch and repeated sync does not enqueue its points twice',()=>{
  const feedback=batch([point('avery','coding'),point('avery','coding')]);
  const after=state([2,0,0]);
  assert.deepEqual(feedback.advance(10000,false),[]);assert.equal(feedback.pending,true);assert.deepEqual(feedback.scores(after),[0,0,0]);
  feedback.sync(after,[point('avery','coding'),point('avery','coding')]);
  assert.equal(feedback.advance(0,true).length,1);
  assert.equal(drain(feedback).length,1);
  assert.deepEqual(feedback.scores(after),[2,0,0]);
});
test('employees take turns globally and never overlap their own visible points, including new batches',()=>{
  const feedback=batch([point('avery','coding'),point('jules','office'),point('avery','coding',true),point('jules','office')],1000);
  const events=[];let at=0;
  events.push(...feedback.advance(0,true));
  assert.equal(feedback.advance(139,true).length,0);at+=139;
  events.push(...feedback.advance(1,true));at++;
  assert.equal(events.length,2);
  feedback.sync(state([3,2,0]),[point('avery','coding')],1000);
  while(feedback.pending&&at<10000){at+=10;events.push(...feedback.advance(10,true));}
  assert.equal(events.length,5);assert.equal(feedback.pending,false);
  const previousByEmployee=new Map();
  for(const [index,event]of events.entries()){
    assert.equal(event.age,0);
    if(index)assert(event.at-events[index-1].at>=140,'global emissions are staggered');
    const previous=previousByEmployee.get(event.employeeId);
    if(previous){assert(event.at>=previous.at+previous.lifetime,'a head has at most one visible icon');assert(event.at>=previous.at+previous.interval);}
    previousByEmployee.set(event.employeeId,event);
  }
  assert.deepEqual(feedback.scores(state([3,2,0])),[3,2,0]);
});
test('burst contributions retain a readable lifetime and arrive faster than dense normal contributions',()=>{
  const normal=batch(Array.from({length:4},()=>point('avery','coding')),1000);
  const burst=batch(Array.from({length:4},()=>point('avery','coding',true)),1000);
  assert.equal(normal.advance(0,true)[0].lifetime,950);
  assert.equal(burst.advance(0,true)[0].lifetime,650);
  assert.equal(normal.advance(750,true).length,0);
  assert.equal(burst.advance(750,true).length,1);
  assert.equal(drain(normal).length,3);assert.equal(drain(burst).length,2);
  assert.deepEqual(normal.scores(state([4,0,0])),burst.scores(state([4,0,0])));
});
test('one- and four-speed batches spread over their real day without shortening icon visibility',()=>{
  for(const speed of [1,4]){
    const duration=20000/speed,feedback=batch(Array.from({length:3},()=>point('avery','coding')),duration);
    const events=[...feedback.advance(0,true),...drain(feedback,10)];
    assert.equal(events.length,3);
    assert(events[1].at>=duration*.35,'points do not all fire at the start of the day');
    assert(events[2].at>=duration-1000&&events[2].at<=duration-900,'last point fills the end of the batch');
    for(const event of events){assert.equal(event.lifetime,950);assert(event.interval>=1100);}
  }
});
test('a long frame emits one fresh point and keeps overdue points for later real time',()=>{
  const feedback=batch([point('avery','coding'),point('jules','office'),point('avery','coding'),point('jules','office')],1000);
  const first=feedback.advance(10000,true);assert.equal(first.length,1);assert.equal(first[0].age,0);
  assert.deepEqual(feedback.advance(0,true),[]);assert.deepEqual(feedback.advance(139,true),[]);
  const second=feedback.advance(1,true);assert.equal(second.length,1);assert.equal(second[0].age,0);
  const third=feedback.advance(10000,true);assert.equal(third.length,1);assert.equal(third[0].age,0);
  assert.equal(drain(feedback).length,1);assert.deepEqual(feedback.scores(state([2,2,0])),[2,2,0]);
});
test('a dense eight-person batch can outlast its day without compressing or dropping any points',()=>{
  const counts={rebo:20,tim:24,boris:31,karpathy:39,avery:19,jules:23,max:19,morgan:18};
  const points=Object.entries(counts).flatMap(([id,count])=>Array.from({length:count},(_,index)=>point(id,directions[index%3],id==='boris'&&index<4)));
  const feedback=batch(points,5000),events=[...feedback.advance(0,true),...drain(feedback)];
  assert.equal(events.length,193);assert(events.at(-1).at>5000);
  assert(events.every(event=>event.age===0&&event.lifetime===(event.burst?650:950)));
  const expected=directions.map(direction=>points.filter(point=>point.direction===direction).length);
  assert.deepEqual(feedback.scores(state(expected)),expected);
  for(const [id,count]of Object.entries(counts))assert.equal(events.filter(event=>event.employeeId===id).length,count);
});
test('clock throttling allows continuous progress but never crosses a day with pending feedback',()=>{
  const feedback=createResearchFeedback();
  assert.equal(feedback.clockElapsed(100000,1000,20000,4),4750,'even without points one frame crosses at most one day');
  assert.equal(feedback.clockElapsed(10,1000,20000,4),10);
  feedback.sync(state([0,0,0]));feedback.sync(state([1,0,0]),[point('avery','coding')],5000);
  assert.equal(feedback.clockElapsed(100000,1000,20000,4),4749.75);
  assert.equal(feedback.clockElapsed(10,19999,20000,4),0);
  assert.equal(feedback.clockElapsed(10,1000,20000,4),10);
  feedback.advance(0,true);
  assert.equal(feedback.clockElapsed(100,19999,20000,1),0,'the final visible icon also holds the boundary');
  feedback.advance(950,true);
  assert.equal(feedback.pending,false);assert.equal(feedback.clockElapsed(100,19999,20000,4),.25);
});
test('flush, restoration, missing events and project replacement never replay pending points',()=>{
  const feedback=batch([point('avery','coding'),point('avery','coding')]);
  feedback.advance(0,true);feedback.flush();assert.equal(feedback.pending,false);assert.deepEqual(feedback.scores(state([2,0,0])),[2,0,0]);assert.deepEqual(feedback.advance(10000,true),[]);
  feedback.sync(state([50,40,30],2));assert.equal(feedback.pending,false);assert.deepEqual(feedback.scores(state([50,40,30],2)),[50,40,30]);
  feedback.sync(state([55,40,30],2));assert.deepEqual(feedback.scores(state([55,40,30],2)),[55,40,30]);
  const restored=createResearchFeedback();restored.sync(state([55,40,30],2));assert.equal(restored.pending,false);
  feedback.sync({project:null});assert.equal(feedback.pending,false);assert.deepEqual(feedback.advance(10000,true),[]);
});
test('plan and research delivered together reveal the plan first and every research point once',()=>{
  const feedback=createResearchFeedback();feedback.sync(state([25,25,25]));
  const after={...state([39,27,26]),project:{id:1,scores:[39,27,26],initialScores:[25,25,25],planScores:[37,27,26]}};
  feedback.sync(after,[point('avery','coding'),point('avery','coding')],5000);assert.deepEqual(feedback.scores(after),[37,27,26]);
  assert.equal(drain(feedback).length,2);assert.deepEqual(feedback.scores(after),[39,27,26]);
});
