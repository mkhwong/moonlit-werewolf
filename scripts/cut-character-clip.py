# Cut the white backdrop out of a character clip (flood-fill from the frame edges, so white INSIDE the
# outline — fur, beards, armour — stays), soften the edge, and save a looping transparent animated WebP.
import sys, subprocess, numpy as np
from scipy import ndimage
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
S = int(sys.argv[3]) if len(sys.argv) > 3 else 400
FPS = int(sys.argv[4]) if len(sys.argv) > 4 else 15
w, h = map(int, subprocess.run(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','csv=p=0',src],capture_output=True,text=True).stdout.strip().split(','))
sc = S / max(w, h); W, H = round(w*sc) // 2 * 2, round(h*sc) // 2 * 2
raw = subprocess.run(['ffmpeg','-v','error','-i',src,'-vf',f'fps={FPS},scale={W}:{H}:flags=lanczos','-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True).stdout
frames = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3)
ring = np.ones((3,3), bool)
out = []
for f in frames:
    fl = f.astype(np.int16)
    mn, mx = fl.min(2), fl.max(2)
    light = (mn > 222) & (mx - mn < 30)                       # near-white, unsaturated
    lab, n = ndimage.label(light)
    edge = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    bg = np.isin(lab, edge[edge > 0])
    # enclosed pockets of backdrop (between an arm and the body, inside a bow string…): flat pure white,
    # unlike white fur/beards which always carry some shading
    ref = np.median(mn[bg]) if bg.any() else 252
    sizes = ndimage.sum(np.ones_like(lab), lab, index=np.arange(1, n + 1))
    for i in np.nonzero(sizes >= 30)[0] + 1:
        if i in edge: continue
        m = lab == i
        v = mn[m]
        if np.percentile(v, 10) >= ref - 6 and v.mean() >= ref - 2.5:
            bg |= m
    # also eat faint grey drop-shadow halos connected to the backdrop
    halo = (mn > 196) & (mx - mn < 24)
    lab2, _ = ndimage.label(halo)
    bg |= np.isin(lab2, np.unique(lab2[bg])[1:]) if bg.any() else False
    alpha = np.where(bg, 0, 255).astype(np.float32)
    # soft edge: pixels next to the backdrop get alpha from how un-white they are
    near = ndimage.binary_dilation(bg, ring, 2) & ~bg
    soft = np.clip((255 - mn.astype(np.float32)) / 70.0, 0, 1) * 255
    alpha[near] = np.minimum(alpha[near], soft[near])
    alpha = ndimage.gaussian_filter(alpha, 0.6)
    a = alpha / 255.0
    # un-premultiply the white fringe so edges don't glow on the dark background
    rgb = fl.astype(np.float32)
    with np.errstate(divide='ignore', invalid='ignore'):
        rgb = np.where(a[..., None] > 0.02, (rgb - 255 * (1 - a[..., None])) / np.maximum(a[..., None], 0.02), 0)
    rgba = np.dstack([np.clip(rgb, 0, 255), alpha]).astype(np.uint8)
    # Same canvas shape as the still art (576×581), character centred and standing on the bottom edge,
    # so nothing that sizes the still art ever stretches the clip.
    CW, CH = S, round(S * 581 / 576)
    canvas = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
    canvas.paste(Image.fromarray(rgba, 'RGBA'), ((CW - W) // 2, CH - H))
    out.append(canvas)
out[0].save(dst, save_all=True, append_images=out[1:], duration=round(1000 / FPS), loop=0, quality=int(sys.argv[5]) if len(sys.argv) > 5 else 72, method=4, lossless=False, minimize_size=True, allow_mixed=False)
print(dst, len(out), 'frames', out[0].size)
