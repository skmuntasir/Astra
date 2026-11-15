"""
ASTRA step 5b e2e: sound button / hints / Journey menu / shareable link / reduced motion / console errors.

  python3 tests/e2e_experience.py            HARNESS mode (default): the REAL src/hud/Experience.tsx and the REAL engine core (store, journey, timeline,
                                             scroll, api) with stubbed zustand/lenis and fake zones, no WebGL. Needs only esbuild + playwright, no network.
  python3 tests/e2e_experience.py app        APP mode: the built app at http://localhost:4173 (npm run build && npx vite preview --port 4173 &), software GL.
Both modes run the same checks through a small uniform API (window.__h). APP mode adds the real gate / planets.
Audio QUALITY cannot be judged here: see tests/audio_levels.py for the numeric level / click checks.
"""
import json, subprocess, sys, threading, time, os, http.server, functools
from playwright.sync_api import sync_playwright

MODE = 'app' if 'app' in sys.argv[1:] else 'harness'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 4599
fails = []
def check(c, msg):
    print(('PASS ' if c else 'FAIL ') + msg)
    if not c: fails.append(msg)

if MODE == 'harness':
    subprocess.run([os.path.join(ROOT, 'tests/exp/build.sh')], check=True, stdout=subprocess.DEVNULL)
    os.makedirs('/tmp/exp_site', exist_ok=True)
    open('/tmp/exp_site/index.html', 'w').write('<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>body{margin:0;background:#02030a;color:#eee;font-family:sans-serif} .hud-chip{font-size:11px} .glass{background:#111} .sr-only{position:absolute;width:1px;height:1px;overflow:hidden} [data-testid=journey-menu]{width:min(560px,100%);max-height:92vh;overflow:auto;display:flex;flex-direction:column} [data-testid=journey-backdrop]{background:rgba(0,0,0,.6);z-index:44} .inset-0{inset:0} .items-center{align-items:center} .justify-center{justify-content:center} .pointer-events-none{pointer-events:none} .block{display:block} .flex{display:flex} .fixed{position:fixed} .astra-bob{animation:b 2s infinite} .astra-pulse{animation:p 2s infinite} @keyframes b{to{opacity:.4}} @keyframes p{to{opacity:0}}</style></head><body><div id="root"></div><script src="/exp_bundle.js"></script></body></html>')
    subprocess.run(['cp', '/tmp/exp_bundle.js', '/tmp/exp_site/exp_bundle.js'])
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory='/tmp/exp_site')
    h.log_message = lambda *a, **k: None
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a, **k): pass
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory='/tmp/exp_site'))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    BASE = f'http://127.0.0.1:{PORT}/'
else:
    BASE = 'http://localhost:4173/'

INIT = """
(() => {
  window.__ac = 0; const AC = window.AudioContext
  if (AC) { window.AudioContext = function (...a) { window.__ac++; return new AC(...a) }; window.AudioContext.prototype = AC.prototype }
  window.__rs = []; const rs = history.replaceState.bind(history); history.replaceState = (...a) => { window.__rs.push(performance.now()); return rs(...a) }
  window.__shared = null
})()
"""
APP_SHIM = """
(() => { const a = window.__astra; window.__h = {
  state: () => { const s = a.state(); return { t: s.t, zone: s.zone, zoneIndex: s.zoneIndex, focusPhase: s.focusPhase, focusId: s.focusId, timelineId: s.timelineId, gate: !!s.gate, phase: s.phase, motion: s.motion } },
  ranges: () => a.ranges('main'), jumpT: (T) => a.scrollToT(T, true), focus: (id) => { a.focus(id); return 1 }, release: () => { a.release(); return 1 },
  enterInfall: () => { a.enterBranch('infall'); return 1 }, wheelTo: null, planetOnScreen: () => {}, sound: a.sound } })()
"""

def open_page(ctx, hash_='', quiet=False):
    pg = ctx.new_page()
    pg.errors = []
    pg.on('pageerror', lambda e: pg.errors.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: pg.errors.append(m.text) if m.type == 'error' else None)
    pg.add_init_script(INIT)
    pg.goto(BASE + hash_)
    t0 = time.time()
    if MODE == 'app':
        while time.time() - t0 < 300:
            if pg.evaluate("!!(window.__astra && window.__astra.state().phase === 'ready')"): break
            time.sleep(0.3)
        pg.evaluate(APP_SHIM)
    else:
        while time.time() - t0 < 30:
            if pg.evaluate("!!(window.__h && window.__h.state().phase === 'ready')"): break
            time.sleep(0.1)
    time.sleep(1.6)  # loading screen fade + hint delay
    return pg

def H(pg, js): return pg.evaluate(f"window.__h.{js}")
def wait(pg, expr, to=20):
    t0 = time.time()
    while time.time() - t0 < to:
        if pg.evaluate(expr): return True
        time.sleep(0.1)
    return False
def at(pg, zone, p):
    r = next(z for z in H(pg, 'ranges()') if z['id'] == zone)
    return r['t0'] + p * (r['t1'] - r['t0'])
def goto_zone_pos(pg, zone, p):
    T = at(pg, zone, p); H(pg, f'jumpT({T})'); time.sleep(0.6); return T
def sound_state(pg): return pg.get_attribute('[data-testid=sound]', 'data-state')
def stored(pg, k): return pg.evaluate(f"localStorage.getItem('{k}')")

ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=document-user-activation-required'] if MODE == 'app' else ['--autoplay-policy=document-user-activation-required']
all_errors = []

with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    mk = lambda **kw: b.new_context(viewport={'width': 1280, 'height': 720}, **kw)

    # ============================================================== SOUND
    ctx = mk(); pg = open_page(ctx)
    check(pg.query_selector('[data-testid=sound]') is not None, 'Sound button is in the HUD')
    check(pg.get_attribute('[data-testid=sound]', 'aria-label') and 'M' in pg.get_attribute('[data-testid=sound]', 'aria-label'), 'Sound button has an accessible label that names the M key')
    check(pg.evaluate('window.__ac') == 0, 'NO AudioContext exists before a gesture (page loaded, scrolled by code)')
    H(pg, f'jumpT({at(pg, "moon", 0.3)})'); time.sleep(0.5)
    check(pg.evaluate('window.__ac') == 0, 'still none after the journey moved without a gesture')
    check(sound_state(pg) == 'pending' and stored(pg, 'astra.sound') is None, 'before the gesture: state "pending", nothing stored')
    pg.mouse.click(300, 400)  # a click on the page background = the first gesture
    check(wait(pg, 'window.__ac === 1', 5), 'the first click anywhere creates exactly one AudioContext')
    check(wait(pg, "document.querySelector('[data-testid=sound]').dataset.state === 'on'", 8), 'Sound button reads "on" once running')
    pg.keyboard.press('m'); time.sleep(0.4)
    check(sound_state(pg) == 'off' and stored(pg, 'astra.sound') == 'off', 'M mutes and the choice is stored ("off")')
    pg.reload(); time.sleep(2.2)
    pg.evaluate("window.__ac = 0") if False else None
    check(sound_state(pg) == 'off', 'after a reload the button is still "off" (choice remembered)')
    pg.mouse.click(300, 400); pg.keyboard.press('ArrowDown'); time.sleep(0.8)
    check(pg.evaluate('window.__ac') == 0, 'muted: a click and a key press do NOT start audio (no AudioContext at all)')
    pg.click('[data-testid=sound]')
    check(wait(pg, "document.querySelector('[data-testid=sound]').dataset.state === 'on'", 8) and stored(pg, 'astra.sound') == 'on', 'clicking the button turns it on and stores "on"')
    # tab hidden -> pauses, visible -> resumes
    pg.evaluate("Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'))"); time.sleep(0.4)
    check(sound_state(pg) != 'on', 'hidden tab: sound pauses')
    pg.evaluate("Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange'))")
    check(wait(pg, "document.querySelector('[data-testid=sound]').dataset.state === 'on'", 8), 'visible again: sound resumes (it was wanted)')
    pg.keyboard.press('m'); time.sleep(0.3)
    check(sound_state(pg) == 'off', 'M toggles from the keyboard')
    check(stored(pg, 'astra.sound') == 'off', 'and stores it')
    all_errors += pg.errors; ctx.close()

    # reduced motion: audio stays off until turned on
    ctx = mk(reduced_motion='reduce'); pg = open_page(ctx)
    pg.mouse.click(300, 400); pg.keyboard.press('ArrowDown'); time.sleep(0.8)
    check(pg.evaluate('window.__ac') == 0 and sound_state(pg) == 'off', 'reduced motion: no stored choice -> audio stays off, no AudioContext after clicks and keys')
    pg.click('[data-testid=sound]')
    check(wait(pg, "document.querySelector('[data-testid=sound]').dataset.state === 'on'", 8) and pg.evaluate('window.__ac') == 1, 'reduced motion: turning it on works')
    check(pg.query_selector('.astra-bob') is None, 'reduced motion: the scroll-hint chevron is not animated (or already gone)')
    all_errors += pg.errors; ctx.close()

    # ============================================================== HINTS
    ctx = mk(); pg = open_page(ctx)
    check(pg.get_attribute('[data-testid=hint-scroll]', 'data-visible') == 'true', '"Scroll to begin" shows on the hero')
    check('astra-bob' in (pg.get_attribute('[data-testid=hint-scroll] svg', 'class') or ''), 'its chevron is animated')
    check(pg.evaluate("getComputedStyle(document.querySelector('[data-testid=hint-scroll]')).pointerEvents") == 'none', 'the hint never blocks input (pointer-events: none)')
    if MODE == 'harness': H(pg, 'wheelTo(400)')
    else: pg.mouse.move(640, 360); pg.mouse.wheel(0, 300)
    check(wait(pg, "!document.querySelector('[data-testid=hint-scroll]') || document.querySelector('[data-testid=hint-scroll]').dataset.visible === 'false'", 4), 'it disappears at the first scroll')
    time.sleep(1)
    check(pg.query_selector('[data-testid=hint-scroll]') is None, 'and is removed from the page')
    pg.goto(BASE + '#z=earth&p=0.0000'); pg.reload(); time.sleep(2.4)  # a visit at the very start
    check(pg.query_selector('[data-testid=hint-scroll]') is not None and H(pg, 'state().t') < 0.01, 'after a reload at the start it shows again (it is a hero hint, not a one-time one)')
    pg.keyboard.press('ArrowDown')
    check(wait(pg, "!document.querySelector('[data-testid=hint-scroll]') || document.querySelector('[data-testid=hint-scroll]').dataset.visible === 'false'", 4), 'keyboard: ArrowDown dismisses it')
    pg.goto(BASE + '#z=earth&p=0.0000'); pg.reload(); time.sleep(2.4)
    pg.evaluate("window.dispatchEvent(new Event('touchmove'))")
    check(wait(pg, "!document.querySelector('[data-testid=hint-scroll]') || document.querySelector('[data-testid=hint-scroll]').dataset.visible === 'false'", 4), 'touch: a touchmove dismisses it')
    ctx.close()
    ctx = mk(); pg = open_page(ctx, '#z=moon&p=0.5')
    check(pg.query_selector('[data-testid=hint-scroll]') is None, 'a shared link into the journey never shows "Scroll to begin"')
    all_errors += pg.errors; ctx.close()

    # one-time planet hint
    ctx = mk(); pg = open_page(ctx)
    check(pg.query_selector('[data-testid=hint-planet]') is None, 'no planet hint before the Solar System')
    goto_zone_pos(pg, 'solar-system', 0.38)
    if MODE == 'harness': H(pg, 'planetOnScreen(true)')
    check(wait(pg, "document.querySelector('[data-testid=hint-planet]')?.dataset.visible === 'true'", 15), '"Click a planet" appears at the Solar System planet view')
    txt = pg.inner_text('[data-testid=hint-planet]')
    check('planet' in txt.lower(), f'it has a short line ("{txt.strip()}")')
    check(pg.evaluate("getComputedStyle(document.querySelector('[data-testid=hint-planet]')).pointerEvents") == 'none', 'it never blocks input')
    check(pg.query_selector('[data-testid=hint-planet] .astra-pulse') is not None, 'the pulse ring is animated (full motion)')
    pg.mouse.click(900, 500)
    check(wait(pg, "!document.querySelector('[data-testid=hint-planet]')", 4), 'any click removes it')
    check(stored(pg, 'astra.hint.planet') == '1', 'and it is remembered in localStorage')
    pg.reload(); time.sleep(2.4)
    goto_zone_pos(pg, 'solar-system', 0.38)
    if MODE == 'harness': H(pg, 'planetOnScreen(true)')
    time.sleep(1.5)
    check(pg.query_selector('[data-testid=hint-planet]') is None, 'after a reload it never returns')
    ctx.close()
    ctx = mk(); pg = open_page(ctx)
    goto_zone_pos(pg, 'solar-system', 0.38)
    if MODE == 'harness': H(pg, 'planetOnScreen(true)')
    wait(pg, "document.querySelector('[data-testid=hint-planet]')?.dataset.visible === 'true'", 15)
    H(pg, "focus('jupiter')")
    check(wait(pg, "!document.querySelector('[data-testid=hint-planet]')", 6) and stored(pg, 'astra.hint.planet') == '1', 'focusing a planet also removes it for good')
    ctx.close()
    ctx = mk(reduced_motion='reduce'); pg = open_page(ctx)
    goto_zone_pos(pg, 'solar-system', 0.38)
    if MODE == 'harness': H(pg, 'planetOnScreen(true)')
    wait(pg, "document.querySelector('[data-testid=hint-planet]')?.dataset.visible === 'true'", 15)
    check(pg.query_selector('[data-testid=hint-planet]') is not None and pg.query_selector('[data-testid=hint-planet] .astra-pulse') is None, 'reduced motion: the hint shows with no pulse animation')
    ctx.close()

    # ============================================================== MENU
    ctx = mk(); pg = open_page(ctx)
    zones = H(pg, 'ranges()'); n = len(zones)
    goto_zone_pos(pg, 'local-group', 0.5)
    pg.click('[data-testid=journey-button]')
    check(pg.query_selector('[data-testid=journey-menu]') is not None, 'Journey button opens the panel')
    check(pg.get_attribute('[data-testid=journey-menu]', 'role') == 'dialog' and pg.get_attribute('[data-testid=journey-menu]', 'aria-modal') == 'true', 'it is an aria-modal dialog')
    rows = pg.query_selector_all('[data-zone]')
    check(len(rows) == n, f'it lists every main zone in order ({len(rows)} of {n})')
    check([r.get_attribute('data-zone') for r in rows] == [z['id'] for z in zones], 'in journey order')
    summ = pg.evaluate("[...document.querySelectorAll('[data-zone]')].map(b => b.innerText.split('\\n').filter(Boolean).length)")
    check(all(x >= 3 for x in summ), 'every row has a title, a scale line and a summary')
    check('across' in pg.inner_text('[data-testid=menu-moon]') and 'km' in pg.inner_text('[data-testid=menu-moon]'), 'scale line, e.g. the Moon: ' + repr(pg.inner_text('[data-testid=menu-moon]')[:90]))
    cur = pg.query_selector_all('[data-zone][aria-current=step]')
    check(len(cur) == 1 and cur[0].get_attribute('data-zone') == 'local-group', 'the current zone is marked (aria-current + "You are here")')
    check(pg.evaluate("document.activeElement?.dataset.zone") == 'local-group', 'focus starts on the current zone')
    inf = pg.inner_text('[data-testid=menu-infall]')
    check('gate' in inf and 'no direct jump' in inf, 'the infall branch has its line: opens from the gate, no direct jump')
    check(pg.query_selector('[data-testid=menu-infall] button') is None, 'and it is not a button (nothing to jump into)')
    ok = True
    for i in range(24):
        pg.keyboard.press('Tab'); ok = ok and pg.evaluate("!!document.activeElement.closest('[data-testid=journey-menu]')")
    for i in range(24):
        pg.keyboard.press('Shift+Tab'); ok = ok and pg.evaluate("!!document.activeElement.closest('[data-testid=journey-menu]')")
    check(ok, 'focus is trapped: 24 x Tab and 24 x Shift+Tab never leave the dialog')
    pg.focus('[data-testid=menu-local-group]'); pg.keyboard.press('ArrowDown')
    check(pg.evaluate("document.activeElement?.dataset.zone") == 'nearby-galaxies', 'ArrowDown moves to the next zone')
    pg.keyboard.press('Home'); check(pg.evaluate("document.activeElement?.dataset.zone") == 'earth', 'Home -> first zone')
    pg.keyboard.press('End'); check(pg.evaluate("document.activeElement?.dataset.zone") == 'multiverse', 'End -> last zone')
    pg.keyboard.press('Escape'); time.sleep(0.3)
    check(pg.query_selector('[data-testid=journey-menu]') is None, 'Esc closes it')
    check(pg.evaluate("document.activeElement?.dataset.testid") == 'journey-button', 'and gives focus back to the Journey button')
    pg.click('[data-testid=journey-button]'); pg.mouse.click(5, 5); time.sleep(0.3)
    check(pg.query_selector('[data-testid=journey-menu]') is None, 'a click on the backdrop closes it')
    # keyboard jump (far -> cross-fade)
    pg.click('[data-testid=journey-button]'); pg.focus('[data-testid=menu-universe]'); pg.keyboard.press('Enter')
    check(wait(pg, "window.__h.state().zone === 'universe'", 20), 'keyboard: Enter on a zone jumps there (far jump, cross-fade)')
    check(pg.query_selector('[data-testid=journey-menu]') is None, 'the panel closes after a jump')
    # touch / click jump back to the start
    pg.click('[data-testid=journey-button]'); pg.click('[data-testid=menu-earth]')
    check(wait(pg, "window.__h.state().zone === 'earth'", 20), 'click: Earth')
    # not while focused
    goto_zone_pos(pg, 'solar-system', 0.38); H(pg, "focus('jupiter')"); wait(pg, "window.__h.state().focusPhase === 'focused'", 30)
    check(pg.evaluate("document.querySelector('[data-testid=journey-button]').disabled"), 'the menu button is disabled while an object is focused')
    H(pg, 'release()'); wait(pg, "window.__h.state().focusPhase === 'idle'", 30)
    # inside the infall: rows disabled
    goto_zone_pos(pg, 'bh-approach', 0.5); H(pg, 'enterInfall()'); wait(pg, "window.__h.state().timelineId === 'infall'", 10); time.sleep(0.5)
    pg.click('[data-testid=journey-button]')
    check(pg.evaluate("[...document.querySelectorAll('[data-zone]')].every(b => b.disabled)") and 'inside the fall' in pg.inner_text('[data-testid=journey-menu]'), 'inside the infall the zone rows are disabled and the menu says why')
    pg.keyboard.press('Escape')
    all_errors += pg.errors; ctx.close()

    # ============================================================== LINK
    ctx = mk(); pg = open_page(ctx)
    check(wait(pg, "location.hash.startsWith('#z=')", 5), 'the URL always reflects the position (hash written at the start)')
    cases = [('earth', 0.4321), ('moon', 0.77), ('sun', 0.1234), ('solar-system', 0.6), ('beyond', 0.5), ('milky-way', 0.25), ('local-group', 0.9), ('nearby-galaxies', 0.31), ('bh-approach', 0.5), ('universe', 0.5), ('multiverse', 0.95)]
    bad = []
    for z, pr in cases:
        T = goto_zone_pos(pg, z, pr)
        wait(pg, f"location.hash.startsWith('#z={z}&')", 5); time.sleep(0.6)
        h = pg.evaluate('location.hash')
        pg2 = open_page(ctx, h)
        t2 = H(pg2, 'state().t'); zz = H(pg2, 'state().zone')
        if not (zz == z and abs(t2 - T) < 1e-4): bad.append((z, pr, h, zz, t2, T))
        all_errors += pg2.errors; pg2.close()
    check(not bad, f'round trip, {len(cases)} zones: hash -> new tab -> same zone and T within 1e-4 {bad[:2]}')
    # focus target
    goto_zone_pos(pg, 'solar-system', 0.38); H(pg, "focus('jupiter')"); wait(pg, "window.__h.state().focusPhase === 'focused'", 40); time.sleep(0.8)
    h = pg.evaluate('location.hash')
    check('&f=jupiter' in h and h.startswith('#z=solar-system&'), f'a focused planet is in the link ({h})')
    saved = at(pg, 'solar-system', 0.38)
    pg2 = open_page(ctx, h)
    check(wait(pg2, "window.__h.state().focusId === 'jupiter'", 40), 'opening it focuses Jupiter (after the cross-fade to the position)')
    wait(pg2, "window.__h.state().focusPhase === 'focused'", 40); H(pg2, 'release()'); wait(pg2, "window.__h.state().focusPhase === 'idle'", 40)
    check(abs(H(pg2, 'state().t') - saved) < 1e-4, 'and Back returns to the linked position')
    all_errors += pg2.errors; pg2.close()
    H(pg, 'release()'); wait(pg, "window.__h.state().focusPhase === 'idle'", 40)
    # infall -> gate
    goto_zone_pos(pg, 'bh-approach', 0.5); H(pg, 'enterInfall()'); wait(pg, "window.__h.state().timelineId === 'infall'", 10)
    check(wait(pg, "location.hash.startsWith('#z=bh-approach&p=0.9')", 5), f'inside the infall the URL is the black-hole gate position ({pg.evaluate("location.hash")})')
    pg2 = open_page(ctx, '#z=fall-2&p=0.4')
    check(H(pg2, 'state().zone') == 'bh-approach' and H(pg2, 'state().timelineId') == 'main' and abs(H(pg2, 'state().t') - at(pg2, 'bh-approach', 0.97)) < 1e-4, 'a hand-made link into the infall resolves to the gate position on the main path')
    if MODE == 'app': check(wait(pg2, "window.__h.state().gate", 10), 'APP: the "Fall into the black hole?" gate opens there')
    all_errors += pg2.errors; pg2.close(); all_errors += pg.errors; ctx.close()
    # invalid
    bad = []
    for hsh in ['#z=nope&p=0.5', '#z=earth&p=abc', '#garbage', '#z=earth&p=9', '#z=../../x&p=1', '#z=earth&p=-1', '#' + 'x' * 3000, '#z=earth&p=0.5&p=0.7', '#z=%E0%A4%A&p=1']:
        c2 = mk(); pg2 = open_page(c2, hsh)
        s = H(pg2, 'state()')
        if not (s['zone'] == 'earth' and s['t'] < 1e-3 and not pg2.errors): bad.append((hsh[:30], s['zone'], s['t'], pg2.errors[:1]))
        if not pg2.evaluate("location.hash.startsWith('#z=earth')"): time.sleep(0.8)
        if not pg2.evaluate("location.hash.startsWith('#z=earth')"): bad.append((hsh[:30], 'hash not repaired', pg2.evaluate('location.hash')[:30]))
        all_errors += pg2.errors; c2.close()
    check(not bad, f'9 invalid links: start of the journey, no errors, and the URL is rewritten to a valid one {bad[:2]}')
    # history is never spammed; replaceState is rate-limited
    ctx = mk(); pg = open_page(ctx)
    hl = pg.evaluate('history.length'); pg.evaluate('window.__rs.length = 0')
    t0 = time.time(); k = 0
    while time.time() - t0 < 5:
        k += 1; H(pg, f'jumpT({(k % 100) / 100})') if True else None; time.sleep(0.05)
    calls = pg.evaluate('window.__rs.length')
    check(pg.evaluate('history.length') == hl, f'history length unchanged ({hl}): replaceState only, never pushState')
    check(calls <= 3.2 * 5 + 1, f'replaceState calls: {calls} in 5 s of continuous movement (<= ~3/s)')
    # hashchange in a running page
    r = next(z for z in H(pg, 'ranges()') if z['id'] == 'universe')
    pg.evaluate("location.hash = '#z=universe&p=0.5000'")
    check(wait(pg, "window.__h.state().zone === 'universe'", 20), 'pasting another link into the open tab cross-fades there')
    # copy link
    ctx.close()
    ctx = mk(permissions=['clipboard-read', 'clipboard-write']); pg = open_page(ctx)
    goto_zone_pos(pg, 'milky-way', 0.5); time.sleep(0.7)
    pg.click('[data-testid=journey-button]'); pg.click('[data-testid=copy-link]')
    check(wait(pg, "document.querySelector('[data-testid=copied]').innerText.trim() === 'Copied'", 4), '"Copy link" shows "Copied"')
    clip = pg.evaluate('navigator.clipboard.readText()')
    check(clip.startswith(BASE) and '#z=milky-way&p=0.5' in clip and '?' not in clip, f'clipboard holds the full URL with the position ({clip})')
    check(wait(pg, "document.querySelector('[data-testid=copied]').innerText.trim() === ''", 5), 'the confirmation fades after a moment')
    all_errors += pg.errors; ctx.close()
    ctx = mk(); pg = ctx.new_page(); pg.add_init_script(INIT + "; Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })")
    pg.errors = []; pg.on('pageerror', lambda e: pg.errors.append(str(e)))
    pg.goto(BASE)
    wait(pg, "window.__h && window.__h.state().phase === 'ready'" if MODE == 'harness' else "window.__astra && window.__astra.state().phase === 'ready'", 300)
    if MODE == 'app': pg.evaluate(APP_SHIM)
    time.sleep(1.5); pg.click('[data-testid=journey-button]'); pg.click('[data-testid=copy-link]')
    check(wait(pg, "['Copied', 'Could not copy: select the address bar instead'].includes(document.querySelector('[data-testid=copied]').innerText.trim())", 4), 'no Clipboard API: the fallback runs and reports honestly (' + pg.inner_text('[data-testid=copied]') + ')')
    ctx.close()
    # web share on a touch device
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
    pg = ctx.new_page(); pg.errors = []; pg.on('pageerror', lambda e: pg.errors.append(str(e)))
    pg.add_init_script(INIT + "; navigator.share = (d) => { window.__shared = d; return Promise.resolve() }")
    pg.goto(BASE)
    wait(pg, "window.__h && window.__h.state().phase === 'ready'" if MODE == 'harness' else "window.__astra && window.__astra.state().phase === 'ready'", 300)
    if MODE == 'app': pg.evaluate(APP_SHIM)
    time.sleep(1.5); pg.tap('[data-testid=journey-button]')
    check(pg.query_selector('[data-testid=share-link]') is not None, 'touch device with Web Share: a "Share…" button is offered')
    pg.tap('[data-testid=share-link]'); time.sleep(0.4)
    sh = pg.evaluate('window.__shared')
    check(bool(sh) and '#z=' in sh.get('url', ''), f'it calls navigator.share with the link ({sh and sh.get("url")})')
    all_errors += pg.errors; ctx.close()
    b.close()

check(not all_errors, f'no console errors / page errors in any page above ({len(all_errors)}) {all_errors[:3]}')
print('\n%s (%s mode)' % ('ALL PASS' if not fails else f'{len(fails)} FAIL', MODE))
sys.exit(1 if fails else 0)
