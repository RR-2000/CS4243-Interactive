(()=>{
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const clamp=(v,a=0,b=255)=>Math.max(a,Math.min(b,v));
const state={source:document.createElement('canvas'),name:'Sample image',size:null,active:'channels',output:null};
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
{group:'Compression & selection',id:'jpeg',icon:'≋',title:'JPEG compression (L1)',description:'Change JPEG quality and inspect file size and compression artifacts.',state:{quality:72},mount(){root.innerHTML=`<div class="controls">${controlRange('jpegQuality','Quality',1,100,this.state.quality)}</div><div class="results">${card('jpegOriginal','Original')}${card('jpegOutput','Compressed','Encoding…')}</div><div class="stats"><div class="stat"><small>JPEG size</small><b id="jpegSize">—</b></div><div class="stat"><small>Bytes per pixel</small><b id="jpegBpp">—</b></div><div class="stat"><small>Raw size reduction</small><b id="jpegSave">—</b></div></div>`;bindRange('jpegQuality',v=>{this.state.quality=v;this.render()},v=>v+'%');this.render()},render(){canvas('jpegOriginal');clearTimeout(this.timer);this.timer=setTimeout(()=>state.source.toBlob(async blob=>{if(!blob||state.active!=='jpeg')return;const b=await createImageBitmap(blob),c=$('#jpegOutput');c.width=b.width;c.height=b.height;c.getContext('2d').drawImage(b,0,0);b.close();const raw=state.source.width*state.source.height*3;$('#jpegSize').textContent=formatBytes(blob.size);$('#jpegBpp').textContent=(blob.size/(state.source.width*state.source.height)).toFixed(2);$('#jpegSave').textContent=(100-blob.size/raw*100).toFixed(1)+'%';$('.card:nth-child(2) figcaption small').textContent=formatBytes(blob.size);state.output=c},'image/jpeg',this.state.quality/100),80)}},
{group:'Compression & selection',id:'selection',icon:'⌖',title:'Color selection (L1)',description:'Pick a pixel and highlight nearby colors using RGB distance.',state:{color:[239,92,73],tol:40,mode:'isolate',point:null},mount(){root.innerHTML=`<div class="controls">${controlRange('colorTol','Tolerance',1,180,this.state.tol)}<div class="control narrow"><span class="control-label">Mode</span>${segment('selectMode',[['isolate','Isolate'],['overlay','Overlay'],['mask','Mask']],this.state.mode)}</div><div class="control narrow"><span class="control-label">Selected color</span><div class="color-chip" id="colorChip"></div></div></div><div class="results"><div class="picker">${card('selectInput','Click to select a color')}</div>${card('selectOutput','Selection')}</div><div class="stats"><div class="stat"><small>Selected RGB</small><b id="selectedRgb">—</b></div><div class="stat"><small>Pixels matched</small><b id="matchRate">—</b></div></div>`;bindRange('colorTol',v=>{this.state.tol=v;this.render()});bindSegment('selectMode',v=>{this.state.mode=v;this.render()});$('#selectInput').addEventListener('click',e=>this.pick(e));this.render()},pick(e){const c=$('#selectInput'),r=c.getBoundingClientRect(),x=clamp(Math.floor((e.clientX-r.left)/r.width*c.width),0,c.width-1),y=clamp(Math.floor((e.clientY-r.top)/r.height*c.height),0,c.height-1),d=state.source.getContext('2d').getImageData(x,y,1,1).data;this.state.color=[d[0],d[1],d[2]];this.render()},render(){canvas('selectInput');const src=sourceData(),out=new ImageData(new Uint8ClampedArray(src.data),src.width,src.height),[tr,tg,tb]=this.state.color;let n=0;for(let i=0;i<out.data.length;i+=4){const hit=Math.hypot(src.data[i]-tr,src.data[i+1]-tg,src.data[i+2]-tb)<=this.state.tol;if(hit)n++;if(this.state.mode==='isolate'&&!hit){const y=(src.data[i]+src.data[i+1]+src.data[i+2])/3*.22;out.data[i]=out.data[i+1]=out.data[i+2]=y}else if(this.state.mode==='overlay'&&hit){out.data[i]=255;out.data[i+1]=210;out.data[i+2]=20}else if(this.state.mode==='mask'){const v=hit?255:0;out.data[i]=out.data[i+1]=out.data[i+2]=v}}put('selectOutput',out);$('#colorChip').style.background=`rgb(${tr},${tg},${tb})`;$('#selectedRgb').textContent=`${tr}, ${tg}, ${tb}`;$('#matchRate').textContent=(n/(src.width*src.height)*100).toFixed(1)+'%'}},
{group:'Spatial operations',id:'filters',icon:'⊞',title:'Spatial filters (L2)',description:'Apply neighborhood filters with configurable kernel, stride, and border padding.',state:{type:'median',kernel:3,stride:1,padding:'copy',sigma:1},mount(){root.innerHTML=`<div class="controls"><div class="control"><label>Filter</label><select id="filterType"><option value="median">Median</option><option value="max">Maximum</option><option value="gaussian">Gaussian</option><option value="box">Average / box</option></select></div><div class="control"><label>Kernel size</label><select id="kernel"><option>3</option><option>5</option><option>7</option><option>9</option></select></div><div class="control"><label>Stride</label><select id="stride"><option>1</option><option>2</option><option>3</option><option>4</option></select></div><div class="control"><label>Padding</label><select id="padding"><option value="zero">Zero padding</option><option value="copy">Copy padding</option></select></div><div class="control" id="sigmaControl">${controlRange('sigma','Gaussian σ',.2,5,this.state.sigma,.1)}</div></div><div class="results">${card('filterOriginal','Original')}${card('filterOutput','Filtered')}</div><div class="note" id="filterMeta"></div>`;['filterType','kernel','stride','padding'].forEach(id=>{$('#'+id).value=this.state[id==='filterType'?'type':id];$('#'+id).onchange=e=>{this.state[id==='filterType'?'type':id]=id==='filterType'||id==='padding'?e.target.value:+e.target.value;this.render()}});bindRange('sigma',v=>{this.state.sigma=v;this.render()},v=>(+v).toFixed(1));this.render()},render(){canvas('filterOriginal');$('#sigmaControl').style.display=this.state.type==='gaussian'?'block':'none';const work=document.createElement('canvas'),scale=Math.min(1,420/Math.max(state.source.width,state.source.height));work.width=Math.round(state.source.width*scale);work.height=Math.round(state.source.height*scale);work.getContext('2d').drawImage(state.source,0,0,work.width,work.height);const src=work.getContext('2d',{willReadFrequently:true}).getImageData(0,0,work.width,work.height),k=this.state.kernel,s=this.state.stride,p=Math.floor(k/2),ow=Math.ceil(src.width/s),oh=Math.ceil(src.height/s),out=new ImageData(ow,oh),idx=(x,y,c)=>((y*src.width+x)*4+c),sample=(x,y,c)=>{if(this.state.padding==='zero'&&(x<0||y<0||x>=src.width||y>=src.height))return 0;x=clamp(x,0,src.width-1);y=clamp(y,0,src.height-1);return src.data[idx(x,y,c)]};let weights=null;if(this.state.type==='gaussian'){weights=[];let total=0;for(let dy=-p;dy<=p;dy++)for(let dx=-p;dx<=p;dx++){const w=Math.exp(-(dx*dx+dy*dy)/(2*this.state.sigma**2));weights.push(w);total+=w}weights=weights.map(w=>w/total)}for(let oy=0;oy<oh;oy++)for(let ox=0;ox<ow;ox++){for(let c=0;c<3;c++){const vals=[];let weighted=0,wi=0;for(let dy=-p;dy<=p;dy++)for(let dx=-p;dx<=p;dx++){const v=sample(ox*s+dx,oy*s+dy,c);vals.push(v);if(weights)weighted+=v*weights[wi++]};let v;if(this.state.type==='median'){vals.sort((a,b)=>a-b);v=vals[Math.floor(vals.length/2)]}else if(this.state.type==='max')v=Math.max(...vals);else if(this.state.type==='gaussian')v=weighted;else v=vals.reduce((a,b)=>a+b,0)/vals.length;out.data[(oy*ow+ox)*4+c]=v}out.data[(oy*ow+ox)*4+3]=255}put('filterOutput',out);$('#filterMeta').textContent=`Processing resolution: ${src.width} × ${src.height}. Output: ${ow} × ${oh}. Kernel: ${k} × ${k}. Stride: ${s}. ${this.state.padding==='zero'?'Out-of-image samples are zero.':'Border samples copy the nearest pixel.'}`}},
{group:'Lines & edges',id:'doglap',icon:'∇²',title:'DoG and Laplacian (L3)',description:'Compare Difference of Gaussians with the second-derivative Laplacian operator.',state:{mode:'dog',sigma:1,sigma2:2},mount(){root.innerHTML=`<div class="controls"><div class="control narrow"><span class="control-label">Operator</span>${segment('edgeOperator',[['dog','Difference of Gaussians'],['laplace','Laplacian']],this.state.mode)}</div>${controlRange('dogSigma','σ₁',.4,4,this.state.sigma,.1)}<div id="sigmaTwo" class="control">${controlRange('dogSigma2','σ₂',.5,7,this.state.sigma2,.1)}</div></div><div class="results">${card('dogOriginal','Original')}${card('dogOutput','Edge response')}</div><div class="note" id="dogNote"></div>`;bindSegment('edgeOperator',v=>{this.state.mode=v;this.render();renderParameterGuide('doglap')});bindRange('dogSigma',v=>{this.state.sigma=v;this.render()},v=>(+v).toFixed(1));bindRange('dogSigma2',v=>{this.state.sigma2=v;this.render()},v=>(+v).toFixed(1));this.render()},render(){canvas('dogOriginal');const dog=this.state.mode==='dog',sigmaOne=$('#dogSigma').closest('.control'),sigmaTwo=$('#sigmaTwo');sigmaOne.hidden=!dog;sigmaTwo.hidden=!dog;const g=workingGray(520);let values;if(dog){const a=gaussian(g.data,g.w,g.h,this.state.sigma),b=gaussian(g.data,g.w,g.h,Math.max(this.state.sigma+.1,this.state.sigma2));values=new Float32Array(a.length);for(let i=0;i<a.length;i++)values[i]=a[i]-b[i];$('#dogNote').textContent='DoG uses σ₁ and σ₂ to create two Gaussian blurs, then subtracts the wider blur from the narrower blur.'}else{values=convolveGray(g.data,g.w,g.h,[0,1,0,1,-4,1,0,1,0],3);$('#dogNote').textContent='Plain Laplacian uses the fixed 3 × 3 kernel [[0, 1, 0], [1, −4, 1], [0, 1, 0]]. It does not use σ₁ or σ₂.'}scalarImage('dogOutput',values,g.w,g.h,true)}},
{group:'Lines & edges',id:'sobel',icon:'∠',title:'Sobel filters (L3)',description:'Estimate horizontal and vertical image derivatives and combine them into gradient magnitude.',state:{scale:1},mount(){root.innerHTML=`<div class="controls">${controlRange('sobelScale','Display gain',.25,4,this.state.scale,.05)}</div><div class="results three">${card('sobelX','Gx · vertical edges')}${card('sobelY','Gy · horizontal edges')}${card('sobelMagnitude','Gradient magnitude')}</div><div class="note">Sobel combines smoothing and differentiation. The direction is atan2(Gy, Gx); magnitude is √(Gx² + Gy²).</div>`;bindRange('sobelScale',v=>{this.state.scale=v;this.render()},v=>(+v).toFixed(2));this.render()},render(){const g=workingGray(520),s=sobelField(g.data,g.w,g.h);responseImage('sobelX',s.gx,g.w,g.h,this.state.scale,true);responseImage('sobelY',s.gy,g.w,g.h,this.state.scale,true);responseImage('sobelMagnitude',s.mag,g.w,g.h,this.state.scale,false)}},
{group:'Lines & edges',id:'canny',icon:'⌁',title:'Canny edge detection (L3)',description:'Smooth, differentiate, suppress non-maxima, then link edges using two thresholds.',state:{nms:1,low:35,high:85,sigma:1.2},mount(){root.innerHTML=`<div class="controls">${controlRange('cannyNms','NMS radius',1,4,this.state.nms)}${controlRange('cannyLow','Low threshold',1,180,this.state.low)}${controlRange('cannyHigh','High threshold',10,255,this.state.high)}${controlRange('cannySigma','Blur σ',.4,3,this.state.sigma,.1)}</div><div class="results three">${card('cannyGradient','Gradient magnitude')}${card('cannyNmsOut','After NMS')}${card('cannyEdges','Linked edges')}</div><div class="note">NMS radius controls how far Canny looks along the gradient direction when retaining only local peaks.</div>`;[['cannyNms','nms'],['cannyLow','low'],['cannyHigh','high'],['cannySigma','sigma']].forEach(([id,key])=>bindRange(id,v=>{this.state[key]=v;if(this.state.low>this.state.high)this.state.low=this.state.high;this.render()},key==='sigma'?v=>(+v).toFixed(1):v=>v));this.render()},render(){const g=workingGray(500),result=cannyCompute(g,this.state);scalarImage('cannyGradient',result.mag,g.w,g.h,false);scalarImage('cannyNmsOut',result.nms,g.w,g.h,false);binaryImage('cannyEdges',result.edges,g.w,g.h)}},
{group:'Lines & edges',id:'hough',icon:'╱',title:'Hough line detection (L3)',description:'Vote for candidate lines in (ρ, θ) space and draw the strongest accumulator peaks.',state:{edgeThreshold:95,voteThreshold:48,lines:12},mount(){root.innerHTML=`<div class="controls">${controlRange('houghEdge','Edge threshold',20,220,this.state.edgeThreshold)}${controlRange('houghVote','Peak threshold',10,90,this.state.voteThreshold,1)}${controlRange('houghLines','Maximum lines',1,30,this.state.lines)}</div><div class="results">${card('houghOverlay','Detected lines')}${card('houghSpace','Hough accumulator','horizontal: θ · vertical: ρ')}</div><div class="stats"><div class="stat"><small>Edge points</small><b id="houghPoints">—</b></div><div class="stat"><small>Accumulator peak</small><b id="houghPeak">—</b></div><div class="stat"><small>Lines retained</small><b id="houghCount">—</b></div></div>`;[['houghEdge','edgeThreshold'],['houghVote','voteThreshold'],['houghLines','lines']].forEach(([id,key])=>bindRange(id,v=>{this.state[key]=v;this.render()}));this.render()},render(){const g=workingGray(360),s=sobelField(gaussian(g.data,g.w,g.h,1),g.w,g.h),thetaBins=120,diag=Math.ceil(Math.hypot(g.w,g.h)),rhoBins=diag*2+1,acc=new Uint32Array(thetaBins*rhoBins),cos=new Float32Array(thetaBins),sin=new Float32Array(thetaBins),points=[];for(let t=0;t<thetaBins;t++){const angle=t*Math.PI/thetaBins;cos[t]=Math.cos(angle);sin[t]=Math.sin(angle)}for(let y=1;y<g.h-1;y++)for(let x=1;x<g.w-1;x++)if(s.mag[y*g.w+x]>=this.state.edgeThreshold)points.push([x,y]);const step=Math.max(1,Math.ceil(points.length/12000));for(let p=0;p<points.length;p+=step){const[x,y]=points[p];for(let t=0;t<thetaBins;t++){const r=Math.round(x*cos[t]+y*sin[t])+diag;acc[r*thetaBins+t]++}}let peak=0;for(const v of acc)peak=Math.max(peak,v);const cutoff=peak*this.state.voteThreshold/100,candidates=[];for(let r=2;r<rhoBins-2;r++)for(let t=0;t<thetaBins;t++){const v=acc[r*thetaBins+t];if(v<cutoff)continue;let local=true;for(let dr=-2;dr<=2&&local;dr++)for(let dt=-2;dt<=2;dt++){const tt=(t+dt+thetaBins)%thetaBins;if(acc[(r+dr)*thetaBins+tt]>v){local=false;break}}if(local)candidates.push({r:r-diag,t,v})}candidates.sort((a,b)=>b.v-a.v);const lines=[];for(const q of candidates){if(lines.some(l=>Math.abs(l.r-q.r)<9&&Math.min(Math.abs(l.t-q.t),thetaBins-Math.abs(l.t-q.t))<5))continue;lines.push(q);if(lines.length>=this.state.lines)break}const out=$('#houghOverlay');out.width=g.w;out.height=g.h;const ctx=out.getContext('2d');ctx.drawImage(g.canvas,0,0);ctx.lineWidth=Math.max(1,g.w/300);ctx.strokeStyle='#ff3b30';for(const l of lines){const c=cos[l.t],sn=sin[l.t],x0=c*l.r,y0=sn*l.r;ctx.beginPath();ctx.moveTo(x0+1000*(-sn),y0+1000*c);ctx.lineTo(x0-1000*(-sn),y0-1000*c);ctx.stroke()}const heat=new ImageData(thetaBins,rhoBins);for(let i=0;i<acc.length;i++){const t=Math.sqrt(acc[i]/(peak||1)),[r,gg,b]=heatColor(t);heat.data[i*4]=r;heat.data[i*4+1]=gg;heat.data[i*4+2]=b;heat.data[i*4+3]=255}put('houghSpace',heat);state.output=out;$('#houghPoints').textContent=points.length.toLocaleString();$('#houghPeak').textContent=peak;$('#houghCount').textContent=lines.length}},
{group:'Matching',id:'template',icon:'▣',title:'Template matching (L2)',description:'Drag a patch, then compare regular cross-correlation with normalized zero-mean correlation.',state:{rect:null,drag:null},mount(){root.innerHTML=`<div class="instruction">Drag over the source image to select a template patch. For responsiveness, matching is computed on a reduced grayscale image.</div><div class="template-layout"><div class="picker">${card('templateSource','Drag to select template')}<div class="stats"><div class="stat"><small>Patch</small><b id="patchSize">Not selected</b></div></div></div><div class="template-results">${card('ccHeat','Cross-correlation heatmap')}${card('znccHeat','Zero-mean normalized CC heatmap')}</div></div>`;const c=$('#templateSource');c.addEventListener('pointerdown',e=>this.down(e));c.addEventListener('pointermove',e=>this.move(e));c.addEventListener('pointerup',e=>this.up(e));this.renderSource()},renderSource(){canvas('templateSource');const box=$('#templateSource').parentElement,rect=document.createElement('span');rect.className='patch-rect';rect.id='patchRect';box.append(rect);if(this.state.rect)this.showRect()},point(e){const c=$('#templateSource'),r=c.getBoundingClientRect();return{x:clamp((e.clientX-r.left)/r.width*c.width,0,c.width),y:clamp((e.clientY-r.top)/r.height*c.height,0,c.height)}},down(e){e.currentTarget.setPointerCapture(e.pointerId);this.state.drag=this.point(e)},move(e){if(!this.state.drag)return;const p=this.point(e),a=this.state.drag;this.state.rect={x:Math.min(a.x,p.x),y:Math.min(a.y,p.y),w:Math.abs(a.x-p.x),h:Math.abs(a.y-p.y)};this.showRect()},up(e){if(!this.state.drag)return;this.move(e);this.state.drag=null;if(this.state.rect.w<8||this.state.rect.h<8){this.state.rect=null;$('#patchRect').style.display='none';return}this.match()},showRect(){const c=$('#templateSource'),r=c.getBoundingClientRect(),b=c.parentElement.getBoundingClientRect(),q=this.state.rect,m=$('#patchRect');m.style.display='block';m.style.left=(r.left-b.left+q.x/c.width*r.width)+'px';m.style.top=(r.top-b.top+q.y/c.height*r.height)+'px';m.style.width=(q.w/c.width*r.width)+'px';m.style.height=(q.h/c.height*r.height)+'px';$('#patchSize').textContent=`${Math.round(q.w)} × ${Math.round(q.h)}`},match(){const sourceGray=grayData(),scale=Math.min(1,320/sourceGray.width),w=Math.max(1,Math.round(sourceGray.width*scale)),h=Math.max(1,Math.round(sourceGray.height*scale)),tmp=document.createElement('canvas');tmp.width=w;tmp.height=h;const orig=document.createElement('canvas');orig.width=sourceGray.width;orig.height=sourceGray.height;orig.getContext('2d').putImageData(sourceGray,0,0);tmp.getContext('2d').drawImage(orig,0,0,w,h);const data=tmp.getContext('2d').getImageData(0,0,w,h).data,q=this.state.rect,rx=Math.round(q.x*scale),ry=Math.round(q.y*scale),rw=clamp(Math.round(q.w*scale),3,Math.min(55,w-rx)),rh=clamp(Math.round(q.h*scale),3,Math.min(55,h-ry));if(rw<3||rh<3)return;const patch=[],step=Math.max(1,Math.ceil(Math.max(rw,rh)/35));for(let y=0;y<rh;y+=step)for(let x=0;x<rw;x+=step)patch.push(data[((ry+y)*w+rx+x)*4]);const meanT=patch.reduce((a,b)=>a+b,0)/patch.length,devT=patch.map(v=>v-meanT),normT=Math.sqrt(devT.reduce((a,b)=>a+b*b,0))||1,cc=new Float32Array(w*h),zn=new Float32Array(w*h);let minCC=Infinity,maxCC=-Infinity,minZN=Infinity,maxZN=-Infinity;for(let y=0;y<=h-rh;y++)for(let x=0;x<=w-rw;x++){let sum=0,mean=0,n=0;for(let j=0;j<rh;j+=step)for(let i=0;i<rw;i+=step){mean+=data[((y+j)*w+x+i)*4];n++}mean/=n;let numerator=0,norm=0,k=0;for(let j=0;j<rh;j+=step)for(let i=0;i<rw;i+=step){const v=data[((y+j)*w+x+i)*4],d=v-mean;sum+=v*patch[k];numerator+=d*devT[k];norm+=d*d;k++}const pos=y*w+x,z=numerator/(Math.sqrt(norm)*normT||1);cc[pos]=sum;zn[pos]=z;minCC=Math.min(minCC,sum);maxCC=Math.max(maxCC,sum);minZN=Math.min(minZN,z);maxZN=Math.max(maxZN,z)}this.heat('ccHeat',cc,w,h,minCC,maxCC);this.heat('znccHeat',zn,w,h,minZN,maxZN);state.output=$('#znccHeat')},heat(id,values,w,h,min,max){const out=new ImageData(w,h);for(let i=0;i<values.length;i++){const t=clamp((values[i]-min)/(max-min||1),0,1),[r,g,b]=heatColor(t);out.data[i*4]=r;out.data[i*4+1]=g;out.data[i*4+2]=b;out.data[i*4+3]=255}put(id,out)}}
, {
  group:'Motion',
  id:'opticalFlow',
  icon:'↝',
  title:'Optical flow: single vs multi-scale',
  description:'Track the same Sintel motion with single-scale and pyramidal Lucas–Kanade.',
  state:{extraMotion:24,pyramidLevels:3,trackedPoints:220},
  mount(){mountOpticalFlow(this)},
  destroy(){destroyOpticalFlow(this)}
}
];

const FLOW_PROC_WIDTH=420;
const FLOW_WINDOW=17;
const flowRuntime={token:0,raf:0,ready:false,img1:null,img2:null,gt:null,frameA:null,frameB:null,points:[],single:[],multi:[]};

function flowMetric(label,id){
  return `<div class="flow-metric"><small>${label}</small><b id="${id}">—</b></div>`;
}

function flowCard(id,title,description,badge,metrics='',footer=''){
  const meta=id==='flowSource'?'Sintel':id==='flowGt'?'reference':'Lucas–Kanade';
  return `<figure class="card flow-card"><figcaption><span>${title}</span><small>${meta}</small></figcaption><div class="flow-sub">${description}</div><div class="canvas-box flow-media"><canvas id="${id}" aria-label="${title}"></canvas><span class="flow-badge">${badge}</span></div>${metrics?`<div class="flow-metrics">${metrics}</div>`:''}${footer}</figure>`;
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
  root.innerHTML=`<div class="controls flow-controls">
    ${controlRange('flowExtraMotion','Extra motion',0,36,s.extraMotion,2)}
    ${controlRange('flowPyramidLevels','Pyramid levels',1,4,s.pyramidLevels)}
    ${controlRange('flowTrackedPoints','Tracked points',80,360,s.trackedPoints,20)}
  </div>
  <div class="flow-grid flow-top-grid">
    ${flowCard('flowSource','Original Sintel motion','Animated adjacent frame pair. This is the unmodified source motion.','original adjacent pair')}
    ${flowCard('flowGt','GT dense flow','Reference answer for the original adjacent pair. Color encodes the dense ground-truth motion field.','GT for original pair only')}
  </div>
  <div class="note flow-notice"><b>Teaching stress test:</b> <b>Extra motion</b> shifts the second frame only for the comparison panels below. The GT dense flow above remains the ground truth for the <b>original adjacent Sintel pair</b>; it is not recalculated for the stressed pair.</div>
  <div class="flow-grid flow-bottom-grid">
    ${flowCard('flowSingle','Single-scale Lucas–Kanade','Full resolution only. <span class="flow-key flow-key-cyan">Cyan arrows</span> are estimates; <span class="flow-key flow-key-red">red rings</span> mark points the pyramid recovers.','full resolution · zero initialization',`${flowMetric('tracked points','flowSingleTracks')}${flowMetric('median displacement','flowSingleMedian')}`)}
    ${flowCard('flowMulti','Multi-scale / pyramidal Lucas–Kanade','The same points and same pair. <span class="flow-key flow-key-green">Green arrows</span> are valid estimates; <span class="flow-key flow-key-yellow">yellow arrows</span> are correspondences recovered by the pyramid.','coarse → fine',`${flowMetric('tracked points','flowMultiTracks')}${flowMetric('recovered by pyramid','flowRecovered')}`)}
    ${flowCard('flowPyramid','Why the pyramid helps','Downsampling makes the same displacement smaller in pixel units, so local linearization becomes easier before the estimate is refined at full resolution.','same motion · smaller at coarse scale','',`<div class="flow-formula" id="flowScaleFormula">24 px → 12 px → 6 px → 3 px</div>`)}
  </div>
  <div class="flow-status" id="flowStatus" role="status">Loading Sintel frames and computing the comparison…</div>
  <div class="note flow-takeaway"><b>Classroom takeaway:</b> start at <b>Extra motion = 0 px</b>, then increase it toward <b>20–30 px</b>. Single-scale LK should lose more correspondences as displacement grows, while pyramidal LK can initialize the motion at a coarse level and refine it at finer levels.</div>
  <div class="flow-source-note">Source frames and dense-flow visualization: <a href="https://github.com/open-mmlab/mmflow/tree/master/demo" target="_blank" rel="noopener noreferrer">MMFlow Sintel demo</a>. The extra translation is an explicit teaching stress test applied identically to both LK variants.</div>`;

  bindRange('flowExtraMotion',value=>{experiment.state.extraMotion=value;computeOpticalFlow(experiment,token)},value=>`${value} px`);
  bindRange('flowPyramidLevels',value=>{experiment.state.pyramidLevels=value;computeOpticalFlow(experiment,token)});
  bindRange('flowTrackedPoints',value=>{experiment.state.trackedPoints=value;computeOpticalFlow(experiment,token)});
  $('#flowExtraMotionOut').textContent=`${s.extraMotion} px`;
  initializeOpticalFlow(experiment,token);
}

function destroyOpticalFlow(){
  flowRuntime.token++;
  if(flowRuntime.raf)cancelAnimationFrame(flowRuntime.raf);
  flowRuntime.raf=0;flowRuntime.ready=false;flowRuntime.img1=null;flowRuntime.img2=null;flowRuntime.gt=null;
  flowRuntime.frameA=null;flowRuntime.frameB=null;flowRuntime.points=[];flowRuntime.single=[];flowRuntime.multi=[];
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

function drawFlowImage(id,image){
  const canvasElement=$('#'+id);if(!canvasElement)return;
  canvasElement.width=image.naturalWidth||image.width;canvasElement.height=image.naturalHeight||image.height;
  const context=canvasElement.getContext('2d');context.clearRect(0,0,canvasElement.width,canvasElement.height);context.drawImage(image,0,0,canvasElement.width,canvasElement.height);
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

function downsampleFlow(values,w,h){
  const nw=Math.max(2,Math.floor(w/2)),nh=Math.max(2,Math.floor(h/2)),out=new Float32Array(nw*nh);
  for(let y=0;y<nh;y++)for(let x=0;x<nw;x++){
    const x0=Math.min(w-1,2*x),y0=Math.min(h-1,2*y),x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1);
    out[y*nw+x]=(values[y0*w+x0]+values[y0*w+x1]+values[y1*w+x0]+values[y1*w+x1])*.25;
  }
  return{gray:out,w:nw,h:nh};
}

function flowPyramid(frame,levels){
  const pyramid=[frame];
  for(let level=0;level<levels;level++)pyramid.push(downsampleFlow(pyramid[pyramid.length-1].gray,pyramid[pyramid.length-1].w,pyramid[pyramid.length-1].h));
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

function lkFlowLevel(a,b,w,h,x,y,u0,v0,radius,iterations){
  let u=u0,v=v0,residual=.5,valid=true;
  const stride=radius>7?2:1;
  for(let iteration=0;iteration<iterations;iteration++){
    let A=0,B=0,C=0,D=0,E=0,error=0,samples=0;
    for(let dy=-radius;dy<=radius;dy+=stride)for(let dx=-radius;dx<=radius;dx+=stride){
      const px=x+dx,py=y+dy,qx=px+u,qy=py+v,i1=flowSample(a,w,h,px,py),i2=flowSample(b,w,h,qx,qy);
      if(!Number.isFinite(i1)||!Number.isFinite(i2))continue;
      const ix=(flowSample(b,w,h,qx+1,qy)-flowSample(b,w,h,qx-1,qy))*.5,iy=(flowSample(b,w,h,qx,qy+1)-flowSample(b,w,h,qx,qy-1))*.5;
      if(!Number.isFinite(ix)||!Number.isFinite(iy))continue;
      const temporal=i2-i1;A+=ix*ix;B+=ix*iy;C+=iy*iy;D+=-ix*temporal;E+=-iy*temporal;error+=Math.abs(temporal);samples++;
    }
    if(samples<12){valid=false;break}
    const determinant=A*C-B*B;
    if(determinant<1e-5){valid=false;break}
    let du=(C*D-B*E)/determinant,dv=(A*E-B*D)/determinant,magnitude=Math.hypot(du,dv);
    if(magnitude>2.5){du*=2.5/magnitude;dv*=2.5/magnitude}
    u+=du;v+=dv;residual=error/samples;
    if(Math.hypot(du,dv)<.025)break;
  }
  if(!Number.isFinite(u)||!Number.isFinite(v)||residual>.23)valid=false;
  return{u,v,residual,valid};
}

function trackSingleFlow(frameA,frameB,points){
  const radius=Math.floor(FLOW_WINDOW/2);
  return points.map(point=>({x:point.x,y:point.y,...lkFlowLevel(frameA.gray,frameB.gray,frameA.w,frameA.h,point.x,point.y,0,0,radius,5)}));
}

function trackMultiFlow(frameA,frameB,points,levels){
  const pyramidA=flowPyramid(frameA,levels),pyramidB=flowPyramid(frameB,levels);
  return points.map(point=>{
    let u=0,v=0,residual=.5,valid=true;
    for(let level=levels;level>=0;level--){
      if(level<levels){u*=2;v*=2}
      const scale=2**level,result=lkFlowLevel(pyramidA[level].gray,pyramidB[level].gray,pyramidA[level].w,pyramidA[level].h,point.x/scale,point.y/scale,u,v,Math.max(3,Math.floor(FLOW_WINDOW/2)),5);
      u=result.u;v=result.v;residual=result.residual;
      if(!result.valid){valid=false;break}
    }
    return{x:point.x,y:point.y,u,v,residual,valid};
  });
}

function flowRecovered(index){
  const single=flowRuntime.single[index],multi=flowRuntime.multi[index];
  return Boolean(multi?.valid&&(!single?.valid||(single.residual>multi.residual*1.65&&multi.residual<.18)));
}

function flowMedian(values){
  if(!values.length)return 0;
  const sorted=[...values].sort((a,b)=>a-b),middle=sorted.length>>1;
  return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
}

function drawFlowArrow(context,x,y,u,v,progress,color,width){
  const gain=1.5,endX=x+u*gain*progress,endY=y+v*gain*progress,angle=Math.atan2(v,u),head=4;
  context.strokeStyle=color;context.fillStyle=color;context.lineWidth=width;context.beginPath();context.moveTo(x,y);context.lineTo(endX,endY);context.stroke();
  if(progress>.75){context.beginPath();context.moveTo(endX,endY);context.lineTo(endX-head*Math.cos(angle-.55),endY-head*Math.sin(angle-.55));context.lineTo(endX-head*Math.cos(angle+.55),endY-head*Math.sin(angle+.55));context.closePath();context.fill()}
}

function drawFlowPanel(id,tracks,isMulti,progress){
  const canvasElement=$('#'+id);if(!canvasElement||!flowRuntime.frameA)return;
  canvasElement.width=flowRuntime.frameA.w;canvasElement.height=flowRuntime.frameA.h;
  const context=canvasElement.getContext('2d');context.drawImage(flowRuntime.frameA.canvas,0,0);context.fillStyle='rgba(0,0,0,.28)';context.fillRect(0,0,canvasElement.width,canvasElement.height);
  for(let index=0;index<tracks.length;index++){
    const track=tracks[index];
    if(track.valid){
      const recovered=isMulti&&flowRecovered(index),color=recovered?'#ffd84d':(isMulti?'#3ddc84':'#4dd8ff');
      drawFlowArrow(context,track.x,track.y,track.u,track.v,progress,color,recovered?2.2:1.2);
    }else if(!isMulti&&flowRecovered(index)){
      context.strokeStyle='#ff5a5f';context.lineWidth=1.7;context.beginPath();context.arc(track.x,track.y,3.1,0,Math.PI*2);context.stroke();
    }
  }
}

function drawFlowPyramid(){
  const canvasElement=$('#flowPyramid');if(!canvasElement||!flowRuntime.frameA)return;
  const width=flowRuntime.frameA.w,height=flowRuntime.frameA.h,levels=experiments.find(experiment=>experiment.id==='opticalFlow').state.pyramidLevels,motion=experiments.find(experiment=>experiment.id==='opticalFlow').state.extraMotion;
  canvasElement.width=width;canvasElement.height=height;
  const context=canvasElement.getContext('2d');context.fillStyle='#17191d';context.fillRect(0,0,width,height);
  const maxWidth=width-44,maxHeight=height-42;
  for(let level=0;level<=levels;level++){
    const scale=1/(2**level),boxWidth=maxWidth*scale,boxHeight=maxHeight*scale,x=22+(maxWidth-boxWidth)/2,y=16+(maxHeight-boxHeight)/2;
    context.strokeStyle=level===0?'#dbeafe':`hsl(${205+level*22} 90% 65%)`;context.lineWidth=1.5;context.strokeRect(x,y,boxWidth,boxHeight);
    context.fillStyle='#fff';context.font='11px monospace';context.fillText(level===0?`full: ${motion}px`:`level ${level}: ${(motion/(2**level)).toFixed(motion%(2**level)?1:0)}px`,x+5,y+14);
  }
  context.fillStyle='#dbeafe';context.font='bold 13px Arial';context.fillText('same displacement → fewer pixels at coarse scale',18,height-10);
  const values=[];for(let level=0;level<=levels;level++){const scaled=motion/(2**level);values.push(`${Number.isInteger(scaled)?scaled:scaled.toFixed(1)} px`)}
  $('#flowScaleFormula').textContent=values.join(' → ');
}

function updateFlowMetrics(){
  const singleValid=flowRuntime.single.filter(track=>track.valid),multiValid=flowRuntime.multi.filter(track=>track.valid);let recovered=0;
  for(let index=0;index<flowRuntime.multi.length;index++)if(flowRecovered(index))recovered++;
  $('#flowSingleTracks').textContent=singleValid.length;$('#flowMultiTracks').textContent=multiValid.length;$('#flowSingleMedian').textContent=`${(flowMedian(singleValid.map(track=>Math.hypot(track.u,track.v)))||0).toFixed(1)} px`;$('#flowRecovered').textContent=recovered;
}

function computeOpticalFlow(experiment,token=flowRuntime.token){
  if(!flowRuntime.ready||token!==flowRuntime.token||state.active!=='opticalFlow')return;
  const {extraMotion,pyramidLevels,trackedPoints}=experiment.state;
  flowRuntime.frameA=makeFlowFrame(flowRuntime.img1,0);flowRuntime.frameB=makeFlowFrame(flowRuntime.img2,extraMotion);
  flowRuntime.points=detectFlowCorners(flowRuntime.frameA.gray,flowRuntime.frameA.w,flowRuntime.frameA.h,trackedPoints);
  flowRuntime.single=trackSingleFlow(flowRuntime.frameA,flowRuntime.frameB,flowRuntime.points);
  flowRuntime.multi=trackMultiFlow(flowRuntime.frameA,flowRuntime.frameB,flowRuntime.points,pyramidLevels);
  const multiBadge=$('#flowMulti')?.parentElement?.querySelector('.flow-badge');
  if(multiBadge)multiBadge.textContent=`${pyramidLevels+1} resolutions · coarse → fine`;
  updateFlowMetrics();drawFlowPyramid();drawFlowPanel('flowSingle',flowRuntime.single,false,.9);drawFlowPanel('flowMulti',flowRuntime.multi,true,.9);state.output=$('#flowMulti');
  $('#flowStatus').textContent=`Ready · ${flowRuntime.points.length} shared points · extra motion ${extraMotion}px · same stressed input used for both LK variants.`;
}

function drawOriginalFlowFrame(progress){
  const canvasElement=$('#flowSource');if(!canvasElement||!flowRuntime.img1||!flowRuntime.img2)return;
  const width=flowRuntime.img1.naturalWidth||flowRuntime.img1.width,height=flowRuntime.img1.naturalHeight||flowRuntime.img1.height;canvasElement.width=width;canvasElement.height=height;
  const context=canvasElement.getContext('2d');context.fillStyle='#111317';context.fillRect(0,0,width,height);context.globalAlpha=1;context.drawImage(flowRuntime.img1,0,0,width,height);context.globalAlpha=progress;context.drawImage(flowRuntime.img2,0,0,width,height);context.globalAlpha=1;
}

function animateOpticalFlow(timestamp,token){
  if(token!==flowRuntime.token||state.active!=='opticalFlow')return;
  const phase=(timestamp%1500)/1500,progress=.15+.85*(.5-.5*Math.cos(phase*Math.PI*2));
  drawOriginalFlowFrame(progress);
  if(flowRuntime.ready){drawFlowPanel('flowSingle',flowRuntime.single,false,progress);drawFlowPanel('flowMulti',flowRuntime.multi,true,progress)}
  flowRuntime.raf=requestAnimationFrame(next=>animateOpticalFlow(next,token));
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

  opticalFlow:`import cv2
import numpy as np

def compare_lucas_kanade(frame_a, frame_b, pyramid_levels=3):
    gray_a = cv2.cvtColor(frame_a, cv2.COLOR_RGB2GRAY)
    gray_b = cv2.cvtColor(frame_b, cv2.COLOR_RGB2GRAY)
    corners = cv2.goodFeaturesToTrack(gray_a, maxCorners=220, qualityLevel=0.01, minDistance=7)
    single, _, _ = cv2.calcOpticalFlowPyrLK(gray_a, gray_b, corners, None, maxLevel=0)
    multi, _, _ = cv2.calcOpticalFlowPyrLK(gray_a, gray_b, corners, None, maxLevel=pyramid_levels)
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
  nms:'https://en.wikipedia.org/wiki/Non-maximum_suppression',
  hough:'https://en.wikipedia.org/wiki/Hough_transform',
  template:'https://en.wikipedia.org/wiki/Template_matching',
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
  if(id==='opticalFlow')return{overview:'The same Sintel adjacent pair and the same detected points feed both Lucas–Kanade variants. Extra motion changes only the teaching stress test; the GT panel stays tied to the original pair.',params:[param('Extra motion',`${s.extraMotion} px`,'Horizontally shifts the second frame for the comparison panels only; it is not part of the original Sintel ground truth.'),param('Pyramid levels',s.pyramidLevels,'Adds coarser resolutions before the full-resolution refinement. The display shows one more resolution than the number of downsampling steps.'),param('Tracked points',s.trackedPoints,'Sets the maximum number of shared corner points used by both LK variants.')],links:[link('Optical flow',WIKI.opticalFlow),link('Lucas–Kanade method',WIKI.lucasKanade),link('Image pyramid',WIKI.imagePyramid)]};
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
function sample(){const c=state.source;c.width=1000;c.height=700;const x=c.getContext('2d'),g=x.createLinearGradient(0,0,1000,700);g.addColorStop(0,'#f2c94c');g.addColorStop(.5,'#ed654e');g.addColorStop(1,'#3769da');x.fillStyle='#e7e7e1';x.fillRect(0,0,1000,700);x.fillStyle=g;x.fillRect(55,55,890,590);x.fillStyle='#17191d';x.fillRect(100,110,330,480);x.fillStyle='#f5c94c';x.beginPath();x.arc(715,260,145,0,Math.PI*2);x.fill();x.fillStyle='#3569db';x.beginPath();x.arc(755,455,105,0,Math.PI*2);x.fill();x.fillStyle='#ed5c49';x.fillRect(360,285,265,190);x.fillStyle='#fff';x.font='700 65px Arial';x.fillText('CV',155,280);x.fillText('LAB',125,365);state.name='Sample image';state.size=null;sourceChanged()}
function sourceChanged(){const template=experiments.find(e=>e.id==='template');template.state.rect=null;template.state.drag=null;const c=$('#thumb');c.width=44;c.height=44;const crop=Math.min(state.source.width,state.source.height);c.getContext('2d').drawImage(state.source,(state.source.width-crop)/2,(state.source.height-crop)/2,crop,crop,0,0,44,44);$('#fileName').textContent=state.name;$('#imageMeta').textContent=`${state.source.width} × ${state.source.height}${state.size?' · '+formatBytes(state.size):''}`;const experiment=activeExperiment();experiment?.destroy?.();experiment?.mount();if(experiment){renderParameterGuide(experiment.id);renderPseudocode(experiment.id)}}
async function load(file){if(!file?.type.startsWith('image/'))return;const b=await createImageBitmap(file),[w,h]=fit(b.width,b.height);state.source.width=w;state.source.height=h;state.source.getContext('2d').drawImage(b,0,0,w,h);b.close();state.name=file.name;state.size=file.size;sourceChanged()}
async function loadBundledImage(url,button){
  const image=new Image();
  image.src=url;
  await image.decode();
  const [w,h]=fit(image.naturalWidth,image.naturalHeight);
  state.source.width=w;state.source.height=h;
  state.source.getContext('2d').drawImage(image,0,0,w,h);
  state.name='Selected image';state.size=null;
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
function bindGlobal(){$('#fileInput').onchange=e=>load(e.target.files[0]);$('#sampleButton').onclick=sample;$('#downloadButton').onclick=()=>{if(!state.output)return;const a=document.createElement('a');a.download=`cv-lab-${state.active}.png`;a.href=state.output.toDataURL('image/png');a.click()};['dragenter','dragover'].forEach(n=>document.addEventListener(n,e=>{e.preventDefault();$('#dropZone').classList.add('visible')}));document.addEventListener('dragleave',e=>{if(!e.relatedTarget)$('#dropZone').classList.remove('visible')});document.addEventListener('drop',e=>{e.preventDefault();$('#dropZone').classList.remove('visible');load(e.dataTransfer.files[0])})}

const refreshParameterGuide=()=>queueMicrotask(()=>renderParameterGuide(state.active));
root.addEventListener('input',refreshParameterGuide);
root.addEventListener('change',refreshParameterGuide);

buildNav();bindGlobal();setupGallery();sample();mount('channels');
})();
