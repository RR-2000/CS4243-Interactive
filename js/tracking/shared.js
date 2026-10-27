// Small helpers shared by the tracking demos.

/** Boxes are {cx, cy, w, h} in pixels (center + size). */
export function boxIoU(a,b){
  const ix=Math.max(0,Math.min(a.cx+a.w/2,b.cx+b.w/2)-Math.max(a.cx-a.w/2,b.cx-b.w/2));
  const iy=Math.max(0,Math.min(a.cy+a.h/2,b.cy+b.h/2)-Math.max(a.cy-a.h/2,b.cy-b.h/2));
  const intersection=ix*iy,union=a.w*a.h+b.w*b.h-intersection;
  return union>0?intersection/union:0;
}

/** Deterministic PRNG (mulberry32) so demos and tests replay identically. */
export function seededRandom(seed){
  let t=seed>>>0;
  return()=>{
    t=(t+0x6d2b79f5)>>>0;
    let r=Math.imul(t^(t>>>15),1|t);
    r=(r+Math.imul(r^(r>>>7),61|r))^r;
    return((r^(r>>>14))>>>0)/4294967296;
  };
}
