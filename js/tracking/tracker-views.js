// Canvas drawing for the MOSSE vs. NCC lab: video overlays, mini images, and the PSR timeline.

import {SEARCH_PADDING} from './trackers.js';

export const TRACK_COLORS={
  ncc:{video:'#f59e0b',ink:'#b45309'},
  mosse:{video:'#22d3ee',ink:'#0e7490'},
  skip:'#ef4444',
  truth:'rgba(255,255,255,.9)',
  drag:'#facc15'
};
export const PSR_AXIS_MAX=40;

function strokeBox(ctx,box,scale,{color,width=2,dash=[]}){
  ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);
  ctx.strokeRect((box.cx-box.w/2)*scale,(box.cy-box.h/2)*scale,box.w*scale,box.h*scale);
  ctx.restore();
}

function tag(ctx,text,x,y,color){
  ctx.save();ctx.font='bold 13px Arial';
  const w=ctx.measureText(text).width+10;
  ctx.fillStyle=color;ctx.fillRect(x,Math.max(0,y-19),w,18);
  ctx.fillStyle='#111';ctx.fillText(text,x+5,Math.max(13,y-6));
  ctx.restore();
}

/**
 * Draws one tracker's view: the frame, the ground-truth box (recorded clips only), the search window,
 * the recent trail and the current box. `scale` maps processing pixels to display pixels.
 */
export function drawTrackerView(ctx,frameCanvas,{kind,result,trail,truth,drag,scale,skipped}){
  ctx.drawImage(frameCanvas,0,0,ctx.canvas.width,ctx.canvas.height);
  if(truth)strokeBox(ctx,truth,scale,{color:TRACK_COLORS.truth,width:1.5,dash:[6,5]});
  if(result){
    const color=skipped?TRACK_COLORS.skip:TRACK_COLORS[kind].video,box=result.box;
    strokeBox(ctx,{...box,w:box.w*SEARCH_PADDING,h:box.h*SEARCH_PADDING},scale,{color,width:1.2,dash:[3,4]});
    if(trail.length>1){
      ctx.save();ctx.strokeStyle=color;ctx.globalAlpha=.75;ctx.lineWidth=2;ctx.beginPath();
      trail.forEach((p,i)=>i?ctx.lineTo(p.x*scale,p.y*scale):ctx.moveTo(p.x*scale,p.y*scale));
      ctx.stroke();ctx.restore();
    }
    strokeBox(ctx,box,scale,{color,width:3.5,dash:skipped?[9,6]:[]});
    tag(ctx,skipped?`${kind.toUpperCase()} · held`:kind.toUpperCase(),(box.cx-box.w/2)*scale,(box.cy-box.h/2)*scale,color);
  }
  if(drag)strokeBox(ctx,drag,1,{color:TRACK_COLORS.drag,width:2.5,dash:[8,5]});
}

export function drawPlaceholder(ctx,lines){
  const {width,height}=ctx.canvas;
  ctx.fillStyle='#16181d';ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#e5e7eb';ctx.textAlign='center';
  lines.forEach((line,i)=>{ctx.font=i?'15px Arial':'bold 19px Arial';ctx.fillText(line,width/2,height/2-10+i*26)});
  ctx.textAlign='start';
}

const scratch=document.createElement('canvas');

function paintScaled(ctx,size,fill){
  scratch.width=size;scratch.height=size;
  const sctx=scratch.getContext('2d'),image=sctx.createImageData(size,size);
  fill(image.data);
  sctx.putImageData(image,0,0);
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(scratch,0,0,ctx.canvas.width,ctx.canvas.height);
}

function range(values){
  let min=Infinity,max=-Infinity;
  for(const v of values){if(v<min)min=v;if(v>max)max=v}
  return{min,span:max-min||1};
}

/** Grayscale image of an n × n array, min–max normalised. */
export function drawGray(ctx,values,n){
  const {min,span}=range(values);
  paintScaled(ctx,n,data=>{for(let i=0;i<n*n;i++){const v=255*(values[i]-min)/span;data[i*4]=data[i*4+1]=data[i*4+2]=v;data[i*4+3]=255}});
}

/** Takes the central `size` × `size` block of an n × n array. */
export function cropCenter(values,n,size){
  const out=new Float32Array(size*size),start=(n>>1)-(size>>1); // keeps index n/2 (zero motion) at the crop centre
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)out[y*size+x]=values[(start+y)*n+start+x];
  return out;
}

/** Response heatmap with a ring on the peak and a crosshair on "no motion". */
export function drawHeat(ctx,values,n,heatColor){
  const {min,span}=range(values);
  let best=0;for(let i=1;i<values.length;i++)if(values[i]>values[best])best=i;
  paintScaled(ctx,n,data=>{
    for(let i=0;i<n*n;i++){const[r,g,b]=heatColor((values[i]-min)/span);data[i*4]=r;data[i*4+1]=g;data[i*4+2]=b;data[i*4+3]=255}
  });
  const cell=ctx.canvas.width/n,mid=ctx.canvas.width/2;
  ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=1;ctx.beginPath();
  ctx.moveTo(mid-6,mid);ctx.lineTo(mid+6,mid);ctx.moveTo(mid,mid-6);ctx.lineTo(mid,mid+6);ctx.stroke();
  ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();
  ctx.arc(((best%n)+.5)*cell,(Math.floor(best/n)+.5)*cell,Math.max(5,cell*1.6),0,Math.PI*2);ctx.stroke();
}

/** PSR of both trackers over the last `capacity` frames, with the threshold and skipped updates. */
export function drawTimeline(canvas,history,{threshold,capacity}){
  const dpr=window.devicePixelRatio||1,width=canvas.clientWidth||600,height=canvas.clientHeight||150;
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
  const left=30,right=8,top=8,bottom=18,plotW=width-left-right,plotH=height-top-bottom;
  const x=i=>left+plotW*(i+capacity-history.length)/(capacity-1),y=v=>top+plotH*(1-Math.min(v,PSR_AXIS_MAX)/PSR_AXIS_MAX);
  ctx.fillStyle='#fafafa';ctx.fillRect(left,top,plotW,plotH);
  ctx.font='10px monospace';ctx.fillStyle='#888';ctx.strokeStyle='#e5e5e5';ctx.lineWidth=1;
  for(let v=0;v<=PSR_AXIS_MAX;v+=10){ctx.beginPath();ctx.moveTo(left,y(v));ctx.lineTo(left+plotW,y(v));ctx.stroke();ctx.fillText(String(v),4,y(v)+3)}
  ctx.fillText('−8 s',left,height-4);ctx.textAlign='right';ctx.fillText('now',left+plotW,height-4);ctx.textAlign='start';
  ctx.fillStyle='rgba(239,68,68,.16)';
  history.forEach((h,i)=>{if(h.skipped)ctx.fillRect(x(i)-plotW/capacity/2,top,plotW/capacity+.5,plotH)});
  ctx.save();ctx.strokeStyle=TRACK_COLORS.skip;ctx.setLineDash([6,4]);ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(left,y(threshold));ctx.lineTo(left+plotW,y(threshold));ctx.stroke();ctx.restore();
  ctx.fillStyle=TRACK_COLORS.skip;ctx.fillText(`threshold ${threshold}`,left+4,y(threshold)-4);
  for(const kind of['ncc','mosse']){
    ctx.strokeStyle=TRACK_COLORS[kind].ink;ctx.lineWidth=2;ctx.beginPath();
    let started=false;
    history.forEach((h,i)=>{const v=h[kind];if(v==null){started=false;return}started?ctx.lineTo(x(i),y(v)):ctx.moveTo(x(i),y(v));started=true});
    ctx.stroke();
  }
}
