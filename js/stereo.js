// Lecture 10 · stereo matching, slides 25–28. Pure functions (no DOM), shared by the page (js/lecture10.js)
// and its checks (scripts/verify_stereo.py). Images are 8-bit grey arrays, row-major, width w and height h.

export const VISIBLE=0,OCCLUDED=1,OUTSIDE=2,UNKNOWN=3;

// scipy.ndimage 'reflect' (half-sample symmetric) border: … c b a | a b c … for an overhang smaller than n.
const reflect=(i,n)=>i<0?-i-1:i>=n?2*n-i-1:i;

// Squared difference between the left image and the right image shifted right by d. Right-image pixels that
// would come from beyond its left edge count as 0 (black), as in the lecture's figures.
function squaredDifference(L,R,w,h,d,out){
  for(let y=0;y<h;y++){const row=y*w;for(let x=0;x<w;x++){const diff=L[row+x]-(x>=d?R[row+x-d]:0);out[row+x]=diff*diff}}
}

// (2r+1) × (2r+1) window sums with reflected borders: SSD over the window W (slide 25). Exact integers.
function windowSums(E,w,h,r,horizontal,out){
  for(let y=0;y<h;y++){const row=y*w;let sum=0;for(let k=-r;k<=r;k++)sum+=E[row+reflect(k,w)];for(let x=0;x<w;x++){horizontal[row+x]=sum;sum+=E[row+reflect(x+r+1,w)]-E[row+reflect(x-r,w)]}}
  const column=new Int32Array(w);
  for(let k=-r;k<=r;k++){const row=reflect(k,h)*w;for(let x=0;x<w;x++)column[x]+=horizontal[row+x]}
  for(let y=0;y<h;y++){const row=y*w,add=reflect(y+r+1,h)*w,drop=reflect(y-r,h)*w;for(let x=0;x<w;x++){out[row+x]=column[x];column[x]+=horizontal[add+x]-horizontal[drop+x]}}
}

// Winner-take-all over the cost volume C(p, d), d = 0..D. Yields after every `chunk` disparities so the page
// stays responsive, and returns, per pixel: the chosen disparity (lowest cost, smallest d on ties), the lowest
// cost C1, and the confidence c = 1 − C1/C2, where C2 is the lowest cost more than 1 px away from the choice.
export function* winnerTakeAll(L,R,w,h,r,D,chunk=6){
  const n=w*h,E=new Int32Array(n),H=new Int32Array(n),S=new Int32Array(n);
  const b=[0,1,2,3].map(()=>new Int32Array(n).fill(2147483647)),k=[0,1,2,3].map(()=>new Uint8Array(n));
  for(let d=0;d<=D;d++){
    squaredDifference(L,R,w,h,d,E);windowSums(E,w,h,r,H,S);
    // Keep the four lowest costs per pixel (enough to find C2 after excluding the choice and its two neighbours).
    for(let i=0;i<n;i++){const v=S[i];if(v>=b[3][i])continue;let j=3;while(j>0&&v<b[j-1][i]){b[j][i]=b[j-1][i];k[j][i]=k[j-1][i];j--}b[j][i]=v;k[j][i]=d}
    if(d%chunk===chunk-1&&d<D)yield (d+1)/(D+1);
  }
  const disparity=new Uint8Array(n),best=new Int32Array(n),confidence=new Float32Array(n);
  for(let i=0;i<n;i++){
    const choice=k[0][i];let second=-1;for(let j=1;j<4;j++)if(Math.abs(k[j][i]-choice)>1){second=b[j][i];break}
    disparity[i]=choice;best[i]=b[0][i];confidence[i]=second>0?1-b[0][i]/second:0;
  }
  return{disparity,best,confidence};
}

// One pixel's cost curve C(p, d) for d = 0..D, identical to the volume above (slide 27's plots).
export function costCurve(L,R,w,h,x,y,r,D){
  const curve=new Float64Array(D+1);
  for(let d=0;d<=D;d++){let sum=0;for(let dy=-r;dy<=r;dy++){const row=reflect(y+dy,h)*w;for(let dx=-r;dx<=r;dx++){const xx=reflect(x+dx,w),diff=L[row+xx]-(xx>=d?R[row+xx-d]:0);sum+=diff*diff}}curve[d]=sum}
  return curve;
}

// Visibility from the ground truth: a pixel lands on column round(x − d) of the right image; it is hidden there
// when a nearer surface (more than 1 px larger disparity) lands on the same column. NaN = no ground truth.
export function visibility(gt,w,h){
  const out=new Uint8Array(w*h),nearest=new Float64Array(w);
  for(let y=0;y<h;y++){
    const row=y*w;nearest.fill(-Infinity);
    for(let x=0;x<w;x++){const d=gt[row+x];if(!(d>=0))continue;const c=Math.floor(x-d+.5);if(c>=0&&d>nearest[c])nearest[c]=d}
    for(let x=0;x<w;x++){const d=gt[row+x];if(!(d>=0)){out[row+x]=UNKNOWN;continue}const c=Math.floor(x-d+.5);out[row+x]=c<0?OUTSIDE:d<nearest[c]-1?OCCLUDED:VISIBLE}
  }
  return out;
}

// Neighbour weights w_pq for the 4-neighbour pairs (p, q): horizontal pairs (x, x+1) and vertical pairs (y, y+1).
// Uniform: w_pq = 1. Edge-aware: w_pq = exp(−|I_p − I_q| / sigma) with grey values I in [0, 1] (slide 28).
export function neighbourWeights(grey,w,h,edgeAware,sigma=.015){
  const wx=new Float32Array((w-1)*h),wy=new Float32Array(w*(h-1));
  const weight=(a,b)=>edgeAware?Math.exp(-Math.abs(a-b)/255/sigma):1;
  for(let y=0;y<h;y++)for(let x=0;x<w-1;x++)wx[y*(w-1)+x]=weight(grey[y*w+x],grey[y*w+x+1]);
  for(let y=0;y<h-1;y++)for(let x=0;x<w;x++)wy[y*w+x]=weight(grey[y*w+x],grey[(y+1)*w+x]);
  return{wx,wy};
}

// Slide 28, quadratic version (as in the slide's figures): minimise
//   Σ_p c_p (D_p − D̂_p)² + λ Σ_(p,q) w_pq (D_p − D_q)²
// where D̂ is the winner-take-all map and c_p its confidence. The minimum solves a sparse linear system, here by
// conjugate gradients with a Jacobi preconditioner, starting from D̂. Yields {map, iteration, residual} every
// `every` iterations and returns the final map.
export function* smoothDisparity(dhat,confidence,{wx,wy},w,h,lambda,{tolerance=1e-8,maxIterations=3000,every=12}={}){
  const n=w*h,x=Float64Array.from(dhat);
  if(!(lambda>0))return{map:x,iteration:0,residual:0};
  const diag=new Float64Array(n),apply=(v,out)=>{
    for(let i=0;i<n;i++)out[i]=confidence[i]*v[i];
    for(let y=0;y<h;y++)for(let xx=0;xx<w-1;xx++){const i=y*w+xx,f=lambda*wx[y*(w-1)+xx]*(v[i]-v[i+1]);out[i]+=f;out[i+1]-=f}
    for(let y=0;y<h-1;y++)for(let xx=0;xx<w;xx++){const i=y*w+xx,f=lambda*wy[i]*(v[i]-v[i+w]);out[i]+=f;out[i+w]-=f}
  };
  for(let i=0;i<n;i++)diag[i]=confidence[i];
  for(let y=0;y<h;y++)for(let xx=0;xx<w-1;xx++){const i=y*w+xx,f=lambda*wx[y*(w-1)+xx];diag[i]+=f;diag[i+1]+=f}
  for(let y=0;y<h-1;y++)for(let xx=0;xx<w;xx++){const i=y*w+xx,f=lambda*wy[i];diag[i]+=f;diag[i+w]+=f}
  const b=new Float64Array(n),r=new Float64Array(n),z=new Float64Array(n),p=new Float64Array(n),q=new Float64Array(n);
  let bNorm=0;for(let i=0;i<n;i++){b[i]=confidence[i]*dhat[i];bNorm+=b[i]*b[i]}bNorm=Math.sqrt(bNorm)||1;
  apply(x,q);let rz=0;for(let i=0;i<n;i++){r[i]=b[i]-q[i];z[i]=diag[i]>0?r[i]/diag[i]:0;p[i]=z[i];rz+=r[i]*z[i]}
  let iteration=0,residual=Infinity;
  while(iteration<maxIterations){
    apply(p,q);let pq=0;for(let i=0;i<n;i++)pq+=p[i]*q[i];if(!(pq>0))break;
    const alpha=rz/pq;let rr=0,rzNext=0;
    for(let i=0;i<n;i++){x[i]+=alpha*p[i];r[i]-=alpha*q[i];rr+=r[i]*r[i];z[i]=diag[i]>0?r[i]/diag[i]:0;rzNext+=r[i]*z[i]}
    iteration++;residual=Math.sqrt(rr)/bNorm;if(residual<tolerance)break;
    const beta=rzNext/rz;rz=rzNext;for(let i=0;i<n;i++)p[i]=z[i]+beta*p[i];
    if(iteration%every===0)yield{map:x,iteration,residual};
  }
  return{map:x,iteration,residual};
}

// Mean absolute disparity error over every pixel with ground truth ("over the full image", slide 28 notes),
// and the share of those pixels that are more than 1 px off.
export function disparityError(map,gt){
  let sum=0,count=0,bad=0;for(let i=0;i<gt.length;i++){const g=gt[i];if(!(g>=0))continue;const e=Math.abs(map[i]-g);sum+=e;count++;if(e>1)bad++}
  return{mae:count?sum/count:NaN,bad:count?bad/count:NaN,count};
}
