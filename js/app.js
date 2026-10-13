import {createLecture4Experiments} from './lecture4.js?v=18';
import {createNmsExperiment,nmsGuide,NMS_PYTHON_SAMPLE} from './nms.js?v=5';
import {createLecture8Experiments,siftGuide,ratioGuide,SIFT_PYTHON_SAMPLE,RATIO_PYTHON_SAMPLE} from './lecture8.js?v=5';

(()=>{
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const clamp=(v,a=0,b=255)=>Math.max(a,Math.min(b,v));
const state={source:document.createElement('canvas'),name:'Sample image',size:null,url:null,version:0,active:'channels',output:null};
const root=$('#experimentRoot');

function fit(w,h,max=1200){const s=Math.min(1,max/Math.max(w,h));return [Math.round(w*s),Math.round(h*s)]}
function sourceData(){return state.source.getContext('2d',{willReadFrequently:true}).getImageData(0,0,state.source.width,state.source.height)}
function canvas(id,source=state.source){const c=$('#'+id);c.width=source.width;c.height=source.height;c.getContext('2d',{willReadFrequently:true}).drawImage(source,0,0);return c}
function put(id,data){
  const c=$('#'+id);
  if(id==='houghSpace'){
    const accumulator=document.createElement('canvas');
    accumulator.width=data.width;accumulator.height=data.height;
    accumulator.getContext('2d').putImageData(data,0,0);
    const [w,h]=fit(state.source.width,state.source.height,360);
    c.width=w;c.height=h;
    const context=c.getContext('2d');
    context.imageSmoothingEnabled=false;
    context.drawImage(accumulator,0,0,w,h);
  }else{
    c.width=data.width;c.height=data.height;
    c.getContext('2d').putImageData(data,0,0);
  }
  state.output=c;return c;
}
function card(id,title,meta=''){return `<figure class="card"><figcaption><span>${title}</span><small>${meta}</small></figcaption><div class="canvas-box"><canvas id="${id}"></canvas></div></figure>`}
function controlRange(id,label,min,max,value,step=1){return `<div class="control"><label for="${id}">${label}<output id="${id}Out">${value}</output></label><input id="${id}" type="range" min="${min}" max="${max}" value="${value}" step="${step}"></div>`}
function segment(id,items,active){return `<div class="segment" id="${id}">${items.map(([v,l])=>`<button data-value="${v}" class="${v===active?'active':''}">${l}</button>`).join('')}</div>`}
function bindSegment(id,callback){$('#'+id).addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;$$('button',$('#'+id)).forEach(x=>x.classList.toggle('active',x===b));callback(b.dataset.value)})}
function bindRange(id,callback,format=v=>v){$('#'+id).addEventListener('input',e=>{$('#'+id+'Out').textContent=format(e.target.value);callback(+e.target.value)})}
function rgbHsv(r,g,b){r/=255;g/=255;b/=255;const M=Math.max(r,g,b),m=Math.min(r,g,b),d=M-m;let h=0;if(d){h=M===r?((g-b)/d)%6:M===g?(b-r)/d+2:(r-g)/d+4;h=(h*60+360)%360}return[h,M?d/M:0,M]}
function hsvRgb(h,s,v){const c=v*s,x=c*(1-Math.abs((h/60%2)-1)),m=v-c;let q=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return q.map(n=>(n+m)*255)}
function grayData(src=sourceData()){const out=new ImageData(src.width,src.height);for(let i=0;i<src.data.length;i+=4){const y=.299*src.data[i]+.587*src.data[i+1]+.114*src.data[i+2];out.data[i]=out.data[i+1]=out.data[i+2]=y;out.data[i+3]=src.data[i+3]}return out}
function histogram(data,bins=256){const h=new Array(bins).fill(0);for(let i=0;i<data.data.length;i+=4)h[Math.min(bins-1,Math.floor(data.data[i]/256*bins))]++;return h}
function drawHistogram(id,h,color='#315ee7'){const c=$('#'+id),dpr=devicePixelRatio||1,w=c.clientWidth||400,hgt=c.clientHeight||220;c.width=w*dpr;c.height=hgt*dpr;const ctx=c.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,hgt);const mx=Math.max(...h);ctx.fillStyle=color;h.forEach((v,i)=>{const bh=v/mx*(hgt-8);ctx.fillRect(i*w/h.length,hgt-bh,Math.ceil(w/h.length),bh)})}
function formatBytes(n){return n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(2)} MB`}
function formatNumber(value){const v=Math.abs(value)<1e-10?0:value;return Number.isInteger(v)?String(v):Number(v.toFixed(2)).toString()}
function floatImageData(values,w,h){const out=new ImageData(w,h);for(let i=0;i<values.length;i++){const v=clamp(values[i]);out.data[i*4]=out.data[i*4+1]=out.data[i*4+2]=v;out.data[i*4+3]=255}return out}

const experiments=[
{group:'Core explorers',id:'effectsExplorer',icon:'◐',title:'Image-effects explorer',description:'Compare point operations, thresholding, smoothing, sharpening, and nonlinear filters.',state:{effect:'threshold',amount:128,kernel:3},mount(){root.innerHTML=`<div class="controls"><div class="control"><label>Operation</label><select id="effectType"><optgroup label="Point transformations"><option value="invert">Invert</option><option value="brightness">Brightness</option><option value="gamma">Gamma</option></optgroup><optgroup label="Histogram and threshold"><option value="threshold">Binary threshold</option><option value="stretch">Histogram stretch</option><option value="equalize">Histogram equalization</option></optgroup><optgroup label="Linear filters"><option value="smooth">Average smoothing</option><option value="sharpen">Sharpen</option></optgroup><optgroup label="Nonlinear filters"><option value="median">Median</option><option value="maximum">Maximum</option></optgroup></select></div>${controlRange('effectAmount','Parameter',1,255,this.state.amount)}<div class="control"><label>Kernel size</label><select id="effectKernel"><option>3</option><option>5</option><option>7</option></select></div></div><div class="results three">${card('effectBefore','Before · full image')}${card('effectAfter','After · full image')}${card('effectDifference','Absolute difference')}</div><div class="hist-layout effect-histograms"><div class="hist-panel"><h3>Before histogram</h3><canvas class="histogram" id="effectHistBefore"></canvas></div><div class="hist-panel"><h3>After histogram</h3><canvas class="histogram" id="effectHistAfter"></canvas></div></div><div class="note" id="effectFailure"></div>`;$('#effectType').value=this.state.effect;$('#effectKernel').value=this.state.kernel;$('#effectType').onchange=e=>{this.state.effect=e.target.value;this.render()};$('#effectKernel').onchange=e=>{this.state.kernel=+e.target.value;this.render()};bindRange('effectAmount',v=>{this.state.amount=v;this.render()});this.render()},render(){const g=workingGray(520),src=g.data,w=g.w,h=g.h,out=new Float32Array(src),effect=this.state.effect,a=this.state.amount,k=this.state.kernel;if(effect==='invert')for(let i=0;i<out.length;i++)out[i]=255-src[i];else if(effect==='brightness')for(let i=0;i<out.length;i++)out[i]=clamp(src[i]+(a-128));else if(effect==='gamma'){const gamma=.1+a/64;for(let i=0;i<out.length;i++)out[i]=255*(src[i]/255)**gamma}else if(effect==='threshold')for(let i=0;i<out.length;i++)out[i]=src[i]>=a?255:0;else if(effect==='stretch'){let lo=255,hi=0;for(const v of src){lo=Math.min(lo,v);hi=Math.max(hi,v)}for(let i=0;i<out.length;i++)out[i]=(src[i]-lo)*255/Math.max(1,hi-lo)}else if(effect==='equalize'){const bins=new Uint32Array(256);for(const v of src)bins[Math.round(v)]++;let sum=0;const lut=new Float32Array(256);for(let i=0;i<256;i++){sum+=bins[i];lut[i]=sum/src.length*255}for(let i=0;i<out.length;i++)out[i]=lut[Math.round(src[i])]}else if(effect==='smooth')out.set(convolveGray(src,w,h,new Array(k*k).fill(1/(k*k)),k));else if(effect==='sharpen'){const blur=convolveGray(src,w,h,new Array(k*k).fill(1/(k*k)),k),gain=a/64;for(let i=0;i<out.length;i++)out[i]=clamp(src[i]+gain*(src[i]-blur[i]))}else{const p=Math.floor(k/2);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const values=[];for(let dy=-p;dy<=p;dy++)for(let dx=-p;dx<=p;dx++)values.push(src[clamp(y+dy,0,h-1)*w+clamp(x+dx,0,w-1)]);if(effect==='median'){values.sort((q,r)=>q-r);out[y*w+x]=values[Math.floor(values.length/2)]}else out[y*w+x]=Math.max(...values)}}const before=floatImageData(src,w,h),after=floatImageData(out,w,h),diff=new Float32Array(out.length);for(let i=0;i<diff.length;i++)diff[i]=Math.abs(out[i]-src[i]);put('effectBefore',before);put('effectAfter',after);scalarImage('effectDifference',diff,w,h,false);drawHistogram('effectHistBefore',histogram(before));drawHistogram('effectHistAfter',histogram(after),'#d14b45');const notes={invert:'Failure case: inversion preserves noise and structure; it only remaps intensity.',brightness:'Clipping appears when values are pushed below 0 or above 255.',gamma:'Extreme gamma values collapse several input levels into the same output level, causing banding.',threshold:'A single global threshold fails under uneven lighting and removes within-region detail.',stretch:'Stretching also amplifies noise when outliers define the input minimum and maximum.',equalize:'Equalization may over-amplify noise and produce unnatural contrast in already balanced images.',smooth:'A larger box kernel removes noise but blurs edges and fine structures.',sharpen:'Strong sharpening amplifies noise and produces bright or dark halos near edges.',median:'Median filtering removes impulse noise but can erase thin lines and small details.',maximum:'Maximum filtering expands bright regions and removes small dark structures.'};$('#effectFailure').textContent=notes[effect];state.output=$('#effectAfter')}},
{group:'Core explorers',id:'matrixExplorer',icon:'▦',title:'Matrix-operations explorer',description:'Edit matrices and inspect every value used by convolution, correlation, dilation, padding, stride, and pooling.',state:{image:[[1,2,3,4,5],[6,7,8,9,10],[11,12,13,14,15],[16,17,18,19,20],[21,22,23,24,25]],kernel:[[1,0,-1],[1,0,-1],[1,0,-1]],operation:'correlation',padding:'zero',stride:1,dilation:1,pooling:'none',selected:0},mount(){root.innerHTML=`<div class="controls matrix-controls"><div class="control"><label>Operation</label><select id="matrixOperation"><option value="correlation">Correlation</option><option value="convolution">Convolution</option></select></div><div class="control"><label>Padding</label><select id="matrixPadding"><option value="valid">Valid / none</option><option value="zero">Zero padding</option><option value="copy">Copy padding</option></select></div><div class="control"><label>Stride</label><select id="matrixStride"><option>1</option><option>2</option><option>3</option></select></div><div class="control"><label>Dilation</label><select id="matrixDilation"><option>1</option><option>2</option></select></div><div class="control"><label>Pooling</label><select id="matrixPooling"><option value="none">None</option><option value="average">Average pooling</option><option value="max">Max pooling</option></select></div></div><div class="matrix-workspace"><section class="matrix-section"><div class="matrix-title"><b>Image matrix</b><small>Editable 5 × 5</small></div><div id="imageMatrix" class="number-grid image-grid"></div></section><section class="matrix-section"><div class="matrix-title"><b>Custom kernel</b><small>Editable 3 × 3</small></div><div id="kernelMatrix" class="number-grid kernel-grid"></div><div class="kernel-presets"><button data-kernel="edge">Edge</button><button data-kernel="sharpen">Sharpen</button><button data-kernel="blur">Blur</button><button data-kernel="identity">Identity</button></div></section><section class="matrix-section output-section"><div class="matrix-title"><b>Output grid</b><small>Click a cell to inspect it</small></div><div id="outputMatrix" class="number-grid output-grid"></div></section></div><div class="calculation-panel"><div><span class="calc-label">Receptive field</span><div id="receptiveValues" class="number-grid mini-grid"></div></div><div class="calc-symbol">×</div><div><span class="calc-label" id="kernelCalcLabel">Kernel</span><div id="kernelValues" class="number-grid mini-grid"></div></div><div class="calc-symbol">=</div><div class="products-block"><span class="calc-label">Elementwise products</span><div id="productValues" class="number-grid mini-grid"></div></div><div class="sum-block"><span class="calc-label">Running sum</span><ol id="runningSum"></ol><b id="finalSum">—</b></div></div><div class="note" id="matrixMeta"></div>`;['matrixOperation','matrixPadding','matrixStride','matrixDilation','matrixPooling'].forEach(id=>{const key=id.replace('matrix','').toLowerCase();$('#'+id).value=this.state[key];$('#'+id).onchange=e=>{this.readMatrices();this.state[key]=['stride','dilation'].includes(key)?+e.target.value:e.target.value;this.state.selected=0;this.render()}});$('.kernel-presets').onclick=e=>{const b=e.target.closest('button');if(!b)return;this.readMatrices();const presets={edge:[[1,0,-1],[1,0,-1],[1,0,-1]],sharpen:[[0,-1,0],[-1,5,-1],[0,-1,0]],blur:[[1/9,1/9,1/9],[1/9,1/9,1/9],[1/9,1/9,1/9]],identity:[[0,0,0],[0,1,0],[0,0,0]]};this.state.kernel=presets[b.dataset.kernel];this.render()};this.render()},readMatrices(){const imageInputs=$$('#imageMatrix input'),kernelInputs=$$('#kernelMatrix input');if(imageInputs.length)this.state.image=Array.from({length:5},(_,y)=>Array.from({length:5},(_,x)=>+imageInputs[y*5+x].value||0));if(kernelInputs.length)this.state.kernel=Array.from({length:3},(_,y)=>Array.from({length:3},(_,x)=>+kernelInputs[y*3+x].value||0))},inputGrid(id,matrix,type){$('#'+id).innerHTML=matrix.flatMap((row,y)=>row.map((v,x)=>`<input type="number" step="any" value="${Number(v.toFixed?.(3)??v)}" data-y="${y}" data-x="${x}" aria-label="${type} row ${y+1} column ${x+1}">`)).join('');$$('#'+id+' input').forEach(input=>input.onchange=()=>{this.readMatrices();this.state.selected=0;this.render()})},compute(){const image=this.state.image,kernel=this.state.operation==='convolution'?this.state.kernel.slice().reverse().map(r=>r.slice().reverse()):this.state.kernel,d=this.state.dilation,effective=1+(3-1)*d,pad=this.state.padding==='valid'?0:Math.floor(effective/2),stride=this.state.stride,outH=Math.max(0,Math.floor((5+2*pad-effective)/stride)+1),outW=outH,outputs=[],fields=[];const sample=(y,x)=>{if(y>=0&&x>=0&&y<5&&x<5)return{value:image[y][x],y,x,padded:false};if(this.state.padding==='copy'){const yy=clamp(y,0,4),xx=clamp(x,0,4);return{value:image[yy][xx],y:yy,x:xx,padded:true}}return{value:0,y,x,padded:true}};for(let oy=0;oy<outH;oy++)for(let ox=0;ox<outW;ox++){const field=[],products=[];for(let ky=0;ky<3;ky++)for(let kx=0;kx<3;kx++){const cell=sample(oy*stride-pad+ky*d,ox*stride-pad+kx*d),kv=kernel[ky][kx];field.push(cell);products.push(cell.value*kv)}let value=products.reduce((a,b)=>a+b,0);if(this.state.pooling!=='none'){const values=field.map(v=>v.value);value=this.state.pooling==='average'?values.reduce((a,b)=>a+b,0)/values.length:Math.max(...values)}outputs.push(value);fields.push({field,products,kernel})}return{outputs,fields,outW,outH,effective,pad}},render(){this.inputGrid('imageMatrix',this.state.image,'image');this.inputGrid('kernelMatrix',this.state.kernel,'kernel');const result=this.compute();this.state.selected=clamp(this.state.selected,0,Math.max(0,result.outputs.length-1));$('#outputMatrix').style.gridTemplateColumns=`repeat(${Math.max(1,result.outW)},42px)`;$('#outputMatrix').innerHTML=result.outputs.length?result.outputs.map((v,i)=>`<button class="output-cell ${i===this.state.selected?'selected':''}" data-index="${i}">${formatNumber(v)}</button>`).join(''):'<span class="empty-output">No valid output cells</span>';$$('.output-cell').forEach(b=>{b.onmouseenter=()=>this.select(+b.dataset.index,result);b.onclick=()=>this.select(+b.dataset.index,result)});if(result.outputs.length)this.select(this.state.selected,result);else{$('#receptiveValues').innerHTML=$('#kernelValues').innerHTML=$('#productValues').innerHTML='';$('#runningSum').innerHTML='';$('#finalSum').textContent='—';this.clearHighlights()}const op=this.state.pooling==='none'?this.state.operation:`${this.state.pooling} pooling`;$('#matrixMeta').textContent=`${op}. Effective receptive field: ${result.effective} × ${result.effective}. Padding: ${this.state.padding}. Stride: ${this.state.stride}. Dilation: ${this.state.dilation}. Output: ${result.outW} × ${result.outH}.`},clearHighlights(){$$('#imageMatrix input').forEach(x=>x.classList.remove('receptive','padded-source'))},select(index,result=this.compute()){this.state.selected=index;$$('.output-cell').forEach((b,i)=>b.classList.toggle('selected',i===index));this.clearHighlights();const info=result.fields[index];if(!info)return;info.field.forEach(cell=>{if(!cell.padded&&cell.y>=0&&cell.x>=0){const input=$(`#imageMatrix input[data-y="${cell.y}"][data-x="${cell.x}"]`);input?.classList.add('receptive')}});$('#receptiveValues').innerHTML=info.field.map(c=>`<span class="${c.padded?'padded':''}">${formatNumber(c.value)}</span>`).join('');$('#kernelValues').innerHTML=info.kernel.flat().map(v=>`<span>${formatNumber(v)}</span>`).join('');$('#productValues').innerHTML=info.products.map(v=>`<span>${formatNumber(v)}</span>`).join('');let running=0;$('#runningSum').innerHTML=info.products.map((v,i)=>`<li>${formatNumber(running+=v)}${i===info.products.length-1?'':''}</li>`).join('');const final=this.state.pooling==='none'?running:result.outputs[index];$('#finalSum').textContent=`Output = ${formatNumber(final)}`;$('#kernelCalcLabel').textContent=this.state.operation==='convolution'?'Flipped kernel':'Kernel'}},
{group:'Color & intensity',id:'channels',icon:'◫',title:'Color channels (L1)',description:'Split the image into RGB, HSV, or grayscale components.',state:{space:'rgb'},mount(){root.innerHTML=`<div class="controls">${segment('space',[['rgb','RGB'],['hsv','HSV'],['gray','Grayscale']],this.state.space)}</div><div class="results four" id="channelResults"></div><div class="note" id="channelNote"></div>`;bindSegment('space',v=>{this.state.space=v;this.render()});this.render()},render(){const src=sourceData(),list=this.state.space==='rgb'?[['Original','o'],['Red','r'],['Green','g'],['Blue','b']]:this.state.space==='hsv'?[['Original','o'],['Hue','h'],['Saturation','s'],['Value','v']]:[['Original','o'],['Grayscale','y']];$('#channelResults').innerHTML=list.map((x,i)=>card('ch'+i,x[0])).join('');list.forEach(([_,key],n)=>{if(key==='o'){canvas('ch'+n);return}const out=new ImageData(new Uint8ClampedArray(src.data),src.width,src.height);for(let i=0;i<out.data.length;i+=4){const r=src.data[i],g=src.data[i+1],b=src.data[i+2];let q;if(key==='r')q=[r,0,0];else if(key==='g')q=[0,g,0];else if(key==='b')q=[0,0,b];else if(key==='y'){const y=.299*r+.587*g+.114*b;q=[y,y,y]}else{const[h,s,v]=rgbHsv(r,g,b);q=key==='h'?hsvRgb(h,1,1):[(key==='s'?s:v)*255,(key==='s'?s:v)*255,(key==='s'?s:v)*255]}out.data[i]=q[0];out.data[i+1]=q[1];out.data[i+2]=q[2]}put('ch'+n,out)});$('#channelNote').textContent=this.state.space==='rgb'?'RGB stores red, green, and blue intensity independently.':this.state.space==='hsv'?'HSV separates color (hue) from purity (saturation) and brightness (value).':'Luminance uses 0.299R + 0.587G + 0.114B.';state.output=$$('canvas',$('#channelResults')).at(-1)}},
{group:'Color & intensity',id:'adjustments',icon:'☼',title:'Image properties (L1-L2)',description:'Adjust brightness, contrast, and saturation.',state:{b:0,c:0,s:0},mount(){root.innerHTML=`<div class="controls">${controlRange('brightness','Brightness',-100,100,this.state.b)}${controlRange('contrast','Contrast',-100,100,this.state.c)}${controlRange('saturation','Saturation',-100,100,this.state.s)}<button class="button ghost" id="reset">Reset</button></div><div class="results">${card('adjOriginal','Original')}${card('adjOutput','Adjusted')}</div>`;['brightness','contrast','saturation'].forEach((id,i)=>bindRange(id,v=>{this.state[['b','c','s'][i]]=v;this.render()}));$('#reset').onclick=()=>{this.state={b:0,c:0,s:0};this.mount()};this.render()},render(){canvas('adjOriginal');const src=sourceData(),out=new ImageData(new Uint8ClampedArray(src.data),src.width,src.height),f=259*(this.state.c+255)/(255*(259-this.state.c));for(let i=0;i<out.data.length;i+=4){let r=clamp(f*(src.data[i]-128)+128+this.state.b*2.55),g=clamp(f*(src.data[i+1]-128)+128+this.state.b*2.55),b=clamp(f*(src.data[i+2]-128)+128+this.state.b*2.55),y=.299*r+.587*g+.114*b,k=1+this.state.s/100;out.data[i]=clamp(y+(r-y)*k);out.data[i+1]=clamp(y+(g-y)*k);out.data[i+2]=clamp(y+(b-y)*k)}put('adjOutput',out)}},
{group:'Color & intensity',id:'standardize',icon:'↕',title:'Image standardization (L2)',description:'Subtract the mean, divide by standard deviation, then scale the standardized values.',state:{scale:32},mount(){root.innerHTML=`<div class="controls">${controlRange('stdScale','Scaling coefficient',1,100,this.state.scale)}</div><div class="results">${card('stdOriginal','Original')}${card('stdOutput','Standardized')}</div><div class="stats"><div class="stat"><small>Input mean</small><b id="inMean">—</b></div><div class="stat"><small>Input σ</small><b id="inStd">—</b></div><div class="stat"><small>Mapping</small><b id="mapping">128 + αz</b></div></div>`;bindRange('stdScale',v=>{this.state.scale=v;this.render()});this.render()},render(){canvas('stdOriginal');const src=grayData(),n=src.width*src.height;let sum=0;for(let i=0;i<src.data.length;i+=4)sum+=src.data[i];const mean=sum/n;let variance=0;for(let i=0;i<src.data.length;i+=4)variance+=(src.data[i]-mean)**2;const sd=Math.sqrt(variance/n)||1,out=new ImageData(new Uint8ClampedArray(src.data),src.width,src.height);for(let i=0;i<out.data.length;i+=4){const v=clamp(128+this.state.scale*(src.data[i]-mean)/sd);out.data[i]=out.data[i+1]=out.data[i+2]=v}put('stdOutput',out);$('#inMean').textContent=mean.toFixed(2);$('#inStd').textContent=sd.toFixed(2);$('#mapping').textContent=`128 + ${this.state.scale}z`}},
{group:'Color & intensity',id:'gamma',icon:'γ',title:'Gamma mapping (L2)',description:'Apply the power-law mapping output = 255 × (input / 255)ᵞ.',state:{gamma:1},mount(){root.innerHTML=`<div class="controls">${controlRange('gamma','Gamma',.1,4,this.state.gamma,.05)}</div><div class="results">${card('gammaOriginal','Original')}${card('gammaOutput','Gamma mapped')}</div>`;bindRange('gamma',v=>{this.state.gamma=v;this.render()},v=>(+v).toFixed(2));this.render()},render(){canvas('gammaOriginal');const src=sourceData(),out=new ImageData(new Uint8ClampedArray(src.data),src.width,src.height);for(let i=0;i<out.data.length;i+=4){out.data[i]=255*(src.data[i]/255)**this.state.gamma;out.data[i+1]=255*(src.data[i+1]/255)**this.state.gamma;out.data[i+2]=255*(src.data[i+2]/255)**this.state.gamma}put('gammaOutput',out)}},
{group:'Histograms',id:'histogram',icon:'▥',title:'B/W and histogram (L2)',description:'Convert to grayscale and compare stretching or histogram equalization.',state:{mode:'plain'},mount(){root.innerHTML=`<div class="controls">${segment('histMode',[['plain','Grayscale'],['stretch','Histogram stretching'],['equalize','Histogram equalization']],this.state.mode)}</div><div class="hist-layout"><div class="results">${card('histOriginal','Original')}${card('histOutput','Output')}</div><div class="hist-panel"><h3>Output intensity distribution</h3><canvas class="histogram" id="histChart"></canvas><div class="hist-labels"><span>0 · black</span><span>255 · white</span></div><div class="stats"><div class="stat"><small>Minimum</small><b id="histMin">—</b></div><div class="stat"><small>Maximum</small><b id="histMax">—</b></div></div></div></div>`;bindSegment('histMode',v=>{this.state.mode=v;this.render()});this.render()},render(){canvas('histOriginal');const gray=grayData(),h=histogram(gray),out=new ImageData(new Uint8ClampedArray(gray.data),gray.width,gray.height);let min=h.findIndex(v=>v),max=255-[...h].reverse().findIndex(v=>v);if(this.state.mode==='stretch'){for(let i=0;i<out.data.length;i+=4){const v=(gray.data[i]-min)*255/Math.max(1,max-min);out.data[i]=out.data[i+1]=out.data[i+2]=v}}else if(this.state.mode==='equalize'){let acc=0;const n=gray.width*gray.height,cdf=h.map(v=>(acc+=v)/n*255);for(let i=0;i<out.data.length;i+=4)out.data[i]=out.data[i+1]=out.data[i+2]=cdf[gray.data[i]]}put('histOutput',out);const oh=histogram(out);drawHistogram('histChart',oh);$('#histMin').textContent=oh.findIndex(v=>v);$('#histMax').textContent=255-[...oh].reverse().findIndex(v=>v)}},
{group:'Compression & selection',id:'jpeg',icon:'≋',title:'JPEG compression (L1)',description:'Change JPEG quality and inspect file size and compression artifacts.',state:{quality:72},mount(){root.innerHTML=`<div class="controls">${controlRange('jpegQuality','Quality',1,100,this.state.quality)}</div><div class="results">${card('jpegOriginal','Original')}${card('jpegOutput','Compressed','Encoding…')}</div><div class="stats"><div class="stat"><small>JPEG size</small><b id="jpegSize">—</b></div><div class="stat"><small>Bytes per pixel</small><b id="jpegBpp">—</b></div><div class="stat"><small>Raw size reduction</small><b id="jpegSave">—</b></div></div>`;bindRange('jpegQuality',v=>{this.state.quality=v;this.render()},v=>v+'%');this.render()},render(){canvas('jpegOriginal');clearTimeout(this.timer);this.timer=setTimeout(()=>state.source.toBlob(async blob=>{if(!blob||state.active!=='jpeg')return;const b=await createImageBitmap(blob),c=$('#jpegOutput');if(!c||state.active!=='jpeg'){b.close();return}c.width=b.width;c.height=b.height;c.getContext('2d').drawImage(b,0,0);b.close();const raw=state.source.width*state.source.height*3;$('#jpegSize').textContent=formatBytes(blob.size);$('#jpegBpp').textContent=(blob.size/(state.source.width*state.source.height)).toFixed(2);$('#jpegSave').textContent=(100-blob.size/raw*100).toFixed(1)+'%';$('.card:nth-child(2) figcaption small').textContent=formatBytes(blob.size);state.output=c},'image/jpeg',this.state.quality/100),80)}},
{group:'Compression & selection',id:'selection',icon:'⌖',title:'Color selection (L1)',description:'Pick a pixel and highlight nearby colors using RGB distance.',state:{color:[239,92,73],tol:40,mode:'isolate',point:null},mount(){root.innerHTML=`<div class="controls">${controlRange('colorTol','Tolerance',1,180,this.state.tol)}<div class="control narrow"><span class="control-label">Mode</span>${segment('selectMode',[['isolate','Isolate'],['overlay','Overlay'],['mask','Mask']],this.state.mode)}</div><div class="control narrow"><span class="control-label">Selected color</span><div class="color-chip" id="colorChip"></div></div></div><div class="results"><div class="picker">${card('selectInput','Click to select a color')}</div>${card('selectOutput','Selection')}</div><div class="stats"><div class="stat"><small>Selected RGB</small><b id="selectedRgb">—</b></div><div class="stat"><small>Pixels matched</small><b id="matchRate">—</b></div></div>`;bindRange('colorTol',v=>{this.state.tol=v;this.render()});bindSegment('selectMode',v=>{this.state.mode=v;this.render()});$('#selectInput').addEventListener('click',e=>this.pick(e));this.render()},pick(e){const c=$('#selectInput'),r=c.getBoundingClientRect(),x=clamp(Math.floor((e.clientX-r.left)/r.width*c.width),0,c.width-1),y=clamp(Math.floor((e.clientY-r.top)/r.height*c.height),0,c.height-1),d=state.source.getContext('2d').getImageData(x,y,1,1).data;this.state.color=[d[0],d[1],d[2]];this.render()},render(){canvas('selectInput');const src=sourceData(),out=new ImageData(new Uint8ClampedArray(src.data),src.width,src.height),[tr,tg,tb]=this.state.color;let n=0;for(let i=0;i<out.data.length;i+=4){const hit=Math.hypot(src.data[i]-tr,src.data[i+1]-tg,src.data[i+2]-tb)<=this.state.tol;if(hit)n++;if(this.state.mode==='isolate'&&!hit){const y=(src.data[i]+src.data[i+1]+src.data[i+2])/3*.22;out.data[i]=out.data[i+1]=out.data[i+2]=y}else if(this.state.mode==='overlay'&&hit){out.data[i]=255;out.data[i+1]=210;out.data[i+2]=20}else if(this.state.mode==='mask'){const v=hit?255:0;out.data[i]=out.data[i+1]=out.data[i+2]=v}}put('selectOutput',out);$('#colorChip').style.background=`rgb(${tr},${tg},${tb})`;$('#selectedRgb').textContent=`${tr}, ${tg}, ${tb}`;$('#matchRate').textContent=(n/(src.width*src.height)*100).toFixed(1)+'%'}},
{group:'Spatial operations',id:'filters',icon:'⊞',title:'Spatial filters (L2)',description:'Apply neighborhood filters with configurable kernel, stride, and border padding.',state:{type:'median',kernel:3,stride:1,padding:'copy',sigma:1},mount(){root.innerHTML=`<div class="controls"><div class="control"><label>Filter</label><select id="filterType"><option value="median">Median</option><option value="max">Maximum</option><option value="gaussian">Gaussian</option><option value="box">Average / box</option></select></div><div class="control"><label>Kernel size</label><select id="kernel"><option>3</option><option>5</option><option>7</option><option>9</option></select></div><div class="control"><label>Stride</label><select id="stride"><option>1</option><option>2</option><option>3</option><option>4</option></select></div><div class="control"><label>Padding</label><select id="padding"><option value="zero">Zero padding</option><option value="copy">Copy padding</option></select></div><div class="control" id="sigmaControl">${controlRange('sigma','Gaussian σ',.2,5,this.state.sigma,.1)}</div></div><div class="results">${card('filterOriginal','Original')}${card('filterOutput','Filtered')}</div><div class="note" id="filterMeta"></div>`;['filterType','kernel','stride','padding'].forEach(id=>{$('#'+id).value=this.state[id==='filterType'?'type':id];$('#'+id).onchange=e=>{this.state[id==='filterType'?'type':id]=id==='filterType'||id==='padding'?e.target.value:+e.target.value;this.render()}});bindRange('sigma',v=>{this.state.sigma=v;this.render()},v=>(+v).toFixed(1));this.render()},render(){canvas('filterOriginal');$('#sigmaControl').style.display=this.state.type==='gaussian'?'block':'none';const work=document.createElement('canvas'),scale=Math.min(1,420/Math.max(state.source.width,state.source.height));work.width=Math.round(state.source.width*scale);work.height=Math.round(state.source.height*scale);work.getContext('2d').drawImage(state.source,0,0,work.width,work.height);const src=work.getContext('2d',{willReadFrequently:true}).getImageData(0,0,work.width,work.height),k=this.state.kernel,s=this.state.stride,p=Math.floor(k/2),ow=Math.ceil(src.width/s),oh=Math.ceil(src.height/s),out=new ImageData(ow,oh),idx=(x,y,c)=>((y*src.width+x)*4+c),sample=(x,y,c)=>{if(this.state.padding==='zero'&&(x<0||y<0||x>=src.width||y>=src.height))return 0;x=clamp(x,0,src.width-1);y=clamp(y,0,src.height-1);return src.data[idx(x,y,c)]};let weights=null;if(this.state.type==='gaussian'){weights=[];let total=0;for(let dy=-p;dy<=p;dy++)for(let dx=-p;dx<=p;dx++){const w=Math.exp(-(dx*dx+dy*dy)/(2*this.state.sigma**2));weights.push(w);total+=w}weights=weights.map(w=>w/total)}for(let oy=0;oy<oh;oy++)for(let ox=0;ox<ow;ox++){for(let c=0;c<3;c++){const vals=[];let weighted=0,wi=0;for(let dy=-p;dy<=p;dy++)for(let dx=-p;dx<=p;dx++){const v=sample(ox*s+dx,oy*s+dy,c);vals.push(v);if(weights)weighted+=v*weights[wi++]};let v;if(this.state.type==='median'){vals.sort((a,b)=>a-b);v=vals[Math.floor(vals.length/2)]}else if(this.state.type==='max')v=Math.max(...vals);else if(this.state.type==='gaussian')v=weighted;else v=vals.reduce((a,b)=>a+b,0)/vals.length;out.data[(oy*ow+ox)*4+c]=v}out.data[(oy*ow+ox)*4+3]=255}put('filterOutput',out);$('#filterMeta').textContent=`Processing resolution: ${src.width} × ${src.height}. Output: ${ow} × ${oh}. Kernel: ${k} × ${k}. Stride: ${s}. ${this.state.padding==='zero'?'Out-of-image samples are zero.':'Border samples copy the nearest pixel.'}`}},
{group:'Lines & edges',id:'doglap',icon:'∇²',title:'DoG and Laplacian (L3)',description:'Compare Difference of Gaussians with the second-derivative Laplacian operator.',state:{mode:'dog',sigma:1,sigma2:2},mount(){root.innerHTML=`<div class="controls"><div class="control narrow"><span class="control-label">Operator</span>${segment('edgeOperator',[['dog','Difference of Gaussians'],['laplace','Laplacian']],this.state.mode)}</div>${controlRange('dogSigma','σ₁',.4,4,this.state.sigma,.1)}<div id="sigmaTwo" class="control">${controlRange('dogSigma2','σ₂',.5,7,this.state.sigma2,.1)}</div></div><div class="results">${card('dogOriginal','Original')}${card('dogOutput','Edge response')}</div><div class="note" id="dogNote"></div>`;bindSegment('edgeOperator',v=>{this.state.mode=v;this.render();renderParameterGuide('doglap')});bindRange('dogSigma',v=>{this.state.sigma=v;this.render()},v=>(+v).toFixed(1));bindRange('dogSigma2',v=>{this.state.sigma2=v;this.render()},v=>(+v).toFixed(1));this.render()},render(){canvas('dogOriginal');const dog=this.state.mode==='dog',sigmaOne=$('#dogSigma').closest('.control'),sigmaTwo=$('#sigmaTwo');sigmaOne.hidden=!dog;sigmaTwo.hidden=!dog;const g=workingGray(520);let values;if(dog){const a=gaussian(g.data,g.w,g.h,this.state.sigma),b=gaussian(g.data,g.w,g.h,Math.max(this.state.sigma+.1,this.state.sigma2));values=new Float32Array(a.length);for(let i=0;i<a.length;i++)values[i]=a[i]-b[i];$('#dogNote').textContent='DoG uses σ₁ and σ₂ to create two Gaussian blurs, then subtracts the wider blur from the narrower blur.'}else{values=convolveGray(g.data,g.w,g.h,[0,1,0,1,-4,1,0,1,0],3);$('#dogNote').textContent='Plain Laplacian uses the fixed 3 × 3 kernel [[0, 1, 0], [1, −4, 1], [0, 1, 0]]. It does not use σ₁ or σ₂.'}scalarImage('dogOutput',values,g.w,g.h,true)}},
{group:'Lines & edges',id:'sobel',icon:'∠',title:'Sobel filters (L3)',description:'Estimate horizontal and vertical image derivatives and combine them into gradient magnitude.',state:{scale:1},mount(){root.innerHTML=`<div class="controls">${controlRange('sobelScale','Display gain',.25,4,this.state.scale,.05)}</div><div class="results three">${card('sobelX','Gx · vertical edges')}${card('sobelY','Gy · horizontal edges')}${card('sobelMagnitude','Gradient magnitude')}</div><div class="note">Sobel combines smoothing and differentiation. The direction is atan2(Gy, Gx); magnitude is √(Gx² + Gy²).</div>`;bindRange('sobelScale',v=>{this.state.scale=v;this.render()},v=>(+v).toFixed(2));this.render()},render(){const g=workingGray(520),s=sobelField(g.data,g.w,g.h);responseImage('sobelX',s.gx,g.w,g.h,this.state.scale,true);responseImage('sobelY',s.gy,g.w,g.h,this.state.scale,true);responseImage('sobelMagnitude',s.mag,g.w,g.h,this.state.scale,false)}},
{group:'Lines & edges',id:'canny',icon:'⌁',title:'Canny edge detection (L3)',description:'Smooth, differentiate, suppress non-maxima, then link edges using two thresholds.',state:{nms:1,low:35,high:85,sigma:1.2},mount(){root.innerHTML=`<div class="controls">${controlRange('cannyNms','NMS radius',1,4,this.state.nms)}${controlRange('cannyLow','Low threshold',1,180,this.state.low)}${controlRange('cannyHigh','High threshold',10,255,this.state.high)}${controlRange('cannySigma','Blur σ',.4,3,this.state.sigma,.1)}</div><div class="results three">${card('cannyGradient','Gradient magnitude')}${card('cannyNmsOut','After NMS')}${card('cannyEdges','Linked edges')}</div><div class="note">NMS radius controls how far Canny looks along the gradient direction when retaining only local peaks.</div>`;[['cannyNms','nms'],['cannyLow','low'],['cannyHigh','high'],['cannySigma','sigma']].forEach(([id,key])=>bindRange(id,v=>{this.state[key]=v;if(this.state.low>this.state.high)this.state.low=this.state.high;this.render()},key==='sigma'?v=>(+v).toFixed(1):v=>v));this.render()},render(){const g=workingGray(500),result=cannyCompute(g,this.state);scalarImage('cannyGradient',result.mag,g.w,g.h,false);scalarImage('cannyNmsOut',result.nms,g.w,g.h,false);binaryImage('cannyEdges',result.edges,g.w,g.h)}},
{group:'Lines & edges',id:'hough',icon:'╱',title:'Hough line detection (L3)',description:'Vote for candidate lines in (ρ, θ) space and draw the strongest accumulator peaks.',state:{edgeThreshold:95,voteThreshold:48,lines:12},mount(){root.innerHTML=`<div class="controls">${controlRange('houghEdge','Edge threshold',20,220,this.state.edgeThreshold)}${controlRange('houghVote','Peak threshold',10,90,this.state.voteThreshold,1)}${controlRange('houghLines','Maximum lines',1,30,this.state.lines)}</div><div class="results">${card('houghOverlay','Detected lines')}${card('houghSpace','Hough accumulator','horizontal: θ · vertical: ρ')}</div><div class="stats"><div class="stat"><small>Edge points</small><b id="houghPoints">—</b></div><div class="stat"><small>Accumulator peak</small><b id="houghPeak">—</b></div><div class="stat"><small>Lines retained</small><b id="houghCount">—</b></div></div>`;[['houghEdge','edgeThreshold'],['houghVote','voteThreshold'],['houghLines','lines']].forEach(([id,key])=>bindRange(id,v=>{this.state[key]=v;this.render()}));this.render()},render(){const g=workingGray(360),s=sobelField(gaussian(g.data,g.w,g.h,1),g.w,g.h),thetaBins=120,diag=Math.ceil(Math.hypot(g.w,g.h)),rhoBins=diag*2+1,acc=new Uint32Array(thetaBins*rhoBins),cos=new Float32Array(thetaBins),sin=new Float32Array(thetaBins),points=[];for(let t=0;t<thetaBins;t++){const angle=t*Math.PI/thetaBins;cos[t]=Math.cos(angle);sin[t]=Math.sin(angle)}for(let y=1;y<g.h-1;y++)for(let x=1;x<g.w-1;x++)if(s.mag[y*g.w+x]>=this.state.edgeThreshold)points.push([x,y]);const step=Math.max(1,Math.ceil(points.length/12000));for(let p=0;p<points.length;p+=step){const[x,y]=points[p];for(let t=0;t<thetaBins;t++){const r=Math.round(x*cos[t]+y*sin[t])+diag;acc[r*thetaBins+t]++}}let peak=0;for(const v of acc)peak=Math.max(peak,v);const cutoff=peak*this.state.voteThreshold/100,candidates=[];for(let r=2;r<rhoBins-2;r++)for(let t=0;t<thetaBins;t++){const v=acc[r*thetaBins+t];if(v<cutoff)continue;let local=true;for(let dr=-2;dr<=2&&local;dr++)for(let dt=-2;dt<=2;dt++){const tt=(t+dt+thetaBins)%thetaBins;if(acc[(r+dr)*thetaBins+tt]>v){local=false;break}}if(local)candidates.push({r:r-diag,t,v})}candidates.sort((a,b)=>b.v-a.v);const lines=[];for(const q of candidates){if(lines.some(l=>Math.abs(l.r-q.r)<9&&Math.min(Math.abs(l.t-q.t),thetaBins-Math.abs(l.t-q.t))<5))continue;lines.push(q);if(lines.length>=this.state.lines)break}const out=$('#houghOverlay');out.width=g.w;out.height=g.h;const ctx=out.getContext('2d');ctx.drawImage(g.canvas,0,0);ctx.lineWidth=Math.max(1,g.w/300);ctx.strokeStyle='#ff3b30';for(const l of lines){const c=cos[l.t],sn=sin[l.t],x0=c*l.r,y0=sn*l.r;ctx.beginPath();ctx.moveTo(x0+1000*(-sn),y0+1000*c);ctx.lineTo(x0-1000*(-sn),y0-1000*c);ctx.stroke()}const heat=new ImageData(thetaBins,rhoBins);for(let i=0;i<acc.length;i++){const t=Math.sqrt(acc[i]/(peak||1)),[r,gg,b]=heatColor(t);heat.data[i*4]=r;heat.data[i*4+1]=gg;heat.data[i*4+2]=b;heat.data[i*4+3]=255}put('houghSpace',heat);state.output=out;$('#houghPoints').textContent=points.length.toLocaleString();$('#houghPeak').textContent=peak;$('#houghCount').textContent=lines.length}},
{group:'Matching',id:'template',icon:'▣',title:'Template matching (L2)',description:'Drag a patch, then compare regular cross-correlation with normalized zero-mean correlation.',state:{rect:null,drag:null},mount(){root.innerHTML=`<div class="instruction">Drag over the source image to select a template patch. For responsiveness, matching is computed on a reduced grayscale image.</div><div class="template-layout"><div class="picker">${card('templateSource','Drag to select template')}<div class="stats"><div class="stat"><small>Patch</small><b id="patchSize">Not selected</b></div></div></div><div class="template-results">${card('ccHeat','Cross-correlation heatmap')}${card('znccHeat','Zero-mean normalized CC heatmap')}</div></div>`;const c=$('#templateSource');c.addEventListener('pointerdown',e=>this.down(e));c.addEventListener('pointermove',e=>this.move(e));c.addEventListener('pointerup',e=>this.up(e));this.renderSource()},renderSource(){canvas('templateSource');const box=$('#templateSource').parentElement,rect=document.createElement('span');rect.className='patch-rect';rect.id='patchRect';box.append(rect);if(this.state.rect)this.showRect()},point(e){const c=$('#templateSource'),r=c.getBoundingClientRect();return{x:clamp((e.clientX-r.left)/r.width*c.width,0,c.width),y:clamp((e.clientY-r.top)/r.height*c.height,0,c.height)}},down(e){e.currentTarget.setPointerCapture(e.pointerId);this.state.drag=this.point(e)},move(e){if(!this.state.drag)return;const p=this.point(e),a=this.state.drag;this.state.rect={x:Math.min(a.x,p.x),y:Math.min(a.y,p.y),w:Math.abs(a.x-p.x),h:Math.abs(a.y-p.y)};this.showRect()},up(e){if(!this.state.drag)return;this.move(e);this.state.drag=null;if(this.state.rect.w<8||this.state.rect.h<8){this.state.rect=null;$('#patchRect').style.display='none';return}this.match()},showRect(){const c=$('#templateSource'),r=c.getBoundingClientRect(),b=c.parentElement.getBoundingClientRect(),q=this.state.rect,m=$('#patchRect');m.style.display='block';m.style.left=(r.left-b.left+q.x/c.width*r.width)+'px';m.style.top=(r.top-b.top+q.y/c.height*r.height)+'px';m.style.width=(q.w/c.width*r.width)+'px';m.style.height=(q.h/c.height*r.height)+'px';$('#patchSize').textContent=`${Math.round(q.w)} × ${Math.round(q.h)}`},match(){const sourceGray=grayData(),scale=Math.min(1,320/sourceGray.width),w=Math.max(1,Math.round(sourceGray.width*scale)),h=Math.max(1,Math.round(sourceGray.height*scale)),tmp=document.createElement('canvas');tmp.width=w;tmp.height=h;const orig=document.createElement('canvas');orig.width=sourceGray.width;orig.height=sourceGray.height;orig.getContext('2d').putImageData(sourceGray,0,0);tmp.getContext('2d').drawImage(orig,0,0,w,h);const data=tmp.getContext('2d').getImageData(0,0,w,h).data,q=this.state.rect,rx=Math.round(q.x*scale),ry=Math.round(q.y*scale),rw=clamp(Math.round(q.w*scale),3,Math.min(55,w-rx)),rh=clamp(Math.round(q.h*scale),3,Math.min(55,h-ry));if(rw<3||rh<3)return;const patch=[],step=Math.max(1,Math.ceil(Math.max(rw,rh)/35));for(let y=0;y<rh;y+=step)for(let x=0;x<rw;x+=step)patch.push(data[((ry+y)*w+rx+x)*4]);const meanT=patch.reduce((a,b)=>a+b,0)/patch.length,devT=patch.map(v=>v-meanT),normT=Math.sqrt(devT.reduce((a,b)=>a+b*b,0))||1,cc=new Float32Array(w*h),zn=new Float32Array(w*h);let minCC=Infinity,maxCC=-Infinity,minZN=Infinity,maxZN=-Infinity;for(let y=0;y<=h-rh;y++)for(let x=0;x<=w-rw;x++){let sum=0,mean=0,n=0;for(let j=0;j<rh;j+=step)for(let i=0;i<rw;i+=step){mean+=data[((y+j)*w+x+i)*4];n++}mean/=n;let numerator=0,norm=0,k=0;for(let j=0;j<rh;j+=step)for(let i=0;i<rw;i+=step){const v=data[((y+j)*w+x+i)*4],d=v-mean;sum+=v*patch[k];numerator+=d*devT[k];norm+=d*d;k++}const pos=y*w+x,z=numerator/(Math.sqrt(norm)*normT||1);cc[pos]=sum;zn[pos]=z;minCC=Math.min(minCC,sum);maxCC=Math.max(maxCC,sum);minZN=Math.min(minZN,z);maxZN=Math.max(maxZN,z)}this.heat('ccHeat',cc,w,h,minCC,maxCC);this.heat('znccHeat',zn,w,h,minZN,maxZN);state.output=$('#znccHeat')},heat(id,values,w,h,min,max){const out=new ImageData(w,h);for(let i=0;i<values.length;i++){const t=clamp((values[i]-min)/(max-min||1),0,1),[r,g,b]=heatColor(t);out.data[i*4]=r;out.data[i*4+1]=g;out.data[i*4+2]=b;out.data[i*4+3]=255}put(id,out)}},
{
  group:'Filter banks & texture',
  id:'gabor',
  icon:'≈',
  title:'Gabor filter bank (L4)',
  description:'Tune one complex Gabor kernel and compare its phase-invariant power response across five contrasting textures.',
  state:{gamma:1,sigma:4,omega:0,lambda:10},
  mount(){mountGabor(this)},
  destroy(){destroyGabor()}
},
...createLecture4Experiments(root),
{
  group:'Local features',
  id:'harris',
  icon:'┌',
  title:'Harris corner detector (L7)',
  description:'Compute gradients, build the second-moment matrix M in every window, threshold the cornerness R, then keep local maxima.',
  state:{sigma:1.5,k:.05,threshold:1,nms:4,rotation:30,scale:100,contrast:100,probe:null},
  mount(){mountHarris(this)},
  destroy(){destroyHarris()}
},
createNmsExperiment(root),
{
  group:'Local features',
  id:'anms',
  icon:'◌',
  title:'Adaptive non-maximum suppression (L7)',
  description:'Keep the corners with the largest suppression radii instead of the strongest responses, so the same keypoint budget covers the whole image.',
  state:{budget:250,robustness:1.1,selected:null},
  mount(){mountAnms(this)},
  destroy(){destroyAnms()}
},
...createLecture8Experiments(root,{getSource:()=>state.source,getSourceVersion:()=>state.version}),
{
  group:'Motion',
  id:'opticalFlow',
  icon:'↝',
  title:'Optical flow: single vs multi-scale',
  description:'Track the same Sintel motion with single-scale and pyramidal Lucas–Kanade.',
  state:{extraMotion:24,pyramidLevels:4,trackedPoints:220,arrowScale:1,viewFrame:null,selectedFlowPoint:null},
  mount(){mountOpticalFlow(this)},
  destroy(){destroyOpticalFlow(this)}
}
];

const GABOR_TEXTURE_SIZE=144;
const GABOR_KERNEL_VIEW_RADIUS=40;
const GABOR_TEXTURES=[
  {name:'Brick',detail:'regular horizontal and vertical structure',url:'images/gabor/brick.png',source:'scikit-image · CC0'},
  {name:'Grass',detail:'fine, fibrous and weakly oriented',url:'images/gabor/grass.png',source:'scikit-image · CC0'},
  {name:'Knit',detail:'interlocking blue yarn loops',url:'images/lecture4/knit.png',source:'course attachment'},
  {name:'Zebra',detail:'strong curved stripe pattern',url:'images/Plains_Zebra_Equus_quagga_cropped.jpg',source:'course image'},
  {name:'Corridor',detail:'repeated lines and perspective',url:'images/Corridor_crop.png',source:'course image'}
];
const gaborRuntime={token:0,raf:0,textures:null,loading:null,displayMax:null};

function gaborTextureCard(texture,index){
  return `<figure class="card gabor-texture-card">
    <figcaption><span>${texture.name}</span><small>${texture.detail}</small></figcaption>
    <div class="gabor-pair">
      <div><span class="gabor-image-label">Texture</span><canvas id="gaborTexture${index}" aria-label="${texture.name} texture"></canvas></div>
      <div><span class="gabor-image-label">Gabor power</span><canvas id="gaborResponse${index}" aria-label="${texture.name} Gabor power response"></canvas></div>
    </div>
    <div class="gabor-strength"><span>Mean power</span><b id="gaborStrength${index}">—</b></div>
  </figure>`;
}

function mountGabor(experiment){
  destroyGabor();
  const token=gaborRuntime.token,s=experiment.state;
  root.innerHTML=`<div class="controls gabor-controls">
    ${controlRange('gaborGamma','γ · envelope aspect ratio',.5,1.5,s.gamma,.05)}
    ${controlRange('gaborSigma','σ · envelope scale',1,8,s.sigma,.25)}
    ${controlRange('gaborOmega','ω · orientation',0,175,s.omega,5)}
    ${controlRange('gaborLambda','λ · wavelength',3,30,s.lambda,.5)}
    <button class="button ghost" id="gaborReset" type="button">Reset</button>
  </div>
  <div class="l4-presets gabor-presets" aria-label="Prepared Gabor settings">
    <span>Prepared settings</span>
    <button data-gabor-preset="orientation" type="button">Rotate to 90°</button>
    <button data-gabor-preset="wavelength" type="button">Coarser wavelength</button>
    <button data-gabor-preset="envelope" type="button">Taller envelope</button>
  </div>
  <div class="gabor-intro">
    <figure class="card gabor-kernel-card">
      <figcaption><span>Selected real kernel component</span><small id="gaborKernelMeta">—</small></figcaption>
      <div class="canvas-box gabor-kernel-box"><canvas id="gaborKernel" aria-label="Selected Gabor kernel"></canvas><span class="gabor-axis" id="gaborAxis" aria-hidden="true"></span></div>
    </figure>
    <section class="gabor-formula" aria-label="Gabor filter definition">
      <span class="gabor-kicker">One member of the filter bank</span>
      <div class="gabor-equation"><i>g</i><sub>mn</sub> = <span class="fraction"><span>γ</span><span>2πσ²</span></span> exp[−<span class="fraction"><span>m² + γ²n²</span><span>2σ²</span></span>] exp[<i>i</i> <span class="fraction"><span>2π(cos(ω)m + sin(ω)n)</span><span>λ</span></span>]</div>
      <p>At <b>γ = 1</b> this is the supplied Python reference with σ<sub>x</sub> = σ<sub>y</sub>. Other γ values extend it by stretching or compressing the envelope along the image’s vertical axis. Images are standardized, convolution wraps at the boundary, and the displayed power is <b>√(real² + imaginary²)</b>.</p>
      <div class="gabor-legend"><span><i class="gabor-swatch dark"></i>negative</span><span><i class="gabor-swatch mid"></i>zero</span><span><i class="gabor-swatch light"></i>positive</span></div>
    </section>
  </div>
  <div class="gabor-section-title"><div><b>Texture responses</b><small>All five power images use one fixed display scale, so contrast remains comparable as parameters change.</small></div><span id="gaborStatus" role="status">Loading texture bank…</span></div>
  <div class="gabor-texture-grid">${GABOR_TEXTURES.map(gaborTextureCard).join('')}</div>
  <div class="gabor-section-title gabor-prepared-title"><div><b>Prepared parameter comparisons</b><small>The brick texture stays fixed; only the named parameter changes within each pair.</small></div></div>
  <div class="l4-comparison gabor-prepared" id="gaborPrepared"></div>
  <div class="gabor-source-note">Brick and grass are CC0 samples distributed by <a href="https://scikit-image.org/docs/stable/auto_examples/features_detection/plot_gabor.html" target="_blank" rel="noopener noreferrer">scikit-image’s Gabor filter-bank example</a>. Knit uses the supplied course attachment; zebra and corridor are existing course images in this project.</div>`;

  const clearPreset=()=>$$('.gabor-presets button').forEach(item=>item.classList.remove('active'));
  bindRange('gaborGamma',value=>{s.gamma=value;clearPreset();scheduleGaborRender(experiment,token)},value=>(+value).toFixed(2));
  bindRange('gaborSigma',value=>{s.sigma=value;clearPreset();scheduleGaborRender(experiment,token)},value=>(+value).toFixed(2));
  bindRange('gaborOmega',value=>{s.omega=value;clearPreset();scheduleGaborRender(experiment,token)},value=>`${value}°`);
  bindRange('gaborLambda',value=>{s.lambda=value;clearPreset();scheduleGaborRender(experiment,token)},value=>(+value).toFixed(1)+' px');
  $('#gaborOmegaOut').textContent=`${s.omega}°`;
  $('#gaborLambdaOut').textContent=`${s.lambda.toFixed(1)} px`;
  $('#gaborGammaOut').textContent=s.gamma.toFixed(2);
  $('#gaborSigmaOut').textContent=s.sigma.toFixed(2);
  $('.gabor-presets').onclick=event=>{
    const button=event.target.closest('button');if(!button)return;
    const presets={orientation:{gamma:1,sigma:4,omega:90,lambda:10},wavelength:{gamma:1,sigma:4,omega:0,lambda:18},envelope:{gamma:.55,sigma:4,omega:0,lambda:10}};
    Object.assign(s,presets[button.dataset.gaborPreset]);
    [['gaborGamma','gamma',value=>(+value).toFixed(2)],['gaborSigma','sigma',value=>(+value).toFixed(2)],['gaborOmega','omega',value=>`${value}°`],['gaborLambda','lambda',value=>`${(+value).toFixed(1)} px`]].forEach(([id,key,format])=>{const input=$('#'+id);input.value=s[key];$('#'+id+'Out').textContent=format(s[key])});
    $$('.gabor-presets button').forEach(item=>item.classList.toggle('active',item===button));
    renderGabor(experiment);
  };
  $('#gaborReset').onclick=()=>{experiment.state={gamma:1,sigma:4,omega:0,lambda:10};experiment.mount();renderParameterGuide('gabor');renderPseudocode('gabor')};

  loadGaborTextures().then(()=>{
    if(token!==gaborRuntime.token||state.active!=='gabor')return;
    renderGabor(experiment);
    renderPreparedGaborComparisons(gaborRuntime.textures[0]);
  }).catch(error=>{
    if(token!==gaborRuntime.token||state.active!=='gabor')return;
    $('#gaborStatus').textContent='Texture images could not be loaded.';
    console.warn(error);
  });
}

function destroyGabor(){
  gaborRuntime.token++;
  if(gaborRuntime.raf)cancelAnimationFrame(gaborRuntime.raf);
  gaborRuntime.raf=0;
}

function loadGaborTexture(definition){
  return new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>{
      const size=GABOR_TEXTURE_SIZE,source=Math.min(image.naturalWidth,image.naturalHeight),sx=(image.naturalWidth-source)/2,sy=(image.naturalHeight-source)/2;
      const surface=document.createElement('canvas');surface.width=size;surface.height=size;
      const context=surface.getContext('2d',{willReadFrequently:true});
      context.drawImage(image,sx,sy,source,source,0,0,size,size);
      const pixels=context.getImageData(0,0,size,size).data,data=new Float32Array(size*size);let sum=0,sumSquares=0;
      for(let i=0,p=0;i<pixels.length;i+=4,p++){const value=.299*pixels[i]+.587*pixels[i+1]+.114*pixels[i+2];data[p]=value;sum+=value;sumSquares+=value*value}
      const mean=sum/data.length,standardDeviation=Math.sqrt(Math.max(0,sumSquares/data.length-mean*mean))||1;
      for(let i=0;i<data.length;i++)data[i]=(data[i]-mean)/standardDeviation;
      resolve({...definition,canvas:surface,data,w:size,h:size});
    };
    image.onerror=()=>reject(new Error(`Could not load ${definition.url}`));
    image.src=definition.url;
  });
}

function loadGaborTextures(){
  if(gaborRuntime.textures)return Promise.resolve(gaborRuntime.textures);
  if(!gaborRuntime.loading)gaborRuntime.loading=Promise.all(GABOR_TEXTURES.map(loadGaborTexture)).then(textures=>{
    gaborRuntime.textures=textures;
    gaborRuntime.displayMax=calibrateGaborPowerScale(textures);
    return textures;
  });
  return gaborRuntime.loading;
}

function makeGaborKernel({gamma=1,sigma,omega,lambda}){
  const theta=omega*Math.PI/180,kx=2*Math.PI*Math.cos(theta)/lambda,ky=2*Math.PI*Math.sin(theta)/lambda;
  const circular=Math.abs(gamma-1)<1e-8,radius=circular?Math.ceil(Math.max(Math.abs(3*sigma*Math.cos(theta)),Math.abs(3*sigma*Math.sin(theta)),1)):Math.ceil(3*sigma/Math.min(1,gamma)),size=radius*2+1,norm=gamma/(2*Math.PI*sigma*sigma);
  const xSin=new Float32Array(size),xCos=new Float32Array(size),ySin=new Float32Array(size),yCos=new Float32Array(size),realValues=new Float32Array(size*size),imaginaryValues=new Float32Array(size*size);
  for(let i=-radius;i<=radius;i++){
    const gx=Math.exp(-(i*i)/(2*sigma*sigma)),gy=Math.exp(-(gamma*gamma*i*i)/(2*sigma*sigma)),index=i+radius;
    xSin[index]=norm*gx*Math.sin(kx*i);xCos[index]=norm*gx*Math.cos(kx*i);
    ySin[index]=gy*Math.sin(ky*i);yCos[index]=gy*Math.cos(ky*i);
  }
  for(let y=-radius;y<=radius;y++)for(let x=-radius;x<=radius;x++){
    const xi=x+radius,yi=y+radius,sine=xSin[xi]*yCos[yi]+xCos[xi]*ySin[yi],cosine=xCos[xi]*yCos[yi]-xSin[xi]*ySin[yi];
    realValues[yi*size+xi]=cosine;imaginaryValues[yi*size+xi]=sine;
  }
  return{radius,size,xSin,xCos,ySin,yCos,values:realValues,imaginaryValues};
}

function correlateSeparable(data,w,h,horizontal,vertical){
  const radius=(horizontal.length-1)/2,temp=new Float32Array(w*h),out=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let sum=0;for(let k=-radius;k<=radius;k++)sum+=data[y*w+(x+k+w)%w]*horizontal[k+radius];temp[y*w+x]=sum;
  }
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let sum=0;for(let k=-radius;k<=radius;k++)sum+=temp[((y+k+h)%h)*w+x]*vertical[k+radius];out[y*w+x]=sum;
  }
  return out;
}

function gaborResponse(texture,kernel){
  const sineA=correlateSeparable(texture.data,texture.w,texture.h,kernel.xSin,kernel.yCos),sineB=correlateSeparable(texture.data,texture.w,texture.h,kernel.xCos,kernel.ySin),cosineA=correlateSeparable(texture.data,texture.w,texture.h,kernel.xCos,kernel.yCos),cosineB=correlateSeparable(texture.data,texture.w,texture.h,kernel.xSin,kernel.ySin),out=new Float32Array(texture.data.length);
  let sum=0,maxPower=0;
  for(let i=0;i<out.length;i++){const real=cosineA[i]-cosineB[i],imaginary=sineA[i]+sineB[i],power=Math.hypot(real,imaginary);out[i]=power;sum+=power;maxPower=Math.max(maxPower,power)}
  return{values:out,meanPower:sum/out.length,maxPower};
}

function calibrateGaborPowerScale(textures){
  const settings=[
    {gamma:1,sigma:1,omega:0,lambda:3},{gamma:1,sigma:4,omega:0,lambda:10},{gamma:1,sigma:4,omega:0,lambda:30},
    {gamma:1,sigma:4,omega:45,lambda:10},{gamma:1,sigma:4,omega:90,lambda:10},{gamma:1,sigma:8,omega:135,lambda:10},
    {gamma:.5,sigma:4,omega:0,lambda:10},{gamma:1.5,sigma:4,omega:90,lambda:10},
  ],samples=[];
  settings.forEach(setting=>textures.forEach(texture=>{const response=gaborResponse(texture,makeGaborKernel(setting));for(let i=0;i<response.values.length;i+=29)samples.push(response.values[i])}));
  samples.sort((a,b)=>a-b);return samples[Math.floor(samples.length*.997)]||1;
}

function drawSignedValues(canvas,values,w,h,maxAbs){
  canvas.width=w;canvas.height=h;
  const image=new ImageData(w,h),scale=127/(maxAbs||1);
  for(let i=0;i<values.length;i++){const value=clamp(128+values[i]*scale);image.data[i*4]=image.data[i*4+1]=image.data[i*4+2]=value;image.data[i*4+3]=255}
  canvas.getContext('2d').putImageData(image,0,0);
}

function drawGaborKernel(kernel,{gamma,sigma,omega,lambda}){
  const canvas=$('#gaborKernel'),viewSize=GABOR_KERNEL_VIEW_RADIUS*2+1,view=new Float32Array(viewSize*viewSize),theta=omega*Math.PI/180,kx=2*Math.PI*Math.cos(theta)/lambda,ky=2*Math.PI*Math.sin(theta)/lambda,norm=gamma/(2*Math.PI*sigma*sigma);
  let maxAbs=0;
  for(let y=-GABOR_KERNEL_VIEW_RADIUS;y<=GABOR_KERNEL_VIEW_RADIUS;y++)for(let x=-GABOR_KERNEL_VIEW_RADIUS;x<=GABOR_KERNEL_VIEW_RADIUS;x++){
    const envelope=Math.exp(-(x*x+gamma*gamma*y*y)/(2*sigma*sigma)),value=norm*envelope*Math.cos(kx*x+ky*y),index=(y+GABOR_KERNEL_VIEW_RADIUS)*viewSize+x+GABOR_KERNEL_VIEW_RADIUS;
    view[index]=value;maxAbs=Math.max(maxAbs,Math.abs(value));
  }
  drawSignedValues(canvas,view,viewSize,viewSize,maxAbs);
  $('#gaborKernelMeta').textContent=`${kernel.size} × ${kernel.size} support · fixed ±${GABOR_KERNEL_VIEW_RADIUS} px view`;
  $('#gaborAxis').style.transform=`translate(-50%, -50%) rotate(${omega}deg)`;
}

function scheduleGaborRender(experiment,token){
  if(gaborRuntime.raf)cancelAnimationFrame(gaborRuntime.raf);
  gaborRuntime.raf=requestAnimationFrame(()=>{
    gaborRuntime.raf=0;
    if(token===gaborRuntime.token&&state.active==='gabor'&&gaborRuntime.textures)renderGabor(experiment);
  });
}

function renderGabor(experiment){
  const started=performance.now(),kernel=makeGaborKernel(experiment.state),textures=gaborRuntime.textures;
  drawGaborKernel(kernel,experiment.state);
  const responses=textures.map(texture=>gaborResponse(texture,kernel)),displayMax=gaborRuntime.displayMax;
  textures.forEach((texture,index)=>{
    const source=$(`#gaborTexture${index}`);source.width=texture.w;source.height=texture.h;source.getContext('2d').drawImage(texture.canvas,0,0);
    drawPowerValues($(`#gaborResponse${index}`),responses[index].values,texture.w,texture.h,displayMax);
    $(`#gaborStrength${index}`).textContent=responses[index].meanPower.toFixed(3);
  });
  $('#gaborStatus').textContent=`Fixed power range 0–${displayMax.toFixed(2)} · updated in ${Math.round(performance.now()-started)} ms`;
  state.output=$('#gaborResponse0');
}

function drawPowerValues(canvas,values,w,h,maxPower){
  canvas.width=w;canvas.height=h;const image=new ImageData(w,h),scale=255/(maxPower||1);
  for(let i=0;i<values.length;i++){const value=clamp(values[i]*scale);image.data[i*4]=image.data[i*4+1]=image.data[i*4+2]=value;image.data[i*4+3]=255}
  canvas.getContext('2d').putImageData(image,0,0);
}

function renderPreparedGaborComparisons(texture){
  const definitions=[
    {title:'Orientation',caption:'same envelope and wavelength, rotated carrier',a:{gamma:1,sigma:4,omega:0,lambda:10},b:{gamma:1,sigma:4,omega:90,lambda:10},labels:['ω = 0°','ω = 90°']},
    {title:'Wavelength',caption:'short λ detects finer cycles',a:{gamma:1,sigma:4,omega:0,lambda:6},b:{gamma:1,sigma:4,omega:0,lambda:18},labels:['λ = 6 px','λ = 18 px']},
    {title:'Envelope scale',caption:'larger σ pools over a wider neighborhood',a:{gamma:1,sigma:2.5,omega:0,lambda:10},b:{gamma:1,sigma:6,omega:0,lambda:10},labels:['σ = 2.5','σ = 6.0']},
    {title:'Aspect ratio',caption:'smaller γ stretches the envelope vertically',a:{gamma:.55,sigma:4,omega:0,lambda:10},b:{gamma:1.35,sigma:4,omega:0,lambda:10},labels:['γ = 0.55','γ = 1.35']},
  ];
  const container=$('#gaborPrepared');
  container.innerHTML=definitions.map((item,index)=>`<figure><figcaption><b>${item.title}</b><small>${item.caption}</small></figcaption><div><span><canvas id="gaborCompare${index}a"></canvas><em>${item.labels[0]}</em></span><span><canvas id="gaborCompare${index}b"></canvas><em>${item.labels[1]}</em></span></div></figure>`).join('');
  definitions.forEach((item,index)=>{
    const responses=['a','b'].map(side=>gaborResponse(texture,makeGaborKernel(item[side])));
    responses.forEach((response,side)=>drawPowerValues($(`#gaborCompare${index}${side?'b':'a'}`),response.values,texture.w,texture.h,gaborRuntime.displayMax));
  });
}

const FLOW_PROC_WIDTH=420;
const FLOW_WINDOW=17;
const FLOW_RADIUS=Math.floor(FLOW_WINDOW/2);
const FLOW_ITERATIONS=8;
// Per-iteration step cap (px at the current level); keeps a bad linearisation from jumping far away.
const FLOW_MAX_STEP=2.5;
// A track is kept only if the window still matches (mean |I_B − I_A|, intensities in [0, 1]) …
const FLOW_MAX_RESIDUAL=.06;
// … and tracking B → A from p′ lands back within this many pixels of p (forward–backward check).
const FLOW_MAX_FB_ERROR=1;
const FLOW_LOOP_MS=2400;
const FLOW_DIAGRAM_SCALE=2;
// The pyramid diagram always describes the motion with a 4-level estimate, so it does not
// inherit the wrong matches of a 1–2 level run when the slider is lowered.
const FLOW_REFERENCE_LEVELS=4;
const FLOW_COLORS={single:'#4dd8ff',multi:'#3ddc84',recovered:'#ffd84d',lost:'#ff5a5f'};
const flowRuntime={token:0,raf:0,computeRaf:0,ready:false,img1:null,img2:null,gt:null,frameA:null,frameB:null,points:[],single:[],multi:[],reference:[]};
const flowReducedMotion=()=>Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const flowLevelsLabel=levels=>`${levels} level${levels===1?'':'s'}`;

function flowMetric(label,id){
  return `<div class="flow-metric"><small>${label}</small><b id="${id}">—</b></div>`;
}

function flowCard(id,title,description,badge,metrics='',footer=''){
  const meta=id==='flowSource'?'Sintel':id==='flowGt'?'reference':'Lucas–Kanade';
  return `<figure class="card flow-card"><figcaption><span>${title}</span><small>${meta}</small></figcaption><div class="flow-sub">${description}</div><div class="canvas-box flow-media"><canvas id="${id}" aria-label="${title}"></canvas><span class="flow-badge" id="${id}Badge">${badge}</span></div>${metrics?`<div class="flow-metrics">${metrics}</div>`:''}${footer}</figure>`;
}

function loadFlowImage(url){
  return new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>resolve(image);
    image.onerror=()=>reject(new Error(`Could not load ${url}`));
    image.src=url;
  });
}

function mountOpticalFlow(experiment){
  destroyOpticalFlow();
  const token=flowRuntime.token,s=experiment.state;
  if(!s.viewFrame)s.viewFrame=flowReducedMotion()?'B':'anim';
  root.innerHTML=`<div class="controls flow-controls">
    ${controlRange('flowExtraMotion','Extra motion',0,36,s.extraMotion,2)}
    ${controlRange('flowPyramidLevels','Pyramid levels',1,4,s.pyramidLevels)}
    ${controlRange('flowTrackedPoints','Tracked points',80,360,s.trackedPoints,20)}
    ${controlRange('flowArrowScale','Arrow scale',0.5,2,s.arrowScale??1,0.25)}
    <div class="control flow-select-control"><label for="flowViewFrame">LK panel background</label><select id="flowViewFrame"><option value="anim">Animate frame A → B</option><option value="A">Frame A (arrow starts)</option><option value="B">Frame B (arrow ends)</option></select></div>
  </div>
  <div class="flow-grid flow-top-grid">
    ${flowCard('flowSource','Original Sintel motion','Animated adjacent frame pair. This is the unmodified source motion.','original adjacent pair')}
    ${flowCard('flowGt','GT dense flow','Reference answer for the original adjacent pair. Color encodes the dense ground-truth motion field.','GT for original pair only')}
  </div>
  <div class="note flow-notice"><b>Teaching stress test:</b> <b>Extra motion</b> shifts the second frame to the right only for the comparison panels below (the dark strip on the left of frame B is the uncovered border). The GT dense flow above remains the ground truth for the <b>original adjacent Sintel pair</b>; it is not recalculated for the stressed pair.</div>
  <div class="flow-grid flow-bottom-grid">
    ${flowCard('flowSingle','Single-scale Lucas–Kanade',`One LK solve at full resolution, starting from zero motion. It only locks on when the displacement roughly fits inside its ${FLOW_WINDOW} × ${FLOW_WINDOW} window. <span class="flow-key flow-key-cyan">Cyan arrows</span> are kept tracks; <span class="flow-key flow-key-red">red circles</span> mark points it loses but the pyramid keeps.`,'L0 only · zero initialization',`${flowMetric('kept tracks','flowSingleTracks')}${flowMetric('median |d|','flowSingleMedian')}`)}
    ${flowCard('flowMulti','Multi-scale / pyramidal Lucas–Kanade','Same points. LK starts at the coarsest level, where the motion is only a few pixels, then doubles the estimate and refines it at each finer level. <span class="flow-key flow-key-green">Green arrows</span> are kept by both methods; <span class="flow-key flow-key-yellow">yellow arrows</span> are points recovered by the pyramid (lost by single-scale).','',`${flowMetric('kept tracks','flowMultiTracks')}${flowMetric('median |d|','flowMultiMedian')}${flowMetric('recovered','flowRecovered')}`)}
    ${flowCard('flowPyramid','Why the pyramid helps',`White square = the LK window, ${FLOW_WINDOW} × ${FLOW_WINDOW} pixels at every level. Left → right, each level doubles the image and the motion (in pixels), but not the window. <span class="flow-key flow-key-green">Green</span>: motion ≤ ${FLOW_RADIUS} px (window radius), LK can solve it from zero. <span class="flow-key flow-key-red">Red</span>: motion beyond the window; LK only gets there by starting from 2 × the estimate of the level to its left.`,'','',`<div class="flow-formula" id="flowScaleFormula">—</div>`)}
  </div>
  <div class="note" id="flowPointInfo"></div>
  <div class="flow-status" id="flowStatus" role="status">Loading Sintel frames and computing the comparison…</div>
  <div class="note flow-takeaway"><b>Classroom takeaway:</b> start at <b>Extra motion = 0 px</b>, then increase it toward <b>20–30 px</b>. Single-scale LK loses most correspondences once the displacement exceeds the window radius, while pyramidal LK solves the small motion at the coarsest level first; each finer level starts from 2 × that estimate and only corrects the remaining error. Set <b>Pyramid levels = 1</b> to check that pyramidal LK with a single level <i>is</i> single-scale LK.</div>
  <div class="flow-source-note">Source frames and dense-flow visualization: <a href="https://github.com/open-mmlab/mmflow/tree/master/demo" target="_blank" rel="noopener noreferrer">MMFlow Sintel demo</a>. The extra translation is an explicit teaching stress test applied identically to both LK variants. Both variants use the same window, iteration budget and forward–backward validity check.</div>`;

  bindRange('flowExtraMotion',value=>{experiment.state.extraMotion=value;scheduleOpticalFlow(experiment,token)},value=>`${value} px`);
  bindRange('flowPyramidLevels',value=>{experiment.state.pyramidLevels=value;scheduleOpticalFlow(experiment,token)},value=>flowLevelsLabel(+value));
  bindRange('flowTrackedPoints',value=>{experiment.state.trackedPoints=value;scheduleOpticalFlow(experiment,token)});
  bindRange('flowArrowScale',value=>{experiment.state.arrowScale=value;redrawFlowPanels()},value=>`${Number(value).toFixed(2)}×`);
  $('#flowExtraMotionOut').textContent=`${s.extraMotion} px`;
  $('#flowPyramidLevelsOut').textContent=flowLevelsLabel(s.pyramidLevels);
  $('#flowArrowScaleOut').textContent=`${Number(s.arrowScale??1).toFixed(2)}×`;
  $('#flowViewFrame').value=s.viewFrame;
  $('#flowViewFrame').addEventListener('change',event=>{experiment.state.viewFrame=event.target.value;redrawFlowPanels()});
  for(const id of ['flowSingle','flowMulti'])$('#'+id).addEventListener('click',event=>selectFlowPoint(event,id==='flowMulti',experiment));
  resetFlowPointInfo(experiment);
  initializeOpticalFlow(experiment,token);
}

function destroyOpticalFlow(){
  flowRuntime.token++;
  if(flowRuntime.raf)cancelAnimationFrame(flowRuntime.raf);
  if(flowRuntime.computeRaf)cancelAnimationFrame(flowRuntime.computeRaf);
  flowRuntime.raf=0;flowRuntime.computeRaf=0;flowRuntime.ready=false;flowRuntime.img1=null;flowRuntime.img2=null;flowRuntime.gt=null;
  flowRuntime.frameA=null;flowRuntime.frameB=null;flowRuntime.points=[];flowRuntime.single=[];flowRuntime.multi=[];flowRuntime.reference=[];
}

async function initializeOpticalFlow(experiment,token){
  try{
    const base='images/optical-flow/';
    const [img1,img2,gt]=await Promise.all([loadFlowImage(base+'frame_0001.png'),loadFlowImage(base+'frame_0002.png'),loadFlowImage(base+'frame_gt.png')]);
    if(token!==flowRuntime.token||state.active!=='opticalFlow')return;
    flowRuntime.img1=img1;flowRuntime.img2=img2;flowRuntime.gt=gt;flowRuntime.ready=true;
    drawFlowImage('flowGt',gt);
    computeOpticalFlow(experiment,token);
    flowRuntime.raf=requestAnimationFrame(ts=>animateOpticalFlow(ts,token));
  }catch(error){
    if(token===flowRuntime.token&&$('#flowStatus'))$('#flowStatus').textContent=`Initialization failed: ${error.message}`;
  }
}

function sizeFlowCanvas(canvasElement,width,height){
  if(canvasElement.width!==width)canvasElement.width=width;
  if(canvasElement.height!==height)canvasElement.height=height;
  return canvasElement.getContext('2d');
}

function drawFlowImage(id,image){
  const canvasElement=$('#'+id);if(!canvasElement)return;
  const context=sizeFlowCanvas(canvasElement,image.naturalWidth||image.width,image.naturalHeight||image.height);
  context.clearRect(0,0,canvasElement.width,canvasElement.height);context.drawImage(image,0,0,canvasElement.width,canvasElement.height);
}

function makeFlowFrame(image,shift){
  const w=FLOW_PROC_WIDTH,h=Math.round((image.naturalHeight||image.height)*w/(image.naturalWidth||image.width)),canvasElement=document.createElement('canvas');
  canvasElement.width=w;canvasElement.height=h;
  const context=canvasElement.getContext('2d',{willReadFrequently:true});context.fillStyle='#111317';context.fillRect(0,0,w,h);context.drawImage(image,shift,0,w,h);
  const pixels=context.getImageData(0,0,w,h).data,gray=new Float32Array(w*h);
  for(let i=0,p=0;i<pixels.length;i+=4,p++)gray[p]=(.299*pixels[i]+.587*pixels[i+1]+.114*pixels[i+2])/255;
  return{gray,w,h,canvas:canvasElement};
}

function flowSample(values,w,h,x,y){
  if(x<1||y<1||x>w-2||y>h-2)return NaN;
  const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0,i=y0*w+x0;
  return values[i]*(1-fx)*(1-fy)+values[i+1]*fx*(1-fy)+values[i+w]*(1-fx)*fy+values[i+w+1]*fx*fy;
}

// Gaussian pyramid step: separable [1 4 6 4 1]/16 blur, then keep every second pixel,
// so coarse pixel (x, y) sits exactly at fine pixel (2x, 2y).
function downsampleFlow(values,w,h){
  const taps=[1,4,6,4,1],nw=Math.max(2,Math.ceil(w/2)),nh=Math.max(2,Math.ceil(h/2)),blurred=new Float32Array(w*h),out=new Float32Array(nw*nh);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let sum=0;for(let t=-2;t<=2;t++)sum+=taps[t+2]*values[y*w+clamp(x+t,0,w-1)];
    blurred[y*w+x]=sum/16;
  }
  for(let y=0;y<nh;y++)for(let x=0;x<nw;x++){
    const sx=Math.min(w-1,2*x),sy=Math.min(h-1,2*y);
    let sum=0;for(let t=-2;t<=2;t++)sum+=taps[t+2]*blurred[clamp(sy+t,0,h-1)*w+sx];
    out[y*nw+x]=sum/16;
  }
  return{gray:out,w:nw,h:nh};
}

// levels = number of resolutions including full resolution (OpenCV maxLevel = levels − 1).
function flowPyramid(frame,levels){
  const pyramid=[frame];
  while(pyramid.length<levels){const top=pyramid[pyramid.length-1];pyramid.push(downsampleFlow(top.gray,top.w,top.h))}
  return pyramid;
}

function detectFlowCorners(values,w,h,maximum){
  const candidates=[];
  for(let y=5;y<h-5;y+=4)for(let x=5;x<w-5;x+=4){
    let xx=0,xy=0,yy=0;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      const i=(y+dy)*w+x+dx,gx=(values[i+1]-values[i-1])*.5,gy=(values[i+w]-values[i-w])*.5;
      xx+=gx*gx;xy+=gx*gy;yy+=gy*gy;
    }
    const trace=xx+yy,discriminant=Math.sqrt(Math.max(0,(xx-yy)*(xx-yy)+4*xy*xy)),score=(trace-discriminant)*.5;
    if(score>.0015)candidates.push({x,y,score});
  }
  candidates.sort((a,b)=>b.score-a.score);
  const points=[];
  for(const candidate of candidates){
    let separated=true;
    for(const point of points){const dx=point.x-candidate.x,dy=point.y-candidate.y;if(dx*dx+dy*dy<49){separated=false;break}}
    if(separated)points.push(candidate);
    if(points.length>=maximum)break;
  }
  return points;
}

// Iterative LK at one level. `solved` is false when the window leaves the image or the
// structure tensor is singular; the caller decides whether the match is good enough.
function lkFlowLevel(a,b,w,h,x,y,u0,v0){
  let u=u0,v=v0,residual=Infinity,solved=true;
  const radius=FLOW_RADIUS,stride=radius>7?2:1;
  for(let iteration=0;iteration<FLOW_ITERATIONS;iteration++){
    let A=0,B=0,C=0,D=0,E=0,error=0,samples=0;
    for(let dy=-radius;dy<=radius;dy+=stride)for(let dx=-radius;dx<=radius;dx+=stride){
      const px=x+dx,py=y+dy,qx=px+u,qy=py+v,i1=flowSample(a,w,h,px,py),i2=flowSample(b,w,h,qx,qy);
      if(!Number.isFinite(i1)||!Number.isFinite(i2))continue;
      const ix=(flowSample(b,w,h,qx+1,qy)-flowSample(b,w,h,qx-1,qy))*.5,iy=(flowSample(b,w,h,qx,qy+1)-flowSample(b,w,h,qx,qy-1))*.5;
      if(!Number.isFinite(ix)||!Number.isFinite(iy))continue;
      const temporal=i2-i1;A+=ix*ix;B+=ix*iy;C+=iy*iy;D+=-ix*temporal;E+=-iy*temporal;error+=Math.abs(temporal);samples++;
    }
    if(samples<12){solved=false;break}
    residual=error/samples;
    const determinant=A*C-B*B;
    if(determinant<1e-5){solved=false;break}
    let du=(C*D-B*E)/determinant,dv=(A*E-B*D)/determinant;
    const magnitude=Math.hypot(du,dv);
    if(magnitude>FLOW_MAX_STEP){du*=FLOW_MAX_STEP/magnitude;dv*=FLOW_MAX_STEP/magnitude}
    u+=du;v+=dv;
    if(Math.hypot(du,dv)<.025)break;
  }
  if(!Number.isFinite(u)||!Number.isFinite(v))solved=false;
  return{u,v,residual,solved};
}

// Coarse-to-fine LK. A level that cannot be solved (e.g. the window falls off a tiny
// coarse image) simply passes its initial guess on; only the finest level decides validity.
function lkPyramidal(pyramidA,pyramidB,x,y){
  let u=0,v=0,result={u,v,residual:Infinity,solved:false};
  for(let level=pyramidA.length-1;level>=0;level--){
    const scale=2**level,a=pyramidA[level],b=pyramidB[level];
    result=lkFlowLevel(a.gray,b.gray,a.w,a.h,x/scale,y/scale,u,v);
    if(result.solved){u=result.u;v=result.v}
    if(level>0){u*=2;v*=2}
  }
  return{u,v,residual:result.residual,solved:result.solved};
}

function trackFlow(frameA,frameB,points,levels){
  const pyramidA=flowPyramid(frameA,levels),pyramidB=flowPyramid(frameB,levels);
  return points.map(point=>{
    const forward=lkPyramidal(pyramidA,pyramidB,point.x,point.y);
    const backward=forward.solved?lkPyramidal(pyramidB,pyramidA,point.x+forward.u,point.y+forward.v):null;
    const fbError=backward?.solved?Math.hypot(forward.u+backward.u,forward.v+backward.v):Infinity;
    const valid=forward.solved&&forward.residual<=FLOW_MAX_RESIDUAL&&fbError<=FLOW_MAX_FB_ERROR;
    return{x:point.x,y:point.y,u:forward.u,v:forward.v,residual:forward.residual,fbError,valid};
  });
}

function flowRecovered(index){
  return Boolean(flowRuntime.multi[index]?.valid&&!flowRuntime.single[index]?.valid);
}

function flowMedian(values){
  if(!values.length)return 0;
  const sorted=[...values].sort((a,b)=>a-b),middle=sorted.length>>1;
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
}

function flowMedianVector(tracks){
  const valid=tracks.filter(track=>track.valid);
  return valid.length?{u:flowMedian(valid.map(track=>track.u)),v:flowMedian(valid.map(track=>track.v)),count:valid.length}:null;
}

function drawFlowArrow(context,x,y,u,v,scale,color,width,head=4){
  const endX=x+u*scale,endY=y+v*scale,angle=Math.atan2(v,u);
  context.strokeStyle=color;context.fillStyle=color;context.lineWidth=width;context.beginPath();context.moveTo(x,y);context.lineTo(endX,endY);context.stroke();
  if(Math.hypot(u,v)*scale>head){context.beginPath();context.moveTo(endX,endY);context.lineTo(endX-head*Math.cos(angle-.55),endY-head*Math.sin(angle-.55));context.lineTo(endX-head*Math.cos(angle+.55),endY-head*Math.sin(angle+.55));context.closePath();context.fill()}
}

function drawFlowBackground(context,mode,progress){
  const {frameA,frameB}=flowRuntime;
  if(mode==='anim'){
    context.globalAlpha=1;context.drawImage(frameA.canvas,0,0);
    context.globalAlpha=progress;context.drawImage(frameB.canvas,0,0);
    context.globalAlpha=1;
  }else context.drawImage((mode==='B'?frameB:frameA).canvas,0,0);
  context.fillStyle='rgba(0,0,0,.28)';context.fillRect(0,0,frameA.w,frameA.h);
}

// In "animate" mode the background cross-fades A → B while every arrow grows from p to p′,
// so each arrow tip reaches its end point exactly when frame B is fully shown.
function drawFlowPanel(id,tracks,isMulti,progress=1){
  const canvasElement=$('#'+id);if(!canvasElement||!flowRuntime.frameA)return;
  const experiment=experiments.find(item=>item.id==='opticalFlow'),mode=experiment.state.viewFrame;
  const t=mode==='anim'?progress:1,scale=Number(experiment.state.arrowScale??1)*t;
  const context=sizeFlowCanvas(canvasElement,flowRuntime.frameA.w,flowRuntime.frameA.h);
  drawFlowBackground(context,mode,t);
  for(let index=0;index<tracks.length;index++){
    const track=tracks[index];
    if(track.valid){
      const recovered=isMulti&&flowRecovered(index),color=recovered?FLOW_COLORS.recovered:(isMulti?FLOW_COLORS.multi:FLOW_COLORS.single);
      drawFlowArrow(context,track.x,track.y,track.u,track.v,scale,color,recovered?2.2:1.2);
      context.fillStyle='#fff';context.beginPath();context.arc(track.x,track.y,1.8,0,Math.PI*2);context.fill();
      context.fillStyle=color;context.beginPath();context.arc(track.x+track.u*scale,track.y+track.v*scale,2.1,0,Math.PI*2);context.fill();
    }else if(!isMulti&&flowRecovered(index)){
      context.strokeStyle=FLOW_COLORS.lost;context.lineWidth=1.7;context.beginPath();context.arc(track.x,track.y,3.1,0,Math.PI*2);context.stroke();
    }
  }
  const selected=tracks[experiment.state.selectedFlowPoint];
  if(selected){
    const sx=selected.x,sy=selected.y,ex=sx+selected.u*scale,ey=sy+selected.v*scale;
    context.strokeStyle='#fff';context.lineWidth=2.5;
    for(const [x,y] of selected.valid?[[sx,sy],[ex,ey]]:[[sx,sy]]){context.beginPath();context.arc(x,y,5,0,Math.PI*2);context.stroke()}
    context.font='bold 13px Arial';context.fillStyle='#fff';context.shadowColor='#000';context.shadowBlur=5;
    context.fillText('p',sx+7,sy-8);if(selected.valid)context.fillText("p'",ex+7,ey-8);context.shadowBlur=0;
  }
}

function redrawFlowPanels(){
  if(!flowRuntime.ready)return;
  drawFlowPanel('flowSingle',flowRuntime.single,false);
  drawFlowPanel('flowMulti',flowRuntime.multi,true);
}

function resetFlowPointInfo(experiment){
  experiment.state.selectedFlowPoint=null;
  const info=$('#flowPointInfo');
  if(info)info.textContent='Click an arrow (or a red circle) to inspect p = (x, y), p′ = (x + u, y + v) and the displacement (u, v). White dots mark starts; colored dots mark estimated endpoints.';
}

function describeFlowTrack(label,track){
  const f=n=>n.toFixed(1);
  if(!track.valid){
    const reason=!Number.isFinite(track.fbError)?'LK could not be solved: window left the image or gradients were degenerate'
      :track.residual>FLOW_MAX_RESIDUAL?`window mismatch ${track.residual.toFixed(3)} > ${FLOW_MAX_RESIDUAL}`
      :`forward–backward error ${f(track.fbError)} px > ${FLOW_MAX_FB_ERROR} px`;
    return `${label}: lost (${reason})`;
  }
  return `${label}: p′ = (${f(track.x+track.u)}, ${f(track.y+track.v)}), (u, v) = (${f(track.u)}, ${f(track.v)}) px, forward–backward error ${track.fbError.toFixed(2)} px`;
}

function selectFlowPoint(event,isMulti,experiment){
  const canvasElement=event.currentTarget,rect=canvasElement.getBoundingClientRect();
  const x=(event.clientX-rect.left)*canvasElement.width/rect.width,y=(event.clientY-rect.top)*canvasElement.height/rect.height;
  const tracks=isMulti?flowRuntime.multi:flowRuntime.single,scale=Number(experiment.state.arrowScale??1);
  let best=-1,distance=Infinity;
  tracks.forEach((track,i)=>{
    // Valid arrows and the red "lost" circles in the single-scale panel are clickable.
    if(!track.valid&&!(!isMulti&&flowRecovered(i)))return;
    const d=track.valid?Math.min(Math.hypot(x-track.x,y-track.y),Math.hypot(x-track.x-track.u*scale,y-track.y-track.v*scale)):Math.hypot(x-track.x,y-track.y);
    if(d<distance){distance=d;best=i}
  });
  if(best<0||distance>18)return;
  experiment.state.selectedFlowPoint=best;
  const single=flowRuntime.single[best],multi=flowRuntime.multi[best],f=n=>n.toFixed(1);
  $('#flowPointInfo').textContent=`Point #${best+1} · p = (${f(single.x)}, ${f(single.y)}) in the ${FLOW_PROC_WIDTH}-px-wide processing image. ${describeFlowTrack('Single-scale',single)}. ${describeFlowTrack('Pyramidal',multi)}.${flowRecovered(best)?' → recovered by the pyramid.':''}`;
  redrawFlowPanels();
}

// Levels are laid out coarse → fine (left → right), i.e. in computation order. Each
// thumbnail keeps its true relative size and the LK window is drawn on it at the same
// scale: 17 × 17 level pixels everywhere, so it covers far more of the coarse images.
function flowDiagramLayout(width,height,levels){
  const pad=24,top=92,gap=34,minColumn=124,imageGap=12,labelLines=4,lineHeight=26;
  const aspect=flowRuntime.frameA.w/flowRuntime.frameA.h;
  const columnsFor=fullWidth=>[...Array(levels)].map((_,index)=>Math.max(fullWidth/2**(levels-1-index),minColumn));
  const totalFor=fullWidth=>columnsFor(fullWidth).reduce((sum,column)=>sum+column,0)+gap*(levels-1);
  let fullWidth=(height-top-imageGap-labelLines*lineHeight-10)*aspect;
  while(fullWidth>40&&totalFor(fullWidth)>width-2*pad)fullWidth-=2;
  return{top,gap,lineHeight,imageGap,fullWidth,fullHeight:fullWidth/aspect,columns:columnsFor(fullWidth),x0:(width-totalFor(fullWidth))/2};
}

// A real tracked point near the image centre anchors the window drawn on every level.
function flowDiagramAnchor(){
  const {w,h}=flowRuntime.frameA;let best={x:w/2,y:h/2},distance=Infinity;
  for(const track of flowRuntime.reference){
    const d=Math.hypot(track.x-w/2,track.y-h/2);
    if(track.valid&&d<distance){distance=d;best=track}
  }
  return best;
}

function drawFlowPyramid(){
  const canvasElement=$('#flowPyramid');if(!canvasElement||!flowRuntime.frameA)return;
  const experiment=experiments.find(item=>item.id==='opticalFlow'),levels=experiment.state.pyramidLevels;
  const width=flowRuntime.frameA.w*FLOW_DIAGRAM_SCALE,height=flowRuntime.frameA.h*FLOW_DIAGRAM_SCALE;
  const context=sizeFlowCanvas(canvasElement,width,height);context.fillStyle='#17191d';context.fillRect(0,0,width,height);
  const median=flowMedianVector(flowRuntime.reference)||{u:experiment.state.extraMotion,v:0};
  const magnitude=Math.hypot(median.u,median.v),layout=flowDiagramLayout(width,height,levels),anchor=flowDiagramAnchor();
  const pixel=layout.fullWidth/flowRuntime.frameA.w,windowSide=FLOW_WINDOW*pixel,imageBottom=layout.top+layout.fullHeight;
  let columnX=layout.x0;
  context.textAlign='center';
  for(let index=0;index<levels;index++){
    const level=levels-1-index,factor=2**level,column=layout.columns[index],cx=columnX+column/2;
    const w=layout.fullWidth/factor,h=layout.fullHeight/factor,x=cx-w/2,y=imageBottom-h;
    const displacement=magnitude/factor,fits=displacement<=FLOW_RADIUS,color=fits?FLOW_COLORS.multi:FLOW_COLORS.lost,isStart=index===0&&levels>1;
    context.drawImage(flowRuntime.frameA.canvas,x,y,w,h);
    context.strokeStyle=isStart?FLOW_COLORS.recovered:'#dbeafe';context.lineWidth=isStart?3:1.5;context.strokeRect(x,y,w,h);
    // One level pixel is `pixel` canvas units at every level, so the window keeps the same drawn size.
    const px=x+anchor.x/factor*pixel,py=y+anchor.y/factor*pixel;
    context.fillStyle='rgba(255,255,255,.22)';context.fillRect(px-windowSide/2,py-windowSide/2,windowSide,windowSide);
    context.strokeStyle='#000';context.lineWidth=4;context.strokeRect(px-windowSide/2,py-windowSide/2,windowSide,windowSide);
    context.strokeStyle='#fff';context.lineWidth=2;context.strokeRect(px-windowSide/2,py-windowSide/2,windowSide,windowSide);
    if(displacement>0)drawFlowArrow(context,px,py,median.u/factor,median.v/factor,pixel,color,3,7);
    const levelW=Math.ceil(flowRuntime.frameA.w/factor),levelH=Math.ceil(flowRuntime.frameA.h/factor),labelY=imageBottom+layout.imageGap;
    context.font='bold 22px Arial';context.fillStyle=isStart?FLOW_COLORS.recovered:'#dbeafe';
    context.fillText(isStart?`L${level} · start`:`L${level}`,cx,labelY+layout.lineHeight-4);
    context.font='18px monospace';context.fillStyle='#aab3c2';context.fillText(`${levelW}×${levelH}`,cx,labelY+layout.lineHeight*2-4);
    context.font='bold 21px monospace';context.fillStyle=color;context.fillText(`${displacement.toFixed(1)} px`,cx,labelY+layout.lineHeight*3-4);
    context.font='18px monospace';context.fillText(`${fits?'≤':'>'} r = ${FLOW_RADIUS}`,cx,labelY+layout.lineHeight*4-4);
    columnX+=column;
    if(index<levels-1){
      // "×2" sits in the label band between columns, clear of the thumbnails.
      const labelY=imageBottom+layout.imageGap;
      context.font='bold 19px Arial';context.fillStyle='#dbeafe';
      context.fillText('×2',columnX+layout.gap/2,labelY+layout.lineHeight-4);
      context.fillText('→',columnX+layout.gap/2,labelY+layout.lineHeight*2-4);
      columnX+=layout.gap;
    }
  }
  context.textAlign='start';
  $('#flowPyramidBadge').textContent=levels>1?`start at L${levels-1} → ×2 & refine → L0`:'1 level = full resolution only';
  const chain=[...Array(levels)].map((_,index)=>`${(magnitude/2**(levels-1-index)).toFixed(1)} px`).join(' → ');
  const strong=document.createElement('b');strong.textContent=`|d| ≈ ${chain}`;
  const detail=document.createElement('small');
  detail.textContent=levels>1
    ?`median motion at L${levels-1} → L0`
    :`one level: all ${magnitude.toFixed(1)} px must fit the ${FLOW_RADIUS}-px radius, as in single-scale LK`;
  $('#flowScaleFormula').replaceChildren(strong,detail);
}

function updateFlowMetrics(){
  const single=flowMedianVector(flowRuntime.single),multi=flowMedianVector(flowRuntime.multi),total=flowRuntime.points.length;
  let recovered=0;
  for(let index=0;index<flowRuntime.multi.length;index++)if(flowRecovered(index))recovered++;
  const magnitude=summary=>summary?`${Math.hypot(summary.u,summary.v).toFixed(1)} px`:'—';
  $('#flowSingleTracks').textContent=`${single?.count??0} / ${total}`;$('#flowMultiTracks').textContent=`${multi?.count??0} / ${total}`;
  $('#flowSingleMedian').textContent=magnitude(single);$('#flowMultiMedian').textContent=magnitude(multi);
  $('#flowRecovered').textContent=recovered;
}

// Slider input fires many times per drag; recompute at most once per frame.
function scheduleOpticalFlow(experiment,token){
  if(flowRuntime.computeRaf)cancelAnimationFrame(flowRuntime.computeRaf);
  flowRuntime.computeRaf=requestAnimationFrame(()=>{flowRuntime.computeRaf=0;computeOpticalFlow(experiment,token)});
}

function computeOpticalFlow(experiment,token=flowRuntime.token){
  if(!flowRuntime.ready||token!==flowRuntime.token||state.active!=='opticalFlow')return;
  const started=performance.now(),{extraMotion,pyramidLevels,trackedPoints}=experiment.state;
  flowRuntime.frameA=makeFlowFrame(flowRuntime.img1,0);flowRuntime.frameB=makeFlowFrame(flowRuntime.img2,extraMotion);
  flowRuntime.points=detectFlowCorners(flowRuntime.frameA.gray,flowRuntime.frameA.w,flowRuntime.frameA.h,trackedPoints);
  resetFlowPointInfo(experiment);
  flowRuntime.single=trackFlow(flowRuntime.frameA,flowRuntime.frameB,flowRuntime.points,1);
  flowRuntime.multi=trackFlow(flowRuntime.frameA,flowRuntime.frameB,flowRuntime.points,pyramidLevels);
  flowRuntime.reference=pyramidLevels===FLOW_REFERENCE_LEVELS?flowRuntime.multi:trackFlow(flowRuntime.frameA,flowRuntime.frameB,flowRuntime.points,FLOW_REFERENCE_LEVELS);
  $('#flowMultiBadge').textContent=`${flowLevelsLabel(pyramidLevels)} · L${pyramidLevels-1} → L0 (coarse → fine)`;
  updateFlowMetrics();drawFlowPyramid();redrawFlowPanels();state.output=$('#flowMulti');
  $('#flowStatus').textContent=`Ready · ${flowRuntime.points.length} shared points · extra motion ${extraMotion} px · ${flowLevelsLabel(pyramidLevels)} · same stressed input for both LK variants · ${Math.round(performance.now()-started)} ms.`;
}

function drawOriginalFlowFrame(progress){
  const canvasElement=$('#flowSource');if(!canvasElement||!flowRuntime.img1||!flowRuntime.img2)return;
  const width=flowRuntime.img1.naturalWidth||flowRuntime.img1.width,height=flowRuntime.img1.naturalHeight||flowRuntime.img1.height;
  const context=sizeFlowCanvas(canvasElement,width,height);context.globalAlpha=1;context.drawImage(flowRuntime.img1,0,0,width,height);context.globalAlpha=progress;context.drawImage(flowRuntime.img2,0,0,width,height);context.globalAlpha=1;
}

function animateOpticalFlow(timestamp,token){
  if(token!==flowRuntime.token||state.active!=='opticalFlow')return;
  if(flowReducedMotion()){
    drawOriginalFlowFrame(0);
  }else{
    const phase=(timestamp%FLOW_LOOP_MS)/FLOW_LOOP_MS,progress=.5-.5*Math.cos(phase*Math.PI*2);
    drawOriginalFlowFrame(progress);
    const mode=experiments.find(item=>item.id==='opticalFlow').state.viewFrame;
    if(flowRuntime.ready&&mode==='anim'){
      drawFlowPanel('flowSingle',flowRuntime.single,false,progress);
      drawFlowPanel('flowMulti',flowRuntime.multi,true,progress);
    }
  }
  flowRuntime.raf=requestAnimationFrame(next=>animateOpticalFlow(next,token));
}

const HARRIS_WORKING_SIZE=480;
const HARRIS_MATCH_TOLERANCE=3;
const HARRIS_DEFAULTS={sigma:1.5,k:.05,threshold:1,nms:4,rotation:30,scale:100,contrast:100,probe:null};
const HARRIS_VIEW_PRESETS={rotate:{rotation:30,scale:100,contrast:100},contrast:{rotation:0,scale:100,contrast:60},zoom:{rotation:0,scale:60,contrast:100}};
const HARRIS_CONTROLS=[
  ['harrisSigma','sigma',value=>(+value).toFixed(2)],
  ['harrisK','k',value=>(+value).toFixed(3)],
  ['harrisThreshold','threshold',value=>`${(+value).toFixed(1)}%`],
  ['harrisNms','nms',value=>`${value} px`],
  ['harrisRotation','rotation',value=>`${value}°`],
  ['harrisScale','scale',value=>`${value}%`],
  ['harrisContrast','contrast',value=>`${value}%`]
];
const HARRIS_CORNER_RAMP=[[0,0,0],[150,22,22],[235,64,40],[255,220,80]];
const HARRIS_EDGE_RAMP=[[0,0,0],[24,52,140],[70,130,255]];
const HARRIS_REGION_COLORS={corner:[251,225,222],edge:[223,232,251],flat:[244,244,244]};
const harrisRuntime={token:0,raf:0,view:null,firstKey:'',first:null,secondKey:'',second:null,corners:null};

function mountHarris(experiment){
  destroyHarris();
  const token=harrisRuntime.token,s=experiment.state;
  if(ensureNaturalPhoto('images/spanish steps.jpeg'))return;
  root.innerHTML=`${photoChooser('harrisPhotos')}<div class="controls harris-controls">
    ${controlRange('harrisSigma','σ · Gaussian window',.5,4,s.sigma,.25)}
    ${controlRange('harrisK','κ · trace weight',.02,.2,s.k,.005)}
    ${controlRange('harrisThreshold','Threshold · % of max R',.1,10,s.threshold,.1)}
    ${controlRange('harrisNms','NMS radius',1,10,s.nms)}
    <button class="button ghost" id="harrisReset" type="button">Reset</button>
  </div>
  <div class="results picker" id="harrisPrePost">${card('harrisPre','Pre · input image','—')}${card('harrisPost','Post · Harris corners (in red)','—')}</div>
  <div class="gabor-section-title harris-section-title"><div><b>The four steps · slide 24</b><small>Click the Post image or any step image to inspect the window at that point; a click close to a detected corner snaps to it.</small></div><span id="harrisStatus" role="status">Computing…</span></div>
  <div class="results four picker" id="harrisSteps">
    ${card('harrisGradient','1 · Gradient at each point','hue = orientation mod 180° · brightness √|∇I|')}
    ${card('harrisResponse','2 · Cornerness R of each window','blue R < 0 · black ≈ 0 · red→yellow R > 0')}
    ${card('harrisCandidates','3 · R > threshold','—')}
    ${card('harrisMaxima','4 · Non-maximum suppression','—')}
  </div>
  <div class="harris-key" aria-label="Colour key for the four steps"><span><i class="hue"></i>Step 1 hue: orientation 0° → 180°</span><span><i class="rmap"></i>Step 2: R &lt; 0 · 0 · R &gt; 0 (⁴√ scale)</span><span><i class="cand"></i>R &gt; t</span><span><i class="supp"></i>candidate removed by NMS</span><span><i class="kept"></i>corner kept</span><span><i class="band"></i>border band, skipped</span></div>
  <div class="harris-analysis">
    <section class="harris-inspector" aria-live="polite">
      <header><b>Second-moment matrix of the probed window</b><small id="harrisProbeMeta">—</small></header>
      <div class="harris-matrix-row"><span class="harris-symbol">M =</span><div class="harris-matrix">
        <span><small>Σ w·Ix²</small><b id="harrisMxx">—</b></span><span><small>Σ w·IxIy</small><b id="harrisMxy">—</b></span>
        <span><small>Σ w·IxIy</small><b id="harrisMyx">—</b></span><span><small>Σ w·Iy²</small><b id="harrisMyy">—</b></span>
      </div></div>
      <dl class="harris-values">
        <div><dt>λ₁ · larger eigenvalue</dt><dd id="harrisLambda1">—</dd></div>
        <div><dt>λ₂ · smaller eigenvalue</dt><dd id="harrisLambda2">—</dd></div>
        <div><dt>det M = λ₁λ₂</dt><dd id="harrisDet">—</dd></div>
        <div><dt>trace M = λ₁ + λ₂</dt><dd id="harrisTrace">—</dd></div>
        <div><dt>R = det M − κ (trace M)²</dt><dd id="harrisR">—</dd></div>
        <div><dt>Threshold t</dt><dd id="harrisT">—</dd></div>
      </dl>
      <p class="harris-verdict" id="harrisVerdict">—</p>
    </section>
    <figure class="card harris-plane">
      <figcaption><span>Eigenvalue plane · slide 22</span><small id="harrisPlaneMeta">√ axes · grey dots = sampled windows</small></figcaption>
      <canvas id="harrisPlane" aria-label="Eigenvalue plane with corner, edge, and flat regions"></canvas>
      <div class="harris-plane-legend"><span><i class="corner"></i>corner · R &gt; t</span><span><i class="edge"></i>edge · R &lt; −t</span><span><i class="flat"></i>flat or in between · |R| ≤ t</span><span><i class="probe"></i>probed window</span></div>
    </figure>
  </div>
  <div class="gabor-section-title harris-section-title"><div><b>Found Harris corners on a second view · slides 31–35</b><small>The identical detector, including the first view’s absolute threshold t, runs on a rotated, rescaled, or contrast-changed copy.</small></div><span id="harrisRepeatSummary">—</span></div>
  <div class="controls">
    ${controlRange('harrisRotation','Rotation',0,180,s.rotation,5)}
    ${controlRange('harrisScale','Scale',50,150,s.scale,5)}
    ${controlRange('harrisContrast','Contrast',40,160,s.contrast,5)}
  </div>
  <div class="l4-presets gabor-presets" id="harrisPresets" aria-label="Prepared second views">
    <span>Prepared views</span>
    <button data-harris-preset="rotate" type="button">Rotate 30°</button>
    <button data-harris-preset="contrast" type="button">Contrast × 0.6</button>
    <button data-harris-preset="zoom" type="button">Zoom out to 60%</button>
  </div>
  <div class="results">${card('harrisFirstView','View 1 · loaded image','—')}${card('harrisSecondView','View 2 · transformed copy','—')}</div>
  <div class="harris-key" aria-label="Marker key for the two views"><span><i class="kept"></i>found in both views (repeated)</span><span><i class="ring"></i>found in this view only</span><span>both views are drawn at the same pixel scale</span></div>
  <div class="stats">
    <div class="stat"><small>Corners · view 1</small><b id="harrisCountFirst">—</b></div>
    <div class="stat"><small>Corners · view 2</small><b id="harrisCountSecond">—</b></div>
    <div class="stat"><small>View-1 corners in view 2’s search area</small><b id="harrisVisible">—</b></div>
    <div class="stat"><small>Repeated · one-to-one within ${HARRIS_MATCH_TOLERANCE} px</small><b id="harrisRepeated">—</b></div>
  </div>
  <div class="note">Repeatability (slide 45) is the share of view-1 corners that land in view 2’s search area (inside the image, outside its skipped border band) and pair one-to-one with a view-2 corner within ${HARRIS_MATCH_TOLERANCE} px, measured in view-2 pixels. R depends only on the eigenvalues of M, so rotating the image moves its corners with it, up to resampling error. Adding a constant brightness changes no derivative, but multiplying contrast by a multiplies R by a⁴ (until pixels saturate), so a fixed threshold drops the weaker corners. The window σ is fixed in pixels, so zooming changes which structures look like corners: Harris is not scale invariant.</div>`;

  bindPhotoChooser('harrisPhotos');
  const update=()=>scheduleHarrisRender(experiment,token);
  HARRIS_CONTROLS.forEach(([id,key,format])=>bindRange(id,value=>{s[key]=value;update()},format));
  syncHarrisControls(s);
  $('#harrisPresets').onclick=event=>{
    const button=event.target.closest('button');if(!button)return;
    Object.assign(s,HARRIS_VIEW_PRESETS[button.dataset.harrisPreset]);
    syncHarrisControls(s);renderParameterGuide('harris');update();
  };
  $('#harrisReset').onclick=()=>{experiment.state={...HARRIS_DEFAULTS};experiment.mount();renderParameterGuide('harris');renderPseudocode('harris')};
  const probeAt=event=>{
    const target=event.target.closest('canvas'),view=harrisRuntime.view;if(!target||!view)return;
    const rect=target.getBoundingClientRect(),snap=Math.max(6,3*s.sigma);
    let x=clamp(Math.floor((event.clientX-rect.left)/rect.width*view.w),0,view.w-1),y=clamp(Math.floor((event.clientY-rect.top)/rect.height*view.h),0,view.h-1),nearest=null;
    for(const corner of harrisRuntime.corners??[]){const distance=Math.hypot(corner.x-x,corner.y-y);if(distance<=snap&&(!nearest||distance<nearest.distance))nearest={corner,distance}}
    if(nearest){x=nearest.corner.x;y=nearest.corner.y}
    s.probe={x:(x+.5)/view.w,y:(y+.5)/view.h};
    renderHarris(experiment);
  };
  $('#harrisSteps').addEventListener('click',probeAt);$('#harrisPrePost').addEventListener('click',probeAt);
  renderHarris(experiment);
}

function destroyHarris(){
  harrisRuntime.token++;
  if(harrisRuntime.raf)cancelAnimationFrame(harrisRuntime.raf);
  Object.assign(harrisRuntime,{raf:0,view:null,firstKey:'',first:null,secondKey:'',second:null,corners:null});
}

function syncHarrisControls(s){
  HARRIS_CONTROLS.forEach(([id,key,format])=>{$('#'+id).value=s[key];$('#'+id+'Out').textContent=format(s[key])});
}

function scheduleHarrisRender(experiment,token){
  if(harrisRuntime.raf)cancelAnimationFrame(harrisRuntime.raf);
  harrisRuntime.raf=requestAnimationFrame(()=>{
    harrisRuntime.raf=0;
    if(token===harrisRuntime.token&&state.active==='harris')renderHarris(experiment);
  });
}

function prepareHarrisView(){
  const g=workingGray(HARRIS_WORKING_SIZE),gray=new Float32Array(g.data.length);
  for(let i=0;i<gray.length;i++)gray[i]=g.data[i]/255;
  return{canvas:g.canvas,gray,w:g.w,h:g.h};
}

// Steps 1-2 on intensities in [0, 1]: Sobel gradients, the Gaussian-weighted sums that form
// M = [[a, b], [b, c]], and R = det(M) - k trace(M)^2 (scikit-image's corner_harris).
function harrisResponse(gray,w,h,sigma,k){
  const gradient=sobelField(gray,w,h),n=w*h,xx=new Float32Array(n),xy=new Float32Array(n),yy=new Float32Array(n);
  for(let i=0;i<n;i++){const gx=gradient.gx[i],gy=gradient.gy[i];xx[i]=gx*gx;xy[i]=gx*gy;yy[i]=gy*gy}
  const a=gaussian(xx,w,h,sigma),b=gaussian(xy,w,h,sigma),c=gaussian(yy,w,h,sigma),response=new Float32Array(n);
  let maxResponse=0;
  for(let i=0;i<n;i++){const trace=a[i]+c[i];response[i]=a[i]*c[i]-b[i]*b[i]-k*trace*trace;maxResponse=Math.max(maxResponse,response[i])}
  return{gradient,a,b,c,response,maxResponse};
}

// Steps 3-4: candidates exceed the absolute threshold, and a candidate survives non-maximum
// suppression only when no pixel in its (2r + 1) x (2r + 1) neighborhood has a larger R.
// Equal plateaus keep their first pixel in raster order.
function harrisPeaks(response,w,h,threshold,radius,eligible){
  const candidates=new Uint8Array(w*h),corners=[];let candidateCount=0;
  for(let i=0;i<response.length;i++)if(response[i]>threshold&&eligible(i%w,Math.floor(i/w))){candidates[i]=1;candidateCount++}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const index=y*w+x;if(!candidates[index])continue;
    const value=response[index];let peak=true;
    for(let dy=-radius;dy<=radius&&peak;dy++)for(let dx=-radius;dx<=radius;dx++){
      const xx=x+dx,yy=y+dy;if((!dx&&!dy)||xx<0||yy<0||xx>=w||yy>=h)continue;
      const neighbor=yy*w+xx,other=response[neighbor];
      if(other>value||(other===value&&neighbor<index)){peak=false;break}
    }
    if(peak)corners.push({x,y,response:value});
  }
  return{candidates,candidateCount,corners};
}

// Exclude a border wide enough that the Gaussian window never reaches the padded image edge or,
// in the second view, the grey background around the rotated image, and that every NMS
// neighborhood lies inside the image (scikit-image's corner_peaks also excludes min_distance).
function harrisMargin(s){return Math.max(s.nms,Math.ceil(3*s.sigma)+2)}

function harrisSecondView(view,{rotation,scale,contrast}){
  const angle=rotation*Math.PI/180,factor=scale/100,cos=Math.cos(angle),sin=Math.sin(angle),gain=contrast/100;
  const w=Math.max(1,Math.ceil(Math.abs(view.w*factor*cos)+Math.abs(view.h*factor*sin)-1e-6)),h=Math.max(1,Math.ceil(Math.abs(view.w*factor*sin)+Math.abs(view.h*factor*cos)-1e-6));
  const surface=document.createElement('canvas');surface.width=w;surface.height=h;
  const context=surface.getContext('2d',{willReadFrequently:true});
  context.fillStyle='#808080';context.fillRect(0,0,w,h);
  context.setTransform(factor*cos,factor*sin,-factor*sin,factor*cos,w/2,h/2);
  context.drawImage(view.canvas,-view.w/2,-view.h/2);
  context.setTransform(1,0,0,1,0,0);
  const image=context.getImageData(0,0,w,h),data=image.data,gray=new Float32Array(w*h);
  // Contrast saturates each channel as the displayed copy does; the detector's grey is the luminance of
  // those channels (unrounded), which equals 128 + gain·(L − 128) whenever no channel clips.
  for(let i=0,p=0;i<data.length;i+=4,p++){
    const r=clamp(128+gain*(data[i]-128)),g=clamp(128+gain*(data[i+1]-128)),b=clamp(128+gain*(data[i+2]-128));
    gray[p]=(.299*r+.587*g+.114*b)/255;data[i]=r;data[i+1]=g;data[i+2]=b;
  }
  context.putImageData(image,0,0);
  const centerX=view.w/2,centerY=view.h/2;
  return{
    canvas:surface,gray,w,h,factor,
    toSecond(x,y){const dx=x+.5-centerX,dy=y+.5-centerY;return{x:w/2+factor*(cos*dx-sin*dy)-.5,y:h/2+factor*(sin*dx+cos*dy)-.5}},
    // Distance, in second-view pixels, from (x, y) to the border of the transformed first image.
    insideFirst(x,y){const dx=(x+.5-w/2)/factor,dy=(y+.5-h/2)/factor,fx=centerX+cos*dx+sin*dy-.5,fy=centerY-sin*dx+cos*dy-.5;return Math.min(fx,fy,view.w-1-fx,view.h-1-fy)*factor}
  };
}

// Repeated corners are paired one-to-one: the largest set of (view-1, view-2) pairs within the
// tolerance (augmenting paths, nearest candidates first), so no view-2 corner confirms two view-1 corners.
// The 1e-6 slack keeps corners exactly on the margin after the forward and inverse mapping.
function matchHarrisCorners(firstCorners,secondCorners,second,margin){
  const firstMatched=new Uint8Array(firstCorners.length),secondMatched=new Uint8Array(secondCorners.length),owner=new Int32Array(secondCorners.length).fill(-1),options=firstCorners.map(()=>[]);let visible=0,repeated=0;
  firstCorners.forEach((corner,index)=>{
    const position=second.toSecond(corner.x,corner.y);
    if(second.insideFirst(position.x,position.y)<margin-1e-6)return;
    visible++;
    secondCorners.forEach((other,otherIndex)=>{const distance=Math.hypot(other.x-position.x,other.y-position.y);if(distance<=HARRIS_MATCH_TOLERANCE)options[index].push([distance,otherIndex])});
    options[index].sort((a,b)=>a[0]-b[0]);
  });
  const augment=(index,seen)=>{for(const [,other] of options[index]){if(seen[other])continue;seen[other]=1;if(owner[other]<0||augment(owner[other],seen)){owner[other]=index;return true}}return false};
  options.forEach((list,index)=>{if(list.length&&augment(index,new Uint8Array(secondCorners.length)))repeated++});
  owner.forEach((index,other)=>{if(index>=0){firstMatched[index]=1;secondMatched[other]=1}});
  return{visible,repeated,firstMatched,secondMatched};
}

function harrisEigen(a,b,c){const mean=(a+c)/2,radius=Math.hypot((a-c)/2,b);return[mean+radius,Math.max(0,mean-radius)]}
function harrisClass(response,threshold){return response>threshold?'corner':response<-threshold?'edge':'flat'}
function harrisNumber(value){const size=Math.abs(value);return !size?'0':size<1e-3||size>=1e4?value.toExponential(2):String(Number(value.toPrecision(3)))}
function harrisRamp(stops,t){const x=clamp(t,0,1)*(stops.length-1),i=Math.min(stops.length-2,Math.floor(x)),f=x-i;return stops[i].map((value,k)=>value+(stops[i+1][k]-value)*f)}
function setHarrisMeta(id,text){const meta=$('#'+id)?.closest('.card')?.querySelector('figcaption small');if(meta)meta.textContent=text}
function harrisDotRadius(target){return Math.max(2,Math.min(target.width,target.height)/150)}

// Comparison views use larger markers: filled red = repeated, yellow ring with a dark halo = this view only.
function drawHarrisCorners(id,source,corners,matched=null,markerRadius=null){
  const target=canvas(id,source),context=target.getContext('2d'),radius=markerRadius??harrisDotRadius(target);
  corners.forEach((corner,index)=>{
    context.beginPath();context.arc(corner.x+.5,corner.y+.5,radius,0,Math.PI*2);
    if(!matched||matched[index]){context.fillStyle='#ff1f1f';context.fill();context.strokeStyle='rgba(255,255,255,.85)';context.lineWidth=1;context.stroke()}
    else{context.strokeStyle='rgba(0,0,0,.8)';context.lineWidth=3.5;context.stroke();context.strokeStyle='#facc15';context.lineWidth=1.8;context.stroke()}
  });
  return target;
}

function drawHarrisResponseMap(id,response,w,h){
  let maxAbs=0;for(const value of response)maxAbs=Math.max(maxAbs,Math.abs(value));
  const image=new ImageData(w,h),scale=1/(maxAbs||1);
  for(let i=0;i<response.length;i++){
    // R grows with the fourth power of contrast; the fourth root keeps weaker structure visible.
    const value=response[i],t=Math.sqrt(Math.sqrt(Math.abs(value)*scale)),color=harrisRamp(value>=0?HARRIS_CORNER_RAMP:HARRIS_EDGE_RAMP,t),p=i*4;
    image.data[p]=color[0];image.data[p+1]=color[1];image.data[p+2]=color[2];image.data[p+3]=255;
  }
  put(id,image);
}

// Steps 3-4 darken and hatch the border band where corners are skipped (harrisMargin).
function drawHarrisBorderBand(context,w,h,margin){
  context.save();context.beginPath();context.rect(0,0,w,h);context.rect(margin,margin,w-2*margin,h-2*margin);context.clip('evenodd');
  context.fillStyle='rgba(0,0,0,.5)';context.fillRect(0,0,w,h);context.strokeStyle='rgba(255,255,255,.28)';context.lineWidth=1;context.beginPath();
  for(let d=-h;d<w;d+=6){context.moveTo(d,h);context.lineTo(d+h,0)}context.stroke();context.restore();
  context.save();context.setLineDash([4,3]);context.strokeStyle='rgba(255,255,255,.8)';context.lineWidth=1;context.strokeRect(margin-.5,margin-.5,w-2*margin+1,h-2*margin+1);context.restore();
}
function drawHarrisCandidates(id,gray,w,h,candidates,margin,corners=null){
  const image=new ImageData(w,h),candidateColor=corners?[150,120,40]:[255,200,0];
  for(let i=0;i<gray.length;i++){
    const p=i*4,base=40+gray[i]*95;
    if(candidates[i]){image.data[p]=candidateColor[0];image.data[p+1]=candidateColor[1];image.data[p+2]=candidateColor[2]}
    else image.data[p]=image.data[p+1]=image.data[p+2]=base;
    image.data[p+3]=255;
  }
  const target=put(id,image);
  drawHarrisBorderBand(target.getContext('2d'),w,h,margin);
  if(corners){
    const context=target.getContext('2d'),radius=harrisDotRadius(target);
    context.fillStyle='#ff1f1f';context.strokeStyle='#fff';context.lineWidth=1;
    corners.forEach(corner=>{context.beginPath();context.arc(corner.x+.5,corner.y+.5,radius,0,Math.PI*2);context.fill();context.stroke()});
  }
}

function drawHarrisProbe(target,probe,sigma){
  const context=target.getContext('2d'),radius=Math.max(2,3*sigma),x=probe.x+.5,y=probe.y+.5,arm=radius+8;
  [['rgba(0,0,0,.75)',3.5],['#fff',1.5]].forEach(([color,width])=>{
    context.strokeStyle=color;context.lineWidth=width;context.beginPath();
    context.arc(x,y,radius,0,Math.PI*2);
    context.moveTo(x-arm,y);context.lineTo(x-radius-2,y);context.moveTo(x+radius+2,y);context.lineTo(x+arm,y);
    context.moveTo(x,y-arm);context.lineTo(x,y-radius-2);context.moveTo(x,y+radius+2);context.lineTo(x,y+arm);
    context.stroke();
  });
}

function harrisProbe(s,view,corners){
  if(!s.probe){
    const strongest=corners.reduce((best,corner)=>!best||corner.response>best.response?corner:best,null);
    s.probe=strongest?{x:(strongest.x+.5)/view.w,y:(strongest.y+.5)/view.h}:{x:.5,y:.5};
  }
  return{x:clamp(Math.floor(s.probe.x*view.w),0,view.w-1),y:clamp(Math.floor(s.probe.y*view.h),0,view.h-1)};
}

function renderHarrisInspector(first,probe,s,threshold,margin,corners){
  const view=harrisRuntime.view,index=probe.y*view.w+probe.x,a=first.a[index],b=first.b[index],c=first.c[index];
  const [lambda1,lambda2]=harrisEigen(a,b,c),det=a*c-b*b,trace=a+c,response=det-s.k*trace*trace,kind=harrisClass(response,threshold);
  $('#harrisProbeMeta').textContent=`window centered at (${probe.x}, ${probe.y}) · σ = ${s.sigma}`;
  [['harrisMxx',a],['harrisMxy',b],['harrisMyx',b],['harrisMyy',c],['harrisLambda1',lambda1],['harrisLambda2',lambda2],['harrisDet',det],['harrisTrace',trace],['harrisR',response],['harrisT',threshold]].forEach(([id,value])=>{$('#'+id).textContent=harrisNumber(value)});
  const ratio=lambda1?lambda2/lambda1:0,kept=corners.some(corner=>corner.x===probe.x&&corner.y===probe.y),eligible=Math.min(probe.x,probe.y,view.w-1-probe.x,view.h-1-probe.y)>=margin;
  const verdict=$('#harrisVerdict');verdict.className=`harris-verdict ${kind}`;
  if(kind==='corner')verdict.textContent=`Corner: λ₂ = ${ratio.toFixed(2)} λ₁, so the window changes when shifted in any direction and R exceeds t. ${!eligible?`It lies within ${margin} px of the border, so it is not eligible.`:kept?'It is the largest R in its neighborhood and survives non-maximum suppression.':'A neighbor within the NMS radius has a larger R, so non-maximum suppression removes it.'}`;
  else if(kind==='edge')verdict.textContent=`Edge: λ₂ = ${ratio.toFixed(2)} λ₁. The window changes only when shifted across the edge, so R < −t.`;
  // A pure edge (λ₂ = 0) has R = −κλ₁², so λ₁ ≤ √(t/κ) can never reach R < −t: both eigenvalues are too small to register.
  else{const edgeLimit=Math.sqrt(threshold/s.k);verdict.textContent=lambda1<=edgeLimit?`Flat: λ₁ = ${harrisNumber(lambda1)} is below √(t/κ) = ${harrisNumber(edgeLimit)}, so even a perfect edge this weak would not reach R < −t, and λ₂ is too small for R > t. Shifting the window changes it too little to count.`:`Between edge and corner: λ₂ = ${ratio.toFixed(2)} λ₁. λ₂ is too large for R to drop below −t and too small for R to exceed t, so R falls in the band |R| ≤ t around 0 and the window counts as neither edge nor corner.`}
  return{lambda1,lambda2,kind};
}

function sampleHarrisEigenvalues(first,w,h,margin){
  const step=Math.max(1,Math.round(Math.sqrt(w*h/2400))),points=[];
  for(let y=margin;y<h-margin;y+=step)for(let x=margin;x<w-margin;x+=step){const i=y*w+x;points.push(harrisEigen(first.a[i],first.b[i],first.c[i]))}
  points.step=step;return points;
}

function drawHarrisPlane(target,samples,probe,k,threshold){
  const dpr=devicePixelRatio||1,width=target.clientWidth||460,height=target.clientHeight||300;
  target.width=Math.round(width*dpr);target.height=Math.round(height*dpr);
  const context=target.getContext('2d'),margin={left:44,right:16,top:14,bottom:36},plotW=width-margin.left-margin.right,plotH=height-margin.top-margin.bottom;
  context.setTransform(dpr,0,0,dpr,0,0);context.fillStyle='#fff';context.fillRect(0,0,width,height);
  let maxLambda=probe.lambda1;for(const point of samples)maxLambda=Math.max(maxLambda,point[0]);
  const extent=Math.sqrt(maxLambda*1.08)||1,toX=value=>margin.left+Math.sqrt(Math.max(0,value))/extent*plotW,toY=value=>margin.top+plotH-Math.sqrt(Math.max(0,value))/extent*plotH;
  const region=context.createImageData(Math.max(1,Math.round(plotW*dpr)),Math.max(1,Math.round(plotH*dpr)));
  for(let py=0;py<region.height;py++)for(let px=0;px<region.width;px++){
    const u=(px+.5)/region.width*extent,v=(1-(py+.5)/region.height)*extent,lambda1=u*u,lambda2=v*v,trace=lambda1+lambda2;
    // λ₁ is the larger eigenvalue, so only the half-plane below the diagonal is reachable.
    const color=lambda2>lambda1?[255,255,255]:HARRIS_REGION_COLORS[harrisClass(lambda1*lambda2-k*trace*trace,threshold)],p=(py*region.width+px)*4;
    region.data[p]=color[0];region.data[p+1]=color[1];region.data[p+2]=color[2];region.data[p+3]=255;
  }
  context.putImageData(region,Math.round(margin.left*dpr),Math.round(margin.top*dpr));
  context.strokeStyle='#b8bcc4';context.lineWidth=1;context.strokeRect(margin.left+.5,margin.top+.5,plotW-1,plotH-1);
  context.setLineDash([4,4]);context.strokeStyle='#9aa0aa';context.beginPath();context.moveTo(margin.left,margin.top+plotH);context.lineTo(margin.left+plotW,margin.top);context.stroke();context.setLineDash([]);
  context.fillStyle='rgba(40,40,40,.35)';
  for(const [lambda1,lambda2] of samples)context.fillRect(toX(lambda1)-1,toY(lambda2)-1,2,2);
  const x=toX(probe.lambda1),y=toY(probe.lambda2);
  context.lineWidth=2.5;context.strokeStyle='#fff';context.beginPath();context.arc(x,y,6,0,Math.PI*2);context.stroke();
  context.lineWidth=1.5;context.strokeStyle='#111';context.stroke();
  context.fillStyle={corner:'#d92323',edge:'#315ee7',flat:'#777'}[probe.kind];context.beginPath();context.arc(x,y,3,0,Math.PI*2);context.fill();
  context.fillStyle='#666';context.font='10px ui-monospace, monospace';context.textAlign='center';
  context.fillText('λ₁ · larger eigenvalue (√ scale)',margin.left+plotW/2,height-8);
  context.save();context.translate(13,margin.top+plotH/2);context.rotate(-Math.PI/2);context.fillText('λ₂ · smaller (√ scale)',0,0);context.restore();
  context.textAlign='right';context.fillText('0',margin.left-4,margin.top+plotH+12);context.fillText(harrisNumber(extent*extent),margin.left+plotW,margin.top+plotH+12);context.fillText(harrisNumber(extent*extent),margin.left-4,margin.top+9);
  context.save();context.translate(margin.left+plotW*.72,margin.top+plotH*.28-6);context.rotate(-Math.atan2(plotH,plotW));context.textAlign='center';context.fillText('λ₁ = λ₂',0,0);context.restore();
  context.textAlign='left';context.fillStyle='#9a9a9a';context.fillText('λ₂ ≤ λ₁ by definition',margin.left+8,margin.top+16);
}

function renderHarris(experiment){
  const started=performance.now(),s=experiment.state,runtime=harrisRuntime;
  if(!runtime.view)runtime.view=prepareHarrisView();
  const view=runtime.view,{w,h}=view,detectorKey=`${s.sigma}|${s.k}`,secondKey=`${detectorKey}|${s.rotation}|${s.scale}|${s.contrast}`;
  if(runtime.firstKey!==detectorKey){runtime.first=harrisResponse(view.gray,w,h,s.sigma,s.k);runtime.firstKey=detectorKey}
  if(runtime.secondKey!==secondKey){
    const second=harrisSecondView(view,s);
    second.analysis=harrisResponse(second.gray,second.w,second.h,s.sigma,s.k);
    runtime.second=second;runtime.secondKey=secondKey;
  }
  const first=runtime.first,second=runtime.second,margin=harrisMargin(s),threshold=s.threshold/100*first.maxResponse;
  const firstPeaks=harrisPeaks(first.response,w,h,threshold,s.nms,(x,y)=>Math.min(x,y,w-1-x,h-1-y)>=margin);
  const secondPeaks=harrisPeaks(second.analysis.response,second.w,second.h,threshold,s.nms,(x,y)=>second.insideFirst(x,y)>=margin);
  const match=matchHarrisCorners(firstPeaks.corners,secondPeaks.corners,second,margin),probe=harrisProbe(s,view,firstPeaks.corners);
  runtime.corners=firstPeaks.corners;

  canvas('harrisPre',view.canvas);
  drawHarrisCorners('harrisPost',view.canvas,firstPeaks.corners);
  renderSobelOrientation('harrisGradient',first.gradient,w,h);
  drawHarrisResponseMap('harrisResponse',first.response,w,h);
  drawHarrisCandidates('harrisCandidates',view.gray,w,h,firstPeaks.candidates,margin);
  drawHarrisCandidates('harrisMaxima',view.gray,w,h,firstPeaks.candidates,margin,firstPeaks.corners);
  ['harrisPost','harrisGradient','harrisResponse','harrisCandidates','harrisMaxima'].forEach(id=>drawHarrisProbe($('#'+id),probe,s.sigma));
  const probed=renderHarrisInspector(first,probe,s,threshold,margin,firstPeaks.corners);
  const samples=sampleHarrisEigenvalues(first,w,h,margin);
  drawHarrisPlane($('#harrisPlane'),samples,probed,s.k,threshold);
  $('#harrisPlaneMeta').textContent=`√ axes · grey dots = windows every ${samples.step} px`;
  // Same CSS scale for both views, so zooming visibly changes the size.
  const widest=Math.max(w,second.w);
  const markerRadius=Math.max(3.5,Math.max(w,h)/130);
  [[drawHarrisCorners('harrisFirstView',view.canvas,firstPeaks.corners,match.firstMatched,markerRadius),w],[drawHarrisCorners('harrisSecondView',second.canvas,secondPeaks.corners,match.secondMatched,markerRadius),second.w]].forEach(([target,width])=>{target.style.width=`${width/widest*100}%`;target.style.maxHeight='none'});

  const count=firstPeaks.corners.length,rate=match.visible?Math.round(match.repeated/match.visible*100):0;
  setHarrisMeta('harrisPost',`${count} corners`);
  setHarrisMeta('harrisPre',`${w} × ${h} working copy`);
  setHarrisMeta('harrisCandidates',`${firstPeaks.candidateCount.toLocaleString()} px with R > t · ${margin}-px border skipped`);
  setHarrisMeta('harrisMaxima',`${count} local maxima kept`);
  setHarrisMeta('harrisFirstView',`${count} corners · ${w} × ${h}`);
  setHarrisMeta('harrisSecondView',`${s.rotation}° · ${s.scale}% · contrast ${s.contrast}% · ${secondPeaks.corners.length} corners`);
  $('#harrisCountFirst').textContent=count;
  $('#harrisCountSecond').textContent=secondPeaks.corners.length;
  $('#harrisVisible').textContent=match.visible;
  $('#harrisRepeated').textContent=match.visible?`${match.repeated} (${rate}%)`:'—';
  $('#harrisRepeatSummary').textContent=match.visible?`${rate}% repeatability`:'No comparable corners';
  $$('#harrisPresets button').forEach(button=>{const preset=HARRIS_VIEW_PRESETS[button.dataset.harrisPreset];button.classList.toggle('active',Object.keys(preset).every(key=>preset[key]===s[key]))});
  $('#harrisStatus').textContent=`${count} corners from ${firstPeaks.candidateCount.toLocaleString()} candidates · updated in ${Math.round(performance.now()-started)} ms`;
  state.output=$('#harrisPost');
}

// Photographs offered directly on the keypoint pages; choosing one replaces the toolbar image.
const PHOTO_CHOICES=[
  {url:'images/spanish steps.jpeg',thumb:'images/thumbs/spanish-steps.jpg',label:'Spanish Steps'},
  {url:'images/utown_crop.png',thumb:'images/thumbs/utown.jpg',label:'UTown towers'},
  {url:'images/cove.jpg',thumb:'images/thumbs/cove.jpg',label:'Cove'},
  {url:'images/Corridor_crop.png',thumb:'images/thumbs/corridor.jpg',label:'Corridor'},
  {url:'images/Screenshot 2026-07-29 at 09.39.17.png',thumb:'images/thumbs/giraffe.jpg',label:'Giraffe'},
  {url:'images/Plains_Zebra_Equus_quagga_cropped.jpg',thumb:'images/thumbs/zebra.jpg',label:'Zebra'},
  {url:'images/lecture4/scale/sunflowers.jpg',thumb:'images/thumbs/sunflowers.jpg',label:'Sunflowers'}
];
let naturalPhotoApplied=false;

function photoChooser(id){
  return `<div class="photo-chooser" id="${id}" role="group" aria-label="Choose the image"><span>Image</span>${PHOTO_CHOICES.map(photo=>`<button type="button" data-url="${photo.url}" class="${state.url===photo.url?'active':''}" aria-pressed="${state.url===photo.url}"><img src="${photo.thumb}" alt="" loading="lazy"><em>${photo.label}</em></button>`).join('')}<button type="button" data-action="sample" class="${state.url==='sample'?'active':''}" aria-pressed="${state.url==='sample'}"><b>CV</b><em>Sample</em></button><button type="button" data-action="upload"><b>⤒</b><em>Upload…</em></button></div>`;
}
function bindPhotoChooser(id){
  $('#'+id).onclick=event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.url){if(button.dataset.url!==state.url)loadBundledImage(button.dataset.url,null,PHOTO_CHOICES.find(photo=>photo.url===button.dataset.url)?.label)}
    else if(button.dataset.action==='sample'){if(state.url!=='sample')sample()}
    else $('#fileInput').click();
  };
}
// The built-in synthetic sample has too few corners for these pages, so the first visit swaps in
// a photograph once, unless the user picked the sample from the toolbar; afterwards the user's
// choice, including the synthetic sample, is kept.
function ensureNaturalPhoto(url){
  if(naturalPhotoApplied||state.url!=='sample')return false;
  naturalPhotoApplied=true;
  root.innerHTML='<div class="note">Loading a photograph…</div>';
  loadBundledImage(url,null,PHOTO_CHOICES.find(photo=>photo.url===url)?.label).catch(error=>{console.warn(error);activeExperiment()?.mount()});
  return true;
}

const ANMS_WORKING_SIZE=480;
const ANMS_GRID=[8,6],ANMS_MIN_BUDGET=50;
const anmsRuntime={token:0,view:null,points:null,order:null,radii:null,suppressor:null,robustness:null};

function mountAnms(experiment){
  destroyAnms();
  if(ensureNaturalPhoto('images/cove.jpg'))return;
  const s=experiment.state;
  root.innerHTML=`${photoChooser('anmsPhotos')}
  <div class="controls">
    ${controlRange('anmsBudget','Keypoints kept · N',ANMS_MIN_BUDGET,600,s.budget,10)}
    ${controlRange('anmsRobust','“Significantly stronger” factor · c',1,1.5,s.robustness,.05)}
  </div>
  <div class="anms-intro">
    <section class="gabor-formula anms-formula" aria-label="Suppression radius">
      <span class="gabor-kicker">Slide 26 · Brown, Szeliski &amp; Winder 2005</span>
      <div class="gabor-equation"><i>r<sub>i</sub></i> = min<sub><i>j</i> : <i>R<sub>j</sub></i> &gt; <i>c R<sub>i</sub></i></sub> ‖<b>x</b><sub><i>i</i></sub> − <b>x</b><sub><i>j</i></sub>‖</div>
      <p>Candidates are Harris local maxima (3 × 3 neighborhood, R above 0.01% of the strongest response, at least 6 px from the border). A candidate’s radius is the distance to the nearest <b>significantly stronger</b> candidate, one whose response exceeds c times its own. ANMS keeps the N candidates with the largest radii. Points that no candidate beats by a factor c, including the strongest corner, get r = ∞ and rank first. The r in each ANMS caption is the smallest kept radius, not a spacing: every kept point is at least r from any significantly stronger candidate, but two kept corners of similar strength can sit closer than r. Larger c makes such pairs more common and the spread less even; at c = 1, kept points of different strength are always at least r apart.</p>
    </section>
    <section class="harris-inspector anms-inspector" aria-live="polite"><header><b>Selected candidate</b><small id="anmsPickMeta">click a point in any panel</small></header><p class="harris-verdict" id="anmsPickText">Click a point in any panel.</p><p class="anms-key">In (c) and (d) the dashed circle is the selected point’s suppression radius and the line joins it to the significantly stronger candidate that sets it (cyan square). In every panel a yellow ring means that panel keeps the selected point and a red ring means it drops it. Faint lines mark the grid cells used for coverage.</p></section>
  </div>
  <div class="gabor-section-title harris-section-title"><div><b>Strongest N versus adaptive NMS</b><small>All four panels use the same Harris candidates; click any point to inspect it. Grid coverage counts how many of the ${ANMS_GRID[0]} × ${ANMS_GRID[1]} image cells contain at least one keypoint. Coordinates and radii are in pixels of the working image.</small></div><span id="anmsStatus" role="status">Computing…</span></div>
  <div class="note anms-warning" id="anmsWarning" hidden></div>
  <div class="results four picker" id="anmsPanels">
    ${card('anmsStrongA','(a) Strongest N','—')}
    ${card('anmsStrongB','(b) Strongest 2N','—')}
    ${card('anmsAdaptA','(c) ANMS N','—')}
    ${card('anmsAdaptB','(d) ANMS 2N','—')}
  </div>
  <div class="note">Selecting only the strongest responses piles keypoints onto high-contrast texture such as foliage and rocks and leaves smooth regions empty. ANMS spreads the same budget across the image, which gives later matching and alignment more evenly distributed constraints. The radius r in each ANMS caption is the smallest radius that still made the cut.</div>`;
  bindPhotoChooser('anmsPhotos');
  bindRange('anmsBudget',value=>{s.budget=value;renderAnms(experiment)});
  bindRange('anmsRobust',value=>{s.robustness=value;renderAnms(experiment)},value=>(+value).toFixed(2));
  $('#anmsRobustOut').textContent=s.robustness.toFixed(2);
  $('#anmsPanels').addEventListener('click',event=>{
    const target=event.target.closest('canvas');if(!target||!anmsRuntime.points||!['anmsAdaptA','anmsAdaptB','anmsStrongA','anmsStrongB'].includes(target.id))return;
    const rect=target.getBoundingClientRect(),view=anmsRuntime.view,x=(event.clientX-rect.left)/rect.width*view.w,y=(event.clientY-rect.top)/rect.height*view.h,shown=anmsShown(target.id,experiment.state);
    let best=-1,distance=14;shown.forEach(i=>{const p=anmsRuntime.points[i],d=Math.hypot(p.x-x,p.y-y);if(d<distance){distance=d;best=i}});
    if(best>=0){s.selected={x:anmsRuntime.points[best].x,y:anmsRuntime.points[best].y};renderAnms(experiment)}
  });
  renderAnms(experiment);
}

function destroyAnms(){anmsRuntime.token++;Object.assign(anmsRuntime,{view:null,points:null,order:null,radii:null,suppressor:null,robustness:null})}

function prepareAnms(){
  const g=workingGray(ANMS_WORKING_SIZE),gray=new Float32Array(g.data.length);
  for(let i=0;i<gray.length;i++)gray[i]=g.data[i]/255;
  const field=harrisResponse(gray,g.w,g.h,1.5,.05),margin=6;
  // Candidates are Harris local maxima in a 3 x 3 neighborhood above 0.01% of the strongest response,
  // low enough that weak but isolated corners in smooth regions are available to ANMS.
  const points=harrisPeaks(field.response,g.w,g.h,1e-4*field.maxResponse,1,(x,y)=>Math.min(x,y,g.w-1-x,g.h-1-y)>=margin).corners;
  points.sort((a,b)=>b.response-a.response);
  return{view:{canvas:g.canvas,w:g.w,h:g.h},points:points.slice(0,4000)};
}

// Points are sorted by decreasing response, so the significantly stronger set is a prefix.
function suppressionRadii(points,robustness){
  const n=points.length,radii=new Float64Array(n),suppressor=new Int32Array(n).fill(-1);
  for(let i=0;i<n;i++){
    // Squared integer distances compare exactly, so equal radii tie-break by response (as numpy's stable sort does).
    const threshold=robustness*points[i].response;let best=Infinity,who=-1;
    for(let j=0;j<n&&points[j].response>threshold;j++){const dx=points[i].x-points[j].x,dy=points[i].y-points[j].y,d=dx*dx+dy*dy;if(d<best){best=d;who=j}}
    radii[i]=Math.sqrt(best);suppressor[i]=who;
  }
  const order=Array.from({length:n},(_,i)=>i).sort((a,b)=>radii[b]-radii[a]||points[b].response-points[a].response);
  return{radii,suppressor,order};
}

function anmsShown(id,s){
  const n=anmsRuntime.points.length,N=Math.min(s.budget,n),N2=Math.min(2*s.budget,n),strongest=k=>Array.from({length:k},(_,i)=>i);
  return{anmsStrongA:strongest(N),anmsStrongB:strongest(N2),anmsAdaptA:anmsRuntime.order.slice(0,N),anmsAdaptB:anmsRuntime.order.slice(0,N2)}[id];
}

function anmsCoverage(indices){
  const [cols,rows]=ANMS_GRID,{w,h}=anmsRuntime.view,filled=new Set();
  indices.forEach(i=>{const p=anmsRuntime.points[i];filled.add(Math.min(rows-1,Math.floor(p.y/h*rows))*cols+Math.min(cols-1,Math.floor(p.x/w*cols)))});
  return filled.size/(cols*rows);
}

function renderAnms(experiment){
  const s=experiment.state,started=performance.now();
  if(!anmsRuntime.view){const prepared=prepareAnms();anmsRuntime.view=prepared.view;anmsRuntime.points=prepared.points}
  if(anmsRuntime.robustness!==s.robustness){Object.assign(anmsRuntime,suppressionRadii(anmsRuntime.points,s.robustness));anmsRuntime.robustness=s.robustness}
  // Start on a typical point that ANMS keeps and strongest-N drops (median response rank among them),
  // not the weakest one, which is often a near-noise candidate in a smooth region.
  if(!s.selected&&anmsRuntime.order.length){const N=Math.min(s.budget,anmsRuntime.points.length),kept=anmsRuntime.order.slice(0,N),gained=kept.filter(i=>i>=N).sort((a,b)=>a-b),pick=gained.length?gained[Math.floor((gained.length-1)/2)]:Math.max(...kept);s.selected={x:anmsRuntime.points[pick].x,y:anmsRuntime.points[pick].y}}
  const {points,radii,suppressor,view}=anmsRuntime,n=points.length,selected=s.selected?points.reduce((best,p,i)=>{const d=Math.hypot(p.x-s.selected.x,p.y-s.selected.y);return d<best.d?{i,d}:best},{i:-1,d:2}).i:-1;
  const panels=[['anmsStrongA',`(a) Strongest ${Math.min(s.budget,n)}`],['anmsStrongB',`(b) Strongest ${Math.min(2*s.budget,n)}`],['anmsAdaptA',`(c) ANMS ${Math.min(s.budget,n)}`],['anmsAdaptB',`(d) ANMS ${Math.min(2*s.budget,n)}`]];
  panels.forEach(([id,title])=>{
    const indices=anmsShown(id,s),adaptive=id.startsWith('anmsAdapt'),target=canvas(id,view.canvas),ctx=target.getContext('2d'),r=Math.max(2.2,view.w/190);
    ctx.fillStyle='rgba(0,0,0,.25)';ctx.fillRect(0,0,view.w,view.h);
    const keep=new Set(indices),[cols,rows]=ANMS_GRID;
    ctx.strokeStyle='rgba(255,255,255,.22)';ctx.lineWidth=1;ctx.beginPath();for(let i=1;i<cols;i++){const x=Math.round(i*view.w/cols)+.5;ctx.moveTo(x,0);ctx.lineTo(x,view.h)}for(let j=1;j<rows;j++){const y=Math.round(j*view.h/rows)+.5;ctx.moveTo(0,y);ctx.lineTo(view.w,y)}ctx.stroke();
    if(selected>=0&&adaptive&&Number.isFinite(radii[selected])){const p=points[selected],q=points[suppressor[selected]],color=keep.has(selected)?'#facc15':'#ef4444';ctx.setLineDash([5,4]);ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x+.5,p.y+.5,radii[selected],0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(p.x+.5,p.y+.5);ctx.lineTo(q.x+.5,q.y+.5);ctx.stroke()}
    indices.forEach(i=>{const p=points[i];ctx.beginPath();ctx.arc(p.x+.5,p.y+.5,r,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.lineWidth=1.2;ctx.strokeStyle='#111';ctx.stroke()});
    if(selected>=0&&adaptive&&Number.isFinite(radii[selected])){const q=points[suppressor[selected]],side=2*r+4;ctx.lineWidth=2.5;ctx.strokeStyle='#22d3ee';ctx.strokeRect(q.x+.5-side/2,q.y+.5-side/2,side,side)}
    if(selected>=0){const p=points[selected];ctx.beginPath();ctx.arc(p.x+.5,p.y+.5,r+3,0,Math.PI*2);ctx.lineWidth=2.5;ctx.strokeStyle=keep.has(selected)?'#facc15':'#ef4444';ctx.stroke()}
    const coverage=anmsCoverage(indices),radius=adaptive&&indices.length?radii[indices.at(-1)]:null;
    $('#'+id).closest('.card').querySelector('figcaption span').textContent=adaptive&&radius!=null?`${title}, r = ${Number.isFinite(radius)?radius.toFixed(1):'∞'}`:title;
    setHarrisMeta(id,`coverage ${Math.round(coverage*100)}% of cells`);
  });
  if(selected>=0){
    const p=points[selected],rank=anmsRuntime.order.indexOf(selected)+1,strength=selected+1;
    $('#anmsPickMeta').textContent=`(${p.x}, ${p.y}) · response rank ${strength} · radius rank ${rank}`;
    const text=$('#anmsPickText');
    if(!Number.isFinite(radii[selected])){const kept=rank<=Math.min(s.budget,n);text.className=`harris-verdict ${kept?'kept':'dropped'}`;text.textContent=selected===0?'This is the strongest candidate in the image: no other point is stronger, so r = ∞ and ANMS always keeps it.':`No candidate is more than ${s.robustness.toFixed(2)}× stronger than this one (the strongest is only ${(points[0].response/p.response).toFixed(2)}× stronger), so r = ∞. Its radius ranks ${rank}, ${kept?'inside':'outside'} the ANMS budget of ${Math.min(s.budget,n)}${strength<=s.budget?`, and strongest-N keeps it too (response rank ${strength}).`:`, while strongest-N drops it (response rank ${strength}).`}`}
    else{const q=points[suppressor[selected]],ratio=q.response/p.response,kept=rank<=Math.min(s.budget,n);text.className=`harris-verdict ${kept?'kept':'dropped'}`;text.textContent=`r = ${radii[selected].toFixed(1)} px: the nearest candidate with R > ${s.robustness.toFixed(2)} × R(this) is at (${q.x}, ${q.y}), ${ratio.toFixed(2)}× stronger. ${kept?`Its radius ranks ${rank}, inside the ANMS budget of ${Math.min(s.budget,n)}`:`Its radius ranks ${rank}, outside the ANMS budget of ${Math.min(s.budget,n)}`}${strength<=s.budget?`, and strongest-N keeps it too (response rank ${strength}).`:`, while strongest-N drops it (response rank ${strength}).`}`}
  }
  const ceiling=Math.round(anmsCoverage(points.map((_,i)=>i))*100),warning=$('#anmsWarning');
  $('#anmsStatus').textContent=`${n.toLocaleString()} Harris candidates · all of them cover ${ceiling}% of cells · ${view.w} × ${view.h} px working image`;
  warning.hidden=2*s.budget<n;
  warning.textContent=n<=ANMS_MIN_BUDGET?`This image has only ${n} Harris candidates, so every panel shows all of them at any N and the two selections cannot differ. Choose a photograph.`:n<=2*ANMS_MIN_BUDGET+1?`This image has only ${n} Harris candidates, too few for a meaningful comparison: even at the smallest N = ${ANMS_MIN_BUDGET}, panels (b) and (d) show ${n<=2*ANMS_MIN_BUDGET?'every candidate':'all but one of them'}. Choose a photograph.`:`This image has only ${n} Harris candidates, so ${s.budget>=n?'all four panels show every candidate':'panels (b) and (d) show every candidate'}. Lower N below ${Math.ceil(n/2)} to compare the two selections.`;
  state.output=$('#anmsAdaptA');
}

function heatColor(t){const stops=[[25,28,71],[38,90,170],[37,184,173],[245,210,72],[218,55,46]],x=t*(stops.length-1),i=Math.min(stops.length-2,Math.floor(x)),f=x-i;return stops[i].map((v,k)=>v+(stops[i+1][k]-v)*f)}
function workingGray(max=520){const scale=Math.min(1,max/Math.max(state.source.width,state.source.height)),w=Math.max(1,Math.round(state.source.width*scale)),h=Math.max(1,Math.round(state.source.height*scale)),c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(state.source,0,0,w,h);const pixels=ctx.getImageData(0,0,w,h).data,data=new Float32Array(w*h);for(let i=0,p=0;i<pixels.length;i+=4,p++)data[p]=.299*pixels[i]+.587*pixels[i+1]+.114*pixels[i+2];return{data,w,h,canvas:c}}
function convolveGray(data,w,h,kernel,size){const out=new Float32Array(w*h),p=Math.floor(size/2);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0,n=0;for(let ky=-p;ky<=p;ky++)for(let kx=-p;kx<=p;kx++){const xx=clamp(x+kx,0,w-1),yy=clamp(y+ky,0,h-1);sum+=data[yy*w+xx]*kernel[n++]}out[y*w+x]=sum}return out}
function gaussian(data,w,h,sigma){const radius=Math.max(1,Math.ceil(sigma*3)),kernel=[],den=2*sigma*sigma;let total=0;for(let i=-radius;i<=radius;i++){const v=Math.exp(-i*i/den);kernel.push(v);total+=v}for(let i=0;i<kernel.length;i++)kernel[i]/=total;const tmp=new Float32Array(w*h),out=new Float32Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0;for(let k=-radius;k<=radius;k++)sum+=data[y*w+clamp(x+k,0,w-1)]*kernel[k+radius];tmp[y*w+x]=sum}for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0;for(let k=-radius;k<=radius;k++)sum+=tmp[clamp(y+k,0,h-1)*w+x]*kernel[k+radius];out[y*w+x]=sum}return out}
function sobelField(data,w,h){const gx=convolveGray(data,w,h,[-1,0,1,-2,0,2,-1,0,1],3),gy=convolveGray(data,w,h,[-1,-2,-1,0,0,0,1,2,1],3),mag=new Float32Array(w*h),angle=new Float32Array(w*h);for(let i=0;i<mag.length;i++){mag[i]=Math.hypot(gx[i],gy[i]);angle[i]=Math.atan2(gy[i],gx[i])}return{gx,gy,mag,angle}}
function scalarImage(id,values,w,h,signed=false){let max=0;for(const v of values)max=Math.max(max,Math.abs(v));const out=new ImageData(w,h),scale=(signed?127:255)/(max||1);for(let i=0;i<values.length;i++){const v=clamp((signed?128:0)+values[i]*scale);out.data[i*4]=out.data[i*4+1]=out.data[i*4+2]=v;out.data[i*4+3]=255}put(id,out)}
function responseImage(id,values,w,h,gain=1,signed=false){const out=new ImageData(w,h),base=signed?128:0,scale=gain*(signed?.25:1);for(let i=0;i<values.length;i++){const v=clamp(base+values[i]*scale);out.data[i*4]=out.data[i*4+1]=out.data[i*4+2]=v;out.data[i*4+3]=255}put(id,out)}
function binaryImage(id,values,w,h){const out=new ImageData(w,h);for(let i=0;i<values.length;i++){const v=values[i]?255:0;out.data[i*4]=out.data[i*4+1]=out.data[i*4+2]=v;out.data[i*4+3]=255}put(id,out)}
function cannyCompute(g,options){const smooth=gaussian(g.data,g.w,g.h,options.sigma),s=sobelField(smooth,g.w,g.h),nms=new Float32Array(s.mag.length),r=options.nms;for(let y=r;y<g.h-r;y++)for(let x=r;x<g.w-r;x++){const i=y*g.w+x,a=(s.angle[i]*180/Math.PI+180)%180;let dx=0,dy=0;if(a<22.5||a>=157.5)dx=1;else if(a<67.5){dx=1;dy=1}else if(a<112.5)dy=1;else{dx=1;dy=-1}let keep=true;for(let d=1;d<=r;d++)if(s.mag[i]<s.mag[(y+dy*d)*g.w+x+dx*d]||s.mag[i]<s.mag[(y-dy*d)*g.w+x-dx*d]){keep=false;break}if(keep)nms[i]=s.mag[i]}const edges=new Uint8Array(nms.length),queue=[];for(let i=0;i<nms.length;i++)if(nms[i]>=options.high){edges[i]=1;queue.push(i)}for(let q=0;q<queue.length;q++){const i=queue[q],x=i%g.w,y=Math.floor(i/g.w);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy,j=yy*g.w+xx;if(xx>=0&&yy>=0&&xx<g.w&&yy<g.h&&!edges[j]&&nms[j]>=options.low){edges[j]=1;queue.push(j)}}}return{mag:s.mag,nms,edges}}

// Copy padding reuses a border pixel. Mark that source with a dashed inset so
// the receptive-field visualization remains explicit at image boundaries.
const matrixExplorer=experiments.find(experiment=>experiment.id==='matrixExplorer');
matrixExplorer.select=function(index,result=this.compute()){
  this.state.selected=index;
  $$('.output-cell').forEach((button,i)=>button.classList.toggle('selected',i===index));
  this.clearHighlights();
  const info=result.fields[index];
  if(!info)return;
  info.field.forEach(cell=>{
    if(cell.y>=0&&cell.x>=0&&cell.y<5&&cell.x<5){
      const input=$(`#imageMatrix input[data-y="${cell.y}"][data-x="${cell.x}"]`);
      input?.classList.add('receptive');
      if(cell.padded)input?.classList.add('padded-source');
    }
  });
  $('#receptiveValues').innerHTML=info.field.map(cell=>`<span class="${cell.padded?'padded':''}">${formatNumber(cell.value)}</span>`).join('');
  $('#kernelValues').innerHTML=info.kernel.flat().map(value=>`<span>${formatNumber(value)}</span>`).join('');
  $('#productValues').innerHTML=info.products.map(value=>`<span>${formatNumber(value)}</span>`).join('');
  let running=0;
  $('#runningSum').innerHTML=info.products.map(value=>`<li>${formatNumber(running+=value)}</li>`).join('');
  const final=this.state.pooling==='none'?running:result.outputs[index];
  $('#finalSum').textContent=`Output = ${formatNumber(final)}`;
  $('#kernelCalcLabel').textContent=this.state.operation==='convolution'?'Flipped kernel':'Kernel';
};

function renderSobelOrientation(id,field,w,h){
  let maxMagnitude=0;
  for(const magnitude of field.mag)maxMagnitude=Math.max(maxMagnitude,magnitude);
  const out=new ImageData(w,h),normalizer=maxMagnitude||1;
  for(let i=0;i<field.angle.length;i++){
    const orientation=((field.angle[i]*180/Math.PI)+180)%180;
    const brightness=Math.sqrt(clamp(field.mag[i]/normalizer,0,1));
    const [r,g,b]=hsvRgb(orientation*2,1,brightness);
    out.data[i*4]=r;out.data[i*4+1]=g;out.data[i*4+2]=b;out.data[i*4+3]=255;
  }
  put(id,out);
}

const sobelExplorer=experiments.find(experiment=>experiment.id==='sobel');
sobelExplorer.mount=function(){
  root.innerHTML=`<div class="controls">${controlRange('sobelScale','Display gain',.25,4,this.state.scale,.05)}</div><div class="results four">${card('sobelX','Gx · vertical edges')}${card('sobelY','Gy · horizontal edges')}${card('sobelMagnitude','Gradient magnitude')}${card('sobelOrientation','Gradient orientation · modulo 180°')}</div><div class="orientation-legend" aria-label="Gradient orientation color legend"><div class="orientation-gradient"></div><div class="orientation-labels"><span>0°</span><span>45°</span><span>90°</span><span>135°</span><span>180° ≡ 0°</span></div></div><div class="note">Orientation is θ = atan2(Gy, Gx) mod 180°. Hue shows orientation and brightness shows gradient magnitude, so flat regions remain dark. Gradient direction is perpendicular to the visible edge.</div>`;
  bindRange('sobelScale',value=>{this.state.scale=value;this.render()},value=>(+value).toFixed(2));
  this.render();
};
sobelExplorer.render=function(){
  const gray=workingGray(520),field=sobelField(gray.data,gray.w,gray.h);
  responseImage('sobelX',field.gx,gray.w,gray.h,this.state.scale,true);
  responseImage('sobelY',field.gy,gray.w,gray.h,this.state.scale,true);
  responseImage('sobelMagnitude',field.mag,gray.w,gray.h,this.state.scale,false);
  renderSobelOrientation('sobelOrientation',field,gray.w,gray.h);
  state.output=$('#sobelOrientation');
};

const templateExplorer=experiments.find(experiment=>experiment.id==='template');
templateExplorer.mount=function(){
  root.innerHTML=`<div class="instruction" id="templateInstruction">Drag a rectangle over the source image, then release to run matching.</div><div class="template-layout"><div class="picker">${card('templateSource','Source · drag to select')}<div class="stats"><div class="stat"><small>Patch</small><b id="patchSize">Not selected</b></div><div class="stat"><small>Samples per position</small><b id="templateSamples">—</b></div></div></div><div class="template-results">${card('ccHeat','Cross-correlation heatmap')}${card('znccHeat','Zero-mean normalized CC heatmap')}</div></div>`;
  const source=$('#templateSource');
  source.addEventListener('pointerdown',event=>this.down(event));
  source.addEventListener('pointermove',event=>this.move(event));
  source.addEventListener('pointerup',event=>this.up(event));
  source.addEventListener('pointercancel',()=>{this.state.drag=null});
  this.renderSource();
  this.emptyHeatmaps();
};
templateExplorer.renderSource=function(){
  canvas('templateSource');
  const marker=document.createElement('span');
  marker.className='patch-rect';
  marker.id='patchRect';
  $('#templateSource').parentElement.append(marker);
  if(this.state.rect)this.showRect();
};
templateExplorer.emptyHeatmaps=function(){
  ['ccHeat','znccHeat'].forEach(id=>{
    const c=$('#'+id);c.width=320;c.height=180;
    const ctx=c.getContext('2d');ctx.fillStyle='#e5e5e5';ctx.fillRect(0,0,c.width,c.height);
    ctx.fillStyle='#777';ctx.font='12px Arial';ctx.textAlign='center';ctx.fillText('Select a patch to compute',c.width/2,c.height/2);
  });
};
templateExplorer.point=function(event){
  const c=$('#templateSource'),bounds=c.getBoundingClientRect();
  return{x:clamp((event.clientX-bounds.left)/bounds.width*c.width,0,c.width),y:clamp((event.clientY-bounds.top)/bounds.height*c.height,0,c.height)};
};
templateExplorer.down=function(event){
  event.preventDefault();
  event.currentTarget.setPointerCapture(event.pointerId);
  this.state.drag=this.point(event);
  this.state.rect={x:this.state.drag.x,y:this.state.drag.y,w:0,h:0};
  this.showRect();
};
templateExplorer.move=function(event){
  if(!this.state.drag)return;
  const point=this.point(event),start=this.state.drag;
  this.state.rect={x:Math.min(start.x,point.x),y:Math.min(start.y,point.y),w:Math.abs(start.x-point.x),h:Math.abs(start.y-point.y)};
  this.showRect();
};
templateExplorer.up=function(event){
  if(!this.state.drag)return;
  this.move(event);
  this.state.drag=null;
  if(this.state.rect.w<10||this.state.rect.h<10){
    this.state.rect=null;$('#patchRect').style.display='none';$('#patchSize').textContent='Selection too small';renderParameterGuide('template');return;
  }
  renderParameterGuide('template');
  $('#templateInstruction').textContent='Matching…';
  setTimeout(()=>this.match(),20);
};
templateExplorer.showRect=function(){
  const c=$('#templateSource'),q=this.state.rect,marker=$('#patchRect');
  if(!q||!marker)return;
  const scaleX=c.offsetWidth/c.width,scaleY=c.offsetHeight/c.height;
  marker.style.display='block';
  marker.style.left=`${c.offsetLeft+q.x*scaleX}px`;
  marker.style.top=`${c.offsetTop+q.y*scaleY}px`;
  marker.style.width=`${q.w*scaleX}px`;
  marker.style.height=`${q.h*scaleY}px`;
  $('#patchSize').textContent=`${Math.round(q.w)} × ${Math.round(q.h)}`;
};
templateExplorer.match=function(){
  if(state.active!=='template'||!this.state.rect)return;
  const source=workingGray(240),{data,w,h}=source,q=this.state.rect;
  const scaleX=w/state.source.width,scaleY=h/state.source.height;
  const rx=clamp(Math.floor(q.x*scaleX),0,w-3),ry=clamp(Math.floor(q.y*scaleY),0,h-3);
  const rw=clamp(Math.round(q.w*scaleX),3,w-rx),rh=clamp(Math.round(q.h*scaleY),3,h-ry);
  const sampleStep=Math.max(1,Math.ceil(Math.max(rw,rh)/15)),offsets=[];
  for(let y=0;y<rh;y+=sampleStep)for(let x=0;x<rw;x+=sampleStep)offsets.push([x,y]);
  const patch=offsets.map(([x,y])=>data[(ry+y)*w+rx+x]),n=patch.length;
  const sumT=patch.reduce((sum,value)=>sum+value,0),meanT=sumT/n;
  let varianceT=0;for(const value of patch)varianceT+=(value-meanT)**2;
  const mapW=w-rw+1,mapH=h-rh+1,cc=new Float32Array(mapW*mapH),zncc=new Float32Array(mapW*mapH);
  let minCC=Infinity,maxCC=-Infinity,minZN=Infinity,maxZN=-Infinity,bestCC=0,bestZN=0;
  for(let y=0;y<mapH;y++)for(let x=0;x<mapW;x++){
    let dot=0,sum=0,sumSq=0;
    for(let k=0;k<n;k++){const[dx,dy]=offsets[k],value=data[(y+dy)*w+x+dx];dot+=value*patch[k];sum+=value;sumSq+=value*value}
    const mean=sum/n,variance=Math.max(0,sumSq-n*mean*mean),normalized=(dot-n*mean*meanT)/(Math.sqrt(variance*varianceT)||1),i=y*mapW+x;
    cc[i]=dot;zncc[i]=normalized;
    if(dot<minCC)minCC=dot;if(dot>maxCC){maxCC=dot;bestCC=i}
    if(normalized<minZN)minZN=normalized;if(normalized>maxZN){maxZN=normalized;bestZN=i}
  }
  this.heat('ccHeat',cc,mapW,mapH,minCC,maxCC,bestCC);
  this.heat('znccHeat',zncc,mapW,mapH,minZN,maxZN,bestZN);
  $('#templateSamples').textContent=n;
  $('#templateInstruction').textContent='Done. Brighter colors indicate stronger matches; the white ring marks the maximum.';
  state.output=$('#znccHeat');
};
templateExplorer.heat=function(id,values,w,h,min,max,best){
  const image=new ImageData(w,h);
  for(let i=0;i<values.length;i++){
    const t=clamp((values[i]-min)/(max-min||1)),[r,g,b]=heatColor(t);
    image.data[i*4]=r;image.data[i*4+1]=g;image.data[i*4+2]=b;image.data[i*4+3]=255;
  }
  const c=put(id,image),ctx=c.getContext('2d'),x=best%w,y=Math.floor(best/w);
  ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(1,w/180);ctx.beginPath();ctx.arc(x,y,Math.max(2,w/80),0,Math.PI*2);ctx.stroke();
};

const cannyExplorer=experiments.find(experiment=>experiment.id==='canny');
cannyExplorer.mount=function(){
  root.innerHTML=`<div class="controls">${controlRange('cannyNms','NMS radius',1,4,this.state.nms)}${controlRange('cannyLow','Low threshold',1,254,this.state.low)}${controlRange('cannyHigh','High threshold',2,255,this.state.high)}${controlRange('cannySigma','Blur σ',.4,3,this.state.sigma,.1)}</div><div class="results three">${card('cannyGradient','Normalized gradient')}${card('cannySuppressed','After non-maximum suppression')}${card('cannyEdges','Linked edges')}</div><div class="stats"><div class="stat"><small>NMS pixels retained</small><b id="cannyNmsCount">—</b></div><div class="stat"><small>Strong edge seeds</small><b id="cannyStrongCount">—</b></div><div class="stat"><small>Final linked pixels</small><b id="cannyEdgeCount">—</b></div></div><div class="note">Thresholds operate on a normalized 0–255 gradient. Weak pixels are retained only when connected to a strong edge through an 8-neighbor path.</div>`;
  bindRange('cannyNms',value=>{this.state.nms=value;this.render()});
  bindRange('cannySigma',value=>{this.state.sigma=value;this.render()},value=>(+value).toFixed(1));
  bindRange('cannyLow',value=>{
    this.state.low=Math.min(value,this.state.high-1);
    $('#cannyLow').value=this.state.low;$('#cannyLowOut').textContent=this.state.low;
    this.render();
  });
  bindRange('cannyHigh',value=>{
    this.state.high=Math.max(value,this.state.low+1);
    $('#cannyHigh').value=this.state.high;$('#cannyHighOut').textContent=this.state.high;
    this.render();
  });
  this.render();
};
cannyExplorer.render=function(){
  const gray=workingGray(500),result=cannyStable(gray,this.state);
  put('cannyGradient',floatImageData(result.magnitude,gray.w,gray.h));
  put('cannySuppressed',floatImageData(result.suppressed,gray.w,gray.h));
  binaryImage('cannyEdges',result.edges,gray.w,gray.h);
  $('#cannyNmsCount').textContent=result.retained.toLocaleString();
  $('#cannyStrongCount').textContent=result.strong.toLocaleString();
  $('#cannyEdgeCount').textContent=result.linked.toLocaleString();
};

function cannyStable(gray,options){
  const blurred=gaussian(gray.data,gray.w,gray.h,options.sigma),gradient=sobelField(blurred,gray.w,gray.h);
  const magnitude=new Float32Array(gradient.mag.length);
  let maximum=0;for(const value of gradient.mag)maximum=Math.max(maximum,value);
  const scale=255/(maximum||1);for(let i=0;i<magnitude.length;i++)magnitude[i]=gradient.mag[i]*scale;
  const suppressed=new Float32Array(magnitude.length),radius=Math.max(1,Math.round(options.nms));
  let retained=0;
  for(let y=radius;y<gray.h-radius;y++)for(let x=radius;x<gray.w-radius;x++){
    const index=y*gray.w+x,angle=(gradient.angle[index]*180/Math.PI+180)%180;
    let dx,dy;
    if(angle<22.5||angle>=157.5){dx=1;dy=0}
    else if(angle<67.5){dx=1;dy=1}
    else if(angle<112.5){dx=0;dy=1}
    else{dx=1;dy=-1}
    let isMaximum=magnitude[index]>0;
    for(let distance=1;distance<=radius&&isMaximum;distance++){
      const forward=(y+dy*distance)*gray.w+x+dx*distance;
      const backward=(y-dy*distance)*gray.w+x-dx*distance;
      if(magnitude[index]<magnitude[forward]||magnitude[index]<magnitude[backward])isMaximum=false;
    }
    if(isMaximum){suppressed[index]=magnitude[index];retained++}
  }
  const edges=new Uint8Array(suppressed.length),queue=[];
  let strong=0;
  for(let i=0;i<suppressed.length;i++)if(suppressed[i]>=options.high){edges[i]=1;queue.push(i);strong++}
  for(let head=0;head<queue.length;head++){
    const index=queue[head],x=index%gray.w,y=Math.floor(index/gray.w);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(dx===0&&dy===0)continue;
      const xx=x+dx,yy=y+dy;
      if(xx<0||yy<0||xx>=gray.w||yy>=gray.h)continue;
      const neighbor=yy*gray.w+xx;
      if(!edges[neighbor]&&suppressed[neighbor]>=options.low){edges[neighbor]=1;queue.push(neighbor)}
    }
  }
  return{magnitude,suppressed,edges,retained,strong,linked:queue.length};
}

const PSEUDOCODE={
  effectsExplorer:[
    'INPUT image, selected operation, parameter, kernel size',
    'CONVERT image to grayscale intensity values',
    'IF point operation: transform each pixel independently',
    'ELSE IF histogram operation: build intensity mapping and remap pixels',
    'ELSE: visit each pixel neighborhood and apply the selected filter',
    'COMPUTE absolute difference between input and result',
    'DISPLAY before, after, difference, and both histograms'
  ],
  matrixExplorer:[
    'INPUT editable image matrix I and kernel K',
    'IF convolution: flip K horizontally and vertically',
    'PAD I using valid, zero, or copied-border padding',
    'FOR each output position, moving by STRIDE:',
    '    SAMPLE the receptive field using DILATION spacing',
    '    IF pooling: output AVERAGE(field) or MAX(field)',
    '    ELSE: products = field ⊙ K; output = SUM(products)',
    'DISPLAY output grid, receptive field, products, and running sum'
  ],
  channels:[
    'INPUT RGB image',
    'IF RGB mode: keep one of R, G, B and set the other channels to zero',
    'ELSE IF HSV mode: compute hue, saturation, and value for every pixel',
    'ELSE: gray = 0.299R + 0.587G + 0.114B',
    'DISPLAY original image and the requested components'
  ],
  adjustments:[
    'FOR every RGB pixel:',
    '    ADD brightness offset',
    '    APPLY contrast factor around middle gray (128)',
    '    COMPUTE luminance',
    '    INTERPOLATE between luminance and color using saturation',
    '    CLAMP each channel to [0, 255]',
    'DISPLAY adjusted image'
  ],
  standardize:[
    'CONVERT image to grayscale',
    'COMPUTE mean μ and standard deviation σ',
    'FOR every pixel x:',
    '    z = (x - μ) / σ',
    '    output = CLAMP(128 + scaling_coefficient × z, 0, 255)',
    'DISPLAY standardized image and input statistics'
  ],
  gamma:[
    'FOR every channel value x:',
    '    normalized = x / 255',
    '    mapped = normalized ^ gamma',
    '    output = 255 × mapped',
    'DISPLAY gamma-mapped image'
  ],
  histogram:[
    'CONVERT image to grayscale and count pixels at intensities 0…255',
    'IF stretching: map [minimum, maximum] linearly to [0, 255]',
    'ELSE IF equalization: compute CDF and use it as the lookup table',
    'ELSE: retain grayscale values',
    'DISPLAY transformed image and output histogram'
  ],
  jpeg:[
    'INPUT image and quality Q',
    'CONVERT RGB blocks to a luminance/chrominance representation',
    'APPLY block DCT, quantization controlled by Q, and entropy coding',
    'DECODE the JPEG bytes back into pixels for display',
    'REPORT encoded size, bytes per pixel, and reduction from raw RGB'
  ],
  selection:[
    'SAMPLE target color T from the clicked pixel',
    'FOR every pixel P:',
    '    distance = SQRT((P.r-T.r)² + (P.g-T.g)² + (P.b-T.b)²)',
    '    matched = distance ≤ tolerance',
    'RENDER matched pixels as isolated color, overlay, or binary mask',
    'REPORT percentage of matched pixels'
  ],
  filters:[
    'PAD image using zeros or copied border values',
    'FOR output y, x using the selected STRIDE:',
    '    COLLECT the K × K receptive field',
    '    MEDIAN: choose middle sorted value',
    '    MAXIMUM: choose largest value',
    '    BOX: compute arithmetic mean',
    '    GAUSSIAN: weighted sum using exp(-(x²+y²)/(2σ²))',
    'WRITE result to the output image'
  ],
  doglap:[
    'CONVERT image to grayscale',
    'IF Difference of Gaussians:',
    '    blur₁ = GAUSSIAN(image, σ₁)',
    '    blur₂ = GAUSSIAN(image, σ₂)',
    '    response = blur₁ - blur₂',
    'ELSE: response = image correlated with the Laplacian kernel',
    'NORMALIZE signed response for display'
  ],
  sobel:[
    'CONVERT image to grayscale',
    'Gx = CORRELATE(image, horizontal Sobel kernel)',
    'Gy = CORRELATE(image, vertical Sobel kernel)',
    'magnitude = SQRT(Gx² + Gy²)',
    'direction = ATAN2(Gy, Gx)',
    'APPLY display gain and show Gx, Gy, and magnitude'
  ],
  canny:[
    'SMOOTH grayscale image with a Gaussian filter',
    'COMPUTE Sobel Gx, Gy, magnitude, and direction',
    'NORMALIZE magnitude to [0, 255]',
    'NON-MAXIMUM SUPPRESSION: keep local peaks along gradient direction',
    'MARK pixels above HIGH threshold as strong seeds',
    'FOLLOW 8-connected pixels above LOW threshold from every strong seed',
    'OUTPUT the linked binary edge map'
  ],
  hough:[
    'COMPUTE edge points from gradient magnitude',
    'CREATE accumulator A(ρ, θ) initialized to zero',
    'FOR every edge point (x, y) and angle θ:',
    '    ρ = x cos(θ) + y sin(θ)',
    '    A(ρ, θ) += 1',
    'FIND separated local peaks above the vote threshold',
    'DRAW the corresponding lines and display accumulator A'
  ],
  template:[
    'SELECT template patch T from the source image',
    'FOR every valid source position (x, y):',
    '    W = source window at (x, y)',
    '    CC(x,y) = SUM(W ⊙ T)',
    '    ZNCC(x,y) = SUM((W-mean(W)) ⊙ (T-mean(T))) / (||Wc|| ||Tc||)',
    'NORMALIZE response maps into heatmap colors',
    'MARK the maximum response in each heatmap'
  ]
};

const DETAILED_PSEUDOCODE={
  effectsExplorer:`import numpy as np
from scipy import ndimage

image = to_grayscale(uploaded_image).astype(float)

if operation == "invert":
    result = 255 - image
elif operation == "brightness":
    result = np.clip(image + brightness_offset, 0, 255)
elif operation == "gamma":
    result = 255 * (image / 255) ** gamma
elif operation == "threshold":
    result = np.where(image >= threshold, 255, 0)
elif operation == "histogram_stretch":
    low, high = image.min(), image.max()
    result = 255 * (image - low) / max(high - low, 1)
elif operation == "histogram_equalization":
    counts = np.bincount(image.astype(np.uint8).ravel(), minlength=256)
    lookup_table = 255 * np.cumsum(counts) / image.size
    result = lookup_table[image.astype(np.uint8)]
elif operation == "average_smoothing":
    result = ndimage.uniform_filter(image, size=kernel_size)
elif operation == "sharpen":
    blurred = ndimage.uniform_filter(image, size=kernel_size)
    result = np.clip(image + gain * (image - blurred), 0, 255)
elif operation == "median":
    result = ndimage.median_filter(image, size=kernel_size)
elif operation == "maximum":
    result = ndimage.maximum_filter(image, size=kernel_size)

difference = np.abs(result - image)
before_histogram = np.histogram(image, bins=256, range=(0, 255))
after_histogram = np.histogram(result, bins=256, range=(0, 255))
display(image, result, difference, before_histogram, after_histogram)`,

  matrixExplorer:`import numpy as np

I = read_editable_image_matrix()       # H × W
K = read_editable_kernel_matrix()      # kH × kW

if operation == "convolution":
    K = np.flip(K, axis=(0, 1))         # correlation does not flip K

effective_kH = 1 + (K.shape[0] - 1) * dilation
effective_kW = 1 + (K.shape[1] - 1) * dilation
pad_y = 0 if padding == "valid" else effective_kH // 2
pad_x = 0 if padding == "valid" else effective_kW // 2

if padding == "zero":
    padded = np.pad(I, ((pad_y, pad_y), (pad_x, pad_x)), mode="constant")
elif padding == "copy":
    padded = np.pad(I, ((pad_y, pad_y), (pad_x, pad_x)), mode="edge")
else:
    padded = I

out_h = (padded.shape[0] - effective_kH) // stride + 1
out_w = (padded.shape[1] - effective_kW) // stride + 1
output = np.zeros((out_h, out_w))

for oy in range(out_h):
    for ox in range(out_w):
        y0, x0 = oy * stride, ox * stride
        field = padded[
            y0 : y0 + effective_kH : dilation,
            x0 : x0 + effective_kW : dilation,
        ]

        if pooling == "average":
            output[oy, ox] = field.mean()
        elif pooling == "max":
            output[oy, ox] = field.max()
        else:
            products = field * K
            running_sum = np.cumsum(products.ravel())
            output[oy, ox] = running_sum[-1]

highlight_receptive_field(selected_output_cell)
display(field, K, products, running_sum, output)`,

  channels:`import numpy as np
from matplotlib.colors import rgb_to_hsv

rgb = uploaded_image.astype(float) / 255
R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]

if color_space == "RGB":
    red_component   = np.dstack((R, 0*G, 0*B))
    green_component = np.dstack((0*R, G, 0*B))
    blue_component  = np.dstack((0*R, 0*G, B))
    outputs = [red_component, green_component, blue_component]
elif color_space == "HSV":
    hsv = rgb_to_hsv(rgb)
    hue, saturation, value = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    outputs = [hue, saturation, value]
else:
    grayscale = 0.299 * R + 0.587 * G + 0.114 * B
    outputs = [grayscale]

display(uploaded_image, *outputs)`,

  adjustments:`import numpy as np

rgb = uploaded_image.astype(float)

# Brightness translates every channel by the same amount.
rgb = rgb + 2.55 * brightness

# Contrast expands or contracts values around middle gray.
factor = 259 * (contrast + 255) / (255 * (259 - contrast))
rgb = factor * (rgb - 128) + 128

# Saturation interpolates between luminance and the original color.
luminance = (
    0.299 * rgb[..., 0]
    + 0.587 * rgb[..., 1]
    + 0.114 * rgb[..., 2]
)[..., None]
saturation_factor = 1 + saturation / 100
result = luminance + saturation_factor * (rgb - luminance)

result = np.clip(result, 0, 255).astype(np.uint8)
display(uploaded_image, result)`,

  standardize:`import numpy as np

gray = to_grayscale(uploaded_image).astype(float)
mu = gray.mean()
sigma = gray.std()

if sigma == 0:
    z_score = np.zeros_like(gray)
else:
    z_score = (gray - mu) / sigma

# Shift by 128 so negative standardized values remain visible.
standardized = 128 + scaling_coefficient * z_score
result = np.clip(standardized, 0, 255).astype(np.uint8)

print("mean =", mu, "standard deviation =", sigma)
display(gray, result)`,

  gamma:`import numpy as np

rgb = uploaded_image.astype(float)
normalized = rgb / 255.0

# gamma < 1 brightens; gamma > 1 darkens.
mapped = normalized ** gamma
result = np.clip(255 * mapped, 0, 255).astype(np.uint8)

display(uploaded_image, result)`,

  histogram:`import numpy as np

gray = to_grayscale(uploaded_image).astype(np.uint8)
histogram = np.bincount(gray.ravel(), minlength=256)

if mode == "grayscale":
    result = gray
elif mode == "stretch":
    minimum = np.flatnonzero(histogram)[0]
    maximum = np.flatnonzero(histogram)[-1]
    result = 255 * (gray - minimum) / max(maximum - minimum, 1)
elif mode == "equalize":
    cdf = np.cumsum(histogram)
    cdf = cdf / cdf[-1]
    lookup_table = np.round(255 * cdf).astype(np.uint8)
    result = lookup_table[gray]

output_histogram = np.bincount(result.astype(np.uint8).ravel(), minlength=256)
display(gray, result)
plt.plot(range(256), output_histogram)
plt.xlim(0, 255); plt.show()`,

  jpeg:`from io import BytesIO
from PIL import Image
import numpy as np

source = Image.fromarray(uploaded_image)
encoded = BytesIO()
source.save(encoded, format="JPEG", quality=quality)

# JPEG internally converts color, divides the image into blocks,
# applies a DCT, quantizes coefficients, and entropy-encodes them.
jpeg_bytes = encoded.getvalue()
decoded = np.asarray(Image.open(BytesIO(jpeg_bytes)).convert("RGB"))

raw_size = source.width * source.height * 3
bytes_per_pixel = len(jpeg_bytes) / (source.width * source.height)
reduction = 100 * (1 - len(jpeg_bytes) / raw_size)

display(uploaded_image, decoded)
print(len(jpeg_bytes), bytes_per_pixel, reduction)`,

  selection:`import numpy as np

rgb = uploaded_image.astype(float)
target = rgb[clicked_y, clicked_x]       # [target_r, target_g, target_b]

channel_difference = rgb - target
distance = np.sqrt(np.sum(channel_difference ** 2, axis=2))
mask = distance <= tolerance

if mode == "mask":
    result = np.where(mask[..., None], 255, 0)
elif mode == "overlay":
    result = rgb.copy()
    result[mask] = [255, 210, 20]
elif mode == "isolate":
    luminance = to_grayscale(rgb)
    result = np.repeat((0.22 * luminance)[..., None], 3, axis=2)
    result[mask] = rgb[mask]

matched_percentage = 100 * mask.mean()
display(result)
print("matched =", matched_percentage, "%")`,

  filters:`import numpy as np
from scipy import ndimage

image = uploaded_image.astype(float)
pad = kernel_size // 2

if padding == "zero":
    padded = np.pad(image, ((pad,pad), (pad,pad), (0,0)), mode="constant")
else:
    padded = np.pad(image, ((pad,pad), (pad,pad), (0,0)), mode="edge")

output_h = (padded.shape[0] - kernel_size) // stride + 1
output_w = (padded.shape[1] - kernel_size) // stride + 1
output = np.zeros((output_h, output_w, 3))

if filter_type == "gaussian":
    coordinates = np.arange(-pad, pad + 1)
    xx, yy = np.meshgrid(coordinates, coordinates)
    kernel = np.exp(-(xx**2 + yy**2) / (2 * sigma**2))
    kernel = kernel / kernel.sum()

for oy in range(output_h):
    for ox in range(output_w):
        y, x = oy * stride, ox * stride
        field = padded[y:y+kernel_size, x:x+kernel_size]

        if filter_type == "median":
            output[oy, ox] = np.median(field, axis=(0,1))
        elif filter_type == "maximum":
            output[oy, ox] = np.max(field, axis=(0,1))
        elif filter_type == "box":
            output[oy, ox] = np.mean(field, axis=(0,1))
        elif filter_type == "gaussian":
            output[oy, ox] = np.sum(field * kernel[...,None], axis=(0,1))

display(np.clip(output, 0, 255).astype(np.uint8))`,

  doglap:`import numpy as np
from scipy import ndimage

gray = to_grayscale(uploaded_image).astype(float)

if operator == "difference_of_gaussians":
    blur_small = ndimage.gaussian_filter(gray, sigma=sigma_1)
    blur_large = ndimage.gaussian_filter(gray, sigma=sigma_2)
    response = blur_small - blur_large
else:
    laplacian_kernel = np.array([
        [0,  1, 0],
        [1, -4, 1],
        [0,  1, 0],
    ])
    response = ndimage.correlate(gray, laplacian_kernel, mode="nearest")

# Signed responses are shifted around middle gray for display.
display_response = 128 + 127 * response / max(np.abs(response).max(), 1)
display(gray, display_response)`,

  sobel:`import numpy as np
from scipy import ndimage

gray = to_grayscale(uploaded_image).astype(float)

sobel_x = np.array([[-1,0,1], [-2,0,2], [-1,0,1]])
sobel_y = np.array([[-1,-2,-1], [0,0,0], [1,2,1]])

Gx = ndimage.correlate(gray, sobel_x, mode="nearest")
Gy = ndimage.correlate(gray, sobel_y, mode="nearest")
magnitude = np.hypot(Gx, Gy)
direction = np.arctan2(Gy, Gx)

display_Gx = np.clip(128 + display_gain * Gx / 4, 0, 255)
display_Gy = np.clip(128 + display_gain * Gy / 4, 0, 255)
display_magnitude = np.clip(display_gain * magnitude, 0, 255)

display(display_Gx, display_Gy, display_magnitude)`,

  canny:`import numpy as np
from scipy import ndimage

gray = to_grayscale(uploaded_image).astype(float)
smoothed = ndimage.gaussian_filter(gray, sigma=blur_sigma)

Gx = ndimage.sobel(smoothed, axis=1)
Gy = ndimage.sobel(smoothed, axis=0)
magnitude = np.hypot(Gx, Gy)
magnitude = 255 * magnitude / max(magnitude.max(), 1)
angle = (np.degrees(np.arctan2(Gy, Gx)) + 180) % 180

suppressed = np.zeros_like(magnitude)
for y, x in every_non_border_pixel():
    dx, dy = quantize_gradient_direction(angle[y, x])
    neighbors = [
        magnitude[y + d*dy, x + d*dx]
        for d in range(-nms_radius, nms_radius + 1)
    ]
    if magnitude[y, x] >= max(neighbors):
        suppressed[y, x] = magnitude[y, x]

strong = suppressed >= high_threshold
weak = suppressed >= low_threshold
edges = strong.copy()
queue = list(np.argwhere(strong))

# Hysteresis: retain weak pixels only when connected to a strong edge.
while queue:
    y, x = queue.pop(0)
    for ny, nx in eight_connected_neighbors(y, x):
        if weak[ny, nx] and not edges[ny, nx]:
            edges[ny, nx] = True
            queue.append((ny, nx))

display(magnitude, suppressed, edges)`,

  hough:`import numpy as np

edges = sobel_magnitude(uploaded_image) >= edge_threshold
edge_points = np.argwhere(edges)       # rows are [y, x]

theta = np.linspace(0, np.pi, 120, endpoint=False)
rho_max = int(np.ceil(np.hypot(image_width, image_height)))
accumulator = np.zeros((2*rho_max + 1, len(theta)), dtype=int)

for y, x in edge_points:
    for theta_index, angle in enumerate(theta):
        rho = round(x*np.cos(angle) + y*np.sin(angle))
        accumulator[rho + rho_max, theta_index] += 1

minimum_votes = vote_threshold * accumulator.max()
candidates = local_maxima(accumulator, minimum=minimum_votes)
candidates.sort(key=lambda peak: peak.votes, reverse=True)

lines = []
for peak in candidates:
    if sufficiently_far_from_existing_peaks(peak, lines):
        lines.append((peak.rho, peak.theta))
    if len(lines) == maximum_lines:
        break

draw_polar_lines(uploaded_image, lines)
display(accumulator)                   # horizontal θ, vertical ρ`,

  template:`import numpy as np
from numpy.lib.stride_tricks import sliding_window_view

small_image = np.asarray(Image.fromarray(uploaded_image).resize((160, 120)))
source = to_grayscale(small_image).astype(float)
template = source[y:y+patch_height, x:x+patch_width]
windows = sliding_window_view(source, template.shape)

# Raw cross-correlation: bright regions can dominate this score.
cc = np.einsum("ijkl,kl->ij", windows, template)

# Zero-mean normalized cross-correlation is invariant to affine brightness.
template_centered = template - template.mean()
windows_centered = windows - windows.mean(axis=(-2,-1), keepdims=True)

numerator = np.einsum("ijkl,kl->ij", windows_centered, template_centered)
denominator = np.sqrt(
    np.sum(windows_centered**2, axis=(-2,-1))
    * np.sum(template_centered**2)
)
zncc = np.divide(numerator, denominator,
                 out=np.zeros_like(numerator), where=denominator > 0)

best_cc = np.unravel_index(np.argmax(cc), cc.shape)
best_zncc = np.unravel_index(np.argmax(zncc), zncc.shape)

display_heatmap(cc, marker=best_cc)
display_heatmap(zncc, marker=best_zncc)`
};

const PYTHON_SAMPLE_HEADER=`# Install once if needed:
# pip install numpy pillow matplotlib scipy

from pathlib import Path
from types import SimpleNamespace
from io import BytesIO
import numpy as np
import matplotlib.pyplot as plt
from PIL import Image
from scipy import ndimage

# Replace this fallback with: uploaded_image = np.asarray(Image.open("image.jpg").convert("RGB"))
if Path("image.jpg").exists():
    uploaded_image = np.asarray(Image.open("image.jpg").convert("RGB"))
else:
    yy, xx = np.mgrid[0:240, 0:320]
    uploaded_image = np.dstack((xx / 319 * 255, yy / 239 * 255,
                                (np.sin(xx / 18) + 1) * 127.5)).astype(np.uint8)

def to_grayscale(image):
    image = np.asarray(image, dtype=float)
    return 0.299*image[..., 0] + 0.587*image[..., 1] + 0.114*image[..., 2]

def display(*images):
    fig, axes = plt.subplots(1, len(images), figsize=(5*len(images), 4))
    axes = np.atleast_1d(axes)
    for axis, image in zip(axes, images):
        axis.imshow(image, cmap="gray" if np.asarray(image).ndim == 2 else None)
        axis.axis("off")
    plt.tight_layout()
    plt.show()

def read_editable_image_matrix():
    return np.arange(1, 26, dtype=float).reshape(5, 5)

def read_editable_kernel_matrix():
    return np.array([[1, 0, -1], [1, 0, -1], [1, 0, -1]], dtype=float)

def highlight_receptive_field(cell):
    print("Selected output cell:", cell)

def every_non_border_pixel():
    for y in range(nms_radius, magnitude.shape[0] - nms_radius):
        for x in range(nms_radius, magnitude.shape[1] - nms_radius):
            yield y, x

def quantize_gradient_direction(angle):
    if angle < 22.5 or angle >= 157.5: return 1, 0
    if angle < 67.5: return 1, 1
    if angle < 112.5: return 0, 1
    return 1, -1

def eight_connected_neighbors(y, x):
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            ny, nx = y + dy, x + dx
            if (dx or dy) and 0 <= ny < magnitude.shape[0] and 0 <= nx < magnitude.shape[1]:
                yield ny, nx

def sobel_magnitude(image):
    gray = to_grayscale(image)
    return np.hypot(ndimage.sobel(gray, axis=1), ndimage.sobel(gray, axis=0))

def local_maxima(array, minimum):
    maxima = array == ndimage.maximum_filter(array, size=5, mode="wrap")
    peaks = []
    for rho_index, theta_index in np.argwhere(maxima & (array >= minimum)):
        peaks.append(SimpleNamespace(rho=rho_index-rho_max, theta=theta_index,
                                     votes=int(array[rho_index, theta_index])))
    return peaks

def sufficiently_far_from_existing_peaks(peak, lines):
    return all(abs(peak.rho-rho) >= 8 or abs(peak.theta-theta_index) >= 5
               for rho, theta_index in lines)

def draw_polar_lines(image, lines):
    plt.figure(figsize=(7, 5)); plt.imshow(image)
    for rho, theta_index in lines:
        angle = theta[theta_index]; c, s = np.cos(angle), np.sin(angle)
        x0, y0 = c*rho, s*rho
        plt.plot([x0-1000*s, x0+1000*s], [y0+1000*c, y0-1000*c], "r-")
    plt.xlim(0, image.shape[1]); plt.ylim(image.shape[0], 0); plt.axis("off"); plt.show()

def display_heatmap(values, marker=None):
    plt.figure(figsize=(6, 4)); plt.imshow(values, cmap="turbo")
    if marker is not None: plt.scatter(marker[1], marker[0], facecolors="none", edgecolors="white")
    plt.colorbar(); plt.show()`;

const PYTHON_SAMPLE_PARAMETERS={
  effectsExplorer:`operation = "threshold"
brightness_offset, gamma, threshold = 20, 0.8, 128
kernel_size, gain = 3, 1.0`,
  matrixExplorer:`operation, padding = "correlation", "zero"
stride, dilation, pooling = 1, 1, "none"
selected_output_cell = (0, 0)`,
  channels:`color_space = "RGB"`,
  adjustments:`brightness, contrast, saturation = 10, 20, 15`,
  standardize:`scaling_coefficient = 32`,
  gamma:`gamma = 0.8`,
  histogram:`mode = "equalize"`,
  jpeg:`quality = 70`,
  selection:`clicked_y, clicked_x = uploaded_image.shape[0]//2, uploaded_image.shape[1]//2
tolerance, mode = 40, "isolate"`,
  filters:`filter_type, kernel_size = "gaussian", 3
stride, padding, sigma = 1, "copy", 1.0`,
  doglap:`operator = "difference_of_gaussians"
sigma_1, sigma_2 = 1.0, 2.0`,
  sobel:`display_gain = 1.0`,
  canny:`blur_sigma, nms_radius = 1.2, 1
low_threshold, high_threshold = 35, 85`,
  hough:`edge_threshold, vote_threshold, maximum_lines = 90, 0.5, 12
image_height, image_width = uploaded_image.shape[:2]`,
  template:`from numpy.lib.stride_tricks import sliding_window_view
x, y, patch_width, patch_height = 20, 20, 20, 20`
};

const SIMPLE_PYTHON_SAMPLES={
  effectsExplorer:`import cv2
import numpy as np
from skimage import exposure

def apply_effect(image, effect="threshold", value=128, kernel_size=3):
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    operations = {
        "invert": lambda: 255 - gray,
        "brightness": lambda: cv2.convertScaleAbs(gray, beta=value - 128),
        "gamma": lambda: exposure.adjust_gamma(gray, gamma=max(value / 128, 0.01)),
        "threshold": lambda: cv2.threshold(gray, value, 255, cv2.THRESH_BINARY)[1],
        "stretch": lambda: exposure.rescale_intensity(gray, out_range=np.uint8),
        "equalize": lambda: cv2.equalizeHist(gray),
        "smooth": lambda: cv2.blur(gray, (kernel_size, kernel_size)),
        "sharpen": lambda: cv2.addWeighted(gray, 2, cv2.blur(gray, (kernel_size, kernel_size)), -1, 0),
        "median": lambda: cv2.medianBlur(gray, kernel_size),
        "maximum": lambda: cv2.dilate(gray, np.ones((kernel_size, kernel_size), np.uint8)),
    }
    return operations[effect]()`,

  matrixExplorer:`import numpy as np
from scipy import signal, ndimage

def apply_matrix_operation(image, kernel, operation="correlation", padding="same",
                           stride=1, dilation=1, pooling=None):
    image, kernel = np.asarray(image, float), np.asarray(kernel, float)
    if pooling == "average":
        return ndimage.uniform_filter(image, kernel.shape)[::stride, ::stride]
    if pooling == "max":
        return ndimage.maximum_filter(image, kernel.shape)[::stride, ::stride]
    dilated = np.zeros(((kernel.shape[0]-1)*dilation+1, (kernel.shape[1]-1)*dilation+1))
    dilated[::dilation, ::dilation] = kernel
    function = signal.convolve2d if operation == "convolution" else signal.correlate2d
    return function(image, dilated, mode=padding)[::stride, ::stride]`,

  channels:`import cv2
import numpy as np

def split_color_channels(image, color_space="RGB"):
    if color_space == "HSV":
        return cv2.split(cv2.cvtColor(image, cv2.COLOR_RGB2HSV))
    if color_space == "grayscale":
        return (cv2.cvtColor(image, cv2.COLOR_RGB2GRAY),)
    channels = cv2.split(image)
    return tuple(cv2.merge([channel if i == j else np.zeros_like(channel)
                            for i in range(3)]) for j, channel in enumerate(channels))`,

  adjustments:`import cv2
import numpy as np

def adjust_image(image, brightness=0, contrast=0, saturation=0):
    result = cv2.convertScaleAbs(image, alpha=1 + contrast / 100, beta=brightness)
    hsv = cv2.cvtColor(result, cv2.COLOR_RGB2HSV).astype(float)
    hsv[..., 1] = np.clip(hsv[..., 1] * (1 + saturation / 100), 0, 255)
    return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB)`,

  standardize:`import cv2
import numpy as np

def standardize_image(image, scale=32):
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY).astype(float)
    standardized = (gray - gray.mean()) / (gray.std() or 1)
    return np.clip(128 + scale * standardized, 0, 255).astype(np.uint8)`,

  gamma:`import numpy as np

def gamma_map(image, gamma=1.0):
    return np.clip(255 * (image.astype(float) / 255) ** gamma, 0, 255).astype(np.uint8)`,

  histogram:`import cv2

def transform_histogram(image, mode="equalize", threshold=128):
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    if mode == "threshold":
        return cv2.threshold(gray, threshold, 255, cv2.THRESH_BINARY)[1]
    if mode == "stretch":
        return cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX)
    return cv2.equalizeHist(gray)`,

  jpeg:`from io import BytesIO
import numpy as np
from PIL import Image

def compress_jpeg(image, quality=70):
    buffer = BytesIO()
    Image.fromarray(image).save(buffer, format="JPEG", quality=quality)
    return np.asarray(Image.open(BytesIO(buffer.getvalue())).convert("RGB"))`,

  selection:`import numpy as np

def select_color(image, target_rgb, tolerance=40):
    distance = np.linalg.norm(image.astype(float) - np.asarray(target_rgb), axis=2)
    return (distance <= tolerance).astype(np.uint8) * 255`,

  filters:`import cv2
import numpy as np

def apply_filter(image, kind="gaussian", kernel_size=3, sigma=1.0, stride=1):
    filters = {
        "median": lambda: cv2.medianBlur(image, kernel_size),
        "maximum": lambda: cv2.dilate(image, np.ones((kernel_size, kernel_size), np.uint8)),
        "gaussian": lambda: cv2.GaussianBlur(image, (kernel_size, kernel_size), sigma),
        "box": lambda: cv2.blur(image, (kernel_size, kernel_size)),
    }
    return filters[kind]()[::stride, ::stride]`,

  doglap:`import cv2

def dog_or_laplacian(image, operator="dog", sigma1=1.0, sigma2=2.0):
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY).astype("float32")
    if operator == "dog":
        return cv2.GaussianBlur(gray, (0, 0), sigma1) - cv2.GaussianBlur(gray, (0, 0), sigma2)
    return cv2.Laplacian(gray, cv2.CV_32F)`,

  sobel:`import cv2
import numpy as np

def sobel_images(image):
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1)
    magnitude = np.hypot(gx, gy)
    orientation = np.mod(np.degrees(np.arctan2(gy, gx)), 180)
    return gx, gy, magnitude, orientation`,

  canny:`import cv2

def canny_edges(image, low_threshold=35, high_threshold=85, blur_sigma=1.2):
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    blurred = cv2.GaussianBlur(gray, (0, 0), blur_sigma)
    return cv2.Canny(blurred, low_threshold, high_threshold)`,

  hough:`import cv2
import numpy as np
from skimage.transform import hough_line

def detect_hough_lines(image, threshold=80):
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(gray, 50, 150)
    hough_space, _, _ = hough_line(edges > 0)
    overlay = image.copy()
    lines = cv2.HoughLines(edges, 1, np.pi / 180, threshold)
    if lines is not None:
        for rho, theta in lines[:, 0]:
            a, b = np.cos(theta), np.sin(theta)
            x0, y0 = a*rho, b*rho
            p1 = (int(x0 + 1000*(-b)), int(y0 + 1000*a))
            p2 = (int(x0 - 1000*(-b)), int(y0 - 1000*a))
            cv2.line(overlay, p1, p2, (255, 0, 0), 2)
    return overlay, hough_space`,

  template:`import cv2

def match_template(image, template):
    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    patch = cv2.cvtColor(template, cv2.COLOR_RGB2GRAY)
    cross_correlation = cv2.matchTemplate(gray, patch, cv2.TM_CCORR)
    normalized_zero_mean = cv2.matchTemplate(gray, patch, cv2.TM_CCOEFF_NORMED)
    return cross_correlation, normalized_zero_mean`,

  gabor:`import numpy as np
from scipy import ndimage as ndi
from skimage.filters import gabor_kernel

def gabor_power(image, theta=0, sigma=4, wavelength=10):
    image = (image - image.mean()) / image.std()
    kernel = gabor_kernel(1 / wavelength, theta=theta,
                          sigma_x=sigma, sigma_y=sigma)
    real = ndi.convolve(image, np.real(kernel), mode="wrap")
    imaginary = ndi.convolve(image, np.imag(kernel), mode="wrap")
    return kernel, np.sqrt(real**2 + imaginary**2)`,

  harris:`import numpy as np
from scipy import ndimage as ndi
from skimage.feature import corner_peaks

def harris_corners(image, sigma=1.5, k=0.05, threshold=0.01, nms_radius=4):
    """image: RGB(A) uint8 array; the page's 480-px working copy reproduces its corners exactly."""
    gray = np.asarray(image, dtype=float)[..., :3] @ [0.299, 0.587, 0.114] / 255
    # Step 1: Sobel gradients; border pixels are replicated, so the frame is not an edge
    gx = ndi.sobel(gray, axis=1, mode="nearest")
    gy = ndi.sobel(gray, axis=0, mode="nearest")
    # Step 2: M = sum of w(x, y) [Ix^2, IxIy; IxIy, Iy^2] with a Gaussian w cut at 3 sigma,
    # then R = det(M) - k trace(M)^2  (k is the slides' kappa)
    w = lambda a: ndi.gaussian_filter(a, sigma, mode="nearest", radius=max(1, int(np.ceil(3 * sigma))))  # SciPy >= 1.10
    A, B, C = w(gx * gx), w(gx * gy), w(gy * gy)
    R = A * C - B * B - k * (A + C) ** 2
    # Steps 3-4: keep R > threshold * max(R), then non-maximum suppression
    border = max(nms_radius, int(np.ceil(3 * sigma)) + 2)
    corners = corner_peaks(R, min_distance=nms_radius,
                           threshold_rel=threshold, exclude_border=border)
    return R, corners  # corners are (row, column) pairs`,

  greedyNms:NMS_PYTHON_SAMPLE,

  anms:`import numpy as np
from scipy import ndimage as ndi
from skimage.feature import peak_local_max

def harris_response(gray, sigma=1.5, k=0.05):  # steps 1-2 of the Harris page
    gx = ndi.sobel(gray, axis=1, mode="nearest")
    gy = ndi.sobel(gray, axis=0, mode="nearest")
    w = lambda a: ndi.gaussian_filter(a, sigma, mode="nearest", radius=max(1, int(np.ceil(3 * sigma))))
    A, B, C = w(gx * gx), w(gx * gy), w(gy * gy)
    return A * C - B * B - k * (A + C) ** 2

def adaptive_nms(gray, n=250, c=1.1):
    """gray: the page's 480-px working image as floats in [0, 1]; radii are in its pixels."""
    response = harris_response(gray)
    peaks = peak_local_max(response, min_distance=1, threshold_rel=1e-4, exclude_border=6)  # 3 x 3 maxima
    strength = response[peaks[:, 0], peaks[:, 1]]
    order = np.argsort(-strength)[:4000]
    peaks, strength = peaks[order], strength[order]
    radius = np.full(len(peaks), np.inf)
    for i in range(len(peaks)):
        stronger = strength > c * strength[i]        # significantly stronger candidates
        if stronger.any():
            radius[i] = np.linalg.norm(peaks[stronger] - peaks[i], axis=1).min()
    keep = np.argsort(-radius, kind="stable")[:n]   # equal radii: the stronger candidate first
    return peaks[:n], peaks[keep], radius[keep[-1]]  # strongest n, ANMS n, its radius r`,

  siftDescriptor:SIFT_PYTHON_SAMPLE,

  ratioTest:RATIO_PYTHON_SAMPLE,

  opticalFlow:`import cv2
import numpy as np

LK_PARAMS = dict(winSize=(17, 17),
                 criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 8, 0.025))

def track(gray_a, gray_b, points, levels, max_fb_error=1.0):
    # OpenCV's maxLevel counts the extra levels: levels=1 -> maxLevel=0 (full resolution only).
    params = dict(LK_PARAMS, maxLevel=levels - 1)
    forward, ok_f, _ = cv2.calcOpticalFlowPyrLK(gray_a, gray_b, points, None, **params)
    backward, ok_b, _ = cv2.calcOpticalFlowPyrLK(gray_b, gray_a, forward, None, **params)
    fb_error = np.linalg.norm(points - backward, axis=-1).ravel()
    valid = (ok_f.ravel() == 1) & (ok_b.ravel() == 1) & (fb_error < max_fb_error)
    return forward, valid

def compare_lucas_kanade(frame_a, frame_b, pyramid_levels=4):
    gray_a = cv2.cvtColor(frame_a, cv2.COLOR_RGB2GRAY)
    gray_b = cv2.cvtColor(frame_b, cv2.COLOR_RGB2GRAY)
    corners = cv2.goodFeaturesToTrack(gray_a, maxCorners=220, qualityLevel=0.01, minDistance=7)
    single = track(gray_a, gray_b, corners, levels=1)
    multi = track(gray_a, gray_b, corners, levels=pyramid_levels)
    return corners, single, multi`
};

const WIKI={
  digital:'https://en.wikipedia.org/wiki/Digital_image_processing',
  threshold:'https://en.wikipedia.org/wiki/Thresholding_(image_processing)',
  histogram:'https://en.wikipedia.org/wiki/Image_histogram',
  equalization:'https://en.wikipedia.org/wiki/Histogram_equalization',
  kernel:'https://en.wikipedia.org/wiki/Kernel_(image_processing)',
  convolution:'https://en.wikipedia.org/wiki/Convolution',
  correlation:'https://en.wikipedia.org/wiki/Cross-correlation',
  pooling:'https://en.wikipedia.org/wiki/Pooling_layer',
  rgb:'https://en.wikipedia.org/wiki/RGB_color_model',
  hsv:'https://en.wikipedia.org/wiki/HSL_and_HSV',
  grayscale:'https://en.wikipedia.org/wiki/Grayscale',
  standard:'https://en.wikipedia.org/wiki/Standard_score',
  gamma:'https://en.wikipedia.org/wiki/Gamma_correction',
  jpeg:'https://en.wikipedia.org/wiki/JPEG',
  segmentation:'https://en.wikipedia.org/wiki/Image_segmentation',
  colorDifference:'https://en.wikipedia.org/wiki/Color_difference',
  median:'https://en.wikipedia.org/wiki/Median_filter',
  gaussian:'https://en.wikipedia.org/wiki/Gaussian_blur',
  dog:'https://en.wikipedia.org/wiki/Difference_of_Gaussians',
  laplace:'https://en.wikipedia.org/wiki/Laplace_operator',
  sobel:'https://en.wikipedia.org/wiki/Sobel_operator',
  imageGradient:'https://en.wikipedia.org/wiki/Image_gradient',
  canny:'https://en.wikipedia.org/wiki/Canny_edge_detector',
  nms:'https://en.wikipedia.org/wiki/Canny_edge_detector#Gradient_magnitude_thresholding_or_lower_bound_cut-off_suppression',
  hough:'https://en.wikipedia.org/wiki/Hough_transform',
  template:'https://en.wikipedia.org/wiki/Template_matching',
  gabor:'https://en.wikipedia.org/wiki/Gabor_filter',
  gaborBank:'https://scikit-image.org/docs/stable/auto_examples/features_detection/plot_gabor.html',
  harris:'https://en.wikipedia.org/wiki/Harris_corner_detector',
  harrisNms:'https://en.wikipedia.org/wiki/Harris_corner_detector#Non-maximum_suppression',
  structureTensor:'https://en.wikipedia.org/wiki/Structure_tensor',
  cornerDetection:'https://en.wikipedia.org/wiki/Corner_detection',
  opticalFlow:'https://en.wikipedia.org/wiki/Optical_flow',
  lucasKanade:'https://en.wikipedia.org/wiki/Lucas%E2%80%93Kanade_method',
  imagePyramid:'https://en.wikipedia.org/wiki/Pyramid_(image_processing)'
};

const param=(name,value,description,active=true)=>({name,value:String(value),description,active});
const link=(label,url)=>({label,url});

function guideFor(id){
  const experiment=experiments.find(item=>item.id===id),s=experiment?.state??{};
  if(id==='effectsExplorer'){
    const amount={brightness:['Brightness offset',`value − 128 = ${s.amount-128}`,'Adds this offset to every intensity.'],gamma:['Gamma',(.1+s.amount/64).toFixed(2),'Power-law exponent; below 1 brightens and above 1 darkens.'],threshold:['Threshold',s.amount,'Pixels at or above this intensity become white.'],sharpen:['Sharpen gain',(s.amount/64).toFixed(2),'Scales the high-frequency detail added back to the image.']}[s.effect];
    const kernelUsed=['smooth','sharpen','median','maximum'].includes(s.effect);
    return{overview:'Only parameters used by the selected effect are shown. The difference image exposes clipping, halos, blur, and lost detail.',params:[param('Operation',s.effect,'Chooses the point, histogram, linear, or nonlinear transformation.'),param(amount?.[0]??'Parameter',amount?.[1]??'—',amount?.[2]??'This operation does not use the parameter slider.',Boolean(amount)),param('Kernel size',`${s.kernel} × ${s.kernel}`,kernelUsed?'Sets the neighborhood width and height. Larger neighborhoods produce a stronger spatial effect.':'Point and histogram operations do not inspect neighboring pixels.',kernelUsed)],links:[link('Digital image processing',WIKI.digital),link('Thresholding',WIKI.threshold),link('Histogram equalization',WIKI.equalization),link('Median filter',WIKI.median)]};
  }
  if(id==='matrixExplorer'){
    const pooled=s.pooling!=='none';
    return{overview:'Every enabled setting is used in the output-grid calculation. Operation and kernel values are intentionally bypassed while pooling is selected.',params:[param('Operation',s.operation,pooled?'Pooling aggregates the receptive field without multiplying by a kernel.':'Correlation uses the kernel as entered; convolution flips it first.',!pooled),param('Custom kernel','3 × 3',pooled?'Average/max pooling does not use kernel values.':'Each receptive-field value is multiplied by the corresponding kernel value.',!pooled),param('Padding',s.padding,'Controls values sampled beyond the image boundary.'),param('Stride',s.stride,'Moves the receptive field by this many cells between outputs.'),param('Dilation',s.dilation,'Spaces kernel samples apart and enlarges the effective receptive field.'),param('Pooling',s.pooling,s.pooling==='none'?'Disabled; the kernel products are summed.':`${s.pooling} aggregates the sampled receptive field.`)],links:[link('Kernel (image processing)',WIKI.kernel),link('Convolution',WIKI.convolution),link('Cross-correlation',WIKI.correlation),link('Pooling layer',WIKI.pooling)]};
  }
  if(id==='channels')return{overview:'The selected color-space option directly controls which components are computed and displayed.',params:[param('Color space',s.space,s.space==='rgb'?'Displays isolated red, green, and blue intensities.':s.space==='hsv'?'Displays hue, saturation, and value independently.':'Computes luminance-weighted grayscale.')],links:[link('RGB color model',WIKI.rgb),link('HSL and HSV',WIKI.hsv),link('Grayscale',WIKI.grayscale)]};
  if(id==='adjustments')return{overview:'All three sliders are applied sequentially to every pixel.',params:[param('Brightness',s.b,'Adds an intensity offset; extreme values clip to black or white.'),param('Contrast',s.c,'Expands or contracts values around middle gray (128).'),param('Saturation',s.s,'Moves colors away from or toward their luminance value.')],links:[link('Digital image processing',WIKI.digital),link('HSL and HSV',WIKI.hsv)]};
  if(id==='standardize')return{overview:'The image is converted to grayscale, standardized with its mean and standard deviation, then mapped back into a visible range.',params:[param('Scaling coefficient',s.scale,'Multiplies each z-score before adding 128. Larger values increase output contrast and clipping.')],links:[link('Standard score',WIKI.standard),link('Grayscale',WIKI.grayscale)]};
  if(id==='gamma')return{overview:'Gamma mapping is applied independently to every RGB channel after normalizing it to 0–1.',params:[param('Gamma',s.gamma,'Exponent in output = 255 × (input/255)^gamma. Values below 1 brighten; values above 1 darken.')],links:[link('Gamma correction',WIKI.gamma)]};
  if(id==='histogram')return{overview:'The selected mode determines the intensity lookup applied to the grayscale image.',params:[param('Mode',s.mode,s.mode==='plain'?'Only grayscale conversion is applied.':s.mode==='stretch'?'The observed minimum and maximum are mapped to 0 and 255.':'The cumulative histogram becomes the intensity lookup table.')],links:[link('Image histogram',WIKI.histogram),link('Histogram equalization',WIKI.equalization)]};
  if(id==='jpeg')return{overview:'The quality slider is passed directly to the browser JPEG encoder.',params:[param('Quality',`${s.quality}%`,'Higher quality preserves more transform coefficients and usually creates a larger file; lower quality increases blocking and ringing artifacts.')],links:[link('JPEG',WIKI.jpeg)]};
  if(id==='selection')return{overview:'The clicked pixel supplies the target RGB color; both visible controls affect the resulting segmentation.',params:[param('Selected color',s.color.join(', '),'RGB target sampled from the source image.'),param('Tolerance',s.tol,'Maximum Euclidean RGB distance allowed for a match.'),param('Highlight mode',s.mode,'Changes only how the same matched-pixel mask is rendered.')],links:[link('Image segmentation',WIKI.segmentation),link('Color difference',WIKI.colorDifference)]};
  if(id==='filters')return{overview:'Kernel, stride, padding, and filter type are always used. Sigma is used only by the Gaussian filter.',params:[param('Filter',s.type,'Chooses how each neighborhood is reduced.'),param('Kernel size',`${s.kernel} × ${s.kernel}`,'Sets the sampled neighborhood size.'),param('Stride',s.stride,'Controls the distance between output samples; larger values reduce output resolution.'),param('Padding',s.padding,s.padding==='zero'?'Outside samples are zero.':'Outside samples copy the nearest border pixel.'),param('Gaussian sigma',s.sigma,s.type==='gaussian'?'Controls Gaussian spread; larger sigma produces stronger blur.':'Median, maximum, and box filters do not use sigma.',s.type==='gaussian')],links:[link('Kernel (image processing)',WIKI.kernel),link('Gaussian blur',WIKI.gaussian),link('Median filter',WIKI.median)]};
  if(id==='doglap'){
    const dog=s.mode==='dog';
    return{overview:dog?'Difference of Gaussians uses both sigma values: it creates two Gaussian-blurred images and subtracts them.':'Plain Laplacian has no tunable sigma. It directly applies a fixed discrete second-derivative kernel.',params:dog?[param('Operator','Difference of Gaussians','Selects the two-scale Gaussian subtraction.'),param('Sigma 1',s.sigma,'Standard deviation of the narrower Gaussian blur.'),param('Sigma 2',s.sigma2,'Standard deviation of the wider Gaussian blur. The computation keeps it at least 0.1 above sigma 1.')]:[param('Operator','Laplacian','Applies a discrete second spatial derivative.'),param('Kernel','[[0, 1, 0], [1, −4, 1], [0, 1, 0]]','Fixed 3 × 3 four-neighbor Laplacian kernel. No sigma parameter is used.')],links:[link('Difference of Gaussians',WIKI.dog),link('Laplace operator',WIKI.laplace),link('Gaussian blur',WIKI.gaussian)]};
  }
  if(id==='sobel')return{overview:'Fixed Sobel kernels compute Gx and Gy. Their magnitude and orientation modulo 180° are displayed separately.',params:[param('Display gain',s.scale,'Multiplies the Gx, Gy, and magnitude views only. It does not change the orientation view or the detected gradients.'),param('Orientation range','0°–180°','Computed as atan2(Gy, Gx) modulo 180°. Opposite gradient directions share a hue; brightness represents gradient magnitude.')],links:[link('Sobel operator',WIKI.sobel),link('Image gradient',WIKI.imageGradient)]};
  if(id==='canny')return{overview:'All four controls participate in the Canny pipeline.',params:[param('NMS radius',s.nms,'Number of pixels compared in both directions along the gradient when retaining local maxima.'),param('Low threshold',s.low,'Weak-edge cutoff. These pixels survive only when connected to a strong edge.'),param('High threshold',s.high,'Strong-edge seed cutoff. It is kept above the low threshold.'),param('Blur sigma',s.sigma,'Gaussian smoothing applied before gradients; larger values suppress more noise and fine detail.')],links:[link('Canny edge detector',WIKI.canny),link('Non-maximum suppression',WIKI.nms),link('Gaussian blur',WIKI.gaussian)]};
  if(id==='hough')return{overview:'All three sliders affect either the edge candidates, accumulator peaks, or rendered lines. Only the accumulator visual is remapped with nearest-neighbor sampling to match the input image aspect ratio.',params:[param('Edge threshold',s.edgeThreshold,'Minimum Sobel magnitude required for a pixel to vote.'),param('Peak threshold',`${s.voteThreshold}%`,'Minimum accumulator value as a percentage of the strongest vote.'),param('Maximum lines',s.lines,'Caps the number of separated accumulator peaks drawn on the image.'),param('Accumulator display','Input aspect ratio','Changes only the displayed Hough-space shape; the underlying θ–ρ votes and detected peaks are unchanged.')],links:[link('Hough transform',WIKI.hough)]};
  if(id==='template')return{overview:'There are no sliders. The dragged rectangle is the tunable input: its position and dimensions define the template patch.',params:[param('Patch',s.rect?`${Math.round(s.rect.w)} × ${Math.round(s.rect.h)}`:'Not selected','The selected pixels are compared at every valid source position using CC and zero-mean normalized CC.',Boolean(s.rect))],links:[link('Template matching',WIKI.template),link('Cross-correlation',WIKI.correlation)]};
  if(id==='gabor')return{overview:'The selected parameters define one complex member of a Gabor filter bank. Each grayscale texture is standardized, convolved with the raw real and imaginary kernel components using wrap boundaries, and shown as phase-invariant power. Response maps share one fixed display range, and the kernel preview uses one fixed spatial frame.',params:[param('Gamma',s.gamma.toFixed(2),'Controls the vertical aspect ratio of the Gaussian envelope. Gamma = 1 matches the circular envelope in the supplied Python reference; smaller values stretch it vertically.'),param('Sigma',s.sigma.toFixed(2),'Controls the Gaussian decay and therefore the spatial extent of the kernel.'),param('Omega',`${s.omega}°`,'Maps to theta in gabor_kernel and changes the preferred orientation of the sinusoidal carrier without changing the preview scale.'),param('Lambda',`${s.lambda.toFixed(1)} px`,'Sets frequency to 1 / lambda. Shorter wavelengths respond to finer texture cycles.'),param('Power','√(real² + imaginary²)','Combines the quadrature responses so the displayed magnitude does not depend on local phase.'),param('Display scales','Fixed','The response brightness range and the kernel preview’s pixel field are constant as parameters change.')],links:[link('Gabor filter',WIKI.gabor),link('Gabor filter banks for texture classification',WIKI.gaborBank)]};
  if(id==='harris')return{overview:'Steps 1–4 follow slide 24: Sobel gradients at each pixel, a Gaussian-weighted second-moment matrix M for each window with cornerness R = det(M) − κ·trace(M)², a threshold on R, then non-maximum suppression. Click the Post image or a step image to inspect M and its eigenvalues at that window. Corners are only looked for at least max(NMS radius, ⌈3σ⌉ + 2) px from the border (the hatched band), so the whole Gaussian window and NMS neighborhood lie inside the image. The second view reuses the first view’s absolute threshold, so its corner counts are directly comparable.',params:[param('Window sigma',s.sigma.toFixed(2),'Standard deviation of the Gaussian window w(x, y) that sums Ix², IxIy, and Iy² into M. Larger windows average over larger structures and suppress fine texture.'),param('κ',s.k.toFixed(3),'Weight of trace(M)² in R (κ on the slides, k in scikit-image). Larger κ requires the two eigenvalues to be more similar before R becomes positive; 0.04–0.06 is typical, and κ ≥ 0.25 rejects every window.'),param('Threshold',`${s.threshold.toFixed(1)}% of max R`,'Step 3 keeps pixels whose R exceeds this fraction of the strongest first-view response. The resulting absolute value t is reused for the second view.'),param('NMS radius',`${s.nms} px`,'Step 4 keeps a candidate only if it has the largest R in its (2r + 1) × (2r + 1) neighborhood, so two kept corners are always more than r px apart. A radius above ⌈3σ⌉ + 2 also widens the skipped border band, as scikit-image’s corner_peaks does by default.'),param('Second view',`${s.rotation}° · ${s.scale}% · contrast ${s.contrast}%`,`Rotates, rescales, and changes the contrast of the loaded image before running the identical detector. Repeatability is the share of first-view corners that land in the second view’s search area (outside its skipped border band) and pair one-to-one with a second-view corner within ${HARRIS_MATCH_TOLERANCE} px (in second-view pixels) of their transformed position.`)],links:[link('Harris corner detector',WIKI.harris),link('Structure tensor',WIKI.structureTensor),link('Corner detection',WIKI.cornerDetection),link('Non-maximum suppression',WIKI.harrisNms)]};
  if(id==='greedyNms')return nmsGuide(s);
  if(id==='anms')return{overview:'Candidates are Harris corners (σ = 1.5, κ = 0.05) that are local maxima in a 3 × 3 neighborhood, with R above 0.01% of the maximum, at least 6 px from the border, capped at the strongest 4000. Strongest-N sorts them by response; adaptive NMS sorts them by suppression radius, the distance to the nearest candidate whose response exceeds c times their own.',params:[param('Keypoints kept',`N = ${s.budget}`,'The keypoint budget. Panels (a) and (c) keep N points; panels (b) and (d) keep 2N, as on the slide.'),param('Robustness factor',`c = ${s.robustness.toFixed(2)}`,'A neighbor suppresses a candidate only if its response exceeds c times the candidate’s. Brown et al. write the condition as f(xᵢ) < 0.9 f(xⱼ), which is c ≈ 1.1 here: only a clearly stronger neighbor counts. Larger c keeps more similar-strength neighbors side by side.'),param('Radius r','smallest kept radius','The caption of each ANMS panel reports the N-th largest suppression radius: every kept point is at least r away from any candidate more than c times stronger. It is not the spacing of the kept points: at c > 1 two kept points of similar strength can be closer than r, and at c = 1 r is a lower bound on the spacing between kept points of different strength.')],links:[link('Brown, Szeliski and Winder 2005 (MOPS)','https://www.microsoft.com/en-us/research/publication/multi-image-matching-using-multi-scale-oriented-patches/'),link('Szeliski: Computer Vision, 2nd ed.','https://szeliski.org/Book/'),link('Harris corner detector',WIKI.harris),link('Non-maximum suppression',WIKI.harrisNms)]};
  if(id==='siftDescriptor')return siftGuide(s);
  if(id==='ratioTest')return ratioGuide(s);
  if(id==='opticalFlow')return{overview:'The same Sintel adjacent pair and the same detected points feed both Lucas–Kanade variants, with the same 17 × 17 window, iteration budget and validity test (window residual plus a forward–backward check). Extra motion changes only the teaching stress test; the GT panel stays tied to the original pair.',params:[param('Extra motion',`${s.extraMotion} px`,'Horizontally shifts the second frame for the comparison panels only; it is not part of the original Sintel ground truth.'),param('Pyramid levels',`${s.pyramidLevels} (L0–L${s.pyramidLevels-1})`,`Number of resolutions including the full-resolution image L0; each further level halves width and height (OpenCV maxLevel = ${s.pyramidLevels-1}). Tracking starts at the smallest level and refines the doubled displacement at each finer level. 1 level = single-scale LK. In the “Why the pyramid helps” diagram, levels run left → right in computation order; thumbnails and the window are drawn at true relative scale, and |d| comes from a fixed ${FLOW_REFERENCE_LEVELS}-level reference run so it does not change with this slider.`),param('Tracked points',s.trackedPoints,'Sets the maximum number of shared corner points used by both LK variants.')],links:[link('Optical flow',WIKI.opticalFlow),link('Lucas–Kanade method',WIKI.lucasKanade),link('Image pyramid',WIKI.imagePyramid)]};
  return null;
}

function syncConditionalControls(id){
  if(id==='effectsExplorer'){
    const s=experiments.find(item=>item.id===id).state;
    const amount=$('#effectAmount')?.closest('.control'),kernel=$('#effectKernel')?.closest('.control');
    if(amount)amount.hidden=!['brightness','gamma','threshold','sharpen'].includes(s.effect);
    if(kernel)kernel.hidden=!['smooth','sharpen','median','maximum'].includes(s.effect);
  }
  if(id==='matrixExplorer'){
    const pooled=experiments.find(item=>item.id===id).state.pooling!=='none';
    if($('#matrixOperation'))$('#matrixOperation').disabled=pooled;
    $$('#kernelMatrix input, .kernel-presets button').forEach(control=>control.disabled=pooled);
  }
  if(id==='doglap'){
    const dog=experiments.find(item=>item.id===id).state.mode==='dog';
    const sigmaOne=$('#dogSigma')?.closest('.control'),sigmaTwo=$('#dogSigma2')?.closest('.control');
    if(sigmaOne)sigmaOne.hidden=!dog;if(sigmaTwo)sigmaTwo.hidden=!dog;
  }
}

function renderParameterGuide(id){
  const guide=guideFor(id);if(!guide)return;
  syncConditionalControls(id);
  root.querySelector('.parameter-guide')?.remove();
  const section=document.createElement('section');section.className='parameter-guide';
  const heading=document.createElement('h3');heading.textContent='Parameters and references';
  const overview=document.createElement('p');overview.className='parameter-overview';overview.textContent=guide.overview;
  const list=document.createElement('div');list.className='parameter-list';
  guide.params.forEach(item=>{
    const row=document.createElement('article');row.className=`parameter-item ${item.active?'':'inactive'}`;
    const title=document.createElement('div');title.className='parameter-title';
    const name=document.createElement('b');name.textContent=item.name;
    const value=document.createElement('code');value.textContent=item.value;
    const status=document.createElement('span');status.textContent=item.active?'Used':'Not used';
    title.append(name,value,status);
    const description=document.createElement('p');description.textContent=item.description;
    row.append(title,description);list.append(row);
  });
  const references=document.createElement('div');references.className='parameter-references';
  const label=document.createElement('span');label.textContent='Learn more:';references.append(label);
  guide.links.forEach(item=>{const anchor=document.createElement('a');anchor.href=item.url;anchor.target='_blank';anchor.rel='noopener noreferrer';anchor.textContent=item.label;references.append(anchor)});
  section.append(heading,overview,list,references);
  const codeSample=root.querySelector('.pseudocode');
  codeSample?root.insertBefore(section,codeSample):root.append(section);
}

function renderPseudocode(id){
  const snippet=SIMPLE_PYTHON_SAMPLES[id];
  if(!snippet)return;
  const section=document.createElement('details');
  section.className='pseudocode';
  section.open=true;
  const summary=document.createElement('summary');
  summary.textContent='Python code sample';
  const pre=document.createElement('pre');
  const code=document.createElement('code');
  code.textContent=snippet.trim();
  pre.append(code);section.append(summary,pre);root.append(section);
}
function activeExperiment(){return experiments.find(x=>x.id===state.active)}
function mount(id){
  activeExperiment()?.destroy?.();
  state.active=id;
  const e=activeExperiment(),i=experiments.indexOf(e);
  $$('.nav-button').forEach(b=>b.classList.toggle('active',b.dataset.id===id));
  $('#experimentIndex').textContent=String(i+1).padStart(2,'0');$('#experimentTitle').textContent=e.title;$('#experimentDescription').textContent=e.description;
  e.mount();renderParameterGuide(e.id);renderPseudocode(e.id);
}
function buildNav(){let group='';$('#experimentNav').innerHTML=experiments.map(e=>{const g=e.group!==group?`<div class="nav-group">${group=e.group}</div>`:'';return `${g}<button class="nav-button" data-id="${e.id}"><i>${e.icon}</i><span>${e.title}</span></button>`}).join('');$('#experimentNav').onclick=e=>{const b=e.target.closest('.nav-button');if(b)mount(b.dataset.id)}}
function sample(){imageRequest++;state.url='sample';const c=state.source;c.width=1000;c.height=700;const x=c.getContext('2d'),g=x.createLinearGradient(0,0,1000,700);g.addColorStop(0,'#f2c94c');g.addColorStop(.5,'#ed654e');g.addColorStop(1,'#3769da');x.fillStyle='#e7e7e1';x.fillRect(0,0,1000,700);x.fillStyle=g;x.fillRect(55,55,890,590);x.fillStyle='#17191d';x.fillRect(100,110,330,480);x.fillStyle='#f5c94c';x.beginPath();x.arc(715,260,145,0,Math.PI*2);x.fill();x.fillStyle='#3569db';x.beginPath();x.arc(755,455,105,0,Math.PI*2);x.fill();x.fillStyle='#ed5c49';x.fillRect(360,285,265,190);x.fillStyle='#fff';x.font='700 65px Arial';x.fillText('CV',155,280);x.fillText('LAB',125,365);state.name='Sample image';state.size=null;sourceChanged()}
function sourceChanged(){state.version++;const template=experiments.find(e=>e.id==='template');template.state.rect=null;template.state.drag=null;experiments.find(e=>e.id==='harris').state.probe=null;experiments.find(e=>e.id==='anms').state.selected=null;const c=$('#thumb');c.width=44;c.height=44;const crop=Math.min(state.source.width,state.source.height);c.getContext('2d').drawImage(state.source,(state.source.width-crop)/2,(state.source.height-crop)/2,crop,crop,0,0,44,44);$('#fileName').textContent=state.name;$('#imageMeta').textContent=`${state.source.width} × ${state.source.height}${state.size?' · '+formatBytes(state.size):''}`;const experiment=activeExperiment();experiment?.destroy?.();experiment?.mount();if(experiment){renderParameterGuide(experiment.id);renderPseudocode(experiment.id)}}
async function load(file){if(!file?.type.startsWith('image/'))return;imageRequest++;const b=await createImageBitmap(file),[w,h]=fit(b.width,b.height);state.source.width=w;state.source.height=h;state.source.getContext('2d').drawImage(b,0,0,w,h);b.close();state.name=file.name;state.size=file.size;state.url=null;sourceChanged()}
let imageRequest=0;
async function loadBundledImage(url,button,name='Selected image'){
  const request=++imageRequest,image=new Image();
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error(`Could not load ${url}`));image.src=url});
  // A later click supersedes an earlier one that is still loading.
  if(request!==imageRequest)return;
  const [w,h]=fit(image.naturalWidth,image.naturalHeight);
  state.source.width=w;state.source.height=h;
  state.source.getContext('2d').drawImage(image,0,0,w,h);
  state.name=name;state.size=null;state.url=url;
  $$('.image-picker-grid button').forEach(item=>item.classList.toggle('selected',item===button));
  closeImagePicker();sourceChanged();
}
function closeImagePicker(){
  $('#imagePicker').hidden=true;
  $('#galleryButton').setAttribute('aria-expanded','false');
}
async function setupGallery(){
  const toggle=$('#galleryButton'),picker=$('#imagePicker'),grid=$('#imagePickerGrid');
  toggle.disabled=true;
  try{
    const response=await fetch('images/manifest.json',{cache:'no-store'});
    if(!response.ok)throw new Error('Image manifest unavailable');
    const urls=await response.json();
    urls.forEach((url,index)=>{
      const button=document.createElement('button');
      button.type='button';button.setAttribute('aria-label',`Select image ${index+1}`);
      const thumbnail=document.createElement('img');
      thumbnail.src=url;thumbnail.alt='';thumbnail.loading='lazy';
      button.append(thumbnail);
      button.addEventListener('click',()=>loadBundledImage(url,button));
      grid.append(button);
    });
    if(!urls.length){toggle.hidden=true;return}
    toggle.disabled=false;
  }catch(error){
    console.warn(error);toggle.hidden=true;
  }
  toggle.addEventListener('click',()=>{
    picker.hidden=!picker.hidden;
    toggle.setAttribute('aria-expanded',String(!picker.hidden));
  });
  document.addEventListener('click',event=>{
    if(!picker.hidden&&!picker.contains(event.target)&&!toggle.contains(event.target))closeImagePicker();
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeImagePicker()});
}
function bindGlobal(){$('#fileInput').onchange=e=>load(e.target.files[0]);$('#sampleButton').onclick=()=>{naturalPhotoApplied=true;sample()};$('#downloadButton').onclick=()=>{if(!state.output)return;const a=document.createElement('a');a.download=`cv-lab-${state.active}.png`;a.href=state.output.toDataURL('image/png');a.click()};['dragenter','dragover'].forEach(n=>document.addEventListener(n,e=>{e.preventDefault();$('#dropZone').classList.add('visible')}));document.addEventListener('dragleave',e=>{if(!e.relatedTarget)$('#dropZone').classList.remove('visible')});document.addEventListener('drop',e=>{e.preventDefault();$('#dropZone').classList.remove('visible');load(e.dataTransfer.files[0])})}

const refreshParameterGuide=()=>queueMicrotask(()=>renderParameterGuide(state.active));
root.addEventListener('input',refreshParameterGuide);
root.addEventListener('change',refreshParameterGuide);

buildNav();bindGlobal();setupGallery();sample();mount('channels');
})();
