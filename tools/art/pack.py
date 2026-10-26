"""Packs the baked PNGs into WebP atlases + manifest.json for the game.
   python3 tools/art/pack.py day|dusk"""
import json, sys, os
from PIL import Image
mode = sys.argv[1]
SRC = f'/tmp/bake/{mode}'
DST = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'village', mode)
os.makedirs(DST, exist_ok=True)
raw = json.load(open(f'{SRC}/raw.json'))
sprites = raw['sprites']
MAXW = 4096
items = []
for key, s in sprites.items():
    if key == 'ground':
        continue
    im = Image.open(f"{SRC}/{s['file']}").convert('RGBA')
    bb = im.getbbox()  # trim transparent margins
    if not bb:
        continue
    im = im.crop(bb)
    items.append((key, s, im, bb))
# shelf packing, tallest first
items.sort(key=lambda t: -t[2].height)
atlases, cur, x, y, shelf = [], [], 0, 0, 0
out = {}
def flush():
    global cur
    if not cur: return
    h = max(yy + im.height for (_, _, im, xx, yy) in cur)
    A = Image.new('RGBA', (MAXW, h), (0, 0, 0, 0))
    for (_, _, im, xx, yy) in cur: A.paste(im, (xx, yy))
    name = f'atlas{len(atlases)}.webp'
    A.save(os.path.join(DST, name), 'WEBP', quality=90, method=6)
    atlases.append(name); cur = []
for key, s, im, bb in items:
    if x + im.width > MAXW: x, y, shelf = 0, y + shelf + 1, 0
    if y + im.height > 4096: flush(); x, y, shelf = 0, 0, 0
    cur.append((key, s, im, x, y))
    out[key] = {'a': len(atlases), 'sx': x, 'sy': y, 'w': im.width, 'h': im.height, 'x': s['x'] + bb[0], 'y': s['y'] + bb[1], 'd': round(s['depth'], 3)}
    for k in ('label', 'foot'):
        if s.get(k): out[key][k] = s[k]
    if s.get('glow'): out[key]['glow'] = s['glow']
    x += im.width + 1; shelf = max(shelf, im.height)
flush()
Image.open(f"{SRC}/{sprites['ground']['file']}").convert('RGB').save(os.path.join(DST, 'ground.webp'), 'WEBP', quality=86, method=6)
f = raw['frame']
L = raw['layout']
json.dump({'w': f['w'], 'h': f['h'], 'ppu': f['ppu'], 'stageLevels': L['STAGE_LEVELS'], 'homes': L['HOMES'], 'wallN': L['WALL_N'], 'wallKinds': L['KINDS'], 'atlases': atlases, 'sprites': out}, open(os.path.join(DST, 'manifest.json'), 'w'), separators=(',', ':'))
tot = sum(os.path.getsize(os.path.join(DST, n)) for n in os.listdir(DST))
print(mode, len(out), 'sprites', len(atlases), 'atlases', round(tot / 1e6, 2), 'MB')
