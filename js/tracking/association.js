// Data association for the Lecture 12 exercise: cost matrix, gating, greedy vs. optimal assignment.
// Cost of a pair = 1 − IoU(track box, detection box), as in SORT; a pair is gated when IoU < 0.2.
// Leaving a track unmatched ("missing") costs MISS_COST, which is worse than any admissible pair —
// the usual dummy-column trick that lets a minimum-cost (Hungarian) solver leave tracks unmatched.

import {boxIoU} from './shared.js';

export const GATE_COST=.8;
export const MISS_COST=1;
export const MISSING='missing';

const BOX={w:70,h:150};
const person=(cx,cy)=>({cx,cy,...BOX});

export const ROUNDS=[
  {
    id:'warmup',
    title:'Warm-up',
    defaultCue:'predicted',
    story:'A corridor at frame t + 1. Tracks <b>A</b> and <b>B</b> walk side by side, <b>C</b> is leaving behind the pillar on the right, and someone new walks in on the left. Same structure as the Data Association slide.',
    tracks:[
      {id:'A',color:'#e8590c',history:[person(201,200),person(234,200),person(267,200)]},
      {id:'B',color:'#0d9488',history:[person(248,200),person(278,200),person(308,200)]},
      {id:'C',color:'#7c3aed',history:[person(520,196),person(552,196),person(584,196)]}
    ],
    detections:[
      {id:'d1',...person(330,200),track:'B'},
      {id:'d2',...person(296,200),track:'A'},
      {id:'d3',...person(70,204),track:null}
    ],
    pillar:{x:600,w:40}
  },
  {
    id:'greedy',
    title:'Greedy trap',
    defaultCue:'predicted',
    story:'Two people walk right, close together. <b>B</b> slowed down and <b>A</b> is half hidden behind B, so A’s detection box came out shifted to the left. A “take the cheapest pair first” rule grabs the wrong pair here.',
    tracks:[
      {id:'A',color:'#e8590c',history:[person(200,200),person(230,200),person(260,200)]},
      {id:'B',color:'#0d9488',history:[person(235,200),person(264,200),person(293,200)]}
    ],
    detections:[
      {id:'d1',...person(300,200),track:'B'},
      {id:'d2',...person(265,200),track:'A'}
    ]
  },
  {
    id:'crossing',
    title:'Crossing',
    defaultCue:'last',
    story:'<b>A</b> (orange shirt) walks right and <b>B</b> (teal shirt) walks left; they pass each other between frame t and t + 1 — the “walk past a colleague” failure. Assign by what you see, then compare the two cost models.',
    showShirts:true,
    tracks:[
      {id:'A',color:'#e8590c',history:[person(200,200),person(250,200),person(300,200)]},
      {id:'B',color:'#0d9488',history:[person(450,204),person(400,204),person(350,204)]}
    ],
    detections:[
      {id:'d1',...person(298,203),track:'B'},
      {id:'d2',...person(352,201),track:'A'}
    ]
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

/** Greedy nearest neighbour: repeatedly take the cheapest admissible remaining pair. */
export function greedyAssignment(round,matrix){
  const pairs=[];
  matrix.forEach((row,i)=>row.forEach((cell,j)=>{if(!cell.gated)pairs.push({i,j,cost:cell.cost})}));
  pairs.sort((a,b)=>a.cost-b.cost);
  const usedTracks=new Set(),usedDetections=new Set();
  const assignment=Object.fromEntries(round.tracks.map(track=>[track.id,MISSING]));
  for(const pair of pairs){
    if(usedTracks.has(pair.i)||usedDetections.has(pair.j))continue;
    usedTracks.add(pair.i);usedDetections.add(pair.j);
    assignment[round.tracks[pair.i].id]=round.detections[pair.j].id;
  }
  return{assignment,total:assignmentCost(round,matrix,assignment)};
}

/** The identities that are actually correct (what a perfect tracker would output). */
export function trueAssignment(round){
  return Object.fromEntries(round.tracks.map(track=>[track.id,round.detections.find(d=>d.track===track.id)?.id??MISSING]));
}

export function sameAssignment(round,a,b){
  return round.tracks.every(track=>(a[track.id]??null)===(b[track.id]??null));
}
