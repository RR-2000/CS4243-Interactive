const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function loadTexture(url,width=176,height=width,crop=null){
  return new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>{
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const sourceRatio=image.naturalWidth/image.naturalHeight,targetRatio=width/height;
      const sourceWidth=crop?image.naturalWidth*crop[2]:(sourceRatio>targetRatio?image.naturalHeight*targetRatio:image.naturalWidth),sourceHeight=crop?image.naturalHeight*crop[3]:(sourceRatio>targetRatio?image.naturalHeight:image.naturalWidth/targetRatio),sx=crop?image.naturalWidth*crop[0]:(image.naturalWidth-sourceWidth)/2,sy=crop?image.naturalHeight*crop[1]:(image.naturalHeight-sourceHeight)/2;
      const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,sx,sy,sourceWidth,sourceHeight,0,0,width,height);
      const pixels=context.getImageData(0,0,width,height).data,gray=new Float32Array(width*height);
      for(let i=0,p=0;i<pixels.length;i+=4,p++)gray[p]=.299*pixels[i]+.587*pixels[i+1]+.114*pixels[i+2];
      resolve({image,canvas,gray,w:width,h:height,url});
    };
    image.onerror=()=>reject(new Error(`Could not load ${url}`));
    image.src=url;
  });
}

function loadSquare(url,size=176){return loadTexture(url,size,size)}

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

export function createLecture4Experiments(root){
  const scaleRuntime={token:0,sceneToken:0,cache:new Map(),scene:null,scalePoint:null,resizeTimer:null};
  const classifierRuntime={token:0,classTextures:null,classBank:null,training:[],pca:null};

  const scaleExperiment={
    group:'Filter banks & texture',id:'scaleSelection',icon:'◎',title:'Scale selection (L4)',description:'Find repeated objects at their characteristic sizes using spatial-and-scale maxima of normalized Difference-of-Gaussians responses.',state:{scene:'sunflower',imageScale:100},
    mount(){const token=++scaleRuntime.token;mountScale(root);initScale(this,scaleRuntime,root,token)},
    destroy(){scaleRuntime.token++;scaleRuntime.sceneToken++;clearTimeout(scaleRuntime.resizeTimer)}
  };
  const classifierExperiment={
    group:'Filter banks & texture',id:'materialClassifier',icon:'▤',title:'Material classifier (L4)',description:'Compare 1-nearest-neighbor and nearest-class-mean decisions using real labelled material photographs in a two-dimensional PCA feature space.',state:{material:'grass'},
    mount(){const token=++classifierRuntime.token;mountClassifier(root);initClassifier(this,classifierRuntime,root,token)},
    destroy(){classifierRuntime.token++}
  };
  return[scaleExperiment,classifierExperiment];
}

function mountScale(root){
  root.innerHTML=`<div class="l4-page"><section class="l4-section" id="l4Scale"><header><span>Slide 17</span><h2>Objects reveal themselves at their characteristic scale</h2><p>A scale-normalized Difference-of-Gaussians filter is evaluated at every position and scale. Circles mark local maxima in <i>x</i>, <i>y</i>, and σ; click an object to inspect why its particular scale wins.</p></header>
    <div class="l4-scale-scenes" role="group" aria-label="Scale-selection controls"><span>Choose a scene</span><button data-scene="sunflower">Sunflower field</button><button data-scene="lanterns">Sky lanterns</button><label class="l4-scale-size" for="l4ImageScale"><span>Image size</span><output id="l4ImageScaleValue" for="l4ImageScale">100%</output><input id="l4ImageScale" type="range" min="50" max="100" step="5" value="100" aria-label="Original image size"></label></div>
    <div class="l4-scale-layout">
      <figure class="l4-scale-scene"><figcaption><span id="l4ScaleSceneTitle">Preparing scene…</span><small>click any object</small></figcaption><canvas id="l4ScaleImage" aria-label="Clickable scale-selection scene"></canvas><div class="l4-scale-legend"><span><i class="small"></i>small σ</span><span><i class="medium"></i>medium σ</span><span><i class="large"></i>large σ</span></div></figure>
      <div class="l4-scale-analysis"><div class="l4-scale-result"><span>Characteristic scale at probe</span><b id="l4ScaleMaximum">—</b><small id="l4ScalePosition">Loading scale space…</small></div><canvas id="l4ScaleChart" aria-label="Scale-normalized response by sigma"></canvas><div class="l4-scale-explain"><b>How to read this</b><p>The peak occurs when the filter's support best matches the object. A larger object therefore peaks at a larger σ.</p><span id="l4DetectionSummary">Detecting spatial-and-scale maxima…</span></div></div>
    </div>
    <section class="l4-scale-map-section"><header><div><b>Response maps across scale</b><small>Identical colour scale for every map · white cross = probe · red border = maximum</small></div><code>R(x,y;σ) ≈ |G(x,y;σ) − G(x,y;1.6σ)|</code></header><div class="l4-scale-maps" id="l4ScaleMaps"></div></section>
    <details class="l4-scale-sources"><summary>Image credits and licences</summary><span>Sunflowers: <a href="https://commons.wikimedia.org/wiki/File:Close-up_of_sunflowers_in_field.jpg" target="_blank" rel="noreferrer">Close-up of sunflowers in field.jpg (CC BY-SA 4.0)</a> · Lanterns: <a href="https://commons.wikimedia.org/wiki/File:Rise_lantern_festival,_Nevada,_California.jpg" target="_blank" rel="noreferrer">Rise lantern festival (CC BY-SA 4.0)</a></span></details>
  </section></div>`;
}

function mountClassifier(root){
  root.innerHTML=`<div class="l4-page"><section class="l4-section" id="l4Classifier"><header><span>Slide 32</span><h2>Two simple material classifiers in a PCA feature space</h2><p>Twenty-four labelled training patches define three material classes. Select a held-out query patch, then compare its nearest training example with its nearest class mean.</p></header>
    <div class="l4-material-buttons" role="group" aria-label="Held-out query material"><span>Held-out test photo</span><button data-material="grass">Grass</button><button data-material="wood">Wood</button><button data-material="knit">Knit</button></div>
    <section class="l4-training-set"><div class="l4-classifier-heading"><div><b>1 · Labelled training patches</b><small>Eight independent photographs per class · 24 training images</small></div><span>training only</span></div><div id="l4TrainingRows" class="l4-training-rows" aria-label="Labelled material training patches"></div></section>
    <section class="l4-query-strip">
      <figure><figcaption>2 · Patch from a separate test photograph</figcaption><canvas id="l4ClassInput" aria-label="Held-out material query patch"></canvas></figure>
      <div><b>Mean absolute filter responses → standardized PCA</b><p>After the same grayscale contrast normalization for every patch, t<sub>k</sub>(Ω) = mean<sub>(x,y)∈Ω</sub> |r<sub>k</sub>(x,y)|. The 16 pooled values form t(Ω); PCA is fitted using only the 24 training vectors.</p><span id="l4PcaVariance">Preparing PCA…</span></div>
    </section>
    <div class="l4-pca-comparison">
      <figure><figcaption><span>3a · 1-nearest neighbour</span><small>Distance to every labelled patch</small></figcaption><canvas id="l4NnPlot" aria-label="PCA plot for nearest-neighbour classification"></canvas><div class="l4-method-result"><span>Nearest training patch</span><canvas id="l4NnMatch"></canvas><b id="l4NnPrediction">—</b><em id="l4NnDistance">—</em></div></figure>
      <figure><figcaption><span>3b · Nearest class mean</span><small>Distance to three class centroids</small></figcaption><canvas id="l4MeanPlot" aria-label="PCA plot for nearest-class-mean classification"></canvas><div class="l4-method-result l4-mean-result"><span>Nearest class centroid</span><i id="l4MeanSwatch"></i><b id="l4MeanPrediction">—</b><em id="l4MeanDistance">—</em></div></figure>
    </div>
    <div class="l4-classifier-note" id="l4ClassifierStatus" role="status">Building training features and PCA coordinates…</div>
    <details class="l4-material-sources"><summary>Photograph credits and licences</summary><p>All photographs are locally bundled from Wikimedia Commons; each link opens its author and licence page.</p><span>Leaves: <a href="https://commons.wikimedia.org/wiki/File:Backlit_ficus_elastica_leaf_texture_2014_02.jpg" target="_blank" rel="noreferrer">1</a> · <a href="https://commons.wikimedia.org/wiki/File:Fittonia_gigantea_leaf_veins_macro.jpg" target="_blank" rel="noreferrer">2</a> · <a href="https://commons.wikimedia.org/wiki/File:Leaf_1_web.jpg" target="_blank" rel="noreferrer">3</a> · <a href="https://commons.wikimedia.org/wiki/File:Leaf-veins-7069249.jpg" target="_blank" rel="noreferrer">4</a> · <a href="https://commons.wikimedia.org/wiki/File:Taro_leaf_underside,_backlit_by_sun_-_edit.jpg" target="_blank" rel="noreferrer">5</a> · <a href="https://commons.wikimedia.org/wiki/File:Tulip_Tree_Liriodendron_tulipifera_Leaf_Underside_3008px.jpg" target="_blank" rel="noreferrer">6</a> · <a href="https://commons.wikimedia.org/wiki/File:Tulip_Tree_Liriodendron_tulipifera_Leaf_Underside_Red_Mite_2700px.jpg" target="_blank" rel="noreferrer">7</a> · <a href="https://commons.wikimedia.org/wiki/File:Weinblatt-P7089806PS.jpg" target="_blank" rel="noreferrer">8</a> · <a href="https://commons.wikimedia.org/wiki/File:Detailed_Leaf_Texture_Close_Up_(217395839).jpeg" target="_blank" rel="noreferrer">test</a></span><span>Wood: <a href="https://commons.wikimedia.org/wiki/File:Gfp-wood-texture.jpg" target="_blank" rel="noreferrer">1</a> · <a href="https://commons.wikimedia.org/wiki/File:Kirschholzbrett_--_2021_--_7656.jpg" target="_blank" rel="noreferrer">2</a> · <a href="https://commons.wikimedia.org/wiki/File:Pine_plank_fence_2019_G1_BW.jpg" target="_blank" rel="noreferrer">3</a> · <a href="https://commons.wikimedia.org/wiki/File:Sand_stabilization_Utah_Beach.jpg" target="_blank" rel="noreferrer">4</a> · <a href="https://commons.wikimedia.org/wiki/File:Sedan,_Ch%C3%A2teau_de_Sedan_--_2017_--_4870.jpg" target="_blank" rel="noreferrer">5</a> · <a href="https://commons.wikimedia.org/wiki/File:Stained_wooden_clapboard_siding.jpg" target="_blank" rel="noreferrer">6</a> · <a href="https://commons.wikimedia.org/wiki/File:Winterswijk_(NL),_Woold,_Boven_Slinge_--_2014_--_3169.jpg" target="_blank" rel="noreferrer">7</a> · <a href="https://commons.wikimedia.org/wiki/File:Wooden-plank-and-nailed-alum-sheet.jpg" target="_blank" rel="noreferrer">8</a> · <a href="https://commons.wikimedia.org/wiki/File:Dry_wood_texture.jpg" target="_blank" rel="noreferrer">test</a></span><span>Knit: <a href="https://commons.wikimedia.org/wiki/File:Bambus_1.jpg" target="_blank" rel="noreferrer">1</a> · <a href="https://commons.wikimedia.org/wiki/File:Gestrick_eines_Anti-Thrombosestrumpfes_(wei%C3%9F,_Detail).jpg" target="_blank" rel="noreferrer">2</a> · <a href="https://commons.wikimedia.org/wiki/File:Gfp-red-yarn.jpg" target="_blank" rel="noreferrer">3</a> · <a href="https://commons.wikimedia.org/wiki/File:Gfp-white-yard-texture.jpg" target="_blank" rel="noreferrer">4</a> · <a href="https://commons.wikimedia.org/wiki/File:Grafting_knitting.jpg" target="_blank" rel="noreferrer">5</a> · <a href="https://commons.wikimedia.org/wiki/File:Knitcable.jpg" target="_blank" rel="noreferrer">6</a> · <a href="https://commons.wikimedia.org/wiki/File:RL_-_linke_Seite.jpg" target="_blank" rel="noreferrer">7</a> · <a href="https://commons.wikimedia.org/wiki/File:Ribbing.jpg" target="_blank" rel="noreferrer">8</a> · <a href="https://commons.wikimedia.org/wiki/File:Knit_stockinette_stitch.jpg" target="_blank" rel="noreferrer">test</a></span></details>
  </section></div>`;
  root.querySelector('.l4-material-sources span').innerHTML='Grass: <a href="https://commons.wikimedia.org/wiki/File:Green_Grass_001.jpg" target="_blank" rel="noreferrer">1</a> · <a href="https://commons.wikimedia.org/wiki/File:Green_Grass_002.jpg" target="_blank" rel="noreferrer">2</a> · <a href="https://commons.wikimedia.org/wiki/File:Green_Grass_003.jpg" target="_blank" rel="noreferrer">3</a> · <a href="https://commons.wikimedia.org/wiki/File:Green_Grass_004.jpg" target="_blank" rel="noreferrer">4</a> · <a href="https://commons.wikimedia.org/wiki/File:Green_Grass_005.jpg" target="_blank" rel="noreferrer">5</a> · <a href="https://commons.wikimedia.org/wiki/File:Allianz_Arena_closeup_on_grass.jpg" target="_blank" rel="noreferrer">6</a> · <a href="https://commons.wikimedia.org/wiki/File:Buffalo_grass_texture.jpg" target="_blank" rel="noreferrer">7</a> · <a href="https://commons.wikimedia.org/wiki/File:Cooch_lawn_texture.jpg" target="_blank" rel="noreferrer">8</a> · <a href="https://commons.wikimedia.org/wiki/File:Green_grass_texture_(Unsplash).jpg" target="_blank" rel="noreferrer">test</a>';
  root.querySelector('a[href$="Dry_wood_texture.jpg"]').href='https://commons.wikimedia.org/wiki/File:Light_wood_texture.jpg';
}

async function initScale(experiment,runtime,root,token){
  runtime.definitions=[
    {id:'sunflower',label:'Sunflower field',url:'images/lecture4/scale/sunflowers.jpg',point:{x:.62,y:.34},polarity:-1,threshold:.18,maxDetections:24},
    {id:'lanterns',label:'Sky lanterns',url:'images/lecture4/scale/lanterns.jpg',crop:[0,0,.75,.667],point:{x:.22,y:.69},polarity:1,threshold:.02,maxDetections:28}
  ];
  root.querySelector('.l4-scale-scenes').onclick=event=>{const button=event.target.closest('button');if(!button)return;experiment.state.scene=button.dataset.scene;selectScaleScene(experiment,runtime,root,token)};
  const sizeInput=root.querySelector('#l4ImageScale'),sizeValue=root.querySelector('#l4ImageScaleValue');sizeInput.value=experiment.state.imageScale;sizeValue.value=`${experiment.state.imageScale}%`;
  sizeInput.oninput=()=>{experiment.state.imageScale=Number(sizeInput.value);sizeValue.value=`${experiment.state.imageScale}%`;root.querySelector('#l4ScaleImage').style.width=`${experiment.state.imageScale}%`;root.querySelector('#l4ScalePosition').textContent='Resizing image and rebuilding scale space…';clearTimeout(runtime.resizeTimer);runtime.resizeTimer=setTimeout(()=>selectScaleScene(experiment,runtime,root,token),180)};
  await selectScaleScene(experiment,runtime,root,token);
}

async function selectScaleScene(experiment,runtime,root,token){
  const definition=runtime.definitions.find(scene=>scene.id===experiment.state.scene)||runtime.definitions[0],imageScale=clamp(Number(experiment.state.imageScale)||100,50,100),sceneToken=++runtime.sceneToken,cacheKey=`${definition.id}@${imageScale}`;
  root.querySelectorAll('.l4-scale-scenes button').forEach(button=>{const active=button.dataset.scene===definition.id;button.classList.toggle('active',active);button.setAttribute('aria-pressed',active)});
  root.querySelector('#l4ScaleSceneTitle').textContent=`${definition.label} · building scale space…`;root.querySelector('#l4ScalePosition').textContent='Filtering at eight scales…';root.querySelector('#l4DetectionSummary').textContent='Detecting spatial-and-scale maxima…';
  const canvas=root.querySelector('#l4ScaleImage');canvas.style.width=`${imageScale}%`;let scene=runtime.cache.get(cacheKey);
  if(!scene){const texture=await loadTexture(definition.url,Math.round(360*imageScale/100),Math.round(240*imageScale/100),definition.crop);if(token!==runtime.token||sceneToken!==runtime.sceneToken)return;scene=prepareScaleScene(texture,definition,imageScale);runtime.cache.set(cacheKey,scene)}
  if(token!==runtime.token||sceneToken!==runtime.sceneToken)return;runtime.scene=scene;runtime.scalePoint={...definition.point};
  canvas.onclick=event=>{const rect=canvas.getBoundingClientRect(),raw={x:clamp((event.clientX-rect.left)/rect.width,0,1),y:clamp((event.clientY-rect.top)/rect.height,0,1)},px=raw.x*scene.texture.w,py=raw.y*scene.texture.h,nearest=scene.detections.reduce((best,item)=>{const distance=Math.hypot(item.x-px,item.y-py);return !best||distance<best.distance?{item,distance}:best},null);runtime.scalePoint=nearest&&nearest.distance<Math.max(18,nearest.item.radius*1.15)?{x:nearest.item.x/scene.texture.w,y:nearest.item.y/scene.texture.h}:raw;renderScale(runtime,root)};
  renderScale(runtime,root);
}

function prepareScaleScene(texture,definition,imageScale){
  let mean=0,sumSquares=0;for(const value of texture.gray){mean+=value;sumSquares+=value*value}mean/=texture.gray.length;const sd=Math.sqrt(Math.max(1,sumSquares/texture.gray.length-mean*mean)),gray=new Float32Array(texture.gray.length);for(let i=0;i<gray.length;i++)gray[i]=(texture.gray[i]-mean)/sd;
  const sigmas=[1.8,2.8,4.2,6.4,9.6,14.5,22,33],maps=[],magnitudes=[];let commonMax=0;
  for(const sigma of sigmas){const narrow=gaussianBlur(gray,texture.w,texture.h,sigma),wide=gaussianBlur(gray,texture.w,texture.h,sigma*1.6),dog=new Float32Array(gray.length),magnitude=new Float32Array(gray.length);for(let i=0;i<dog.length;i++){dog[i]=narrow[i]-wide[i];magnitude[i]=Math.abs(dog[i]);commonMax=Math.max(commonMax,magnitude[i])}maps.push(dog);magnitudes.push(magnitude)}
  const detections=detectScaleMaxima(maps,sigmas,texture.w,texture.h,definition.polarity,definition.threshold,definition.maxDetections,definition.minDetectionScale||0,definition.detectionMaxY||1);return{definition,texture,sigmas,maps,magnitudes,commonMax,detections,imageScale};
}

function detectScaleMaxima(maps,sigmas,w,h,polarity,thresholdRatio,maxDetections,minScale=0,maxYRatio=1){
  const signed=value=>polarity===0?Math.abs(value):value*polarity;
  let globalMax=0;for(const map of maps)for(const value of map)globalMax=Math.max(globalMax,signed(value));const candidates=[];
  for(let scale=minScale;scale<maps.length-1;scale++){const map=maps[scale],sigma=sigmas[scale],border=Math.ceil(sigma*2),threshold=globalMax*thresholdRatio,yLimit=Math.min(h-border,Math.floor(h*maxYRatio));
    for(let y=border;y<yLimit;y+=2)for(let x=border;x<w-border;x+=2){const index=y*w+x,value=signed(map[index]);if(value<threshold||(scale>0&&value<signed(maps[scale-1][index]))||value<signed(maps[scale+1][index]))continue;let maximum=true;for(let dy=-2;dy<=2&&maximum;dy++)for(let dx=-2;dx<=2;dx++)if((dx||dy)&&signed(map[(y+dy)*w+x+dx])>value){maximum=false;break}if(maximum)candidates.push({x,y,scale,sigma,response:value,radius:sigma*1.8})}
  }
  candidates.sort((a,b)=>b.response-a.response);const selected=[];for(const candidate of candidates){if(selected.some(other=>Math.hypot(candidate.x-other.x,candidate.y-other.y)<.64*(candidate.radius+other.radius)))continue;selected.push(candidate);if(selected.length===maxDetections)break}return selected;
}

function responseScores(scene,x,y){return scene.magnitudes.map((map,index)=>{const radius=Math.max(1,Math.round(scene.sigmas[index]*.35));let sum=0,n=0;for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){sum+=map[clamp(y+dy,0,scene.texture.h-1)*scene.texture.w+clamp(x+dx,0,scene.texture.w-1)];n++}return sum/n})}

function scaleColor(sigma,sigmas){const t=(Math.log(sigma)-Math.log(sigmas[0]))/(Math.log(sigmas.at(-1))-Math.log(sigmas[0]));return `hsl(${220-205*t} 82% 48%)`}

function renderScale(runtime,root){
  const scene=runtime.scene;if(!scene)return;const {texture,sigmas,magnitudes,detections,commonMax,definition}=scene,point=runtime.scalePoint,x=Math.round(point.x*(texture.w-1)),y=Math.round(point.y*(texture.h-1)),scores=responseScores(scene,x,y),maximum=Math.max(...scores),winner=scores.indexOf(maximum),selected=sigmas[winner];
  const canvas=root.querySelector('#l4ScaleImage');copyCanvas(canvas,texture.canvas);const ctx=canvas.getContext('2d');detections.slice().sort((a,b)=>b.radius-a.radius).forEach(item=>{ctx.strokeStyle=scaleColor(item.sigma,sigmas);ctx.lineWidth=2.2;ctx.beginPath();ctx.arc(item.x,item.y,item.radius,0,Math.PI*2);ctx.stroke()});ctx.strokeStyle='#fff';ctx.lineWidth=5;ctx.beginPath();ctx.arc(x,y,Math.max(7,selected*1.8),0,Math.PI*2);ctx.stroke();ctx.strokeStyle='#d92323';ctx.lineWidth=2.5;ctx.stroke();ctx.fillStyle='#d92323';ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.fill();
  root.querySelector('#l4ScaleSceneTitle').textContent=`${definition.label} · ${scene.imageScale}% image size`;root.querySelector('#l4ScaleMaximum').textContent=`σ = ${selected}`;root.querySelector('#l4ScalePosition').textContent=`probe at (${x}, ${y}) · support radius ≈ ${Math.round(selected*1.8)} px`;const distinct=new Set(detections.map(item=>item.scale)).size;root.querySelector('#l4DetectionSummary').textContent=`${detections.length} strongest maxima shown across ${distinct} characteristic scales`;
  drawScaleChart(root.querySelector('#l4ScaleChart'),sigmas,scores,winner);drawScaleMaps(root.querySelector('#l4ScaleMaps'),scene,x,y,winner,commonMax);
}

function responseColor(value){const t=clamp(value,0,1),stops=[[8,12,35],[30,74,155],[23,190,207],[255,224,82],[218,35,35]],position=t*(stops.length-1),i=Math.min(stops.length-2,Math.floor(position)),u=position-i;return stops[i].map((value,index)=>Math.round(value+(stops[i+1][index]-value)*u))}

function drawScaleMaps(container,scene,x,y,winner,commonMax){
  if(container.children.length!==scene.sigmas.length)container.innerHTML=scene.sigmas.map((sigma,index)=>`<figure data-scale="${index}"><figcaption>σ = ${sigma}</figcaption><canvas aria-label="Absolute Difference-of-Gaussians response at sigma ${sigma}"></canvas></figure>`).join('');
  [...container.children].forEach((figure,index)=>{figure.classList.toggle('winner',index===winner);const canvas=figure.querySelector('canvas'),map=scene.magnitudes[index],image=new ImageData(scene.texture.w,scene.texture.h);for(let p=0;p<map.length;p++){const color=responseColor(map[p]/(commonMax||1));image.data[p*4]=color[0];image.data[p*4+1]=color[1];image.data[p*4+2]=color[2];image.data[p*4+3]=255}canvas.width=scene.texture.w;canvas.height=scene.texture.h;const ctx=canvas.getContext('2d');ctx.putImageData(image,0,0);ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x-5,y);ctx.lineTo(x+5,y);ctx.moveTo(x,y-5);ctx.lineTo(x,y+5);ctx.stroke()});
}

function drawScaleChart(canvas,sigmas,scores,winner){
  const dpr=devicePixelRatio||1,w=canvas.clientWidth||640,h=canvas.clientHeight||220;canvas.width=w*dpr;canvas.height=h*dpr;const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);const left=42,right=14,top=14,bottom=31,max=Math.max(...scores)||1;
  ctx.strokeStyle='#b8bcc4';ctx.lineWidth=1;ctx.strokeRect(left,top,w-left-right,h-top-bottom);ctx.fillStyle='#666';ctx.font='10px ui-monospace, monospace';ctx.textAlign='center';ctx.fillText('scale σ',left+(w-left-right)/2,h-7);ctx.save();ctx.translate(12,top+(h-top-bottom)/2);ctx.rotate(-Math.PI/2);ctx.fillText('normalized response',0,0);ctx.restore();
  const points=sigmas.map((sigma,index)=>({x:left+index/(sigmas.length-1)*(w-left-right),y:top+(1-scores[index]/max)*(h-top-bottom)}));ctx.strokeStyle='#315ee7';ctx.lineWidth=2;ctx.beginPath();points.forEach((point,index)=>index?ctx.lineTo(point.x,point.y):ctx.moveTo(point.x,point.y));ctx.stroke();
  points.forEach((point,index)=>{ctx.fillStyle=index===winner?'#d92323':'#315ee7';ctx.beginPath();ctx.arc(point.x,point.y,index===winner?5:3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#666';ctx.fillText(sigmas[index],point.x,h-bottom+15)});
}

async function initClassifier(experiment,runtime,root,token){
  const definitions=[
    {id:'grass',label:'Grass',train:Array.from({length:8},(_,index)=>`images/lecture4/materials/grass-train-${String(index+1).padStart(2,'0')}.jpg?v=2`),test:'images/lecture4/materials/grass-test.jpg',testCrop:[56,56]},
    {id:'wood',label:'Wood',train:Array.from({length:8},(_,index)=>`images/lecture4/materials/wood-train-${String(index+1).padStart(2,'0')}.jpg`),test:'images/lecture4/materials/wood-test.jpg?v=2',testCrop:[56,56]},
    {id:'knit',label:'Knit',train:Array.from({length:8},(_,index)=>`images/lecture4/materials/knit-train-${String(index+1).padStart(2,'0')}.jpg`),test:'images/lecture4/materials/knit-test.jpg',testCrop:[56,56]}
  ];
  const textures=await Promise.all(definitions.map(async definition=>({...definition,trainTextures:await Promise.all(definition.train.map(url=>loadSquare(url,240))),testTexture:await loadSquare(definition.test,240)})));if(token!==runtime.token)return;runtime.classTextures=textures;
  runtime.classBank=[4,8,16,32].flatMap(wavelength=>[0,45,90,135].map(theta=>makeGabor({gamma:.7,sigma:wavelength*.42,theta,wavelength})));
  runtime.training=textures.flatMap((texture,classIndex)=>texture.trainTextures.map((source,sourceIndex)=>{const patch=cropTexture(source,56,56,128);return{classIndex,patchIndex:sourceIndex,sourceIndex,label:texture.label,patch,features:classifierFeatures(patch,runtime.classBank).features}}));
  runtime.pca=fitPca(runtime.training.map(sample=>sample.features));renderTrainingPatches(runtime,root);
  root.querySelector('.l4-material-buttons').onclick=event=>{const button=event.target.closest('button');if(button){experiment.state.material=button.dataset.material;renderClassifier(experiment,runtime,root)}};renderClassifier(experiment,runtime,root);
}

function classifierFeatures(texture,bank){
  let sum=0,sumSquares=0;for(const value of texture.gray){sum+=value;sumSquares+=value*value}const mean=sum/texture.gray.length,sd=Math.sqrt(Math.max(0,sumSquares/texture.gray.length-mean*mean))||1,gray=new Float32Array(texture.gray.length);for(let i=0;i<gray.length;i++)gray[i]=(texture.gray[i]-mean)/sd;
  const standardized={...texture,gray},responses=bank.map(kernel=>gaborResponse(standardized,kernel)),features=responses.map(response=>response.meanAbs);return{responses,features};
}

function fitPca(rows){
  const n=rows.length,d=rows[0].length,means=new Array(d).fill(0),scales=new Array(d).fill(0);rows.forEach(row=>row.forEach((value,index)=>means[index]+=value/n));rows.forEach(row=>row.forEach((value,index)=>scales[index]+=(value-means[index])**2));for(let j=0;j<d;j++)scales[j]=Math.sqrt(scales[j]/Math.max(1,n-1))||1;
  const normalized=rows.map(row=>row.map((value,index)=>(value-means[index])/scales[index])),covariance=Array.from({length:d},()=>new Array(d).fill(0));normalized.forEach(row=>{for(let i=0;i<d;i++)for(let j=0;j<d;j++)covariance[i][j]+=row[i]*row[j]/Math.max(1,n-1)});
  const components=[],eigenvalues=[];for(let component=0;component<2;component++){let vector=Array.from({length:d},(_,index)=>Math.sin((index+1)*(component+1)+.37));for(let iteration=0;iteration<80;iteration++){let next=covariance.map(row=>row.reduce((sum,value,index)=>sum+value*vector[index],0));components.forEach(previous=>{const projection=next.reduce((sum,value,index)=>sum+value*previous[index],0);next=next.map((value,index)=>value-projection*previous[index])});const length=Math.hypot(...next)||1;vector=next.map(value=>value/length)}components.push(vector);const transformed=covariance.map(row=>row.reduce((sum,value,index)=>sum+value*vector[index],0));eigenvalues.push(vector.reduce((sum,value,index)=>sum+value*transformed[index],0))}
  const scores=normalized.map(row=>components.map(component=>row.reduce((sum,value,index)=>sum+value*component[index],0))),trace=covariance.reduce((sum,row,index)=>sum+row[index],0);return{means,scales,components,scores,explained:(eigenvalues[0]+eigenvalues[1])/(trace||1)};
}

function projectPca(features,pca){const normalized=features.map((value,index)=>(value-pca.means[index])/pca.scales[index]);return pca.components.map(component=>normalized.reduce((sum,value,index)=>sum+value*component[index],0))}
function euclidean(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1])}

function renderTrainingPatches(runtime,root){
  const rows=root.querySelector('#l4TrainingRows');rows.innerHTML=runtime.classTextures.map((texture,classIndex)=>`<div class="l4-training-row"><b><i style="--class-color:${classColor(classIndex)}"></i>${texture.label}</b><div>${runtime.training.filter(sample=>sample.classIndex===classIndex).map(sample=>`<canvas id="l4Train${classIndex}-${sample.patchIndex}" aria-label="${texture.label} training patch ${sample.patchIndex+1}"></canvas>`).join('')}</div></div>`).join('');runtime.training.forEach(sample=>copyCanvas(root.querySelector(`#l4Train${sample.classIndex}-${sample.patchIndex}`),sample.patch.canvas));
}

function classColor(index){return['#43804c','#b85843','#315ee7'][index]}

function drawMarker(ctx,x,y,classIndex,size=5){ctx.fillStyle=classColor(classIndex);ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.beginPath();if(classIndex===0)ctx.rect(x-size,y-size,size*2,size*2);else if(classIndex===1)ctx.arc(x,y,size,0,Math.PI*2);else{ctx.moveTo(x,y-size-1);ctx.lineTo(x+size+1,y+size);ctx.lineTo(x-size-1,y+size);ctx.closePath()}ctx.fill();ctx.stroke()}
function drawStar(ctx,x,y,radius=8){ctx.beginPath();for(let i=0;i<10;i++){const angle=-Math.PI/2+i*Math.PI/5,r=i%2?radius*.43:radius,px=x+Math.cos(angle)*r,py=y+Math.sin(angle)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py)}ctx.closePath();ctx.fillStyle='#111';ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.fill();ctx.stroke()}

function drawPcaPlot(canvas,runtime,query,mode){
  const dpr=devicePixelRatio||1,w=canvas.clientWidth||520,h=canvas.clientHeight||360;canvas.width=w*dpr;canvas.height=h*dpr;const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);const training=runtime.training.map((sample,index)=>({...sample,point:runtime.pca.scores[index]})),centroids=runtime.classTextures.map((texture,classIndex)=>{const rows=training.filter(sample=>sample.classIndex===classIndex);return{classIndex,label:texture.label,point:[rows.reduce((sum,row)=>sum+row.point[0],0)/rows.length,rows.reduce((sum,row)=>sum+row.point[1],0)/rows.length]}}),all=[...training.map(sample=>sample.point),...centroids.map(item=>item.point),query.point],xs=all.map(point=>point[0]),ys=all.map(point=>point[1]),xSpan=Math.max(...xs)-Math.min(...xs)||1,ySpan=Math.max(...ys)-Math.min(...ys)||1,xMin=Math.min(...xs)-xSpan*.14,xMax=Math.max(...xs)+xSpan*.14,yMin=Math.min(...ys)-ySpan*.16,yMax=Math.max(...ys)+ySpan*.16,margin={left:43,right:16,top:30,bottom:39},px=value=>margin.left+(value-xMin)/(xMax-xMin)*(w-margin.left-margin.right),py=value=>h-margin.bottom-(value-yMin)/(yMax-yMin)*(h-margin.top-margin.bottom);
  ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#c7cad1';ctx.lineWidth=1;ctx.strokeRect(margin.left,margin.top,w-margin.left-margin.right,h-margin.top-margin.bottom);ctx.fillStyle='#666';ctx.font='10px ui-monospace, monospace';ctx.textAlign='center';ctx.fillText('PC1',margin.left+(w-margin.left-margin.right)/2,h-9);ctx.save();ctx.translate(12,margin.top+(h-margin.top-margin.bottom)/2);ctx.rotate(-Math.PI/2);ctx.fillText('PC2',0,0);ctx.restore();
  const candidates=mode==='nn'?training:centroids,distances=candidates.map(candidate=>euclidean(query.point,candidate.point)),winnerIndex=distances.indexOf(Math.min(...distances)),winner=candidates[winnerIndex];if(mode==='mean')centroids.forEach((centroid,index)=>{ctx.strokeStyle=index===winnerIndex?classColor(centroid.classIndex):'#d7d9de';ctx.lineWidth=index===winnerIndex?2.5:1;ctx.beginPath();ctx.moveTo(px(query.point[0]),py(query.point[1]));ctx.lineTo(px(centroid.point[0]),py(centroid.point[1]));ctx.stroke()});else{ctx.strokeStyle='#111';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px(query.point[0]),py(query.point[1]));ctx.lineTo(px(winner.point[0]),py(winner.point[1]));ctx.stroke()}
  training.forEach(sample=>drawMarker(ctx,px(sample.point[0]),py(sample.point[1]),sample.classIndex,4.5));if(mode==='mean')centroids.forEach(centroid=>{const x=px(centroid.point[0]),y=py(centroid.point[1]);ctx.strokeStyle=classColor(centroid.classIndex);ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x-7,y);ctx.lineTo(x+7,y);ctx.moveTo(x,y-7);ctx.lineTo(x,y+7);ctx.stroke()});drawStar(ctx,px(query.point[0]),py(query.point[1]));ctx.fillStyle='#333';ctx.font='700 10px ui-monospace, monospace';ctx.textAlign='left';ctx.fillText('query',px(query.point[0])+10,py(query.point[1])-8);return{winner,distance:distances[winnerIndex],centroids};
}

function renderClassifier(experiment,runtime,root){
  const selected=runtime.classTextures.find(texture=>texture.id===experiment.state.material),test=cropTexture(selected.testTexture,selected.testCrop[0],selected.testCrop[1],128),features=classifierFeatures(test,runtime.classBank).features,point=projectPca(features,runtime.pca),query={point},nn=drawPcaPlot(root.querySelector('#l4NnPlot'),runtime,query,'nn'),mean=drawPcaPlot(root.querySelector('#l4MeanPlot'),runtime,query,'mean');copyCanvas(root.querySelector('#l4ClassInput'),test.canvas);copyCanvas(root.querySelector('#l4NnMatch'),nn.winner.patch.canvas);
  root.querySelector('#l4NnPrediction').textContent=nn.winner.label;root.querySelector('#l4NnDistance').textContent=`Euclidean distance ${nn.distance.toFixed(2)}`;root.querySelector('#l4MeanPrediction').textContent=mean.winner.label;root.querySelector('#l4MeanDistance').textContent=`Euclidean distance ${mean.distance.toFixed(2)}`;root.querySelector('#l4MeanSwatch').style.background=classColor(mean.winner.classIndex);root.querySelector('#l4PcaVariance').textContent=`PC1 + PC2 retain ${(runtime.pca.explained*100).toFixed(1)}% of standardized training variance`;root.querySelector('#l4ClassifierStatus').textContent=`True class: ${selected.label} · 1-NN: ${nn.winner.label} · nearest class mean: ${mean.winner.label} · distances measured in the displayed PCA plane`;
  root.querySelectorAll('.l4-material-buttons button').forEach(button=>{const active=button.dataset.material===selected.id;button.classList.toggle('active',active);button.setAttribute('aria-pressed',active)});
}
