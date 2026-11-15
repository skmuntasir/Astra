"""
End-to-end run of the MAIN path through the universe + multiverse (final series step 4).
Usage: python3 tests/e2e_universe.py WxH OUTDIR [mobile]
Walks every zone (jump-cut samples), answers the black-hole gate with "No, continue", checks labels / end card / restart, measures the black-hole -> universe seam
(frame-to-frame difference) and rAF frame rate. SOFTWARE GL (swiftshader) in this sandbox: the frame rate is NOT a real-GPU number.
"""
import sys, time, os, json
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops, ImageStat
vp, out = sys.argv[1], sys.argv[2]; mobile = 'mobile' in sys.argv[3:]
w, h = map(int, vp.split('x')); os.makedirs(out, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl']
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
res = {'viewport': vp, 'checks': [], 'frames': {}}
def check(c, msg):
    res['checks'].append([bool(c), msg]); print(('PASS ' if c else 'FAIL ') + msg, flush=True)
with sync_playwright() as p:
    br = p.chromium.launch(args=ARGS)
    ctx = br.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1, **({'user_agent': UA, 'is_mobile': True, 'has_touch': True} if mobile else {}))
    pg = ctx.new_page(); logs = []
    pg.on('console', lambda m: logs.append((m.type, m.text))); pg.on('pageerror', lambda e: logs.append(('pageerror', str(e))))
    ev = pg.evaluate
    pg.goto('http://localhost:4173/'); t0 = time.time()
    while time.time() - t0 < 600 and ev("window.__astra && window.__astra.state().phase") != 'ready': time.sleep(0.4)
    print('ready after %.0fs' % (time.time() - t0)); time.sleep(2)
    R = {r['id']: r for r in ev("window.__astra.ranges('main')")}
    ids = list(R.keys())
    check(ids[-2:] == ['universe', 'multiverse'], 'main path ends universe -> multiverse: ' + ' > '.join(ids))
    check(round((R['universe']['t1'] - R['universe']['t0']) * 3650) == 400 and round((R['multiverse']['t1'] - R['multiverse']['t0']) * 3650) == 300, 'budgets 400 + 300 svh')
    def go(T, settle=1.5):
        ev(f"window.__astra.scrollToT({T}, true)"); t1 = time.time()
        while time.time() - t1 < 60 and abs(ev("window.__astra.state().t") - T) > 2e-4: time.sleep(0.25)
        time.sleep(settle)
    def shot(name):
        fn = f"{out}/{w}x{h}_{name}.png"; pg.screenshot(path=fn, timeout=240000); return fn
    # ---- walk the earlier zones (a sample in each) up to the gate
    for zid in ids[:8]:
        z = R[zid]; go(z['t0'] + 0.5 * (z['t1'] - z['t0'])); shot('z_' + zid)
        check(ev("window.__astra.state().zone") == zid, f'zone {zid} reached')
    ap = R['bh-approach']; go(ap['t0'] + 0.3 * (ap['t1'] - ap['t0'])); shot('z_bh-approach')
    go(ap['t0'] + 0.975 * (ap['t1'] - ap['t0']), 3)
    ok = False
    for _ in range(120):
        if ev("!!document.querySelector('[data-testid=gate]')"): ok = True; break
        time.sleep(1)
    check(ok, 'the black-hole gate opens in the hold'); shot('gate')
    pg.click('[data-testid=gate-no]'); time.sleep(1)
    check(ev("!document.querySelector('[data-testid=end-card]')"), 'No: no end card (the journey continues)')
    check(ev("document.querySelector('[data-testid=hypothesis-label]')") is None, 'no hypothesis label outside the multiverse')
    # ---- the seam: frames around the end of bh-approach / start of universe
    seam = R['universe']['t0']; prev = None; diffs = []
    for i, d in enumerate([-0.0016, -0.0008, 0.0, 0.0008, 0.0016, 0.0032, 0.0064]):
        go(seam + d, 2.5); fn = shot('seam_%d' % i); im = Image.open(fn).convert('L').resize((96, 54))
        if prev is not None: diffs.append(round(ImageStat.Stat(ImageChops.difference(im, prev)).mean[0], 2))
        prev = im
    res['seam_frame_diffs'] = diffs; print('seam frame diffs (mean abs grey, 0-255):', diffs)
    check(max(diffs) < 40, 'seam: no frame-to-frame jump larger than 40/255 mean grey (hole dissolves, no cut)')
    # ---- universe + multiverse samples
    U, M = R['universe'], R['multiverse']
    for f in (0.06, 0.2, 0.3, 0.45, 0.62, 0.77, 0.93):
        T = U['t0'] + f * (U['t1'] - U['t0']); go(T); shot('uni_%02d' % int(f * 100))
        check(ev("window.__astra.state().zone") == 'universe', f'universe sample {f}')
        check(ev("document.querySelector('[data-testid=hypothesis-label]')") is None, f'universe {f}: hypothesis label not shown')
    for f in (0.1, 0.4, 0.7, 0.97):
        T = M['t0'] + f * (M['t1'] - M['t0']); go(T, 2.5); shot('mv_%02d' % int(f * 100))
        check(ev("(document.querySelector('[data-testid=hypothesis-label]')||{}).textContent") == 'Hypothesis. Not observed.', f'multiverse {f}: "Hypothesis. Not observed." on screen')
    check(ev("!document.querySelector('[data-testid=restart-journey]')"), 'no end card at the end of the multiverse (the timeline zone follows)')
    go(M['t1'] + 0.0001, 2.5)
    check(ev("document.querySelector('[data-testid=hypothesis-label]')") is None, 'the hypothesis chip is gone as soon as the timeline zone starts')
    # ---- frame rate in the universe (software GL)
    go(U['t0'] + 0.45 * (U['t1'] - U['t0']), 2)
    ev("window.__fr=0; (function f(){window.__fr++; requestAnimationFrame(f)})()"); time.sleep(8); fr = ev("window.__fr")
    res['fps_universe_software_gl'] = round(fr / 8, 2); print('rAF fps at universe 0.45 (SOFTWARE GL):', res['fps_universe_software_gl'])
    # ---- way back to the start
    MV = R['multiverse']; go(MV['t0'] + 0.99 * (MV['t1'] - MV['t0']), 3)
    check(ev("!!document.querySelector('[data-testid=restart-journey]')"), 'end card with "Begin again" at the end of the multiverse (the last zone)')
    pg.click('[data-testid=restart-journey]'); t1 = time.time(); back = False
    while time.time() - t1 < 120:
        if ev("window.__astra.state().zone") == 'earth' and ev("window.__astra.state().t") < 0.01: back = True; break
        time.sleep(0.5)
    time.sleep(3); shot('restart_earth')
    check(back, 'restart: back at Earth')
    errs = [l for l in logs if l[0] in ('error', 'pageerror')]
    check(not errs, 'no console errors: ' + str(errs[:3]))
    json.dump(res, open(f'{out}/result_{w}x{h}.json', 'w'), indent=1)
    print('FAILED:', [c[1] for c in res['checks'] if not c[0]]); br.close()
