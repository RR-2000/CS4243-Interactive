// Lecture 8 · Local Features II: Descriptors. Two pages share one SIFT implementation (sift.js):
// the descriptor walkthrough (slides 24-28) and nearest-neighbour matching with the ratio test
// (slides 32-37). Every computation runs in the browser.
import {sift,computeDescriptor,orientationHistogram,dominantOrientations,knnMatch,descriptorDistance,SIFT_DESCRIPTOR} from './sift.js?v=1';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
// A match is correct when its nearest neighbour is the same keypoint re-detected in I₂: within
// max(MATCH_MIN_TOLERANCE px, σ′/2) of the true location and with a size within MATCH_SCALE_RATIO.
const WORK_SIDE=400,MATCH_MIN_TOLERANCE=4,MATCH_SCALE_RATIO=1.6,PAIR_GAP=16,RATIO_KEYPOINTS=500;
const SCENES=[
  // `keypoint` pins the descriptor page's default keypoint (x, y, θ), searched offline among
  // medium-scale, main-orientation keypoints whose window stays inside the image at 150% zoom. Over
  // all 130 rotation × zoom slider combinations its correct partner stays the nearest neighbour in
  // 127 (Giraffe), 120 (UTown, Corridor) and 113 (Steps). Every miss is a view where SIFT does not
  // re-detect the point, except two UTown views (15° and 105° at 130%) where the partner is re-detected
  // but is only the second nearest. Uniform weights also match at 45° and 90°; ignoring θ fails there.
  {id:'utown',label:'UTown towers',url:'images/utown_crop.png',keypoint:{x:171.6,y:224.3,angle:121.7}},
  {id:'steps',label:'Spanish Steps',url:'images/spanish steps.jpeg',keypoint:{x:221.7,y:96.6,angle:184.6}},
  {id:'corridor',label:'Car-park corridor',url:'images/Corridor_crop.png',keypoint:{x:206.2,y:200.7,angle:281.7}},
  {id:'giraffe',label:'Giraffe',url:'images/Screenshot 2026-07-29 at 09.39.17.png',keypoint:{x:230.1,y:257.6,angle:327.6}},
  {id:'toolbar',label:'Toolbar image'}
];
// View 2 = homography H applied to view 1, then a photometric change I' = gain * I + bias + noise.
// A positive theta turns the image clockwise on screen (y points down), so θ′ = θ − theta.
const VIEWS=[
  {id:'rotate',label:'Rotate 25° clockwise · zoom 1.15×',theta:25,scale:1.15,px:0,py:0,tx:12,ty:-8,gain:.9,bias:12,noise:2},
  {id:'tilt',label:'Viewpoint tilt',theta:6,scale:1,px:.0008,py:.0002,tx:-14,ty:6,gain:1.05,bias:-8,noise:2},
  {id:'zoom',label:'Zoom out 0.72× · rotate 8° anticlockwise',theta:-8,scale:.72,px:0,py:0,tx:0,ty:0,gain:.92,bias:10,noise:2},
  {id:'light',label:'Darker + noisier',theta:0,scale:1,px:0,py:0,tx:16,ty:10,gain:.55,bias:18,noise:6}
];

/* ---------- images, homographies and caching ---------- */

function mulberry32(seed){return()=>{seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

function scaledCopy(source,maxSide=WORK_SIDE){
  const sw=source.naturalWidth||source.width,sh=source.naturalHeight||source.height,s=Math.min(1,maxSide/Math.max(sw,sh)),w=Math.max(1,Math.round(sw*s)),h=Math.max(1,Math.round(sh*s));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingQuality='high';ctx.drawImage(source,0,0,w,h);
  return photoFromCanvas(canvas);
}

function photoFromCanvas(canvas){
  const w=canvas.width,h=canvas.height,pixels=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h),gray=new Float32Array(w*h);
  for(let i=0,p=0;i<pixels.data.length;i+=4,p++)gray[p]=(.299*pixels.data[i]+.587*pixels.data[i+1]+.114*pixels.data[i+2])/255;
  return{canvas,pixels,gray,w,h};
}

function loadImage(url){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(`Could not load ${url}`));image.src=url})}

const mul=(A,B)=>A.map(row=>[0,1,2].map(j=>row[0]*B[0][j]+row[1]*B[1][j]+row[2]*B[2][j]));
function invert(A){
  const [a,b,c]=A[0],[d,e,f]=A[1],[g,h,i]=A[2],det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);
  return[[(e*i-f*h)/det,(c*h-b*i)/det,(b*f-c*e)/det],[(f*g-d*i)/det,(a*i-c*g)/det,(c*d-a*f)/det],[(d*h-e*g)/det,(b*g-a*h)/det,(a*e-b*d)/det]];
}
// H acts on continuous coordinates whose pixel centres sit at index + 0.5.
function applyH(H,x,y){const X=x+.5,Y=y+.5,z=H[2][0]*X+H[2][1]*Y+H[2][2];return{x:(H[0][0]*X+H[0][1]*Y+H[0][2])/z-.5,y:(H[1][0]*X+H[1][1]*Y+H[1][2])/z-.5}}

function makeHomography(view,w,h){
  const t=view.theta*Math.PI/180,s=view.scale,c=Math.cos(t),n=Math.sin(t);
  return mul([[1,0,w/2+view.tx],[0,1,h/2+view.ty],[0,0,1]],mul([[s*c,-s*n,0],[s*n,s*c,0],[0,0,1]],mul([[1,0,0],[0,1,0],[view.px,view.py,1]],[[1,0,-w/2],[0,1,-h/2],[0,0,1]])));
}

function bilinear(data,w,h,x,y,channel){
  const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1),fx=x-x0,fy=y-y0;
  const at=(xx,yy)=>data[(yy*w+xx)*4+channel];
  return(at(x0,y0)*(1-fx)+at(x1,y0)*fx)*(1-fy)+(at(x0,y1)*(1-fx)+at(x1,y1)*fx)*fy;
}

function warpPhoto(photo,H,view){
  const {w,h,pixels}=photo,inverse=invert(H),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true}),out=ctx.createImageData(w,h),random=mulberry32(4243+Math.round(view.theta*7+view.scale*100));
  const noise=()=>Math.sqrt(-2*Math.log(1-random()))*Math.cos(2*Math.PI*random())*(view.noise||0);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const p=applyH(inverse,x,y),o=(y*w+x)*4;
    for(let ch=0;ch<3;ch++){const base=p.x<0||p.y<0||p.x>w-1||p.y>h-1?24:bilinear(pixels.data,w,h,p.x,p.y,ch);out.data[o+ch]=view.gain*base+view.bias+noise()}
    out.data[o+3]=255;
  }
  ctx.putImageData(out,0,0);
  return photoFromCanvas(canvas);
}

function siftOf(photo){const result=sift(photo.gray,photo.w,photo.h);return{...result,photo}}

function createStore(getSource,getSourceVersion){
  const photos=new Map(),features=new Map();
  const remember=(map,key,value)=>{map.set(key,value);if(map.size>8)map.delete(map.keys().next().value);return value};
  return{
    photo(sceneId){
      const key=sceneId==='toolbar'?`toolbar@${getSourceVersion()}`:sceneId;
      if(photos.has(key))return photos.get(key);
      const promise=sceneId==='toolbar'?Promise.resolve().then(()=>scaledCopy(getSource())):loadImage(SCENES.find(item=>item.id===sceneId).url).then(scaledCopy);
      promise.catch(()=>photos.delete(key));
      return remember(photos,key,promise);
    },
    features(key,make){return features.get(key)||remember(features,key,make())},
    key(sceneId){return sceneId==='toolbar'?`toolbar@${getSourceVersion()}`:sceneId}
  };
}

const nextFrame=()=>new Promise(resolve=>setTimeout(resolve,16));

/* ---------- shared drawing helpers ---------- */

function chartCanvas(canvas,fallbackHeight=220){
  const dpr=Math.min(3,window.devicePixelRatio||1),w=canvas.clientWidth||520,h=canvas.clientHeight||fallbackHeight;
  canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  return{ctx,w,h};
}

// Chart label on a translucent white box, so bars or curves behind it cannot cross the text.
function tag(ctx,text,x,y,color,align='left'){
  ctx.save();ctx.textAlign=align;const width=ctx.measureText(text).width,x0=align==='right'?x-width:align==='center'?x-width/2:x;
  ctx.fillStyle='rgba(255,255,255,.88)';ctx.fillRect(x0-3,y-10,width+6,14);ctx.fillStyle=color;ctx.fillText(text,x,y);ctx.restore();
}
// Inline SVG legend swatch that repeats the canvas styling: a line (optionally dashed) with an optional end marker.
function swatch({color,width=2,dash='',marker=''}){
  const mark=marker==='x'?`<path d="M16.5 2.5l5 5M21.5 2.5l-5 5" stroke="${color}" stroke-width="1.6"/>`:marker==='dot'?`<circle cx="11" cy="5" r="2.6" fill="${color}"/>`:marker==='ring'?`<circle cx="11" cy="5" r="4" fill="${color}" stroke="#fff" stroke-width="1.5"/>`:'';
  const line=marker==='ring'?'':`<line x1="1" y1="5" x2="${marker==='x'?15:21}" y2="5" stroke="${color}" stroke-width="${width}"${dash?` stroke-dasharray="${dash}"`:''}/>`;
  return `<svg class="l8-swatch" width="23" height="10" viewBox="0 0 23 10" aria-hidden="true">${line}${mark}</svg>`;
}
function sceneButtons(id,label){return `<div class="l4-presets l8-strip" id="${id}" role="group" aria-label="${label}"><span>${label}</span>${SCENES.map(scene=>`<button type="button" data-scene="${scene.id}">${scene.label}</button>`).join('')}</div>`}
function markActive(container,attribute,value){container?.querySelectorAll(`[data-${attribute}]`).forEach(button=>{const active=button.dataset[attribute]===String(value);button.classList.toggle('active',active);button.setAttribute('aria-pressed',active)})}

// Image-space geometry of a keypoint's descriptor window: one cell is 3 sigma at the keypoint's
// octave, i.e. 1.5 x keypoint.size image pixels, and (u, v) are cell units in the rotated frame.
function windowMapper(kp,rotate=true){
  const cell=1.5*kp.size,angle=(rotate?kp.angle:0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  return{cell,toImage:(u,v)=>({x:kp.x+cell*(u*c+v*s),y:kp.y+cell*(-u*s+v*c)})};
}

function drawCanonicalPatch(canvas,photo,kp,{rotate=true,size=112,extent=2.5,grid=true}={}){
  canvas.width=size;canvas.height=size;
  const ctx=canvas.getContext('2d'),image=ctx.createImageData(size,size),map=windowMapper(kp,rotate),{w,h,pixels}=photo;
  for(let py=0;py<size;py++)for(let px=0;px<size;px++){
    const u=((px+.5)/size*2-1)*extent,v=((py+.5)/size*2-1)*extent,p=map.toImage(u,v),o=(py*size+px)*4,inside=p.x>=0&&p.y>=0&&p.x<=w-1&&p.y<=h-1;
    for(let ch=0;ch<3;ch++)image.data[o+ch]=inside?bilinear(pixels.data,w,h,p.x,p.y,ch):30;image.data[o+3]=255;
  }
  ctx.putImageData(image,0,0);
  if(grid){const scale=size/(2*extent);ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=1;for(let k=-2;k<=2;k++){const t=size/2+k*scale;ctx.beginPath();ctx.moveTo(t,size/2-2*scale);ctx.lineTo(t,size/2+2*scale);ctx.moveTo(size/2-2*scale,t);ctx.lineTo(size/2+2*scale,t);ctx.stroke()}}
}

const binColor=bin=>`hsl(${bin*45} 72% 44%)`;
function arrow(ctx,x,y,dx,dy,head=3){const len=Math.hypot(dx,dy);if(len<.5)return;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+dx,y+dy);const a=Math.atan2(dy,dx);ctx.lineTo(x+dx-head*Math.cos(a-.5),y+dy-head*Math.sin(a-.5));ctx.moveTo(x+dx,y+dy);ctx.lineTo(x+dx-head*Math.cos(a+.5),y+dy-head*Math.sin(a+.5));ctx.stroke()}

/* =================================================================================== */
/*  SIFT descriptor walkthrough                                                         */
/* =================================================================================== */

const invarianceView=s=>({theta:s.rotation,scale:s.zoom/100,px:0,py:0,tx:0,ty:0,gain:1,bias:0,noise:0});

function transformedFeatures(store,sceneKey,s,result){
  const view=invarianceView(s),H=makeHomography(view,result.photo.w,result.photo.h);
  return{view,H,other:store.features(`${sceneKey}|inv|${s.rotation}|${s.zoom}`,()=>siftOf(warpPhoto(result.photo,H,view)))};
}

const isDefaultDescriptor=s=>s.rotate&&s.weighting&&s.clip===SIFT_DESCRIPTOR.clip;
const descriptorOf=(result,kp,s)=>isDefaultDescriptor(s)?kp.descriptor:computeDescriptor(result.pyr,kp,{rotate:s.rotate,weighting:s.weighting,clip:s.clip});
function descriptorsFor(result,s){
  const key=`${s.rotate}|${s.weighting}|${s.clip}`;result.descriptorCache=result.descriptorCache||new Map();
  if(!result.descriptorCache.has(key))result.descriptorCache.set(key,result.keypoints.map(kp=>descriptorOf(result,kp,s)));
  return result.descriptorCache.get(key);
}

// Find the keypoint SIFT re-detects at kp's true location in the transformed view: within
// max(3 px, a quarter of the expected size), a consistent scale and, when orientation
// normalization is on, an orientation within 25 degrees of the rotated θ. Then rank its descriptor.
function findCorrespondence(result,other,H,view,kp,s){
  const target=applyH(H,kp.x,kp.y),expectedSize=kp.size*view.scale,expectedAngle=(kp.angle-view.theta+720)%360,tolerance=Math.max(3,.25*expectedSize);
  let match=-1,score=Infinity,located=false;
  other.keypoints.forEach((q,i)=>{
    const d=Math.hypot(q.x-target.x,q.y-target.y),sizeError=Math.abs(Math.log(q.size/expectedSize));if(d>tolerance||sizeError>Math.log(1.6))return;
    located=true;const angleError=Math.abs(((q.angle-expectedAngle+540)%360)-180);if(s.rotate&&angleError>25)return;
    const cost=d/tolerance+2*sizeError+angleError/180;if(cost<score){score=cost;match=i}
  });
  if(match<0)return{target,match,tolerance,located,expectedAngle};
  const others=descriptorsFor(other,s),a=descriptorOf(result,kp,s),b=others[match],distance=descriptorDistance(a,b);
  let rank=1;others.forEach(q=>{if(descriptorDistance(a,q)<distance)rank++});
  return{target,match,tolerance,located,expectedAngle,a,b,distance,rank};
}

// Whole-scene view of the same test: of all keypoints whose true location stays inside the
// transformed view, how many SIFT re-detects and how many keep their partner as nearest neighbour.
// `small` counts the keypoints whose σ shrinks below 2 px in the new view (zooming out).
function repeatabilitySummary(result,other,H,view,s){
  let visible=0,redetected=0,matched=0;const small={visible:0,redetected:0};
  result.keypoints.forEach(kp=>{const t=applyH(H,kp.x,kp.y);if(t.x<8||t.y<8||t.x>other.photo.w-9||t.y>other.photo.h-9)return;visible++;const tiny=kp.size/2*view.scale<2;if(tiny)small.visible++;const c=findCorrespondence(result,other,H,view,kp,s);if(c.match>=0){redetected++;if(tiny)small.redetected++;if(c.rank===1)matched++}});
  return{visible,redetected,matched,small};
}

function orientationInfo(result,kp){
  const octave=result.pyr.octaves[kp.octave],{hist}=orientationHistogram(octave.gauss[kp.layer],octave.w,octave.h,kp.c,kp.r,Math.round(4.5*kp.octaveSigma),1.5*kp.octaveSigma);
  const peaks=dominantOrientations(hist).map(angle=>({angle,value:hist[Math.round(angle/10)%36]})),main=peaks.reduce((best,p)=>!best||p.value>best.value?p:best,null);
  return{hist,peaks,main};
}
const angleGap=(a,b)=>Math.abs(((a-b+540)%360)-180);
// Indices of the keypoints SIFT created at the same location and scale as keypoints[index], one per
// orientation, strongest histogram peak (the main orientation) first.
function siblingsOf(result,index){
  const k=result.keypoints[index],group=result.keypoints.map((kp,i)=>i).filter(i=>{const q=result.keypoints[i];return q.x===k.x&&q.y===k.y&&q.size===k.size});
  if(group.length<2)return group;
  const {hist}=orientationInfo(result,k),peak=i=>hist[Math.round(result.keypoints[i].angle/10)%36];
  return group.sort((a,b)=>peak(b)-peak(a)||result.keypoints[a].angle-result.keypoints[b].angle);
}

// Default keypoint for images without a pinned one (e.g. the toolbar image): medium scale, oriented
// along its histogram's main peak, with a window that stays inside the image at 150% zoom, and still
// the nearest neighbour after several rotations and zooms. Pinned scene defaults use the same rules.
// When no keypoint meets them all, the size range is relaxed first, then the window fit, and the
// rotation/zoom checks last: the keypoint passing the most checks wins (earlier tiers break ties).
const DEFAULT_CHECKS=[{rotation:45,zoom:100},{rotation:90,zoom:100},{rotation:135,zoom:100},{rotation:180,zoom:100},{rotation:0,zoom:70},{rotation:0,zoom:130}];
function chooseDefaultKeypoint(result,store,sceneKey){
  const {keypoints,photo}=result,cx=photo.w/2,cy=photo.h/2,limit=Math.min(photo.w,photo.h)/2-4;
  const sized=kp=>kp.size>=5&&kp.size<=24,fits=kp=>(Math.hypot(kp.x-cx,kp.y-cy)+5.3*kp.size)*1.5<=limit,main=kp=>angleGap(kp.angle,orientationInfo(result,kp).main.angle)<1;
  const tiers=[kp=>sized(kp)&&fits(kp)&&main(kp),kp=>fits(kp)&&main(kp),kp=>sized(kp)&&main(kp),main,()=>true];
  const views=DEFAULT_CHECKS.map(check=>transformedFeatures(store,sceneKey,{...SIFT_STATE_DEFAULTS,...check},result)),tried=new Set();
  let best=0,bestPassed=-1;
  for(const tier of tiers){
    const candidates=keypoints.map((kp,i)=>i).filter(i=>!tried.has(i)&&tier(keypoints[i])).slice(0,30);
    for(const i of candidates){
      tried.add(i);
      const passed=views.filter(t=>{const c=findCorrespondence(result,t.other,t.H,t.view,keypoints[i],SIFT_STATE_DEFAULTS);return c.match>=0&&c.rank===1}).length;
      if(passed===views.length)return i;
      if(passed>bestPassed){best=i;bestPassed=passed}
    }
  }
  return best;
}

function siftMarkup(){
  return `<div class="l4-page l8-page">
  <section class="l4-section" id="l8Sift"><header><span>Slides 24–27 · SIFT descriptor</span><h2>From one keypoint to 128 numbers</h2><p>Every circle is a SIFT keypoint: a location, a scale σ (circle size), and a dominant orientation θ (the tick). Click near any circle to follow that keypoint through the four steps of the descriptor. A circle with two ticks holds one keypoint per orientation; click it again to switch between them.</p></header>
    ${sceneButtons('l8SiftScenes','Scene')}
    <div class="controls l8-controls">
      <div class="control narrow"><span class="control-label">Orientation</span><div class="segment" id="l8SiftRotate"><button data-value="on">Rotate to θ</button><button data-value="off">Ignore θ</button></div></div>
      <div class="control narrow"><span class="control-label">Gradient weights</span><div class="segment" id="l8SiftWeight"><button data-value="on">Gaussian</button><button data-value="off">Uniform</button></div></div>
    </div>
    <div class="l8-grid two">
      <figure class="l8-panel"><figcaption><span>SIFT keypoints · click one</span><small id="l8SiftKpMeta">Detecting…</small></figcaption><div class="l8-stage"><canvas id="l8SiftScene" class="l8-clickable" aria-label="Scene with SIFT keypoints; click to select one"></canvas></div></figure>
      <figure class="l8-panel"><figcaption><span>Where θ comes from · slide 16</span><small>36-bin orientation histogram</small></figcaption><canvas id="l8SiftOri" class="l8-chart tall" aria-label="Orientation histogram used to assign the dominant orientation"></canvas><p class="l8-caption" id="l8SiftOriText">—</p></figure>
    </div>
    <div class="l8-grid two">
      <figure class="l8-panel"><figcaption><span>Step 1 · Normalize the keypoint neighbourhood</span><small id="l8SiftStep1Meta">—</small></figcaption>
        <div class="l8-duo"><div><span class="l8-label">Selected patch in the image</span><canvas id="l8SiftZoom" aria-label="Zoomed patch with rotated descriptor window"></canvas></div><div><span class="l8-label">Canonical 4 × 4 window</span><canvas id="l8SiftCanon" aria-label="Patch resampled into the keypoint's frame"></canvas></div></div>
        <p class="l8-caption" id="l8SiftStep1Text">—</p></figure>
      <figure class="l8-panel"><figcaption><span id="l8SiftGradTitle">Step 2 · Weighted image gradients</span><small id="l8SiftGradMeta">—</small></figcaption><div class="l8-stage dark"><canvas id="l8SiftGrad" aria-label="Gradient arrows in the canonical window"></canvas></div>
        <p class="l8-caption" id="l8SiftGradText">—</p></figure>
    </div>
    <div class="l8-grid two">
      <figure class="l8-panel"><figcaption><span>Step 3 · Pool orientations within cells</span><small>click a cell</small></figcaption><div class="l8-stage dark"><canvas id="l8SiftCells" class="l8-clickable" aria-label="Sixteen 8-bin orientation histograms drawn as stars"></canvas></div><canvas id="l8SiftCellHist" class="l8-chart short" aria-label="Orientation histogram of the selected cell"></canvas><p class="l8-caption" id="l8SiftCellText">—</p></figure>
      <figure class="l8-panel"><figcaption><span>Step 4 · Form and normalize the descriptor</span><small id="l8SiftDescMeta">—</small></figcaption><div class="l8-panel-controls"><span class="control-label">Clamp at</span><div class="segment" id="l8SiftClip" role="group" aria-label="Clamp threshold"><button data-value="1" type="button">Off</button><button data-value="0.3" type="button">0.3</button><button data-value="0.2" type="button">0.2 · SIFT</button><button data-value="0.1" type="button">0.1</button></div></div><canvas id="l8SiftDesc" class="l8-chart xtall" aria-label="128-dimensional descriptor at each normalization stage"></canvas><p class="l8-caption"><b id="l8SiftClipText">—</b> <span id="l8SiftDescNote"></span></p></figure>
    </div>
  </section>
  <section class="l4-section" id="l8SiftInvariance"><header><span>Slide 28 · SIFT is highly robust</span><h2>Same point, new view: does the descriptor stay the same?</h2><p>Rotate or zoom the scene. SIFT re-detects keypoints in the new view; the page finds the keypoint at the selected point’s true new location and compares the two descriptors. Switch “Ignore θ” on above to see rotation invariance disappear on the photographs.</p></header>
    <div class="controls l8-controls">
      <div class="control"><label for="l8InvRotate">Rotate the scene clockwise<output id="l8InvRotateOut">45°</output></label><input id="l8InvRotate" type="range" min="0" max="180" step="15" value="45"></div>
      <div class="control"><label for="l8InvZoom">Zoom<output id="l8InvZoomOut">100%</output></label><input id="l8InvZoom" type="range" min="60" max="150" step="10" value="100"></div>
    </div>
    <div class="l8-grid two">
      <figure class="l8-panel"><figcaption><span>Transformed view</span><small id="l8InvMeta">—</small></figcaption><div class="l8-stage"><canvas id="l8InvView" aria-label="Rotated or zoomed scene with the corresponding keypoint"></canvas></div><div class="l8-legend"><span><i class="gt"></i>true new location of the selected point</span><span><i class="win"></i>descriptor window of the keypoint SIFT re-detects there</span></div></figure>
      <figure class="l8-panel"><figcaption><span>Original vs. transformed descriptor</span><small id="l8InvDist">—</small></figcaption><canvas id="l8InvBars" class="l8-chart tall" aria-label="Both descriptors overlaid"></canvas><div class="l8-verdict" id="l8InvVerdict">—</div><p class="l8-caption" id="l8InvSummary">—</p></figure>
    </div>
  </section></div>`;
}

function mountSift(experiment,root,store,runtime,token){
  const s=experiment.state;runtime.request=runtime.request||0;root.innerHTML=siftMarkup();const refreshGuide=()=>root.dispatchEvent(new Event('change'));
  markActive(root.querySelector('#l8SiftScenes'),'scene',s.scene);
  const seg=(id,key)=>{const el=root.querySelector('#'+id);el.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.value===(s[key]?'on':'off')));el.onclick=event=>{const b=event.target.closest('button');if(!b)return;s[key]=b.dataset.value==='on';el.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));renderSift(experiment,root,runtime);scheduleInvariance(experiment,root,store,runtime,token);refreshGuide()}};
  seg('l8SiftRotate','rotate');seg('l8SiftWeight','weighting');
  const clip=root.querySelector('#l8SiftClip'),markClip=()=>clip.querySelectorAll('button').forEach(b=>b.classList.toggle('active',+b.dataset.value===s.clip));markClip();
  clip.onclick=event=>{const b=event.target.closest('button');if(!b)return;s.clip=+b.dataset.value;markClip();renderSift(experiment,root,runtime);scheduleInvariance(experiment,root,store,runtime,token);refreshGuide()};
  const rot=root.querySelector('#l8InvRotate'),zoom=root.querySelector('#l8InvZoom');rot.value=s.rotation;zoom.value=s.zoom;
  root.querySelector('#l8InvRotateOut').textContent=`${s.rotation}°`;root.querySelector('#l8InvZoomOut').textContent=`${s.zoom}%`;
  rot.oninput=()=>{s.rotation=+rot.value;root.querySelector('#l8InvRotateOut').textContent=`${s.rotation}°`;scheduleInvariance(experiment,root,store,runtime,token)};
  zoom.oninput=()=>{s.zoom=+zoom.value;root.querySelector('#l8InvZoomOut').textContent=`${s.zoom}%`;scheduleInvariance(experiment,root,store,runtime,token)};
  root.querySelector('#l8SiftScenes').onclick=event=>{const b=event.target.closest('button');if(!b)return;s.scene=b.dataset.scene;s.keypoint=null;s.cell=null;markActive(root.querySelector('#l8SiftScenes'),'scene',s.scene);loadSiftScene(experiment,root,store,runtime,token);refreshGuide()};
  root.querySelector('#l8SiftScene').addEventListener('click',event=>{
    const result=runtime.result;if(!result)return;const canvas=event.currentTarget,rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width*canvas.width,y=(event.clientY-rect.top)/rect.height*canvas.height;
    let best=-1,distance=Infinity;result.keypoints.forEach((kp,i)=>{const d=Math.hypot(kp.x-x,kp.y-y)-kp.size*.25;if(d<distance){distance=d;best=i}});
    if(best<0)return;
    // Keypoints sharing a location and scale differ only in θ: a new location starts at its main
    // orientation, and clicking the same location again cycles through the others.
    const group=siblingsOf(result,best),at=group.indexOf(s.keypoint);
    s.keypoint=at>=0?group[(at+1)%group.length]:group.find(i=>angleGap(result.keypoints[i].angle,orientationInfo(result,result.keypoints[i]).main.angle)<1)??best;
    s.cell=null;renderSift(experiment,root,runtime);scheduleInvariance(experiment,root,store,runtime,token);
  });
  root.querySelector('#l8SiftCells').addEventListener('click',event=>{
    const canvas=event.currentTarget,rect=canvas.getBoundingClientRect(),u=((event.clientX-rect.left)/rect.width*2-1)*2.5,v=((event.clientY-rect.top)/rect.height*2-1)*2.5;
    if(Math.abs(u)>2||Math.abs(v)>2)return;s.cell={row:clamp(Math.floor(v+2),0,3),col:clamp(Math.floor(u+2),0,3)};renderSift(experiment,root,runtime);
  });
  loadSiftScene(experiment,root,store,runtime,token);
}

async function loadSiftScene(experiment,root,store,runtime,token){
  const s=experiment.state,sceneId=s.scene,request=++runtime.request,meta=root.querySelector('#l8SiftKpMeta'),stale=()=>token!==runtime.token||request!==runtime.request;
  meta.textContent='Detecting SIFT keypoints…';runtime.result=null;
  let photo;
  try{photo=await store.photo(sceneId)}catch(error){if(!stale())meta.textContent='This image could not be loaded.';console.warn(error);return}
  if(stale())return;await nextFrame();if(stale())return;
  const sceneKey=store.key(sceneId),result=store.features(sceneKey,()=>siftOf(photo));
  if(!result.keypoints.length){meta.textContent='No SIFT keypoints found: this image has no blob-like structure. Choose another scene.';clearSiftPanels(root);return}
  // A new toolbar image keeps the page state, so a selection is only reused for the image it was made on.
  if(s.keypoint==null||s.keypoint>=result.keypoints.length||runtime.keypointKey!==sceneKey){
    // Snap to the pinned default when it is re-detected; otherwise search (slower, e.g. toolbar images).
    const pin=SCENES.find(scene=>scene.id===sceneId)?.keypoint,snapped=pin?result.keypoints.findIndex(kp=>Math.hypot(kp.x-pin.x,kp.y-pin.y)<=3&&angleGap(kp.angle,pin.angle)<=15):-1;
    s.keypoint=snapped>=0?snapped:chooseDefaultKeypoint(result,store,sceneKey);
  }
  if(stale())return;
  runtime.result=result;runtime.sceneKey=sceneKey;runtime.keypointKey=sceneKey;
  renderSift(experiment,root,runtime);scheduleInvariance(experiment,root,store,runtime,token);
}

function clearSiftPanels(root){
  ['#l8SiftScene','#l8SiftZoom','#l8SiftCanon','#l8SiftGrad','#l8SiftOri','#l8SiftCells','#l8SiftCellHist','#l8SiftDesc','#l8InvView','#l8InvBars'].forEach(id=>{const c=root.querySelector(id);if(c){c.width=c.width;}});
  ['#l8SiftStep1Text','#l8SiftOriText','#l8SiftCellText','#l8InvVerdict','#l8InvSummary'].forEach(id=>{const el=root.querySelector(id);if(el)el.textContent='—'});
}

function traceFor(result,kp,s){return computeDescriptor(result.pyr,kp,{trace:true,rotate:s.rotate,weighting:s.weighting,clip:s.clip})}

function renderSift(experiment,root,runtime){
  const result=runtime.result;if(!result||!root.querySelector('#l8SiftScene'))return;
  const s=experiment.state,kp=result.keypoints[s.keypoint],trace=traceFor(result,kp,s);runtime.trace=trace;
  drawSiftScene(root.querySelector('#l8SiftScene'),result,kp,s);
  const siblings=siblingsOf(result,s.keypoint);
  root.querySelector('#l8SiftKpMeta').textContent=`${result.keypoints.length} keypoints · selected at (${kp.x.toFixed(0)}, ${kp.y.toFixed(0)})${siblings.length>1?` · orientation ${siblings.indexOf(s.keypoint)+1} of ${siblings.length}`:''}`;
  drawSelectedPatch(root.querySelector('#l8SiftZoom'),result.photo,kp,s);
  drawCanonicalPatch(root.querySelector('#l8SiftCanon'),result.photo,kp,{rotate:s.rotate,size:180});
  const sigmaImage=kp.size/2,cellPx=1.5*kp.size;
  root.querySelector('#l8SiftStep1Meta').textContent=`σ = ${sigmaImage.toFixed(2)} px · θ = ${s.rotate?kp.angle.toFixed(0)+'°':'ignored'}`;
  root.querySelector('#l8SiftStep1Text').textContent=`The window is centred on (${kp.x.toFixed(1)}, ${kp.y.toFixed(1)}) and split into 4 × 4 cells. The slide’s 16 × 16 window is a schematic: in OpenCV’s SIFT each cell is 3σ = ${cellPx.toFixed(1)} px wide, so the window, ${(4*cellPx).toFixed(1)} px across, grows with the keypoint’s scale. ${s.rotate?`It is rotated by θ = ${kp.angle.toFixed(0)}°, the orientation from the histogram above, so the keypoint’s orientation points right in the canonical window.`:`Orientation normalization is off, so the window stays axis-aligned (the dashed arrow still shows θ = ${kp.angle.toFixed(0)}°) and the descriptor is no longer rotation invariant.`}`;
  drawGradients(root.querySelector('#l8SiftGrad'),trace,s,result.photo,kp);
  root.querySelector('#l8SiftGradMeta').textContent=`${trace.samples.length} pixels vote · ${s.weighting?'Gaussian σ = 2 cells':'uniform weights'}`;
  root.querySelector('#l8SiftGradTitle').textContent=`Step 2 · ${s.weighting?'Gaussian-weighted':'Unweighted'} image gradients`;
  root.querySelector('#l8SiftGradText').innerHTML=`m(x, y) = √(I<sub>x</sub>² + I<sub>y</sub>²), φ(x, y) = atan2(I<sub>y</sub>, I<sub>x</sub>). The window is drawn as 16 × 16 sub-squares, 4 × 4 per cell; ${trace.samples.length} pixels of the keypoint’s octave image vote, covering the 4 × 4 cells plus a half-cell margin used by the interpolation. Each arrow sums the ${s.weighting?'weighted ':''}gradients of the pixels in one sub-square and is coloured by the orientation bin it points into, measured ${s.rotate?'from θ':'from the image x-axis'}. ${s.weighting?'Arrow length is m × Gaussian weight; the dashed ring marks 1σ of the Gaussian centred on the keypoint (σ = 2 cells, half the window width).':'Uniform weights: arrow length is just m, every pixel counts fully, and there is no Gaussian ring.'} The slide also says to discard low-magnitude pixels; OpenCV and this page keep every pixel, but each vote is proportional to m, so weak gradients add little.`;
  drawOrientationHistogram(root.querySelector('#l8SiftOri'),result,kp,root.querySelector('#l8SiftOriText'),s,siblings.length);
  drawCells(root.querySelector('#l8SiftCells'),trace,s);
  drawCellHistogram(root.querySelector('#l8SiftCellHist'),trace,s,root.querySelector('#l8SiftCellText'));
  drawDescriptorBars(root.querySelector('#l8SiftDesc'),trace,s,root.querySelector('#l8SiftDescMeta'));
}

function drawSiftScene(canvas,result,selected,s){
  const {photo,keypoints}=result;canvas.width=photo.w;canvas.height=photo.h;const ctx=canvas.getContext('2d');ctx.drawImage(photo.canvas,0,0);
  ctx.fillStyle='rgba(0,0,0,.18)';ctx.fillRect(0,0,photo.w,photo.h);ctx.lineWidth=1;
  keypoints.forEach(kp=>{const r=Math.max(2,kp.size/2),a=kp.angle*Math.PI/180;ctx.strokeStyle='rgba(255,230,80,.85)';ctx.beginPath();ctx.arc(kp.x,kp.y,r,0,Math.PI*2);ctx.moveTo(kp.x,kp.y);ctx.lineTo(kp.x+r*Math.cos(a),kp.y-r*Math.sin(a));ctx.stroke()});
  const map=windowMapper(selected,s.rotate),corners=[[-2,-2],[2,-2],[2,2],[-2,2]].map(([u,v])=>map.toImage(u,v));
  ctx.lineWidth=3;ctx.strokeStyle='rgba(0,0,0,.7)';ctx.beginPath();corners.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.stroke();
  ctx.lineWidth=1.6;ctx.strokeStyle='#2563eb';ctx.stroke();
  ctx.fillStyle='#f59e0b';ctx.beginPath();ctx.arc(selected.x,selected.y,3.5,0,Math.PI*2);ctx.fill();
}

function drawSelectedPatch(canvas,photo,kp,s){
  const size=180;canvas.width=size;canvas.height=size;const ctx=canvas.getContext('2d'),map=windowMapper(kp,s.rotate),extent=2.5*Math.SQRT2*map.cell,scale=size/(2*extent);
  const image=ctx.createImageData(size,size),{w,h,pixels}=photo;
  for(let py=0;py<size;py++)for(let px=0;px<size;px++){const x=kp.x-extent+(px+.5)/scale,y=kp.y-extent+(py+.5)/scale,o=(py*size+px)*4,inside=x>=0&&y>=0&&x<=w-1&&y<=h-1;for(let ch=0;ch<3;ch++)image.data[o+ch]=inside?bilinear(pixels.data,w,h,x,y,ch):30;image.data[o+3]=255}
  ctx.putImageData(image,0,0);
  const toCanvas=p=>({x:(p.x-kp.x+extent)*scale,y:(p.y-kp.y+extent)*scale});
  ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=1;
  for(let k=-2;k<=2;k++){let a=toCanvas(map.toImage(k,-2)),b=toCanvas(map.toImage(k,2));ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();a=toCanvas(map.toImage(-2,k));b=toCanvas(map.toImage(2,k));ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}
  // The arrow is always the keypoint's θ; dashed when "Ignore θ" keeps the grid on the image axes.
  const centre=toCanvas(kp),tip=toCanvas(windowMapper(kp,true).toImage(2,0));ctx.strokeStyle='#f59e0b';ctx.lineWidth=2.5;if(!s.rotate)ctx.setLineDash([5,4]);arrow(ctx,centre.x,centre.y,tip.x-centre.x,tip.y-centre.y,7);ctx.setLineDash([]);
  ctx.fillStyle='#f59e0b';ctx.beginPath();ctx.arc(centre.x,centre.y,4,0,Math.PI*2);ctx.fill();
}

function drawGradients(canvas,trace,s,photo,kp){
  const size=360,extent=2.5,scale=size/(2*extent),sub=scale/4;canvas.width=size;canvas.height=size;const ctx=canvas.getContext('2d'),X=u=>size/2+u*scale;
  const patch=document.createElement('canvas');drawCanonicalPatch(patch,photo,kp,{rotate:s.rotate,size,extent,grid:false});
  ctx.fillStyle='#14161a';ctx.fillRect(0,0,size,size);ctx.globalAlpha=.38;ctx.drawImage(patch,0,0);ctx.globalAlpha=1;
  ctx.lineWidth=1;ctx.strokeStyle='rgba(255,255,255,.1)';
  for(let k=-8;k<=8;k++){const t=X(k/4);ctx.beginPath();ctx.moveTo(t,X(-2));ctx.lineTo(t,X(2));ctx.moveTo(X(-2),t);ctx.lineTo(X(2),t);ctx.stroke()}
  ctx.strokeStyle='rgba(255,255,255,.45)';
  for(let k=-2;k<=2;k++){ctx.beginPath();ctx.moveTo(X(k),X(-2));ctx.lineTo(X(k),X(2));ctx.moveTo(X(-2),X(k));ctx.lineTo(X(2),X(k));ctx.stroke()}
  if(s.weighting){ctx.strokeStyle='rgba(245,158,11,.85)';ctx.lineWidth=1.5;ctx.setLineDash([5,4]);ctx.beginPath();ctx.arc(size/2,size/2,2*scale,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.lineWidth=1}
  const sums=new Float64Array(16*16*2);
  trace.samples.forEach(p=>{if(Math.abs(p.u)>=2||Math.abs(p.v)>=2)return;const su=Math.floor((p.u+2)*4),sv=Math.floor((p.v+2)*4),m=p.mag*p.weight,a=p.relative*Math.PI/180,k=(sv*16+su)*2;sums[k]+=m*Math.cos(a);sums[k+1]+=m*Math.sin(a)});
  let max=0;for(let i=0;i<256;i++)max=Math.max(max,Math.hypot(sums[2*i],sums[2*i+1]));
  ctx.lineWidth=1.8;
  for(let sv=0;sv<16;sv++)for(let su=0;su<16;su++){
    const k=(sv*16+su)*2,vx=sums[k],vy=sums[k+1],len=Math.hypot(vx,vy)/(max||1)*sub*.92;if(len<1)continue;
    const a=Math.atan2(vy,vx),bin=Math.round(((a*180/Math.PI+360)%360)/45)%8,dx=len*Math.cos(a),dy=-len*Math.sin(a),cx=X(-2+(su+.5)/4),cy=X(-2+(sv+.5)/4);
    ctx.strokeStyle=binColor(bin);arrow(ctx,cx-dx/2,cy-dy/2,dx,dy,Math.min(4,len*.4));
  }
  ctx.fillStyle='rgba(255,255,255,.75)';ctx.font='10px ui-monospace, monospace';ctx.textAlign='left';ctx.fillText(s.rotate?'0° = θ (keypoint orientation) →':'0° = image x-axis →',X(-2),X(2)+14);
}

function drawOrientationHistogram(canvas,result,kp,textEl,s,siblings){
  const {hist,peaks,main}=orientationInfo(result,kp);
  const {ctx,w,h}=chartCanvas(canvas,260),left=34,right=10,top=12,bottom=30,pw=w-left-right,ph=h-top-bottom,max=Math.max(...hist)||1,bar=pw/36,binOf=a=>Math.round(a/10)%36,thetaBin=binOf(kp.angle);
  ctx.strokeStyle='#c7cad1';ctx.strokeRect(left,top,pw,ph);
  hist.forEach((v,i)=>{const bh=v/max*ph,isPeak=peaks.some(p=>binOf(p.angle)===i);ctx.fillStyle=i===thetaBin?'#f59e0b':isPeak?'#64748b':'#cbd5e1';ctx.fillRect(left+i*bar+1,top+ph-bh,bar-2,bh)});
  ctx.strokeStyle='#dc2626';ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(left,top+ph*.2);ctx.lineTo(left+pw,top+ph*.2);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#666';ctx.font='10px ui-monospace, monospace';ctx.textAlign='center';[0,90,180,270].forEach(a=>ctx.fillText(`${a}°`,left+(a/10+.5)*bar,h-14));ctx.fillText('gradient orientation (bin centres)',left+pw/2,h-4);
  // Put the 80% label at whichever end of the line has the lower bars under it.
  const label='80% of peak',lw=ctx.measureText(label).width+6,under=(x0,x1)=>Math.max(...hist.slice(Math.max(0,Math.floor((x0-left)/bar)),Math.min(36,Math.ceil((x1-left)/bar)))),rightEnd=under(left+pw-4-lw,left+pw-4)<=under(left+4,left+4+lw);
  tag(ctx,label,rightEnd?left+pw-4:left+4,top+ph*.2-4,'#dc2626',rightEnd?'right':'left');
  const isMain=angleGap(kp.angle,main.angle)<1,n=peaks.length;
  textEl.textContent=`Slide 16: θ is the mode of the gradient directions around the keypoint. Every pixel within ±4.5σ votes into 36 bins of 10° with its gradient magnitude × a Gaussian weight (σ_w = 1.5σ); the histogram is then smoothed, and each peak’s angle is refined by fitting a parabola through it and its two neighbours, so θ = ${kp.angle.toFixed(1)}° need not be a bin centre (it falls in the ${thetaBin*10}° bar, orange). ${isMain?'This is the highest peak.':`This is a secondary peak above 80% of the maximum; the highest is at ${main.angle.toFixed(0)}°.`} ${n>1?`${n} peaks reach 80% of the maximum (θ’s in orange, the other${n>2?'s':''} dark grey), so SIFT creates ${n} keypoints here, one per orientation${siblings>1?'; click the selected keypoint again to switch between them':''}.`:'Only one peak reaches 80% of the maximum, so this location gets one orientation.'}${s.rotate?'':' “Ignore θ” is on, so the descriptor below does not use θ.'}`;
}

function cellValues(trace,row,col){const n=SIFT_DESCRIPTOR.bins,start=(row*4+col)*n;return Array.from(trace.unit.slice(start,start+n))}

function drawCells(canvas,trace,s){
  const size=360,extent=2.5,scale=size/(2*extent);canvas.width=size;canvas.height=size;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#14161a';ctx.fillRect(0,0,size,size);const X=u=>size/2+u*scale;
  let max=0;for(const v of trace.unit)max=Math.max(max,v);
  for(let row=0;row<4;row++)for(let col=0;col<4;col++){
    const cell=s.cell||{row:1,col:1},cx=X(col-1.5),cy=X(row-1.5),selected=cell.row===row&&cell.col===col;
    ctx.fillStyle=selected?'rgba(37,99,235,.35)':'rgba(255,255,255,.03)';ctx.fillRect(X(col-2)+1,X(row-2)+1,scale-2,scale-2);
    ctx.strokeStyle=selected?'#60a5fa':'rgba(255,255,255,.22)';ctx.lineWidth=selected?2:1;ctx.strokeRect(X(col-2)+.5,X(row-2)+.5,scale-1,scale-1);
    cellValues(trace,row,col).forEach((v,k)=>{const len=v/(max||1)*.46*scale,a=k*Math.PI/4;ctx.strokeStyle=binColor(k);ctx.lineWidth=2;arrow(ctx,cx,cy,len*Math.cos(a),-len*Math.sin(a),Math.min(4,len*.35))});
  }
}

function drawCellHistogram(canvas,trace,s,textEl){
  const cell=s.cell||{row:1,col:1},values=cellValues(trace,cell.row,cell.col),{ctx,w,h}=chartCanvas(canvas,150),left=34,right=10,top=10,bottom=26,pw=w-left-right,ph=h-top-bottom;
  let max=0;for(const v of trace.unit)max=Math.max(max,v);
  ctx.strokeStyle='#c7cad1';ctx.strokeRect(left,top,pw,ph);const bar=pw/8;
  values.forEach((v,k)=>{const bh=v/(max||1)*ph;ctx.fillStyle=binColor(k);ctx.fillRect(left+k*bar+3,top+ph-bh,bar-6,bh)});
  ctx.fillStyle='#666';ctx.font='10px ui-monospace, monospace';ctx.textAlign='center';for(let k=0;k<8;k++)ctx.fillText(`${k*45}°`,left+(k+.5)*bar,h-12);
  ctx.fillText(s.rotate?'orientation relative to θ':'orientation from the image x-axis',left+pw/2,h-3);
  const first=(cell.row*4+cell.col)*8+1;
  textEl.textContent=`${s.cell?'Selected':'Example'} cell (row ${cell.row+1}, column ${cell.col+1}): its pixels’ ${s.weighting?'Gaussian-weighted':'unweighted'} gradient magnitudes, split into 8 orientation bins measured ${s.rotate?'relative to θ':'from the image x-axis, because orientation normalization is off'}. Each gradient shares its vote between neighbouring cells and bins (trilinear interpolation), which keeps the vector stable under small shifts. These 8 values are dimensions ${first}–${first+7} of the descriptor (shaded in step 4).`;
}

function drawDescriptorBars(canvas,trace,s,metaEl){
  const clipOn=s.clip<1,{ctx,w,h}=chartCanvas(canvas,340),left=30,right=8,gap=20,rowH=(h-30-2*gap)/3,bar=(w-left-right)/128,cell=s.cell||{row:1,col:1},band=(cell.row*4+cell.col)*8;
  const rows=[{values:trace.unit,label:'1 · normalized to unit length'},{values:trace.clipped,label:clipOn?`2 · clamped at ${s.clip.toFixed(2)}`:'2 · clamp off (unchanged)'},{values:trace.descriptor,label:'3 · normalized again = final descriptor'}];
  let max=clipOn?s.clip*1.06:0;rows.forEach(r=>r.values.forEach(v=>{max=Math.max(max,v)}));
  ctx.font='10px ui-monospace, monospace';
  rows.forEach((r,ri)=>{
    const top=6+ri*(rowH+gap),Y=v=>top+rowH-v/max*(rowH-14);
    ctx.fillStyle='rgba(37,99,235,.09)';ctx.fillRect(left+band*bar,top,8*bar,rowH);
    ctx.strokeStyle='#e2e4e9';ctx.strokeRect(left,top,w-left-right,rowH);
    for(let c=1;c<16;c++){ctx.strokeStyle='rgba(0,0,0,.06)';ctx.beginPath();ctx.moveTo(left+c*8*bar,top);ctx.lineTo(left+c*8*bar,top+rowH);ctx.stroke()}
    r.values.forEach((v,i)=>{
      const x=left+i*bar,bw=Math.max(1,bar-.4),cut=clipOn&&trace.unit[i]>s.clip;
      if(ri===0){ctx.fillStyle='#94a3b8';ctx.fillRect(x,Y(Math.min(v,clipOn?s.clip:v)),bw,top+rowH-Y(Math.min(v,clipOn?s.clip:v)));if(cut){ctx.fillStyle='#dc2626';ctx.fillRect(x,Y(v),bw,Y(s.clip)-Y(v))}}
      else if(ri===1){ctx.fillStyle=cut?'#f59e0b':'#94a3b8';ctx.fillRect(x,Y(v),bw,top+rowH-Y(v))}
      else{ctx.fillStyle='#2563eb';ctx.fillRect(x,Y(v),bw,top+rowH-Y(v))}
    });
    if(clipOn&&ri<2){const y=Y(s.clip);ctx.strokeStyle='#dc2626';ctx.setLineDash([5,3]);ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w-right,y);ctx.stroke();ctx.setLineDash([]);tag(ctx,`clamp ${s.clip.toFixed(2)}`,w-right-3,Math.max(top+11,y-3),'#dc2626','right')}
    tag(ctx,r.label,left+4,top+11,'#444');
  });
  ctx.fillStyle='#666';ctx.textAlign='center';ctx.fillText(w<420?'16 cells × 8 bins = 128':'128 dimensions = 16 cells × 8 orientation bins',left+(w-left-right)/2,h-6);
  const unit=Array.from(trace.unit),largest=Math.max(...unit),count=clipOn?unit.filter(v=>v>s.clip).length:0;
  let norm=0;for(const v of trace.clipped)norm+=v*v;const gain=1/Math.sqrt(norm);
  metaEl.textContent=clipOn?`${count} of 128 values clamped · ‖v‖ = 1`:'clamp off · ‖v‖ = 1';
  const text=document.getElementById('l8SiftClipText'),note=document.getElementById('l8SiftDescNote');
  if(text)text.textContent=!clipOn?`The clamp is off, so the final descriptor is just the unit vector; its largest value stays ${largest.toFixed(2)}.`:count===0?`No value exceeds ${s.clip.toFixed(2)} for this keypoint (largest ${largest.toFixed(2)}), so the clamp changes nothing here.`:`${count} value${count===1?'':'s'} exceed${count===1?'s':''} ${s.clip.toFixed(2)} and ${count===1?'is':'are'} clamped to it (red; the largest was ${largest.toFixed(2)}). Renormalizing then multiplies all 128 values by ${gain.toFixed(2)}, so the weaker bins gain weight relative to the strongest edges.`;
  if(note)note.textContent=`The 4 × 4 cells × 8 bins = 128 values go through slide 27’s three stages, drawn on one scale: normalize to unit length, clamp (clip) values above the threshold${clipOn?' (red dashed line)':', off here'}, then normalize again. The clamp stops a few large gradient magnitudes, such as those from non-linear lighting changes, from dominating the vector. The shaded band marks the cell selected in step 3.`;
}

/* ---- invariance check ---- */

function scheduleInvariance(experiment,root,store,runtime,token){
  clearTimeout(runtime.invTimer);
  if(!runtime.result){root.querySelector('#l8InvMeta').textContent='—';return}
  root.querySelector('#l8InvMeta').textContent='Re-detecting…';
  runtime.invTimer=setTimeout(()=>renderInvariance(experiment,root,store,runtime,token),120);
}

async function renderInvariance(experiment,root,store,runtime,token){
  const result=runtime.result;if(!result||token!==runtime.token||!root.querySelector('#l8InvView'))return;
  const s=experiment.state,{view,H,other}=transformedFeatures(store,runtime.sceneKey,s,result);
  if(token!==runtime.token)return;
  const kp=result.keypoints[s.keypoint],c=findCorrespondence(result,other,H,view,kp,s),target=c.target,summary=repeatabilitySummary(result,other,H,view,s),pct=v=>summary.visible?`${Math.round(v/summary.visible*100)}%`:'—';
  // Zooming out: the page skips OpenCV's 2× upsampling, so σ below about 1.8 px cannot be detected at all.
  const small=summary.small,rest={visible:summary.visible-small.visible,redetected:summary.redetected-small.redetected},share=g=>Math.round(g.redetected/g.visible*100);
  const zoomNote=view.scale<1&&small.visible>=5&&rest.visible&&share(small)<share(rest)?` Zooming out shrinks every σ, and this page skips OpenCV’s initial 2× upsampling, so the smallest σ it can detect is about 1.8 px: SIFT re-detects only ${share(small)}% of the ${small.visible} keypoints whose σ falls below 2 px in this view, against ${share(rest)}% of the others.`:'';
  // Gaussian weighting and the clamp target misregistration and non-linear lighting, which this test barely has.
  let settingsNote='';
  if(s.rotate&&!isDefaultDescriptor(s)){const base=repeatabilitySummary(result,other,H,view,{...s,weighting:true,clip:SIFT_DESCRIPTOR.clip}),change=Math.abs(summary.matched-base.matched)/(summary.visible||1)*100,changed=[!s.weighting&&'using uniform weights',s.clip!==SIFT_DESCRIPTOR.clip&&(s.clip<1?`clamping at ${s.clip.toFixed(2)}`:'turning the clamp off')].filter(Boolean).join(' and ');
    settingsNote=` With SIFT’s own settings (Gaussian weights, clamp at 0.2) the figure is ${pct(base.matched)}, so ${changed} ${change<=3?'barely changes it':`changes it by ${Math.round(change)} points`} here. This test is a pure rotation and zoom of the same image, with no noise, perspective or lighting change, so the only misregistration is SIFT’s own small re-detection error. Gaussian weighting protects against misregistration of the window, and the clamp against non-linear lighting changes such as saturation. No view on these pages has a non-linear lighting change: the ratio page’s “Darker + noisier” view is a linear one, which the first unit normalization already cancels.`}
  root.querySelector('#l8InvSummary').textContent=`Whole scene, same settings: of the ${summary.visible} keypoints whose true location stays in this view, SIFT re-detects ${pct(summary.redetected)} at the right place and scale${s.rotate?' and orientation':''}, and ${pct(summary.matched)} keep their correct partner as the nearest of all ${other.keypoints.length} descriptors. Single points can fail even when SIFT works well overall.${zoomNote}${settingsNote}`;
  const canvas=root.querySelector('#l8InvView');canvas.width=other.photo.w;canvas.height=other.photo.h;const ctx=canvas.getContext('2d');ctx.drawImage(other.photo.canvas,0,0);
  ctx.strokeStyle='#22d3ee';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(target.x-8,target.y);ctx.lineTo(target.x+8,target.y);ctx.moveTo(target.x,target.y-8);ctx.lineTo(target.x,target.y+8);ctx.stroke();
  const verdict=root.querySelector('#l8InvVerdict'),distEl=root.querySelector('#l8InvDist');
  const inView=target.x>=8&&target.y>=8&&target.x<=other.photo.w-9&&target.y<=other.photo.h-9;
  if(c.match<0&&!inView){root.querySelector('#l8InvMeta').textContent=`${other.keypoints.length} keypoints · point leaves the view`;verdict.className='l8-verdict bad';verdict.textContent='After this rotation and zoom the selected point’s true location falls outside the frame, so no keypoint can be found for it. Pick a keypoint nearer the centre, or a smaller change.';distEl.textContent='—';drawPairBars(root.querySelector('#l8InvBars'),traceFor(result,kp,s).descriptor,null);return}
  if(c.match<0){root.querySelector('#l8InvMeta').textContent=`${other.keypoints.length} keypoints · ${c.located?'orientation not re-detected':'none at the true location'}`;verdict.className='l8-verdict bad';verdict.textContent=c.located?`SIFT re-detected this point, but none of its orientations lies within 25° of the expected θ′ = ${c.expectedAngle.toFixed(0)}°, so there is no descriptor in the same frame to compare. Orientation assignment is not perfectly repeatable; try another keypoint.`:`SIFT did not re-detect a keypoint of similar scale within ${c.tolerance.toFixed(1)} px of this point’s true new location (cyan cross), so there is no descriptor to compare. Detection is not perfectly repeatable; try another keypoint or a smaller change.`;distEl.textContent='—';drawPairBars(root.querySelector('#l8InvBars'),traceFor(result,kp,s).descriptor,null);return}
  const q=other.keypoints[c.match],map=windowMapper(q,s.rotate),corners=[[-2,-2],[2,-2],[2,2],[-2,2]].map(([u,v])=>map.toImage(u,v));
  ctx.strokeStyle='#2563eb';ctx.lineWidth=2;ctx.beginPath();corners.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.stroke();
  root.querySelector('#l8InvMeta').textContent=`${other.keypoints.length} keypoints · θ′ = ${q.angle.toFixed(0)}°, σ′ = ${(q.size/2).toFixed(2)} px`;
  distEl.textContent=`distance ${c.distance.toFixed(3)}`;
  verdict.className=`l8-verdict ${c.rank===1?'good':'bad'}`;
  verdict.textContent=c.rank===1?`The re-detected keypoint’s descriptor is the nearest of all ${other.keypoints.length} descriptors in the new view (distance ${c.distance.toFixed(2)}), so nearest-neighbour matching finds the right point.`:`${c.rank-1} other keypoint${c.rank===2?' is':'s are'} closer to the original descriptor than the true correspondence (distance ${c.distance.toFixed(2)}), so nearest-neighbour matching would pick a wrong point.${!s.rotate&&s.rotation%360?' Orientation normalization is off, so the window did not rotate with the scene.':''}`;
  drawPairBars(root.querySelector('#l8InvBars'),c.a,c.b);
}

function drawPairBars(canvas,a,b){
  // Mirrored bars: the original descriptor grows up from the axis, the transformed one grows down.
  const {ctx,w,h}=chartCanvas(canvas,260),left=30,right=8,top=22,bottom=24,pw=w-left-right,half=(h-top-bottom)/2,axis=top+half,bar=pw/128;let max=0;[a,b].forEach(v=>v&&v.forEach(x=>{max=Math.max(max,x)}));
  ctx.strokeStyle='#e2e4e9';ctx.strokeRect(left,top,pw,2*half);
  for(let c=1;c<16;c++){ctx.strokeStyle='rgba(0,0,0,.06)';ctx.beginPath();ctx.moveTo(left+c*8*bar,top);ctx.lineTo(left+c*8*bar,top+2*half);ctx.stroke()}
  a.forEach((v,i)=>{const bh=v/(max||1)*half;ctx.fillStyle='#2563eb';ctx.fillRect(left+i*bar,axis-bh,Math.max(1,bar-.3),bh)});
  if(b)b.forEach((v,i)=>{const bh=v/(max||1)*half;ctx.fillStyle='#ea580c';ctx.fillRect(left+i*bar,axis,Math.max(1,bar-.3),bh)});
  ctx.strokeStyle='#555';ctx.beginPath();ctx.moveTo(left,axis);ctx.lineTo(left+pw,axis);ctx.stroke();
  ctx.font='10px ui-monospace, monospace';ctx.textAlign='left';ctx.fillStyle='#2563eb';ctx.fillText('▲ original view',left,top-8);ctx.fillStyle='#ea580c';ctx.fillText(b?'▼ transformed view':'▼ transformed view: no keypoint found',left+120,top-8);
  ctx.fillStyle='#666';ctx.textAlign='center';ctx.fillText('128 descriptor dimensions (16 cells × 8 bins)',left+pw/2,h-6);
}

/* =================================================================================== */
/*  Ratio test                                                                          */
/* =================================================================================== */

// Line styles shared by the pair canvas and its legend. Correct vs wrong is shown by colour and by an × at
// the I₂ end of wrong matches; accepted vs rejected by solid vs dashed (TN dotted), so colour is never the only cue.
const PAIR_STYLE={tp:{color:'rgba(22,163,74,.75)',width:1},fp:{color:'rgba(220,38,38,.95)',width:1.6,cross:true},fn:{color:'rgba(21,128,61,.95)',width:1.4,dash:[6,3]},tn:{color:'rgba(30,41,59,.62)',width:1.1,dash:[1.5,3],cross:true}};
const pairSwatch=key=>{const st=PAIR_STYLE[key];return swatch({color:st.color,width:Math.max(1.6,st.width),dash:st.dash?.join(' '),marker:st.cross?'x':''})};

function ratioMarkup(){
  return `<div class="l4-page l8-page">
  <section class="l4-section" id="l8Ratio"><header><span>Slides 32–37 · Feature matching</span><h2>Nearest neighbour + ratio test: which matches survive?</h2><p>Up to 500 of the strongest SIFT descriptors in image 1 are compared with those in image 2. Each one’s nearest neighbour is at distance d<sub>1</sub>, the second nearest at d<sub>2</sub>. The match is accepted when d<sub>1</sub> / d<sub>2</sub> &lt; τ. Image 2 is the same photograph seen through a known homography with a lighting change, so every match can be graded against ground truth: it is correct when the nearest neighbour lies within max(4 px, σ′/2) of the true location (σ′: the keypoint’s scale carried into image 2) and has a similar scale (within 1.6×). Real image pairs have no ground truth; there, geometric verification such as RANSAC (slide 33) separates consistent matches from the rest.</p></header>
    ${sceneButtons('l8RatioScenes','Scene')}
    <div class="l4-presets l8-strip" id="l8RatioViews" role="group" aria-label="View 2"><span>View 2</span>${VIEWS.map(view=>`<button type="button" data-view="${view.id}">${view.label}</button>`).join('')}</div>
    <div class="controls l8-controls">
      <div class="control narrow"><span class="control-label">Accept a match when</span><div class="segment" id="l8RatioMode"><button data-value="ratio">d₁ / d₂ &lt; τ</button><button data-value="distance">d₁ &lt; t</button></div></div>
      <div class="control wide"><label for="l8RatioThreshold"><span id="l8RatioThresholdLabel">Ratio threshold τ</span><output id="l8RatioThresholdOut">0.70</output></label><input id="l8RatioThreshold" type="range" min="0.3" max="1" step="0.01" value="0.7"></div>
      <div class="control narrow"><span class="control-label">Draw</span><div class="segment" id="l8RatioShow"><button data-value="accepted">Accepted</button><button data-value="rejected">Rejected</button><button data-value="both">Both</button></div></div>
    </div>
    <figure class="l8-panel l8-pairfig"><figcaption><span id="l8RatioPairTitle">I₁ · I₂</span><small id="l8RatioPairMeta">Detecting…</small></figcaption><div class="l8-stage"><canvas id="l8RatioPair" class="l8-clickable" aria-label="Image pair with feature matches; click a keypoint to inspect it"></canvas></div>
      <div class="l8-legend"><span>${pairSwatch('tp')}accepted, correct (TP)</span><span>${pairSwatch('fp')}accepted, wrong (FP)</span><span>${pairSwatch('fn')}rejected, correct (FN)</span><span>${pairSwatch('tn')}rejected, wrong (TN)</span><span>× marks a wrong match’s end in I₂</span><span>${swatch({color:'#facc15',width:2.5})}selected f₁ → nearest f₂</span><span>${swatch({color:'#fb923c',width:2,dash:'5 3'})}second nearest f₂′</span><span><i class="gt ring"></i>true location; circle = tolerance</span></div></figure>
    <div class="l4-presets l8-strip" id="l8RatioPick" role="group" aria-label="Jump to an example"><span>Jump to</span><button type="button" data-pick="ambiguous">An ambiguous feature</button><button type="button" data-pick="false">A false accept</button><button type="button" data-pick="true">A correct accept just below τ</button><button type="button" data-pick="missed">A correct match rejected just above τ</button></div>
    <div class="l8-inspect" id="l8RatioInspect">
      <figure><canvas id="l8RatioF1"></canvas><figcaption><b>f₁</b> query in I₁</figcaption></figure>
      <figure><canvas id="l8RatioF2"></canvas><figcaption><b>f₂</b> nearest · <span id="l8RatioD1">d₁</span></figcaption></figure>
      <figure><canvas id="l8RatioF2b"></canvas><figcaption><b>f₂′</b> second nearest · <span id="l8RatioD2">d₂</span></figcaption></figure>
      <div class="l8-inspect-text"><div class="l8-ratio-big" id="l8RatioValue">—</div><p id="l8RatioExplain">Click a keypoint in either image.</p></div>
    </div>
    <div class="l8-stats" id="l8RatioStats"></div>
    <p class="l8-feature-line" id="l8RatioFeatures"></p>
    <div class="l8-grid two">
      <figure class="l8-panel"><figcaption><span id="l8RatioDistTitle">Nearest / second-nearest distance ratio · slide 33</span><small id="l8RatioDistBin">share of each group per 0.05-wide bin</small></figcaption><canvas id="l8RatioDist" class="l8-chart tall" aria-label="Distribution of the score for correct and incorrect nearest neighbours"></canvas><div class="l8-legend"><span>${swatch({color:'#16a34a',marker:'dot'})}correct nearest neighbours</span><span>${swatch({color:'#dc2626',dash:'4 3',marker:'x'})}wrong nearest neighbours</span><span>shaded: accepted region</span><span>Slide 33 plots a density; here each point is its group’s share in one bin, so each curve sums to 100%.</span></div></figure>
      <figure class="l8-panel"><figcaption><span>ROC curve as the threshold sweeps · slide 36</span><small id="l8RatioAuc">—</small></figcaption><canvas id="l8RatioRoc" class="l8-chart tall" aria-label="ROC curves for the ratio test and a plain distance threshold"></canvas><div class="l8-legend" id="l8RatioRocLegend"></div><p class="l8-caption" id="l8RatioCompare">—</p></figure>
    </div>
    <p class="l8-note"><b>Slide 37 homework:</b> as the threshold goes from low to high, what happens to precision, recall and specificity? Sweep the slider from one end to the other, watch the three tiles, and explain each trend from the TP, FP, FN and TN counts. The ratio test rejects features whose best and second-best candidates are almost equally good, which is what repeated windows and steps produce; a plain distance threshold looks only at d₁ and cannot see that ambiguity. How much this helps depends on how many similar distractors the second image contains, so compare the two ROC curves and the equal-recall precisions for each scene and view.</p>
    <p class="l8-note" id="l8RatioCost"></p>
  </section></div>`;
}

function mountRatio(experiment,root,store,runtime,token){
  const s=experiment.state;runtime.request=runtime.request||0;root.innerHTML=ratioMarkup();const refreshGuide=()=>root.dispatchEvent(new Event('change'));
  markActive(root.querySelector('#l8RatioScenes'),'scene',s.scene);markActive(root.querySelector('#l8RatioViews'),'view',s.view);
  const segment=(id,key,after)=>{const el=root.querySelector('#'+id);el.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.value===s[key]));el.onclick=event=>{const b=event.target.closest('button');if(!b)return;s[key]=b.dataset.value;el.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));after?.();renderRatio(experiment,root,runtime);refreshGuide()}};
  segment('l8RatioMode','mode',()=>{runtime.emptyPick=null;runtime.pickIndex={};syncThreshold(s,root)});segment('l8RatioShow','show');
  const slider=root.querySelector('#l8RatioThreshold');
  slider.oninput=()=>{runtime.emptyPick=null;runtime.pickIndex={};s[s.mode==='ratio'?'ratio':'distance']=+slider.value;root.querySelector('#l8RatioThresholdOut').textContent=(+slider.value).toFixed(2);renderRatio(experiment,root,runtime)};
  syncThreshold(s,root);
  root.querySelector('#l8RatioScenes').onclick=event=>{const b=event.target.closest('button');if(!b)return;s.scene=b.dataset.scene;s.selected=null;markActive(root.querySelector('#l8RatioScenes'),'scene',s.scene);loadRatioPair(experiment,root,store,runtime,token);refreshGuide()};
  root.querySelector('#l8RatioViews').onclick=event=>{const b=event.target.closest('button');if(!b)return;s.view=b.dataset.view;s.selected=null;markActive(root.querySelector('#l8RatioViews'),'view',s.view);loadRatioPair(experiment,root,store,runtime,token);refreshGuide()};
  root.querySelector('#l8RatioPick').onclick=event=>{const b=event.target.closest('button');if(!b||!runtime.pair)return;pickExample(experiment,runtime,b.dataset.pick);renderRatio(experiment,root,runtime)};
  root.querySelector('#l8RatioPair').addEventListener('click',event=>{
    const pair=runtime.pair;if(!pair)return;const canvas=event.currentTarget,rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width*canvas.width,y=(event.clientY-rect.top)/rect.height*canvas.height,L=runtime.layout;
    let best=null,distance=14;
    pair.matches.forEach(m=>{const k1=pair.kp1[m.query],k2=pair.kp2[m.best],d1=Math.hypot(k1.x+L.o1.x-x,k1.y+L.o1.y-y),d2=Math.hypot(k2.x+L.o2.x-x,k2.y+L.o2.y-y),d=Math.min(d1,d2+(isShown(experiment.state,m)?0:6));if(d<distance){distance=d;best=m.query}});
    if(best!=null){s.selected=best;renderRatio(experiment,root,runtime)}
  });
  window.addEventListener('resize',runtime.onResize=()=>{if(token===runtime.token)renderRatio(experiment,root,runtime)});
  loadRatioPair(experiment,root,store,runtime,token);
}

function syncThreshold(s,root){
  const slider=root.querySelector('#l8RatioThreshold'),ratio=s.mode==='ratio';
  slider.min=ratio?.3:.1;slider.max=ratio?1:1.2;slider.step=.01;slider.value=ratio?s.ratio:s.distance;
  root.querySelector('#l8RatioThresholdLabel').textContent=ratio?'Ratio threshold τ':'Distance threshold t';
  root.querySelector('#l8RatioThresholdOut').textContent=(+slider.value).toFixed(2);
  root.querySelector('#l8RatioDistTitle').textContent=ratio?'Nearest / second-nearest distance ratio · slide 33':'Nearest-neighbour distance d₁';
  root.querySelector('#l8RatioDistBin').textContent=`share of each group per ${ratio?'0.05':'0.06'}-wide bin`;
  const symbol=ratio?'τ':'t';root.querySelector('#l8RatioPick [data-pick=true]').textContent=`A correct accept just below ${symbol}`;root.querySelector('#l8RatioPick [data-pick=missed]').textContent=`A correct match rejected just above ${symbol}`;
}

async function loadRatioPair(experiment,root,store,runtime,token){
  const s=experiment.state,sceneId=s.scene,viewId=s.view,request=++runtime.request,meta=root.querySelector('#l8RatioPairMeta'),stale=()=>token!==runtime.token||request!==runtime.request;
  meta.textContent='Detecting SIFT keypoints in both images…';runtime.pair=null;
  let photo;
  try{photo=await store.photo(sceneId)}catch(error){if(!stale())meta.textContent='This image could not be loaded.';console.warn(error);return}
  if(stale())return;await nextFrame();if(stale())return;
  const view=VIEWS.find(item=>item.id===viewId)||VIEWS[0],sceneKey=store.key(sceneId),base=store.features(sceneKey,()=>siftOf(photo));
  const H=makeHomography(view,photo.w,photo.h),other=store.features(`${sceneKey}|${view.id}`,()=>siftOf(warpPhoto(photo,H,view)));
  if(stale())return;
  if(base.keypoints.length<2||other.keypoints.length<2){meta.textContent='Too few SIFT keypoints in this image to match. Choose another scene.';['#l8RatioStats','#l8RatioFeatures','#l8RatioCompare','#l8RatioExplain','#l8RatioAuc','#l8RatioValue'].forEach(id=>{root.querySelector(id).textContent=''});root.querySelector('#l8RatioPairTitle').textContent='I₁ · I₂';root.querySelector('#l8RatioD1').textContent='d₁';root.querySelector('#l8RatioD2').textContent='d₂';['#l8RatioPair','#l8RatioDist','#l8RatioRoc','#l8RatioF1','#l8RatioF2','#l8RatioF2b'].forEach(id=>{const c=root.querySelector(id);c.width=c.width});return}
  runtime.pair=buildPair(base,other,H);runtime.pickIndex={};if(runtime.pairKey!==`${sceneKey}|${view.id}`){s.selected=null;runtime.pairKey=`${sceneKey}|${view.id}`}
  if(s.selected==null){pickExample(experiment,runtime,'ambiguous');if(s.selected==null)pickExample(experiment,runtime,'true')}
  renderRatio(experiment,root,runtime);
}

function buildPair(base,other,H){
  // Like cv2.SIFT_create(nfeatures=500): keep the strongest keypoints of each image.
  const kp1=base.keypoints.slice(0,RATIO_KEYPOINTS),kp2=other.keypoints.slice(0,RATIO_KEYPOINTS),{w,h}=other.photo,matches=knnMatch(kp1,kp2);
  // A keypoint of I₂ is f₁'s true partner when it is the same keypoint re-detected: within max(4 px, σ′/2)
  // of H x and with a size within 1.6× of f₁'s size carried through H (σ′ = expected σ in I₂). This is the
  // place-and-scale rule of the descriptor page, whose floor is 3 px for its exact rotations and zooms; θ is not
  // checked because it only sets the descriptor's frame.
  matches.forEach(m=>{
    const k=kp1[m.query],p=applyH(H,k.x,k.y),ax=applyH(H,k.x+.5,k.y),ay=applyH(H,k.x,k.y+.5),zoom=Math.sqrt(Math.abs((ax.x-p.x)*(ay.y-p.y)-(ax.y-p.y)*(ay.x-p.x)))/.5;
    const expectedSize=k.size*zoom,tolerance=Math.max(MATCH_MIN_TOLERANCE,.25*expectedSize),partner=q=>Math.hypot(q.x-p.x,q.y-p.y)<=tolerance&&Math.abs(Math.log(q.size/expectedSize))<=Math.log(MATCH_SCALE_RATIO);
    m.target=p;m.tolerance=tolerance;m.visible=p.x>=4&&p.y>=4&&p.x<=w-5&&p.y<=h-5;
    m.trueDistance=m.best>=0?Math.hypot(kp2[m.best].x-p.x,kp2[m.best].y-p.y):Infinity;m.sizeRatio=m.best>=0?kp2[m.best].size/expectedSize:NaN;
    m.correct=m.visible&&m.best>=0&&partner(kp2[m.best]);
    m.hasPartner=m.visible&&kp2.some(partner);
    m.secondCorrect=m.visible&&m.second>=0&&partner(kp2[m.second]);
  });
  return{base,other,kp1,kp2,H,matches,positives:matches.filter(m=>m.correct).length,roc:{ratio:rocCurve(matches,'ratio'),distance:rocCurve(matches,'d1')}};
}

function rocCurve(matches,key){
  const sorted=matches.slice().sort((a,b)=>a[key]-b[key]),P=sorted.filter(m=>m.correct).length,N=sorted.length-P,points=[{x:0,y:0}];let tp=0,fp=0,auc=0;
  sorted.forEach((m,i)=>{if(m.correct)tp++;else fp++;if(i===sorted.length-1||sorted[i+1][key]!==m[key]){const point={x:N?fp/N:0,y:P?tp/P:0};const last=points.at(-1);auc+=(point.x-last.x)*(point.y+last.y)/2;points.push(point)}});
  return{points,auc,P,N};
}

const scoreOf=(s,m)=>s.mode==='ratio'?m.ratio:m.d1;
const thresholdOf=s=>s.mode==='ratio'?s.ratio:s.distance;
const accepted=(s,m)=>scoreOf(s,m)<thresholdOf(s);
const isShown=(s,m)=>s.show==='both'||(s.show==='accepted')===accepted(s,m);

// Shortest decimal (at least 4 places) t with last < t ≤ next, so that the strict test score < t, applied to
// the printed t, accepts every score up to `last` and rejects `next`.
function cutAbove(last,next){
  for(let d=4;d<=12;d++){const text=((Math.floor(last*10**d)+1)/10**d).toFixed(d);if(+text>last&&(next==null||+text<=next))return text}
  return String(next);
}
// Precision of a rule when its threshold is set to the smallest value reaching (at least) the given recall.
function precisionAtRecall(matches,key,recall){
  const sorted=matches.slice().sort((a,b)=>a[key]-b[key]),P=sorted.filter(m=>m.correct).length;let tp=0;
  for(let i=0;i<sorted.length;i++){
    if(sorted[i].correct)tp++;
    if(i+1<sorted.length&&sorted[i+1][key]===sorted[i][key])continue;
    if(P&&tp/P>=recall-1e-9)return{precision:tp/(i+1),threshold:cutAbove(sorted[i][key],sorted[i+1]?.[key]),recall:tp/P,accepted:i+1};
  }
  return{precision:P/(sorted.length||1),threshold:cutAbove(sorted.at(-1)?.[key]??0,null),recall:1,accepted:sorted.length};
}

function ratioStats(s,pair){
  let tp=0,fp=0,fn=0,tn=0;pair.matches.forEach(m=>{const a=accepted(s,m);if(a&&m.correct)tp++;else if(a)fp++;else if(m.correct)fn++;else tn++});
  return{tp,fp,fn,tn,accepted:tp+fp,precision:tp+fp?tp/(tp+fp):1,recall:tp+fn?tp/(tp+fn):0,specificity:tn+fp?tn/(tn+fp):1,fpr:tn+fp?fp/(tn+fp):0};
}

// Each Jump-to button walks its own list in a fixed order (the threshold examples start nearest the threshold);
// any threshold or mode change restarts it.
function pickExample(experiment,runtime,kind){
  const s=experiment.state,{matches}=runtime.pair;let list;
  // Ambiguous: a near-tie between the two best candidates. First those whose runner-up is the true
  // partner, then wrong nearest neighbours; in distance mode, ones the distance test wrongly accepts.
  if(kind==='ambiguous')list=matches.filter(m=>m.ratio>=.85&&m.visible).sort((a,b)=>(s.mode==='distance'?(accepted(s,b)&&!b.correct)-(accepted(s,a)&&!a.correct):0)||(b.secondCorrect-a.secondCorrect)||(a.correct-b.correct)||a.d1-b.d1);
  else if(kind==='false')list=matches.filter(m=>accepted(s,m)&&!m.correct).sort((a,b)=>scoreOf(s,a)-scoreOf(s,b));
  else if(kind==='true')list=matches.filter(m=>accepted(s,m)&&m.correct).sort((a,b)=>scoreOf(s,b)-scoreOf(s,a));
  else list=matches.filter(m=>!accepted(s,m)&&m.correct).sort((a,b)=>scoreOf(s,a)-scoreOf(s,b));
  if(!list.length){s.selected=null;runtime.emptyPick=kind;return}
  runtime.emptyPick=null;const index=(runtime.pickIndex[kind]??-1)+1;runtime.pickIndex[kind]=index%list.length;s.selected=list[runtime.pickIndex[kind]].query;
}

function renderRatio(experiment,root,runtime){
  const pair=runtime.pair,s=experiment.state;if(!pair||!root.querySelector('#l8RatioPair'))return;
  const stats=ratioStats(s,pair);drawPair(root,runtime,s,pair);
  root.querySelector('#l8RatioPairMeta').textContent=`${pair.kp1.length} + ${pair.kp2.length} keypoints (strongest, up to ${RATIO_KEYPOINTS} each) · ${stats.accepted} accepted (${stats.tp} correct, ${stats.fp} wrong)`;
  root.querySelector('#l8RatioPairTitle').textContent=`I₁ · I₂ · ${s.mode==='ratio'?`d₁/d₂ < ${s.ratio.toFixed(2)}`:`d₁ < ${s.distance.toFixed(2)}`}`;
  const tile=(label,value,hint,tone='')=>`<div class="${tone}" title="${hint}"><small>${label}</small><b>${value}</b></div>`,pct=v=>`${(v*100).toFixed(1)}%`;
  root.querySelector('#l8RatioStats').innerHTML=[
    tile('TP · correct, accepted',stats.tp,'Correct candidate matches accepted (slide 35)','good'),
    tile('FP · wrong, accepted',stats.fp,'Incorrect candidate matches accepted (slide 35)','bad'),
    tile('FN · correct, rejected',stats.fn,'Correct candidate matches rejected, i.e. missed (slide 35)'),
    tile('TN · wrong, rejected',stats.tn,'Incorrect candidate matches rejected (slide 35)'),
    tile('Accepted TP+FP',stats.accepted,'Matches whose score is below the threshold'),
    tile('Precision TP/(TP+FP)',pct(stats.precision),'How accurate the accepted matches are'),
    tile('Recall TP/(TP+FN)',pct(stats.recall),'How many correct nearest neighbours were accepted'),
    tile('Specificity TN/(TN+FP)',pct(stats.specificity),'How many incorrect candidates were rejected')
  ].join('');
  const partners=pair.matches.filter(m=>m.hasPartner).length,loners=pair.matches.length-partners,lonersRejected=pair.matches.filter(m=>!m.hasPartner&&!accepted(s,m)).length,wrongPartner=pair.matches.filter(m=>m.hasPartner&&accepted(s,m)&&!m.correct).length;
  root.querySelector('#l8RatioFeatures').textContent=`Each feature in I₁ proposes one candidate, its nearest neighbour, and the tiles count those candidates (slide 35). Counted per feature instead (slide 37): ${partners} features have a true partner among the I₂ keypoints and the accepted matches recover ${stats.tp} of them (recall ${partners?(stats.tp/partners*100).toFixed(1):'—'}%); of the ${loners} features without a partner (the negatives), ${lonersRejected} are correctly left unmatched (TN) and ${loners-lonersRejected} are matched anyway (FP), so specificity TN/(TN+FP) = ${loners?(lonersRejected/loners*100).toFixed(1):'—'}%.${wrongPartner?` The ${wrongPartner} feature${wrongPartner===1?' that has':'s that have'} a partner but accepted a wrong match ${wrongPartner===1?'counts':'count'} against recall, not specificity.`:''}`;
  root.querySelector('#l8RatioAuc').textContent=`AUC: ratio ${pair.roc.ratio.auc.toFixed(3)} · distance ${pair.roc.distance.auc.toFixed(3)}`;
  // The active rule is reported at the slider threshold, exactly as in the tiles; only the other rule is re-thresholded.
  const ratio=s.mode==='ratio',other=precisionAtRecall(pair.matches,ratio?'d1':'ratio',stats.recall),diff=+((stats.precision*100).toFixed(1)-(other.precision*100).toFixed(1)).toFixed(1)/100,activeName=ratio?'the ratio test':'the distance threshold',otherName=ratio?'the plain distance threshold':'the ratio test';
  root.querySelector('#l8RatioCompare').textContent=stats.tp?`At ${ratio?'τ':'t'} = ${thresholdOf(s).toFixed(2)}, ${activeName} accepts ${stats.accepted} matches with precision ${pct(stats.precision)} and recall ${pct(stats.recall)}, as in the tiles. ${ratio?'A plain distance threshold':'The ratio test'} first reaches that recall at ${ratio?'t':'τ'} = ${other.threshold}${other.recall>stats.recall+1e-9?` (recall ${pct(other.recall)})`:''}, accepting ${other.accepted} matches with precision ${pct(other.precision)}. ${diff===0?'At this recall the two rules are equally precise.':diff>0?`Here ${activeName} is ${(diff*100).toFixed(1)} points more precise.`:`Here ${otherName} is ${(-diff*100).toFixed(1)} points more precise.`}`:'No correct matches are accepted at this threshold, so there is no recall to compare at.';
  root.querySelector('#l8RatioCost').textContent=`Matching cost (slide 34): brute force compares every descriptor of I₁ with every descriptor of I₂, here ${pair.kp1.length} × ${pair.kp2.length} = ${(pair.kp1.length*pair.kp2.length).toLocaleString('en-GB')} distances in 128 dimensions, so the work grows quadratically with the number of features; search trees or hashing make large problems tractable.`;
  // Both charts share one height that follows the panel width, so the square ROC plot uses the space it has.
  const roc=root.querySelector('#l8RatioRoc'),dist=root.querySelector('#l8RatioDist'),chartH=Math.round(clamp((roc.clientWidth||520)*.62,250,380));[roc,dist].forEach(c=>{c.style.height=`${chartH}px`});
  root.querySelector('#l8RatioRocLegend').innerHTML=`<span>${swatch({color:'#16a34a',width:ratio?2.6:1.6})}ratio test d₁/d₂</span><span>${swatch({color:'#64748b',width:ratio?1.6:2.6,dash:'5 4'})}distance d₁</span><span>${swatch({color:'#111',marker:'ring'})}current threshold: FPR ${stats.fpr.toFixed(2)}, TPR ${stats.recall.toFixed(2)}</span>`;
  drawDistribution(dist,pair,s);drawRoc(roc,pair,s,stats);
  renderInspector(root,runtime,s,pair);
  markActive(root.querySelector('#l8RatioPick'),'pick','');
}

function drawPair(root,runtime,s,pair){
  const canvas=root.querySelector('#l8RatioPair'),a=pair.base.photo,b=pair.other.photo,wide=(canvas.parentElement.clientWidth||900)>=620;
  const o1={x:0,y:0},o2=wide?{x:a.w+PAIR_GAP,y:0}:{x:0,y:a.h+PAIR_GAP};runtime.layout={o1,o2};
  canvas.width=wide?a.w+PAIR_GAP+b.w:Math.max(a.w,b.w);canvas.height=wide?Math.max(a.h,b.h):a.h+PAIR_GAP+b.h;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(a.canvas,o1.x,o1.y);ctx.drawImage(b.canvas,o2.x,o2.y);
  ctx.fillStyle='rgba(0,0,0,.12)';ctx.fillRect(o1.x,o1.y,a.w,a.h);ctx.fillRect(o2.x,o2.y,b.w,b.h);
  ctx.fillStyle='rgba(255,255,255,.85)';[[pair.kp1,o1],[pair.kp2,o2]].forEach(([kps,o])=>kps.forEach(k=>{ctx.fillRect(k.x+o.x-1,k.y+o.y-1,2,2)}));
  const line=(m,style)=>{const k1=pair.kp1[m.query],k2=pair.kp2[m.best],x=k2.x+o2.x,y=k2.y+o2.y;ctx.strokeStyle=style.color;ctx.lineWidth=style.width;ctx.setLineDash(style.dash||[]);ctx.beginPath();ctx.moveTo(k1.x+o1.x,k1.y+o1.y);ctx.lineTo(x,y);ctx.stroke();if(style.cross){ctx.setLineDash([]);ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(x-3,y-3);ctx.lineTo(x+3,y+3);ctx.moveTo(x+3,y-3);ctx.lineTo(x-3,y+3);ctx.stroke()}};
  const group=(isAccepted,isCorrect,style)=>pair.matches.forEach(m=>{if(accepted(s,m)===isAccepted&&m.correct===isCorrect)line(m,style)});
  if(s.show!=='accepted'){group(false,false,PAIR_STYLE.tn);group(false,true,PAIR_STYLE.fn)}
  if(s.show!=='rejected'){group(true,true,PAIR_STYLE.tp);group(true,false,PAIR_STYLE.fp)}
  ctx.setLineDash([]);
  ctx.font='700 13px Arial';ctx.fillStyle='#fff';ctx.strokeStyle='rgba(0,0,0,.6)';ctx.lineWidth=3;[['I₁',o1],['I₂',o2]].forEach(([t,o])=>{ctx.strokeText(t,o.x+8,o.y+18);ctx.fillText(t,o.x+8,o.y+18)});
  const m=s.selected==null?null:pair.matches[s.selected];
  if(m){
    const k1=pair.kp1[m.query],k2=pair.kp2[m.best],k3=m.second>=0?pair.kp2[m.second]:null;
    ctx.lineWidth=5;ctx.strokeStyle='rgba(0,0,0,.55)';ctx.beginPath();ctx.moveTo(k1.x+o1.x,k1.y+o1.y);ctx.lineTo(k2.x+o2.x,k2.y+o2.y);ctx.stroke();
    ctx.lineWidth=2.5;ctx.strokeStyle='#facc15';ctx.stroke();
    if(k3){ctx.setLineDash([7,5]);ctx.lineWidth=2;ctx.strokeStyle='#fb923c';ctx.beginPath();ctx.moveTo(k1.x+o1.x,k1.y+o1.y);ctx.lineTo(k3.x+o2.x,k3.y+o2.y);ctx.stroke();ctx.setLineDash([])}
    const box=(k,o,color)=>{const r=Math.max(6,k.size*1.2);ctx.strokeStyle=color;ctx.lineWidth=2.2;ctx.strokeRect(k.x+o.x-r,k.y+o.y-r,2*r,2*r)};
    box(k1,o1,'#facc15');box(k2,o2,'#facc15');if(k3)box(k3,o2,'#fb923c');
    if(m.visible){const t=m.target;ctx.strokeStyle='#22d3ee';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(t.x+o2.x-7,t.y+o2.y);ctx.lineTo(t.x+o2.x+7,t.y+o2.y);ctx.moveTo(t.x+o2.x,t.y+o2.y-7);ctx.lineTo(t.x+o2.x,t.y+o2.y+7);ctx.stroke();ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(t.x+o2.x,t.y+o2.y,m.tolerance,0,Math.PI*2);ctx.stroke()}
  }
}

// Distances in px: one decimal below 10 px, whole pixels above; both numbers get extra decimals when they
// would otherwise print the same, so "lies 4.0 px … beyond the 4.0 px tolerance" can never appear.
function pxPair(d,tolerance){
  let digits=Math.min(d,tolerance)<10?1:0;const f=v=>v.toFixed(digits);
  while(d!==tolerance&&f(d)===f(tolerance)&&digits<4)digits++;
  return[f(d),f(tolerance)];
}

function renderInspector(root,runtime,s,pair){
  const m=s.selected==null?null:pair.matches[s.selected],value=root.querySelector('#l8RatioValue'),explain=root.querySelector('#l8RatioExplain'),cells=['#l8RatioF1','#l8RatioF2','#l8RatioF2b'].map(id=>root.querySelector(id));
  // Render the patches at their displayed size (device pixels) so they stay sharp when the grid stretches them.
  const size=Math.max(112,Math.round((cells[0].clientWidth||112)*Math.min(3,window.devicePixelRatio||1)));
  if(!m){cells.forEach(c=>{c.width=c.height=size;const ctx=c.getContext('2d');ctx.fillStyle='#eef0f3';ctx.fillRect(0,0,size,size)});value.textContent='—';value.className='l8-ratio-big';root.querySelector('#l8RatioD1').textContent='d₁';root.querySelector('#l8RatioD2').textContent='d₂';explain.textContent=runtime.emptyPick?'There is no such example at the current threshold. Move the slider and try again.':'Click a keypoint in either image, or jump to an example.';return}
  const k1=pair.kp1[m.query],k2=pair.kp2[m.best],k3=m.second>=0?pair.kp2[m.second]:null;
  drawCanonicalPatch(cells[0],pair.base.photo,k1,{size,grid:false});drawCanonicalPatch(cells[1],pair.other.photo,k2,{size,grid:false});
  if(k3)drawCanonicalPatch(cells[2],pair.other.photo,k3,{size,grid:false});else{cells[2].width=cells[2].height=size;const ctx=cells[2].getContext('2d');ctx.fillStyle='#eef0f3';ctx.fillRect(0,0,size,size)}
  root.querySelector('#l8RatioD1').textContent=`d₁ = ${m.d1.toFixed(3)}`;root.querySelector('#l8RatioD2').textContent=`d₂ = ${m.d2.toFixed(3)}`;
  const ok=accepted(s,m),score=scoreOf(s,m),threshold=thresholdOf(s),ratioMode=s.mode==='ratio';
  // Print enough decimals that the shown score lands on the same side of the shown threshold as the real one.
  const side=(v,t,below)=>{for(let d=3;d<8;d++){const x=Number(v.toFixed(d));if(below?x<t:x>=t)return v.toFixed(d)}return String(v)};
  value.className=`l8-ratio-big ${ok?(m.correct?'good':'bad'):'rej'}`;
  value.textContent=`${ratioMode?'d₁/d₂':'d₁'} = ${side(score,threshold,ok)} ${ok?'<':'≥'} ${threshold.toFixed(2)}`;
  const [dText,tolText]=pxPair(m.trueDistance,m.tolerance),near=m.trueDistance<=m.tolerance,scaleOk=Math.abs(Math.log(m.sizeRatio))<=Math.log(MATCH_SCALE_RATIO),marginal=scaleOk&&m.trueDistance<=1.25*m.tolerance,partnerText=m.hasPartner?', even though a keypoint of the right scale exists at the true location':'';
  const truth=!m.visible?'Its true location falls outside I₂, so no correct match exists.':m.correct?`The nearest neighbour lies ${dText} px from the true location (cyan cross), within the ${tolText} px tolerance (circle), at a similar scale: a correct match.`:near?`The nearest neighbour lies ${dText} px from the true location (cyan cross), within the ${tolText} px tolerance, but its size is ${m.sizeRatio.toFixed(2)}× the expected one (sizes must agree within a factor of 1.6), so it is not the same keypoint re-detected: a wrong match${partnerText}.`:`The nearest neighbour lies ${dText} px from the true location (cyan cross), beyond the ${tolText} px tolerance (circle): a wrong match${marginal?', though only just and at a similar scale':''}${partnerText}.`;
  const runnerUp=!m.secondCorrect?'':m.correct?' Both lie at the true location, though (SIFT can place several keypoints at one point, e.g. one per orientation), so either would be correct.':' Here the runner-up f₂′ is actually the true partner.';
  // Wrong matches: a near miss or a wrong scale at the right place is not something a position-only RANSAC would reject.
  const nearMiss=m.visible&&!m.correct&&!near&&marginal,wrongScale=m.visible&&!m.correct&&near&&!scaleOk;
  const ambiguity=m.ratio<.85&&(nearMiss||wrongScale)?(wrongScale?' Its position agrees with the homography within a few pixels, so RANSAC (slide 33) with a typical inlier threshold of 3–5 px would likely keep it; only the scale gives it away.':' Whether such a near miss counts as correct depends on the tolerance chosen.'):m.ratio<.5?(m.correct?' The nearest neighbour is far more similar than any other candidate, so the match is distinctive.':' A low ratio (d₁ less than half of d₂) makes the match look distinctive, but it is wrong: the ratio test cannot tell, and geometric verification such as RANSAC (slide 33) is what catches matches like this.'):m.ratio<.85?(!m.correct&&ok?' Geometric verification such as RANSAC (slide 33) is what catches accepted wrong matches like this.':''):!m.visible?' Both candidates are about equally good, and neither can be right because the point leaves I₂; a ratio near 1 correctly flags the match as unreliable.':m.d1<.3?(m.correct&&m.secondCorrect?' The two best candidates are almost equally similar because both lie at the true location (SIFT can place several keypoints at one point, e.g. one per orientation), so the ratio test sees an ambiguity that is not there.':` The two best candidates are almost equally similar, which is typical of repeated structure such as windows or steps.${runnerUp}`):` Both candidates are poor matches (large d₁ and d₂), so neither stands out.${runnerUp}`;
  const byDistance=m.d1<s.distance,byRatio=m.ratio<s.ratio;
  const other=ratioMode?` A plain distance test sees only d₁ = ${side(m.d1,s.distance,byDistance)}, not the runner-up${byDistance!==ok?`; at t = ${s.distance.toFixed(2)} it would ${byDistance?'accept':'reject'} this ${m.correct?'correct':'wrong'} match`:''}.`:` The distance test ignores the runner-up: d₁/d₂ = ${side(m.ratio,s.ratio,byRatio)}, so the ratio test at τ = ${s.ratio.toFixed(2)} would ${byRatio?'accept':'reject'} this ${m.correct?'correct':'wrong'} match${byRatio===ok?' too':''}.`;
  explain.textContent=`${ok?'Accepted':'Rejected'} (score ${side(score,threshold,ok)} vs threshold ${threshold.toFixed(2)}). ${truth}${ambiguity}${other} Each patch is drawn in its own keypoint’s frame, rotated by its θ and scaled by its σ.`;
}

function drawDistribution(canvas,pair,s){
  const {ctx,w,h}=chartCanvas(canvas,260),left=40,right=12,top=14,bottom=34,pw=w-left-right,ph=h-top-bottom,ratio=s.mode==='ratio',maxX=ratio?1:1.2,bins=20,threshold=thresholdOf(s);
  const counts=[new Array(bins).fill(0),new Array(bins).fill(0)];pair.matches.forEach(m=>{const b=clamp(Math.floor(scoreOf(s,m)/maxX*bins),0,bins-1);counts[m.correct?0:1][b]++});
  const totals=counts.map(c=>c.reduce((a,b)=>a+b,0)||1),fractions=counts.map((c,i)=>c.map(v=>v/totals[i])),maxY=Math.max(.05,...fractions.flat())*1.1;
  const X=v=>left+v/maxX*pw,Y=v=>top+ph-v/maxY*ph;
  ctx.fillStyle='rgba(22,163,74,.08)';ctx.fillRect(left,top,X(threshold)-left,ph);
  ctx.strokeStyle='#c7cad1';ctx.lineWidth=1;ctx.strokeRect(left,top,pw,ph);
  // Correct: solid green line with dots; wrong: dashed red line with crosses (a second cue besides colour).
  [['#16a34a',fractions[0],[],'dot'],['#dc2626',fractions[1],[4,3],'x']].forEach(([color,values,dash,marker])=>{
    ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2;ctx.setLineDash(dash);ctx.beginPath();values.forEach((v,i)=>{const x=X((i+.5)*maxX/bins),y=Y(v);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();ctx.setLineDash([]);
    values.forEach((v,i)=>{const x=X((i+.5)*maxX/bins),y=Y(v);ctx.beginPath();if(marker==='dot'){ctx.arc(x,y,2.5,0,Math.PI*2);ctx.fill()}else{ctx.lineWidth=1.6;ctx.moveTo(x-3,y-3);ctx.lineTo(x+3,y+3);ctx.moveTo(x+3,y-3);ctx.lineTo(x-3,y+3);ctx.stroke()}});
  });
  ctx.strokeStyle='#111';ctx.lineWidth=1.5;ctx.setLineDash([5,3]);ctx.beginPath();ctx.moveTo(X(threshold),top);ctx.lineTo(X(threshold),top+ph);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#666';ctx.font='10px ui-monospace, monospace';ctx.textAlign='center';
  for(let t=0;t<=maxX+1e-9;t+=ratio?.2:.3)ctx.fillText(t.toFixed(1),X(t),h-18);
  const step=[.05,.1,.2,.25,.5].find(v=>maxY/v<=4)||.5;ctx.textAlign='right';for(let v=0;v<=maxY+1e-9;v+=step)ctx.fillText(`${Math.round(v*100)}%`,left-4,Y(v)+3);ctx.textAlign='center';
  ctx.fillText(ratio?'nearest / second-nearest distance ratio':'nearest-neighbour distance d₁',left+pw/2,h-4);
  // Accepted scores lie left of the threshold line; the label sits on whichever side has room.
  const label=`${ratio?'τ':'t'} = ${threshold.toFixed(2)} · accept ←`,roomRight=X(threshold)+ctx.measureText(label).width+8<w-right;tag(ctx,label,X(threshold)+(roomRight?5:-5),top+11,'#111',roomRight?'left':'right');
}

function drawRoc(canvas,pair,s,stats){
  // Square plot (both axes are rates from 0 to 1), as large as the canvas allows and centred; the legend is HTML below.
  const {ctx,w,h}=chartCanvas(canvas,260),top=10,bottom=34,size=Math.max(60,Math.min(w-56,h-top-bottom)),left=Math.max(44,Math.round((w-size)/2+16)),X=v=>left+v*size,Y=v=>top+size-v*size;
  ctx.strokeStyle='#c7cad1';ctx.lineWidth=1;ctx.strokeRect(left,top,size,size);ctx.strokeStyle='#e5e7eb';ctx.beginPath();ctx.moveTo(X(0),Y(0));ctx.lineTo(X(1),Y(1));ctx.stroke();
  [['distance','#64748b',[5,4]],['ratio','#16a34a',[]]].forEach(([key,color,dash])=>{ctx.strokeStyle=color;ctx.lineWidth=key===(s.mode==='ratio'?'ratio':'distance')?2.6:1.6;ctx.setLineDash(dash);ctx.beginPath();pair.roc[key].points.forEach((p,i)=>i?ctx.lineTo(X(p.x),Y(p.y)):ctx.moveTo(X(p.x),Y(p.y)));ctx.stroke()});ctx.setLineDash([]);
  ctx.fillStyle='#111';ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(X(stats.fpr),Y(stats.recall),5,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle='#666';ctx.font='10px ui-monospace, monospace';ctx.textAlign='center';ctx.fillText('false positive rate',X(.5),h-4);[0,.5,1].forEach(v=>ctx.fillText(v.toFixed(1),X(v),Y(0)+13));ctx.textAlign='right';[0,.5,1].forEach(v=>ctx.fillText(v.toFixed(1),X(0)-4,Y(v)+3));ctx.textAlign='center';
  ctx.save();ctx.translate(X(0)-32,Y(.5));ctx.rotate(-Math.PI/2);ctx.fillText('true positive rate (recall)',0,0);ctx.restore();
}

/* =================================================================================== */

export const RATIO_PYTHON_SAMPLE=`import cv2
import numpy as np

def ratio_test(image1, image2, ratio=0.7):
    # cv2 doubles the image before detecting (the page does not), so it finds more small keypoints
    # and its counts will differ from the page's.
    sift = cv2.SIFT_create(nfeatures=500)  # strongest 500 keypoints, as on the page
    kp1, des1 = sift.detectAndCompute(cv2.cvtColor(image1, cv2.COLOR_RGB2GRAY), None)
    kp2, des2 = sift.detectAndCompute(cv2.cvtColor(image2, cv2.COLOR_RGB2GRAY), None)
    # OpenCV stores descriptors as uint8, about 512 x the unit vector. Rescale to unit length so that
    # d1, d2 and a distance threshold t are on the page's scale (the ratio d1/d2 barely changes).
    des1 = np.float32(des1 / np.linalg.norm(des1, axis=1, keepdims=True))
    des2 = np.float32(des2 / np.linalg.norm(des2, axis=1, keepdims=True))
    pairs = cv2.BFMatcher(cv2.NORM_L2).knnMatch(des1, des2, k=2)  # nearest and second nearest
    accepted = [p[0] for p in pairs if len(p) == 2 and p[0].distance < ratio * p[1].distance]
    return kp1, kp2, accepted

def is_correct(kp1, kp2, matches, H, min_tolerance=4.0, max_size_ratio=1.6):
    # The page's rule: the nearest neighbour must lie within max(4 px, sigma'/2) of H x, where
    # sigma' is the keypoint's scale carried into image 2 by H, and its size must agree within 1.6x.
    if not matches:
        return np.zeros(0, dtype=bool)
    p1 = np.float32([kp1[m.queryIdx].pt for m in matches]).reshape(-1, 1, 2)
    p2 = np.float32([kp2[m.trainIdx].pt for m in matches])
    target = cv2.perspectiveTransform(p1, H).reshape(-1, 2)
    dx = cv2.perspectiveTransform(p1 + np.float32([0.5, 0]), H).reshape(-1, 2) - target
    dy = cv2.perspectiveTransform(p1 + np.float32([0, 0.5]), H).reshape(-1, 2) - target
    zoom = np.sqrt(np.abs(dx[:, 0] * dy[:, 1] - dx[:, 1] * dy[:, 0])) / 0.5  # local scale of H
    expected = np.float32([kp1[m.queryIdx].size for m in matches]) * zoom  # size = 2 sigma
    found = np.float32([kp2[m.trainIdx].size for m in matches])
    near = np.linalg.norm(target - p2, axis=1) <= np.maximum(min_tolerance, 0.25 * expected)
    return near & (np.abs(np.log(found / expected)) <= np.log(max_size_ratio))`;

export const SIFT_PYTHON_SAMPLE=`import cv2
import numpy as np

def sift_descriptor(image):
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    keypoints, descriptors = cv2.SIFT_create().detectAndCompute(gray, None)
    i = int(np.argmax([kp.response for kp in keypoints]))  # strongest keypoint
    kp, d = keypoints[i], descriptors[i]
    theta = (360 - kp.angle) % 360  # OpenCV measures angles clockwise; the page counter-clockwise
    print(f"at {kp.pt}, sigma {kp.size / 2:.2f} px, orientation {theta:.0f} deg")
    d = d / np.linalg.norm(d)  # OpenCV stores 512 x the clipped unit vector, rounded to bytes
    return kp, d.reshape(4, 4, 8)  # 4 x 4 spatial cells x 8 orientation bins`;

const link=(label,url)=>({label,url}),param=(name,value,description,active=true)=>({name,value:String(value),description,active});

export function ratioGuide(state){
  const s={...RATIO_DEFAULTS,...state},ratio=s.mode==='ratio';
  return{overview:'SIFT keypoints and descriptors are computed in both images in the browser. Each descriptor in I₁ is matched to its nearest and second-nearest descriptors in I₂ by Euclidean distance. A match counts as correct when the nearest neighbour is the same keypoint re-detected in I₂: it lies within max(4 px, σ′/2) of the true location given by the known homography (σ′ is the keypoint’s scale carried into I₂) and its size agrees within a factor of 1.6.',
    params:[param('Acceptance rule',ratio?'d₁ / d₂ < τ':'d₁ < t',ratio?'Lowe’s ratio test: compares the best distance with the runner-up, so ambiguous features are rejected even when d₁ is small.':'Plain nearest-neighbour distance: ignores the runner-up, so repeated structure can produce small but wrong distances.'),
      param('Ratio threshold τ',s.ratio.toFixed(2),'A match is accepted when its ratio is below τ, so a larger τ accepts more matches. Slide 37 asks how precision, recall and specificity change as the threshold rises: sweep the slider and watch the tiles. Lowe rejected matches with a ratio above 0.8; slide 33 keeps matches with a ratio below 0.70.',ratio),
      param('Distance threshold t',s.distance.toFixed(2),'Used only in the plain-distance mode. Descriptors are non-negative unit vectors, so distances lie between 0 and √2. The default 0.21 gives about the same recall as τ = 0.70 on the default pair.',!ratio),
      param('View 2',(VIEWS.find(v=>v.id===s.view)||VIEWS[0]).label,'The second image is the first warped by a known homography, then darkened or brightened with added noise. Parts of I₁ leave the frame, so some features have no correct match at all.'),
      param('Correctness rule',`max(${MATCH_MIN_TOLERANCE} px, σ′/2) · size within ${MATCH_SCALE_RATIO}×`,'The nearest neighbour must lie within this distance of the projected true location and have a similar scale. Keypoint positions are less precise for larger σ, so the tolerance grows with the keypoint’s scale; the scale check stops a nearby structure of a different size from counting as the partner.')],
    links:[link('Scale-invariant feature transform',`https://en.wikipedia.org/wiki/Scale-invariant_feature_transform`),link('Receiver operating characteristic',`https://en.wikipedia.org/wiki/Receiver_operating_characteristic`),link('Precision and recall','https://en.wikipedia.org/wiki/Precision_and_recall'),link('OpenCV feature matching','https://docs.opencv.org/4.x/dc/dc3/tutorial_py_matcher.html')]};
}

export function siftGuide(state){
  const s={...SIFT_STATE_DEFAULTS,...state};
  return{overview:'The SIFT implementation follows OpenCV’s, except that it skips OpenCV’s initial 2× upsampling and stops at 5 octaves to stay fast in the browser. Difference-of-Gaussian extrema give each keypoint a location and scale, a 36-bin histogram gives its orientation, and the descriptor pools gradients into 4 × 4 cells × 8 orientation bins.',
    params:[param('Orientation normalization',s.rotate?'on':'off','When on, the window and every gradient angle are measured relative to θ, which makes the descriptor rotation invariant.'),
      param('Gaussian weighting',s.weighting?'on':'off','Weights each gradient by a Gaussian with σ equal to half the window width (2 cells), so gradients near the centre count more than those at the boundary.'),
      param('Clamp threshold',s.clip<1?s.clip.toFixed(2):'off','After unit normalization, values above this are clamped (clipped) to it before renormalizing. SIFT uses 0.2.'),
      param('Invariance test',`${s.rotation}° clockwise · ${s.zoom}%`,'Rotates and zooms the scene, re-detects SIFT keypoints, and compares descriptors at the selected point’s true new location.')],
    links:[link('Scale-invariant feature transform','https://en.wikipedia.org/wiki/Scale-invariant_feature_transform'),link('Lowe 2004: Distinctive image features','https://www.cs.ubc.ca/~lowe/papers/ijcv04.pdf'),link('OpenCV SIFT tutorial','https://docs.opencv.org/4.x/da/df5/tutorial_py_sift_intro.html')]};
}

const RATIO_DEFAULTS={scene:'utown',view:'tilt',mode:'ratio',ratio:.7,distance:.21,show:'accepted',selected:null};
const SIFT_STATE_DEFAULTS={scene:'giraffe',keypoint:null,rotate:true,weighting:true,clip:.2,cell:null,rotation:45,zoom:100};

export function createLecture8Experiments(root,{getSource,getSourceVersion}){
  const store=createStore(getSource,getSourceVersion),siftRuntime={token:0,invTimer:null},ratioRuntime={token:0,onResize:null};
  return[
    {group:'Descriptors & matching',id:'siftDescriptor',icon:'✳',title:'SIFT descriptor (L8)',description:'Follow one SIFT keypoint through the descriptor: normalize its neighbourhood, weight its gradients, pool them into 4 × 4 × 8 bins, and normalize the 128-D vector.',state:{...SIFT_STATE_DEFAULTS},
      mount(){const token=++siftRuntime.token;mountSift(this,root,store,siftRuntime,token)},
      destroy(){siftRuntime.token++;clearTimeout(siftRuntime.invTimer)}},
    {group:'Descriptors & matching',id:'ratioTest',icon:'⇄',title:'Ratio test matching (L8)',description:'Match SIFT descriptors between two views and watch which matches the nearest-neighbour ratio test accepts or rejects as the threshold moves.',state:{...RATIO_DEFAULTS},
      mount(){const token=++ratioRuntime.token;mountRatio(this,root,store,ratioRuntime,token)},
      destroy(){ratioRuntime.token++;if(ratioRuntime.onResize)window.removeEventListener('resize',ratioRuntime.onResize)}}
  ];
}
