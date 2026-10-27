// Scripted "classroom" scenes that reproduce the three live experiments without a webcam.
// Every scene is deterministic and returns the true target box, so the demo can say when
// a tracker has actually lost the target.

import {seededRandom} from './shared.js';

export const SCENE_W=640;
export const SCENE_H=480;
export const SCENE_FPS=30;

const FACE_RX=31,FACE_RY=38;
const TARGET={skin:'#e2ad84',hair:'#c9b48a',shirt:'#2f6fd6',lips:'#b5524a'};
const COLLEAGUE={skin:'#dca57c',hair:'#33241a',shirt:'#d26a1f',lips:'#ad4c44'};

const ease=t=>t<=0?0:t>=1?1:t*t*(3-2*t);
const lerp=(a,b,t)=>a+(b-a)*t;
// Piecewise-smooth keyframes: [[frame, value], ...]
function keyframes(points,t){
  if(t<=points[0][0])return points[0][1];
  for(let i=1;i<points.length;i++){
    const[t0,v0]=points[i-1],[t1,v1]=points[i];
    if(t<=t1)return lerp(v0,v1,ease((t-t0)/(t1-t0)));
  }
  return points[points.length-1][1];
}

// The scene parameters below were tuned so that the default settings reproduce the lecture's claims
// (see tests/scene-check.html); small changes to them can flip the outcomes.
const PROFILE_YAW=1.45;   // head-turn: turn to profile (~83°)
const NOISE_SIGMA=20;     // camera noise in gray levels; without it PSR is far higher than on real video
const HAND_SCALE=1.7;     // a hand close to the camera covers most of the search window

export const SCENARIOS={
  turn:{
    label:'Head turn',
    frames:240,
    // In front of a busy bookshelf the person turns to profile, walks briskly past a framed photo of
    // themself and turns back to the camera. The photo looks exactly like frame 1, so it catches
    // models that have not adapted (MOSSE with a very small η).
    photo:{x:520,y:200},
    palette:{hair:'#806244'},
    person:t=>({x:keyframes([[0,400],[65,400],[125,592],[240,596]],t),y:205+3*Math.sin(t/9),yaw:keyframes([[0,0],[15,0],[60,PROFILE_YAW],[150,PROFILE_YAW],[205,0]],t)})
  },
  occlusion:{
    label:'Hand occlusion',
    frames:220,
    person:t=>({x:300+6*Math.sin(t/15),y:210+3*Math.sin(t/11),yaw:.12*Math.sin(t/20)}),
    // The hand comes in from the lower right, rests on the face for 2 s, then is pulled back the same way.
    hand:t=>t<36||t>214?null:{
      x:keyframes([[36,600],[50,304],[120,298],[205,560],[214,700]],t)+(t>50&&t<120?3*Math.sin(t/3):0),
      y:keyframes([[36,520],[50,236],[120,230],[205,330],[214,420]],t)
    }
  },
  crossing:{
    label:'Walk past a colleague',
    frames:220,
    person:t=>({x:330+5*Math.sin(t/16),y:205+3*Math.sin(t/10),yaw:.1*Math.sin(t/23)}),
    // The colleague walks in, stops in front of the target to chat, then walks off to the left.
    colleague:t=>({x:keyframes([[10,740],[70,342],[115,338],[210,40]],t),y:212+(t>70&&t<115?0:4*Math.abs(Math.sin(t/5))),yaw:-.15})
  }
};

function drawBackground(ctx){
  const random=seededRandom(12),wall=ctx.createLinearGradient(0,0,0,SCENE_H);
  wall.addColorStop(0,'#d9d4c7');wall.addColorStop(1,'#bdb6a6');
  ctx.fillStyle=wall;ctx.fillRect(0,0,SCENE_W,SCENE_H);
  // Whiteboard with marker scribbles.
  ctx.fillStyle='#f4f4f0';ctx.fillRect(28,40,190,120);ctx.strokeStyle='#8a8a86';ctx.lineWidth=4;ctx.strokeRect(28,40,190,120);
  ctx.lineWidth=2;
  for(let k=0;k<6;k++){
    ctx.strokeStyle=['#2b59c3','#c0392b','#2d7d46'][k%3];ctx.beginPath();
    let x=45,y=60+k*16;ctx.moveTo(x,y);
    while(x<190){x+=8+random()*10;ctx.lineTo(x,y+(random()-.5)*8)}
    ctx.stroke();
  }
  // Wide bookshelf: the cluttered background the head-turn scene walks in front of.
  ctx.fillStyle='#6b4a2f';ctx.fillRect(392,30,240,280);
  for(let shelf=0;shelf<4;shelf++){
    const y=40+shelf*68;ctx.fillStyle='#3d2a1b';ctx.fillRect(400,y,224,60);
    let x=404;
    while(x<616){
      const w=6+random()*12,h=34+random()*24;
      ctx.fillStyle=`hsl(${Math.floor(random()*360)} ${35+random()*35}% ${30+random()*35}%)`;
      ctx.fillRect(x,y+60-h,Math.min(w,620-x),h);x+=w+1;
    }
  }
  // Window frame and a plant.
  ctx.fillStyle='#a9c7de';ctx.fillRect(236,26,140,104);ctx.strokeStyle='#efefef';ctx.lineWidth=6;ctx.strokeRect(236,26,140,104);
  ctx.beginPath();ctx.moveTo(306,26);ctx.lineTo(306,130);ctx.moveTo(236,78);ctx.lineTo(376,78);ctx.stroke();
  ctx.fillStyle='#7a5a3c';ctx.fillRect(70,330,60,70);
  for(let k=0;k<14;k++){
    ctx.fillStyle=`hsl(${105+random()*30} 45% ${25+random()*20}%)`;ctx.beginPath();
    ctx.ellipse(100+(random()-.5)*70,300+(random()-.5)*60,8,26,(random()-.5)*2,0,Math.PI*2);ctx.fill();
  }
  // Desk.
  ctx.fillStyle='#8c7356';ctx.fillRect(0,400,SCENE_W,80);ctx.fillStyle='#6f5a43';ctx.fillRect(0,400,SCENE_W,8);
}

// Head modelled as a vertical cylinder: a feature at azimuth φ appears at x = rx·sin(φ + turn)
// and is visible while cos(φ + turn) > 0. turn = 0 faces the camera, ±π shows the back of the head.
function drawHead(ctx,{x,y,yaw},palette,scale=1){
  const rx=FACE_RX*scale,ry=FACE_RY*scale,turn=((yaw+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
  ctx.fillStyle=palette.skin;ctx.fillRect(x-rx*.35,y+ry*.7,rx*.7,ry*.6);
  ctx.fillStyle=palette.hair;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();
  const a=Math.max(turn-1.3,-Math.PI/2),b=Math.min(turn+1.3,Math.PI/2);
  if(a<b){
    // Skin region of the face between hairline and chin.
    ctx.fillStyle=palette.skin;ctx.beginPath();
    const steps=18;
    for(let k=0;k<=steps;k++){const v=lerp(-.45,.98,k/steps),w=Math.sqrt(Math.max(0,1-v*v));ctx.lineTo(x+rx*w*Math.sin(a),y+ry*v)}
    for(let k=steps;k>=0;k--){const v=lerp(-.45,.98,k/steps),w=Math.sqrt(Math.max(0,1-v*v));ctx.lineTo(x+rx*w*Math.sin(b),y+ry*v)}
    ctx.closePath();ctx.fill();
  }
  const feature=(phi,draw)=>{const depth=Math.cos(phi+turn);if(depth>.15)draw(x+rx*Math.sin(phi+turn),depth)};
  for(const side of[-1,1]){
    feature(side*1.57,(fx,d)=>{ctx.fillStyle=palette.skin;ctx.beginPath();ctx.ellipse(fx,y+ry*.05,4*scale*d+2,9*scale,0,0,Math.PI*2);ctx.fill()});
    feature(side*.42,(fx,d)=>{
      ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(fx,y-ry*.08,7*scale*d,4.5*scale,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#1d1d1d';ctx.beginPath();ctx.ellipse(fx,y-ry*.08,3.4*scale*d,3.4*scale,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=palette.hair;ctx.lineWidth=3*scale;ctx.beginPath();ctx.moveTo(fx-8*scale*d,y-ry*.28);ctx.lineTo(fx+8*scale*d,y-ry*.3);ctx.stroke();
    });
  }
  feature(0,(fx,d)=>{
    ctx.strokeStyle='rgba(120,60,40,.75)';ctx.lineWidth=2.5*scale;ctx.beginPath();ctx.moveTo(fx,y);ctx.lineTo(fx+5*scale*Math.sin(turn),y+ry*.28);ctx.lineTo(fx-3*scale*d,y+ry*.3);ctx.stroke();
    ctx.fillStyle=palette.lips;ctx.beginPath();ctx.ellipse(fx,y+ry*.55,11*scale*d,4*scale,0,0,Math.PI*2);ctx.fill();
  });
}

function drawBody(ctx,{x,y,yaw},palette,scale=1){
  const width=FACE_RX*scale*3.3*(.62+.38*Math.abs(Math.cos(yaw))),top=y+FACE_RY*scale*1.12;
  ctx.fillStyle=palette.shirt;ctx.beginPath();
  ctx.roundRect(x-width/2,top,width,SCENE_H-top+20,[26*scale,26*scale,0,0]);ctx.fill();
  ctx.fillStyle='rgba(0,0,0,.18)';ctx.fillRect(x-2,top+10,4,SCENE_H-top);
}

function drawHand(ctx,{x,y}){
  const skin='#d79b72',crease='rgba(120,62,40,.55)';
  ctx.save();ctx.translate(x,y);ctx.rotate(-.18);ctx.scale(HAND_SCALE,HAND_SCALE);
  // Striped sleeve and watch: the arm moves with the hand, as in real life.
  ctx.save();ctx.rotate(-.75);
  ctx.fillStyle='#7f1d1d';ctx.fillRect(-26,62,60,260);
  ctx.fillStyle='#fca5a5';for(let k=0;k<8;k++)ctx.fillRect(-26,80+k*28,60,9);
  ctx.fillStyle=skin;ctx.fillRect(-22,40,52,30);
  ctx.fillStyle='#111827';ctx.fillRect(-24,52,56,12);ctx.fillStyle='#e5e7eb';ctx.fillRect(-2,50,14,16);
  ctx.restore();
  ctx.fillStyle=skin;
  [[-30,-58,15,52],[-11,-70,15,62],[8,-66,15,58],[26,-52,14,46]].forEach(([fx,fy,w,h])=>{ctx.beginPath();ctx.roundRect(fx,fy,w,h,7);ctx.fill()});
  ctx.beginPath();ctx.roundRect(-36,-14,78,84,22);ctx.fill();
  ctx.beginPath();ctx.ellipse(-44,22,12,30,-.6,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=crease;ctx.lineWidth=2.2;
  [[-28,10,30,-2],[-30,30,28,20],[-20,52,22,40]].forEach(([x0,y0,x1,y1])=>{ctx.beginPath();ctx.moveTo(x0,y0);ctx.quadraticCurveTo((x0+x1)/2,y0+10,x1,y1);ctx.stroke()});
  [[-23,-40],[-4,-50],[15,-46],[33,-34]].forEach(([fx,fy])=>{ctx.beginPath();ctx.moveTo(fx-5,fy);ctx.lineTo(fx+5,fy);ctx.stroke()});
  ctx.restore();
}

/** Creates a renderer for one scenario. `render(ctx, t)` draws frame t and returns the true face box. */
export function createScene(kind){
  const scenario=SCENARIOS[kind];
  if(!scenario)throw new Error(`Unknown scenario: ${kind}`);
  let background=null,noise=null;
  return{
    kind,
    frames:scenario.frames,
    render(ctx,t){
      if(!background){
        background=document.createElement('canvas');background.width=SCENE_W;background.height=SCENE_H;
        const bctx=background.getContext('2d');
        drawBackground(bctx);
        if(scenario.photo)drawPhoto(bctx,scenario.photo,{...TARGET,...scenario.palette});
        noise=makeNoise();
      }
      ctx.drawImage(background,0,0);
      const person=scenario.person(t);
      const palette={...TARGET,...scenario.palette};
      drawBody(ctx,person,palette);drawHead(ctx,person,palette);
      if(scenario.colleague){const other=scenario.colleague(t);drawBody(ctx,other,COLLEAGUE,1.05);drawHead(ctx,other,COLLEAGUE,1.05)}
      const hand=scenario.hand?.(t);
      if(hand)drawHand(ctx,hand);
      addNoise(ctx,noise,t);
      return{cx:person.x,cy:person.y,w:FACE_RX*2.4,h:FACE_RY*2.15};
    }
  };
}

function drawPhoto(ctx,{x,y},palette){
  ctx.fillStyle='#5b4636';ctx.fillRect(x-52,y-62,104,124);
  ctx.fillStyle='#d9d4c7';ctx.fillRect(x-44,y-54,88,108);
  drawHead(ctx,{x,y:y+2,yaw:0},palette);
  ctx.fillStyle='#8a7a68';ctx.font='10px Arial';ctx.textAlign='center';ctx.fillText('photo',x,y+74);ctx.textAlign='start';
}

// Pre-generated Gaussian-like noise, read at a different offset every frame.
function makeNoise(){
  const random=seededRandom(99),values=new Int8Array(SCENE_W*SCENE_H+4099);
  for(let i=0;i<values.length;i++)values[i]=Math.max(-127,Math.min(127,Math.round((random()+random()+random()-1.5)*2*NOISE_SIGMA)));
  return values;
}

function addNoise(ctx,noise,t){
  const image=ctx.getImageData(0,0,SCENE_W,SCENE_H),data=image.data,offset=(t*1543)%4099;
  for(let p=0,i=0;i<data.length;p++,i+=4){const n=noise[p+offset];data[i]+=n;data[i+1]+=n;data[i+2]+=n}
  ctx.putImageData(image,0,0);
}
