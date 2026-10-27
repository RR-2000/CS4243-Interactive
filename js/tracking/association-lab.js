// Lecture 12 · Drag-and-drop data-association exercise (tracks → detections in frame t + 1).

import {ROUNDS,MISSING,MISS_COST,costMatrix,assignmentCost,optimalAssignment,greedyAssignment,trueAssignment,sameAssignment,referenceBox} from './association.js';

const DRAG_THRESHOLD=5;
const NEUTRAL_SHIRT='#8b95a5';
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
    return `<div class="controls assoc-controls">
        <div class="control"><span class="control-label">Round</span>${segment('assocRound',ROUNDS.map((r,i)=>[String(i),`${i+1} · ${r.title}`]),String(s.round))}</div>
        <div class="control"><span class="control-label">Cost is measured from</span>${segment('assocCue',[['last','Last box · no motion model'],['predicted','Predicted box · constant velocity (SORT)']],s.cue)}</div>
      </div>
      <div class="instruction" id="assocStory"></div>
      <div class="assoc-layout">
        <figure class="card assoc-scene-card">
          <figcaption><span>Frame t + 1 · drag each track onto its detection</span><small>● past positions · dashed = box used for the cost</small></figcaption>
          <div class="assoc-scene"><svg id="assocScene" viewBox="0 0 640 360" role="group" aria-label="Detections in frame t + 1"></svg></div>
          <div class="assoc-dock">
            <div class="assoc-tray" data-drop="tray"><small>Tracks from frame t</small><div id="assocTray" class="assoc-chips"></div></div>
            <div class="assoc-missing" data-drop="missing"><button type="button" class="assoc-missing-target" data-drop="missing">No detection<small>track is missing · cost ${fmt(MISS_COST)}</small></button><div id="assocMissing" class="assoc-chips"></div></div>
          </div>
        </figure>
        <div class="assoc-side">
          <figure class="card"><figcaption><span>Cost matrix C = 1 − IoU</span><small>— gated (IoU &lt; 0.2)</small></figcaption><div class="assoc-matrix" id="assocMatrix"></div><div class="assoc-total" id="assocTotal"></div></figure>
          <div class="assoc-actions"><button class="button" type="button" id="assocCheck">Check my assignment</button><button class="button ghost" type="button" id="assocSolve">Show Hungarian answer</button><button class="button ghost" type="button" id="assocReset">Reset</button><button class="button ghost" type="button" id="assocNext">Next round →</button></div>
          <div class="note assoc-feedback" id="assocFeedback" role="status" aria-live="polite">Drag a coloured track tag onto a detection box. Tap-to-select works too: tap a tag, then tap a box.</div>
        </div>
      </div>
      <div class="note flow-takeaway"><b>Classroom takeaway:</b> association is a <b>one-to-one matching</b> on a cost matrix. Gating removes impossible pairs, unmatched tracks become <i>missing</i>, unmatched detections start <i>new tracks</i>. Greedy matching can paint itself into a corner; the Hungarian algorithm minimises the <b>total</b> cost. And the answer is only as good as the cost: with a motion model (SORT) or appearance features (DeepSORT), people who cross keep their identities.</div>`;
  }

  // ----- scene -----
  function boxRect(box,attrs){return `<rect x="${box.cx-box.w/2}" y="${box.cy-box.h/2}" width="${box.w}" height="${box.h}" ${attrs}/>`}

  function trackSvg(track,cue,index){
    const ref=referenceBox(track,cue),last=track.history[track.history.length-1];
    const dots=track.history.map((p,i)=>`<circle cx="${p.cx}" cy="${p.cy}" r="5" fill="${track.color}" opacity="${.35+.3*i}"/>`).join('');
    const path=`<polyline points="${track.history.map(p=>`${p.cx},${p.cy}`).join(' ')}" fill="none" stroke="${track.color}" stroke-width="2" opacity=".6"/>`;
    const arrow=cue==='predicted'?`<line x1="${last.cx}" y1="${last.cy}" x2="${ref.cx}" y2="${ref.cy}" stroke="${track.color}" stroke-width="2.5" marker-end="url(#assocArrow${track.id})"/>`:'';
    return `<g class="assoc-track" pointer-events="none"><defs><marker id="assocArrow${track.id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0L10,5L0,10z" fill="${track.color}"/></marker></defs>${path}${dots}${arrow}${boxRect(ref,`fill="none" stroke="${track.color}" stroke-width="3" stroke-dasharray="8 5"`)}<text x="${ref.cx-ref.w/2+3}" y="${ref.cy+ref.h/2+15+index*15}" fill="${track.color}" font-size="13" font-weight="700">${track.id}${cue==='predicted'?' predicted':' at t'}</text></g>`;
  }

  function detectionSvg(detection,r,owner,gated){
    const top=detection.cy-detection.h/2,shirt=r.showShirts&&detection.track?trackColor(detection.track):NEUTRAL_SHIRT;
    const ownerTag=owner?`<g class="assoc-tag" data-track="${owner}" tabindex="0" role="button" aria-label="Track ${owner}, assigned to ${detection.id}"><circle cx="${detection.cx+detection.w/2-4}" cy="${top+4}" r="15" fill="${trackColor(owner)}" stroke="${gated?'#ef4444':'#fff'}" stroke-width="2.5" ${gated?'stroke-dasharray="4 3"':''}/><text x="${detection.cx+detection.w/2-4}" y="${top+9}" text-anchor="middle" fill="#fff" font-size="15" font-weight="700">${owner}</text></g>`:'';
    return `<g class="assoc-detection${owner?' assigned':''}" data-drop="${detection.id}" tabindex="0" role="button" aria-label="Detection ${detection.id}${owner?`, currently ${owner}`:''}">
      ${boxRect(detection,`class="assoc-hit" fill="${owner?trackColor(owner):'#ffffff'}" fill-opacity="${owner?.22:.04}" stroke="#e2e8f0" stroke-width="2"`)}
      <circle cx="${detection.cx}" cy="${top+24}" r="15" fill="#d8b08c"/>
      <rect x="${detection.cx-23}" y="${top+44}" width="46" height="${detection.h-54}" rx="12" fill="${shirt}"/>
      <rect x="${detection.cx-detection.w/2}" y="${top-20}" width="30" height="18" fill="#e2e8f0"/><text x="${detection.cx-detection.w/2+15}" y="${top-6}" text-anchor="middle" font-size="13" font-weight="700" fill="#111">${detection.id}</text>
      ${ownerTag}
    </g>`;
  }

  // Zoom the 640 × 360 frame onto the boxes of this round, keeping the 16 : 9 aspect ratio.
  function fitView(r){
    const boxes=[...r.detections,...r.tracks.flatMap(t=>[...t.history,referenceBox(t,'predicted')])];
    let x0=Math.min(...boxes.map(b=>b.cx-b.w/2))-30,x1=Math.max(...boxes.map(b=>b.cx+b.w/2))+30;
    let y0=Math.min(...boxes.map(b=>b.cy-b.h/2))-40,y1=Math.max(...boxes.map(b=>b.cy+b.h/2))+50;
    const w=Math.max(x1-x0,(y1-y0)*16/9),h=w*9/16,cx=(x0+x1)/2,cy=(y0+y1)/2;
    const x=Math.min(Math.max(cx-w/2,0),Math.max(0,640-w)),y=Math.min(Math.max(cy-h/2,0),Math.max(0,360-h));
    return{x,y,w:Math.min(w,640),h:Math.min(h,360)};
  }

  function renderScene(){
    const s=state(),r=round(),m=matrix(),owners=Object.fromEntries(Object.entries(s.assignment).filter(([,d])=>d!==MISSING).map(([t,d])=>[d,t]));
    const pillar=r.pillar?`<rect x="${r.pillar.x}" y="40" width="${r.pillar.w}" height="320" fill="#3b4250"/><text x="${r.pillar.x+r.pillar.w/2}" y="60" fill="#9aa3b2" font-size="11" text-anchor="middle">pillar</text>`:'';
    const detections=r.detections.map((d,j)=>{
      const owner=owners[d.id],i=r.tracks.findIndex(t=>t.id===owner);
      return detectionSvg(d,r,owner,owner?m[i][j].gated:false);
    }).join('');
    const view=fitView(r);
    $('#assocScene').setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.h}`);
    $('#assocScene').innerHTML=`<rect width="640" height="360" fill="#1d2129"/><polygon points="0,280 640,280 640,360 0,360" fill="#2a303b"/><line x1="0" y1="280" x2="640" y2="280" stroke="#3b4250"/><text x="${view.x+10}" y="${view.y+18}" fill="#9aa3b2" font-size="12">frame t + 1 · detector boxes + track history</text>${detections}${r.tracks.map((t,i)=>trackSvg(t,s.cue,i)).join('')}${pillar}`;
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
      return `<td class="${gated?'gated':''}${chosen?' chosen':''}${optimal?' optimal':''}" style="--chip:${track.color}">${content}</td>`;
    };
    const header=`<tr><th>Track \\ detection</th>${r.detections.map(d=>`<th>${d.id}</th>`).join('')}<th>missing</th></tr>`;
    const rows=r.tracks.map((track,i)=>`<tr><th><span class="assoc-dot" style="--chip:${track.color}"></span>${track.id}</th>${r.detections.map((d,j)=>cell(track,d.id,m[i][j].gated?'—':fmt(m[i][j].cost),m[i][j].gated)).join('')}${cell(track,MISSING,fmt(MISS_COST),false)}</tr>`).join('');
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
    $('#assocStory').innerHTML=`<b>Round ${state().round+1} · ${r.title}.</b> ${r.story}`;
    renderScene();renderDock();renderMatrix();
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
    const box=$('#assocFeedback');box.innerHTML=html||'Drag a coloured track tag onto a detection box — or onto “No detection”. Then press <b>Check</b>.';
    box.className=`note assoc-feedback ${tone}`;
  }

  function verdictLines(r,m,assignment){
    const truth=trueAssignment(r);
    const lines=r.tracks.map((track,i)=>{
      const chosen=assignment[track.id],right=truth[track.id],j=r.detections.findIndex(d=>d.id===chosen);
      if(chosen===right)return`✓ <b>${track.id}</b> → ${right===MISSING?'missing: no detection is close to its prediction (occluded or left the frame), so the track is kept but not updated':right}`;
      const why=chosen!==MISSING&&m[i][j]?.gated?' — that pair is gated, the boxes barely overlap':'';
      return`✗ <b>${track.id}</b> → ${chosen===MISSING?'missing':chosen}${why}. Correct: ${right===MISSING?'missing':right}.`;
    });
    const used=new Set(Object.values(assignment));
    r.detections.filter(d=>!used.has(d.id)).forEach(d=>lines.push(d.track?`✗ <b>${d.id}</b> was left unmatched, but it is ${d.track}.`:`✓ <b>${d.id}</b> is unmatched → it starts a new (tentative) track.`));
    return lines;
  }

  function solverComparison(r,m,cue){
    const best=optimalAssignment(r,m),truth=trueAssignment(r),parts=[];
    if(sameAssignment(r,best.assignment,truth))parts.push(`The minimum-cost (Hungarian) assignment agrees: ${describe(r,best.assignment)}, total ${fmt(best.total)}.`);
    else parts.push(`With ${CUE_LABEL[cue]} costs the minimum-cost assignment is <b>${describe(r,best.assignment)}</b> (total ${fmt(best.total)}) — an <b>ID switch</b>. ${cue==='last'?'Without a motion model the correct pairs are even gated (—): the tracker cannot consider them. Switch “Cost is measured from” to <b>Predicted box</b> and look at the matrix again.':''}`);
    if(r.id==='greedy'){
      const greedy=greedyAssignment(r,m);
      if(!sameAssignment(r,greedy.assignment,best.assignment))parts.push(`Greedy matching takes the cheapest cell first (${describe(r,greedy.assignment)}) and is then stuck: total ${fmt(greedy.total)} &gt; ${fmt(best.total)}.`);
    }
    if(r.id==='crossing'&&cue==='predicted')parts.push('A constant-velocity prediction carries each person past the other, so the cheap cells are the right ones. DeepSORT adds appearance (shirt colour) as a second cue.');
    return parts.join(' ');
  }

  function check(){
    const s=state(),r=round(),m=matrix(),missing=r.tracks.filter(t=>!s.assignment[t.id]).map(t=>t.id);
    if(missing.length){setFeedback(`Place every track first: <b>${missing.join(', ')}</b> ${missing.length>1?'are':'is'} still in the tray. Drop it on a detection, or on “No detection” if none fits.`,'warn');return}
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
    s.round=index;s.cue=ROUNDS[index].defaultCue;s.assignment={};s.checked=false;s.revealed=false;rt.selected=null;
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
    rt={experiment,selected:null,drag:null,abort:new AbortController()};
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
