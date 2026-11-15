"""Look-development renders of the black hole (real Kerr shader, raw WebGL2, software GL in headless Chromium). Writes PNGs to /tmp/bh_look:
physical (old defaults) vs cinematic (warm orange, damped Doppler colour) at the Interstellar-like edge-on view and at the journey's M87 view (17 deg).
Usage: python3 tests/bh_look.py [tmax exposure hue beam]   Software GL: a picture, not a performance number."""
import math, os, subprocess, sys, threading, http.server, socketserver, shutil
import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = '/tmp/bh_look'; os.makedirs(OUT, exist_ok=True)
esb = next(p for p in [os.path.join(ROOT, 'node_modules/.bin/esbuild'), '/opt/npm-tools/node_modules/.bin/esbuild', shutil.which('esbuild')] if p and os.path.exists(p))
subprocess.check_call([esb, os.path.join(ROOT, 'tests/bh/page.ts'), '--bundle', '--format=iife', '--outfile=' + OUT + '/page.js', '--log-level=warning'])
open(OUT + '/index.html', 'w').write('<html><body><script src="page.js"></script></body></html>')
class H(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = path.split('?')[0]
        return os.path.join(OUT, path[7:]) if path.startswith('/__out/') else os.path.join(ROOT, 'public', path.lstrip('/'))
    def log_message(self, *a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), H); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
TM, EX, HUE, BEAM = (float(x) for x in sys.argv[1:5]) if len(sys.argv) >= 5 else (3300, 6.0, 0.35, 0.5)

def tone(a):  # the app's present shader (luminance filmic curve, hue kept) + sRGB
    a = a.clip(0, None); L = a @ np.array([0.2126, 0.7152, 0.0722]); Lt = L * (1 + L / 9) / (1 + L); s = np.where(L > 1e-8, Lt / np.maximum(L, 1e-8), 1)
    o = a * s[..., None]; m = o.max(-1, keepdims=True); o = np.where(m > 1, o / np.maximum(m, 1e-8), o)
    return (np.where(o <= 0.0031308, 12.92 * o, 1.055 * np.power(o, 1 / 2.4) - 0.055).clip(0, 1) * 255).astype('uint8')

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(); pg.goto(f'http://127.0.0.1:{port}/__out/index.html')
    print(pg.evaluate("window.bh.init('/textures/milkyway_2k.jpg','/textures/bh_disc_noise_2k.png')"))
    def pic(cfg):
        r = pg.evaluate('(c) => window.bh.render(c)', cfg); w, h = cfg['w'], cfg['h']
        return tone(np.array(r['data']).reshape(h, w, 4)[::-1, :, :3])
    views = {
      'edgeon': dict(w=640, h=360, spin=0.9, r0=90.0, mu0=math.cos(math.radians(84)), tanHalf=[0.13 * 16 / 9, 0.13], debug=0, rOut=24.0, skyGain=0.12, eps=0.07, maxSteps=500, time=0),
      'm87_17': dict(w=420, h=420, spin=0.9, r0=2000.0, mu0=math.cos(math.radians(17)), tanHalf=[0.0105, 0.0105], debug=0, rOut=20.0, eps=0.07, maxSteps=500, time=0),
    }
    for name, v in views.items():
        old = pic({**v, 'tmax': 5200, 'exposure': 1.1, 'hue': 1, **({'skyGain': 0.3} if name == 'm87_17' else {})})
        new = pic({**v, 'tmax': TM, 'exposure': EX, 'hue': HUE, 'beam': BEAM, **({'skyGain': 0.3} if name == 'm87_17' else {})})
        Image.fromarray(np.concatenate([old, np.full((old.shape[0], 6, 3), 255, 'uint8'), new], 1)).save(f'{OUT}/{name}_old_new.png')
        Image.fromarray(new).save(f'{OUT}/{name}_new.png')
        print('wrote', f'{OUT}/{name}_old_new.png', 'new mean RGB', new.reshape(-1, 3).mean(0).round(1))
    b.close()
