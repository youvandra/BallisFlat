import sys, numpy as np
from PIL import Image
im = np.asarray(Image.open(sys.argv[1]).convert("RGB")).astype(float)
R = im[...,0]
bgR = np.median(R[500:580, 50:1300]); print("bg R", bgR)
def cut(x0,x1,y0,y1,kind,name):
    r = R[y0:y1, x0:x1]
    if kind=="black": a = np.clip((bgR - r)/(bgR-15),0,1)
    else: a = np.clip((r - bgR)/(250-bgR),0,1)
    ys,xs = np.where(a>0.5)
    pad=6
    yA,yB,xA,xB = ys.min()-pad, ys.max()+pad, xs.min()-pad, xs.max()+pad
    a = a[yA:yB, xA:xB]
    print(name, a.shape)
    np.save(name+".npy", a)
    col = 0 if kind=="black" else 255
    rgba = np.zeros(a.shape+(4,),np.uint8); rgba[...,:3]=col; rgba[...,3]=(a*255).astype(np.uint8)
    Image.fromarray(rgba).save(name+"_raw.png")
cut(490,850,235,440,"black","black")
cut(945,1310,265,460,"white","white")
