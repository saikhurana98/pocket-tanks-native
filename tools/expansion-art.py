"""Build expansion HUD rows and projectile sprites from an installed PC copy."""
import json
import re
import sys
from pathlib import Path
from xml.etree import ElementTree
from PIL import Image

root = Path(__file__).resolve().parents[1]
art = root / "art"
source = Path(sys.argv[1])
data = json.loads((root / "engine/weapons.json").read_text())
weapdata = source / "weapdata"

def bank_xml(filename):
    buf = bytearray(v ^ (24 if i % 2 else 3) for i, v in enumerate(filename.read_bytes()))
    for i in range(0, len(buf) - 15, 16):
        for k in (0, 1, 5, 6):
            a, b = i + k, i + k + 8
            buf[a], buf[b] = buf[b], buf[a]
    return buf.decode("latin1")

def pc_bitmap(name):
    im = Image.open(weapdata / name)
    if im.mode == "P":
        mask = im.point(lambda i: 255 if i else 0, "L")
        im = im.convert("RGBA")
        im.putalpha(mask)
    else:
        im = im.convert("RGBA")
        im.putdata([(r,g,b,0 if (r,g,b)==(255,0,255) else a) for r,g,b,a in im.get_flattened_data()])
    return im

raw = (source / "art8.dat").read_bytes()
font = {}
for attrs in re.findall(r'<IMAGE name="mask_treb11_\d+" [^>]+/>', bank_xml(source / "art8.bbk")):
    a = ElementTree.fromstring(attrs).attrib
    code = int(a["name"].split("_")[-1])
    w, h, pitch, start = (int(a[k]) for k in ("width","height","pitch","dataOffset"))
    glyph = Image.new("L",(int(a["originalWidth"]),int(a["originalHeight"])))
    if w*h:
        lines = b"".join(raw[start+r*pitch:start+r*pitch+w] for r in range(h))
        glyph.paste(Image.frombytes("L",(w,h),lines),(int(a["xOffset"]),int(a["yOffset"])))
    font[chr(code)] = glyph

original = Image.open(art / "arsenal.png").convert("RGBA")
hud = Image.new("RGBA",(384,len(data)*24))
hud.paste(original.crop((0,0,384,60*24)))
widths = json.loads((art / "arsenal.json").read_text())[:60]
for i, weapon in enumerate(data[60:],60):
    y = i*24
    icon = pc_bitmap(weapon["icon"])
    hud.paste((0,0,0,255),(0,y,134,y+23))
    hud.alpha_composite(icon,(1,y+1))
    text = Image.new("L",(200,23))
    x = 0
    for ch in weapon["name"]:
        glyph = font.get(ch)
        if glyph is None:
            x += 4
        else:
            text.paste(glyph,(x,0))
            x += glyph.width
    bounds = text.getbbox()
    if not bounds: raise ValueError(weapon["name"])
    text = text.crop(bounds)
    if text.width>108: text=text.resize((108,text.height),Image.Resampling.LANCZOS)
    widths.append(text.width)
    for left,col in [(79-text.width//2,(255,255,255)),(140,(255,255,255)),(254,(255,255,0))]:
        sprite=Image.new("RGBA",text.size,col+(255,))
        sprite.putalpha(text)
        hud.alpha_composite(sprite,(left,y+(23-text.height)//2))
hud.save(art / "arsenal.png",optimize=True)
(art / "arsenal.json").write_text(json.dumps(widths,separators=(",",":"))+"\n")

frames={}
for weapon in data:
    for actor in weapon["actors"].values():
        if actor.get("blend") in ("TRANS","GAS","FOG"): continue
        for name in actor.get("animation",{}).get("frames",[]):
            if name not in frames: frames[name]=pc_bitmap(name)
rects={}
x=y=row=0
for name,im in frames.items():
    if x+im.width>1024:
        y+=row
        x=row=0
    rects[name]=[x,y,im.width,im.height]
    x+=im.width
    row=max(row,im.height)
sheet=Image.new("RGBA",(1024,y+row))
for name,im in frames.items(): sheet.paste(im,tuple(rects[name][:2]))
sheet.save(art/"animated-shells.png",optimize=True)
(art/"animated-shells.json").write_text(json.dumps(rects,separators=(",",":"))+"\n")
print(len(widths),"HUD rows and",len(frames),"distinct projectile frames")
