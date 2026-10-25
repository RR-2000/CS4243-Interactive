// Lecture 10 · Depth estimation & 3D reconstruction — slide 27 (where stereo matching fails) and slide 28
// (spatial consistency & depth boundaries), on the lecture's own Motorcycle pair (Middlebury 2014, quarter size,
// as on slides 21, 25, 27 and 28) and on Laundry (Middlebury 2005, seven views) for five real baselines.
// Algorithms live in js/stereo.js and are checked against NumPy/SciPy by scripts/verify_stereo.py.
import {winnerTakeAll,costCurve,visibility,neighbourWeights,smoothDisparity,disparityError,VISIBLE,OCCLUDED,OUTSIDE} from './stereo.js?v=1';

const ASSETS='images/stereo/';
const NEAR_EQUAL=1.35,FLAT_STD=3,EDGE_SIGMA=.015,SLIDE_WINDOW=9,CORRECT=1;
const INK={navy:'#1f3a5f',blue:'#2e70b0',orange:'#d66e1e',grid:'#e5e7eb',muted:'#6b7280'};
const VIRIDIS=[[68,1,84],[72,24,106],[71,45,123],[66,64,134],[59,82,139],[51,99,141],[44,114,142],[38,130,142],[33,145,140],[31,160,136],[40,174,128],[63,188,115],[94,201,98],[132,212,75],[173,220,48],[216,226,25],[253,231,37]];
const VIRIDIS_AT=[0,16,32,48,64,80,96,112,128,144,160,176,192,208,224,240,255];
const VIRIDIS_CSS=`linear-gradient(90deg,${VIRIDIS.map(c=>`rgb(${c})`).join(',')})`;

// Slide 27, word for word.
const CASES=[
  {key:'textureless',label:'Textureless regions',what:'Flat cost: every d looks equally good.',broken:'Each patch is distinctive.'},
  {key:'repeated',label:'Repeated patterns',what:'Several near-equal minima; the lowest one is wrong.',broken:'Each patch is unique along the row.'},
  {key:'occlusion',label:'Occlusion',what:'The true match is hidden in the right view, so its cost is high.',broken:'Every pixel is visible in both views.'},
  {key:'reflective',label:'Reflective surfaces',what:'Appearance changes with viewpoint; the minimum moves.',broken:'A surface looks the same from both cameras.'}
];

// Depth z = f B / (d + d0): Middlebury crops its images, which shifts every disparity by d0 (calib.txt / dmin.txt).
const maxOf=values=>{let max=0;for(const v of values)if(v>max)max=v;return max};
const SCENES=[
  {id:'motorcycle',label:'Motorcycle · lecture pair',w:741,h:500,baselines:[1],defaultBaseline:1,
    baselineText:()=>'B = 193 mm · one stereo pair',grey:()=>['motorcycle-left','motorcycle-right'],
    searchRange:()=>71,colourRange:()=>71,focal:3979.911/4,offset:()=>124.343/4,baselineMM:()=>193.001,
    crop:{x:330,y:110,w:230,h:220},
    credit:'Middlebury 2014 Motorcycle (Scharstein et al., GCPR 2014), reduced to quarter size, 741 × 500, as on slides 21, 25, 27 and 28.',
    cases:{
      textureless:{x:239,y:36,where:'on the whiteboard',slide:'Slide 27 shows this pixel: chosen d = 4, true 12.5.'},
      repeated:{x:87,y:175,where:'on the bench slats',slide:'This is slide 27’s pixel: the background seen through a gap between the slats, which repeat along the row and give near-equal minima at d = 18, 32, 44 and 60 (the lowest is 44 here, 59 on the slide). It also lies on a depth edge and is hidden in the right view, so it breaks more than one assumption; Laundry’s basket windows show a repeated pattern on its own.'},
      occlusion:{x:390,y:130,where:'behind the handlebar',slide:'Slide 27 shows this pixel: chosen d = 65, true 18.6.'},
      reflective:{x:521,y:139,where:'on the headlight',slide:'Slide 27 uses a pixel on the same headlight: chosen d = 46, true 58.5 (here 46 and 58.4).'}}},
  {id:'laundry',label:'Laundry · 5 baselines',w:447,h:370,baselines:[1,2,3,4,5],defaultBaseline:4,
    baselineText:b=>`B = ${40*b} mm · views 1 and ${1+b}`,grey:b=>['laundry-view1',`laundry-view${1+b}`],
    searchRange:(b,truth)=>Math.ceil(1.2*maxOf(truth)),colourRange:data=>Math.ceil(1.2*maxOf(data.truth(5))),
    focal:3740/3,offset:b=>230/3*b/4,baselineMM:b=>40*b,crop:null,
    credit:'Middlebury 2005 Laundry (Scharstein & Pal, CVPR 2007; Hirschmüller & Scharstein, CVPR 2007), third size, 447 × 370. Its seven views are equally spaced, so pairing view 1 with views 2–6 gives five real baselines; ground truth is given for views 1 and 5 and scales with the baseline.',
    cases:{
      textureless:{x:209,y:222,where:'on a plain stretch of the wooden crate'},
      repeated:{x:133,y:14,where:'on the basket’s window grid'},
      occlusion:{x:311,y:174,where:'on the crate between the red trigger and the white spray head'},
      reflective:null}}
];

export const STEREO_DEFAULTS={scene:'motorcycle',baseline:{motorcycle:1,laundry:4},window:SLIDE_WINDOW,probe:{},caseKey:'textureless',lambdaUniform:10,lambdaEdge:50,view:'crop'};

const nextFrame=()=>new Promise(resolve=>setTimeout(resolve,0));
const sceneOf=s=>SCENES.find(scene=>scene.id===s.scene)||SCENES[0];
const baselineOf=s=>s.baseline[s.scene]??sceneOf(s).defaultBaseline;
const fmt=(v,digits=1)=>Number.isFinite(v)?v.toFixed(digits):'—';
const median=values=>{const a=Float64Array.from(values).sort();return a.length?(a[(a.length-1)>>1]+a[a.length>>1])/2:NaN};

function viridis(t){
  const v=Math.max(0,Math.min(255,t*255));let i=0;while(i<VIRIDIS_AT.length-2&&v>VIRIDIS_AT[i+1])i++;
  const f=(v-VIRIDIS_AT[i])/(VIRIDIS_AT[i+1]-VIRIDIS_AT[i]);return VIRIDIS[i].map((c,k)=>Math.round(c+(VIRIDIS[i+1][k]-c)*f));
}
const VIRIDIS_LUT=Array.from({length:256},(_,i)=>viridis(i/255));

function chartCanvas(canvas,fallbackHeight=240){
  const dpr=Math.min(3,window.devicePixelRatio||1),w=canvas.clientWidth||520,h=canvas.clientHeight||fallbackHeight;
  canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);return{ctx,w,h};
}
// Canvas pixels per CSS pixel, so markers keep their on-screen size however large the canvas is drawn.
const pixelScale=canvas=>canvas.width/Math.max(1,canvas.clientWidth||canvas.width);
const niceStep=raw=>{const p=10**Math.floor(Math.log10(raw||1)),f=raw/p;return(f<=1?1:f<=2?2:f<=5?5:10)*p};
const compact=v=>v>=1e6?`${+(v/1e6).toFixed(1)}M`:v>=1e3?`${+(v/1e3).toFixed(1)}k`:String(Math.round(v));

/* ---------- data ---------- */

function createStore(){
  const scenes=new Map(),matches=new Map(),smooths=new Map();
  const bytes=async file=>{const response=await fetch(ASSETS+file);if(!response.ok)throw new Error(`Could not load ${file}`);return new Uint8Array(await response.arrayBuffer())};
  const image=src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error(`Could not load ${src}`));img.src=ASSETS+src});
  const pixels=img=>{const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);return{canvas:c,data:ctx.getImageData(0,0,c.width,c.height).data}};
  return{
    scene(scene){
      if(!scenes.has(scene.id))scenes.set(scene.id,(async()=>{
        const names=scene.id==='motorcycle'?['motorcycle-left','motorcycle-right']:[1,2,3,4,5,6].map(v=>`laundry-view${v}`);
        const [greys,colours,raw]=await Promise.all([Promise.all(names.map(n=>bytes(`${n}.gray`))),Promise.all(names.map(n=>image(`${n}.jpg`))),bytes(scene.id==='motorcycle'?'motorcycle-gt.u16':'laundry-gt.u8')]);
        const grey={},colour={};names.forEach((n,i)=>{grey[n]=greys[i];colour[n]=pixels(colours[i])});
        // Ground truth in pixels of this image size; NaN where Middlebury gives none.
        const truth=b=>{const out=new Float64Array(scene.w*scene.h);if(scene.id==='motorcycle'){const v=new Uint16Array(raw.buffer,raw.byteOffset,raw.length/2);for(let i=0;i<out.length;i++)out[i]=v[i]?v[i]/64:NaN}else for(let i=0;i<out.length;i++)out[i]=raw[i]?raw[i]/3*b/4:NaN;return out};
        const truths=new Map(),visibilities=new Map(),data={grey,colour};
        data.truth=b=>{if(!truths.has(b))truths.set(b,truth(b));return truths.get(b)};
        data.visibility=b=>{if(!visibilities.has(b))visibilities.set(b,visibility(data.truth(b),scene.w,scene.h));return visibilities.get(b)};
        data.range=scene.colourRange(data);
        return data;
      })());
      return scenes.get(scene.id);
    },
    matches,smooths
  };
}

// Runs a generator in slices of about 25 ms so the page stays responsive; returns null if superseded.
async function drive(generator,alive,onYield){
  let step=generator.next(),start=performance.now();
  while(!step.done){
    if(performance.now()-start>25){onYield?.(step.value);await nextFrame();if(!alive())return null;start=performance.now()}
    step=generator.next();
  }
  return step.value;
}

// Depth readout for slide 23's trade-off: the depth change caused by 1 px of disparity error at the scene's median
// depth, and the median depth error of a disparity map, both with z = f B / (d + d0).
function depthReadout(scene,b,map,truth){
  const f=scene.focal,B=scene.baselineMM(b),d0=scene.offset(b),depths=[],errors=[];
  for(let i=0;i<truth.length;i++){const t=truth[i];if(!(t>=0))continue;const z=f*B/(t+d0);depths.push(z);errors.push(Math.abs(f*B/(map[i]+d0)-z))}
  const z=median(depths);return{z,perPixel:z*z/(f*B),error:median(errors)};
}

/* ---------- drawing ---------- */

function paintMap(canvas,map,scene,range,crop,{truth=false}={}){
  const region=crop||{x:0,y:0,w:scene.w,h:scene.h};canvas.width=region.w;canvas.height=region.h;
  const ctx=canvas.getContext('2d'),image=ctx.createImageData(region.w,region.h);
  for(let y=0;y<region.h;y++)for(let x=0;x<region.w;x++){
    const v=map[(y+region.y)*scene.w+x+region.x],o=(y*region.w+x)*4;
    const c=truth&&!(v>=0)?[205,208,214]:VIRIDIS_LUT[Math.max(0,Math.min(255,Math.round(v/range*255)))];
    image.data[o]=c[0];image.data[o+1]=c[1];image.data[o+2]=c[2];image.data[o+3]=255;
  }
  ctx.putImageData(image,0,0);return ctx;
}

// The window W around the probed pixel, drawn like slide 27: navy square with a white outline.
function drawWindow(ctx,probe,r){
  const k=pixelScale(ctx.canvas),size=2*r+1,lw=1.6*k,x=probe.x-r,y=probe.y-r;
  ctx.save();ctx.lineWidth=lw+2.4*k;ctx.strokeStyle='rgba(255,255,255,.95)';ctx.strokeRect(x-lw/2,y-lw/2,size+lw,size+lw);ctx.lineWidth=lw;ctx.strokeStyle=INK.navy;ctx.strokeRect(x-lw/2,y-lw/2,size+lw,size+lw);
  if(r<2){const cx=probe.x+.5,cy=probe.y+.5,gap=3*k,arm=gap+7*k;ctx.beginPath();ctx.moveTo(cx-arm,cy);ctx.lineTo(cx-gap,cy);ctx.moveTo(cx+gap,cy);ctx.lineTo(cx+arm,cy);ctx.moveTo(cx,cy-arm);ctx.lineTo(cx,cy-gap);ctx.moveTo(cx,cy+gap);ctx.lineTo(cx,cy+arm);ctx.stroke()}
  ctx.restore();
}
function drawMarker(ctx,probe,offset){
  const k=pixelScale(ctx.canvas),cx=probe.x-offset.x+.5,cy=probe.y-offset.y+.5;
  ctx.save();ctx.lineWidth=3.5*k;ctx.strokeStyle='rgba(0,0,0,.75)';ctx.beginPath();ctx.arc(cx,cy,6*k,0,Math.PI*2);ctx.stroke();ctx.lineWidth=1.8*k;ctx.strokeStyle='#fff';ctx.stroke();ctx.restore();
}

// Slide-27 cost curve: SSD against d, blue line at the true disparity, dashed orange at the lowest cost.
function drawCurve(canvas,curve,chosen,truth,r){
  const {ctx,w,h}=chartCanvas(canvas,250),left=48,right=12,top=18,bottom=34,pw=w-left-right,ph=h-top-bottom,D=curve.length-1;
  // The axis always reaches an RMS difference of 10 grey levels, so noise-level costs plot as flat.
  let max=(2*r+1)**2*100,min=Infinity;for(const v of curve){if(v>max)max=v;if(v<min)min=v}
  const step=niceStep((max||1)/4),top_=Math.max(step,Math.ceil((max||1)/step)*step),X=d=>left+d/D*pw,Y=v=>top+ph-v/top_*ph;
  ctx.font='10px ui-monospace, monospace';ctx.fillStyle=INK.muted;ctx.strokeStyle=INK.grid;ctx.lineWidth=1;
  for(let v=0;v<=top_+1e-9;v+=step){const y=Y(v);ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(left+pw,y);ctx.stroke();ctx.textAlign='right';ctx.fillText(compact(v),left-5,y+3)}
  const dStep=D>60?20:10;ctx.textAlign='center';for(let d=0;d<=D;d+=dStep)ctx.fillText(String(d),X(d),top+ph+13);
  ctx.font='italic 12px Georgia, serif';ctx.fillStyle='#333';ctx.fillText('d',left+pw/2,h-4);
  ctx.save();ctx.translate(11,top+ph/2);ctx.rotate(-Math.PI/2);ctx.font='10px ui-monospace, monospace';ctx.fillStyle=INK.muted;ctx.fillText('SSD cost C(p, d)',0,0);ctx.restore();
  // The near-equal level is only drawn when it can be told apart from the axis.
  if(NEAR_EQUAL*min>.02*top_){ctx.strokeStyle='#9ca3af';ctx.setLineDash([2,3]);ctx.beginPath();ctx.moveTo(left,Y(NEAR_EQUAL*min));ctx.lineTo(left+pw,Y(NEAR_EQUAL*min));ctx.stroke();ctx.setLineDash([])}
  ctx.strokeStyle=INK.navy;ctx.lineWidth=2;ctx.beginPath();curve.forEach((v,d)=>d?ctx.lineTo(X(d),Y(v)):ctx.moveTo(X(d),Y(v)));ctx.stroke();
  const pointer=(d,color)=>{ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(X(d)-5,top-10);ctx.lineTo(X(d)+5,top-10);ctx.lineTo(X(d),top-3);ctx.closePath();ctx.fill()};
  if(truth>=0&&truth<=D){ctx.strokeStyle=INK.blue;ctx.lineWidth=2.4;ctx.beginPath();ctx.moveTo(X(truth),top);ctx.lineTo(X(truth),top+ph);ctx.stroke();pointer(truth,INK.blue)}
  ctx.strokeStyle=INK.orange;ctx.lineWidth=2.4;ctx.setLineDash([6,4]);ctx.beginPath();ctx.moveTo(X(chosen),top);ctx.lineTo(X(chosen),top+ph);ctx.stroke();ctx.setLineDash([]);pointer(chosen,INK.orange);
  ctx.strokeStyle='#c7cad1';ctx.lineWidth=1;ctx.strokeRect(left,top,pw,ph);
}

// Magnified windows: the left patch, and the right image shifted by d (pixels from beyond the right image's left
// edge are black, as in the cost).
function drawPatch(canvas,source,scene,probe,r,shift){
  const n=2*r+1,scale=Math.max(4,Math.floor(132/n)),size=n*scale;canvas.width=size;canvas.height=size;
  const ctx=canvas.getContext('2d'),reflect=(i,m)=>i<0?-i-1:i>=m?2*m-i-1:i;
  for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
    const y=reflect(probe.y+dy,scene.h),x=reflect(probe.x+dx,scene.w),sx=shift==null?x:x-shift;
    let c=[0,0,0];if(sx>=0){const o=(y*scene.w+sx)*4;c=[source.data[o],source.data[o+1],source.data[o+2]]}
    ctx.fillStyle=`rgb(${c[0]},${c[1]},${c[2]})`;ctx.fillRect((dx+r)*scale,(dy+r)*scale,scale,scale);
  }
}

/* ---------- the slide-27 assumptions, measured for one pixel ---------- */

function probeFacts(scene,grey,curve,truth,visible,probe,r){
  const D=curve.length-1;let chosen=0;for(let d=1;d<=D;d++)if(curve[d]<curve[chosen])chosen=d;
  const t=truth[probe.y*scene.w+probe.x],known=t>=0;
  let sum=0,sum2=0,count=0,gMin=Infinity,gMax=-Infinity,gMissing=false,hidden=0,jump=0;
  const x0=Math.max(0,probe.x-r),x1=Math.min(scene.w-1,probe.x+r),y0=Math.max(0,probe.y-r),y1=Math.min(scene.h-1,probe.y+r);
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    const i=y*scene.w+x,v=grey[i];sum+=v;sum2+=v*v;count++;const g=truth[i];
    if(g>=0){gMin=Math.min(gMin,g);gMax=Math.max(gMax,g);if(visible[i]!==VISIBLE)hidden++}else gMissing=true;
    // Largest jump in true disparity between horizontal or vertical neighbours: a real depth edge, not a slant.
    if(x<x1&&g>=0&&truth[i+1]>=0)jump=Math.max(jump,Math.abs(g-truth[i+1]));if(y<y1&&g>=0&&truth[i+scene.w]>=0)jump=Math.max(jump,Math.abs(g-truth[i+scene.w]));
  }
  const mean=sum/count,contrast=Math.sqrt(Math.max(0,sum2/count-mean*mean));
  const others=[];for(let d=0;d<=D;d++){const local=(d===0||curve[d]<curve[d-1])&&(d===D||curve[d]<=curve[d+1]);if(local&&curve[d]<=NEAR_EQUAL*curve[chosen]&&Math.abs(d-chosen)>=3)others.push(d)}
  // Root-mean-square grey difference between the two windows at shift d: sqrt(SSD / number of pixels in W).
  const pixels=(2*r+1)**2,rms=d=>Math.sqrt(curve[d]/pixels);
  // A shift fits about as well as the chosen one when its windows differ by at most 1 grey level more, or by at
  // most 3 grey levels in all (below that, two windows look the same).
  const fitLevel=Math.max(rms(chosen)+1,3);let fits=0;for(let d=0;d<=D;d++)if(rms(d)<=fitLevel)fits++;
  // The true disparity is sub-pixel: use the better of the two whole shifts around it.
  let near=null;if(known)for(const d of [Math.floor(t),Math.ceil(t)])if(d>=0&&d<=D&&(near==null||curve[d]<curve[near]))near=d;
  return{chosen,truth:t,known,near,error:known?Math.abs(chosen-t):NaN,visibility:visible[probe.y*scene.w+probe.x],contrast,others,fits,shifts:D+1,rmsChosen:rms(chosen),rmsTrue:near==null?NaN:rms(near),depthRange:gMax-gMin,jump,hidden,windowPixels:count,gMissing,r};
}

// One line per assumption of slide 27: question, verdict glyph and what was measured.
function factLines(f){
  const yes=text=>['✓','ok',`Yes: ${text}`],no=text=>['✗','bad',`No: ${text}`],cant=text=>['–','',text];
  const fitText=`${f.fits} of ${f.shifts} shifts fit about as well as the chosen one`;
  const distinct=f.r===0?cant('A 1 × 1 window has no texture to compare.'):f.contrast<FLAT_STD?no(`almost uniform (contrast ${fmt(f.contrast)} grey levels); ${fitText}.`):f.fits>f.shifts/2?no(`${fitText} (contrast ${fmt(f.contrast)} grey levels).`):yes(`contrast ${fmt(f.contrast)} grey levels; ${fitText}.`);
  const unique=f.others.length?no(`other near-equal minima at d = ${f.others.slice(0,6).join(', ')}${f.others.length>6?', …':''}.`):yes(`no other minimum within ${NEAR_EQUAL} × the lowest cost.`);
  const windowHidden=`${f.hidden} of the ${f.windowPixels} pixels in the window are hidden in the right view`;
  const seen=f.visibility===VISIBLE?(f.hidden?no(`${windowHidden} (this pixel itself is visible).`):yes('every pixel of the window is visible, according to the ground truth.')):f.visibility===OCCLUDED?no(`a nearer surface hides this point in the right view; ${windowHidden}.`):f.visibility===OUTSIDE?no('its match falls outside the right image.'):cant('Unknown: no ground truth here.');
  // Appearance can only be judged where the whole window is visible and lies on one surface.
  const differs=f.rmsTrue>Math.max(6,.6*f.contrast),diff=`near the true d (d = ${f.near}) the windows differ by ${fmt(f.rmsTrue)} grey levels (RMS), ${fmt(f.rmsChosen)} at the chosen d.`;
  const same=!f.known?cant('Unknown: no ground truth here.'):f.visibility!==VISIBLE||f.hidden?cant('Can’t check: part of the true match is hidden in the right view.'):f.gMissing?cant('Can’t check: part of the window has no ground truth.'):f.jump>1?cant('Can’t check: the window spans a depth edge.'):differs?no(diff):yes(diff);
  const lines=[['Each patch is distinctive?',distinct],['Each patch is unique along the row?',unique],['Every pixel is visible in both views?',seen],['A surface looks the same from both cameras?',same]];
  if(f.known&&!f.gMissing)if(f.jump>1)lines.push(['The window lies on one surface?',no(`it spans a depth edge, where the true disparity jumps by up to ${fmt(f.jump)} px between neighbours. Larger windows blur such boundaries (slide 26).`)]);
  else if(f.depthRange>2)lines.push(['The window lies on one surface?',yes(`but a slanted one: the true disparity varies by ${fmt(f.depthRange)} px across the window.`)]);
  return lines.map(([question,[glyph,tone,text]])=>`<li class="${tone}"><span class="l10-mark" aria-hidden="true">${glyph}</span><b>${question}</b> ${text}</li>`).join('');
}

/* ---------- page ---------- */

const legendLine=(color,dash='')=>`<svg width="23" height="10" aria-hidden="true"><line x1="1" y1="5" x2="21" y2="5" stroke="${color}" stroke-width="2.4"${dash?` stroke-dasharray="${dash}"`:''}/></svg>`;
function markup(){
  return `<div class="l4-page l8-page l10-page">
  <section class="l4-section"><header><span>Slide 27 · Where stereo matching fails</span><h2>Picking the lowest cost fails in four typical ways</h2><p>For each pixel p of the left image, slide a window W along the same row of the right image and compute the SSD cost C(p, d) at every shift d (slide 25); winner-take-all picks the lowest. Click any pixel to see its cost curve: blue is the true disparity from Middlebury’s ground truth, dashed orange is what the lowest cost chose. The buttons jump to the slide’s four cases.</p></header>
    <div class="l4-presets l8-strip" id="l10Scenes" role="group" aria-label="Scene"><span>Scene</span>${SCENES.map(scene=>`<button type="button" data-scene="${scene.id}">${scene.label}</button>`).join('')}</div>
    <div class="controls l8-controls">
      <div class="control"><label for="l10Window">Window W (w × w)<output id="l10WindowOut">9 × 9</output></label><input id="l10Window" type="range" min="1" max="25" step="2" value="9"></div>
      <div class="control"><label for="l10Baseline">Baseline B<output id="l10BaselineOut">—</output></label><input id="l10Baseline" type="range" min="1" max="5" step="1" value="4"><p class="l10-fixed" id="l10BaselineFixed" hidden>Fixed: the Motorcycle is one stereo pair. Choose Laundry to vary B.</p></div>
    </div>
    <div class="l4-presets l8-strip l10-cases" id="l10Cases" role="group" aria-label="Slide 27 cases"><span>Slide 27 cases</span>${CASES.map(c=>`<button type="button" data-case="${c.key}">${c.label}</button>`).join('')}<em class="l10-case-note" id="l10CaseNote" hidden>Laundry has no clear reflective example; the Motorcycle headlight shows one.</em></div>
    <div class="l8-grid two">
      <figure class="l8-panel"><figcaption><span>Left image · click a pixel</span><small id="l10LeftMeta">Loading…</small></figcaption><div class="l8-stage"><canvas id="l10Left" class="l8-clickable" aria-label="Left image; click a pixel to see its cost curve"></canvas></div></figure>
      <figure class="l8-panel" id="l10CurvePanel"><figcaption><span>Cost curve of the selected pixel</span><small id="l10CurveMeta">—</small></figcaption><canvas id="l10Curve" class="l8-chart tall" aria-label="SSD cost against disparity for the selected pixel"></canvas>
        <div class="l8-legend"><span>${legendLine(INK.blue)}true disparity</span><span>${legendLine(INK.orange,'6 4')}lowest cost (chosen)</span><span><svg width="23" height="10" aria-hidden="true"><line x1="1" y1="5" x2="21" y2="5" stroke="#9ca3af" stroke-dasharray="2 3"/></svg>${NEAR_EQUAL} × the lowest cost</span></div>
        <div class="l8-verdict" id="l10Verdict">—</div></figure>
    </div>
    <div class="l8-grid two">
      <figure class="l8-panel" id="l10WtaPanel"><figcaption><span>Lowest cost per pixel (winner-take-all)</span><small id="l10WtaMeta">—</small></figcaption><div class="l8-stage"><canvas id="l10Wta" class="l8-clickable" aria-label="Winner-take-all disparity map; click a pixel"></canvas></div><div class="l10-scale"><span>d = 0</span><i style="background:${VIRIDIS_CSS}"></i><span id="l10WtaRange">—</span></div><p class="l8-caption" id="l10WtaText">—</p></figure>
      <figure class="l8-panel"><figcaption><span>Windows compared</span><small>same row, shifted left by d</small></figcaption>
        <div class="l10-patches"><div><span class="l8-label">Left · window at p</span><canvas id="l10PatchLeft" aria-label="Left window"></canvas></div><div><span class="l8-label l10-chosen" id="l10PatchChosenLabel">Right · chosen d</span><canvas id="l10PatchChosen" aria-label="Right window at the chosen disparity"></canvas></div><div><span class="l8-label l10-true" id="l10PatchTrueLabel">Right · true d</span><canvas id="l10PatchTrue" aria-label="Right window at the true disparity"></canvas></div></div>
        <ul class="l10-facts" id="l10Facts"></ul>
        <p class="l8-caption" id="l10CaseText">—</p></figure>
    </div>
  </section>
  <section class="l4-section"><header><span>Slide 28 · Spatial consistency &amp; depth boundaries</span><h2>Neighbours resolve ambiguity, but depth jumps at boundaries</h2><p>A weak or ambiguous match is pulled toward its neighbours’ disparity. Uniform smoothing also blurs depth across object boundaries; an edge-aware weight w<sub>pq</sub>, small across image edges, lets depth jump where the image changes.</p></header>
    <div class="l10-formula" aria-label="Energy minimised on slide 28">
      <dl class="l10-notation"><div><dt><i>p</i> = (<i>u</i>, <i>v</i>)</dt><dd>pixel location</dd></div><div><dt><i>d</i></dt><dd>candidate disparity value</dd></div><div><dt><b>D</b></dt><dd>entire disparity map</dd></div><div><dt><i>D<sub>p</sub></i> = <b>D</b>(<i>u</i>, <i>v</i>)</dt><dd>disparity assigned to pixel <i>p</i></dd></div></dl>
      <div class="l10-eq"><i>E</i>(<b>D</b>) = <span class="data">∑<sub><i>p</i></sub> <i>C</i>(<i>p</i>, <i>D<sub>p</sub></i>)</span> + <span class="lam">λ</span> <span class="smooth">∑<sub>(<i>p</i>,<i>q</i>)∈𝒩</sub> <span class="w"><i>w<sub>pq</sub></i></span> |<i>D<sub>p</sub></i> − <i>D<sub>q</sub></i>|</span></div>
      <div class="l10-eq-key"><span class="data">data term: each pixel matches well (the cost volume)</span><span class="smooth">smoothness term: neighbours have similar disparity, except at image boundaries</span><span class="lam">λ: trade-off weighting</span><span class="w">w<sub>pq</sub>: edge-aware weighting</span></div>
      <p>As in the slide’s figures, the maps below minimise the quadratic version ∑<sub><i>p</i></sub> <i>c<sub>p</sub></i> (<i>D<sub>p</sub></i> − <i>D̂<sub>p</sub></i>)² + λ ∑ <i>w<sub>pq</sub></i> (<i>D<sub>p</sub></i> − <i>D<sub>q</sub></i>)², where <i>D̂</i> is the winner-take-all map above and <i>c<sub>p</sub></i> = 1 − (lowest cost) / (lowest cost more than 1 px away) is its match confidence (the slide’s notes do not define <i>c<sub>p</sub></i>; this choice gives mean errors close to the slide’s). Uniform: <i>w<sub>pq</sub></i> = 1. Edge-aware: <i>w<sub>pq</sub></i> = exp(−|<i>I<sub>p</sub></i> − <i>I<sub>q</sub></i>| / 0.015), grey values <i>I</i> in [0, 1]. 𝒩 = pairs of horizontal and vertical neighbours.</p>
    </div>
    <div class="controls l8-controls">
      <div class="control"><label for="l10LambdaU">λ · uniform smoothness<output id="l10LambdaUOut">10</output></label><input id="l10LambdaU" type="range" min="0" max="100" step="1" value="10"></div>
      <div class="control"><label for="l10LambdaE">λ · edge-aware smoothness<output id="l10LambdaEOut">50</output></label><input id="l10LambdaE" type="range" min="0" max="200" step="1" value="50"></div>
      <div class="control narrow"><span class="control-label">View</span><div class="segment" id="l10View" role="group" aria-label="Map view"><button type="button" data-value="crop">Slide 28 crop</button><button type="button" data-value="full">Whole image</button></div><p class="l10-fixed" id="l10ViewNote" hidden>The slide-28 crop is of the Motorcycle.</p></div>
    </div>
    <div class="l8-grid two l10-maps" id="l10Maps">
      ${[['l10MapData','Data term only'],['l10MapUniform','+ uniform smoothness (w&nbsp;=&nbsp;1)'],['l10MapEdge','+ edge-aware smoothness'],['l10MapTruth','Ground truth']].map(([id,title])=>`<figure class="l8-panel" id="${id}Panel"><figcaption><span>${title}</span><small id="${id}Meta">—</small></figcaption><div class="l8-stage"><canvas id="${id}" class="l8-clickable" aria-label="${title.replace(/&nbsp;/g,' ')} disparity map; click a pixel"></canvas></div><p class="l10-map-error" id="${id}Error">&nbsp;</p></figure>`).join('')}
    </div>
    <div class="l10-scale l10-maps-scale"><span>d = 0</span><i style="background:${VIRIDIS_CSS}"></i><span id="l10MapsRange">—</span><span>grey = no ground truth</span></div>
    <p class="l8-caption l10-probe-line" id="l10SmoothProbe">—</p>
    <p class="l8-caption" id="l10SmoothNote">—</p>
  </section>
  <p class="l10-credit" id="l10Credit"></p></div>`;
}

export function createLecture10Experiments(root){
  const store=createStore(),runtime={token:0,onResize:null};
  return[{
    group:'Stereo & depth',id:'stereoMatching',icon:'⇆',title:'Stereo matching: failures & smoothing (L10)',
    description:'Click a pixel to see its SSD cost curve with the true and chosen disparity, jump to the four failure cases of slide 27, and fix ambiguous matches with the uniform or edge-aware smoothness of slide 28.',
    state:structuredClone(STEREO_DEFAULTS),
    output:()=>root.querySelector('#l10Wta'),
    mount(){const token=++runtime.token;mountStereo(this,root,store,runtime,token)},
    destroy(){runtime.token++;if(runtime.onResize)window.removeEventListener('resize',runtime.onResize)}
  }];
}

function mountStereo(experiment,root,store,runtime,token){
  const s=experiment.state;root.innerHTML=markup();
  const $=sel=>root.querySelector(sel),alive=()=>token===runtime.token,notify=()=>root.dispatchEvent(new Event('change',{bubbles:true}));
  const mark=(container,attr,value)=>container.querySelectorAll(`[data-${attr}]`).forEach(b=>{const on=b.dataset[attr]===String(value);b.classList.toggle('active',on);b.setAttribute('aria-pressed',on)});
  const pending=(id,on)=>$(`#${id}`)?.classList.toggle('l10-pending',on);
  const cropOf=()=>sceneOf(s).crop&&s.view==='crop'?sceneOf(s).crop:null;
  let current=null,matchJob=0,smoothJob=0;

  const probeOf=()=>{const scene=sceneOf(s);if(!s.probe[scene.id]){const c=scene.cases.textureless;s.probe[scene.id]={x:c.x,y:c.y};s.caseKey='textureless'}return s.probe[scene.id]};
  const isCasePixel=()=>{const scene=sceneOf(s),c=s.caseKey&&scene.cases[s.caseKey],p=s.probe[scene.id];return !!(c&&p&&p.x===c.x&&p.y===c.y)};
  const syncControls=()=>{
    const scene=sceneOf(s),b=baselineOf(s),multi=scene.baselines.length>1,baseline=$('#l10Baseline');
    mark($('#l10Scenes'),'scene',s.scene);mark($('#l10View'),'value',cropOf()?'crop':'full');
    $('#l10Window').value=s.window;$('#l10WindowOut').textContent=`${s.window} × ${s.window}`;
    baseline.hidden=!multi;$('#l10BaselineFixed').hidden=multi;baseline.value=b;$('#l10BaselineOut').textContent=scene.baselineText(b);
    $('#l10LambdaU').value=s.lambdaUniform;$('#l10LambdaUOut').textContent=s.lambdaUniform;$('#l10LambdaE').value=s.lambdaEdge;$('#l10LambdaEOut').textContent=s.lambdaEdge;
    $('#l10View').querySelector('[data-value="crop"]').disabled=!scene.crop;$('#l10ViewNote').hidden=!!scene.crop;
    $('#l10Maps').classList.toggle('crop',!!cropOf());
    let missing=false;
    root.querySelectorAll('#l10Cases [data-case]').forEach(button=>{const has=!!scene.cases[button.dataset.case];if(!has)missing=true;button.disabled=!has;const on=has&&s.caseKey===button.dataset.case&&isCasePixel();button.classList.toggle('active',on);button.setAttribute('aria-pressed',on)});
    $('#l10CaseNote').hidden=!missing;$('#l10Credit').textContent=scene.credit;
  };

  async function compute(){
    const job=++matchJob,scene=sceneOf(s),b=baselineOf(s),r=(s.window-1)/2;
    pending('l10WtaPanel',true);pending('l10CurvePanel',true);$('#l10CurveMeta').textContent='matching…';
    let data;try{data=await store.scene(scene)}catch(error){$('#l10LeftMeta').textContent=error.message;return}
    if(!alive()||job!==matchJob)return;
    const truth=data.truth(b),visible=data.visibility(b),D=scene.searchRange(b,truth),[leftName,rightName]=scene.grey(b),L=data.grey[leftName],R=data.grey[rightName];
    current={scene,b,r,D,range:data.range,truth,visible,L,R,leftColour:data.colour[leftName],rightColour:data.colour[rightName],wta:null,smoothed:null};
    drawLeft();
    const key=`${scene.id}|${b}|${r}`;let wta=store.matches.get(key);
    if(!wta){
      $('#l10WtaMeta').textContent='matching…';
      wta=await drive(winnerTakeAll(L,R,scene.w,scene.h,r,D),()=>alive()&&job===matchJob,f=>{$('#l10WtaMeta').textContent=`matching… ${Math.round(f*100)}%`});
      if(!wta)return;store.matches.set(key,wta);if(store.matches.size>6)store.matches.delete(store.matches.keys().next().value);
    }
    if(!alive()||job!==matchJob)return;
    current.wta=wta;pending('l10WtaPanel',false);pending('l10CurvePanel',false);drawWta();drawProbe();smooth();
  }

  function drawLeft(){
    const {scene,r,leftColour}=current,canvas=$('#l10Left');
    canvas.width=scene.w;canvas.height=scene.h;const ctx=canvas.getContext('2d');ctx.drawImage(leftColour.canvas,0,0);drawWindow(ctx,probeOf(),r);
    $('#l10LeftMeta').textContent=`${scene.w} × ${scene.h} · ${scene.baselineText(current.b)}`;
  }
  function drawWta(){
    const {scene,b,D,range,wta,truth,visible}=current,ctx=paintMap($('#l10Wta'),wta.disparity,scene,range,null);drawMarker(ctx,probeOf(),{x:0,y:0});
    const error=disparityError(wta.disparity,truth),depth=depthReadout(scene,b,wta.disparity,truth);
    let hidden=0,known=0;for(let i=0;i<truth.length;i++)if(truth[i]>=0){known++;if(visible[i]!==VISIBLE)hidden++}
    $('#l10WtaMeta').textContent=`search d = 0…${D} · mean error ${fmt(error.mae,2)} px`;$('#l10WtaRange').textContent=range;
    $('#l10WtaText').textContent=`${fmt(error.bad*100,0)}% of pixels with ground truth are more than 1 px off; ${fmt(hidden/known*100,0)}% are hidden in the right view or fall outside it. Depth (slide 23): at the median depth z = ${fmt(depth.z/1000,2)} m, 1 px of disparity error ≈ ${fmt(depth.perPixel,0)} mm (Δz ≈ z²/(fB)); this map’s median depth error is ${fmt(depth.error,0)} mm.${scene.baselines.length>1?' A wider B shrinks the first number but makes matching harder.':''}`;
  }

  function drawProbe(){
    if(!current?.wta)return;
    const {scene,r,D,truth,visible,L,R}=current,probe=probeOf(),curve=costCurve(L,R,scene.w,scene.h,probe.x,probe.y,r,D),f=probeFacts(scene,L,curve,truth,visible,probe,r);
    drawCurve($('#l10Curve'),curve,f.chosen,f.known?f.truth:NaN,r);
    $('#l10CurveMeta').textContent=`p = (${probe.x}, ${probe.y}) · ${s.window} × ${s.window} window`;
    drawPatch($('#l10PatchLeft'),current.leftColour,scene,probe,r,null);drawPatch($('#l10PatchChosen'),current.rightColour,scene,probe,r,f.chosen);
    const trueCanvas=$('#l10PatchTrue'),rounded=f.near;
    if(f.known)drawPatch(trueCanvas,current.rightColour,scene,probe,r,rounded);else{trueCanvas.width=trueCanvas.height=1}
    $('#l10PatchChosenLabel').textContent=`Right · chosen d = ${f.chosen}`;
    $('#l10PatchTrueLabel').textContent=!f.known?'Right · no ground truth':f.visibility===VISIBLE?`Right · near true d: d = ${rounded} (truth ${fmt(f.truth)})`:f.visibility===OCCLUDED?`Right · near true d: d = ${rounded}, hidden, shows what covers it`:`Right · near true d: d = ${rounded}, outside the image`;
    const verdict=$('#l10Verdict');
    if(!f.known){verdict.className='l8-verdict';verdict.textContent=`Lowest cost at d = ${f.chosen}. Middlebury gives no ground truth for this pixel.`}
    else if(f.error<=CORRECT){verdict.className='l8-verdict good';verdict.textContent=`Correct: the lowest cost is at d = ${f.chosen}, within ${CORRECT} px of the true ${fmt(f.truth)}.`}
    else{verdict.className='l8-verdict bad';verdict.textContent=`Wrong: the lowest cost is at d = ${f.chosen}, but the true disparity is ${fmt(f.truth)} (${fmt(f.error)} px off).`}
    $('#l10Facts').innerHTML=factLines(f);
    const example=scene.cases[s.caseKey],caseInfo=CASES.find(c=>c.key===s.caseKey),caseText=$('#l10CaseText');
    if(isCasePixel()&&caseInfo){
      const pinned=s.window===SLIDE_WINDOW&&current.b===scene.defaultBaseline,settings=`the ${SLIDE_WINDOW} × ${SLIDE_WINDOW} window${scene.baselines.length>1?` and the ${40*scene.defaultBaseline} mm baseline`:''}`;
      // The slide's explanation only holds at the settings the example was picked with.
      caseText.innerHTML=pinned?`<b>${caseInfo.label}</b> ${example.where}. ${caseInfo.what} <span class="l10-broken">Assumption broken:</span> ${caseInfo.broken}${example.slide?` <span class="l10-muted">${example.slide}</span>`:''}`:`This page’s <b>${caseInfo.label.toLowerCase()}</b> example ${example.where} was picked with ${settings}. Return to those settings to see that case; the lines above are for the current settings.`;
    }else caseText.textContent='Each line above checks one assumption behind matching from slide 27 for this pixel. The case buttons jump to the slide’s four examples.';
    drawSmoothProbe();
  }

  function drawSmoothMaps(){
    const {scene,range,truth,wta}=current,crop=cropOf(),whole=crop?' (whole image)':'';
    drawMarker(paintMap($('#l10MapTruth'),truth,scene,range,crop,{truth:true}),probeOf(),crop||{x:0,y:0});
    drawMarker(paintMap($('#l10MapData'),wta.disparity,scene,range,crop),probeOf(),crop||{x:0,y:0});
    $('#l10MapDataMeta').textContent='winner-take-all';$('#l10MapTruthMeta').textContent='Middlebury';
    $('#l10MapDataError').innerHTML=`mean error <b>${fmt(disparityError(wta.disparity,truth).mae,2)} px</b>${whole}`;$('#l10MapTruthError').innerHTML='&nbsp;';
    for(const [kind,id] of [['uniform','l10MapUniform'],['edge','l10MapEdge']]){
      const result=current.smoothed?.[kind];if(!result)continue;
      drawMarker(paintMap($(`#${id}`),result.map,scene,range,crop),probeOf(),crop||{x:0,y:0});
      $(`#${id}Error`).innerHTML=result.lambda>0?`mean error <b>${fmt(disparityError(result.map,truth).mae,2)} px</b>${whole}`:'λ = 0: same as the data term';
    }
    $('#l10MapsRange').textContent=range;
  }

  async function smooth(){
    const job=++smoothJob,{scene,b,r,wta,L}=current;current.smoothed={};
    for(const id of ['l10MapUniform','l10MapEdge']){pending(`${id}Panel`,true);$(`#${id}Meta`).textContent='waiting…';$(`#${id}Error`).innerHTML='&nbsp;'}
    drawSmoothMaps();drawSmoothProbe();
    for(const [kind,lambda,id] of [['uniform',s.lambdaUniform,'l10MapUniform'],['edge',s.lambdaEdge,'l10MapEdge']]){
      const key=`${scene.id}|${b}|${r}|${kind}|${lambda}`,meta=$(`#${id}Meta`);let result=store.smooths.get(key);
      if(!result){
        const weights=neighbourWeights(L,scene.w,scene.h,kind==='edge',EDGE_SIGMA),crop=cropOf();
        result=await drive(smoothDisparity(wta.disparity,wta.confidence,weights,scene.w,scene.h,lambda),()=>alive()&&job===smoothJob,step=>{drawMarker(paintMap($(`#${id}`),step.map,scene,current.range,crop),probeOf(),crop||{x:0,y:0});meta.textContent=`solving… iteration ${step.iteration}`});
        if(!result)return;result={map:Float64Array.from(result.map),iteration:result.iteration,lambda};store.smooths.set(key,result);if(store.smooths.size>8)store.smooths.delete(store.smooths.keys().next().value);
      }
      if(!alive()||job!==smoothJob)return;
      current.smoothed[kind]=result;pending(`${id}Panel`,false);meta.textContent=`λ = ${lambda}`;drawSmoothMaps();drawSmoothProbe();
    }
    const errors=[disparityError(wta.disparity,current.truth).mae,disparityError(current.smoothed.uniform.map,current.truth).mae,disparityError(current.smoothed.edge.map,current.truth).mae];
    const slideSettings=scene.id==='motorcycle'&&s.window===SLIDE_WINDOW&&s.lambdaUniform===10&&s.lambdaEdge===50;
    $('#l10SmoothNote').textContent=`Mean error = mean |D_p − true disparity| over every pixel with ground truth. ${slideSettings?`Slide 28 reports 4.7, 3.7 and 3.4 px for these settings; this page re-implements the recipe in the slide’s notes and gets ${errors.map(v=>fmt(v,2)).join(', ')} px (the slide’s exact image preprocessing is not documented).`:'Slide 28’s settings: Motorcycle, 9 × 9 window, uniform λ = 10, edge-aware λ = 50.'} Smoothing cannot recover a pixel whose neighbours are wrong too, such as the textureless example ${scene.cases.textureless.where} or the occluded one ${scene.cases.occlusion.where}.`;
  }
  function drawSmoothProbe(){
    if(!current?.wta)return;const probe=probeOf(),i=probe.y*current.scene.w+probe.x,t=current.truth[i],u=current.smoothed?.uniform,e=current.smoothed?.edge;
    $('#l10SmoothProbe').innerHTML=`At p = (${probe.x}, ${probe.y}): data term <b>${current.wta.disparity[i]}</b> → uniform <b>${u?fmt(u.map[i]):'…'}</b> → edge-aware <b>${e?fmt(e.map[i]):'…'}</b> · true disparity <b>${t>=0?fmt(t):'unknown'}</b>`;
  }

  const setProbe=(x,y)=>{s.probe[sceneOf(s).id]={x,y};syncControls();if(!current?.wta)return;drawLeft();drawWta();drawProbe();drawSmoothMaps()};
  const clickTo=(canvas,cropped)=>canvas.addEventListener('click',event=>{
    if(!current?.wta)return;const rect=canvas.getBoundingClientRect(),crop=cropped?cropOf():null,region=crop||{x:0,y:0,w:current.scene.w,h:current.scene.h};
    const x=region.x+Math.min(region.w-1,Math.max(0,Math.floor((event.clientX-rect.left)/rect.width*region.w))),y=region.y+Math.min(region.h-1,Math.max(0,Math.floor((event.clientY-rect.top)/rect.height*region.h)));
    setProbe(x,y);
  });
  clickTo($('#l10Left'),false);clickTo($('#l10Wta'),false);['l10MapData','l10MapUniform','l10MapEdge','l10MapTruth'].forEach(id=>clickTo($(`#${id}`),true));

  $('#l10Scenes').addEventListener('click',event=>{const button=event.target.closest('[data-scene]');if(!button||button.dataset.scene===s.scene)return;s.scene=button.dataset.scene;probeOf();syncControls();notify();compute()});
  $('#l10Cases').addEventListener('click',event=>{const button=event.target.closest('[data-case]');if(!button||button.disabled)return;const c=sceneOf(s).cases[button.dataset.case];if(!c)return;s.caseKey=button.dataset.case;setProbe(c.x,c.y)});
  $('#l10Window').addEventListener('input',event=>{s.window=Number(event.target.value);syncControls();compute()});
  $('#l10Baseline').addEventListener('input',event=>{s.baseline[s.scene]=Number(event.target.value);syncControls();compute()});
  $('#l10LambdaU').addEventListener('input',event=>{s.lambdaUniform=Number(event.target.value);syncControls();if(current?.wta)smooth()});
  $('#l10LambdaE').addEventListener('input',event=>{s.lambdaEdge=Number(event.target.value);syncControls();if(current?.wta)smooth()});
  $('#l10View').addEventListener('click',event=>{const button=event.target.closest('[data-value]');if(!button||button.disabled||button.dataset.value===s.view)return;s.view=button.dataset.value;syncControls();notify();if(current?.wta)drawSmoothMaps()});
  runtime.onResize=()=>{if(alive()&&current?.wta){drawLeft();drawWta();drawProbe();drawSmoothMaps()}};window.addEventListener('resize',runtime.onResize);

  probeOf();syncControls();compute();
}

/* ---------- guide and Python sample ---------- */

const link=(label,url)=>({label,url}),param=(name,value,description,active=true)=>({name,value:String(value),description,active});
export function stereoGuide(state){
  const s={...STEREO_DEFAULTS,...state},scene=sceneOf(s),b=baselineOf(s);
  return{overview:'Grey left and right images of a rectified pair. For every pixel p and every shift d the page computes the SSD over a w × w window (slide 25), takes the lowest cost (winner-take-all), and compares the result with Middlebury’s ground truth. A pixel is hidden in the right view when a nearer surface lands on the same column there. The smoothed maps solve slide 28’s quadratic energy exactly by conjugate gradients.',
    params:[
      param('Window W',`${s.window} × ${s.window}`,'Larger windows average more pixels, so they are less sensitive to noise and to textureless or repeated detail, but they blur depth at object boundaries (slide 26). Slides 25, 27 and 28 use 9 × 9.'),
      param('Baseline B',scene.baselineText(b),scene.baselines.length>1?'Pairs view 1 with a view b steps to its right (40 mm apart each). A wider baseline gives larger disparities, and so finer depth, but more occlusion and a larger change in appearance between the views (slide 23).':'The Motorcycle is a single stereo pair; choose Laundry to vary the baseline.',scene.baselines.length>1),
      param('Search range',`d = 0 … ${scene.id==='motorcycle'?71:'1.2 × the largest true disparity'}`,'Motorcycle: d = 0 … 71, as on slides 25 and 27. Laundry: 0 up to 1.2 × the largest true disparity at that baseline. Right-image pixels shifted in from beyond its left edge count as 0, as in the lecture’s figures.'),
      param('λ · uniform',s.lambdaUniform,'Trade-off between the data term and the smoothness term with w_pq = 1. Slide 28 uses λ = 10. λ = 0 returns the winner-take-all map.'),
      param('λ · edge-aware',s.lambdaEdge,'Same trade-off with w_pq = exp(−|I_p − I_q| / 0.015), which is small across image edges. Slide 28 uses λ = 50.'),
      param('Confidence c_p','1 − C₁ / C₂','C₁ is the lowest cost of the pixel and C₂ the lowest cost more than 1 px away from it. Ambiguous pixels (flat or repeated costs) get a low c_p and follow their neighbours more. Slide 28’s notes only say “weighted by match confidence”; this definition gives mean errors close to the slide’s.'),
      param('Assumption checks','measured per pixel','Contrast is the standard deviation of the grey values in W. A shift “fits about as well” when its RMS difference, √(SSD / w²), is at most 1 grey level above the chosen shift’s, or at most 3 grey levels. Near-equal minima are other local minima within 1.35 × the lowest cost and at least 3 px away. Visibility counts every pixel of the window. The appearance check runs only when the whole window is visible and has no depth edge (a jump of more than 1 px between neighbours); it uses the better of the two whole shifts around the sub-pixel truth and flags differences above 0.6 × the contrast (and above 6 grey levels).'),
      param('Depth',`z = f B / (d + d₀)`,'Middlebury crops its images, which shifts every disparity by d₀, so depth uses d + d₀ (Motorcycle: f = 995 px, B = 193 mm, d₀ = 31.1 px at quarter size; Laundry: f = 1247 px, B = 40 mm per view step, d₀ = 19.2 px per step). A disparity error Δd changes depth by Δz ≈ z²/(fB) per pixel (slide 23).')],
    links:[link('Middlebury stereo datasets','https://vision.middlebury.edu/stereo/data/'),link('Computer stereo vision','https://en.wikipedia.org/wiki/Computer_stereo_vision'),link('Szeliski: Computer Vision, 2nd ed., ch. 12','https://szeliski.org/Book/')]};
}

export const STEREO_PYTHON_SAMPLE=`import numpy as np
from scipy import sparse
from scipy.sparse.linalg import spsolve

# The page's Motorcycle pair: grey images and ground truth at quarter size (images/stereo/ in the site repo)
H, W, D_MAX = 500, 741, 71
L = np.fromfile("motorcycle-left.gray", np.uint8).reshape(H, W).astype(np.int64)
R = np.fromfile("motorcycle-right.gray", np.uint8).reshape(H, W).astype(np.int64)
gt = np.fromfile("motorcycle-gt.u16", "<u2").reshape(H, W) / 64.0
gt[gt == 0] = np.nan

def cost_volume(L, R, window=9, d_max=D_MAX):
    """C[d] = SSD between the window around p in L and the window shifted by d in R (slide 25)."""
    r, k, (h, w) = window // 2, window, L.shape
    C = np.empty((d_max + 1, h, w), np.int64)
    for d in range(d_max + 1):
        shifted = np.zeros_like(R)
        shifted[:, d:] = R[:, :w - d]                     # beyond the right image's left edge: 0
        S = np.pad((L - shifted) ** 2, r, mode="symmetric").cumsum(0).cumsum(1)
        S = np.pad(S, ((1, 0), (1, 0)))
        C[d] = S[k:, k:] - S[:-k, k:] - S[k:, :-k] + S[:-k, :-k]
    return C

C = cost_volume(L, R)
D_hat = C.argmin(0)                                    # winner-take-all (slide 25)
yy, xx = np.indices(D_hat.shape)
C_far = C.astype(float)
for k in (-1, 0, 1):                                   # lowest cost more than 1 px away
    idx = D_hat + k
    ok = (idx >= 0) & (idx <= D_MAX)
    C_far[idx[ok], yy[ok], xx[ok]] = np.inf
C1, C2 = C.min(0), C_far.min(0)
conf = np.where(C2 > 0, 1 - C1 / np.where(C2 > 0, C2, 1), 0)

def smooth(lam, edge_aware, sigma=0.015):
    """argmin sum c_p (D_p - D_hat_p)^2 + lam * sum w_pq (D_p - D_q)^2 (slide 28, quadratic form)."""
    I, n = L / 255.0, H * W
    idx = np.arange(n).reshape(H, W)
    wx = np.exp(-np.abs(I[:, 1:] - I[:, :-1]) / sigma) if edge_aware else np.ones((H, W - 1))
    wy = np.exp(-np.abs(I[1:] - I[:-1]) / sigma) if edge_aware else np.ones((H - 1, W))
    A = sparse.diags(conf.ravel().astype(float)).tolil()
    for a, b, w in ((idx[:, :-1], idx[:, 1:], wx), (idx[:-1], idx[1:], wy)):
        a, b, w = a.ravel(), b.ravel(), lam * w.ravel()
        A += sparse.csr_matrix((np.r_[w, w, -w, -w], (np.r_[a, b, a, b], np.r_[a, b, b, a])), shape=(n, n))
    return spsolve(A.tocsc(), (conf * D_hat).ravel()).reshape(H, W)

mae = lambda D: np.nanmean(np.abs(D - gt))
print(f"data term {mae(D_hat):.2f} px, uniform {mae(smooth(10, False)):.2f} px, edge-aware {mae(smooth(50, True)):.2f} px")`;
