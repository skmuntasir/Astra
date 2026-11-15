"""
GPU validation of the black-hole shader (raw WebGL2, no three): runs the REAL GLSL in headless Chromium and reads float records back.
  python3 tests/bh_gpu.py            (needs: esbuild [node_modules/.bin or /opt/npm-tools], playwright for python + a Chromium)
Checks: shadow radius (spin 0) vs 3*sqrt(3), photon-orbit closest approach vs 3, Kerr shadow edges vs the Bardeen curve, GPU-vs-CPU agreement per pixel,
disc inner edge vs ISCO, frame time. Also writes PNGs of the traced image into /tmp/bh_out (for eyeballing; tone-mapped on the CPU side).
HONEST NOTE: software GL (SwiftShader) in a sandbox: correctness only; frame times are NOT real-GPU numbers.
"""
import json, math, os, subprocess, sys, threading, http.server, socketserver, functools, shutil
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = '/tmp/bh_out'; os.makedirs(OUT, exist_ok=True)
esb = next((p for p in [os.path.join(ROOT, 'node_modules/.bin/esbuild'), '/opt/npm-tools/node_modules/.bin/esbuild', shutil.which('esbuild')] if p and os.path.exists(p)), None)
bundle = os.path.join(OUT, 'page.js')
subprocess.check_call([esb, os.path.join(ROOT, 'tests/bh/page.ts'), '--bundle', '--format=iife', '--outfile=' + bundle, '--log-level=warning'])
open(os.path.join(OUT, 'index.html'), 'w').write('<html><body><script src="page.js"></script></body></html>')

class H(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = path.split('?')[0]
        if path.startswith('/__out/'): return os.path.join(OUT, path[7:])
        return os.path.join(ROOT, 'public', path.lstrip('/'))
    def log_message(self, *a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), H); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()

fails = 0; checks = 0
def ok(name, cond, info=''):
    global fails, checks
    checks += 1; fails += 0 if cond else 1
    print(('PASS  ' if cond else 'FAIL  ') + name + (('   ' + info) if info else ''))

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page()
    errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'http://127.0.0.1:{port}/__out/index.html')
    info = pg.evaluate(f"window.bh.init('/textures/milkyway_2k.jpg','/textures/bh_disc_noise_2k.png')")
    print('GL:', info)
    R = lambda cfg: pg.evaluate('(c) => window.bh.render(c)', cfg)
    import numpy as np

    # ---------------- 1. Schwarzschild shadow radius (area of captured pixels)
    W = 256; r0 = 1000.0; bc = 3 * math.sqrt(3); alpha = math.sqrt(1 - 2 / r0)
    ang = math.asin(bc * alpha / r0); tanh = 0.013
    res = R(dict(w=W, h=W, spin=0, r0=r0, mu0=0.3, tanHalf=[tanh, tanh], disc=False, debug=1, eps=0.07, maxSteps=500))
    d = np.array(res['data']).reshape(W, W, 4)
    kind = d[..., 0]
    cap = (kind == 1) | (kind == 4)
    area = cap.sum(); rpx = math.sqrt(area / math.pi)
    want = math.tan(ang) / tanh * (W / 2)
    ok('GPU shadow radius, spin 0 (area of captured pixels) vs 3*sqrt(3) GM/c^2 [observer r0=1000]', abs(rpx / want - 1) < 0.005, f'{rpx:.3f} px vs analytic {want:.3f} px ({(rpx / want - 1) * 100:+.3f} %)')
    ok('no WebGL error', res['err'] == 0, str(res['err']))
    print(f'      frame (256x256, 500 steps max) {res["ms"]:.0f} ms on SOFTWARE GL (not a GPU number)')
    # photon orbit: closest approach of escaped pixels adjacent to the shadow
    esc = (kind == 2)
    yy, xx = np.mgrid[0:W, 0:W]; rr = np.hypot(xx - (W - 1) / 2, yy - (W - 1) / 2)
    # closest approach of every escaped pixel vs the exact Schwarzschild periapsis for its impact parameter (root of 1/b^2 = u^2 (1 - 2u));
    # near the shadow edge that periapsis tends to the photon orbit r = 3 GM/c^2, so this tests the 3 GM/c^2 value without needing a sub-pixel ring
    ndc = np.hypot((xx + 0.5) / W * 2 - 1, (yy + 0.5) / W * 2 - 1) * tanh
    bimp = r0 * np.tan(np.arctan(ndc)) / alpha  # sin(angle) = b*alpha/r0  ->  b = r0*sin(angle)/alpha
    bimp = r0 * np.sin(np.arctan(ndc)) / alpha
    def peri(b):
        lo_, hi_ = 3.0, 1e4
        for _ in range(100):
            m = 0.5 * (lo_ + hi_); u = 1 / m
            if u * u * (1 - 2 * u) < 1 / (b * b): hi_ = m
            else: lo_ = m
        return 0.5 * (lo_ + hi_)
    sel = np.where(esc & (bimp < 12))
    pr_ = np.array([peri(bimp[y_, x_]) for y_, x_ in zip(*sel)]); gr_ = d[..., 1][sel]
    ok('closest approach of escaped rays (b < 12) equals the exact periapsis, max relative difference < 1 %', np.max(np.abs(gr_ / pr_ - 1)) < 0.01, f'max {np.max(np.abs(gr_ / pr_ - 1)) * 100:.3f} %')
    near_edge = esc & (rr < rpx + 0.6)
    ok('rays within 0.6 px of the shadow edge come within 3.1 GM/c^2 of the hole (photon orbit = 3)', d[..., 1][near_edge].min() < 3.1, f'closest {d[..., 1][near_edge].min():.3f}')
    ok('no pixel inside the shadow is escaped / none outside is captured (clean edge)', (rr[cap].max() < rpx + 2) and (rr[esc].min() > rpx - 2), f'cap max r {rr[cap].max():.1f}, esc min r {rr[esc].min():.1f}, radius {rpx:.1f}')

    # ---------------- 2. Kerr shadow edges along beta = 0, equatorial observer
    import subprocess as sp
    for a in [0.5, 0.9, 0.998]:
        edges = json.loads(sp.check_output(['node', '-e', '''
const {shadowCurve}=require("/tmp/bh_out/kerr_cjs.js");const c=shadowCurve(%f,Math.PI/2,20000);console.log(JSON.stringify([c[0][0],c[c.length-1][0]]))''' % a]).decode()) if os.path.exists('/tmp/bh_out/kerr_cjs.js') else None
        if edges is None:
            sp.check_call([esb, os.path.join(ROOT, 'src/lib/bh/kerr.ts'), '--bundle', '--format=cjs', '--outfile=/tmp/bh_out/kerr_cjs.js', '--log-level=warning'])
            edges = json.loads(sp.check_output(['node', '-e', '''
const {shadowCurve}=require("/tmp/bh_out/kerr_cjs.js");const c=shadowCurve(%f,Math.PI/2,20000);console.log(JSON.stringify([c[0][0],c[c.length-1][0]]))''' % a]).decode())
        lo, hi = min(edges), max(edges)
        Wx, Hy = 2048, 4; tx = 10.0 / 2000.0  # half-width 10 r_g at r0 = 2000
        res = R(dict(w=Wx, h=Hy, spin=a, r0=2000.0, mu0=1e-5, tanHalf=[tx, tx * Hy / Wx], disc=False, debug=1, eps=0.07, maxSteps=600))
        dd = np.array(res['data']).reshape(Hy, Wx, 4)[Hy // 2, :, 0]
        c = np.where((dd == 1) | (dd == 4))[0]
        # pixel -> alpha: alpha = r0 * tan(angle) with angle = atan(ndc*tanHalf) ~ small
        px2a = lambda x: 2000.0 * ((x + 0.5) / Wx * 2 - 1) * tx
        gl_, gr_ = px2a(c.min() - 0.5), px2a(c.max() + 0.5)
        tolL = 0.05 if a > 0.99 else 0.02  # a = 0.998: rays at the edge wind many times at r ~ 1.07 and exhaust the 600-step budget (marked black): known limit, see docs/BLACKHOLE.md
        ok(f'GPU Kerr shadow a={a}: left edge alpha vs Bardeen {lo:.4f} (tolerance {tolL})', abs(gl_ - lo) < tolL, f'{gl_:.4f}')
        ok(f'GPU Kerr shadow a={a}: right edge alpha vs Bardeen {hi:.4f}', abs(gr_ - hi) < 0.02, f'{gr_:.4f}')
        ok(f'GPU Kerr shadow a={a}: centre shifted to +alpha ({0.5 * (gl_ + gr_):.3f})', 0.5 * (gl_ + gr_) > 0.4)

    # ---------------- 3. GPU vs CPU, per pixel
    def cmp(name, cfg, kind_min=0.99, sky_p99=1.0e-3):
        global fails
        r = pg.evaluate('(c) => window.bh.compare(c)', cfg)
        print(f'      {name}: {r["n"]} px, kind agree {r["agree"]}/{r["n"]}, escaped {r["bothEsc"]}, disc {r["bothDisc"]}; sky dir median {r["skyMedian"]*1e3:.4f} p99 {r["skyP99"]*1e3:.4f} max {r["skyMax"]*1e3:.3f} mrad; rHit rel median {r["rMedian"]:.2e} p99 {r["rP99"]:.2e}; g rel median {r["gMedian"]:.2e} p99 {r["gP99"]:.2e}')
        print('      sky error by closest approach (mrad: median / p99 / max):', {k: (v['n'], round(v['median']*1e3,4), round(v['p99']*1e3,4), round(v['max']*1e3,3)) for k, v in r['bands'].items()})
        if r['disagree']: print('      disagreements (first):', r['disagree'])
        ok(f'{name}: GPU and CPU agree on capture/escape/disc for >= {kind_min*100:.0f} % of pixels', r['agree'] / r['n'] >= kind_min, f'{r["agree"] / r["n"] * 100:.2f} %')
        pix = 2 * cfg['tanHalf'][1] / cfg['h']  # angular size of one pixel
        if r['bothEsc']: ok(f'{name}: lensed sky direction, p99 GPU-CPU difference < half a pixel ({pix*500:.2f} mrad); median {r["skyMedian"]*1e3:.4f}, max {r["skyMax"]*1e3:.1f} mrad (a few rays within float32 resolution of the pole)', r['skyP99'] < 0.5 * pix, f'p99 {r["skyP99"]*1e3:.3f} mrad')
        if r['bothDisc']: ok(f'{name}: disc hit radius and g-factor agree (99th percentile < 1e-3)', r['rP99'] < 1e-3 and r['gP99'] < 1e-3, f'r {r["rP99"]:.2e}, g {r["gP99"]:.2e}')
        return r
    cmp('Kerr a=0.9, i=75 deg, r0=60 (disc on)', dict(w=96, h=96, spin=0.9, r0=60.0, mu0=math.cos(math.radians(75)), tanHalf=[0.45, 0.45], debug=0, rOut=30.0, eps=0.1, maxSteps=400))
    cmp('Kerr a=0.998, i=17 deg, r0=2000 (M87-like, disc on)', dict(w=96, h=96, spin=0.998, r0=2000.0, mu0=math.cos(math.radians(17)), tanHalf=[0.0105, 0.0105], debug=0, rOut=40.0, eps=0.1, maxSteps=400))
    cmp('Schwarzschild i=88 deg, r0=25 (inside the lensing zone)', dict(w=96, h=96, spin=0.0, r0=25.0, mu0=math.cos(math.radians(88)), tanHalf=[0.6, 0.6], debug=0, rOut=20.0, eps=0.1, maxSteps=400), kind_min=0.98)

    # ---------------- 4. disc inner edge = ISCO (face-on, minimum hit radius over the whole image)
    for a, want_in in [(0.0, 6.0), (0.5, 4.233), (0.9, 2.3209), (0.998, 1.2370)]:
        res = R(dict(w=192, h=192, spin=a, r0=500.0, mu0=0.99999, tanHalf=[0.04, 0.04], debug=1, rOut=30.0, eps=0.07, maxSteps=500))
        dd = np.array(res['data']).reshape(192, 192, 4)
        hit = dd[..., 0] == 3
        rmin = dd[..., 2][hit].min() if hit.any() else float('nan')
        ok(f'face-on disc: smallest radius seen on the disc = ISCO(a={a}) = {want_in}', abs(rmin / want_in - 1) < 0.02, f'{rmin:.4f}')

    # ---------------- 5. pictures
    def pic(name, cfg):
        res = R(cfg); w, h = cfg['w'], cfg['h']
        a = np.array(res['data']).reshape(h, w, 4)[::-1, :, :3].clip(0, None)
        L = a @ np.array([0.2126, 0.7152, 0.0722]); Lt = L * (1 + L / 9) / (1 + L); s = np.where(L > 1e-8, Lt / np.maximum(L, 1e-8), 1)
        o = a * s[..., None]; m = o.max(-1, keepdims=True); o = np.where(m > 1, o / np.maximum(m, 1e-8), o)
        srgb = np.where(o <= 0.0031308, 12.92 * o, 1.055 * np.power(o, 1 / 2.4) - 0.055)
        from PIL import Image
        Image.fromarray((srgb.clip(0, 1) * 255).astype('uint8')).save(f'{OUT}/{name}.png')
        print(f'      wrote {OUT}/{name}.png  ({res["ms"]:.0f} ms software GL)')
    pic('m87_i17_a09', dict(w=640, h=640, spin=0.9, r0=2000.0, mu0=math.cos(math.radians(17)), tanHalf=[0.0105, 0.0105], debug=0, rOut=40.0, tmax=7000, jet=True, eps=0.07, maxSteps=500, horizon=0.0))
    pic('a09_i75', dict(w=800, h=450, spin=0.9, r0=70.0, mu0=math.cos(math.radians(80)), tanHalf=[0.34 * 16 / 9 * 0.9, 0.34 * 0.9], debug=0, rOut=30.0, tmax=7000, eps=0.07, maxSteps=500))
    pic('a0_i80', dict(w=800, h=450, spin=0.0, r0=70.0, mu0=math.cos(math.radians(80)), tanHalf=[0.34 * 16 / 9 * 0.9, 0.34 * 0.9], debug=0, rOut=30.0, tmax=7000, eps=0.07, maxSteps=500))
    pic('a0998_i80', dict(w=800, h=450, spin=0.998, r0=70.0, mu0=math.cos(math.radians(80)), tanHalf=[0.34 * 16 / 9 * 0.9, 0.34 * 0.9], debug=0, rOut=30.0, tmax=7000, eps=0.07, maxSteps=500))
    # ---------------- 6. temporal accumulation + present shaders compile and behave
    at = pg.evaluate('() => window.bhAccum()')
    ok('accumulation shader: with no history the output equals the current sample', at['noHistory'] < 1e-5, f"{at['noHistory']:.2e}")
    ok('accumulation shader: history equal to current is a fixed point', at['sameHistory'] < 1e-5, f"{at['sameHistory']:.2e}")
    ok('accumulation shader: an inconsistent history (0.9 vs current 0.2) is clamped back to the neighbourhood (no ghosting)', abs(at['clamped'] - 0.2) < 0.02, f"{at['clamped']:.3f}")
    ok('present (tone-map) shader compiles', at['err'] == 0)
    ok('no console / page errors', not errs, '; '.join(errs[:3]))
    b.close()
print(f'\n{"ALL PASSED" if fails == 0 else str(fails) + " FAILED"} ({checks} checks)')
sys.exit(1 if fails else 0)
