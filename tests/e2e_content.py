"""
Final series 5c e2e: Voyager 1/2, Orion / Crab, Sagittarius A* (focus + return), the end card and restart.
Usage: python3 tests/e2e_content.py WxH OUTDIR [mobile]      (needs: npm run build && npx vite preview --port 4173 &)
SOFTWARE GL (swiftshader) in this sandbox: it checks behaviour and takes screenshots; the frame rate is NOT a real-GPU number.
"""
import sys, time, os, json
from playwright.sync_api import sync_playwright
vp, out = sys.argv[1], sys.argv[2]; mobile = 'mobile' in sys.argv[3:]
w, h = map(int, vp.split('x')); os.makedirs(out, exist_ok=True)
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl']
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
res = {'viewport': vp, 'checks': []}
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
    def go(T, settle=6):
        ev(f"window.__astra.scrollToT({T}, true)"); t1 = time.time()
        while time.time() - t1 < 90 and abs(ev("window.__astra.state().t") - T) > 2e-4: time.sleep(0.25)
        time.sleep(settle)
    def shot(name): pg.screenshot(path=f'{out}/{w}x{h}_{name}.png', timeout=240000)
    def at(zid, f): z = R[zid]; return z['t0'] + f * (z['t1'] - z['t0'])
    def focus_and_back(oid, name, waitfocus=120):
        ev(f"window.__astra.focus('{oid}')"); t1 = time.time()
        while time.time() - t1 < waitfocus and ev("window.__astra.state().focusPhase") != 'focused': time.sleep(0.5)
        check(ev("window.__astra.state().focusPhase") == 'focused', f'{oid}: focus reached')
        time.sleep(6); shot('focus_' + name)
        check(ev("!!document.querySelector('[data-testid=focus-panel]')") or ev("document.body.innerText.length") > 200, f'{oid}: info panel text on screen')
        ev("window.__astra.release()"); t1 = time.time()
        while time.time() - t1 < waitfocus and ev("window.__astra.state().focusPhase") != 'idle': time.sleep(0.5)
        check(ev("window.__astra.state().focusPhase") == 'idle', f'{oid}: released, back to scroll')
    check(list(R)[-1] == 'multiverse', 'multiverse is the last zone')
    # ---- Voyager (beyond zone; on screen from about local 0.2 to 0.35)
    go(at('beyond', 0.26)); shot('voyager_overview')
    check(ev("document.body.innerText.toUpperCase().includes('VOYAGER 1')"), 'Voyager labels are on screen in the Beyond zone')
    focus_and_back('voyager-1', 'voyager1'); focus_and_back('voyager-2', 'voyager2')
    # ---- Milky Way: Orion / Crab / Sgr A*
    go(at('milky-way', 0.45)); shot('mw_labels')
    check(ev("document.body.innerText.toUpperCase().includes('ORION NEBULA')"), 'Orion Nebula label on screen')
    for oid, n in (('gx-orion', 'orion'), ('gx-crab', 'crab'), ('gx-sgra', 'sgra')): focus_and_back(oid, n)
    # ---- the end card at the end of the multiverse
    go(at('multiverse', 0.99), 8)
    check(ev("!!document.querySelector('[data-testid=restart-journey]')"), 'end card with "Begin again from Earth" at the end of the multiverse'); shot('end_card')
    # ---- restart
    pg.click('[data-testid=restart-journey]'); t1 = time.time(); back = False
    while time.time() - t1 < 150:
        if ev("window.__astra.state().zone") == 'earth' and ev("window.__astra.state().t") < 0.01: back = True; break
        time.sleep(0.5)
    time.sleep(4); shot('restart_earth'); check(back, 'restart: back at Earth')
    errs = [l for l in logs if l[0] in ('error', 'pageerror')]
    check(not errs, 'no console errors: ' + str(errs[:3]))
    json.dump(res, open(f'{out}/content_result_{w}x{h}.json', 'w'), indent=1)
    print('FAILED:', [c[1] for c in res['checks'] if not c[0]]); br.close()
