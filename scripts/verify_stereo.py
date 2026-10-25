"""Check js/stereo.js against an independent NumPy/SciPy implementation on the shipped assets.

Runs the page's own JavaScript in Node, recomputes everything here, and compares: winner-take-all disparities
(must be identical), confidences, ground-truth visibility (identical), and the slide-28 least-squares maps
(sparse direct solve here vs conjugate gradients in the page). Also prints the numbers quoted from slides 27-28.

Usage: python scripts/verify_stereo.py   (needs node, numpy, scipy)
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from scipy import sparse
from scipy.sparse.linalg import spsolve

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "images" / "stereo"
SIGMA = 0.015


def load(scene, baseline):
    """Grey left/right images and ground truth (NaN = unknown) exactly as js/lecture10.js reads them."""
    if scene == "motorcycle":
        w, h, D = 741, 500, 71
        L = np.fromfile(ASSETS / "motorcycle-left.gray", np.uint8).reshape(h, w)
        R = np.fromfile(ASSETS / "motorcycle-right.gray", np.uint8).reshape(h, w)
        raw = np.fromfile(ASSETS / "motorcycle-gt.u16", "<u2").reshape(h, w)
        gt = np.where(raw > 0, raw / 64, np.nan)
    else:
        w, h = 447, 370
        L = np.fromfile(ASSETS / "laundry-view1.gray", np.uint8).reshape(h, w)
        R = np.fromfile(ASSETS / f"laundry-view{1 + baseline}.gray", np.uint8).reshape(h, w)
        raw = np.fromfile(ASSETS / "laundry-gt.u8", np.uint8).reshape(h, w)
        gt = np.where(raw > 0, raw / 3 * baseline / 4, np.nan)
        D = int(np.ceil(1.2 * np.nanmax(gt)))
    return L.astype(np.int64), R.astype(np.int64), gt, w, h, D


def volume(L, R, r, D):
    """SSD over a (2r+1)^2 window for every d, zero for pixels shifted in from beyond the right image's left edge."""
    h, w = L.shape
    C = np.empty((D + 1, h, w), np.int64)
    for d in range(D + 1):
        Rs = np.zeros_like(R)
        Rs[:, d:] = R[:, :w - d]
        E = np.pad((L - Rs) ** 2, r, mode="symmetric")  # numpy 'symmetric' = scipy 'reflect'
        S = E.cumsum(0).cumsum(1)
        S = np.pad(S, ((1, 0), (1, 0)))
        k = 2 * r + 1
        C[d] = S[k:, k:] - S[:-k, k:] - S[k:, :-k] + S[:-k, :-k]
    return C


def winner_take_all(C):
    D = C.shape[0] - 1
    dhat = C.argmin(0)  # first (smallest) d on ties
    best = C.min(0)
    yy, xx = np.indices(dhat.shape)
    Cm = C.astype(np.float64)
    for k in (-1, 0, 1):
        idx = dhat + k
        ok = (idx >= 0) & (idx <= D)
        Cm[idx[ok], yy[ok], xx[ok]] = np.inf
    second = Cm.min(0)
    conf = np.where(second > 0, 1 - best / np.where(second > 0, second, 1), 0)
    return dhat, best, conf


def visibility(gt):
    h, w = gt.shape
    out = np.zeros((h, w), np.uint8)
    xs = np.arange(w)
    for y in range(h):
        d = gt[y]
        known = ~np.isnan(d)
        col = np.floor(xs - np.where(known, d, 0) + 0.5).astype(int)
        nearest = np.full(w, -np.inf)
        ok = known & (col >= 0)
        np.maximum.at(nearest, col[ok], d[ok])
        row = np.full(w, 3, np.uint8)
        row[known & (col < 0)] = 2
        hidden = ok & (d < nearest[np.clip(col, 0, w - 1)] - 1)
        row[ok & ~hidden] = 0
        row[hidden] = 1
        out[y] = row
    return out


def weights(L, edge_aware):
    I = L / 255.0
    if not edge_aware:
        return np.ones((L.shape[0], L.shape[1] - 1)), np.ones((L.shape[0] - 1, L.shape[1]))
    return np.exp(-np.abs(I[:, 1:] - I[:, :-1]) / SIGMA), np.exp(-np.abs(I[1:, :] - I[:-1, :]) / SIGMA)


def smooth(dhat, conf, wx, wy, lam):
    """Minimise sum_p c_p (D_p - Dhat_p)^2 + lam * sum_(p,q) w_pq (D_p - D_q)^2 exactly (sparse solve)."""
    h, w = dhat.shape
    n = h * w
    idx = np.arange(n).reshape(h, w)
    diag = conf.ravel().astype(np.float64).copy()
    rows, cols, vals = [], [], []
    for a, b, ww in ((idx[:, :-1], idx[:, 1:], wx), (idx[:-1, :], idx[1:, :], wy)):
        a, b, ww = a.ravel(), b.ravel(), lam * ww.ravel()
        rows += [a, b]
        cols += [b, a]
        vals += [-ww, -ww]
        np.add.at(diag, a, ww)
        np.add.at(diag, b, ww)
    A = sparse.csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(n, n)) + sparse.diags(diag)
    return spsolve(A.tocsc(), (conf * dhat).ravel()).reshape(h, w)


def mae(map_, gt):
    known = ~np.isnan(gt)
    return float(np.abs(map_ - gt)[known].mean())


NODE = r"""
import fs from 'fs';
import {winnerTakeAll,visibility,neighbourWeights,smoothDisparity,costCurve} from '%(stereo)s';
const [w,h,r,D,lambdaU,lambdaE]=JSON.parse(process.argv[2]),L=new Uint8Array(fs.readFileSync(process.argv[3])),R=new Uint8Array(fs.readFileSync(process.argv[4]));
const gt=new Float64Array(fs.readFileSync(process.argv[5]).buffer.slice(0));
const run=g=>{let s=g.next();while(!s.done)s=g.next();return s.value};
const wta=run(winnerTakeAll(L,R,w,h,r,D));
const uni=run(smoothDisparity(wta.disparity,wta.confidence,neighbourWeights(L,w,h,false),w,h,lambdaU));
const edge=run(smoothDisparity(wta.disparity,wta.confidence,neighbourWeights(L,w,h,true),w,h,lambdaE));
const out=process.argv[6];
fs.writeFileSync(out+'.disp',Buffer.from(wta.disparity.buffer));fs.writeFileSync(out+'.conf',Buffer.from(wta.confidence.buffer));
fs.writeFileSync(out+'.vis',Buffer.from(visibility(gt,w,h).buffer));
fs.writeFileSync(out+'.uni',Buffer.from(uni.map.buffer));fs.writeFileSync(out+'.edge',Buffer.from(edge.map.buffer));
const curves=JSON.parse(process.argv[7]).map(([x,y])=>Array.from(costCurve(L,R,w,h,x,y,r,D)));
fs.writeFileSync(out+'.json',JSON.stringify({curves,iterations:[uni.iteration,edge.iteration],residuals:[uni.residual,edge.residual]}));
"""


def check(scene, baseline, r, lam_u, lam_e, probes, tmp):
    L, R, gt, w, h, D = load(scene, baseline)
    stem = Path(tmp) / f"{scene}{baseline}_{r}"
    L.astype(np.uint8).tofile(f"{stem}.L")
    R.astype(np.uint8).tofile(f"{stem}.R")
    gt.astype(np.float64).tofile(f"{stem}.gt")
    module = Path(tmp) / "stereo.mjs"  # Node needs the .mjs extension to load the page's ES module
    module.write_text((ROOT / "js" / "stereo.js").read_text())
    script = Path(tmp) / "run.mjs"
    script.write_text(NODE % {"stereo": module.as_uri()})
    subprocess.run(["node", str(script), json.dumps([w, h, r, D, lam_u, lam_e]), f"{stem}.L", f"{stem}.R", f"{stem}.gt", str(stem), json.dumps(probes)], check=True)
    js_disp = np.fromfile(f"{stem}.disp", np.uint8).reshape(h, w)
    js_conf = np.fromfile(f"{stem}.conf", np.float32).reshape(h, w)
    js_vis = np.fromfile(f"{stem}.vis", np.uint8).reshape(h, w)
    js_uni = np.fromfile(f"{stem}.uni", np.float64).reshape(h, w)
    js_edge = np.fromfile(f"{stem}.edge", np.float64).reshape(h, w)
    extra = json.loads(Path(f"{stem}.json").read_text())

    C = volume(L, R, r, D)
    dhat, _, conf = winner_take_all(C)
    vis = visibility(gt)
    uni = smooth(dhat.astype(np.float64), conf, *weights(L, False), lam_u)
    edge = smooth(dhat.astype(np.float64), conf, *weights(L, True), lam_e)
    curves_ok = all(np.array_equal(np.array(c), C[:, y, x]) for c, (x, y) in zip(extra["curves"], probes))
    ok = (np.array_equal(js_disp, dhat) and np.abs(js_conf - conf).max() < 1e-6 and np.array_equal(js_vis, vis)
          and np.abs(js_uni - uni).max() < 1e-2 and np.abs(js_edge - edge).max() < 1e-2 and curves_ok)
    label = f"{scene} B×{baseline}" if scene == "laundry" else scene
    print(f"{label:14s} window {2 * r + 1:2d}  D 0..{D:<3d}  disparity identical {np.array_equal(js_disp, dhat)}  "
          f"max|Δconf| {np.abs(js_conf - conf).max():.1e}  visibility identical {np.array_equal(js_vis, vis)}  "
          f"max|ΔD| uniform {np.abs(js_uni - uni).max():.1e} edge {np.abs(js_edge - edge).max():.1e}  cost curves identical {curves_ok}")
    print(f"{'':14s} MAE  data term {mae(dhat, gt):.3f} px | uniform λ={lam_u} {mae(uni, gt):.3f} | edge-aware λ={lam_e} {mae(edge, gt):.3f} "
          f"(page: {mae(js_disp, gt):.3f} | {mae(js_uni, gt):.3f} | {mae(js_edge, gt):.3f}; CG iterations {extra['iterations']})")
    for (x, y) in probes:
        print(f"{'':14s} pixel ({x},{y}): chosen {dhat[y, x]}, true {gt[y, x]:.2f}, visibility {['visible', 'hidden', 'outside', 'unknown'][vis[y, x]]}, "
              f"uniform {uni[y, x]:.1f}, edge-aware {edge[y, x]:.1f}")
    return ok


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as tmp:
        results = [
            check("motorcycle", 1, 4, 10, 50, [(239, 36), (87, 175), (390, 130), (521, 139)], tmp),
            check("motorcycle", 1, 2, 10, 50, [(239, 36)], tmp),
            check("laundry", 4, 4, 10, 50, [(209, 222), (133, 14), (311, 174)], tmp),
            check("laundry", 1, 7, 10, 50, [(364, 18)], tmp),
        ]
    print("PASS" if all(results) else "FAIL")
    sys.exit(0 if all(results) else 1)
