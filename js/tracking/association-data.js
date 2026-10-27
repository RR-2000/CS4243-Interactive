// Two real moments from PETS 2009 S2L1 (via MOTChallenge MOT15, CC BY-NC-SA 3.0): the tracks are
// the benchmark's ground-truth boxes at frames t − 2Δ, t − Δ and t; the detections are MOT15's public
// detector output at frame t + Δ. Coordinates are pixels in the cropped images in images/association/.
// `track` is the true identity of a detection (IoU ≥ 0.5 with that person's ground-truth box), or null.

export const SCENES={
  warmup:{frame:504,gap:2,seconds:0.29,width:298,height:250,
    images:['images/association/warmup-t.jpg','images/association/warmup-t1.jpg'],
    tracks:[{id:"A",color:"#e8590c",history:[{cx:109.0,cy:111.6,w:32.0,h:107.1},{cx:106.0,cy:107.1,w:31.9,h:106.2},{cx:102.9,cy:103.7,w:31.8,h:105.3}]},{id:"B",color:"#0d9488",history:[{cx:109.5,cy:150.4,w:33.0,h:110.7},{cx:124.7,cy:155.9,w:33.4,h:111.8},{cx:139.9,cy:161.4,w:33.8,h:112.8}]},{id:"C",color:"#7c3aed",history:[{cx:156.7,cy:141.2,w:29.4,h:98.5},{cx:158.8,cy:143.3,w:29.6,h:98.5},{cx:159.8,cy:143.1,w:29.6,h:98.3}]}],
    detections:[{id:"d1",cx:100.7,cy:100.9,w:47.5,h:107.7,track:"A"},{id:"d2",cx:154.0,cy:160.0,w:52.0,h:118.0,track:"B"},{id:"d3",cx:277.7,cy:104.3,w:43.5,h:98.6,track:null}]},
  crossing:{frame:624,gap:4,seconds:0.57,width:256,height:280,
    images:['images/association/crossing-t.jpg','images/association/crossing-t1.jpg'],
    tracks:[{id:"A",color:"#e8590c",history:[{cx:160.5,cy:170.3,w:31.1,h:102.6},{cx:148.3,cy:164.6,w:30.6,h:101.2},{cx:127.0,cy:154.5,w:29.9,h:99.0}]},{id:"B",color:"#0d9488",history:[{cx:97.1,cy:144.3,w:34.2,h:108.5},{cx:106.6,cy:134.4,w:33.2,h:104.7},{cx:120.2,cy:121.6,w:32.3,h:101.1}]}],
    detections:[{id:"d1",cx:103.4,cy:138.6,w:36.7,h:83.3,track:"A"},{id:"d2",cx:135.1,cy:101.7,w:40.3,h:91.4,track:"B"}]}
};
