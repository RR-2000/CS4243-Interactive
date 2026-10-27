// Lecture 12 · Live MOSSE vs. fixed-template NCC tracker.
// Webcam (or a scripted scene) → 320-px grayscale frame → both trackers → overlays, response maps, PSR timeline.

import {MosseTracker,NccTracker,grayFrame,GRID,TEMPLATE_GRID} from './trackers.js';
import {createScene,SCENE_W,SCENE_H,SCENE_FPS} from './synthetic-scene.js';
import {boxIoU} from './shared.js';
import {TRACK_COLORS,PSR_AXIS_MAX,drawTrackerView,drawPlaceholder,drawGray,drawHeat,cropCenter,drawTimeline} from './tracker-views.js';

const PROC_WIDTH=320;   // trackers run on a 320-px-wide grayscale frame
const DISPLAY_WIDTH=640;
const HISTORY=240;      // 8 s of PSR history at 30 fps
const TRAIL=40;
const MIN_BOX=12;       // minimum box side in processing pixels
const LOST_IOU=.3;      // simulation: IoU with the true box below this counts as "lost"
const FRAME_MS=1000/SCENE_FPS;
const KINDS=['ncc','mosse'];
const ID={ncc:'Ncc',mosse:'Mosse'};
const ETA_PRESETS=[[.02,'0.02 · stable, goes stale'],[.125,'0.125 · paper default'],[.4,'0.4 · adapts fast, drifts']];

const SCENE_NOTES={
  turn:'<b>Head turn.</b> The person turns to profile and walks along a bookshelf (with a framed photo of themself on it). The <b class="k-ncc">NCC</b> template is frozen at the frontal face: it no longer matches the profile, so its box is left behind among the books. <b class="k-mosse">MOSSE</b> has re-trained on the profile and walks with the person.',
  occlusion:'<b>Hand occlusion.</b> A hand covers the face for 2 s, then is pulled away. Watch MOSSE’s <i>appearance memory</i> turn into a hand — then replay with the confidence check switched on.',
  crossing:'<b>Walk past a colleague.</b> A second person crosses in front of the target. Watch where both boxes go, and what PSR does while the faces overlap.'
};
const SCENE_FOLLOW_UP={
  turn:s=>s.eta<.05?'With η this small MOSSE still mostly remembers the frontal face: it goes stale and is caught by the photo of that face. Set η back to 0.125 and replay.':'Now set η = 0.02 and replay: a slowly learning MOSSE goes stale too.',
  occlusion:s=>s.gate?'With the confidence check on, MOSSE refused to learn the hand and waited for the face.':'Now tick <b>Skip the MOSSE update when the peak is weak</b> and replay.',
  crossing:()=>'A face is still a face: PSR stays high, so the confidence check cannot tell the two people apart. Keeping identities needs motion and data association.'
};
const TRY_CARDS=[
  {scenario:'turn',title:'1 · Turn your head',act:'Box your face. Turn your head to the side and, while turned, lean or step sideways about a head-width — then turn back. (Turning on the spot is often not enough: NCC can still cling to the head outline.)',watch:'Even before it fails, <b class="k-ncc">NCC</b>’s peak is flat (PSR ≈ 3) while <b class="k-mosse">MOSSE</b>’s stays sharp. When you move while turned, NCC slides off — its frozen frontal template no longer matches — and MOSSE, re-training every frame, moves with you.',then:'Then set η = 0.02: MOSSE now learns too slowly and goes stale as well (in the simulation it is caught by a photo of the frontal face).',slide:'Incremental Update · Small η vs. large η'},
  {scenario:'occlusion',title:'2 · Cover it with your hand',act:'Hold a hand over your face for about 2 s — keep your head still — then slide the hand away.',watch:'Gate off: MOSSE’s memory turns into a hand and the box leaves with it — <b>drift</b>. Gate on: PSR drops under the red line, updates are skipped, and the face is re-acquired.',then:'NCC never learns the hand either — but with nothing to match while the face is hidden, its peak wanders off. Gate caveat: a held box does not move, so if you walk away while covered it is left behind — real trackers add re-detection.',slide:'Tracking Issues · Confidence and recovery'},
  {scenario:'crossing',title:'3 · Walk past a colleague',act:'Track a face while someone walks in front of it.',watch:'Both boxes usually jump to the other person. Faces look alike, so PSR stays high — the confidence check cannot help.',then:'This is the crossing failure from the results video.',slide:'Next: data association',go:true}
];

export function createTrackerLab({root,$,$$,controlRange,bindRange,segment,bindSegment,heatColor,app,navigate,refreshGuide}){
  let rt=null,generation=0;
  const ctx2d=id=>$('#'+id).getContext('2d');

  function panel(kind){
    const ncc=kind==='ncc',K=ID[kind];
    return `<figure class="card track-card track-${kind}">
      <figcaption><span><i class="k-dot k-${kind}"></i>${ncc?'Fixed template · NCC':'MOSSE · adaptive correlation filter'}</span><small>${ncc?'template never updated':'re-trained every frame with η'}</small></figcaption>
      <div class="flow-sub">${ncc?'Slides the patch from the first frame over the search window and scores each position with normalized cross-correlation.':'Correlates a learned filter with the search window, moves to the peak, then updates its running statistics A, B with the new patch.'}</div>
      <div class="canvas-box track-stage"><canvas id="trackView${K}" aria-label="${ncc?'NCC':'MOSSE'} tracker view"></canvas><span class="flow-badge" id="trackBadge${K}">no box yet</span></div>
      <div class="track-inspect">
        <div class="track-mini"><canvas id="trackModel${K}" width="128" height="128"></canvas><small>${ncc?'Template · frozen at the first frame':'Appearance memory · η-weighted patches'}</small></div>
        <div class="track-mini"><canvas id="trackResp${K}" width="132" height="132"></canvas><small>Response map · ○ peak, + no motion</small></div>
        <div class="track-readout"><small>Peak sharpness (PSR)</small><b id="trackPsr${K}">—</b><div class="track-meter"><span class="track-meter-fill" id="trackMeter${K}"></span><span class="track-meter-mark" id="trackMark${K}"></span></div><p id="trackState${K}">Draw a box to start.</p></div>
      </div>
    </figure>`;
  }

  function layout(s){
    const presets=ETA_PRESETS.map(([v,label])=>`<button type="button" data-eta="${v}">${label}</button>`).join('');
    const cards=TRY_CARDS.map(c=>`<article class="track-try-card"><h3>${c.title}</h3><p><b>Do:</b> ${c.act}</p><p><b>Watch:</b> ${c.watch}</p><p class="track-then">${c.then}</p><div class="track-try-foot"><small>${c.slide}</small><span><button class="button ghost" type="button" data-try="${c.scenario}">Simulate</button>${c.go?'<button class="button" type="button" data-go="dataAssociation">Association exercise →</button>':''}</span></div></article>`).join('');
    return `<div class="controls track-controls">
        <div class="control narrow"><span class="control-label">Video source</span>${segment('trackSource',[['webcam','Webcam'],['sim','Simulated scene']],s.source)}</div>
        <div class="control" id="trackScenarioControl"><span class="control-label">Scene</span>${segment('trackScenario',[['turn','Head turn'],['occlusion','Hand occlusion'],['crossing','Walk past']],s.scenario)}</div>
        <div class="track-buttons"><button class="button" id="trackPrimary" type="button">Start camera</button><button class="button ghost" id="trackPause" type="button">Pause</button><button class="button ghost" id="trackReset" type="button">Redraw box</button><button class="button ghost" id="trackFlip" type="button">Switch camera</button></div>
      </div>
      <div class="controls track-controls">
        <div class="track-param">${controlRange('trackEta','MOSSE learning rate η',.01,.5,s.eta,.005)}<div class="track-presets" aria-label="η presets">${presets}</div></div>
        <div class="track-param">${controlRange('trackThreshold','PSR threshold',2,20,s.threshold,.5)}<label class="track-toggle"><input type="checkbox" id="trackGate" ${s.gate?'checked':''}> Skip the MOSSE update when the peak is weak (PSR &lt; threshold)</label></div>
      </div>
      <div class="instruction track-instruction" id="trackInstruction" role="status" aria-live="polite"></div>
      <div class="track-grid">${panel('ncc')}${panel('mosse')}</div>
      <figure class="card track-timeline"><figcaption><span>Peak sharpness (PSR) over the last 8 s</span><small><i class="k-dot k-ncc"></i>NCC <i class="k-dot k-mosse"></i>MOSSE <i class="k-dot k-skip"></i>MOSSE update skipped</small></figcaption><div class="flow-sub">PSR = (peak − mean of the rest of the map) ÷ its standard deviation. A sharp, isolated peak gives a high PSR; an occluded or confused target gives a flat map and a low PSR.</div><canvas id="trackChart" class="track-chart"></canvas></figure>
      <div class="flow-status" id="trackStatus"></div>
      <h2 class="track-heading">Try this in class</h2>
      <div class="track-try">${cards}</div>
      <div class="note flow-takeaway"><b>Classroom takeaway:</b> a <b>fixed template</b> never drifts but goes stale when the target changes appearance. <b>MOSSE</b> adapts through η, but it learns whatever is inside the box — including a hand. <b>PSR</b> tells it when <i>not</i> to learn. None of them can keep an identity when a similar object crosses: that needs motion and data association.</div>
      <div class="flow-source-note">Your camera video is processed only inside this browser tab; nothing is uploaded. MOSSE follows Bolme et al., “Visual Object Tracking using Adaptive Correlation Filters”, CVPR 2010 (learning rate η = 0.125, PSR ≈ 7 for failure). Both trackers look only inside the same window (2 × the box) around their last position, at one fixed scale; the NCC template must fit inside it, so NCC can move at most half a box per frame.</div>`;
  }

  function setInstruction(html,isError=false){
    const element=$('#trackInstruction');if(!element)return;
    element.innerHTML=html;element.classList.toggle('track-error',isError);
  }
  function setSegment(id,value){$$('button',$('#'+id)).forEach(b=>b.classList.toggle('active',b.dataset.value===value))}
  function setPaused(paused){rt.paused=paused;const button=$('#trackPause');if(button)button.textContent=paused?'Resume':'Pause'}

  function syncSourceUi(){
    const s=rt.experiment.state,sim=s.source==='sim';
    $('#trackScenarioControl').hidden=!sim;$('#trackFlip').hidden=sim;
    $('#trackPrimary').textContent=sim?'Replay scene':rt.stream?'Restart camera':'Start camera';
  }

  function bindControls(s){
    bindSegment('trackSource',value=>{s.source=value;setSource()});
    bindSegment('trackScenario',value=>{s.scenario=value;setSource()});
    bindRange('trackEta',value=>{s.eta=value},value=>(+value).toFixed(3));
    bindRange('trackThreshold',value=>{s.threshold=value;updateReadouts();drawChart()},value=>(+value).toFixed(1));
    $('#trackGate').addEventListener('change',event=>{s.gate=event.target.checked});
    $('.track-presets').addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button)return;
      s.eta=+button.dataset.eta;$('#trackEta').value=s.eta;$('#trackEtaOut').textContent=s.eta.toFixed(3);refreshGuide();
    });
    $('#trackPrimary').addEventListener('click',()=>s.source==='sim'?startScene():startCamera());
    $('#trackPause').addEventListener('click',()=>setPaused(!rt.paused));
    $('#trackReset').addEventListener('click',requestNewBox);
    $('#trackFlip').addEventListener('click',()=>{s.facing=s.facing==='user'?'environment':'user';startCamera()});
    $('.track-try').addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button)return;
      if(button.dataset.go){navigate(button.dataset.go);return}
      s.source='sim';s.scenario=button.dataset.try;setSegment('trackSource','sim');setSegment('trackScenario',s.scenario);setSource();
      $('.track-grid').scrollIntoView({behavior:'smooth',block:'start'});
    });
    KINDS.forEach(kind=>bindDrawing(rt.views[kind]));
  }

  // ----- drawing a box on either video -----
  function toDisplay(view,event){
    const bounds=view.getBoundingClientRect();
    return{x:Math.min(view.width,Math.max(0,(event.clientX-bounds.left)/bounds.width*view.width)),y:Math.min(view.height,Math.max(0,(event.clientY-bounds.top)/bounds.height*view.height))};
  }
  function bindDrawing(view){
    view.addEventListener('pointerdown',event=>{
      if(!rt.sourceReady)return;
      event.preventDefault();view.setPointerCapture(event.pointerId);
      const point=toDisplay(view,event);rt.drag={start:point,box:{cx:point.x,cy:point.y,w:0,h:0}};
    });
    view.addEventListener('pointermove',event=>{
      if(!rt.drag)return;
      const point=toDisplay(view,event),start=rt.drag.start;
      rt.drag.box={cx:(start.x+point.x)/2,cy:(start.y+point.y)/2,w:Math.abs(point.x-start.x),h:Math.abs(point.y-start.y)};
      if(rt.paused||rt.finished)redraw();
    });
    view.addEventListener('pointerup',()=>{
      if(!rt.drag)return;
      const box=rt.drag.box,k=1/rt.scale;rt.drag=null;
      const proc={cx:box.cx*k,cy:box.cy*k,w:box.w*k,h:box.h*k};
      if(proc.w<MIN_BOX||proc.h<MIN_BOX){setInstruction('That box is too small — drag a larger box around the target.');redraw();return}
      initTrackers(proc);
      if(rt.awaitBox){rt.awaitBox=false;setPaused(false)}
    });
    view.addEventListener('pointercancel',()=>{rt.drag=null;redraw()});
  }
  function requestNewBox(){
    if(rt.scene&&rt.finished){startScene();setInstruction('Replaying the scene. Pause at any moment and press <b>Redraw box</b> to draw your own box on that frame.');return}
    clearTrackers();
    if(rt.scene){rt.awaitBox=true;setPaused(true);setInstruction('Paused. Drag a new box on either video — playback resumes when you release.')}
    else setInstruction('Drag a new box around your face or an object. Both trackers restart from the same box.');
  }

  // ----- sources -----
  function configureSize(width,height){
    rt.procW=PROC_WIDTH;rt.procH=Math.round(PROC_WIDTH*height/width);
    rt.displayW=DISPLAY_WIDTH;rt.displayH=Math.round(DISPLAY_WIDTH*height/width);rt.scale=rt.displayW/rt.procW;
    rt.frameCanvas.width=rt.displayW;rt.frameCanvas.height=rt.displayH;rt.proc.width=rt.procW;rt.proc.height=rt.procH;
    KINDS.forEach(kind=>{rt.views[kind].width=rt.displayW;rt.views[kind].height=rt.displayH});
    rt.frameCtx=rt.frameCanvas.getContext('2d');rt.procCtx=rt.proc.getContext('2d',{willReadFrequently:true});
  }

  // Bumping the token invalidates any pending startCamera() and stale frame loops.
  function stopSource(){
    rt.token=++generation;
    cancelAnimationFrame(rt.raf);rt.raf=0;rt.drag=null;setPaused(false);
    rt.stream?.getTracks().forEach(track=>track.stop());rt.stream=null;
    rt.video?.remove();rt.video=null;rt.scene=null;rt.sourceReady=false;rt.finished=false;rt.awaitBox=false;rt.truth=null;
    clearTrackers();
  }

  function setSource(){
    stopSource();
    syncSourceUi();
    refreshGuide();
    if(rt.experiment.state.source==='sim')startScene();
    else showCameraPrompt();
  }

  function showCameraPrompt(){
    configureSize(640,480);
    KINDS.forEach(kind=>drawPlaceholder(rt.views[kind].getContext('2d'),['Webcam is off','Press “Start camera”, then drag a box around your face']));
    setInstruction('Press <b>Start camera</b>. Then drag a box around your face (or any object) in either video — both trackers start from that box. No camera? Choose <b>Simulated scene</b>.');
    $('#trackStatus').textContent='';
  }

  function cameraErrorMessage(error){
    if(error?.name==='NotAllowedError')return'Camera permission was denied. Allow camera access in the browser’s address bar and press Start camera again — or use the simulated scene.';
    if(error?.name==='NotFoundError'||error?.name==='OverconstrainedError')return'No camera was found on this device. Use the simulated scene instead.';
    if(error?.name==='NotReadableError')return'The camera is busy in another app (Zoom, Teams…). Close it and press Start camera again.';
    const detail=String(error?.message||'unknown error').replace(/[&<>"']/g,c=>`&#${c.charCodeAt(0)};`);
    return`Could not start the camera (${detail}). Use the simulated scene instead.`;
  }

  async function startCamera(){
    stopSource();showCameraPrompt();
    const token=rt.token,s=rt.experiment.state;
    if(!navigator.mediaDevices?.getUserMedia){
      setInstruction('This page cannot open a camera here: browsers only allow it on HTTPS or localhost. Use the simulated scene instead.',true);return;
    }
    setInstruction('Waiting for camera permission…');
    let stream;
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:s.facing},width:{ideal:640},height:{ideal:480}}});
    }catch(error){
      if(rt?.token===token)setInstruction(cameraErrorMessage(error),true);
      return;
    }
    if(rt?.token!==token||s.source!=='webcam'){stream.getTracks().forEach(track=>track.stop());return}
    const video=document.createElement('video');
    video.muted=true;video.playsInline=true;video.setAttribute('playsinline','');video.className='track-hidden-video';video.srcObject=stream;
    root.append(video);rt.stream=stream;rt.video=video;
    try{await video.play()}catch(error){if(rt?.token===token){stopSource();setInstruction(cameraErrorMessage(error),true)}return}
    if(rt?.token!==token||rt.video!==video)return;
    rt.mirror=(stream.getVideoTracks()[0]?.getSettings().facingMode??s.facing)!=='environment';
    configureSize(video.videoWidth||640,video.videoHeight||480);
    rt.sourceReady=true;rt.lastTick=0;rt.lastVideoTime=-1;rt.fps=0;
    stream.getVideoTracks()[0]?.addEventListener('ended',()=>setInstruction('The camera stopped. Press Start camera to reconnect.',true));
    syncSourceUi();
    setInstruction('Camera on. <b>Drag a box around your face</b> (or any object) in either video.');
    scheduleCamera(token);
  }

  // requestAnimationFrame rather than requestVideoFrameCallback: the <video> element is hidden,
  // and browsers stop delivering frame callbacks for videos that are not composited.
  function scheduleCamera(token){
    const tick=now=>{
      if(rt?.token!==token||!rt.video)return;
      // Process at most 30 frames per second so η means the same thing on every device.
      // Skip repeated frames too (a dim camera may deliver only 15 fps).
      if(!rt.paused&&rt.video.readyState>=2&&now-rt.lastTick>=FRAME_MS-4&&rt.video.currentTime!==rt.lastVideoTime){
        rt.lastVideoTime=rt.video.currentTime;
        if(rt.lastTick)rt.fps=rt.fps?rt.fps*.9+100/(now-rt.lastTick):1000/(now-rt.lastTick);
        rt.lastTick=now;processFrame(rt.video);
      }
      rt.raf=requestAnimationFrame(tick);
    };
    rt.raf=requestAnimationFrame(tick);
  }

  function startScene(){
    stopSource();syncSourceUi();
    const s=rt.experiment.state,token=rt.token;
    rt.scene=createScene(s.scenario);rt.mirror=false;
    rt.sceneCanvas=document.createElement('canvas');rt.sceneCanvas.width=SCENE_W;rt.sceneCanvas.height=SCENE_H;
    rt.sceneCtx=rt.sceneCanvas.getContext('2d',{willReadFrequently:true});
    configureSize(SCENE_W,SCENE_H);
    rt.sourceReady=true;rt.frame=0;rt.lastTick=0;setPaused(false);
    setInstruction(SCENE_NOTES[s.scenario]+' <span class="track-legend-truth">White dashed box = true target.</span>');
    const loop=now=>{
      if(rt?.token!==token||!rt.scene)return;
      if(!rt.paused&&!rt.finished&&now-rt.lastTick>=FRAME_MS-1){rt.lastTick=now;advanceScene()}
      rt.raf=requestAnimationFrame(loop);
    };
    rt.raf=requestAnimationFrame(loop);
  }

  function advanceScene(){
    const truth=rt.scene.render(rt.sceneCtx,rt.frame),k=rt.procW/SCENE_W;
    rt.truth={cx:truth.cx*k,cy:truth.cy*k,w:truth.w*k,h:truth.h*k};
    processFrame(rt.sceneCanvas);
    if(!rt.trackers&&!rt.awaitBox)initTrackers(rt.truth);
    rt.frame++;
    $('#trackStatus').textContent=`Simulated scene · t = ${(rt.frame/SCENE_FPS).toFixed(1)} s of ${(rt.scene.frames/SCENE_FPS).toFixed(1)} s${timingText()}`;
    if(rt.frame>=rt.scene.frames){rt.finished=true;showSummary()}
  }

  function showSummary(){
    const s=rt.experiment.state;
    const describe=kind=>{
      const lost=rt.lost[kind];
      if(!rt.trackers)return'was not running';
      if(!lost.frames)return'stayed on the target for the whole scene ✓';
      if(lost.now)return`lost the target at ${(lost.since/SCENE_FPS).toFixed(1)} s ✗`;
      return`lost it for ${(lost.frames/SCENE_FPS).toFixed(1)} s, then found it again`;
    };
    setInstruction(`<b>Scene finished.</b> <b class="k-ncc">NCC</b> ${describe('ncc')}. <b class="k-mosse">MOSSE</b> ${describe('mosse')}. ${SCENE_FOLLOW_UP[s.scenario](s)}`);
  }

  // ----- per-frame processing -----
  function drawSource(context,source,width,height){
    context.save();
    if(rt.mirror){context.translate(width,0);context.scale(-1,1)}
    context.drawImage(source,0,0,width,height);
    context.restore();
  }

  function processFrame(source){
    drawSource(rt.frameCtx,source,rt.displayW,rt.displayH);
    drawSource(rt.procCtx,source,rt.procW,rt.procH);
    rt.gray=grayFrame(rt.procCtx.getImageData(0,0,rt.procW,rt.procH).data,rt.procW,rt.procH);
    if(rt.trackers)step();
    else if(!rt.scene)$('#trackStatus').textContent=`Camera ${rt.video.videoWidth} × ${rt.video.videoHeight} · trackers run on a ${rt.procW} × ${rt.procH} grayscale frame`;
    redraw();
    app.output=rt.views.mosse;
  }

  function step(){
    const s=rt.experiment.state,{ncc,mosse}=rt.trackers;
    mosse.eta=s.eta;
    let start=performance.now();
    const nccResult=ncc.track(rt.gray);
    rt.timing.ncc=rt.timing.ncc*.9+(performance.now()-start)*.1;
    start=performance.now();
    const mosseResult=mosse.track(rt.gray,{gate:s.gate,threshold:s.threshold});
    rt.timing.mosse=rt.timing.mosse*.9+(performance.now()-start)*.1;
    rt.results={ncc:nccResult,mosse:mosseResult};
    KINDS.forEach(kind=>{
      const trail=rt.trails[kind];trail.push({x:rt.results[kind].box.cx,y:rt.results[kind].box.cy});
      if(trail.length>TRAIL)trail.shift();
    });
    rt.history.push({ncc:nccResult.psr,mosse:mosseResult.psr,skipped:mosseResult.skipped});
    if(rt.history.length>HISTORY)rt.history.shift();
    if(rt.truth)scoreAgainstTruth();
    if(!rt.scene)$('#trackStatus').textContent=`Camera · ${rt.fps.toFixed(0)} fps · trackers run on ${rt.procW} × ${rt.procH} grayscale${timingText()}`;
    updateInspectors();updateReadouts();drawChart();
  }

  function timingText(){
    return rt.trackers?` · per frame: NCC ${rt.timing.ncc.toFixed(1)} ms, MOSSE ${rt.timing.mosse.toFixed(1)} ms`:'';
  }

  function scoreAgainstTruth(){
    KINDS.forEach(kind=>{
      const lost=rt.lost[kind],onTarget=boxIoU(rt.results[kind].box,rt.truth)>=LOST_IOU;
      if(onTarget){lost.now=false;return}
      if(!lost.now){lost.now=true;lost.since=rt.frame}
      lost.frames++;
    });
  }

  function initTrackers(box){
    if(!rt.gray)return;
    const s=rt.experiment.state,ncc=new NccTracker(),mosse=new MosseTracker({eta:s.eta});
    ncc.init(rt.gray,box);mosse.init(rt.gray,box);
    rt.trackers={ncc,mosse};
    rt.results={ncc:{box:{...ncc.box},psr:null},mosse:{box:{...mosse.box},psr:null,skipped:false}};
    rt.trails={ncc:[],mosse:[]};rt.history=[];rt.lost=freshLost();rt.timing={ncc:0,mosse:0};
    drawGray(ctx2d('trackModelNcc'),ncc.templateImage(),TEMPLATE_GRID);
    updateInspectors();updateReadouts();drawChart();redraw();
    if(!rt.scene)setInstruction('Tracking. Now try the experiments below: <b>turn your head</b>, <b>cover your face with a hand</b>, or <b>walk past someone</b>.');
  }

  function clearTrackers(){
    rt.trackers=null;rt.results={};rt.trails={ncc:[],mosse:[]};rt.history=[];rt.lost=freshLost();rt.timing={ncc:0,mosse:0};
    ['trackModelNcc','trackModelMosse','trackRespNcc','trackRespMosse'].forEach(id=>{const c=ctx2d(id);c.fillStyle='#e5e5e5';c.fillRect(0,0,c.canvas.width,c.canvas.height)});
    updateReadouts();drawChart();redraw();
  }

  const freshLost=()=>({ncc:{now:false,since:0,frames:0},mosse:{now:false,since:0,frames:0}});

  // ----- rendering -----
  function redraw(){
    if(!rt.sourceReady)return;
    KINDS.forEach(kind=>drawTrackerView(rt.views[kind].getContext('2d'),rt.frameCanvas,{
      kind,result:rt.results[kind],trail:rt.trails[kind],truth:rt.truth,drag:rt.drag?.box,scale:rt.scale,skipped:kind==='mosse'&&rt.results.mosse?.skipped
    }));
  }

  function updateInspectors(){
    if(!rt.trackers)return;
    drawGray(ctx2d('trackModelMosse'),cropCenter(rt.trackers.mosse.memoryImage(),GRID,TEMPLATE_GRID),TEMPLATE_GRID);
    const {ncc,mosse}=rt.results,size=GRID-TEMPLATE_GRID+1;
    if(ncc?.response)drawHeat(ctx2d('trackRespNcc'),ncc.response,ncc.size,heatColor);
    if(mosse?.response)drawHeat(ctx2d('trackRespMosse'),cropCenter(mosse.response,GRID,size),size,heatColor);
  }

  function mosseStateText(result,s){
    if(result.skipped)return`<span class="track-bad">Update skipped</span> — PSR ${result.psr.toFixed(1)} &lt; ${s.threshold}: the box is held and the filter is not trained on this frame.`;
    if(result.weak)return`<span class="track-warn">Weak peak, still learning</span> — the confidence check is off, so this frame is added to A, B with η = ${s.eta.toFixed(3)}.`;
    return`<span class="track-good">Confident</span> — moved to the peak and learned this frame with η = ${s.eta.toFixed(3)}.`;
  }

  function updateReadouts(){
    const s=rt.experiment.state;
    KINDS.forEach(kind=>{
      const K=ID[kind],result=rt.results[kind],psr=result?.psr,lost=rt.lost[kind];
      const weak=psr!=null&&psr<s.threshold,meter=$('#trackMeter'+K),badge=$('#trackBadge'+K);
      $('#trackPsr'+K).textContent=psr==null?'—':psr.toFixed(1);
      $('#trackPsr'+K).classList.toggle('track-bad',weak);
      meter.style.transform=`scaleX(${psr==null?0:Math.min(1,psr/PSR_AXIS_MAX)})`;
      meter.style.background=weak?TRACK_COLORS.skip:TRACK_COLORS[kind].ink;
      $('#trackMark'+K).style.left=`${Math.min(100,s.threshold/PSR_AXIS_MAX*100)}%`;
      let state='Draw a box to start.',badgeText=result?'initialised':'no box yet',bad=false;
      if(psr!=null){
        state=kind==='ncc'?`Best NCC score ${result.score.toFixed(2)} · the template is never updated, whatever the score.`:mosseStateText(result,s);
        badgeText=weak?'weak peak':'sharp peak';bad=weak;
        if(kind==='mosse'&&result.skipped)badgeText='update skipped · box held';
      }
      if(rt.truth&&result){bad=lost.now;badgeText=lost.now?'✗ lost the target':`✓ on target${kind==='mosse'&&result.skipped?' · update skipped':''}`}
      $('#trackState'+K).innerHTML=state;
      badge.textContent=badgeText;badge.classList.toggle('track-badge-bad',bad);
    });
  }

  function drawChart(){
    const chart=$('#trackChart');
    if(chart)drawTimeline(chart,rt.history,{threshold:rt.experiment.state.threshold,capacity:HISTORY});
  }

  function mount(experiment){
    destroy();
    rt={token:++generation,experiment,paused:false,results:{},trails:{ncc:[],mosse:[]},history:[],lost:freshLost(),timing:{ncc:0,mosse:0}};
    root.innerHTML=layout(experiment.state);
    rt.views={ncc:$('#trackViewNcc'),mosse:$('#trackViewMosse')};
    rt.frameCanvas=document.createElement('canvas');rt.proc=document.createElement('canvas');
    bindControls(experiment.state);
    rt.onResize=()=>drawChart();
    window.addEventListener('resize',rt.onResize);
    setSource();
  }

  function destroy(){
    if(!rt)return;
    stopSource();
    window.removeEventListener('resize',rt.onResize);
    rt=null;
  }

  return{mount,destroy};
}
