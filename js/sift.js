// Compact SIFT (Lowe 2004) that follows OpenCV's implementation step for step: Gaussian and
// Difference-of-Gaussian pyramids, 26-neighbour extrema, quadratic refinement with contrast and
// edge rejection, a 36-bin orientation histogram, and the 4 x 4 x 8 descriptor with trilinear
// voting, unit normalisation, clipping at 0.2 and renormalisation.
//
// Angles follow OpenCV's descriptor convention: gradients use dy = I(y - 1) - I(y + 1), so 0 deg
// points right and 90 deg points up on screen. `keypoint.angle` is in that convention; draw it as
// the screen vector (cos angle, -sin angle).

export const SIFT_DEFAULTS={octaveLayers:3,sigma:1.6,contrastThreshold:.04,edgeThreshold:10,upsample:false,maxOctaves:5};
export const SIFT_DESCRIPTOR={cells:4,bins:8,cellWidthFactor:3,clip:.2};
const IMG_BORDER=5,MAX_INTERP_STEPS=5,ORI_BINS=36,ORI_SIG_FACTOR=1.5,ORI_RADIUS_FACTOR=3*ORI_SIG_FACTOR,ORI_PEAK_RATIO=.8,INIT_SIGMA=.5;

const reflect=(i,n)=>{if(n===1)return 0;while(i<0||i>=n)i=i<0?-i:2*n-2-i;return i};

function gaussianKernel(sigma){
  const size=Math.max(3,Math.round(sigma*8+1)|1),radius=(size-1)/2,kernel=new Float32Array(size);let sum=0;
  for(let i=-radius;i<=radius;i++){const v=Math.exp(-(i*i)/(2*sigma*sigma));kernel[i+radius]=v;sum+=v}
  for(let i=0;i<kernel.length;i++)kernel[i]/=sum;
  return kernel;
}

// Separable Gaussian blur with OpenCV's default reflect-101 border.
export function gaussianBlur(src,w,h,sigma){
  const kernel=gaussianKernel(sigma),radius=(kernel.length-1)/2,tmp=new Float32Array(w*h),out=new Float32Array(w*h),cols=new Int32Array(w+2*radius),rows=new Int32Array(h+2*radius);
  for(let i=0;i<cols.length;i++)cols[i]=reflect(i-radius,w);
  for(let i=0;i<rows.length;i++)rows[i]=reflect(i-radius,h);
  for(let y=0;y<h;y++){const row=y*w;for(let x=0;x<w;x++){let sum=0;for(let k=0;k<kernel.length;k++)sum+=src[row+cols[x+k]]*kernel[k];tmp[row+x]=sum}}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0;for(let k=0;k<kernel.length;k++)sum+=tmp[rows[y+k]*w+x]*kernel[k];out[y*w+x]=sum}
  return out;
}

function halve(src,w,h){
  const nw=Math.max(1,Math.floor(w/2)),nh=Math.max(1,Math.floor(h/2)),out=new Float32Array(nw*nh);
  for(let y=0;y<nh;y++)for(let x=0;x<nw;x++)out[y*nw+x]=src[(2*y)*w+2*x];
  return{data:out,w:nw,h:nh};
}

function doubleLinear(src,w,h){
  const nw=w*2,nh=h*2,out=new Float32Array(nw*nh);
  for(let y=0;y<nh;y++){const sy=Math.min(h-1,Math.max(0,(y+.5)/2-.5)),y0=Math.floor(sy),y1=Math.min(h-1,y0+1),fy=sy-y0;
    for(let x=0;x<nw;x++){const sx=Math.min(w-1,Math.max(0,(x+.5)/2-.5)),x0=Math.floor(sx),x1=Math.min(w-1,x0+1),fx=sx-x0;
      out[y*nw+x]=(src[y0*w+x0]*(1-fx)+src[y0*w+x1]*fx)*(1-fy)+(src[y1*w+x0]*(1-fx)+src[y1*w+x1]*fx)*fy}}
  return{data:out,w:nw,h:nh};
}

// Gray values are expected in [0, 1].
export function buildPyramids(gray,w,h,options={}){
  const o={...SIFT_DEFAULTS,...options},S=o.octaveLayers,firstOctave=o.upsample?-1:0;
  let base={data:gray,w,h};
  if(o.upsample)base=doubleLinear(gray,w,h);
  const initial=Math.sqrt(Math.max(o.sigma*o.sigma-(o.upsample?4:1)*INIT_SIGMA*INIT_SIGMA,.01));
  base={data:gaussianBlur(base.data,base.w,base.h,initial),w:base.w,h:base.h};
  const octaveCount=Math.max(1,Math.min(o.maxOctaves,Math.round(Math.log2(Math.min(base.w,base.h))-2)-firstOctave));
  const k=2**(1/S),increments=[o.sigma];
  for(let i=1;i<S+3;i++){const previous=k**(i-1)*o.sigma,total=previous*k;increments.push(Math.sqrt(total*total-previous*previous))}
  const octaves=[];
  for(let oc=0;oc<octaveCount;oc++){
    const gauss=[];
    for(let i=0;i<S+3;i++){
      if(oc===0&&i===0)gauss.push(base);
      else if(i===0){const prev=octaves[oc-1];gauss.push(halve(prev.gauss[S],prev.w,prev.h))}
      else{const prev=gauss[i-1];gauss.push({data:gaussianBlur(prev.data,prev.w,prev.h,increments[i]),w:prev.w,h:prev.h})}
    }
    const {w:ow,h:oh}=gauss[0],dog=[];
    for(let i=0;i<S+2;i++){const a=gauss[i].data,b=gauss[i+1].data,d=new Float32Array(ow*oh);for(let p=0;p<d.length;p++)d[p]=b[p]-a[p];dog.push(d)}
    octaves.push({w:ow,h:oh,gauss:gauss.map(item=>item.data),dog});
  }
  return{octaves,options:o,firstOctave,width:w,height:h};
}

function solve3(H,b){
  const [a,b1,c]=H[0],[d,e,f]=H[1],[g,h,i]=H[2],det=a*(e*i-f*h)-b1*(d*i-f*g)+c*(d*h-e*g);
  if(Math.abs(det)<1e-12)return null;
  const inv=[[(e*i-f*h)/det,(c*h-b1*i)/det,(b1*f-c*e)/det],[(f*g-d*i)/det,(a*i-c*g)/det,(c*d-a*f)/det],[(d*h-e*g)/det,(b1*g-a*h)/det,(a*e-b1*d)/det]];
  return inv.map(row=>row[0]*b[0]+row[1]*b[1]+row[2]*b[2]);
}

function derivatives(dog,layer,w,r,c){
  const img=dog[layer],prev=dog[layer-1],next=dog[layer+1],i=r*w+c,v=img[i];
  const dD=[(img[i+1]-img[i-1])*.5,(img[i+w]-img[i-w])*.5,(next[i]-prev[i])*.5],v2=v*2;
  const dxx=img[i+1]+img[i-1]-v2,dyy=img[i+w]+img[i-w]-v2,dss=next[i]+prev[i]-v2;
  const dxy=(img[i+w+1]-img[i+w-1]-img[i-w+1]+img[i-w-1])*.25,dxs=(next[i+1]-next[i-1]-prev[i+1]+prev[i-1])*.25,dys=(next[i+w]-next[i-w]-prev[i+w]+prev[i-w])*.25;
  return{v,dD,H:[[dxx,dxy,dxs],[dxy,dyy,dys],[dxs,dys,dss]]};
}

function refine(pyr,oc,layer,r,c){
  const {dog}=pyr.octaves[oc],{w,h}=pyr.octaves[oc],o=pyr.options,S=o.octaveLayers;let xi=0,xr=0,xc=0,step=0;
  for(;step<MAX_INTERP_STEPS;step++){
    const {dD,H}=derivatives(dog,layer,w,r,c),X=solve3(H,dD);
    if(!X)return null;
    xc=-X[0];xr=-X[1];xi=-X[2];
    if(Math.abs(xi)<.5&&Math.abs(xr)<.5&&Math.abs(xc)<.5)break;
    if(Math.abs(xi)>1e6||Math.abs(xr)>1e6||Math.abs(xc)>1e6)return null;
    c+=Math.round(xc);r+=Math.round(xr);layer+=Math.round(xi);
    if(layer<1||layer>S||c<IMG_BORDER||c>=w-IMG_BORDER||r<IMG_BORDER||r>=h-IMG_BORDER)return null;
  }
  if(step>=MAX_INTERP_STEPS)return null;
  const {v,dD,H}=derivatives(dog,layer,w,r,c),contrast=v+.5*(dD[0]*xc+dD[1]*xr+dD[2]*xi);
  if(Math.abs(contrast)*S<o.contrastThreshold)return null;
  const tr=H[0][0]+H[1][1],det=H[0][0]*H[1][1]-H[0][1]*H[0][1];
  if(det<=0||tr*tr*o.edgeThreshold>=(o.edgeThreshold+1)**2*det)return null;
  const scale=2**(oc+pyr.firstOctave);
  return{x:(c+xc)*scale,y:(r+xr)*scale,octave:oc,layer,xi,r,c,octaveSigma:o.sigma*2**((layer+xi)/S),size:o.sigma*2**((layer+xi)/S)*scale*2,response:Math.abs(contrast)};
}

// 36-bin histogram of gradient orientations around (c, r), weighted by magnitude and a Gaussian.
export function orientationHistogram(img,w,h,c,r,radius,sigma){
  const raw=new Float64Array(ORI_BINS),scale=-1/(2*sigma*sigma);
  for(let i=-radius;i<=radius;i++){const y=r+i;if(y<=0||y>=h-1)continue;
    for(let j=-radius;j<=radius;j++){const x=c+j;if(x<=0||x>=w-1)continue;
      const dx=img[y*w+x+1]-img[y*w+x-1],dy=img[(y-1)*w+x]-img[(y+1)*w+x],angle=(Math.atan2(dy,dx)*180/Math.PI+360)%360;
      let bin=Math.round(ORI_BINS/360*angle);if(bin>=ORI_BINS)bin-=ORI_BINS;
      raw[bin]+=Math.exp((i*i+j*j)*scale)*Math.hypot(dx,dy)}}
  const hist=new Float64Array(ORI_BINS),at=i=>raw[(i+ORI_BINS)%ORI_BINS];
  for(let i=0;i<ORI_BINS;i++)hist[i]=(at(i-2)+at(i+2))/16+(at(i-1)+at(i+1))*4/16+at(i)*6/16;
  return{raw,hist};
}

export function dominantOrientations(hist){
  let max=0;for(const v of hist)max=Math.max(max,v);
  const angles=[];
  for(let j=0;j<ORI_BINS;j++){const l=j>0?j-1:ORI_BINS-1,r=j<ORI_BINS-1?j+1:0;
    if(hist[j]>hist[l]&&hist[j]>hist[r]&&hist[j]>=max*ORI_PEAK_RATIO){
      let bin=j+.5*(hist[l]-hist[r])/(hist[l]-2*hist[j]+hist[r]);bin=bin<0?ORI_BINS+bin:bin>=ORI_BINS?bin-ORI_BINS:bin;
      angles.push((360/ORI_BINS*bin)%360)}}
  return angles;
}

export function detectKeypoints(pyr){
  // OpenCV floors this pre-filter in 0-255 units before refinement applies the real contrast test.
  const o=pyr.options,S=o.octaveLayers,threshold=Math.floor(.5*o.contrastThreshold/S*255)/255,keypoints=[];
  pyr.octaves.forEach((octave,oc)=>{
    const {w,h,dog,gauss}=octave;
    for(let layer=1;layer<=S;layer++){
      const img=dog[layer],prev=dog[layer-1],next=dog[layer+1];
      for(let r=IMG_BORDER;r<h-IMG_BORDER;r++)for(let c=IMG_BORDER;c<w-IMG_BORDER;c++){
        const i=r*w+c,v=img[i];if(Math.abs(v)<=threshold)continue;
        let extremum=true;
        if(v>0){for(let dy=-1;dy<=1&&extremum;dy++)for(let dx=-1;dx<=1;dx++){const j=i+dy*w+dx;if(prev[j]>v||next[j]>v||((dx||dy)&&img[j]>v)){extremum=false;break}}}
        else{for(let dy=-1;dy<=1&&extremum;dy++)for(let dx=-1;dx<=1;dx++){const j=i+dy*w+dx;if(prev[j]<v||next[j]<v||((dx||dy)&&img[j]<v)){extremum=false;break}}}
        if(!extremum)continue;
        const kp=refine(pyr,oc,layer,r,c);if(!kp)continue;
        const {hist}=orientationHistogram(gauss[kp.layer],w,h,kp.c,kp.r,Math.round(ORI_RADIUS_FACTOR*kp.octaveSigma),ORI_SIG_FACTOR*kp.octaveSigma);
        for(const angle of dominantOrientations(hist))keypoints.push({...kp,angle});
      }
    }
  });
  keypoints.sort((a,b)=>a.x-b.x||a.y-b.y||b.size-a.size||a.angle-b.angle);
  const unique=keypoints.filter((kp,i)=>!i||kp.x!==keypoints[i-1].x||kp.y!==keypoints[i-1].y||kp.size!==keypoints[i-1].size||kp.angle!==keypoints[i-1].angle);
  return unique.sort((a,b)=>b.response-a.response||a.y-b.y||a.x-b.x);
}

// OpenCV's calcSIFTDescriptor. With `trace`, every contributing sample is returned in the
// rotated, cell-unit frame so the page can draw the canonical window.
export function computeDescriptor(pyr,kp,{trace=false,rotate=true,weighting=true,clip=SIFT_DESCRIPTOR.clip}={}){
  const {cells:d,bins:n,cellWidthFactor}=SIFT_DESCRIPTOR,octave=pyr.octaves[kp.octave],{w,h}=octave,img=octave.gauss[kp.layer];
  const scale=2**(kp.octave+pyr.firstOctave),px=Math.round(kp.x/scale),py=Math.round(kp.y/scale),angle=rotate?kp.angle:0,sigma=kp.octaveSigma;
  const histWidth=cellWidthFactor*sigma,radius=Math.min(Math.round(histWidth*Math.SQRT2*(d+1)*.5),Math.round(Math.hypot(w,h)));
  const cos=Math.cos(angle*Math.PI/180)/histWidth,sin=Math.sin(angle*Math.PI/180)/histWidth,expScale=-1/(d*d*.5),binsPerDegree=n/360;
  const hist=new Float64Array((d+2)*(d+2)*(n+2)),samples=trace?[]:null;
  for(let i=-radius;i<=radius;i++)for(let j=-radius;j<=radius;j++){
    const cRot=j*cos-i*sin,rRot=j*sin+i*cos,rbin=rRot+d/2-.5,cbin=cRot+d/2-.5,r=py+i,c=px+j;
    if(!(rbin>-1&&rbin<d&&cbin>-1&&cbin<d&&r>0&&r<h-1&&c>0&&c<w-1))continue;
    const dx=img[r*w+c+1]-img[r*w+c-1],dy=img[(r-1)*w+c]-img[(r+1)*w+c],weight=weighting?Math.exp((cRot*cRot+rRot*rRot)*expScale):1;
    const ori=(Math.atan2(dy,dx)*180/Math.PI+360)%360,mag=Math.hypot(dx,dy)*weight;
    let obin=(ori-angle)*binsPerDegree;
    if(samples)samples.push({u:cRot,v:rRot,dx,dy,ori,relative:((ori-angle)%360+360)%360,mag:Math.hypot(dx,dy),weight});
    let r0=Math.floor(rbin),c0=Math.floor(cbin),o0=Math.floor(obin);
    const fr=rbin-r0,fc=cbin-c0,fo=obin-o0;
    if(o0<0)o0+=n;if(o0>=n)o0-=n;
    const vr1=mag*fr,vr0=mag-vr1,vrc11=vr1*fc,vrc10=vr1-vrc11,vrc01=vr0*fc,vrc00=vr0-vrc01;
    const v111=vrc11*fo,v110=vrc11-v111,v101=vrc10*fo,v100=vrc10-v101,v011=vrc01*fo,v010=vrc01-v011,v001=vrc00*fo,v000=vrc00-v001;
    const idx=((r0+1)*(d+2)+c0+1)*(n+2)+o0;
    hist[idx]+=v000;hist[idx+1]+=v001;hist[idx+n+2]+=v010;hist[idx+n+3]+=v011;
    hist[idx+(d+2)*(n+2)]+=v100;hist[idx+(d+2)*(n+2)+1]+=v101;hist[idx+(d+3)*(n+2)]+=v110;hist[idx+(d+3)*(n+2)+1]+=v111;
  }
  const raw=new Float32Array(d*d*n);
  for(let i=0;i<d;i++)for(let j=0;j<d;j++){
    const idx=((i+1)*(d+2)+(j+1))*(n+2);hist[idx]+=hist[idx+n];hist[idx+1]+=hist[idx+n+1];
    for(let k=0;k<n;k++)raw[(i*d+j)*n+k]=hist[idx+k];
  }
  let norm=0;for(const v of raw)norm+=v*v;norm=Math.sqrt(norm)||1e-7;
  const unit=raw.map(v=>v/norm),clipped=unit.map(v=>Math.min(v,clip));
  let norm2=0;for(const v of clipped)norm2+=v*v;norm2=Math.sqrt(norm2)||1e-7;
  const descriptor=clipped.map(v=>v/norm2);
  return trace?{descriptor,raw,unit,clipped,samples,angle,histWidth,radius,center:{x:px,y:py},octaveScale:scale,image:img,w,h}:descriptor;
}

export function sift(gray,w,h,options={}){
  const pyr=buildPyramids(gray,w,h,options),keypoints=detectKeypoints(pyr);
  keypoints.forEach(kp=>{kp.descriptor=computeDescriptor(pyr,kp)});
  return{pyr,keypoints};
}

export function descriptorDistance(a,b){let sum=0;for(let i=0;i<a.length;i++){const d=a[i]-b[i];sum+=d*d}return Math.sqrt(sum)}

// Brute-force 2-nearest-neighbour search (OpenCV's BFMatcher.knnMatch with k = 2).
export function knnMatch(queries,train){
  return queries.map((q,qi)=>{
    let best=-1,second=-1,d1=Infinity,d2=Infinity;
    train.forEach((t,ti)=>{const d=descriptorDistance(q.descriptor,t.descriptor);if(d<d1){d2=d1;second=best;d1=d;best=ti}else if(d<d2){d2=d;second=ti}});
    return{query:qi,best,second,d1,d2,ratio:d2>0&&Number.isFinite(d2)?d1/d2:1};
  });
}
