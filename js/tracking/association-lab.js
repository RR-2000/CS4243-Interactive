// Lecture 12 · Drag-and-drop data-association exercise on real PETS 2009 frames:
// frame t shows the tracked people, the next processed frame shows the detector's boxes.

import {ROUNDS,MISSING,MISS_COST,costMatrix,assignmentCost,optimalAssignment,trueAssignment,sameAssignment,referenceBox} from './association.js';
import {boxIoU} from './shared.js';

const DRAG_THRESHOLD=5;
const CUE_LABEL={last:'last-position',predicted:'predicted-position'};

const fmt=value=>value.toFixed(2);
const describe=(round,assignment)=>round.tracks.map(t=>`${t.id} → ${assignment[t.id]===MISSING?'missing':assignment[t.id]}`).join(', ');

export function createAssociationLab({root,$,segment,bindSegment,refreshGuide}){
  let rt=null;

  const state=()=>rt.experiment.state;
  const round=()=>ROUNDS[state().round];
  const matrix=()=>costMatrix(round(),state().cue);
  const trackColor=id=>round().tracks.find(t=>t.id===id)?.color??'#555';

  function layout(s){
    const r=ROUNDS[s.round],later=`${r.seconds.toFixed(1)} s later`;
    return `<div class="controls assoc-controls">
        <div class="control"><span class="control-label">Round</span>${segment('assocRound',ROUNDS.map((x,i)=>[String(i),`${i+1} · ${x.title}`]),String(s.round))}</div>
        <div class="control"><span class="control-label">Cost is measured from</span>${segment('assocCue',[['last','Last box · no motion model'],['predicted','Predicted box · constant velocity (SORT)']],s.cue)}</div>
      </div>
      <div class="instruction assoc-story" id="assocStory"></div>
      <ol class="assoc-steps">
        <li><b>Look at frame t.</b> The tracker already knows these people (coloured boxes); the dots show where each of them walked.</li>
        <li><b>Now look ${later}.</b> The detector found the white boxes, but it does not know who is who. Drag each tag onto the box that person is in now — or onto <i>Not detected</i>.</li>
        <li><b>Press Check</b> to see how a tracker decides: the cost matrix and the minimum-cost (Hungarian) matching.</li>
      </ol>
      <div class="assoc-frames">
        <figure class="card assoc-frame"><figcaption><span>① Frame t · people being tracked</span><small>PETS 2009 · frame ${r.frame}</small></figcaption>
          <div class="assoc-stage-wrap"><div class="assoc-stage"><img src="${r.images[0]}" alt="Frame t with the tracked people" width="${r.width}" height="${r.height}"><svg id="assocBefore" viewBox="0 0 ${r.width} ${r.height}" aria-hidden="true"></svg></div></div></figure>
        <figure class="card assoc-frame"><figcaption><span>② ${later} · detector boxes: who is who?</span><small>dashed = where the cost expects each track</small></figcaption>
          <div class="assoc-stage-wrap"><div class="assoc-stage"><img src="${r.images[1]}" alt="The next frame with the detector's boxes" width="${r.width}" height="${r.height}"><svg id="assocScene" viewBox="0 0 ${r.width} ${r.height}" role="group" aria-label="Detections ${later}"></svg></div></div></figure>
      </div>
      <div class="assoc-layout">
        <div class="card assoc-answer">
          <div class="assoc-answer-title">③ Your answer</div>
          <div class="assoc-dock">
            <div class="assoc-tray" data-drop="tray"><small>Drag these tags onto the white boxes</small><div id="assocTray" class="assoc-chips"></div></div>
            <div class="assoc-missing" data-drop="missing"><button type="button" class="assoc-missing-target" data-drop="missing">Not detected<small>the person has no box in this frame · cost ${fmt(MISS_COST)}</small></button><div id="assocMissing" class="assoc-chips"></div></div>
          </div>
          <div class="assoc-actions"><button class="button" type="button" id="assocCheck">Check my answer</button><button class="button ghost" type="button" id="assocSolve">Show Hungarian answer</button><button class="button ghost" type="button" id="assocReset">Reset</button><button class="button ghost" type="button" id="assocNext">Next round →</button></div>
          <div class="note assoc-feedback" id="assocFeedback" role="status" aria-live="polite"></div>
        </div>
        <figure class="card"><figcaption><span>How a tracker decides · cost = 1 − IoU · <b>lower is better</b></span><small>— gated (IoU &lt; 0.2)</small></figcaption><div class="assoc-matrix-help">Each cell is a <b>cost</b>, not a score: 0 means the boxes overlap perfectly, 1 means they do not overlap. The tracker picks the one-to-one matching with the smallest <b>total</b> cost.</div><div class="assoc-matrix" id="assocMatrix"></div><div class="assoc-explain" id="assocExplain">Hover a cell: frame ② highlights the two boxes it compares.</div><div class="assoc-total" id="assocTotal"></div></figure>
      </div>
      <div class="note flow-takeaway"><b>Classroom takeaway:</b> association is a <b>one-to-one matching</b> on a cost matrix. Gating removes impossible pairs, a track without a detection is kept as <i>missing</i>, a detection without a track starts a <i>new track</i>, and the Hungarian algorithm picks the matching with the lowest <b>total</b> cost. The answer is only as good as the cost: with a motion model (SORT) or appearance features (DeepSORT), people who cross keep their identities.</div>
      <div class="flow-source-note">Frames: PETS 2009 S2L1 (J. Ferryman and A. Shahrokni, PETS 2009 workshop), the sequence on the lecture slides, via MOTChallenge MOT15 (L. Leal-Taixé et al., 2015), licensed CC BY-NC-SA 3.0. Coloured tracks: MOT15 ground truth; white boxes: MOT15 public detections (score ≥ 20). The two frames are ${r.gap} video frames apart (7 fps).</div>`;
  }

  // ----- frames -----
  const rect=(box,attrs)=>`<rect x="${box.cx-box.w/2}" y="${box.cy-box.h/2}" width="${box.w}" height="${box.h}" ${attrs}/>`;
  const label=(text,x,y,fill,ink='#fff')=>`<g pointer-events="none"><rect x="${x}" y="${y-13}" width="${8+text.length*7}" height="15" rx="3" fill="${fill}"/><text x="${x+4}" y="${y-2}" font-size="11" font-weight="700" fill="${ink}">${text}</text></g>`;

  function renderBefore(){
    const r=round();
    $('#assocBefore').innerHTML=r.tracks.map(track=>{
      const h=track.history,last=h[h.length-1],feet=h.map(b=>`${b.cx},${b.cy+b.h/2}`);
      const dots=h.slice(0,-1).map((b,i)=>`<circle cx="${b.cx}" cy="${b.cy+b.h/2}" r="3" fill="${track.color}" opacity="${.45+.25*i}"/>`).join('');
      return `<polyline points="${feet.join(' ')}" fill="none" stroke="${track.color}" stroke-width="2"/>${dots}${rect(last,`fill="none" stroke="${track.color}" stroke-width="2.5"`)}${label(track.id,last.cx-last.w/2,last.cy-last.h/2,track.color)}`;
    }).join('');
  }

  function renderScene(){
    const s=state(),r=round(),m=matrix(),owners=Object.fromEntries(Object.entries(s.assignment).filter(([,d])=>d!==MISSING).map(([t,d])=>[d,t])),focus=rt.focus;
    const refs=r.tracks.map((track,i)=>{
      const ref=referenceBox(track,s.cue),on=!focus||focus.i===i;
      return `<g pointer-events="none" opacity="${on?1:.25}">${rect(ref,`fill="none" stroke="${track.color}" stroke-width="${focus?.i===i?2.5:1.5}" stroke-dasharray="5 3"`)}</g>`;
    }).join('');
    const detections=r.detections.map((d,j)=>{
      const owner=owners[d.id],i=r.tracks.findIndex(t=>t.id===owner),gated=owner?m[i][j].gated:false,on=!focus||focus.j===j;
      const tag=owner?`<g class="assoc-tag" data-track="${owner}" tabindex="0" role="button" aria-label="Track ${owner}, assigned to ${d.id}"><circle cx="${d.cx+d.w/2-2}" cy="${d.cy-d.h/2+2}" r="10" fill="${trackColor(owner)}" stroke="${gated?'#ef4444':'#fff'}" stroke-width="2" ${gated?'stroke-dasharray="3 2"':''}/><text x="${d.cx+d.w/2-2}" y="${d.cy-d.h/2+6}" text-anchor="middle" fill="#fff" font-size="11" font-weight="700">${owner}</text></g>`:'';
      return `<g class="assoc-detection${owner?' assigned':''}" data-drop="${d.id}" tabindex="0" role="button" aria-label="Detection ${d.id}${owner?`, currently ${owner}`:''}" opacity="${on?1:.35}">
        ${rect(d,`class="assoc-hit" fill="${owner?trackColor(owner):'#ffffff'}" fill-opacity="${owner?.28:.06}" stroke="#ffffff" stroke-width="${focus?.j===j?3:2}"`)}
        ${label(d.id,d.cx-d.w/2,d.cy-d.h/2,'#ffffff','#111')}${tag}
      </g>`;
    }).join('');
    $('#assocScene').innerHTML=refs+detections;
  }

  function chip(track){
    const selected=rt.selected===track.id;
    return `<button type="button" class="assoc-chip${selected?' selected':''}" data-track="${track.id}" style="--chip:${track.color}" aria-pressed="${selected}">${track.id}</button>`;
  }

  function renderDock(){
    const s=state(),r=round();
    $('#assocTray').innerHTML=r.tracks.filter(t=>!s.assignment[t.id]).map(chip).join('')||'<span class="assoc-empty">all tracks placed</span>';
    $('#assocMissing').innerHTML=r.tracks.filter(t=>s.assignment[t.id]===MISSING).map(chip).join('');
  }

  function renderMatrix(){
    const s=state(),r=round(),m=matrix(),best=s.revealed||s.checked?optimalAssignment(r,m).assignment:null;
    const cell=(track,target,content,gated)=>{
      const chosen=s.assignment[track.id]===target,optimal=best?.[track.id]===target;
      const pair=target===MISSING?'':` data-pair="${r.tracks.indexOf(track)},${r.detections.findIndex(d=>d.id===target)}"`;
      return `<td class="${gated?'gated':''}${chosen?' chosen':''}${optimal?' optimal':''}" style="--chip:${track.color}"${pair}>${content}</td>`;
    };
    const header=`<tr><th>Track \\ detection</th>${r.detections.map(d=>`<th>${d.id}</th>`).join('')}<th>missing</th></tr>`;
    const rows=r.tracks.map((track,i)=>`<tr><th><span class="assoc-dot" style="--chip:${track.color}"></span>${track.id}</th>${r.detections.map((d,j)=>cell(track,d.id,m[i][j].gated?'—':`${fmt(m[i][j].cost)}<small>IoU ${fmt(1-m[i][j].cost)}</small>`,m[i][j].gated)).join('')}${cell(track,MISSING,fmt(MISS_COST),false)}</tr>`).join('');
    $('#assocMatrix').innerHTML=`<table><thead>${header}</thead><tbody>${rows}</tbody></table>${best?'<small class="assoc-matrix-note">Outlined cells = minimum-cost (Hungarian) assignment.</small>':''}`;
    const placed=r.tracks.filter(t=>s.assignment[t.id]);
    if(!placed.length){$('#assocTotal').textContent='Your total cost: —';return}
    const parts=placed.map(track=>{
      const target=s.assignment[track.id],i=r.tracks.indexOf(track),j=r.detections.findIndex(d=>d.id===target);
      return target===MISSING?`${fmt(MISS_COST)} (${track.id} missing)`:m[i][j].gated?`— (${track.id}→${target} gated)`:`${fmt(m[i][j].cost)} (${track.id}→${target})`;
    });
    const total=placed.length===r.tracks.length?assignmentCost(r,m,s.assignment):undefined;
    $('#assocTotal').innerHTML=`Your total cost: ${parts.join(' + ')}${total===null?' = <b class="track-bad">uses a gated pair — a tracker would never choose this</b>':total===undefined?' …':` = <b>${fmt(total)}</b>`}`;
  }

  // Re-rendering replaces the chips and boxes, so put keyboard focus back on the same item.
  function render(){
    const r=round(),focused=document.activeElement,key=root.contains(focused)?focused.dataset?.track?`[data-track="${focused.dataset.track}"]`:focused.dataset?.drop?`[data-drop="${focused.dataset.drop}"]`:null:null;
    $('#assocStory').innerHTML=`<b>Round ${state().round+1} · ${r.title}${/[?.!]$/.test(r.title)?'':'.'}</b> ${r.story}`;
    renderBefore();renderScene();renderDock();renderMatrix();
    if(key&&!root.contains(focused))root.querySelector(key)?.focus();
  }

  // ----- assignment changes -----
  function assign(trackId,drop){
    const s=state(),next=Object.fromEntries(Object.entries(s.assignment).filter(([t,d])=>t!==trackId&&(drop===MISSING||d!==drop)));
    if(drop!=='tray')next[trackId]=drop;
    s.assignment=next;s.checked=false;s.revealed=false;rt.selected=null;
    setFeedback('');render();refreshGuide();
  }

  function setFeedback(html,tone=''){
    const box=$('#assocFeedback');box.innerHTML=html||'Drag each tag onto a white box in frame ② — or onto “Not detected”. On a phone: tap a tag, then tap a box.';
    box.className=`note assoc-feedback ${tone}`;
  }

  function verdictLines(r,m,assignment){
    const truth=trueAssignment(r);
    const lines=r.tracks.map((track,i)=>{
      const chosen=assignment[track.id],right=truth[track.id],j=r.detections.findIndex(d=>d.id===chosen);
      if(chosen===right)return`✓ <b>${track.id}</b> → ${right===MISSING?'not detected: the person is hidden, so the detector returned no box for them. The track is kept as “missing” and waits for them to reappear':right}`;
      const why=chosen!==MISSING&&m[i][j]?.gated?' — that pair is gated: the boxes barely overlap':chosen!==MISSING&&right===MISSING?` — ${chosen} belongs to someone else, and one box can only continue one track`:'';
      return`✗ <b>${track.id}</b> → ${chosen===MISSING?'missing':chosen}${why}. Correct: ${right===MISSING?'missing':right}.`;
    });
    const used=new Set(Object.values(assignment));
    r.detections.filter(d=>!used.has(d.id)).forEach(d=>lines.push(d.track?`✗ <b>${d.id}</b> was left unmatched, but it is ${d.track}.`:`✓ <b>${d.id}</b> matches nobody we were tracking — a person who just walked in. It starts a new track.`));
    return lines;
  }

  function solverComparison(r,m,cue){
    const best=optimalAssignment(r,m),truth=trueAssignment(r),parts=[];
    if(sameAssignment(r,best.assignment,truth))parts.push(`The minimum-cost (Hungarian) assignment agrees: ${describe(r,best.assignment)}, total ${fmt(best.total)}.`);
    else parts.push(`With ${CUE_LABEL[cue]} costs the minimum-cost assignment is <b>${describe(r,best.assignment)}</b> (total ${fmt(best.total)}) — an <b>ID switch</b>. ${cue==='last'?'Without a motion model the correct pairs are even gated (—): the tracker cannot consider them. Switch “Cost is measured from” to <b>Predicted box</b> and look at the matrix again.':''}`);
    if(r.id==='warmup'){
      // B and the hidden C compete for the same box: compare the two complete matchings.
      const truth=trueAssignment(r),contested=truth.B,alternative={...truth,B:MISSING,C:contested};
      const totalTruth=assignmentCost(r,m,truth),totalAlternative=assignmentCost(r,m,alternative);
      if(totalTruth!=null&&totalAlternative!=null)parts.push(`Look at the ${contested} column: B and C both overlap ${contested}, but one box can continue only one track, so the other one becomes “missing” (cost ${fmt(MISS_COST)}). Compare the two complete matchings: B → ${contested} with C missing costs <b>${fmt(totalTruth)}</b>; C → ${contested} with B missing costs <b>${fmt(totalAlternative)}</b>. The smaller total wins — B overlaps ${contested} more (lower cost), and C is hidden behind B.`);
    }
    if(r.id==='crossing'&&cue==='predicted')parts.push('The prediction carries each person one step further along their path, past the other, so the cheap cells are the right ones. DeepSORT would also compare appearance — here the jacket colours.');
    return parts.join(' ');
  }

  function check(){
    const s=state(),r=round(),m=matrix(),missing=r.tracks.filter(t=>!s.assignment[t.id]).map(t=>t.id);
    if(missing.length){setFeedback(`Place every track first: <b>${missing.join(', ')}</b> ${missing.length>1?'are':'is'} still in the tray. Drop it on a white box, or on “Not detected” if that person has no box.`,'warn');return}
    const correct=sameAssignment(r,s.assignment,trueAssignment(r));
    s.checked=true;render();
    setFeedback(`<b>${correct?'Correct identities ✓':'Not quite ✗'}</b><ul>${verdictLines(r,m,s.assignment).map(l=>`<li>${l}</li>`).join('')}</ul><p>${solverComparison(r,m,s.cue)}</p>`,correct?'good':'bad');
  }

  function reveal(){
    const s=state(),r=round(),m=matrix(),best=optimalAssignment(r,m);
    s.assignment={...best.assignment};s.revealed=true;s.checked=false;rt.selected=null;render();
    const correct=sameAssignment(r,best.assignment,trueAssignment(r));
    setFeedback(`<b>Hungarian answer (${CUE_LABEL[s.cue]} costs):</b> ${describe(r,best.assignment)}, total ${fmt(best.total)}. ${correct?'These are the true identities.':'<b class="track-bad">These are not the true identities — the cost matrix itself is misleading.</b>'}<p>${solverComparison(r,m,s.cue)}</p>`,correct?'good':'bad');
  }

  function setRound(index){
    const s=state();
    s.round=index;s.cue=ROUNDS[index].defaultCue;s.assignment={};s.checked=false;s.revealed=false;rt.selected=null;rt.focus=null;
    build();refreshGuide();
  }

  // ----- pointer drag & drop (mouse and touch), tap-to-select, keyboard -----
  // Detection boxes of people walking side by side overlap; pick the box whose centre is closest.
  function detectionAt(x,y){
    const svg=$('#assocScene'),matrix=svg?.getScreenCTM();
    if(!matrix)return null;
    const p=new DOMPoint(x,y).matrixTransform(matrix.inverse());
    const hits=round().detections.filter(d=>Math.abs(p.x-d.cx)<=d.w/2&&Math.abs(p.y-d.cy)<=d.h/2);
    if(!hits.length)return null;
    const best=hits.reduce((a,b)=>Math.hypot(p.x-a.cx,p.y-a.cy)<=Math.hypot(p.x-b.cx,p.y-b.cy)?a:b);
    return root.querySelector(`g[data-drop="${best.id}"]`);
  }
  function resolveDrop(element,x,y){
    if(!element?.classList.contains('assoc-detection')||(!x&&!y))return element;
    return detectionAt(x,y)??element;
  }
  function dropTargetAt(x,y){return resolveDrop(document.elementFromPoint(x,y)?.closest('[data-drop]'),x,y)}
  function clearHover(){root.querySelectorAll('.assoc-hover').forEach(el=>el.classList.remove('assoc-hover'))}

  function bindInteraction(signal){
    const endDrag=()=>{rt.drag?.ghost?.remove();rt.drag=null;clearHover()};
    root.addEventListener('pointerdown',event=>{
      const handle=event.target.closest('[data-track]');
      if(!handle||event.button!==0||!event.isPrimary)return;
      event.preventDefault();
      endDrag();
      rt.drag={track:handle.dataset.track,x:event.clientX,y:event.clientY,pointerId:event.pointerId,ghost:null};
    },{signal});
    window.addEventListener('pointercancel',event=>{if(rt?.drag?.pointerId===event.pointerId)endDrag()},{signal});
    window.addEventListener('pointermove',event=>{
      const drag=rt?.drag;if(!drag||drag.pointerId!==event.pointerId)return;
      if(!drag.ghost){
        if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<DRAG_THRESHOLD)return;
        drag.ghost=document.createElement('div');drag.ghost.className='assoc-ghost';drag.ghost.textContent=drag.track;
        drag.ghost.style.setProperty('--chip',trackColor(drag.track));document.body.append(drag.ghost);
      }
      drag.ghost.style.transform=`translate(${event.clientX-18}px,${event.clientY-18}px)`;
      clearHover();dropTargetAt(event.clientX,event.clientY)?.classList.add('assoc-hover');
    },{signal});
    window.addEventListener('pointerup',event=>{
      const drag=rt?.drag;if(!drag||drag.pointerId!==event.pointerId)return;
      rt.drag=null;clearHover();
      if(!drag.ghost)return; // a tap: the click handler toggles selection
      drag.ghost.remove();
      // Ignore the click that may follow this drag, but never the next real tap (a re-render or a
      // touch drag means no click arrives at all).
      rt.suppressClick=true;setTimeout(()=>{if(rt)rt.suppressClick=false},0);
      const target=dropTargetAt(event.clientX,event.clientY);
      if(target&&root.contains(target))assign(drag.track,target.dataset.drop);
    },{signal});
    root.addEventListener('click',event=>{
      if(rt.suppressClick){rt.suppressClick=false;return}
      const handle=event.target.closest('[data-track]');
      if(handle){rt.selected=rt.selected===handle.dataset.track?null:handle.dataset.track;render();if(rt.selected)setFeedback(`Track <b>${rt.selected}</b> selected — now tap a detection box or “No detection”.`);return}
      const target=resolveDrop(event.target.closest('[data-drop]'),event.clientX,event.clientY);
      if(target&&rt.selected)assign(rt.selected,target.dataset.drop);
    },{signal});
    // Hovering (or tapping) a cost cell highlights the two boxes it compares and spells out the IoU.
    const focusPair=cell=>{
      const next=cell?.dataset.pair?cell.dataset.pair.split(',').map(Number):null;
      if(String(next)===String(rt.focus?[rt.focus.i,rt.focus.j]:null))return;
      rt.focus=next?{i:next[0],j:next[1]}:null;
      renderScene();
      const explain=$('#assocExplain');if(!explain)return;
      if(!rt.focus){explain.textContent='Hover a cell: frame ② highlights the two boxes it compares.';return}
      const r=round(),track=r.tracks[rt.focus.i],d=r.detections[rt.focus.j],iou=boxIoU(referenceBox(track,state().cue),d),cost=Math.round((1-iou)*100)/100;
      explain.innerHTML=`<b style="color:${track.color}">${track.id}</b> ${state().cue==='predicted'?'predicted':'last'} box (dashed) vs <b>${d.id}</b>: overlap ÷ union = IoU ${iou.toFixed(2)} → cost 1 − ${iou.toFixed(2)} = <b>${fmt(cost)}</b>${cost>.8?' — above 0.8, so the pair is gated (—)':''}.`;
    };
    root.addEventListener('mouseover',event=>focusPair(event.target.closest('#assocMatrix td[data-pair]')),{signal});
    root.addEventListener('mouseleave',()=>focusPair(null),{signal});
    root.addEventListener('pointerdown',event=>{const cell=event.target.closest('td[data-pair]');if(cell&&event.pointerType!=='mouse')focusPair(cell)},{signal});
    root.addEventListener('keydown',event=>{
      if(event.key!=='Enter'&&event.key!==' ')return;
      const element=event.target.closest('g[data-track], g[data-drop]');
      if(!element)return;
      event.preventDefault();element.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    },{signal});
  }

  // (Re)builds the exercise inside its own container so the parameter guide and code sample that
  // the app appends below it survive a round change.
  function build(){
    $('#assocLab').innerHTML=layout(state());
    bindSegment('assocRound',value=>setRound(+value));
    bindSegment('assocCue',value=>{const s=state();s.cue=value;s.checked=false;s.revealed=false;render();setFeedback(`Cost now measured from the <b>${value==='predicted'?'predicted box (constant velocity)':'last box (no motion model)'}</b>. Watch how the matrix changes.`);refreshGuide()});
    $('#assocCheck').addEventListener('click',check);
    $('#assocSolve').addEventListener('click',reveal);
    $('#assocReset').addEventListener('click',()=>{const s=state();s.assignment={};s.checked=false;s.revealed=false;rt.selected=null;render();setFeedback('')});
    $('#assocNext').addEventListener('click',()=>setRound((state().round+1)%ROUNDS.length));
    render();
  }

  function mount(experiment){
    destroy();
    if(!experiment.state.cue)experiment.state.cue=ROUNDS[experiment.state.round].defaultCue;
    rt={experiment,selected:null,drag:null,focus:null,abort:new AbortController()};
    root.innerHTML='<div id="assocLab"></div>';
    bindInteraction(rt.abort.signal);
    build();
  }

  function destroy(){
    if(!rt)return;
    rt.abort.abort();rt.drag?.ghost?.remove();
    rt=null;
  }

  return{mount,destroy};
}
