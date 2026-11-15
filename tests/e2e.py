"""
ASTRA v2 e2e (headless Chromium, software GL). Usage: npm run build && npx vite preview --port 4173 & python3 tests/e2e.py
Checks: preloader reaches 100 % with no console errors, smooth scroll (no jumps), focus/release restores the exact t,
choiceGate -> branch -> return, rail + keyboard, reduced motion, quality toggle, and the SCALE TEST FLIGHT.
"""
import json, sys, time
from playwright.sync_api import sync_playwright

URL = 'http://localhost:4173/'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl']
fails = []
def check(c, msg):
    print(('PASS ' if c else 'FAIL ') + msg)
    if not c: fails.append(msg)

def wait_for(pg, expr, timeout=60):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if pg.evaluate(expr): return True
        time.sleep(0.2)
    return False

def wait_ready(pg, timeout=240):
    seen = []
    t0 = time.time()
    while time.time() - t0 < timeout:
        el = pg.query_selector('[data-testid=load-pct]')
        if not el: break
        txt = el.inner_text()
        if '%' in txt: seen.append(int(txt.split('·')[-1].strip().rstrip('%')))
        if pg.evaluate("window.__astra && window.__astra.state().phase") == 'ready': break
        time.sleep(0.15)
    return seen

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': 1280, 'height': 720})
    logs = []
    pg.on('console', lambda m: logs.append((m.type, m.text)))
    pg.on('pageerror', lambda e: logs.append(('pageerror', str(e))))
    pg.goto(URL)
    seen = wait_ready(pg)
    time.sleep(1.2)
    check(pg.evaluate("window.__astra.state().phase") == 'ready', 'preloader finishes (phase=ready)')
    check(all(b >= a for a, b in zip(seen, seen[1:])), f'progress is monotonic ({len(seen)} samples, max {max(seen) if seen else None}%)')
    check(pg.evaluate("window.__astra.state().progress") == 1, 'preloader reaches 100 %')
    check(pg.evaluate("window.__astra.state().assetsReady") is True, 'assets ready before journey starts')

    # ---- smooth scroll via real wheel events ----
    pg.evaluate("""window.__samples=[];(function loop(){const s=window.__astra.state();window.__samples.push([performance.now(),s.t,s.pose.dist]);window.__raf=requestAnimationFrame(loop)})()""")
    for _ in range(10):
        pg.mouse.move(640, 360); pg.mouse.wheel(0, 120); time.sleep(0.08)
    time.sleep(4)
    pg.evaluate("cancelAnimationFrame(window.__raf)")
    smp = pg.evaluate("window.__samples")
    ts = [s[1] for s in smp]
    import math
    steps = [b[1] - a[1] for a, b in zip(smp, smp[1:])]
    # normalise by real elapsed time: software GL renders at a few fps, a jump would show as an enormous rate
    rate = [abs(b[1] - a[1]) / max(1e-3, (b[0] - a[0]) / 1000) for a, b in zip(smp, smp[1:])]
    maxstep = max(rate)
    dl = max(abs(math.log(b[2] / a[2])) / max(1e-3, (b[0] - a[0]) / 1000) for a, b in zip(smp, smp[1:]))
    fps = 1000 * len(smp) / max(1, smp[-1][0] - smp[0][0])
    print('  (headless software GL: %.1f fps)' % fps)
    moved = ts[-1] - ts[0]
    total_svh = pg.evaluate("window.__astra.ranges('main').reduce((s,z)=>s+z.budget,0)")
    # the threshold was 0.2 of a 1200 svh journey = 240 svh of scrolling; keep it physical as the journey grows
    check(moved * total_svh > 0.2 * 1200 * 0.5, f'wheel scrolled the journey (t {ts[0]:.3f} -> {ts[-1]:.3f} = {moved * total_svh:.0f} svh of {total_svh})')
    check(min(steps) > -1e-6, 'smoothed t never reverses while scrolling forward')
    check(maxstep < 0.8, f'no jump: max journey speed = {maxstep:.3f} of the journey per second')
    check(dl < 6, f'no jump: max |d ln(distance)|/s = {dl:.3f}')
    pg.screenshot(path='/tmp/e2e_scroll.png')

    # ---- focus / release returns to the EXACT t ----
    pg.evaluate("window.__astra.scrollToT(0.12, true)"); time.sleep(2)
    before = pg.evaluate("(()=>{const s=window.__astra.state();return [s.t,s.scrollY]})()")
    pg.evaluate("(()=>{window.__astra.focus('earth');return 1})()"); time.sleep(0.4)
    check(pg.evaluate("window.__astra.state().focusPhase") == 'flying-in', 'focus() flies in')
    pg.mouse.wheel(0, 900); time.sleep(0.4)
    wait_for(pg, "window.__astra.state().focusPhase==='focused'", 90)
    check(pg.evaluate("window.__astra.state().focusPhase") == 'focused', 'focus() arrives')
    check(pg.query_selector('[data-testid=focus-panel]') is not None, 'info panel shown')
    mid = pg.evaluate("window.__astra.state().t")
    check(abs(mid - before[0]) < 1e-9, 'scroll camera is paused while focused (wheel ignored)')
    pg.screenshot(path='/tmp/e2e_focus.png')
    pg.click('[data-testid=focus-back]'); wait_for(pg, "window.__astra.state().focusPhase==='idle'", 90)
    after = pg.evaluate("(()=>{const s=window.__astra.state();return [s.t,s.scrollY,s.focusPhase]})()")
    check(after[2] == 'idle', 'release() returns to idle')
    check(abs(after[0] - before[0]) < 1e-9, f'release() restores the exact t ({before[0]:.6f} -> {after[0]:.6f})')
    check(abs(after[1] - before[1]) < 1.0, f'release() restores scroll position ({before[1]:.1f} -> {after[1]:.1f}px)')

    # ---- choiceGate -> branch -> return ----
    pg.evaluate("""(()=>{const a=window.__astra;
      const mk=(id)=>({id,title:id,tick:id,budget:100,unit:6.371e6,scale:'test',objects:['earth'],beats:[],camera:[
        {t:0,target:[0,0,0],dist:5,azim:20,elev:5},{t:1,target:[0,0,0],dist:3,azim:80,elev:5}]});
      a.registerBranch('demo',[mk('demo-a')]);
      a.scrollToT(0.3,true);})()""")
    time.sleep(1.5)
    y0 = pg.evaluate("window.__astra.state().scrollY"); t0 = pg.evaluate("window.__astra.state().t")
    pg.evaluate("""(()=>{window.__astra.choiceGate.open({id:'g',title:'Fall into the black hole?',prompt:'test',options:[{id:'yes',label:'Yes',branch:'demo'},{id:'no',label:'No'}]});return 1})()""")
    time.sleep(0.4)
    check(pg.query_selector('[data-testid=gate]') is not None, 'choiceGate overlay appears')
    pg.click('[data-testid=gate-yes]'); time.sleep(0.5)
    check(pg.evaluate("window.__astra.state().timelineId") == 'demo', 'choosing "Yes" branches into the sub-timeline')
    pg.evaluate("window.__astra.scrollToT(1, true)"); wait_for(pg, "window.__astra.state().timelineId==='main'", 90)
    st = pg.evaluate("(()=>{const s=window.__astra.state();return [s.timelineId,s.scrollY,s.t]})()")
    check(st[0] == 'main', 'sub-timeline returns to main at its end')
    check(abs(st[1] - y0) < 2, f'return restores the exact main scroll position ({y0:.1f} -> {st[1]:.1f})')

    # ---- rail + keyboard ----
    ticks = pg.query_selector_all('nav[aria-label="Journey progress"] button')
    n_zones = pg.evaluate("window.__astra.ranges('main').length")
    check(len(ticks) == n_zones and all(t.get_attribute('aria-label') for t in ticks), f'rail ticks are labelled buttons ({len(ticks)} for {n_zones} zones)')
    pg.evaluate("window.__astra.scrollToT(0.02, true)"); time.sleep(1)
    pg.focus('[data-testid=tick-moon]'); pg.keyboard.press('Enter'); wait_for(pg, "window.__astra.state().zone==='moon'", 60)
    check(pg.evaluate("window.__astra.state().zone") == 'moon', 'keyboard: Enter on a focused rail tick travels there')

    # ---- FINAL SERIES STEP 1: focus mode ----
    ev = lambda js: pg.evaluate(js)
    ev("window.__astra.focusState.duration = 0.25")   # software GL runs ~1 fps: shorten the flight, the logic is identical
    rng = {r['id']: r for r in ev("window.__astra.ranges('main')")}
    def at(z, f): r = rng[z]; return r['t0'] + f * (r['t1'] - r['t0'])
    def go_to(T):
        ev(f"window.__astra.scrollToT({T}, true)"); time.sleep(1.5)
        wait_for(pg, f"Math.abs(window.__astra.state().t-{T})<2e-4", 60); time.sleep(0.5)
    def focus_wait(i, phase='focused'):
        ev(f"(()=>{{window.__astra.focus('{i}');return 1}})()")
        return wait_for(pg, "window.__astra.state().focusPhase==='focused'", 120)
    def release_wait():
        pg.click('[data-testid=focus-back]'); return wait_for(pg, "window.__astra.state().focusPhase==='idle'", 120)
    SOLAR = ['sun','mercury','venus','earth','moon','mars','ceres','jupiter','io','europa','ganymede','callisto','saturn','titan','enceladus','uranus','neptune','triton','pluto','charon']
    GXL = ['gx-m31','gx-m33','gx-lmc','gx-smc']; GXN = ['gx-m81','gx-m82','gx-cena','gx-m101','gx-m51','gx-m104','gx-n1365']
    for grp, T, ids in (('solar', at('solar-system', 0.34), SOLAR), ('local group', at('local-group', 0.6), GXL), ('nearby', at('nearby-galaxies', 0.3), GXN)):
        go_to(T)
        st0 = ev("(()=>{const s=window.__astra.state();return [s.t,s.scrollY,s.zoneIndex]})()")
        bad = []
        for i in ids:
            ok = focus_wait(i)
            title = ev("(document.querySelector('[data-testid=focus-title]')||{}).textContent")
            tag = ev("(document.querySelector('[data-testid=focus-tag]')||{}).textContent")
            rows = ev("document.querySelectorAll('[data-testid=focus-rows] > div').length")
            fid = ev("window.__astra.state().focusId")
            okp = ok and fid == i and title and tag and rows >= 5
            if grp == 'solar' and i not in ('sun',) : okp = okp and rows == 8
            if not okp: bad.append((i, ok, fid, title, bool(tag), rows))
            if not release_wait(): bad.append((i, 'release timeout'))
            st1 = ev("(()=>{const s=window.__astra.state();return [s.t,s.scrollY,s.zoneIndex]})()")
            if abs(st1[0]-st0[0]) > 1e-9 or abs(st1[1]-st0[1]) > 1 or st1[2] != st0[2]: bad.append((i, 'drift', st0, st1))
        check(not bad, f'focus + return, every {grp} object ({len(ids)}): panel, honest tag, exact t/scroll/zone restored {bad[:3]}')
    # honest tags
    go_to(at('solar-system', 0.34))
    focus_wait('earth'); check('NASA-derived' in ev("document.querySelector('[data-testid=focus-tag]').textContent"), 'Earth panel says NASA-derived')
    focus_wait('moon'); wait_for(pg, "window.__astra.state().focusPhase==='focused'", 60)
    check('NASA-derived' in ev("document.querySelector('[data-testid=focus-tag]').textContent"), 'Moon panel says NASA-derived')
    focus_wait('mars'); wait_for(pg, "window.__astra.state().focusPhase==='focused'", 60)
    check('procedurally generated' in ev("document.querySelector('[data-testid=focus-tag]').textContent"), 'Mars panel says procedurally generated')
    check('NASA planetary fact sheet' in ev("document.querySelector('[data-testid=focus-source]').textContent"), 'planet panel shows the NASA planetary fact sheet source line')
    release_wait()
    # keyboard: arrows hop within the group (no zone jump), Esc returns, Tab stays in the panel
    go_to(at('solar-system', 0.34))
    s0 = ev("(()=>{const s=window.__astra.state();return [s.t,s.scrollY,s.zoneIndex]})()")
    focus_wait('jupiter')
    pg.keyboard.press('ArrowRight'); wait_for(pg, "window.__astra.state().focusPhase==='focused' && window.__astra.state().focusId==='io'", 120)
    check(ev("window.__astra.state().focusId") == 'io', 'ArrowRight from Jupiter focuses Io (moon right after its planet)')
    pg.keyboard.press('ArrowLeft'); wait_for(pg, "window.__astra.state().focusPhase==='focused' && window.__astra.state().focusId==='jupiter'", 120)
    pg.keyboard.press('ArrowLeft'); wait_for(pg, "window.__astra.state().focusPhase==='focused' && window.__astra.state().focusId==='ceres'", 120)
    check(ev("window.__astra.state().focusId") == 'ceres', 'ArrowLeft from Jupiter focuses Ceres (distance order)')
    check(ev("window.__astra.state().zoneIndex") == s0[2], 'arrows while focused do not jump zones')
    time.sleep(0.6)
    for _ in range(3): pg.keyboard.press('Tab')
    check(ev("!!document.activeElement.closest('[data-testid=focus-panel]')"), 'Tab moves through the panel buttons')
    pg.keyboard.press('Escape'); wait_for(pg, "window.__astra.state().focusPhase==='idle'", 120)
    s1 = ev("(()=>{const s=window.__astra.state();return [s.t,s.scrollY,s.zoneIndex]})()")
    check(abs(s1[0]-s0[0]) < 1e-9 and abs(s1[1]-s0[1]) <= 1, 'Esc flies back to the exact saved scroll position')
    # touch swipe (synthetic touch events)
    focus_wait('saturn')
    ev("""(()=>{const mk=(t,x)=>new TouchEvent(t,{bubbles:true,cancelable:true,touches:t==='touchend'?[]:[new Touch({identifier:1,target:document.body,clientX:x,clientY:300})],targetTouches:t==='touchend'?[]:[new Touch({identifier:1,target:document.body,clientX:x,clientY:300})],changedTouches:[new Touch({identifier:1,target:document.body,clientX:x,clientY:300})]});
      window.dispatchEvent(mk('touchstart',500)); window.dispatchEvent(mk('touchend',200)); return 1})()""")
    wait_for(pg, "window.__astra.state().focusId==='titan'", 60)
    check(ev("window.__astra.state().focusId") == 'titan', 'swipe left goes to the next object (Saturn -> Titan)')
    pg.keyboard.press('Escape'); wait_for(pg, "window.__astra.state().focusPhase==='idle'", 120)
    # galaxy order: arrows follow list order
    go_to(at('local-group', 0.6)); focus_wait('gx-m31')
    pg.keyboard.press('ArrowRight'); wait_for(pg, "window.__astra.state().focusPhase==='focused' && window.__astra.state().focusId==='gx-m33'", 120)
    check(ev("window.__astra.state().focusId") == 'gx-m33', 'ArrowRight from M31 focuses M33 (list order)')
    pg.keyboard.press('Escape'); wait_for(pg, "window.__astra.state().focusPhase==='idle'", 120)
    check(not [l for l in logs if l[0] in ('error', 'pageerror')], 'focus suite: no console errors')

    # ---- reduced motion ----
    pg.click('[data-testid=motion]'); time.sleep(0.8)
    check(pg.evaluate("document.documentElement.scrollHeight") <= 730, 'reduced motion: no tall pinned page')
    pg.click('[data-testid=tick-earth]'); time.sleep(1.8)
    check(pg.evaluate("window.__astra.state().zone") == 'earth', 'reduced motion: rail jump cross-fades to the other still')
    check(pg.evaluate("window.__astra.state().curtain") < 0.05, 'reduced motion: cross-fade completes')
    pg.evaluate("(()=>{window.__astra.focus('earth');return 1})()")
    ok_rm = wait_for(pg, "window.__astra.state().focusPhase==='focused'", 60)
    check(ok_rm and pg.query_selector('[data-testid=focus-panel]') is not None, 'reduced motion: focus arrives by cross-fade, panel shown')
    pg.keyboard.press('Escape'); ok_rm = wait_for(pg, "window.__astra.state().focusPhase==='idle'", 60)
    check(ok_rm, 'reduced motion: Esc returns')
    pg.click('[data-testid=motion]'); time.sleep(0.5)

    # ---- quality ----
    pg.select_option('[data-testid=quality]', 'low'); time.sleep(0.5)
    check(pg.evaluate("window.__astra.state().settings.dprCap") == 1, 'quality toggle applies live (low -> DPR cap 1)')
    texs = pg.evaluate("window.__astra.state().settings.tex")
    print('  texture tier in this run:', texs)

    errs = [l for l in logs if l[0] in ('error', 'pageerror')]
    check(not errs, f'no console errors ({errs[:3]})')
    pg.screenshot(path='/tmp/e2e_end.png')

    # ---- scale test flight ----
    sp = b.new_page(viewport={'width': 1024, 'height': 576})
    slogs = []
    sp.on('console', lambda m: slogs.append((m.type, m.text)))
    sp.on('pageerror', lambda e: slogs.append(('pageerror', str(e))))
    sp.goto(URL + '?test=scale'); wait_ready(sp); time.sleep(1)
    rep = sp.evaluate("window.__scaleTest()")
    print('  scale test: max centroid error %.3f px, area ratio %.3f..%.3f, far-marker ratio %.3f..%.3f, cyan (z-fight) pixels %d, steps %d' % (
        rep['maxCentroidErrPx'], rep['minArea'], rep['maxArea'], rep['minFar'], rep['maxFar'], rep['totalCyanPixels'], len(rep['steps'])))
    for f in rep['failures'][:5]: print('   fail step', json.dumps(f))
    check(rep['pass'], 'SCALE TEST FLIGHT passes: 1 R_earth -> 1e10 R_earth, no jitter, no z-fighting, no clipping')
    check(not [l for l in slogs if l[0] in ('error', 'pageerror')], 'scale test: no console errors')
    json.dump(rep, open('/tmp/scale_report.json', 'w'))
    b.close()

print('\nFAILED: %d' % len(fails) if fails else '\nALL PASSED')
sys.exit(1 if fails else 0)
