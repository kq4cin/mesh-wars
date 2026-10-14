"""Slice the MESH WARS character sheet into transparent sprites + a JSON manifest.

Usage: python tools/slice_sheet.py <sheet.png> <out_dir> [contact_sheet.png]
The background (dark blueprint panel + grid) is removed by flood-filling from each panel's
edge through "background-like" pixels; the sprites' dark outlines stop the fill.
"""
import json
import sys
from collections import deque
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SHEET, OUT = sys.argv[1], sys.argv[2]
im = Image.open(SHEET).convert("RGB")
if im.size != (1408, 768):
    raise ValueError("Expected the 1408 x 768 reference sheet")
A = np.asarray(im).astype(np.int16)

# group: (panel box x0,y0,x1,y1, expected sprite count, min sprite height, outline seal px)
GROUPS = {
    "head_bald": ((48, 120, 452, 206), 6, 45, 1),
    "head_mid": ((476, 120, 953, 193), 7, 45, 1),
    "head_robot": ((965, 120, 1363, 206), 5, 45, 1),
    "head_hair": ((48, 253, 452, 338), 6, 45, 1),
    "head_ext": ((965, 253, 1363, 338), 5, 35, 1),
    "figure": ((482, 250, 942, 670), 3, 300, 2),
}

# Source-space silhouettes keep enclosed blueprint grid (between limbs) out of the cutouts.
FIGURE_OUTLINES = [
    [(557,261),(573,267),(585,280),(588,303),(582,320),(593,332),(601,345),(609,392),(619,439),(626,464),(623,484),(615,489),(608,477),(606,461),(602,474),(600,526),(597,563),(601,599),(605,623),(625,638),(626,648),(617,653),(589,651),(576,645),(570,630),(569,595),(565,567),(561,542),(557,510),(550,486),(543,507),(537,540),(531,563),(527,600),(525,640),(530,654),(525,662),(509,665),(498,661),(497,648),(501,614),(502,585),(500,573),(501,550),(507,519),(512,479),(509,468),(510,490),(503,494),(493,482),(490,468),(492,438),(496,409),(498,380),(504,351),(510,335),(533,326),(527,312),(526,291),(535,270)],
    [(706,265),(725,270),(735,282),(738,300),(730,322),(727,331),(748,343),(756,368),(760,402),(770,451),(773,475),(766,491),(757,497),(751,489),(754,470),(750,456),(746,451),(747,483),(750,510),(748,538),(744,558),(747,591),(745,616),(759,634),(775,643),(776,652),(767,656),(749,651),(727,646),(718,639),(716,621),(716,596),(710,573),(710,553),(712,534),(708,514),(704,493),(699,518),(693,541),(685,563),(679,593),(675,624),(678,645),(676,660),(668,667),(658,661),(648,666),(643,660),(645,648),(651,631),(651,604),(651,576),(659,551),(666,527),(671,512),(670,482),(666,472),(669,495),(660,499),(650,490),(645,474),(644,452),(642,438),(645,409),(650,385),(651,365),(655,343),(681,331),(686,321),(681,303),(681,283),(690,270)],
    [(865,265),(881,268),(890,280),(894,299),(889,315),(882,326),(888,333),(909,340),(921,357),(926,382),(925,402),(930,427),(935,453),(937,475),(931,489),(922,498),(914,492),(915,475),(918,462),(912,443),(907,427),(907,450),(911,467),(912,494),(908,521),(905,542),(907,561),(900,589),(900,614),(913,632),(934,641),(935,650),(927,655),(908,652),(887,649),(875,643),(875,626),(874,604),(872,582),(868,559),(871,540),(872,519),(872,493),(865,475),(857,493),(854,520),(852,540),(847,560),(837,588),(832,612),(832,638),(837,653),(832,665),(818,663),(805,665),(804,657),(808,635),(810,612),(810,588),(814,563),(818,540),(820,519),(820,495),(823,471),(826,452),(823,435),(819,456),(824,479),(823,498),(814,499),(803,488),(800,471),(801,453),(796,437),(795,414),(800,387),(805,357),(812,341),(838,331),(847,322),(844,308),(841,292),(847,275)],
]
FIGURE_HOLES = [
    [],
    [[(674,388),(669,398),(667,409),(663,431),(663,444),(664,451),(672,434),(675,423),(679,419),(683,419),(685,407),(685,401),(679,394)],
     [(737,406),(739,420),(743,430),(748,443),(751,453),(755,454),(754,446),(750,436),(746,427),(744,419),(741,411)]],
    [[(827,391),(823,400),(821,407),(821,417),(820,430),(817,442),(818,460),(824,466),(826,454),(830,448),(826,443),(827,433),(829,422),(832,420),(842,419),(842,410),(838,404),(833,402)],
     [(905,435),(906,443),(902,447),(906,455),(908,466),(909,479),(915,479),(918,476),(917,469),(918,460),(915,451),(910,438)]],
]


def bg_like(px):
    r, g, b = px[..., 0], px[..., 1], px[..., 2]
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    # panel background is a saturated dark navy (~15,30,45); dark sprite greys are near-neutral
    navy = (b - r >= 20) & (g - r >= 8) & (lum < 70)
    grid = (b - r >= 30) & (lum < 110)  # brighter blueprint grid lines / panel frame
    return navy | grid


def foreground(box, seal):
    """Flood background inward from the panel edges. `seal` erodes the background mask first so the
    fill can't squeeze through small gaps in a sprite's outline (dark clothing ~ background colour)."""
    x0, y0, x1, y1 = box
    bgl = bg_like(A[y0:y1, x0:x1])
    walk = np.asarray(Image.fromarray((bgl * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(2 * seal + 1))) > 0 if seal else bgl
    reach = np.zeros_like(walk)
    reach[0, :] = walk[0, :]; reach[-1, :] = walk[-1, :]; reach[:, 0] = walk[:, 0]; reach[:, -1] = walk[:, -1]
    while True:
        d = reach.copy()
        d[1:] |= reach[:-1]; d[:-1] |= reach[1:]; d[:, 1:] |= reach[:, :-1]; d[:, :-1] |= reach[:, 1:]
        d &= walk
        if (d == reach).all():
            break
        reach = d
    if seal:  # grow back to the true background edge
        grown = np.asarray(Image.fromarray((reach * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(2 * seal + 3))) > 0
        reach = grown & bgl
    return ~reach


def components(mask):
    h, w = mask.shape
    lab = np.zeros((h, w), np.int32)
    comps = []
    for y in range(h):
        for x in range(w):
            if mask[y, x] and not lab[y, x]:
                n = len(comps) + 1
                q = deque([(y, x)]); lab[y, x] = n
                x0 = x1 = x; y0 = y1 = y; area = 0
                while q:
                    cy, cx = q.popleft(); area += 1
                    x0 = min(x0, cx); x1 = max(x1, cx); y0 = min(y0, cy); y1 = max(y1, cy)
                    for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = n; q.append((ny, nx))
                comps.append({"id": n, "x0": x0, "x1": x1, "y0": y0, "y1": y1, "area": area})
    return lab, comps


def column_ranges(mask, count):
    """Split the panel into `count` sprites using the column projection of the foreground."""
    cols = mask.sum(axis=0) > 0
    runs, start = [], None
    for x, on in enumerate(list(cols) + [False]):
        if on and start is None:
            start = x
        elif not on and start is not None:
            runs.append([start, x - 1]); start = None
    while len(runs) > count:  # glue the pair separated by the smallest gap
        k = min(range(len(runs) - 1), key=lambda i: runs[i + 1][0] - runs[i][1])
        runs[k] = [runs[k][0], runs[k + 1][1]]; del runs[k + 1]
    proj = mask.sum(axis=0)
    while len(runs) < count:  # split the widest run at its thinnest column (middle 60%)
        k = max(range(len(runs)), key=lambda i: runs[i][1] - runs[i][0])
        a, b = runs[k]; lo, hi = a + (b - a) // 5, b - (b - a) // 5
        cut = lo + int(np.argmin(proj[lo:hi + 1]))
        runs[k:k + 1] = [[a, cut], [cut + 1, b]]
    return runs


Path(OUT).mkdir(parents=True, exist_ok=True)
cv2.setRNGSeed(0)
manifest = {"sheet": {"w": im.width, "h": im.height}, "sprites": {}}
sprites = {}
for group, (box, count, minh, seal) in GROUPS.items():
    fg = foreground(box, seal)
    lab, comps = components(fg)
    # drop specks and thin panel-frame fragments (tall but narrow)
    junk = [c["id"] for c in comps if c["area"] < 60 or (c["x1"] - c["x0"] < 6 and c["area"] < 400)]
    fg = fg & ~np.isin(lab, junk)
    ranges = column_ranges(fg, count)
    if group == "figure":
        ranges = [(6, 147), (154, 296), (310, 459)]
    for i, (cx0, cx1) in enumerate(ranges):
        keep = np.zeros_like(fg); keep[:, cx0:cx1 + 1] = fg[:, cx0:cx1 + 1]
        # each sprite keeps its main connected piece plus any piece at least 3% of it (antennae, gloves)
        l2, c2 = components(keep)
        big = max(c2, key=lambda c: c["area"])
        keep = np.isin(l2, [c["id"] for c in c2 if c["area"] >= big["area"] * (1.0 if group == "figure" else 0.03)])
        ys, xs = np.nonzero(keep)
        mx0, mx1, my0, my1 = xs.min(), xs.max(), ys.min(), ys.max()
        pad = 4
        sx0, sy0 = max(mx0 - pad, 0), max(my0 - pad, 0)
        sx1, sy1 = min(mx1 + pad + 1, fg.shape[1]), min(my1 + pad + 1, fg.shape[0])
        m = keep[sy0:sy1, sx0:sx1]
        rgb = A[box[1] + sy0:box[1] + sy1, box[0] + sx0:box[0] + sx1].astype(np.uint8)
        if group == "figure":
            silhouette = Image.new("L", (im.width, im.height))
            pen = ImageDraw.Draw(silhouette)
            pen.polygon(FIGURE_OUTLINES[i], fill=255)
            for hole in FIGURE_HOLES[i]:
                pen.polygon(hole, fill=0)
            m = np.asarray(silhouette)[box[1] + sy0:box[1] + sy1, box[0] + sx0:box[0] + sx1] > 0
        # Colour models remove navy edge fragments without globally keying out blue clothing.
        labels = np.where(m, cv2.GC_PR_FGD, cv2.GC_PR_BGD).astype(np.uint8)
        core = cv2.erode(m.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
        if group != "figure":
            # Only neutral/warm interior pixels are definite foreground; dark navy must be
            # allowed to reclassify even when a thick panel fragment touches the sprite.
            core &= (rgb[..., 2].astype(int) - rgb[..., 0].astype(int)) < 8
        labels[core] = cv2.GC_FGD
        if group == "figure":
            labels[~m] = cv2.GC_BGD
        labels[[0, -1], :] = cv2.GC_BGD
        labels[:, [0, -1]] = cv2.GC_BGD
        cv2.grabCut(rgb, labels, None, np.zeros((1, 65)), np.zeros((1, 65)), 5, cv2.GC_INIT_WITH_MASK)
        m = (labels == cv2.GC_FGD) | (labels == cv2.GC_PR_FGD)
        labs, pieces = components(m)
        main = max(pieces, key=lambda piece: piece["area"])
        m = labs == main["id"]
        if np.count_nonzero(m.any(axis=1)) < minh:
            raise ValueError(f"{group}_{i}: incomplete extraction")
        hard = Image.fromarray((m * 255).astype(np.uint8))
        soft = np.asarray(hard.filter(ImageFilter.GaussianBlur(0.6)))
        inner = np.asarray(hard.filter(ImageFilter.MinFilter(3)))
        alpha = np.maximum(soft, inner)
        name = f"{group}_{i}"
        sprites[name] = Image.fromarray(np.dstack([rgb, alpha]).astype(np.uint8))

        ys, xs = np.nonzero(m)
        h = int(ys.max() - ys.min() + 1)
        top = m[ys.min(): ys.min() + max(1, h // 4)]
        rec = {
            "w": int(m.shape[1]), "h": int(m.shape[0]), "group": group,
            "src": [int(box[0] + sx0), int(box[1] + sy0)],
            "bbox": {"x": int(xs.min()), "y": int(ys.min()), "w": int(xs.max() - xs.min() + 1), "h": h},
            "shoulderW": int(top.sum(axis=1).max()),
        }
        if group == "figure":
            hx, hy, hw, hh = [(526, 260, 64, 70), (680, 264, 60, 70), (840, 264, 56, 70)][i]
            rec["head"] = {"x": hx - rec["src"][0], "y": hy - rec["src"][1], "w": hw, "h": hh}
        manifest["sprites"][name] = rec
    print(group, len(ranges))

# Keep source pixels at native resolution in a single shared atlas.
atlas = Image.new("RGBA", (1024, 1024))
x = y = row_h = 0
for name, rec in manifest["sprites"].items():
    sprite = sprites[name]
    if x + sprite.width + 2 > atlas.width:
        x = 0
        y += row_h + 2
        row_h = 0
    if y + sprite.height > atlas.height:
        raise ValueError("Atlas is too small")
    atlas.alpha_composite(sprite, (x, y))
    rec["frame"] = {"x": x, "y": y, "w": sprite.width, "h": sprite.height}
    x += sprite.width + 2
    row_h = max(row_h, sprite.height)
atlas = atlas.crop((0, 0, atlas.width, y + row_h))
atlas.save(Path(OUT) / "crew.png", optimize=True)
manifest["atlas"] = {"file": "crew.png", "w": atlas.width, "h": atlas.height}

with open(Path(OUT) / "sprites.json", "w") as fh:
    json.dump(manifest, fh, indent=1)

# contact sheet on a checkerboard for review
if len(sys.argv) > 3:
    names = list(manifest["sprites"])
    cols, cw, ch = 8, 130, 155
    rows = (len(names) + cols - 1) // cols
    cs = Image.new("RGBA", (cols * cw, rows * ch + 430), (40, 40, 40, 255))
    for k, nme in enumerate(names):
        sp = sprites[nme]
        if sp.height > ch - 10:
            continue
        tile = Image.new("RGBA", (cw, ch), (110, 70, 110, 255))
        tile.alpha_composite(sp, (4, 4))
        ImageDraw.Draw(tile).text((4, ch - 16), nme, fill="white")
        cs.paste(tile, ((k % cols) * cw, (k // cols) * ch))
    x = 0
    for nme in names:
        sp = sprites[nme]
        if sp.height > ch - 10:
            t = Image.new("RGBA", (sp.width, sp.height), (110, 70, 110, 255)); t.alpha_composite(sp)
            cs.paste(t, (x, rows * ch + 5)); x += sp.width + 20
    cs.save(sys.argv[3])
