"""Build the Lecture 10 stereo-matching assets in images/stereo/ from the Middlebury downloads.

Motorcycle (Middlebury 2014, perfect rectification) is the lecture's own pair (slides 21 and 25-28):
    https://vision.middlebury.edu/stereo/data/scenes2014/zip/Motorcycle-perfect.zip
Laundry (Middlebury 2005, third size, 7 views) gives five real baselines from one left view:
    https://vision.middlebury.edu/stereo/data/scenes2005/ThirdSize/zip-7views/Laundry-7views.zip

Usage: python scripts/build_stereo_assets.py MOTORCYCLE_DIR LAUNDRY_DIR

Outputs (raw little-endian arrays, row-major, sizes in js/stereo.js):
    motorcycle-left.gray, motorcycle-right.gray   uint8 grey, 741 x 500
    motorcycle-gt.u16                              uint16, round(64 * disparity), 0 = unknown
    laundry-view{1..6}.gray                        uint8 grey, 447 x 370
    laundry-gt.u8                                  uint8, 3 * disparity between views 1 and 5 (Middlebury's
                                                   third-size disp1.png as is), 0 = unknown
    *.jpg                                          colour copies for display only
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from skimage.transform import resize

OUT = Path(__file__).resolve().parent.parent / "images" / "stereo"
QUARTER = (500, 741)  # 2000 x 2964 / 4, the resolution of the lecture's figures


def grey(rgb):
    """BT.601 luma rounded to 8 bits, the grey image every cost on the page is computed from."""
    return np.clip(np.round(np.asarray(rgb, dtype=np.float64) @ [0.299, 0.587, 0.114]), 0, 255).astype(np.uint8)


def read_pfm(path):
    with open(path, "rb") as f:
        assert f.readline().strip() == b"Pf"
        w, h = map(int, f.readline().split())
        scale = float(f.readline())
        data = np.fromfile(f, "<f4" if scale < 0 else ">f4").reshape(h, w)
    return np.flipud(data)


def quarter(path):
    rgb = np.asarray(Image.open(path).convert("RGB"))
    return resize(rgb, QUARTER, anti_aliasing=True, preserve_range=True)


def save_jpeg(rgb, name):
    Image.fromarray(np.clip(np.round(rgb), 0, 255).astype(np.uint8)).save(OUT / name, quality=90)


def motorcycle(src):
    src = Path(src)
    for side, image in (("left", "im0.png"), ("right", "im1.png")):
        rgb = quarter(src / image)
        grey(rgb).tofile(OUT / f"motorcycle-{side}.gray")
        save_jpeg(rgb, f"motorcycle-{side}.jpg")
    full = read_pfm(src / "disp0.pfm")
    d = full[0:4 * QUARTER[0]:4, 0:4 * QUARTER[1]:4] / 4  # every 4th ground-truth pixel, in quarter-size pixels
    np.where(np.isfinite(d), np.round(d * 64), 0).astype("<u2").tofile(OUT / "motorcycle-gt.u16")


def laundry(src):
    src = Path(src)
    for view in range(1, 7):
        rgb = np.asarray(Image.open(src / f"view{view}.png").convert("RGB"))
        grey(rgb).tofile(OUT / f"laundry-view{view}.gray")
        save_jpeg(rgb, f"laundry-view{view}.jpg")
    np.asarray(Image.open(src / "disp1.png"), dtype=np.uint8).tofile(OUT / "laundry-gt.u8")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    motorcycle(sys.argv[1])
    laundry(sys.argv[2])
    print("wrote", sorted(p.name for p in OUT.iterdir()))
