"""
Screenshots of the infall branch. Usage: python3 tests/shots_infall.py OUTDIR WxH t1,t2,...  (t = 0..1 of the BRANCH)  [q=low|medium|high] [reduced]
Enters the branch through the real hook (enterBranch) from the end of the approach with the choice gate avoided (the gate is only opened by the zone at local >= 0.94).
"""
import sys, time, os
from playwright.sync_api import sync_playwright
out, vp, rng = sys.argv[1], sys.argv[2], sys.argv[3]
w, h = map(int, vp.split('x')); TL = [float(x) for x in rng.split(',')]
q = None; reduced = False
for x in sys.argv[4:]:
    if x.startswith('q='): q = x[2:]
    if x == 'reduced': reduced = True
os.makedirs(out, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl']
with sync_playwright() as p:
    br = p.chromium.launch(args=ARGS)
    ctx = br.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1)
    if q: ctx.add_init_script("localStorage.setItem('astra.quality','%s')" % q)
    pg = ctx.new_page(); logs = []
    pg.on('console', lambda m: logs.append((m.type, m.text))); pg.on('pageerror', lambda e: logs.append(('pageerror', str(e))))
    pg.goto('http://localhost:4173/')
    t0 = time.time()
    while time.time() - t0 < 400:
        if pg.evaluate("window.__astra && window.__astra.state().phase") == 'ready': break
        time.sleep(0.3)
    time.sleep(2)
    if reduced: pg.click('[data-testid=motion]'); time.sleep(1)
    ap = [r for r in pg.evaluate("window.__astra.ranges('main')") if r['id'] == 'bh-approach'][0]
    Tg = ap['t0'] + 0.9 * (ap['t1'] - ap['t0'])   # inside the final hold (below the gate threshold)
    pg.evaluate(f"window.__astra.scrollToT({Tg}, true)"); time.sleep(10)
    pg.evaluate("window.__astra.enterBranch('infall')"); time.sleep(3)
    for T in TL:
        fn = f"{out}/{w}x{h}_{T:.4f}.png"
        if os.path.exists(fn): continue
        pg.evaluate(f"window.__astra.scrollToT({T}, true)")
        t1 = time.time()
        while time.time() - t1 < 40:
            st = pg.evaluate("(()=>{const s=window.__astra.state();return [s.t,s.timelineId]})()")
            if abs(st[0] - T) < 2e-4: break
            time.sleep(0.25)
        time.sleep(1.5)
        pg.screenshot(path=fn, timeout=240000)
        print(fn, 'zone', pg.evaluate("window.__astra.state().zone"), 'r=%.4f' % pg.evaluate("window.__astra.bh.radius()"))
    print('console issues:', [l for l in logs if l[0] in ('error', 'pageerror')][:8])
    br.close()
