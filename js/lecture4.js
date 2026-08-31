const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function loadSquare(url,size=176){
  return new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>{
      const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
      const source=Math.min(image.naturalWidth,image.naturalHeight),sx=(image.naturalWidth-source)/2,sy=(image.naturalHeight-source)/2;
      const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,sx,sy,source,source,0,0,size,size);
      const pixels=context.getImageData(0,0,size,size).data,gray=new Float32Array(size*size);
      for(let i=0,p=0;i<pixels.length;i+=4,p++)gray[p]=.299*pixels[i]+.587*pixels[i+1]+.114*pixels[i+2];
      resolve({image,canvas,gray,w:size,h:size,url});
    };
    image.onerror=()=>reject(new Error(`Could not load ${url}`));
    image.src=url;
  });
}

function copyCanvas(target,source){
  target.width=source.width;target.height=source.height;target.getContext('2d').drawImage(source,0,0);
}

function makeGabor({gamma=.7,sigma=4,theta=0,wavelength=10}){
  const angle=theta*Math.PI/180,kx=2*Math.PI*Math.cos(angle)/wavelength,ky=2*Math.PI*Math.sin(angle)/wavelength;
  const radius=Math.ceil(3*sigma/Math.min(1,gamma)),size=radius*2+1;
  const xSin=new Float32Array(size),xCos=new Float32Array(size),ySin=new Float32Array(size),yCos=new Float32Array(size),values=new Float32Array(size*size);
  for(let n=-radius;n<=radius;n++){
    const i=n+radius,gx=Math.exp(-(n*n)/(2*sigma*sigma)),gy=Math.exp(-(gamma*gamma*n*n)/(2*sigma*sigma));
    xSin[i]=gx*Math.sin(kx*n);xCos[i]=gx*Math.cos(kx*n);ySin[i]=gy*Math.sin(ky*n);yCos[i]=gy*Math.cos(ky*n);
  }
  let energy=0;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const value=xCos[x]*yCos[y]-xSin[x]*ySin[y];values[y*size+x]=value;energy+=value*value;
  }
  energy=Math.sqrt(energy)||1;for(let i=0;i<values.length;i++)values[i]/=energy;
  return{radius,size,xSin,xCos,ySin,yCos,values,energy};
}

function correlateSeparable(data,w,h,horizontal,vertical){
  const radius=(horizontal.length-1)/2,temp=new Float32Array(w*h),out=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let sum=0;for(let k=-radius;k<=radius;k++)sum+=data[y*w+clamp(x+k,0,w-1)]*horizontal[k+radius];temp[y*w+x]=sum;
  }
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let sum=0;for(let k=-radius;k<=radius;k++)sum+=temp[clamp(y+k,0,h-1)*w+x]*vertical[k+radius];out[y*w+x]=sum;
  }
  return out;
}

function gaborResponse(texture,kernel){
  const cosine=correlateSeparable(texture.gray,texture.w,texture.h,kernel.xCos,kernel.yCos),sine=correlateSeparable(texture.gray,texture.w,texture.h,kernel.xSin,kernel.ySin),values=new Float32Array(texture.gray.length);
  let mean=0,max=0;
  for(let i=0;i<values.length;i++){values[i]=(cosine[i]-sine[i])/kernel.energy;const magnitude=Math.abs(values[i]);mean+=magnitude;max=Math.max(max,magnitude)}
  return{values,meanAbs:mean/values.length,maxAbs:max};
}

function drawScalar(canvas,values,w,h,{signed=false,maxValue=null}={}){
  canvas.width=w;canvas.height=h;const image=new ImageData(w,h);
  let scale=maxValue;
  if(!scale){const sorted=Array.from(values,Math.abs).sort((a,b)=>a-b);scale=sorted[Math.floor(sorted.length*.99)]||1}
  for(let i=0;i<values.length;i++){
    const value=signed?128+127*values[i]/scale:255*Math.abs(values[i])/scale,v=clamp(value,0,255);
    image.data[i*4]=image.data[i*4+1]=image.data[i*4+2]=v;image.data[i*4+3]=255;
  }
  canvas.getContext('2d').putImageData(image,0,0);
}

function gaussianKernel(sigma){
  const radius=Math.ceil(3*sigma),kernel=new Float32Array(radius*2+1);let sum=0;
  for(let i=-radius;i<=radius;i++){const value=Math.exp(-(i*i)/(2*sigma*sigma));kernel[i+radius]=value;sum+=value}
  for(let i=0;i<kernel.length;i++)kernel[i]/=sum;return kernel;
}

function gaussianBlur(data,w,h,sigma){
  const kernel=gaussianKernel(sigma),radius=(kernel.length-1)/2,temp=new Float32Array(w*h),out=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0;for(let k=-radius;k<=radius;k++)sum+=data[y*w+clamp(x+k,0,w-1)]*kernel[k+radius];temp[y*w+x]=sum}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0;for(let k=-radius;k<=radius;k++)sum+=temp[clamp(y+k,0,h-1)*w+x]*kernel[k+radius];out[y*w+x]=sum}
  return out;
}

function cropTexture(texture,left,top,size){
  const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(texture.canvas,left,top,size,size,0,0,size,size);
  const pixels=context.getImageData(0,0,size,size).data,gray=new Float32Array(size*size);
  for(let i=0,p=0;i<pixels.length;i+=4,p++)gray[p]=.299*pixels[i]+.587*pixels[i+1]+.114*pixels[i+2];
  return{canvas,gray,w:size,h:size};
}

function drawFeatureBars(canvas,values){
  const dpr=devicePixelRatio||1,w=canvas.clientWidth||520,h=canvas.clientHeight||150;canvas.width=w*dpr;canvas.height=h*dpr;
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);const max=Math.max(...values,1e-9),gap=7,barWidth=(w-gap*(values.length+1))/values.length;
  ctx.font='10px ui-monospace, monospace';ctx.textAlign='center';ctx.fillStyle='#666';
  values.forEach((value,index)=>{const barHeight=value/max*(h-34),x=gap+index*(barWidth+gap);ctx.fillStyle='#315ee7';ctx.fillRect(x,h-22-barHeight,barWidth,barHeight);ctx.fillStyle='#666';ctx.fillText(`F${index+1}`,x+barWidth/2,h-7)});
}

function seededPoints(){
  let seed=4243;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296),points=[];
  ['Brick','Grass','Knit'].forEach((label,classIndex)=>{for(let i=0;i<26;i++)points.push({label,classIndex,jx:(random()+random()+random()-1.5),jy:(random()+random()+random()-1.5)})});
  return points;
}

const projectionCenters=[
  [[.44,.52],[.53,.49],[.49,.43]],
  [[.32,.64],[.54,.39],[.68,.59]],
  [[.22,.72],[.51,.25],[.79,.72]],
];
const projectionSpreads=[.13,.09,.055];

export function createLecture4Experiments(root){
  const scaleRuntime={token:0,scaleTexture:null,scaleMaps:null,scalePoint:{x:.66,y:.45}};
  const projectionRuntime={projectionPoints:seededPoints(),projectionStage:0,projectionFrom:0,projectionFrame:0};
  const classifierRuntime={token:0,classTextures:null,classCentroids:null,classBank:null};

  const scaleExperiment={
    group:'Filter banks & texture',id:'scaleSelection',icon:'◎',title:'Scale selection (L4)',description:'Probe a sunflower structure and see which normalized Difference-of-Gaussians scale responds most strongly.',state:{},
    mount(){const token=++scaleRuntime.token;mountScale(root);initScale(scaleRuntime,root,token)},
    destroy(){scaleRuntime.token++}
  };
  const projectionExperiment={
    group:'Filter banks & texture',id:'featureProjection',icon:'∷',title:'Feature-space projection (L4)',description:'Add fine-, medium-, and coarse-scale features to separate three material clusters in two dimensions.',state:{projectionStage:0},
    mount(){projectionRuntime.projectionStage=this.state.projectionStage;projectionRuntime.projectionFrom=this.state.projectionStage;mountProjection(root);initProjection(this,projectionRuntime,root)},
    destroy(){cancelAnimationFrame(projectionRuntime.projectionFrame)}
  };
  const classifierExperiment={
    group:'Filter banks & texture',id:'materialClassifier',icon:'▤',title:'Material classifier (L4)',description:'Inspect eight Gabor response maps, their pooled feature vector, and a nearest-centroid material decision.',state:{material:'brick'},
    mount(){const token=++classifierRuntime.token;mountClassifier(root);initClassifier(this,classifierRuntime,root,token)},
    destroy(){classifierRuntime.token++}
  };
  return[scaleExperiment,projectionExperiment,classifierExperiment];
}

function mountScale(root){
  root.innerHTML=`<div class="l4-page"><section class="l4-section" id="l4Scale"><header><span>Slide 17</span><h2>Scale selection chooses the strongest normalized response</h2><p>Click the sunflower. A Difference-of-Gaussians scale space measures the same location with progressively larger neighborhoods.</p></header>
    <div class="l4-scale-layout">
      <figure class="l4-sunflower"><figcaption>Click a structure to probe its scale</figcaption><canvas id="l4ScaleImage" aria-label="Clickable sunflower scale-selection image"></canvas></figure>
      <div class="l4-scale-analysis"><div class="l4-scale-result"><span>Selected maximum</span><b id="l4ScaleMaximum">—</b><small id="l4ScalePosition">—</small></div><canvas id="l4ScaleChart" aria-label="Scale-normalized response by sigma"></canvas><div class="l4-scale-crops"><figure><canvas id="l4CropFine"></canvas><figcaption>Fine neighborhood</figcaption></figure><figure><canvas id="l4CropMedium"></canvas><figcaption>Medium neighborhood</figcaption></figure><figure><canvas id="l4CropCoarse"></canvas><figcaption>Coarse neighborhood</figcaption></figure></div></div>
    </div>
  </section></div>`;
}

function mountProjection(root){
  root.innerHTML=`<div class="l4-page"><section class="l4-section" id="l4Projection"><header><span>Slide 31</span><h2>Adding scale-specific features separates material clusters</h2><p>The same samples are projected into two dimensions as complementary feature groups are added.</p></header>
    <div class="l4-stage-buttons" role="group" aria-label="Feature sets"><button data-stage="0">Fine scale only</button><button data-stage="1">+ medium scale</button><button data-stage="2">+ coarse scale</button></div>
    <div class="l4-projection-layout"><canvas id="l4ProjectionCanvas" aria-label="Two-dimensional material feature projection"></canvas><aside><span>Separation ratio</span><b id="l4Separation">—</b><p>Between-class centroid distance divided by within-class spread.</p><div class="l4-legend"><span><i class="brick"></i>Brick</span><span><i class="grass"></i>Grass</span><span><i class="knit"></i>Knit</span></div></aside></div>
  </section></div>`;
}

function mountClassifier(root){
  root.innerHTML=`<div class="l4-page"><section class="l4-section" id="l4Classifier"><header><span>Slide 32</span><h2>A material classifier turns filter responses into a decision</h2><p>Select an unseen center patch. The demo pools an eight-filter Gabor bank and compares its feature vector with class centroids.</p></header>
    <div class="l4-material-buttons" role="group" aria-label="Material test patch"><button data-material="brick">Brick patch</button><button data-material="grass">Grass patch</button><button data-material="knit">Knit patch</button></div>
    <div class="l4-classifier-flow">
      <figure><figcaption>1 · test patch</figcaption><canvas id="l4ClassInput"></canvas></figure><div class="l4-flow-arrow" aria-hidden="true">→</div>
      <figure class="l4-response-bank"><figcaption>2 · eight response maps</figcaption><div id="l4ClassResponses"></div></figure><div class="l4-flow-arrow" aria-hidden="true">→</div>
      <figure class="l4-feature-figure"><figcaption>3 · pooled feature vector</figcaption><canvas id="l4FeatureBars"></canvas></figure><div class="l4-flow-arrow" aria-hidden="true">→</div>
      <section class="l4-prediction"><span>4 · nearest-centroid prediction</span><b id="l4Prediction">Loading…</b><div id="l4Probabilities"></div></section>
    </div>
    <div class="l4-classifier-note" id="l4ClassifierStatus" role="status">Preparing texture centroids…</div>
  </section></div>`;
}

async function initScale(runtime,root,token){
  const texture=await loadSquare('images/lecture4/sunflower.webp',280);if(token!==runtime.token)return;runtime.scaleTexture=texture;
  const sigmas=[1,1.4,2,2.8,4,5.6,8,11.2,16],maps=[];
  for(const sigma of sigmas){const narrow=gaussianBlur(texture.gray,texture.w,texture.h,sigma),wide=gaussianBlur(texture.gray,texture.w,texture.h,sigma*1.6),dog=new Float32Array(texture.gray.length);for(let i=0;i<dog.length;i++)dog[i]=narrow[i]-wide[i];maps.push(dog)}
  runtime.scaleMaps={sigmas,maps};const canvas=root.querySelector('#l4ScaleImage');canvas.onclick=event=>{const rect=canvas.getBoundingClientRect();runtime.scalePoint={x:clamp((event.clientX-rect.left)/rect.width,0,1),y:clamp((event.clientY-rect.top)/rect.height,0,1)};renderScale(runtime,root)};renderScale(runtime,root);
}

function renderScale(runtime,root){
  const texture=runtime.scaleTexture,{sigmas,maps}=runtime.scaleMaps,point=runtime.scalePoint,x=Math.round(point.x*(texture.w-1)),y=Math.round(point.y*(texture.h-1)),scores=maps.map((map,index)=>{
    const radius=Math.max(1,Math.round(sigmas[index]/2));let sum=0,n=0;for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){const value=map[clamp(y+dy,0,texture.h-1)*texture.w+clamp(x+dx,0,texture.w-1)];sum+=value*value;n++}return Math.sqrt(sum/n)}),maximum=Math.max(...scores),winner=scores.indexOf(maximum),selected=sigmas[winner];
  const canvas=root.querySelector('#l4ScaleImage');copyCanvas(canvas,texture.canvas);const ctx=canvas.getContext('2d');ctx.strokeStyle='#d92323';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,Math.max(8,selected*3),0,Math.PI*2);ctx.stroke();ctx.fillStyle='#d92323';ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.fill();
  root.querySelector('#l4ScaleMaximum').textContent=`σ = ${selected}`;root.querySelector('#l4ScalePosition').textContent=`probe at (${Math.round(point.x*100)}%, ${Math.round(point.y*100)}%)`;
  drawScaleChart(root.querySelector('#l4ScaleChart'),sigmas,scores,winner);
  [[root.querySelector('#l4CropFine'),54],[root.querySelector('#l4CropMedium'),112],[root.querySelector('#l4CropCoarse'),220]].forEach(([target,size])=>{target.width=150;target.height=150;const left=clamp(x-size/2,0,texture.w-size),top=clamp(y-size/2,0,texture.h-size);target.getContext('2d').drawImage(texture.canvas,left,top,size,size,0,0,150,150)});
}

function drawScaleChart(canvas,sigmas,scores,winner){
  const dpr=devicePixelRatio||1,w=canvas.clientWidth||640,h=canvas.clientHeight||220;canvas.width=w*dpr;canvas.height=h*dpr;const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);const left=42,right=14,top=14,bottom=31,max=Math.max(...scores)||1;
  ctx.strokeStyle='#b8bcc4';ctx.lineWidth=1;ctx.strokeRect(left,top,w-left-right,h-top-bottom);ctx.fillStyle='#666';ctx.font='10px ui-monospace, monospace';ctx.textAlign='center';ctx.fillText('scale σ',left+(w-left-right)/2,h-7);ctx.save();ctx.translate(12,top+(h-top-bottom)/2);ctx.rotate(-Math.PI/2);ctx.fillText('normalized response',0,0);ctx.restore();
  const points=sigmas.map((sigma,index)=>({x:left+index/(sigmas.length-1)*(w-left-right),y:top+(1-scores[index]/max)*(h-top-bottom)}));ctx.strokeStyle='#315ee7';ctx.lineWidth=2;ctx.beginPath();points.forEach((point,index)=>index?ctx.lineTo(point.x,point.y):ctx.moveTo(point.x,point.y));ctx.stroke();
  points.forEach((point,index)=>{ctx.fillStyle=index===winner?'#d92323':'#315ee7';ctx.beginPath();ctx.arc(point.x,point.y,index===winner?5:3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#666';ctx.fillText(sigmas[index],point.x,h-bottom+15)});
}

function initProjection(experiment,runtime,root){
  root.querySelector('.l4-stage-buttons').onclick=event=>{const button=event.target.closest('button');if(!button)return;const next=+button.dataset.stage;runtime.projectionFrom=runtime.projectionStage;runtime.projectionStage=next;experiment.state.projectionStage=next;animateProjection(runtime,root)};renderProjection(runtime,root,runtime.projectionStage);
}

function animateProjection(runtime,root){
  cancelAnimationFrame(runtime.projectionFrame);const start=performance.now(),from=runtime.projectionFrom,to=runtime.projectionStage;
  const frame=time=>{const t=Math.min(1,(time-start)/360),smooth=t*t*(3-2*t);renderProjection(runtime,root,from+(to-from)*smooth);if(t<1)runtime.projectionFrame=requestAnimationFrame(frame)};runtime.projectionFrame=requestAnimationFrame(frame);
}

function projectionPosition(point,stage){
  const low=Math.floor(stage),high=Math.min(2,Math.ceil(stage)),mix=stage-low,centerA=projectionCenters[low][point.classIndex],centerB=projectionCenters[high][point.classIndex],spreadA=projectionSpreads[low],spreadB=projectionSpreads[high];
  return{x:centerA[0]+(centerB[0]-centerA[0])*mix+point.jx*(spreadA+(spreadB-spreadA)*mix),y:centerA[1]+(centerB[1]-centerA[1])*mix+point.jy*(spreadA+(spreadB-spreadA)*mix)};
}

function renderProjection(runtime,root,stage){
  const canvas=root.querySelector('#l4ProjectionCanvas'),dpr=devicePixelRatio||1,w=canvas.clientWidth||820,h=canvas.clientHeight||390;canvas.width=w*dpr;canvas.height=h*dpr;const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);const margin={left:48,right:18,top:18,bottom:38},colors=['#b74c3c','#3b7d44','#315ee7'];
  ctx.strokeStyle='#b8bcc4';ctx.strokeRect(margin.left,margin.top,w-margin.left-margin.right,h-margin.top-margin.bottom);ctx.fillStyle='#666';ctx.font='10px ui-monospace, monospace';ctx.textAlign='center';ctx.fillText('projection dimension 1',margin.left+(w-margin.left-margin.right)/2,h-8);ctx.save();ctx.translate(12,margin.top+(h-margin.top-margin.bottom)/2);ctx.rotate(-Math.PI/2);ctx.fillText('projection dimension 2',0,0);ctx.restore();
  const positions=runtime.projectionPoints.map(point=>({...point,...projectionPosition(point,stage)}));positions.forEach(point=>{const x=margin.left+point.x*(w-margin.left-margin.right),y=margin.top+(1-point.y)*(h-margin.top-margin.bottom);ctx.fillStyle=colors[point.classIndex];ctx.globalAlpha=.76;ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill()});ctx.globalAlpha=1;
  const centroids=[0,1,2].map(classIndex=>{const items=positions.filter(point=>point.classIndex===classIndex);return{x:items.reduce((sum,p)=>sum+p.x,0)/items.length,y:items.reduce((sum,p)=>sum+p.y,0)/items.length}}),between=(Math.hypot(centroids[0].x-centroids[1].x,centroids[0].y-centroids[1].y)+Math.hypot(centroids[0].x-centroids[2].x,centroids[0].y-centroids[2].y)+Math.hypot(centroids[1].x-centroids[2].x,centroids[1].y-centroids[2].y))/3,within=positions.reduce((sum,p)=>sum+Math.hypot(p.x-centroids[p.classIndex].x,p.y-centroids[p.classIndex].y),0)/positions.length;
  root.querySelector('#l4Separation').textContent=(between/within).toFixed(2);root.querySelectorAll('.l4-stage-buttons button').forEach((button,index)=>{const active=Math.round(stage)===index;button.classList.toggle('active',active);button.setAttribute('aria-pressed',active)});
}

async function initClassifier(experiment,runtime,root,token){
  const definitions=[{id:'brick',label:'Brick',url:'images/gabor/brick.png'},{id:'grass',label:'Grass',url:'images/gabor/grass.png'},{id:'knit',label:'Knit',url:'images/lecture4/knit.webp'}];
  const textures=await Promise.all(definitions.map(async definition=>({...definition,...await loadSquare(definition.url,160)})));if(token!==runtime.token)return;runtime.classTextures=textures;
  runtime.classBank=[8,16].flatMap(wavelength=>[0,45,90,135].map(theta=>makeGabor({gamma:.7,sigma:wavelength*.42,theta,wavelength})));
  runtime.classCentroids=textures.map(texture=>{
    const crops=[[0,0],[48,0],[0,48],[48,48]].map(([x,y])=>cropTexture(texture,x,y,112)),features=crops.map(crop=>classifierFeatures(crop,runtime.classBank).features);
    return features[0].map((_,index)=>features.reduce((sum,row)=>sum+row[index],0)/features.length);
  });
  root.querySelector('.l4-material-buttons').onclick=event=>{const button=event.target.closest('button');if(button){experiment.state.material=button.dataset.material;renderClassifier(experiment,runtime,root)}};renderClassifier(experiment,runtime,root);
}

function classifierFeatures(texture,bank){
  const responses=bank.map(kernel=>gaborResponse(texture,kernel)),features=responses.map(response=>Math.log1p(response.meanAbs));return{responses,features};
}

function renderClassifier(experiment,runtime,root){
  const selected=runtime.classTextures.find(texture=>texture.id===experiment.state.material),test=cropTexture(selected,24,24,112),computed=classifierFeatures(test,runtime.classBank),scales=computed.features.map((_,index)=>Math.max(...runtime.classCentroids.map(row=>row[index]),1e-6)),distances=runtime.classCentroids.map(centroid=>Math.sqrt(centroid.reduce((sum,value,index)=>sum+((computed.features[index]-value)/scales[index])**2,0))),weights=distances.map(distance=>Math.exp(-5*distance)),total=weights.reduce((a,b)=>a+b,0)||1,probabilities=weights.map(weight=>weight/total),winner=probabilities.indexOf(Math.max(...probabilities));
  copyCanvas(root.querySelector('#l4ClassInput'),test.canvas);const responseRoot=root.querySelector('#l4ClassResponses');responseRoot.innerHTML=computed.responses.map((_,index)=>`<canvas id="l4ClassResponse${index}" aria-label="Filter response ${index+1}"></canvas>`).join('');computed.responses.forEach((response,index)=>drawScalar(root.querySelector(`#l4ClassResponse${index}`),response.values,test.w,test.h));drawFeatureBars(root.querySelector('#l4FeatureBars'),computed.features);
  root.querySelector('#l4Prediction').textContent=runtime.classTextures[winner].label;root.querySelector('#l4Probabilities').innerHTML=runtime.classTextures.map((texture,index)=>`<div><span>${texture.label}</span><i><b style="width:${(probabilities[index]*100).toFixed(1)}%"></b></i><em>${(probabilities[index]*100).toFixed(1)}%</em></div>`).join('');root.querySelector('#l4ClassifierStatus').textContent=`Center test crop classified against four-crop centroids · nearest distance ${Math.min(...distances).toFixed(3)}`;
  root.querySelectorAll('.l4-material-buttons button').forEach(button=>{const active=button.dataset.material===selected.id;button.classList.toggle('active',active);button.setAttribute('aria-pressed',active)});
}
