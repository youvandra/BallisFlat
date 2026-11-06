import numpy as np, potrace
from PIL import Image, ImageFilter
a = np.maximum(np.load("black.npy"), np.load("white.npy"))  # same shape; combine to denoise
S = 8
img = Image.fromarray((a*255).astype(np.uint8)).resize((a.shape[1]*S, a.shape[0]*S), Image.BICUBIC).filter(ImageFilter.GaussianBlur(S*0.6))
bm = potrace.Bitmap(np.asarray(img) <= 127)
plist = bm.trace(turdsize=200, alphamax=1.1, opticurve=True, opttolerance=0.4)
parts=[]
for curve in plist:
    s = curve.start_point; d=[f"M{s.x/S:.2f} {s.y/S:.2f}"]
    for seg in curve.segments:
        if seg.is_corner: d.append(f"L{seg.c.x/S:.2f} {seg.c.y/S:.2f}L{seg.end_point.x/S:.2f} {seg.end_point.y/S:.2f}")
        else: d.append(f"C{seg.c1.x/S:.2f} {seg.c1.y/S:.2f} {seg.c2.x/S:.2f} {seg.c2.y/S:.2f} {seg.end_point.x/S:.2f} {seg.end_point.y/S:.2f}")
    parts.append("".join(d)+"Z")
h,w = a.shape
d = "".join(parts)
open("path.txt","w").write(d)
open("viewbox.txt","w").write(f"0 0 {w} {h}")
for name, fill in [("logo-black","#0b0b0b"),("logo-white","#ffffff")]:
    open(name+".svg","w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}"><path fill="{fill}" fill-rule="evenodd" d="{d}"/></svg>\n')
print(len(plist), "curves", len(d), "chars")
