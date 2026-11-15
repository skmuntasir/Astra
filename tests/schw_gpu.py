"""
GPU validation of the Schwarzschild infall shader (src/lib/bh/schwShader.ts): real GLSL in raw WebGL2 vs the float64 CPU tracer, per pixel.
  python3 tests/schw_gpu.py     (needs esbuild + playwright + Chromium). SOFTWARE GL when run in the sandbox: correctness only, not speed.
"""
import json, math, os, subprocess, sys, threading, http.server, socketserver, shutil
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = '/tmp/schw_out'; os.makedirs(OUT, exist_ok=True)
esb = next((p for p in [os.path.join(ROOT, 'node_modules/.bin/esbuild'), '/opt/npm-tools/node_modules/.bin/esbuild', shutil.which('esbuild')] if p and os.path.exists(p)), None)
subprocess.check_call([esb, os.path.join(ROOT, 'tests/bh/schwPage.ts'), '--bundle', '--format=iife', '--outfile=' + OUT + '/page.js', '--log-level=warning'])
open(OUT + '/index.html', 'w').write('<html><body><script src="page.js"></script></body></html>')
class H(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = path.split('?')[0]
        return os.path.join(OUT, path[7:]) if path.startswith('/__out/') else os.path.join(ROOT, 'public', path.lstrip('/'))
    def log_message(self, *a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), H); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
fails = 0; checks = 0
def ok(name, cond, info=''):
    global fails, checks
    checks += 1; fails += 0 if cond else 1
    print(('PASS  ' if cond else 'FAIL  ') + name + (('   ' + info) if info else ''))
def basis(mu, phi, yaw=0.0):
    s = math.sqrt(1 - mu * mu)
    er = [s * math.cos(phi), s * math.sin(phi), mu]; th = [mu * math.cos(phi), mu * math.sin(phi), -s]; ph = [-math.sin(phi), math.cos(phi), 0]
    # camera looks along -er (toward the hole); x right = ph, y up = -th... build cam->hole columns: x=ph, y=th_up, z(back)=er, rotated by yaw about y
    up = [-t for t in th]
    cy, sy = math.cos(yaw), math.sin(yaw)
    x = [cy * ph[i] + sy * er[i] for i in range(3)]; z = [-sy * ph[i] + cy * er[i] for i in range(3)]
    return er, x + up + z   # column-major mat3: x axis, y axis, z axis
fr = lambda ri, r: (math.sqrt(1 - 2 / ri), math.sqrt(max(0, 1 - 2 / ri) + 2 / r - 1))
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(); errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'http://127.0.0.1:{port}/__out/index.html')
    print('init:', pg.evaluate('window.schw.init()'))
    def cmp(name, r0, ri, mu, yaw, tan, w=72, h=72, **kw):
        er, rot = basis(mu, 0.4, yaw)
        Eo, P = (math.sqrt(1 - 2 / r0), 0.0) if ri is None else fr(ri, r0)
        r = pg.evaluate('(c)=>window.schw.compare(c)', dict(w=w, h=h, r0=r0, Eo=Eo, P=P, er=er, camRot=rot, tanHalf=[tan, tan], debug=0, eps=0.1, maxSteps=400, **kw))
        print(f"      {name}: kinds [cap {r['kinds'][1]}, esc {r['kinds'][2]}, disc {r['kinds'][3]}, lost {r['kinds'][4]}], sky med {r['skyMed']*1e3:.3f} p99 {r['skyP99']*1e3:.3f} max {r['skyMax']*1e3:.2f} mrad, r p99 {r['rP99']:.1e}, g p99 {r['gP99']:.1e}, {r['ms']:.0f} ms (software GL)")
        if r['bad']: print('      disagreements:', r['bad'])
        ok(f'{name}: GPU/CPU agree on captured / escaped / disc for >= 99 % of pixels', r['agree'] / r['n'] >= 0.99, f"{100*r['agree']/r['n']:.2f} %")
        pix = 2 * tan / h
        if r['bothEsc']: ok(f'{name}: sky direction p99 below half a pixel', r['skyP99'] < 0.5 * pix, f"{r['skyP99']*1e3:.3f} mrad vs {pix*500:.3f}")
        tol = 1e-2 if r0 < 0.5 else 2e-3  # deep inside the step is tiny and float32 loses digits: documented in BLACKHOLE.md
        if r['bothDisc']: ok(f'{name}: disc radius and g p99 < {tol:g}', r['rP99'] < tol and r['gP99'] < tol, f"r {r['rP99']:.1e} g {r['gP99']:.1e}")
        ok(f'{name}: no GL error', r['err'] == 0)
        return r
    cmp('static, r0=60, i=17 deg', 60.0, None, math.cos(math.radians(17)), 0.0, 0.32)
    cmp('faller from 60, r0=30, i=60 deg', 30.0, 60.0, math.cos(math.radians(60)), 0.0, 0.32)
    cmp('faller r0=6 (near the ISCO), looking 30 deg off the radial', 6.0, 60.0, 0.5, 0.5, 0.6)
    cmp('faller r0=2.5 (just outside the horizon)', 2.5, 60.0, 0.3, 0.0, 0.9)
    cmp('INSIDE the horizon r0=1.0, looking ahead', 1.0, 60.0, 0.3, 0.0, 1.2)
    cmp('INSIDE r0=0.2, looking sideways (yaw 90 deg)', 0.2, 60.0, 0.3, math.pi / 2, 1.2)
    cmp('INSIDE r0=0.05, looking backwards (yaw 160 deg)', 0.05, 60.0, 0.3, math.radians(160), 1.2)
    ok('no console / page errors', not errs, '; '.join(errs[:3]))
    b.close()
print(f'\n{"ALL PASSED" if fails == 0 else str(fails) + " FAILED"} ({checks} checks)')
sys.exit(1 if fails else 0)
