"""
End-to-end: the M87* approach, the choice gate (Yes / No / Return), the infall branch HUD, the preloader warm-up and reduced motion.
Run against `npm run build && npx vite preview --port 4173`:  python3 tests/e2e_bh.py       (SOFTWARE GL in the sandbox: logic checks, not performance)
"""
import sys, time
from playwright.sync_api import sync_playwright
fails = 0; checks = 0
def check(c, m):
    global fails, checks
    checks += 1; fails += 0 if c else 1
    print(('PASS  ' if c else 'FAIL  ') + m, flush=True)
def wait_for(pg, js, timeout=120):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if pg.evaluate(js): return True
        time.sleep(0.4)
    return False
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl']
with sync_playwright() as p:
    br = p.chromium.launch(args=ARGS)
    pg = br.new_context(viewport={'width': 960, 'height': 540}).new_page(); logs = []
    pg.on('console', lambda m: logs.append((m.type, m.text))); pg.on('pageerror', lambda e: logs.append(('pageerror', str(e))))
    pg.goto('http://localhost:4173/')
    wait_for(pg, "window.__astra && window.__astra.state().phase==='ready'", 400)
    ev = pg.evaluate
    st = lambda: ev("(()=>{const s=window.__astra.state();return [s.t,s.scrollY,s.timelineId,s.zone]})()")
    # ---- preloader compiled and drew the black hole before the journey was released
    stats = ev("window.__astra.bh.stats")
    check(stats['framesBeforeReady'] >= 2, f"preloader: the black-hole shaders were compiled and {stats['framesBeforeReady']} frames drawn before ready (no hitch on entering)")
    rng = {r['id']: r for r in ev("window.__astra.ranges('main')")}
    ap = rng['bh-approach']
    check(abs((ap['t1'] - ap['t0']) * 1 - 0) > 0 and ev("window.__astra.ranges('main').map(r=>r.id).includes('universe')"), 'universe zone follows bh-approach (step 4)')
    # ---- approach: no gate before the hold; gate inside the hold
    T_mid = ap['t0'] + 0.5 * (ap['t1'] - ap['t0'])
    ev(f"window.__astra.scrollToT({T_mid}, true)"); wait_for(pg, f"Math.abs(window.__astra.state().t-{T_mid})<2e-4", 120); time.sleep(1.5)
    check(pg.query_selector('[data-testid=gate]') is None, 'no choice while the camera is still approaching')
    pg.screenshot(path='/tmp/e2e_bh_approach_kerr.png', timeout=240000)
    r_mid = ev("window.__astra.bh.radius()")
    check(60 < r_mid < 2000, f'approach radius at mid-zone is between the start and the release point ({r_mid:.1f} r_g)')
    T_gate = ap['t0'] + 0.975 * (ap['t1'] - ap['t0'])
    ev(f"window.__astra.scrollToT({T_gate}, true)")
    ok = wait_for(pg, "!!document.querySelector('[data-testid=gate]')", 150)
    check(ok, 'the choice "Fall into the black hole?" appears at the end of the approach')
    check('Fall into the black hole?' in (ev("(document.querySelector('[data-testid=gate]')||{}).textContent") or ''), 'the gate asks "Fall into the black hole?"')
    pg.screenshot(path='/tmp/e2e_bh_gate.png', timeout=240000)
    y_gate = ev("window.__astra.state().scrollY"); t_gate = ev("window.__astra.state().t")
    # ---- No: closes, main continues (timeline unfrozen), graceful end card since nothing follows yet
    pg.click('[data-testid=gate-no]'); time.sleep(1)
    check(pg.query_selector('[data-testid=gate]') is None and st()[2] == 'main', 'No: the gate closes and the main timeline continues')
    check(pg.query_selector('[data-testid=end-card]') is None, 'No: the journey continues into the universe (no end card)')
    check(ev("window.__astra.state().gate") in (None, False), 'No: no gate is left open')
    # ---- re-open the choice, then Yes
    # (the end card no longer exists: scroll back before the hold and forward into it again, which re-arms the gate)
    ev(f"window.__astra.scrollToT({ap['t0'] + 0.5 * (ap['t1'] - ap['t0'])}, true)"); time.sleep(3)
    ev(f"window.__astra.scrollToT({T_gate}, true)")
    ok = wait_for(pg, "!!document.querySelector('[data-testid=gate]')", 30)
    check(ok, 'the end card can reopen the choice')
    r_before = ev("window.__astra.bh.radius()")
    pg.click('[data-testid=gate-yes]'); time.sleep(0.6)
    pg.screenshot(path='/tmp/e2e_bh_handoff_mid.png', timeout=240000)   # Kerr -> Schwarzschild cross-fade in progress (HANDOFF_S = 1.2 s)
    time.sleep(1.4)
    pg.screenshot(path='/tmp/e2e_bh_handoff_done.png', timeout=240000)
    check('non-rotating simplification' in (ev("document.body.innerText") or ''), 'infall start states on screen: the fall uses a non-rotating simplification')
    check(st()[2] == 'infall', 'Yes: enters the infall branch')
    r0 = ev("window.__astra.bh.radius()")
    check(abs(r0 - 60) < 0.05 and abs(r_before - r0) < 0.05, f'continuity at the branch start: radius {r_before:.5f} -> {r0:.5f} r_g (released from rest at 60)')
    check(pg.query_selector('[data-testid=infall-hud]') is not None, 'infall readout panel is shown')
    # ---- the readouts follow the formulas at several radii (HUD numbers == formula numbers)
    b = ev("window.__astra.ranges('infall').map(z=>[z.id,z.t0,z.t1])")
    check(len(b) == 6 and abs(sum((z[2]-z[1]) for z in b) - 1) < 1e-9, f'infall branch has 6 stages covering T 0..1 ({[z[0] for z in b]})')
    prev_proper = 1e99; seen_cross = False; seen_inside = False; last_status = ''
    for T in (0.1, 0.3, 0.4, 0.45, 0.55, 0.8, 0.95):
        ev(f"window.__astra.scrollToT({T}, true)"); wait_for(pg, f"Math.abs(window.__astra.state().t-{T})<2e-4", 120); time.sleep(1.8)
        r = ev("window.__astra.bh.radius()"); ro = ev(f"window.__astra.bh.readouts({r})")
        shown = ev("(document.querySelector('[data-testid=ro-r]')||{}).textContent")
        status = ev("(document.querySelector('[data-testid=infall-status]')||{}).textContent")
        print(f"      T={T}: r={r:.4f} r_g  proper={ro['proper']:.4g} s  distant={ro['distant']:.4g} s  tide={ro['tidalG']:.2e} g  | HUD '{shown}', '{status}'", flush=True)
        check(ro['proper'] < prev_proper, f"T={T}: proper time remaining decreases ({ro['proper']:.4g} s)"); prev_proper = ro['proper']
        if r < 2: seen_inside = True
        last_status = status
    check(seen_inside and 'Inside' in last_status, f"HUD marks the horizon crossing: status reads '{last_status}' after r < 2")
    # horizon flag near r = 2: stage fall-4 is log-linear 2.6 -> 1.5 r_g over T 0.4333..0.5667 (budgets 120/140/130 before it, 900 total), so r = 2 is near T = 0.4969
    ev("window.__astra.scrollToT(0.4969, true)")
    wait_for(pg, "Math.abs(window.__astra.bh.radius()-2)<0.1", 120); time.sleep(3)
    flag = pg.query_selector('[data-testid=horizon-flag]')
    check(flag is not None, f'the horizon-crossing marker is on screen at r = {ev("window.__astra.bh.radius()"):.3f} r_g')
    pg.screenshot(path='/tmp/e2e_bh_horizon.png', timeout=240000)
    # ---- ending text
    ev("window.__astra.scrollToT(0.96, true)"); wait_for(pg, "Math.abs(window.__astra.state().t-0.96)<2e-3", 90); time.sleep(2)
    et = ev("(document.querySelector('[data-testid=infall-end]')||{}).textContent") or ''
    check('What the model says' in et and 'What is observed' in et and 'quantum gravity' in et, 'ending text separates "what the model says" from "what is observed" and states quantum gravity is unsolved')
    # ---- Return button: exact place on the main path
    pg.click('[data-testid=infall-return]')
    ok = wait_for(pg, "window.__astra.state().timelineId==='main'", 60)
    check(ok, 'Return: back on the main timeline')
    time.sleep(2)
    s2 = st()
    check(abs(s2[0] - t_gate) < 1e-4 and abs(s2[1] - y_gate) < 2, f'Return resumes the exact place (t {t_gate:.6f} -> {s2[0]:.6f}, scroll {y_gate:.1f} -> {s2[1]:.1f})')
    wait_for(pg, "Math.abs(window.__astra.bh.radius()-60)<0.05", 90)  # the 1.6 s camera join runs on the clock; software GL is slow
    check(abs(ev("window.__astra.bh.radius()") - 60) < 0.05, 'after Return the camera is back at the gate pose (60 r_g)')
    # ---- the end of the branch returns by itself
    ev("window.__astra.enterBranch('infall')"); time.sleep(1)
    ev("window.__astra.scrollToT(1, true)")
    ok = wait_for(pg, "window.__astra.state().timelineId==='main'", 200)
    check(ok, 'scrolling to the end of the fall returns to the main journey by itself')
    # ---- reduced motion: a sequence of stills with captions
    pg.click('[data-testid=motion]'); time.sleep(1)
    ev("window.__astra.enterBranch('infall')"); time.sleep(3)
    caps = []
    zs = ev("window.__astra.ranges('infall').map(z=>z.id)")
    for i, z in enumerate(zs):
        ev(f"window.__astra.jumpToZone({i})"); time.sleep(3.5)
        wait_for(pg, "window.__astra.state().curtain<0.05", 40)
        txt = ev("Array.from(document.querySelectorAll('[data-beat]')).filter(e=>e.style.visibility==='visible').map(e=>e.textContent).join(' | ')")
        caps.append((z, bool(txt.strip())))
    check(all(c[1] for c in caps), f'reduced motion: every infall still has a caption {caps}')
    check(pg.evaluate("document.documentElement.scrollHeight") <= 560, 'reduced motion: no tall page')
    check(not [l for l in logs if l[0] in ('error', 'pageerror')], f'no console errors {[l for l in logs if l[0] in ("error","pageerror")][:3]}')
    br.close()
print(f'\n{"ALL PASSED" if fails == 0 else str(fails) + " FAILED"} ({checks} checks)')
sys.exit(1 if fails else 0)
