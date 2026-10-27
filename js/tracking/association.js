// Data association for the Lecture 12 exercise: cost matrix, gating and the minimum-cost assignment.
// Cost of a pair = 1 − IoU(track box, detection box), as in SORT; a pair is gated when IoU < 0.2.
// Leaving a track unmatched ("missing") costs MISS_COST, which is worse than any admissible pair —
// the usual dummy-column trick that lets a minimum-cost (Hungarian) solver leave tracks unmatched.

import {boxIoU} from './shared.js';
import {SCENES} from './association-data.js';

export const GATE_COST=.8;
export const MISS_COST=1;
export const MISSING='missing';

// Two real moments from the PETS 2009 footage on the lecture slides; see association-data.js.
export const ROUNDS=[
  {
    id:'warmup',
    title:'Who is who?',
    slide:'Data Association slide',
    defaultCue:'predicted',
    story:'Three people are being tracked (<b>A</b>, <b>B</b>, <b>C</b>). In the next frame the detector returns three boxes, but it does not know who is who. Note that <b>C</b> walks behind <b>B</b> — and one box belongs to someone who was not tracked before.',
    ...SCENES.warmup
  },
  {
    id:'crossing',
    title:'Two people cross',
    slide:'SORT slide',
    defaultCue:'last',
    story:'<b>A</b> (black coat) and <b>B</b> (red-and-blue jacket) walk past each other. First decide by what you see, then press <b>Check</b> and compare the two ways of measuring the cost.',
    ...SCENES.crossing
  }
];

/** Box the cost is measured from: the last box (no motion model) or a constant-velocity prediction. */
export function referenceBox(track,cue){
  const history=track.history,last=history[history.length-1];
  if(cue!=='predicted')return last;
  const previous=history[history.length-2];
  return{...last,cx:2*last.cx-previous.cx,cy:2*last.cy-previous.cy};
}

/** matrix[i][j] = {cost, gated} for track i and detection j. */
export function costMatrix(round,cue){
  return round.tracks.map(track=>{
    const box=referenceBox(track,cue);
    return round.detections.map(detection=>{
      // Rounded to the two decimals students see, so hand-added totals match the solver's.
      const cost=Math.round((1-boxIoU(box,detection))*100)/100;
      return{cost,gated:cost>GATE_COST};
    });
  });
}

/** Total cost of an assignment {trackId: detectionId | MISSING}. Returns null if it uses a gated pair. */
export function assignmentCost(round,matrix,assignment){
  let total=0;
  for(let i=0;i<round.tracks.length;i++){
    const target=assignment[round.tracks[i].id];
    if(!target||target===MISSING){total+=MISS_COST;continue}
    const j=round.detections.findIndex(d=>d.id===target),cell=matrix[i][j];
    if(!cell||cell.gated)return null;
    total+=cell.cost;
  }
  return total;
}

/** Minimum-cost one-to-one assignment (what the Hungarian algorithm returns), by exhaustive search. */
export function optimalAssignment(round,matrix){
  const tracks=round.tracks,detections=round.detections;
  let best={assignment:{},total:Infinity};
  const search=(i,used,assignment,total)=>{
    if(total>=best.total)return;
    if(i===tracks.length){best={assignment:{...assignment},total};return}
    search(i+1,used,{...assignment,[tracks[i].id]:MISSING},total+MISS_COST);
    detections.forEach((detection,j)=>{
      const cell=matrix[i][j];
      if(used.has(j)||cell.gated)return;
      search(i+1,new Set([...used,j]),{...assignment,[tracks[i].id]:detection.id},total+cell.cost);
    });
  };
  search(0,new Set(),{},0);
  return best;
}

/** The identities that are actually correct (what a perfect tracker would output). */
export function trueAssignment(round){
  return Object.fromEntries(round.tracks.map(track=>[track.id,round.detections.find(d=>d.track===track.id)?.id??MISSING]));
}

export function sameAssignment(round,a,b){
  return round.tracks.every(track=>(a[track.id]??null)===(b[track.id]??null));
}
