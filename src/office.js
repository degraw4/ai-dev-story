import { employeeActivity } from './game/rules.js';
import { drawPointIcon } from './point-icons.js';

// The generated room and atlas are original assets. Employee occupancy and
// effects are rendered from the company, rather than baked into the backdrop.
const WORLD = { width:1536, height:1024 };
const EMPLOYEE_SPRITES = {avery:0,jules:1,morgan:2,casey:3,alex:4,rebo:5,karpathy:6,boris:2,tim:3,max:7};
const FOUR_SEATS = [[780,570],[1030,695],[550,695],[800,820]];
const EIGHT_SEATS = [[800,550],[950,625],[1100,700],[650,625],[800,700],[950,775],[500,700],[650,775]];

export function createOfficeRenderer(canvas) {
  const scene=canvas.parentElement;
  const context=canvas.getContext('2d');
  const background=new Image(),expandedBackground=new Image(),atlas=new Image();
  background.src=new URL('../assets/office/office-background-v2.png',import.meta.url).href;
  expandedBackground.src=new URL('../assets/office/office-expanded-v2.png',import.meta.url).href;
  atlas.src=new URL('../assets/office/office-sprites-v2.png',import.meta.url).href;
  let state={employees:[],assignments:{},seats:4,compute:2,paused:true};
  let frame=0,destroyed=false,ready=false,hasRendered=false;
  let particles=[],pointEffects=[],pointClock=0,animating=false,emittedPoints=0;
  const hotUntil=new Map();
  let viewport={width:1,height:1,ratio:1,scale:1,x:0,y:0};
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  canvas.dataset.ready='false';

  function sprite(cell,x,y,width=230) {
    const sw=atlas.naturalWidth/4,sh=atlas.naturalHeight/3,height=width*sh/sw;
    context.drawImage(atlas,(cell%4)*sw,Math.floor(cell/4)*sh,sw,sh,x-width/2,y-height*.96,width,height);
  }
  function paintRect(x,y,w,h,color){context.fillStyle=color;context.fillRect(x,y,w,h);}
  function workEffect(x,y,activity) {
    if(!activity?.active || motion.matches)return;
    const rise=frame%3*4;
    if(activity.kind==='planning'){
      paintRect(x-65,y-174-rise,15,15,'#fce06a');paintRect(x-61,y-157-rise,7,4,'#9c732e');
      paintRect(x-68,y-169-rise,21,6,'#ffdf53');
    } else if(activity.kind==='research') {
      // A working indicator, not a second or imaginary award of research points.
      paintRect(x+24,y-118,20,3,'#9feced');
      paintRect(x+24,y-110,12+(frame%3)*4,3,'#d7f7fb');

    } else if(activity.kind==='reset') {
      paintRect(x-65,y-171-rise,17,5,'#76c9ed');paintRect(x-52,y-168-rise,5,12,'#76c9ed');
    }
  }
  function flame(x,y,size){
    const unit=Math.max(3,Math.round(size/55)),base=y-size*.12,center=x-size*.23;
    for(let column=-5;column<=5;column++){
      const height=[13,24,34,29,40,45,38,28,33,23,14][column+5]+((frame+column+5)%3)*2,left=center+column*unit*2;
      paintRect(left,base-height*unit,unit*2,height*unit,'#dc4c26');
      paintRect(left,base-(height-3)*unit,unit*2,(height-3)*unit,'#ff9a26');
      if(Math.abs(column)<4)paintRect(left,base-(height-6)*unit,unit*2,(height-6)*unit,'#ffe270');
    }
    paintRect(center+((frame%3)-1)*unit*3,base-size*.4,unit,unit,'#ffe88b');
  }
  function projectLabel(prefix,x,y){
    canvas.dataset[`${prefix}LabelX`]=String((x*viewport.scale+viewport.x)*viewport.ratio);
    canvas.dataset[`${prefix}LabelY`]=String((y*viewport.scale+viewport.y)*viewport.ratio);
  }
  function draw() {
    if(destroyed)return;
    const {ratio,width,height,scale,x,y}=viewport;
    context.setTransform(ratio,0,0,ratio,0,0);
    context.imageSmoothingEnabled=false;
    context.clearRect(0,0,width,height);
    if(!ready){paintRect(0,0,width,height,'#b6c6ca');return;}
    context.translate(x,y);context.scale(scale,scale);
    const room=state.seats===8?expandedBackground:background;
    context.drawImage(room,0,0,WORLD.width,WORLD.height);
    if(state.seats===8){
      sprite(9,610,380,178);context.drawImage(room,526,327,260,113,526,327,260,113);
      sprite(10,1030,410,168);context.drawImage(room,910,365,172,79,910,365,172,79);
      projectLabel('boss',608,245);projectLabel('secretary',1025,282);
    }else{
      sprite(9,560,400,180);context.drawImage(room,480,326,265,147,480,326,265,147);
      sprite(10,973,433,174);context.drawImage(room,867,370,172,111,867,370,172,111);
      projectLabel('boss',552,257);projectLabel('secretary',975,307);
    }
    const slots=state.seats===8?EIGHT_SEATS:FOUR_SEATS;
    const size=state.seats===8?210:245;
    slots.map(([px,py],index)=>({x:px,y:py,id:state.employees[index]})).sort((a,b)=>a.y-b.y).forEach(({x:px,y:py,id})=>{
      if(id&&(hotUntil.get(id)||0)>pointClock&&!motion.matches)flame(px,py,size);
      sprite(id?EMPLOYEE_SPRITES[id]??0:8,px,py,size);
      if(id)workEffect(px,py,employeeActivity(state,id));
    });
    // Lit rack units correspond to purchased capacity. The cabinets are scenery.
    for(let unit=0;unit<8;unit++)paintRect(1301+(unit>=4?70:0),495+(unit%4)*15,12,5,unit<state.compute?'#7de0b2':'#334c59');
    context.setTransform(ratio,0,0,ratio,0,0);
    const now=Date.now();particles=particles.filter(p=>now-p.born<1400);
    for(const point of particles){
      const age=(now-point.born)/1400,px=point.x*scale+x,py=point.y*scale+y-age*42;
      context.globalAlpha=Math.min(1,(1-age)*2);context.font='bold 15px monospace';context.textAlign='center';context.lineWidth=4;context.strokeStyle='#fffdf2';context.strokeText(point.text,px,py);context.fillStyle=point.color;context.fillText(point.text,px,py);
    }
    pointEffects=pointEffects.filter(point=>pointClock-point.born<point.lifetime);
    for(const point of pointEffects){
      const seat=slots[state.employees.indexOf(point.employeeId)];if(!seat)continue;
      const age=(pointClock-point.born)/point.lifetime;
      const px=(seat[0]-size*.23)*scale+x,py=(seat[1]-size*.77)*scale+y-Math.sin(Math.min(1,age)*Math.PI/2)*28;
      const iconSize=width<500?16:32;
      context.globalAlpha=Math.min(1,(1-age)*2.5);drawPointIcon(context,point.direction,px-iconSize/2,py-iconSize,iconSize);
      context.font=`bold ${width<500?11:14}px monospace`;context.textAlign='left';context.strokeStyle='#fffdf2';context.lineWidth=3;context.strokeText('+1',px+iconSize/2+2,py-3);context.fillStyle='#263e40';context.fillText('+1',px+iconSize/2+2,py-3);
    }
    context.globalAlpha=1;canvas.dataset.pointAnimations=String(pointEffects.length);
    canvas.dataset.emittedPoints=String(emittedPoints);
    canvas.dataset.pointEmployees=pointEffects.map(point=>point.employeeId).join(',');
    canvas.dataset.burstEmployees=[...hotUntil].filter(([id,until])=>until>pointClock&&state.employees.includes(id)).map(([id])=>id).join(',');
  }
  function fitCanvas(){
    const width=Math.max(1,scene.clientWidth),height=Math.max(1,scene.clientHeight),ratio=window.devicePixelRatio||1;
    canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));
    canvas.style.width='100%';canvas.style.height='100%';canvas.style.left='0';canvas.style.top='0';
    const scale=Math.max(width/WORLD.width,height/WORLD.height);
    // Crop the surrounding neighborhood to fill the viewport, with the work
    // floor centered. Never cap the room at a tiny 2x thumbnail.
    const x=(width-WORLD.width*scale)/2;
    const y=Math.min(0,Math.max(height-WORLD.height*scale,height/2-520*scale));
    viewport={width,height,ratio,scale,x,y};canvas.dataset.pixelScale=String(scale*ratio);
    draw();
  }
  Promise.all([background.decode(),expandedBackground.decode(),atlas.decode()]).then(()=>{
    if(destroyed)return;ready=true;canvas.dataset.ready='true';fitCanvas();canvas.dispatchEvent(new Event('office-layout'));
  }).catch(()=>{canvas.dataset.ready='error';canvas.setAttribute('aria-label','办公室素材加载失败，请刷新页面');});
  const observer=new ResizeObserver(()=>{fitCanvas();canvas.dispatchEvent(new Event('office-layout'));});observer.observe(scene);
  window.addEventListener('resize',fitCanvas);
  const timer=setInterval(()=>{if(!document.hidden&&animating&&!motion.matches){frame++;draw();}},60);
  fitCanvas();
  return {
    render(nextState){
      if(nextState.project?.id!==state.project?.id||(nextState.notices?.length||0)<(state.notices?.length||0)){particles=[];pointEffects=[];hotUntil.clear();emittedPoints=0;}
      if(hasRendered&&!motion.matches){
        const fresh=(nextState.notices||[]).slice(state.notices?.length||0),slots=nextState.seats===8?EIGHT_SEATS:FOUR_SEATS;
        for(const notice of fresh){
          if(notice.type==='employee-growth'){
            const seat=slots[nextState.employees.indexOf(notice.employeeId)];if(seat)particles.push({x:seat[0]+45,y:seat[1]+12,text:'能力提升!',color:'#a86612',born:Date.now()});
          }
        }
        particles=particles.slice(-18);
      }
      hasRendered=true;state=nextState;canvas.dataset.officeTier=state.seats===8?'headquarters':'startup';canvas.dataset.people=String(state.employees.length);canvas.dataset.compute=String(state.compute);canvas.dataset.fixedStaff='boss,secretary';
      const activities=state.employees.map(id=>({id,...employeeActivity(state,id)}));
      canvas.dataset.planningEmployee=activities.find(a=>a.kind==='planning')?.id||'';
      canvas.dataset.workingEmployees=activities.filter(a=>a.active&&['planning','research'].includes(a.kind)).map(a=>a.id).join(',');
      draw();
    },
    step(elapsedMs,playing){
      animating=playing;if(playing)pointClock+=Math.max(0,elapsedMs);
      if(pointEffects.length||hotUntil.size){for(const [id,until]of hotUntil)if(until<=pointClock)hotUntil.delete(id);draw();}
    },
    showPoints(events){
      if(motion.matches)return;
      for(const event of events){
        if(event.projectId!==state.project?.id||!state.employees.includes(event.employeeId))continue;
        emittedPoints++;canvas.dataset.lastPointEmployee=event.employeeId;canvas.dataset.lastPointDirection=event.direction;canvas.dataset.lastPointDuration=String(event.lifetime);canvas.dataset.lastPointTime=String(pointClock);
        if(event.age<event.lifetime){pointEffects.push({...event,born:pointClock-event.age});if(event.burst)hotUntil.set(event.employeeId,Math.max(hotUntil.get(event.employeeId)||0,pointClock+event.lifetime-event.age));}
      }
      if(events.length)draw();
    },
    clearPoints(){pointEffects=[];hotUntil.clear();draw();},
    destroy(){destroyed=true;clearInterval(timer);observer.disconnect();window.removeEventListener('resize',fitCanvas);},
  };
}
