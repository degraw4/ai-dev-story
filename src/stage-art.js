// Original integer-pixel illustrations. Callers own timing and game state.
const officeAtlas=typeof Image==='undefined'?null:new Image();if(officeAtlas)officeAtlas.src=new URL('../assets/office/office-sprites-v2.png',import.meta.url).href;
const spriteCells={avery:0,jules:1,morgan:2,casey:3,alex:4,rebo:5,karpathy:6,boris:2,tim:3,max:7};
const palettes={avery:['#9973cb','#493f4a'],jules:['#d47283','#7c4a3e'],alex:['#e4ab38','#493e33'],rebo:['#5c92c0','#51464a'],karpathy:['#4c8c72','#423f3c'],boris:['#776bbb','#644938'],tim:['#39a184','#5b473a'],max:['#d39d35','#604b3d']};
function surface(canvas){canvas.width=320;canvas.height=144;const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;const r=(x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);};return {c,r};}
function person(r,x,y,id,arms=false){const [shirt,hair]=palettes[id]||palettes.avery;r(x+1,y+24,24,5,'#314b4855');r(x+5,y,15,15,hair);r(x+7,y+4,13,12,'#edbd94');r(x+17,y+7,2,2,'#34453e');r(x+4,y+17,20,13,shirt);r(x+8,y+17,6,4,'#f7e5bd');r(x+5,y+30,6,6,'#40554b');r(x+17,y+30,6,6,'#40554b');if(arms){r(x,y+11,5,12,shirt);r(x+24,y+8,5,14,shirt);r(x,y+8,5,5,'#edbd94');r(x+24,y+5,5,5,'#edbd94');}}
export function drawPlanning(canvas,{employeeId='avery',frame=0,done=false}={}){
  const {c,r}=surface(canvas);
  // Background stays intact behind the transparent employee-and-desk sprite.
  r(0,0,320,144,'#e7edd6');
  for(let x=0;x<320;x+=16)r(x,111,1,33,'#d6dfc5');
  r(15,16,87,65,'#527263');r(19,20,79,57,'#b2d8cc');
  r(58,20,3,57,'#f7edce');r(19,47,79,3,'#f7edce');
  r(192,18,105,64,'#ac8b51');r(196,22,97,56,'#f6e8bb');
  for(let i=0;i<3;i++)r(204,31+i*14,65-i*13,3,done?'#70a36c':'#c4c597');
  if(officeAtlas?.complete&&officeAtlas.naturalWidth){
    const cell=spriteCells[employeeId]??0,sw=officeAtlas.naturalWidth/4,sh=officeAtlas.naturalHeight/3;
    c.drawImage(officeAtlas,cell%4*sw,Math.floor(cell/4)*sh,sw,sh,106,34,111,99);
  }else{
    // The fallback includes its own desk, so only one foreground is drawn.
    r(96,92,117,10,'#b58f53');r(102,102,8,30,'#806a45');r(199,102,8,30,'#806a45');
    person(r,129,58,employeeId);r(151,87,43,11,'#fffae8');
    for(let i=0;i<3;i++)r(157,89+i*3,25-i*5,1,'#80977b');
    r(148+frame%2*2,83,13,5,'#edbd94');r(157+frame%2*2,80,2,10,'#536d50');r(111,90,9,9,'#d4a356');
  }
  if(done){r(152,22,13,13,'#ffcf48');r(148,26,21,5,'#ffcf48');r(156,38,5,4,'#a38844');}
  else{r(160,41-(frame%3)*2,3,3,'#d2a94e');r(171,34,4,4,'#d2a94e');}
}
export function drawRelease(canvas,{presenter='avery'}={}){const {r}=surface(canvas);r(0,0,320,144,'#244a40');r(15,9,231,91,'#b99651');r(19,13,223,83,'#faf0cf');r(105,28,50,45,'#45685a');r(111,34,38,8,'#86c5a6');for(let j=0;j<3;j++){r(112,48+j*7,21,2,'#8faf92');r(140,48+j*7,4,3,'#efc851');}r(92,78,77,5,'#c6ad73');person(r,267,60,presenter);r(256,90,49,31,'#b68644');r(251,86,58,7,'#e7bd6c');r(0,117,320,7,'#b99651');for(let row=0;row<2;row++)for(let i=0;i<10;i++){const x=8+i*32+(row%2)*7,y=121+row*12;r(x,y,11,9,['#594e3e','#3a3f3c','#7b5c42'][i%3]);r(x-3,y+8,18,10,['#5a7771','#b17b62','#82928b'][i%3]);}r(8,20,3,77,'#edcc72');r(310,20,3,77,'#edcc72');}
export function drawCelebration(canvas,{champion=false}={}){const {r}=surface(canvas);r(0,0,320,144,'#e9edd6');r(16,20,288,80,'#d6dfc2');for(let i=0;i<4;i++)person(r,78+i*44,77,['jules','avery','alex','tim'][i],true);for(let i=0;i<24;i++)r((i*47+13)%310,10+(i*19)%78,3,5,['#dba83a','#7caa74','#9a7bc4'][i%3]);if(champion){r(145,20,28,27,'#efc14e');r(138,24,7,15,'#c79635');r(173,24,7,15,'#c79635');r(154,47,10,12,'#dcae3e');r(143,59,31,5,'#a97b39');}else{r(139,25,42,31,'#f5e5b7');r(145,32,30,3,'#809c6b');r(145,41,18,3,'#809c6b');}}
