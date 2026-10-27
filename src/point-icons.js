// One pixel definition is shared by Canvas effects and interface labels.
const rect=(x,y,w,h,fill)=>({x,y,w,h,fill});
export const POINT_ICONS={
  coding:{label:'编程',color:'#2875b5',pixels:[rect(0,2,16,12,'#213e58'),rect(1,3,14,10,'#e3f5ff'),rect(1,3,14,2,'#70bde8'),rect(4,7,2,1,'#2875b5'),rect(3,8,2,1,'#2875b5'),rect(4,9,2,1,'#2875b5'),rect(10,7,2,1,'#2875b5'),rect(11,8,2,1,'#2875b5'),rect(10,9,2,1,'#2875b5'),rect(7,10,2,1,'#2875b5'),rect(3,14,10,1,'#213e58')]},
  office:{label:'办公',color:'#398452',pixels:[rect(3,0,9,15,'#28533d'),rect(4,1,7,13,'#f0ffea'),rect(11,3,2,12,'#28533d'),rect(11,4,1,10,'#f0ffea'),rect(10,1,1,3,'#7fbc7b'),rect(11,2,1,2,'#7fbc7b'),rect(5,5,6,1,'#398452'),rect(5,7,6,1,'#398452'),rect(5,10,2,2,'#85bd69'),rect(8,9,3,3,'#398452')]},
  multimodal:{label:'多模态',color:'#9954ac',pixels:[rect(0,3,14,12,'#563566'),rect(1,4,12,10,'#f4e8ff'),rect(8,5,2,2,'#edbd53'),rect(2,10,3,3,'#bd8ed0'),rect(3,8,1,2,'#bd8ed0'),rect(6,11,6,2,'#9954ac'),rect(8,9,2,2,'#9954ac'),rect(13,1,2,7,'#563566'),rect(11,0,4,2,'#9954ac'),rect(11,7,3,2,'#9954ac')]},
};
export function drawPointIcon(context,direction,x,y,size=32){
  const icon=POINT_ICONS[direction];if(!icon)return;
  const scale=Math.max(1,Math.round(size/16));
  for(const pixel of icon.pixels){context.fillStyle=pixel.fill;context.fillRect(Math.round(x)+pixel.x*scale,Math.round(y)+pixel.y*scale,pixel.w*scale,pixel.h*scale);}
}
export function createDirectionIcon(direction){
  const icon=POINT_ICONS[direction],span=document.createElement('span');span.className='direction-icon';span.dataset.direction=direction;span.setAttribute('aria-hidden','true');
  if(!icon)return span;
  const namespace='http://www.w3.org/2000/svg',svg=document.createElementNS(namespace,'svg');svg.setAttribute('viewBox','0 0 16 16');svg.setAttribute('shape-rendering','crispEdges');svg.setAttribute('focusable','false');
  for(const pixel of icon.pixels){const node=document.createElementNS(namespace,'rect');for(const key of ['x','y','fill'])node.setAttribute(key,String(pixel[key]));node.setAttribute('width',pixel.w);node.setAttribute('height',pixel.h);svg.append(node);}
  span.append(svg);return span;
}
