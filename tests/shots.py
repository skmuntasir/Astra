"""
Screenshot sweep. Usage: python3 tests/shots.py OUTDIR WxH t0:t1:step [zone=...]  (t values are 0..1 of the WHOLE journey)
e.g. python3 tests/shots.py /tmp/s 1440x900 0:0.1:0.02
Waits for the preloader, then for each T: scrollToT(T, true), waits until the smoothed t has settled and 3 frames rendered.
"""
import sys, time, os, json
from playwright.sync_api import sync_playwright
out, vp, rng = sys.argv[1], sys.argv[2], sys.argv[3]
w, h = map(int, vp.split('x'))
if ',' in rng:
    TL = [float(x) for x in rng.split(',')]
else:
    a, b, s = map(float, rng.split(':'))
    TL = [a + i * s for i in range(int(round((b - a) / s)) + 1)]
q = None
mobile = False
for x in sys.argv[4:]:
    if x.startswith('q='): q = x[2:]
    if x == 'mobile': mobile = True
os.makedirs(out, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl']
with sync_playwright() as p:
    br = p.chromium.launch(args=ARGS)
    UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    ctx = br.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1, **({'user_agent': UA, 'is_mobile': True, 'has_touch': True} if mobile else {}))
    if q: ctx.add_init_script("localStorage.setItem('astra.quality','%s')" % q)
    pg = ctx.new_page()
    logs = []
    pg.on('console', lambda m: logs.append((m.type, m.text)))
    pg.on('pageerror', lambda e: logs.append(('pageerror', str(e))))
    pg.goto('http://localhost:4173/')
    t0 = time.time()
    while time.time() - t0 < 400:
        if pg.evaluate("window.__astra && window.__astra.state().phase") == 'ready': break
        time.sleep(0.3)
    time.sleep(2.5)
    print('ready after %.0fs' % (time.time() - t0))
    for T in TL:
        if os.path.exists(f"{out}/{w}x{h}_{T:.4f}.png"): continue
        pg.evaluate(f"window.__astra.scrollToT({T}, true)")
        t1 = time.time()
        while time.time() - t1 < 40:
            st = pg.evaluate("(()=>{const s=window.__astra.state();return [s.t,s.target]})()")
            if abs(st[0] - T) < 2e-4: break
            time.sleep(0.25)
        time.sleep(1.2)
        fn = f"{out}/{w}x{h}_{T:.4f}.png"
        pg.screenshot(path=fn, timeout=240000)
        print(fn, 'zone', pg.evaluate("window.__astra.state().zone"), 't=%.4f' % st[0])
    errs = [l for l in logs if l[0] in ('error', 'pageerror') or 'warn' in l[0]]
    print('console issues:', errs[:8])
    br.close()
