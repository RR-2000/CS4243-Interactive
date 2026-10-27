// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {fft2d} from '../js/tracking/fft.js';
import {MosseTracker,NccTracker,DEFAULT_PSR_THRESHOLD} from '../js/tracking/trackers.js';
import {boxIoU,seededRandom} from '../js/tracking/shared.js';
import {ROUNDS,MISSING,costMatrix,optimalAssignment,greedyAssignment,trueAssignment,assignmentCost,sameAssignment} from '../js/tracking/association.js';

const W=200,H=150;

// Smooth random background plus a distinctive blob pattern centred at (cx, cy).
function makeFrame(cx,cy,{occluded=false}={}){
  const random=seededRandom(11),data=new Float32Array(W*H),bumps=[];
  for(let k=0;k<40;k++)bumps.push([random()*W,random()*H,6+random()*14,random()*80]);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    let v=90;
    for(const[bx,by,r,a]of bumps)v+=a*Math.exp(-((x-bx)**2+(y-by)**2)/(2*r*r));
    const dx=x-cx,dy=y-cy;
    if(Math.abs(dx)<14&&Math.abs(dy)<14){
      v=occluded?170:(dx<0?40:220)+(dy<0?0:-30)+(Math.hypot(dx-4,dy+5)<5?60:0);
    }
    data[y*W+x]=v;
  }
  return{data,w:W,h:H};
}

test('FFT followed by inverse FFT reproduces the input', ()=>{
  const n=8,re=Float64Array.from({length:n*n},(_,i)=>Math.sin(i)*3+i%5),im=new Float64Array(n*n),original=Float64Array.from(re);
  fft2d(re,im,n,n,false);
  fft2d(re,im,n,n,true);
  re.forEach((v,i)=>assert.ok(Math.abs(v-original[i])<1e-9));
  im.forEach(v=>assert.ok(Math.abs(v)<1e-9));
});

test('FFT rejects sizes that are not powers of two', ()=>{
  assert.throws(()=>fft2d(new Float64Array(9),new Float64Array(9),3,3),/power of two/);
});

test('boxIoU returns 1 for identical boxes and 0 for disjoint boxes', ()=>{
  const a={cx:10,cy:10,w:10,h:10};
  assert.equal(boxIoU(a,a),1);
  assert.equal(boxIoU(a,{cx:40,cy:10,w:10,h:10}),0);
  assert.ok(Math.abs(boxIoU(a,{cx:15,cy:10,w:10,h:10})-1/3)<1e-12);
});

for(const [name,Tracker] of [['MOSSE',MosseTracker],['NCC',NccTracker]]){
  test(`${name} follows a target moving 3 px per frame`, ()=>{
    const tracker=new Tracker(),box={cx:80,cy:70,w:30,h:30};
    tracker.init(makeFrame(80,70),box);
    let result;
    for(let t=1;t<=12;t++)result=tracker.track(makeFrame(80+3*t,70+t));
    assert.ok(Math.abs(result.box.cx-116)<2.5,`cx=${result.box.cx}`);
    assert.ok(Math.abs(result.box.cy-82)<2.5,`cy=${result.box.cy}`);
  });
}

test('MOSSE produces a sharp peak (high PSR) on the target and a weak one when it is covered', ()=>{
  const tracker=new MosseTracker();
  tracker.init(makeFrame(80,70),{cx:80,cy:70,w:30,h:30});
  const visible=tracker.track(makeFrame(81,70));
  assert.ok(visible.psr>DEFAULT_PSR_THRESHOLD*2,`visible PSR=${visible.psr}`);
  const covered=tracker.track(makeFrame(81,70,{occluded:true}));
  assert.ok(covered.psr<visible.psr/2,`covered PSR=${covered.psr}`);
});

test('PSR gating skips the update and holds the box on a weak peak', ()=>{
  const tracker=new MosseTracker();
  tracker.init(makeFrame(80,70),{cx:80,cy:70,w:30,h:30});
  const before=JSON.stringify(Array.from(tracker.H.re.slice(0,16)));
  const result=tracker.track(makeFrame(80,70,{occluded:true}),{gate:true,threshold:1e9});
  assert.equal(result.skipped,true);
  assert.deepEqual(result.box,{cx:80,cy:70,w:30,h:30});
  assert.equal(JSON.stringify(Array.from(tracker.H.re.slice(0,16))),before);
});

test('without gating MOSSE keeps learning, so its filter changes every frame', ()=>{
  const tracker=new MosseTracker({eta:.5});
  tracker.init(makeFrame(80,70),{cx:80,cy:70,w:30,h:30});
  const before=tracker.filterImage();
  const result=tracker.track(makeFrame(80,70,{occluded:true}),{gate:false,threshold:1e9});
  assert.equal(result.skipped,false);
  assert.equal(result.weak,true);
  const after=tracker.filterImage();
  assert.ok(after.some((v,i)=>Math.abs(v-before[i])>1e-6));
});

test('NCC keeps its first template forever', ()=>{
  const tracker=new NccTracker();
  tracker.init(makeFrame(80,70),{cx:80,cy:70,w:30,h:30});
  const template=Float32Array.from(tracker.templateImage());
  for(let t=1;t<5;t++)tracker.track(makeFrame(80+t,70));
  assert.deepEqual(Array.from(tracker.templateImage()),Array.from(template));
});

// ----- data association -----
const round=id=>ROUNDS.find(r=>r.id===id);

test('warm-up round reproduces the slide: A→d2, B→d1, C missing, d3 left for a new track', ()=>{
  const r=round('warmup'),matrix=costMatrix(r,'predicted'),best=optimalAssignment(r,matrix);
  assert.deepEqual(best.assignment,{A:'d2',B:'d1',C:MISSING});
  assert.ok(matrix[2].every(cell=>cell.gated),'track C should be gated against every detection');
  assert.ok(Object.values(best.assignment).every(d=>d!=='d3'));
  assert.ok(Math.abs(matrix[0][1].cost-.1)<.03&&Math.abs(matrix[1][0].cost-.2)<.03);
});

test('greedy matching falls into the trap that the optimal assignment avoids', ()=>{
  const r=round('greedy'),matrix=costMatrix(r,'predicted');
  const greedy=greedyAssignment(r,matrix),best=optimalAssignment(r,matrix);
  assert.equal(greedy.assignment.B,MISSING);
  assert.ok(greedy.total>best.total);
  assert.ok(sameAssignment(r,best.assignment,trueAssignment(r)));
});

test('crossing: last-position costs swap identities, constant-velocity prediction keeps them', ()=>{
  const r=round('crossing');
  const withoutMotion=optimalAssignment(r,costMatrix(r,'last')).assignment;
  const withMotion=optimalAssignment(r,costMatrix(r,'predicted')).assignment;
  assert.deepEqual(withoutMotion,{A:'d1',B:'d2'});
  assert.ok(sameAssignment(r,withMotion,trueAssignment(r)));
});

test('assignmentCost rejects gated pairs and charges for missing tracks', ()=>{
  const r=round('warmup'),matrix=costMatrix(r,'predicted');
  assert.equal(assignmentCost(r,matrix,{A:'d3',B:'d1',C:MISSING}),null);
  const total=assignmentCost(r,matrix,{A:'d2',B:'d1',C:MISSING});
  assert.ok(Math.abs(total-(matrix[0][1].cost+matrix[1][0].cost+1))<1e-12);
});
