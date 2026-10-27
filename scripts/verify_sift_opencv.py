"""Check that the browser SIFT in js/sift.js reproduces OpenCV's SIFT.

OpenCV doubles the image before building its pyramid, so the check runs js/sift.js with
`upsample: true` and default parameters, then compares keypoints and descriptors one to one.
Requires Node.js (to run the ES module) and opencv-python-headless, numpy and pillow.
"""

import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
IMAGES = ["images/utown_crop.png", "images/spanish steps.jpeg"]
SIZE = 320

RUNNER = """
import fs from 'fs';
import {sift} from './sift.mjs';
const [w, h] = [Number(process.argv[3]), Number(process.argv[4])];
const bytes = fs.readFileSync(process.argv[2]), gray = new Float32Array(w * h);
for (let i = 0; i < gray.length; i++) gray[i] = bytes[i] / 255;
const {keypoints} = sift(gray, w, h, {upsample: true, maxOctaves: 99});
console.log(JSON.stringify(keypoints.map(k => [k.x, k.y, k.size, k.angle,
  ...Array.from(k.descriptor, v => Math.min(255, Math.round(v * 512)))])));
"""


def compare(path, workdir):
    rgb = np.asarray(Image.open(ROOT / path).convert("RGB").resize((SIZE, SIZE), Image.BILINEAR))
    gray = cv2.cvtColor(np.ascontiguousarray(rgb[..., ::-1]), cv2.COLOR_BGR2GRAY)
    raw = workdir / "gray.u8"
    gray.tofile(raw)
    out = subprocess.run(["node", str(workdir / "run.mjs"), str(raw), str(SIZE), str(SIZE)],
                         check=True, capture_output=True, text=True).stdout
    js = np.array(json.loads(out))
    keypoints, descriptors = cv2.SIFT_create().detectAndCompute(gray, None)
    used = np.zeros(len(js), bool)
    matched, worst = 0, 0
    for kp, desc in zip(keypoints, descriptors):
        angle = (360 - kp.angle) % 360  # OpenCV stores the angle in image (y-down) coordinates
        dangle = np.abs(js[:, 3] - angle)
        dangle = np.minimum(dangle, 360 - dangle)
        hit = np.flatnonzero((np.hypot(js[:, 0] - kp.pt[0], js[:, 1] - kp.pt[1]) < 0.02)
                             & (np.abs(js[:, 2] - kp.size) < 0.02) & (dangle < 0.05) & ~used)
        if len(hit):
            used[hit[0]] = True
            matched += 1
            worst = max(worst, int(np.abs(js[hit[0], 4:] - desc).max()))
    share = matched / max(len(keypoints), len(js))
    print(f"{path}: OpenCV {len(keypoints)} keypoints, JS {len(js)}, matched one to one {matched} "
          f"({share:.1%}), largest descriptor difference {worst} of 255")
    return share >= 0.97 and worst <= 1


def main():
    with tempfile.TemporaryDirectory() as tmp:
        workdir = Path(tmp)
        shutil.copy(ROOT / "js/sift.js", workdir / "sift.mjs")
        (workdir / "run.mjs").write_text(RUNNER)
        ok = all([compare(path, workdir) for path in IMAGES])
    print("PASS: js/sift.js reproduces OpenCV SIFT" if ok else "FAIL: js/sift.js differs from OpenCV SIFT")
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
