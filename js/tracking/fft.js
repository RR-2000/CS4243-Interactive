// Minimal radix-2 complex FFT used by the MOSSE demo. Sizes must be powers of two.

const plans=new Map();

function plan(n){
  if(plans.has(n))return plans.get(n);
  if(n<1||(n&(n-1)))throw new Error(`FFT size must be a power of two, got ${n}`);
  const bits=Math.log2(n),reverse=new Uint32Array(n),cos=new Float64Array(n/2),sin=new Float64Array(n/2);
  for(let i=0;i<n;i++){let r=0;for(let b=0;b<bits;b++)r|=((i>>b)&1)<<(bits-1-b);reverse[i]=r}
  for(let i=0;i<n/2;i++){cos[i]=Math.cos(-2*Math.PI*i/n);sin[i]=Math.sin(-2*Math.PI*i/n)}
  const result={reverse,cos,sin};
  plans.set(n,result);
  return result;
}

// In-place 1D FFT over re/im starting at `offset` with element `stride`.
function fft1d(re,im,n,offset,stride,inverse){
  const {reverse,cos,sin}=plan(n),sign=inverse?-1:1;
  for(let i=0;i<n;i++){
    const j=reverse[i];
    if(j>i){
      const a=offset+i*stride,b=offset+j*stride;
      let t=re[a];re[a]=re[b];re[b]=t;t=im[a];im[a]=im[b];im[b]=t;
    }
  }
  for(let size=2;size<=n;size*=2){
    const half=size/2,step=n/size;
    for(let start=0;start<n;start+=size){
      for(let k=0;k<half;k++){
        const wr=cos[k*step],wi=sign*sin[k*step];
        const a=offset+(start+k)*stride,b=offset+(start+k+half)*stride;
        const xr=re[b]*wr-im[b]*wi,xi=re[b]*wi+im[b]*wr;
        re[b]=re[a]-xr;im[b]=im[a]-xi;re[a]+=xr;im[a]+=xi;
      }
    }
  }
}

/** In-place 2D FFT of a w × h complex image (row-major). The inverse divides by w·h. */
export function fft2d(re,im,w,h,inverse=false){
  for(let y=0;y<h;y++)fft1d(re,im,w,y*w,1,inverse);
  for(let x=0;x<w;x++)fft1d(re,im,h,x,w,inverse);
  if(inverse){const scale=1/(w*h);for(let i=0;i<re.length;i++){re[i]*=scale;im[i]*=scale}}
}

/** Returns {re, im} spectra of a real-valued w × h image without modifying it. */
export function fftReal(values,w,h){
  const re=Float64Array.from(values),im=new Float64Array(values.length);
  fft2d(re,im,w,h,false);
  return{re,im};
}
