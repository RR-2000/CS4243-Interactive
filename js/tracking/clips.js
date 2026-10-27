// Frame-exact playback of the recorded clips: the player seeks to every frame in turn, so each run
// (on any device) feeds the trackers exactly the same frames and the ground truth lines up.

import {CLIPS,CLIP_FPS} from './clip-data.js';

export {CLIPS,CLIP_FPS};

/** Ground-truth box of `frame` as {cx, cy, w, h} in video pixels. */
export function clipBox(clip,frame){
  const [x,y,w,h]=clip.boxes[frame];
  return{cx:x+w/2,cy:y+h/2,w,h};
}

/**
 * Downloads the clip (≤ 2 MB) and plays it from memory: a Blob URL can always be seeked, whereas a
 * streamed file is not seekable until it is cached if the server ignores HTTP range requests.
 * Resolves with a muted, inline <video> once its first frame can be drawn.
 */
export async function openClip(clip){
  const url=new URL(`../../${clip.src}`,import.meta.url).href; // relative to the site root, from any page
  const response=await fetch(url);
  if(!response.ok)throw new Error(`Could not load ${clip.src} (HTTP ${response.status})`);
  const video=document.createElement('video');
  video.muted=true;video.playsInline=true;video.setAttribute('playsinline','');video.preload='auto';
  video.src=URL.createObjectURL(await response.blob());
  // Muted inline playback is allowed without a gesture; it makes mobile Safari decode the first frame.
  video.play()?.then(()=>video.pause()).catch(()=>{});
  return new Promise((resolve,reject)=>{
    video.addEventListener('loadeddata',()=>{video.pause();resolve(video)},{once:true});
    video.addEventListener('error',()=>{closeClip(video);reject(new Error(`Could not decode ${clip.src}`))},{once:true});
  });
}

/** Releases the in-memory copy of a clip. */
export function closeClip(video){
  if(!video)return;
  video.pause();
  if(video.src.startsWith('blob:'))URL.revokeObjectURL(video.src);
  video.removeAttribute('src');video.load();
}

/** Seeks to the middle of `frame` and resolves when that frame is ready to draw. */
export function seekFrame(video,frame){
  return new Promise(resolve=>{
    video.addEventListener('seeked',()=>resolve(),{once:true});
    video.currentTime=(frame+.5)/CLIP_FPS;
  });
}
