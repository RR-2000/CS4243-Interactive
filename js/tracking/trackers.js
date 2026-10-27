// Fixed-template NCC tracker and MOSSE correlation-filter tracker (Bolme et al., CVPR 2010).
// Both search the same local window (2 × the target box) so only the scoring model and the
// update rule differ — exactly the comparison on the "Template Matching vs. MOSSE" slide.

import {fft2d,fftReal} from './fft.js';
import {seededRandom} from './shared.js';

export const GRID=64;                 // MOSSE window resolution (power of two for the FFT)
export const SEARCH_PADDING=2;        // search window = 2 × target box for both trackers
export const TEMPLATE_GRID=GRID/SEARCH_PADDING;
export const DEFAULT_ETA=.125;        // Bolme et al. learning rate
export const DEFAULT_PSR_THRESHOLD=7; // Bolme et al.: PSR below ~7 signals occlusion or failure
const TARGET_SIGMA=2;                 // width of the desired Gaussian response, in grid cells
const PSR_EXCLUDE=11;                 // sidelobe excludes an 11 × 11 window around the peak
const INIT_SAMPLES=8;                 // perturbed copies of the first patch
const REGULARIZATION=.01;             // λ relative to the mean spectral energy

/** Converts RGBA pixels into a grayscale frame {data, w, h} with values 0–255. */
export function grayFrame(pixels,w,h){
  const data=new Float32Array(w*h);
  for(let i=0,p=0;p<data.length;i+=4,p++)data[p]=.299*pixels[i]+.587*pixels[i+1]+.114*pixels[i+2];
  return{data,w,h};
}

/** Bilinearly resamples a (possibly rotated/scaled) ww × wh window centered at (cx, cy) to n × n. */
export function sampleWindow(frame,cx,cy,ww,wh,n=GRID,{angle=0,scale=1}={}){
  const {data,w,h}=frame,out=new Float32Array(n*n),c=Math.cos(angle)*scale,s=Math.sin(angle)*scale;
  for(let j=0;j<n;j++){
    const v=((j+.5)/n-.5)*wh;
    for(let i=0;i<n;i++){
      const u=((i+.5)/n-.5)*ww;
      const x=Math.min(w-1.001,Math.max(0,cx+c*u-s*v-.5)),y=Math.min(h-1.001,Math.max(0,cy+s*u+c*v-.5));
      const x0=x|0,y0=y|0,fx=x-x0,fy=y-y0,k=y0*w+x0;
      out[j*n+i]=data[k]*(1-fx)*(1-fy)+data[k+1]*fx*(1-fy)+data[k+w]*(1-fx)*fy+data[k+w+1]*fx*fy;
    }
  }
  return out;
}

function hannWindow(n){
  const line=Float64Array.from({length:n},(_,i)=>Math.sin(Math.PI*(i+.5)/n)**2),out=new Float64Array(n*n);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)out[y*n+x]=line[x]*line[y];
  return out;
}

/** Desired MOSSE output: a sharp Gaussian centred on the origin (wrapped), returned as a spectrum. */
function gaussianSpectrum(n,sigma){
  const g=new Float64Array(n*n);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const dx=Math.min(x,n-x),dy=Math.min(y,n-y);
    g[y*n+x]=Math.exp(-(dx*dx+dy*dy)/(2*sigma*sigma));
  }
  return fftReal(g,n,n);
}

/** MOSSE pre-processing: log transform, zero mean / unit variance, cosine window. */
function preprocess(patch,window){
  const out=new Float64Array(patch.length);
  let mean=0;
  for(let i=0;i<patch.length;i++){out[i]=Math.log1p(patch[i]);mean+=out[i]}
  mean/=patch.length;
  let variance=0;
  for(let i=0;i<out.length;i++){out[i]-=mean;variance+=out[i]*out[i]}
  const std=Math.sqrt(variance/out.length)||1;
  for(let i=0;i<out.length;i++)out[i]=out[i]/std*window[i];
  return out;
}

export function findPeak(map,w,h){
  let index=0;
  for(let i=1;i<w*h;i++)if(map[i]>map[index])index=i;
  return{x:index%w,y:Math.floor(index/w),value:map[index]};
}

/** Peak-to-sidelobe ratio: (peak − mean) / std of the map outside an 11 × 11 window. */
export function peakToSidelobe(map,w,h,peak,wrap=false){
  const half=PSR_EXCLUDE>>1;
  let sum=0,sumSq=0,count=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let dx=Math.abs(x-peak.x),dy=Math.abs(y-peak.y);
    if(wrap){dx=Math.min(dx,w-dx);dy=Math.min(dy,h-dy)}
    if(dx<=half&&dy<=half)continue;
    const v=map[y*w+x];sum+=v;sumSq+=v*v;count++;
  }
  if(!count)return 0;
  const mean=sum/count,std=Math.sqrt(Math.max(0,sumSq/count-mean*mean));
  return(peak.value-mean)/Math.max(std,1e-9);
}

function parabolic(left,center,right){
  const denominator=left-2*center+right;
  return Math.abs(denominator)<1e-12?0:Math.max(-.5,Math.min(.5,(left-right)/(2*denominator)));
}

function clampBox(box,frame){
  return{...box,cx:Math.min(frame.w,Math.max(0,box.cx)),cy:Math.min(frame.h,Math.max(0,box.cy))};
}

/** Moves the zero-displacement bin from the corner to the centre for display. */
function fftShift(map,n){
  const out=new Float32Array(n*n),half=n>>1;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++)out[((y+half)%n)*n+(x+half)%n]=map[y*n+x];
  return out;
}

export class MosseTracker{
  constructor({eta=DEFAULT_ETA}={}){
    this.eta=eta;
    this.window=hannWindow(GRID);
    this.target=gaussianSpectrum(GRID,TARGET_SIGMA);
  }

  init(frame,box){
    const size=GRID*GRID,random=seededRandom(4243);
    this.box=clampBox(box,frame);
    this.A={re:new Float64Array(size),im:new Float64Array(size)};
    this.B=new Float64Array(size);
    this.memory=new Float32Array(size);
    for(let k=0;k<INIT_SAMPLES;k++){
      // Small random rotations and scalings make the first filter robust (lecture: "perturbed ROI").
      const angle=k?(random()-.5)*.2:0,scale=k?.92+random()*.16:1;
      this.accumulate(this.sample(frame,this.box,{angle,scale}),1/INIT_SAMPLES,1);
    }
    let energy=0;for(const v of this.B)energy+=v;
    this.lambda=REGULARIZATION*energy/size;
    this.solve();
  }

  sample(frame,box,transform){
    const patch=sampleWindow(frame,box.cx,box.cy,box.w*SEARCH_PADDING,box.h*SEARCH_PADDING,GRID,transform);
    return{patch,F:fftReal(preprocess(patch,this.window),GRID,GRID)};
  }

  // A ← keep·A + weight·(G ⊙ F*),  B ← keep·B + weight·(F ⊙ F*)
  // `memory` applies the same weights to the raw patches: a picture of what A and B remember.
  accumulate({patch,F},weight,keep){
    const G=this.target,A=this.A,B=this.B;
    for(let i=0;i<B.length;i++){
      A.re[i]=keep*A.re[i]+weight*(G.re[i]*F.re[i]+G.im[i]*F.im[i]);
      A.im[i]=keep*A.im[i]+weight*(G.im[i]*F.re[i]-G.re[i]*F.im[i]);
      B[i]=keep*B[i]+weight*(F.re[i]*F.re[i]+F.im[i]*F.im[i]);
      this.memory[i]=keep*this.memory[i]+weight*patch[i];
    }
  }

  // H* = A / (B + λ)
  solve(){
    const n=this.B.length;
    this.H={re:new Float64Array(n),im:new Float64Array(n)};
    for(let i=0;i<n;i++){const d=this.B[i]+this.lambda;this.H.re[i]=this.A.re[i]/d;this.H.im[i]=this.A.im[i]/d}
  }

  respond(frame){
    const {F}=this.sample(frame,this.box),re=new Float64Array(F.re.length),im=new Float64Array(F.re.length),H=this.H;
    for(let i=0;i<re.length;i++){re[i]=F.re[i]*H.re[i]-F.im[i]*H.im[i];im[i]=F.re[i]*H.im[i]+F.im[i]*H.re[i]}
    fft2d(re,im,GRID,GRID,true);
    return re;
  }

  /**
   * Locate with the old filter, then (unless gated) update A, B with weight η.
   * When `gate` is on and PSR < threshold the frame is treated as unreliable: the box holds
   * its last confident position and the filter is not trained on it.
   */
  track(frame,{gate=false,threshold=DEFAULT_PSR_THRESHOLD}={}){
    const response=this.respond(frame),peak=findPeak(response,GRID,GRID),psr=peakToSidelobe(response,GRID,GRID,peak,true);
    const at=(x,y)=>response[((y+GRID)%GRID)*GRID+(x+GRID)%GRID];
    let dx=peak.x>=GRID/2?peak.x-GRID:peak.x,dy=peak.y>=GRID/2?peak.y-GRID:peak.y;
    dx+=parabolic(at(peak.x-1,peak.y),peak.value,at(peak.x+1,peak.y));
    dy+=parabolic(at(peak.x,peak.y-1),peak.value,at(peak.x,peak.y+1));
    const weak=psr<threshold,skipped=gate&&weak;
    if(!skipped){
      const cell=SEARCH_PADDING/GRID;
      this.box=clampBox({...this.box,cx:this.box.cx+dx*this.box.w*cell,cy:this.box.cy+dy*this.box.h*cell},frame);
      this.accumulate(this.sample(frame,this.box),this.eta,1-this.eta);
      this.solve();
    }
    return{box:{...this.box},psr,weak,skipped,response:fftShift(response,GRID),size:GRID};
  }

  /** η-weighted average of the training patches (search-window sized, GRID × GRID). */
  memoryImage(){return this.memory}

  /** Spatial filter h (what MOSSE has learned), aligned with the search window. */
  filterImage(){
    const re=Float64Array.from(this.H.re),im=this.H.im.map(v=>-v);
    fft2d(re,im,GRID,GRID,true);
    return Float32Array.from(re);
  }
}

export class NccTracker{
  init(frame,box){
    this.box=clampBox(box,frame);
    const patch=sampleWindow(frame,this.box.cx,this.box.cy,this.box.w,this.box.h,TEMPLATE_GRID);
    let mean=0;for(const v of patch)mean+=v;mean/=patch.length;
    this.template=patch;
    this.centered=patch.map(v=>v-mean);
    let norm=0;for(const v of this.centered)norm+=v*v;
    this.norm=Math.sqrt(norm);
  }

  /** Zero-mean NCC of the fixed template at every offset inside the search window. */
  track(frame){
    const T=TEMPLATE_GRID,m=GRID-T+1,count=T*T,box=this.box;
    const window=sampleWindow(frame,box.cx,box.cy,box.w*SEARCH_PADDING,box.h*SEARCH_PADDING,GRID);
    const stride=GRID+1,sum=new Float64Array(stride*stride),sumSq=new Float64Array(stride*stride);
    for(let y=0;y<GRID;y++)for(let x=0;x<GRID;x++){
      const v=window[y*GRID+x],i=(y+1)*stride+x+1;
      sum[i]=v+sum[i-1]+sum[i-stride]-sum[i-stride-1];
      sumSq[i]=v*v+sumSq[i-1]+sumSq[i-stride]-sumSq[i-stride-1];
    }
    const rect=(table,x,y)=>table[(y+T)*stride+x+T]-table[y*stride+x+T]-table[(y+T)*stride+x]+table[y*stride+x];
    const map=new Float32Array(m*m);
    for(let oy=0;oy<m;oy++)for(let ox=0;ox<m;ox++){
      let dot=0;
      for(let j=0;j<T;j++){const row=(oy+j)*GRID+ox,t=j*T;for(let i=0;i<T;i++)dot+=window[row+i]*this.centered[t+i]}
      const s=rect(sum,ox,oy),variance=rect(sumSq,ox,oy)-s*s/count;
      map[oy*m+ox]=variance>1e-6&&this.norm>1e-6?dot/(Math.sqrt(variance)*this.norm):0;
    }
    const peak=findPeak(map,m,m),psr=peakToSidelobe(map,m,m,peak),cell=SEARCH_PADDING/GRID,center=(m-1)/2;
    this.box=clampBox({...box,cx:box.cx+(peak.x-center)*box.w*cell,cy:box.cy+(peak.y-center)*box.h*cell},frame);
    return{box:{...this.box},psr,score:peak.value,response:map,size:m};
  }

  templateImage(){return this.template}
}
