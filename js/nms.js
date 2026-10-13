// Lecture 7 · Local features I: keypoints — slide 25, "(Simple) Non-Maximum Suppression".
// Self-contained: a real Harris response of a synthetic checkerboard, then greedy NMS
// (take the global max, record it, zero its window, repeat) shown step by step.

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

const SQUARE=20,SQUARES=5,SIZE=SQUARE*SQUARES;
const HARRIS_SIGMA=1.5,HARRIS_K=.05,NOISE_SIGMA=.004,NOISE_SEED=7;
const ZOOM_RADIUS=6,ZOOM_CELLS=ZOOM_RADIUS*2+1,CORNER_TOLERANCE=6;
const DEFAULTS={window:9,threshold:10,maxKeypoints:250};
const CASES=[{id:'small',window:3},{id:'large',window:49}];
const PRESETS=[{window:3,label:'Too small'},{window:9,label:'Good'},{window:49,label:'Too large'}];
const PLAY_MS=260;
const INK={red:'#e11d1d',amber:'#f5b300',cyan:'#22d3ee',yellow:'#fde047'};
const MONO='ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/* ---------- synthetic image and Harris response (pure) ---------- */

function mulberry32(seed){return()=>{seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

// 5 × 5 checkerboard filling the canvas. Edges sit on pixel centers (area-averaged), so each
// of the 4 × 4 interior X-junctions lands on one pixel; a gentle lighting falloff gives the
// corners slightly different strengths, and faint sensor noise keeps it realistic.
function makeCheckerboard(){
  const random=mulberry32(NOISE_SEED),sub=4,gray=new Float64Array(SIZE*SIZE);
  const sign=(px,py)=>(Math.floor(clamp(px,0,SIZE-1e-6)/SQUARE)+Math.floor(clamp(py,0,SIZE-1e-6)/SQUARE))%2?-1:1;
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
    let coverage=0;
    for(let v=0;v<sub;v++)for(let u=0;u<sub;u++)coverage+=sign(x-.5+(u+.5)/sub,y-.5+(v+.5)/sub);
    const light=1-.08*(.62*x/(SIZE-1)+.38*y/(SIZE-1));
    const noise=Math.sqrt(-2*Math.log(1-random()))*Math.cos(2*Math.PI*random())*NOISE_SIGMA;
    gray[y*SIZE+x]=.5+.38*light*coverage/(sub*sub)+noise;
  }
  return gray;
}

function gaussianKernel(sigma){
  const radius=Math.ceil(4*sigma),kernel=new Float64Array(radius*2+1);let sum=0;
  for(let i=-radius;i<=radius;i++){kernel[i+radius]=Math.exp(-(i*i)/(2*sigma*sigma));sum+=kernel[i+radius]}
  for(let i=0;i<kernel.length;i++)kernel[i]/=sum;return kernel;
}

// Separable Gaussian with clamp-to-edge padding (the canvas border creates no corners).
function gaussianBlur(data,w,h,sigma){
  const kernel=gaussianKernel(sigma),radius=(kernel.length-1)/2,temp=new Float64Array(w*h),out=new Float64Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0;for(let k=-radius;k<=radius;k++)sum+=data[y*w+clamp(x+k,0,w-1)]*kernel[k+radius];temp[y*w+x]=sum}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0;for(let k=-radius;k<=radius;k++)sum+=temp[clamp(y+k,0,h-1)*w+x]*kernel[k+radius];out[y*w+x]=sum}
  return out;
}

// R = det(M) − k·trace(M)², M = Gaussian-weighted sums of Ix², IxIy, Iy² (Sobel derivatives).
function harrisResponse(gray,w,h,sigma=HARRIS_SIGMA,k=HARRIS_K){
  const at=(x,y)=>gray[clamp(y,0,h-1)*w+clamp(x,0,w-1)],xx=new Float64Array(w*h),yy=new Float64Array(w*h),xy=new Float64Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const ix=(at(x+1,y-1)+2*at(x+1,y)+at(x+1,y+1)-at(x-1,y-1)-2*at(x-1,y)-at(x-1,y+1))/8;
    const iy=(at(x-1,y+1)+2*at(x,y+1)+at(x+1,y+1)-at(x-1,y-1)-2*at(x,y-1)-at(x+1,y-1))/8;
    const i=y*w+x;xx[i]=ix*ix;yy[i]=iy*iy;xy[i]=ix*iy;
  }
  const a=gaussianBlur(xx,w,h,sigma),b=gaussianBlur(yy,w,h,sigma),c=gaussianBlur(xy,w,h,sigma),response=new Float64Array(w*h);
  for(let i=0;i<response.length;i++)response[i]=a[i]*b[i]-c[i]*c[i]-k*(a[i]+b[i])**2;
  return response;
}

// Negative (edge) responses are clipped to 0; the rest is rescaled to integers 0–99 so the
// zoomed panel shows exactly the numbers the NMS loop compares.
function quantizeResponse(response){
  let max=0;for(const value of response)max=Math.max(max,value);
  const map=new Uint8Array(response.length);for(let i=0;i<map.length;i++)map[i]=Math.round(99*Math.max(0,response[i])/(max||1));
  return map;
}

function trueCorners(){const corners=[];for(let j=1;j<SQUARES;j++)for(let i=1;i<SQUARES;i++)corners.push({x:i*SQUARE,y:j*SQUARE});return corners}

let sceneCache=null;
function getScene(){
  if(!sceneCache){const gray=makeCheckerboard(),map=quantizeResponse(harrisResponse(gray,SIZE,SIZE));sceneCache={gray,map,w:SIZE,h:SIZE,corners:trueCorners()}}
  return sceneCache;
}

/* ---------- greedy NMS (pure) ---------- */

function argmax(values){let best=0,bestValue=-Infinity;for(let i=0;i<values.length;i++)if(values[i]>bestValue){bestValue=values[i];best=i}return best}

function zeroWindow(values,w,h,x,y,radius){
  let cleared=0;
  for(let yy=Math.max(0,y-radius);yy<=Math.min(h-1,y+radius);yy++)for(let xx=Math.max(0,x-radius);xx<=Math.min(w-1,x+radius);xx++){const i=yy*w+xx;if(values[i])cleared++;values[i]=0}
  return cleared;
}

// Repeat {global max of what is left → stop if count reached or max < threshold → keep it → zero its window}.
function greedyNms(map,w,h,{window,threshold,maxKeypoints}){
  const work=map.slice(),radius=(window-1)>>1,limit=Math.max(1,threshold),keypoints=[];
  for(;;){
    const index=argmax(work),x=index%w,y=(index-x)/w,value=work[index];
    if(keypoints.length>=maxKeypoints)return{keypoints,radius,window,threshold:limit,stop:{reason:'limit',x,y,value}};
    if(value<limit)return{keypoints,radius,window,threshold:limit,stop:{reason:'threshold',x,y,value}};
    keypoints.push({x,y,value,cleared:zeroWindow(work,w,h,x,y,radius)});
  }
}

function nearestCorner(corners,point){
  let best=-1,distance=Infinity;
  corners.forEach((corner,index)=>{const d=Math.max(Math.abs(corner.x-point.x),Math.abs(corner.y-point.y));if(d<distance){distance=d;best=index}});
  return{index:best,distance};
}

// First keypoint inside a corner's blob is a hit; later ones there are duplicates.
function classifyKeypoints(keypoints,corners){
  const counts=new Array(corners.length).fill(0);
  return keypoints.map(point=>{const near=nearestCorner(corners,point);if(near.distance>CORNER_TOLERANCE)return{corner:-1,role:'spurious'};counts[near.index]++;return{corner:near.index,role:counts[near.index]===1?'hit':'duplicate'}});
}

function workingMap(scene,run,steps){const work=scene.map.slice();for(let i=0;i<steps;i++)zeroWindow(work,scene.w,scene.h,run.keypoints[i].x,run.keypoints[i].y,run.radius);return work}

// Largest value left inside a corner's blob (the box in which a detection counts for it).
function blobPeak(values,scene,corner){
  let peak=0;
  for(let y=Math.max(0,corner.y-CORNER_TOLERANCE);y<=Math.min(scene.h-1,corner.y+CORNER_TOLERANCE);y++)for(let x=Math.max(0,corner.x-CORNER_TOLERANCE);x<=Math.min(scene.w-1,corner.x+CORNER_TOLERANCE);x++)peak=Math.max(peak,values[y*scene.w+x]);
  return peak;
}

// A corner is lost once nothing in its blob reaches the threshold any more, so it can never be
// picked again (values only ever decrease); `missed` is every corner without a keypoint.
function summarize(scene,run,roles,steps){
  const work=workingMap(scene,run,steps),found=new Set();let duplicates=0,spurious=0;
  for(let i=0;i<steps;i++){const role=roles[i];if(role.role==='hit')found.add(role.corner);else if(role.role==='duplicate')duplicates++;else spurious++}
  const lost=[],missed=[];
  scene.corners.forEach((corner,index)=>{if(found.has(index))return;missed.push(index);if(blobPeak(scene.map,scene,corner)>=run.threshold&&blobPeak(work,scene,corner)<run.threshold)lost.push(index)});
  return{work,found:found.size,duplicates,spurious,lost,missed,steps};
}

function finalSummary(scene,params){const run=greedyNms(scene.map,scene.w,scene.h,params),roles=classifyKeypoints(run.keypoints,scene.corners);return{run,roles,summary:summarize(scene,run,roles,run.keypoints.length)}}

const rangeCache=new Map();
function exactWindowRange(threshold,maxKeypoints){
  const key=`${threshold}|${maxKeypoints}`;if(rangeCache.has(key))return rangeCache.get(key);
  const scene=getScene(),exact=[];
  for(let window=3;window<=55;window+=2){const {run,summary}=finalSummary(scene,{window,threshold,maxKeypoints});if(run.keypoints.length===scene.corners.length&&summary.found===scene.corners.length)exact.push(window)}
  const range=exact.length?{min:exact[0],max:exact.at(-1),contiguous:exact.length===(exact.at(-1)-exact[0])/2+1}:null;
  rangeCache.set(key,range);return range;
}

/* ---------- canvas drawing ---------- */

function setupCanvas(canvas){
  const css=canvas.getBoundingClientRect().width||canvas.clientWidth||320,dpr=Math.min(3,window.devicePixelRatio||1),px=Math.max(1,Math.round(css*dpr));
  if(canvas.width!==px)canvas.width=px;if(canvas.height!==px)canvas.height=px;
  const ctx=canvas.getContext('2d');ctx.setTransform(px/css,0,0,px/css,0,0);ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,css,css);
  return{ctx,size:css};
}

function responseBitmap(values,w,h){
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const image=new ImageData(w,h);
  for(let i=0;i<values.length;i++){const g=Math.round(255*values[i]/99);image.data[i*4]=image.data[i*4+1]=image.data[i*4+2]=g;image.data[i*4+3]=255}
  canvas.getContext('2d').putImageData(image,0,0);return canvas;
}

function drawResponse(ctx,size,values){ctx.fillStyle='#000';ctx.fillRect(0,0,size,size);ctx.drawImage(responseBitmap(values,SIZE,SIZE),0,0,size,size)}

function roundedRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath()}

// Red six-armed asterisk on a white tile, as on the slide; amber tile for a duplicate.
function drawAsterisk(ctx,cx,cy,size,role='hit'){
  const half=size/2,arm=size*.32;
  ctx.save();ctx.fillStyle=role==='hit'?'#fff':INK.amber;ctx.strokeStyle='rgba(0,0,0,.6)';ctx.lineWidth=Math.max(.75,size*.06);
  roundedRect(ctx,cx-half,cy-half,size,size,size*.18);ctx.fill();ctx.stroke();
  ctx.strokeStyle=role==='hit'?INK.red:'#6b2200';ctx.lineWidth=Math.max(1.2,size*.13);ctx.lineCap='round';
  for(let i=0;i<3;i++){const angle=Math.PI/2+i*Math.PI/3,dx=Math.cos(angle)*arm,dy=Math.sin(angle)*arm;ctx.beginPath();ctx.moveTo(cx-dx,cy-dy);ctx.lineTo(cx+dx,cy+dy);ctx.stroke()}
  ctx.restore();
}

// Suppression window around (x, y) in image pixels; `origin` and `scale` map pixels to canvas units.
function drawWindow(ctx,x,y,radius,scale,origin,{width=1.5,alpha=1,dash=[5,4]}={}){
  ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=INK.red;ctx.lineWidth=width;ctx.setLineDash(dash);
  ctx.strokeRect((x-radius-origin.x)*scale+width/2,(y-radius-origin.y)*scale+width/2,(2*radius+1)*scale-width,(2*radius+1)*scale-width);ctx.restore();
}

function drawRing(ctx,cx,cy,radius,color,{width=2,dash=[]}={}){ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.stroke();ctx.restore()}

function drawZoom(canvas,scene,run,roles,steps,summary,center){
  const {ctx,size}=setupCanvas(canvas),cell=size/ZOOM_CELLS,origin={x:center.x-ZOOM_RADIUS,y:center.y-ZOOM_RADIUS},work=summary.work,keyIndex=new Map();
  run.keypoints.slice(0,steps).forEach((point,index)=>keyIndex.set(point.y*scene.w+point.x,index));
  ctx.fillStyle='#000';ctx.fillRect(0,0,size,size);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`700 ${Math.max(8,Math.round(cell*.4))}px ${MONO}`;
  for(let j=0;j<ZOOM_CELLS;j++)for(let i=0;i<ZOOM_CELLS;i++){
    const x=origin.x+i,y=origin.y+j,index=y*scene.w+x,original=scene.map[index],current=work[index],left=i*cell,top=j*cell;
    if(current>0){const g=Math.round(255*current/99);ctx.fillStyle=`rgb(${g},${g},${g})`}else ctx.fillStyle=original>0?'#2b0d0d':'#050505';
    ctx.fillRect(left+.5,top+.5,cell-1,cell-1);
    if(keyIndex.has(index))continue;
    if(current>0){ctx.fillStyle=current>55?'#111':'#f3f3f3';ctx.fillText(String(current),left+cell/2,top+cell/2+.5)}
    else if(original>0){ctx.fillStyle='#ff8f8f';ctx.fillText('0',left+cell/2,top+cell/2+.5)}
  }
  ctx.save();ctx.beginPath();ctx.rect(0,0,size,size);ctx.clip();
  run.keypoints.slice(0,steps).forEach((point,index)=>{const latest=index===steps-1;if(Math.abs(point.x-center.x)<=run.radius+ZOOM_RADIUS+1&&Math.abs(point.y-center.y)<=run.radius+ZOOM_RADIUS+1)drawWindow(ctx,point.x,point.y,run.radius,cell,origin,latest?{width:Math.max(2,cell*.09),dash:[cell*.32,cell*.2]}:{width:1.4,alpha:.6,dash:[cell*.25,cell*.2]})});
  ctx.restore();
  keyIndex.forEach((order,index)=>{const x=index%scene.w,y=(index-x)/scene.w;if(Math.abs(x-center.x)>ZOOM_RADIUS||Math.abs(y-center.y)>ZOOM_RADIUS)return;drawAsterisk(ctx,(x-origin.x+.5)*cell,(y-origin.y+.5)*cell,cell*.78,roles[order].role==='hit'?'hit':'dup')});
  const next=steps<run.keypoints.length?run.keypoints[steps]:null;
  if(next&&Math.abs(next.x-center.x)<=ZOOM_RADIUS&&Math.abs(next.y-center.y)<=ZOOM_RADIUS){ctx.save();ctx.strokeStyle=INK.yellow;ctx.lineWidth=Math.max(2,cell*.1);ctx.strokeRect((next.x-origin.x)*cell+ctx.lineWidth/2,(next.y-origin.y)*cell+ctx.lineWidth/2,cell-ctx.lineWidth,cell-ctx.lineWidth);ctx.restore()}
}

function drawExplorerMap(canvas,scene,run,roles,steps,summary,center,finished){
  const {ctx,size}=setupCanvas(canvas),scale=size/SIZE,origin={x:0,y:0},marker=clamp(scale*2.8,9,14);
  drawResponse(ctx,size,summary.work);
  run.keypoints.slice(0,steps).forEach((point,index)=>{if(index<steps-1)drawWindow(ctx,point.x,point.y,run.radius,scale,origin,{width:1,alpha:.5,dash:[4,3]})});
  if(steps)drawWindow(ctx,run.keypoints[steps-1].x,run.keypoints[steps-1].y,run.radius,scale,origin,{width:2,dash:[6,4]});
  const lost=finished?summary.missed:summary.lost;lost.forEach(index=>{const corner=scene.corners[index];drawRing(ctx,(corner.x+.5)*scale,(corner.y+.5)*scale,marker*.75,INK.cyan,{width:2,dash:[3,3]})});
  run.keypoints.slice(0,steps).forEach((point,index)=>{const cx=(point.x+.5)*scale,cy=(point.y+.5)*scale;if(roles[index].role==='hit')return;ctx.fillStyle=INK.amber;ctx.strokeStyle='#000';ctx.lineWidth=1;const s=Math.max(4,scale*1.2);ctx.fillRect(cx-s/2,cy-s/2,s,s);ctx.strokeRect(cx-s/2,cy-s/2,s,s)});
  run.keypoints.slice(0,steps).forEach((point,index)=>{if(roles[index].role==='hit')drawAsterisk(ctx,(point.x+.5)*scale,(point.y+.5)*scale,marker,'hit')});
  const next=steps<run.keypoints.length?run.keypoints[steps]:null;if(next)drawRing(ctx,(next.x+.5)*scale,(next.y+.5)*scale,marker*.7,INK.yellow,{width:2});
  ctx.save();ctx.strokeStyle=INK.red;ctx.lineWidth=2;ctx.strokeRect((center.x-ZOOM_RADIUS)*scale+1,(center.y-ZOOM_RADIUS)*scale+1,ZOOM_CELLS*scale-2,ZOOM_CELLS*scale-2);ctx.restore();
}

function drawCasePre(canvas,scene,run){
  const {ctx,size}=setupCanvas(canvas),scale=size/SIZE;drawResponse(ctx,size,scene.map);
  const first=run.keypoints[0];if(first)drawWindow(ctx,first.x,first.y,run.radius,scale,{x:0,y:0},{width:2,dash:[6,4]});
}

function drawCasePost(canvas,scene,run,roles,summary){
  const {ctx,size}=setupCanvas(canvas),scale=size/SIZE,origin={x:0,y:0},kept=new Uint8Array(scene.map.length);
  run.keypoints.forEach(point=>{kept[point.y*scene.w+point.x]=point.value});drawResponse(ctx,size,kept);
  run.keypoints.forEach(point=>drawWindow(ctx,point.x,point.y,run.radius,scale,origin,{width:1,alpha:run.radius>3?.7:.45,dash:[4,3]}));
  const pixel=Math.max(3,scale),counts=new Array(scene.corners.length).fill(0);
  run.keypoints.forEach((point,index)=>{const role=roles[index];if(role.corner>=0)counts[role.corner]++;ctx.fillStyle=role.role==='hit'?'#fff':INK.amber;ctx.fillRect((point.x+.5)*scale-pixel/2,(point.y+.5)*scale-pixel/2,pixel,pixel)});
  run.keypoints.forEach((point,index)=>{if(roles[index].role==='hit')drawRing(ctx,(point.x+.5)*scale,(point.y+.5)*scale,Math.max(5,scale*2.4),INK.red,{width:1.5})});
  summary.missed.forEach(index=>{const corner=scene.corners[index];drawRing(ctx,(corner.x+.5)*scale,(corner.y+.5)*scale,Math.max(6,scale*3),INK.cyan,{width:2,dash:[3,3]})});
  const font=clamp(Math.round(scale*3.4),9,13);ctx.font=`700 ${font}px ${MONO}`;ctx.textAlign='left';ctx.textBaseline='middle';
  counts.forEach((count,index)=>{if(count<2)return;const corner=scene.corners[index],label=`×${count}`,x=(corner.x+.5)*scale+Math.max(6,scale*3.2),y=(corner.y+.5)*scale-Math.max(6,scale*3.2),w=ctx.measureText(label).width+6;ctx.fillStyle='rgba(0,0,0,.72)';ctx.fillRect(x-3,y-font*.62,w,font*1.24);ctx.fillStyle=INK.amber;ctx.fillText(label,x,y+.5)});
}

/* ---------- page ---------- */

const PYTHON_RANGE='(3, 9, 49)';

export const NMS_PYTHON_SAMPLE=`import numpy as np
from skimage.feature import corner_harris


def checkerboard(square=20, n=5, seed=7):
    """5x5 checkerboard; its 4x4 interior X-junctions are the true corners."""
    size, sub = square * n, 4
    t = np.clip((np.arange(size * sub) + 0.5) / sub - 0.5, 0, size - 1e-6)
    cell = (t // square).astype(int)
    sign = np.where((cell[:, None] + cell[None, :]) % 2, -1.0, 1.0)
    sign = sign.reshape(size, sub, size, sub).mean(axis=(1, 3))  # anti-aliased edges
    y, x = np.mgrid[0:size, 0:size] / (size - 1)
    light = 1 - 0.08 * (0.62 * x + 0.38 * y)                      # gentle lighting falloff
    noise = np.random.default_rng(seed).normal(0, 0.004, (size, size))
    return 0.5 + 0.38 * light * sign + noise


def harris_map(image, sigma=1.5, k=0.05, pad=8):
    padded = np.pad(image, pad, mode="edge")       # clamp-to-edge: border makes no corners
    R = corner_harris(padded, method="k", k=k, sigma=sigma)[pad:-pad, pad:-pad]
    R = np.clip(R, 0, None)                         # keep the non-negative corner blobs
    return np.round(99 * R / R.max())               # same 0-99 integer scale as the demo


def greedy_nms(R, window=9, threshold=10, max_keypoints=250):
    R, r, keypoints = R.copy(), window // 2, []
    while len(keypoints) < max_keypoints:
        y, x = np.unravel_index(np.argmax(R), R.shape)   # global max of what is left
        if R[y, x] < threshold:
            break
        keypoints.append((x, y, R[y, x]))
        R[max(0, y - r):y + r + 1, max(0, x - r):x + r + 1] = 0   # zero the window
    return keypoints


R = harris_map(checkerboard())
for window in ${PYTHON_RANGE}:
    print(f"{window}x{window} window: {len(greedy_nms(R, window))} keypoints (16 true corners)")`;

export function nmsGuide(state){
  const s={...DEFAULTS,...state},radius=(s.window-1)/2,range=exactWindowRange(s.threshold,s.maxKeypoints);
  const rangeText=range?`With this threshold and keypoint limit, ${range.min} × ${range.min}${range.max>range.min?` to ${range.max} × ${range.max}`:''} windows return exactly the 16 corners.`:'With this threshold and keypoint limit, no window size returns exactly the 16 corners.';
  return{
    overview:`A real Harris response of a 5 × 5 checkerboard (16 interior X-junctions, 20 px apart) is clipped at 0 and rescaled to integers 0–99. Greedy NMS then repeats: take the largest remaining value, keep it as a keypoint, and set everything in its window to 0. ${rangeText}`,
    params:[
      {name:'Window size',value:`${s.window} × ${s.window} (radius ${radius})`,description:'Square zeroed around every kept maximum. Smaller than a corner blob leaves its shoulders behind, and they become duplicate detections; a radius of 20 px or more (the corner spacing) also erases genuine neighboring corners.',active:true},
      {name:'Stop threshold',value:`${s.threshold} of 99`,description:'The loop ends when the largest remaining value is below this. Lower values let more of each blob count as a candidate.',active:true},
      {name:'Max keypoints',value:String(s.maxKeypoints),description:'Second stopping rule: keep only the top N maxima (the lecture mentions e.g. 250) instead of sweeping until nothing is left.',active:true},
      {name:'Harris k',value:String(HARRIS_K),description:'R = det(M) − k·trace(M)². Fixed here; negative (edge) responses are clipped to 0 before NMS.',active:true},
      {name:'Window σ',value:`${HARRIS_SIGMA} px`,description:'Gaussian weighting of Ix², IxIy and Iy² inside M. Fixed here; it sets how wide each corner blob is.',active:true}
    ],
    links:[{label:'Non-maximum suppression',url:'https://en.wikipedia.org/wiki/Harris_corner_detector#Non-maximum_suppression'},{label:'Harris corner detector',url:'https://en.wikipedia.org/wiki/Harris_corner_detector'},{label:'skimage corner_harris',url:'https://scikit-image.org/docs/stable/api/skimage.feature.html#skimage.feature.corner_harris'}]
  };
}

export function createNmsExperiment(root){
  const runtime={token:0,timer:null,observer:null,frame:0};
  return{
    group:'Local features',id:'greedyNms',icon:'✱',title:'Non-maximum suppression (L7)',
    description:'Greedy NMS on a Harris response: keep the largest value, zero its window, repeat. Compare windows that are too small, just right, and too large.',
    state:{...DEFAULTS},
    mount(){const token=++runtime.token;mountNms(this,root,runtime,token)},
    destroy(){runtime.token++;stopPlayback(runtime);runtime.observer?.disconnect();runtime.observer=null;cancelAnimationFrame(runtime.frame)}
  };
}

function controlRange(id,label,min,max,value,step=1){return `<div class="control"><label for="${id}">${label}<output id="${id}Out">${value}</output></label><input id="${id}" type="range" min="${min}" max="${max}" value="${value}" step="${step}"></div>`}

function caseMarkup(item){
  return `<article class="nms-case" data-case="${item.id}"><header><b>${item.id==='small'?'Window too small':'Window too large'} · ${item.window} × ${item.window}</b><span class="nms-verdict ${item.id}" id="nmsVerdict-${item.id}">…</span></header>
    <div class="nms-pair"><figure class="nms-shot"><figcaption>Before NMS · Harris response</figcaption><canvas id="nmsPre-${item.id}" aria-label="Harris response before NMS with one ${item.window} by ${item.window} window"></canvas></figure><figure class="nms-shot"><figcaption>After greedy NMS · kept maxima</figcaption><canvas id="nmsPost-${item.id}" aria-label="Keypoints kept by greedy NMS with a ${item.window} by ${item.window} window"></canvas></figure></div>
    <p id="nmsCaseNote-${item.id}"></p></article>`;
}

const CASE_LEGEND=`<div class="nms-legend"><span><i class="nms-key-ring"></i>kept maximum (first in its blob)</span><span><i class="nms-key-dup"></i>duplicate; ×n = detections in that blob</span><span><i class="nms-key-window"></i>suppression window</span><span><i class="nms-key-lost"></i>true corner lost</span></div>`;

const LEGEND=`<div class="nms-legend"><span><i class="nms-key-kp">✱</i>keypoint (first in its blob)</span><span><i class="nms-key-dup"></i>duplicate in an already-found blob</span><span><i class="nms-key-window"></i>suppression window</span><span><i class="nms-key-next"></i>next max</span><span><i class="nms-key-zero">0</i>value zeroed by a window</span><span><i class="nms-key-lost"></i>true corner lost</span></div>`;

function mountNms(experiment,root,runtime,token){
  const s=experiment.state={...DEFAULTS,...experiment.state};
  root.innerHTML=`<div class="l4-page nms-page">
  <section class="l4-section"><header><span>Slide 25</span><h2>(Simple) non-maximum suppression on the Harris response</h2><p>The Harris operator scores how corner-like every pixel is, so each corner shows up as a small blob of high values rather than one pixel. Simplest approach: iteratively search for the max value, keep it, then zero out everything in the surrounding window. Step through it on one blob, exactly as on the slide.</p></header>
    <div class="controls nms-controls">${controlRange('nmsWindow','Window size (w × w)',3,55,s.window,2)}${controlRange('nmsThreshold','Stop threshold (of 99)',1,60,s.threshold)}${controlRange('nmsMax','Max keypoints (top N)',1,250,s.maxKeypoints)}</div>
    <div class="l4-presets nms-presets" role="group" aria-label="Window size presets"><span>Window presets</span>${PRESETS.map(item=>`<button type="button" data-window="${item.window}">${item.label} · ${item.window} × ${item.window}</button>`).join('')}</div>
    <div class="nms-explorer">
      <figure class="nms-panel"><figcaption><span>Zoomed blob · values R (0–99)</span><small id="nmsZoomMeta">—</small><button type="button" class="nms-follow" id="nmsFollow" hidden>Follow max</button></figcaption><div class="nms-stage"><canvas id="nmsZoom" aria-label="Zoomed Harris response values around one corner"></canvas></div></figure>
      <figure class="nms-panel"><figcaption><span>Harris operator · working map</span><small>tap to move the red zoom box</small></figcaption><div class="nms-stage"><canvas id="nmsMap" class="nms-map" aria-label="Harris response map being suppressed; tap to choose the zoomed area"></canvas></div></figure>
    </div>
    <div class="nms-playback"><div class="nms-buttons"><button type="button" class="button" id="nmsStep">Step</button><button type="button" class="button ghost" id="nmsPlay">Play</button><button type="button" class="button ghost" id="nmsFinish">Run to end</button><button type="button" class="button ghost" id="nmsReset">Reset</button></div><p class="nms-status" id="nmsStatus" role="status" aria-live="polite">—</p></div>
    <div class="nms-stats" id="nmsStats"></div>
    ${LEGEND}
  </section>
  <section class="l4-section"><header><span>Speaker notes · slide 25</span><h2>The window size is a hyperparameter</h2><p>Same Harris response, same stop threshold (${DEFAULTS.threshold}) and limit (${DEFAULTS.maxKeypoints}); only the window changes. Each case shows the response before NMS (with one window drawn at the strongest corner) and the maxima that survive greedy NMS.</p></header>
    <div class="nms-cases">${CASES.map(caseMarkup).join('')}</div>
    ${CASE_LEGEND}
  </section></div>`;

  runtime.scene=getScene();runtime.pinned=null;
  runtime.cases=CASES.map(item=>({...item,...finalSummary(runtime.scene,{...DEFAULTS,window:item.window})}));
  writeCaseText(root,runtime);
  recompute(experiment,runtime);

  const bind=(id,key,format=value=>value)=>{const input=root.querySelector(`#${id}`),output=root.querySelector(`#${id}Out`);input.addEventListener('input',()=>{s[key]=Number(input.value);output.textContent=format(s[key]);recompute(experiment,runtime);render(experiment,runtime,root)})};
  bind('nmsWindow','window',value=>`${value} × ${value}`);bind('nmsThreshold','threshold');bind('nmsMax','maxKeypoints');
  root.querySelector('#nmsWindowOut').textContent=`${s.window} × ${s.window}`;
  root.querySelector('.nms-presets').addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;const input=root.querySelector('#nmsWindow');input.value=button.dataset.window;input.dispatchEvent(new Event('input',{bubbles:true}))});
  root.querySelector('#nmsStep').onclick=()=>{stopPlayback(runtime);advance(experiment,runtime,root)};
  root.querySelector('#nmsPlay').onclick=()=>{if(runtime.timer){stopPlayback(runtime);updateButtons(runtime,root);return}if(runtime.step>=runtime.run.keypoints.length)runtime.step=0;runtime.timer=setInterval(()=>{if(token!==runtime.token){stopPlayback(runtime);return}if(!advance(experiment,runtime,root)){stopPlayback(runtime);updateButtons(runtime,root)}},PLAY_MS);render(experiment,runtime,root)};
  root.querySelector('#nmsFinish').onclick=()=>{stopPlayback(runtime);runtime.step=runtime.run.keypoints.length;render(experiment,runtime,root)};
  root.querySelector('#nmsReset').onclick=()=>{stopPlayback(runtime);runtime.step=0;runtime.pinned=null;render(experiment,runtime,root)};
  root.querySelector('#nmsFollow').onclick=()=>{runtime.pinned=null;render(experiment,runtime,root)};
  root.querySelector('#nmsMap').addEventListener('click',event=>{
    const rect=event.currentTarget.getBoundingClientRect(),x=clamp(Math.floor((event.clientX-rect.left)/rect.width*SIZE),0,SIZE-1),y=clamp(Math.floor((event.clientY-rect.top)/rect.height*SIZE),0,SIZE-1),near=nearestCorner(runtime.scene.corners,{x,y});
    runtime.pinned=near.distance<=8?{...runtime.scene.corners[near.index]}:{x,y};render(experiment,runtime,root);
  });

  runtime.observer?.disconnect();
  runtime.observer=new ResizeObserver(()=>{cancelAnimationFrame(runtime.frame);runtime.frame=requestAnimationFrame(()=>{if(token===runtime.token)render(experiment,runtime,root)})});
  runtime.observer.observe(root.querySelector('.nms-page'));
  render(experiment,runtime,root);
}

function stopPlayback(runtime){clearInterval(runtime.timer);runtime.timer=null}

function recompute(experiment,runtime){
  stopPlayback(runtime);
  const params={window:experiment.state.window,threshold:experiment.state.threshold,maxKeypoints:experiment.state.maxKeypoints};
  runtime.run=greedyNms(runtime.scene.map,SIZE,SIZE,params);runtime.roles=classifyKeypoints(runtime.run.keypoints,runtime.scene.corners);
  runtime.final=summarize(runtime.scene,runtime.run,runtime.roles,runtime.run.keypoints.length);runtime.step=0;runtime.pinned=null;
}

function advance(experiment,runtime,root){if(runtime.step>=runtime.run.keypoints.length)return false;runtime.step++;render(experiment,runtime,root);return runtime.step<runtime.run.keypoints.length}

function zoomCenter(runtime){
  const {run,step,scene}=runtime;let focus=runtime.pinned;
  if(!focus){const point=step>0?run.keypoints[step-1]:(run.keypoints[0]||run.stop),near=nearestCorner(scene.corners,point);focus=near.distance<=CORNER_TOLERANCE?scene.corners[near.index]:point}
  return{x:clamp(focus.x,ZOOM_RADIUS,SIZE-1-ZOOM_RADIUS),y:clamp(focus.y,ZOOM_RADIUS,SIZE-1-ZOOM_RADIUS)};
}

const fmt=point=>`(${point.x}, ${point.y})`;
const plural=(count,word)=>`${count} ${word}${count===1?'':'s'}`;

function verdict(run,summary,total){
  const n=run.keypoints.length,parts=[];
  if(n===total&&summary.found===total&&!summary.duplicates&&!summary.spurious)return{text:`${n} keypoints = exactly the ${total} corners`,tone:'good'};
  if(summary.duplicates)parts.push(plural(summary.duplicates,'duplicate'));
  if(summary.missed.length)parts.push(`${summary.missed.length} of ${total} corners missed`);
  if(summary.spurious)parts.push(`${summary.spurious} off-corner`);
  return{text:`${plural(n,'keypoint')}: ${parts.join(', ')||'stopped early'}`,tone:'bad'};
}

function describe(runtime,state){
  const {run,roles,step,scene}=runtime,total=run.keypoints.length,w=run.window,next=step<total?run.keypoints[step]:null;
  const stopText=run.stop.reason==='limit'?`Stopped: reached the limit of ${state.maxKeypoints} keypoints (the next max would have been ${run.stop.value}).`:`Stopped: the largest remaining value is ${run.stop.value}, below the threshold ${Math.max(1,state.threshold)}.`;
  if(step===0)return next?`Ready. The largest value is ${next.value} at ${fmt(next)} (yellow). Step keeps it as a keypoint and zeroes its ${w} × ${w} window.`:`Nothing to keep. ${stopText}`;
  const point=run.keypoints[step-1],role=roles[step-1],before=summarize(scene,run,roles,step-1),after=summarize(scene,run,roles,step);
  const wiped=after.lost.filter(index=>!before.lost.includes(index)).map(index=>scene.corners[index]);
  const corner=role.corner>=0?scene.corners[role.corner]:null,remnant=corner&&role.role==='hit'&&(corner.x!==point.x||corner.y!==point.y)&&before.work[corner.y*scene.w+corner.x]===0&&scene.map[corner.y*scene.w+corner.x]>0;
  const what=role.role==='hit'?`a new corner (${after.found} of ${scene.corners.length})${remnant?`, although only the surviving edge of its blob: an earlier window already erased its center at ${fmt(corner)}`:''}`:role.role==='duplicate'?`a duplicate: the corner at ${fmt(corner)} was already found, but this shoulder survived its window`:'a point away from every true corner';
  let text=`Iteration ${step}: kept max ${point.value} at ${fmt(point)} as ${what}. Zeroed a ${w} × ${w} window (${point.cleared} non-zero values).`;
  if(wiped.length)text+=` The window also erased ${wiped.length===1?'the genuine corner':`${wiped.length} genuine corners`} at ${wiped.map(fmt).join(', ')}.`;
  text+=next?` Next max: ${next.value} at ${fmt(next)}.`:` ${stopText}`;
  return text;
}

function updateButtons(runtime,root){
  const done=runtime.step>=runtime.run.keypoints.length;
  root.querySelector('#nmsStep').disabled=done;root.querySelector('#nmsFinish').disabled=done;root.querySelector('#nmsPlay').textContent=runtime.timer?'Pause':'Play';root.querySelector('#nmsPlay').disabled=!runtime.run.keypoints.length;
}

function render(experiment,runtime,root){
  if(!root.querySelector('#nmsZoom'))return;
  const {scene,run,roles,step}=runtime,finished=step>=run.keypoints.length,summary=summarize(scene,run,roles,step),center=zoomCenter(runtime),total=scene.corners.length;
  drawZoom(root.querySelector('#nmsZoom'),scene,run,roles,step,summary,center);
  drawExplorerMap(root.querySelector('#nmsMap'),scene,run,roles,step,summary,center,finished);
  root.querySelector('#nmsZoomMeta').textContent=`${ZOOM_CELLS} × ${ZOOM_CELLS} px around ${fmt(center)}${run.window>ZOOM_CELLS?` · ${run.window} × ${run.window} window extends past this view`:''}`;
  root.querySelector('#nmsFollow').hidden=!runtime.pinned;
  root.querySelector('#nmsStatus').textContent=describe(runtime,experiment.state);
  const final=verdict(run,runtime.final,total),lostLabel=finished?'Corners missed':'Corners lost so far',lostCount=finished?summary.missed.length:summary.lost.length;
  root.querySelector('#nmsStats').innerHTML=[
    ['Iterations (keypoints kept)',`${step}${finished?'':` / ${run.keypoints.length}`}`,''],
    ['True corners found',`${summary.found} / ${total}`,summary.found===total?'good':''],
    ['Duplicates',summary.duplicates,summary.duplicates?'bad':''],
    [lostLabel,lostCount,lostCount?'bad':''],
    ['Full run with these settings',final.text,final.tone]
  ].map(([label,value,tone])=>`<div><small>${label}</small><b class="${tone}">${value}</b></div>`).join('');
  root.querySelectorAll('.nms-presets button').forEach(button=>{const active=Number(button.dataset.window)===run.window;button.classList.toggle('active',active);button.setAttribute('aria-pressed',active)});
  updateButtons(runtime,root);
  runtime.cases.forEach(item=>{drawCasePre(root.querySelector(`#nmsPre-${item.id}`),scene,item.run);drawCasePost(root.querySelector(`#nmsPost-${item.id}`),scene,item.run,item.roles,item.summary)});
}

function writeCaseText(root,runtime){
  const total=runtime.scene.corners.length;
  runtime.cases.forEach(item=>{
    const {run,summary}=item,n=run.keypoints.length,verdictEl=root.querySelector(`#nmsVerdict-${item.id}`),note=root.querySelector(`#nmsCaseNote-${item.id}`);
    if(item.id==='small'){
      verdictEl.textContent=`${n} keypoints for ${total} corners`;
      const firstDuplicate=item.roles.findIndex(role=>role.role==='duplicate');
      note.textContent=`The ${item.window} × ${item.window} window clears only the peak and its 8 neighbors, while each blob stays above the threshold for about 3 px in every direction. The first ${firstDuplicate>=0?firstDuplicate:n} iterations pick the 16 blob centers; after that the loop keeps returning to blobs it has already found and picks their leftover shoulders. Result: ${summary.found}/${total} corners plus ${summary.duplicates} duplicates (about ${(n/total).toFixed(0)} detections per corner).`;
    }else{
      verdictEl.textContent=`${n} keypoints · ${summary.missed.length} corners lost`;
      note.textContent=`A ${item.window} × ${item.window} window has radius ${run.radius} px: it reaches past the neighboring corners ${SQUARE} px away and covers their whole blobs. The strongest corner is kept first, and its window erases its genuine neighbors before the loop ever visits them. Result: only ${summary.found} of ${total} corners survive; the ${summary.missed.length} cyan circles mark real corners that were suppressed.`;
    }
  });
}
