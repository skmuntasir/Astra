"""
ASTRA audio level test. Renders the real ambient graph (src/lib/audio/ambient.ts) with an OfflineAudioContext inside headless Chromium
and measures PEAK and RMS per zone mood, plus a click detector over a full scroll sweep, the mute / unmute ramps and the infall.

HONEST LIMIT: this verifies the graph and the levels numerically. It cannot tell whether the sound is pleasant or whether the cross-fades
sound smooth: that needs ears. Usage: python3 tests/audio_levels.py   (needs esbuild + playwright; no dev server)
"""
import json, os, subprocess, sys, tempfile
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ESB = next((p for p in (os.path.join(ROOT, 'node_modules/.bin/esbuild'), '/opt/npm-tools/node_modules/.bin/esbuild') if os.path.exists(p)), 'esbuild')
fails = []
def check(c, msg):
    print(('PASS ' if c else 'FAIL ') + msg)
    if not c: fails.append(msg)

entry = os.path.join(tempfile.mkdtemp(), 'entry.ts')
open(entry, 'w').write(f"""
import {{ createAmbient, MASTER_GAIN, makeLoopNoise }} from '{ROOT}/src/lib/audio/ambient'
import {{ MOODS, mk, moodAt, moodInfall, blendMood, mood }} from '{ROOT}/src/lib/audio/moods'
;(window as any).A = {{ createAmbient, MASTER_GAIN, makeLoopNoise, MOODS, mk, moodAt, moodInfall, blendMood, mood }}
""")
bundle = entry.replace('.ts', '.js')
subprocess.run([ESB, entry, '--bundle', '--format=iife', '--outfile=' + bundle, '--log-level=error'], check=True)

PAGE = r"""
async () => {
  const A = window.A, SR = 24000 // the app's rate (ambient.ts SAMPLE_RATE)
  const stats = (x, a, b) => { let pk = 0, s = 0; const i0 = Math.floor(a * SR), i1 = Math.floor(b * SR); for (let i = i0; i < i1; i++) { const v = x[i]; if (Math.abs(v) > pk) pk = Math.abs(v); s += v * v } return { peak: pk, rms: Math.sqrt(s / (i1 - i0)) } }
  // power spectrum of 2^17 samples (Hann window, radix-2 FFT): share of the energy below 80 Hz ("pressure") and above 4 kHz ("sparks / hiss")
  const fft = (re, im) => { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] } }
    for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const u = i + k, v = i + k + len / 2; const xr = re[v] * cr - im[v] * ci, xi = re[v] * ci + im[v] * cr; re[v] = re[u] - xr; im[v] = im[u] - xi; re[u] += xr; im[u] += xi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t } } } }
  const bands = (x, a) => { const N = 1 << 17, re = new Float64Array(N), im = new Float64Array(N), i0 = Math.floor(a * SR); for (let i = 0; i < N; i++) re[i] = x[i0 + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); fft(re, im)
    let tot = 0, lo = 0, hi = 0, mid = 0; for (let k = 1; k < N / 2; k++) { const f = k * SR / N, e = re[k] * re[k] + im[k] * im[k]; tot += e; if (f < 80) lo += e; if (f > 4000) hi += e; if (f > 1200) mid += e } return { lo: lo / tot, hi: hi / tot, mid: mid / tot } }
  const maxDiff = (x, a, b) => { let m = 0, at = 0; for (let i = Math.floor(a * SR) + 1; i < Math.floor(b * SR); i++) { const d = Math.abs(x[i] - x[i - 1]); if (d > m) { m = d; at = i / SR } } return { m, at } }
  const out = { cost: null, zones: {}, infallBands: {}, infall: {}, sweep: null, mute: null, noise: null }
  // ---- cost proxy for "the page is slow": wall-clock to render 60 s of the busiest mood (the fall) offline, as a multiple of real time (higher = cheaper), and the node count
  { const ctx = new OfflineAudioContext(2, 60 * SR, SR), am = A.createAmbient(ctx); am.fade(A.MASTER_GAIN, 0, 0.5); am.set(A.moodInfall(0.7, A.mk()), 0)
    const t0 = performance.now(); await ctx.startRendering(); out.cost = { x_realtime: 60000 / (performance.now() - t0) } }
  // ---- per-zone steady state: 30 s, measure 12..30 s (the mood is fully settled after ~8 s)
  for (const id of Object.keys(A.MOODS)) {
    const ctx = new OfflineAudioContext(2, 30 * SR, SR), am = A.createAmbient(ctx)
    am.fade(A.MASTER_GAIN, 0, 0.5); am.set(A.MOODS[id], 0)
    const buf = await ctx.startRendering()
    const l = buf.getChannelData(0), r = buf.getChannelData(1)
    const sl = stats(l, 12, 30), sr = stats(r, 12, 30)
    const bd = bands(l, 12); out.zones[id] = { peak: Math.max(sl.peak, sr.peak), rms: Math.max(sl.rms, sr.rms), maxDiff: maxDiff(l, 12, 30).m, lo: bd.lo, hi: bd.hi, mid: bd.mid, crest: Math.max(sl.peak, sr.peak) / Math.max(sl.rms, sr.rms) }
  }
  // ---- infall: progress 0, .5, .9, 1
  for (const p of [0, 0.5, 0.9, 1]) {
    const ctx = new OfflineAudioContext(2, 30 * SR, SR), am = A.createAmbient(ctx)
    am.fade(A.MASTER_GAIN, 0, 0.5); am.set(A.moodInfall(p, A.mk()), 0)
    const buf = await ctx.startRendering(); const l = buf.getChannelData(0)
    out.infall[p] = stats(l, 12, 30); if (p < 1) out.infallBands[p] = bands(l, 12)
  }
  // ---- full sweep: every zone in order, 0.25 s updates (the app's rate is 4 Hz), 6 s of scrolling per zone; then the infall; click detector
  {
    const ids = ['earth', 'moon', 'sun', 'solar-system', 'beyond', 'milky-way', 'local-group', 'nearby-galaxies', 'bh-approach', 'universe', 'multiverse']
    const STEP = 6, total = ids.length * STEP + 12
    const ctx = new OfflineAudioContext(2, total * SR, SR), am = A.createAmbient(ctx)
    am.fade(A.MASTER_GAIN, 0, 1.0)
    const m = A.mk(); let t = 0
    for (let z = 0; z < ids.length; z++) for (let k = 0; k < STEP * 4; k++, t += 0.25) am.set(A.moodAt(ids[z], k / (STEP * 4), z ? ids[z - 1] : null, m), t)
    for (let k = 0; k < 48; k++, t += 0.25) am.set(A.moodInfall(k / 47, m), t)
    am.fade(0, total - 4, 0.5) // mute at the end
    const buf = await ctx.startRendering(); const l = buf.getChannelData(0)
    const all = stats(l, 0, total)
    const d = maxDiff(l, 0, total)
    // a click = a one-sample jump much larger than the signal's own slope: bound is 0.30 x peak (a 2 kHz sine would reach 0.28 x its peak)
    out.sweep = { seconds: total, peak: all.peak, rms: all.rms, maxDiff: d.m, at: d.at, ratio: d.m / all.peak }
  }
  // ---- mute / unmute ramps while playing: 8 s on, mute (tau 0.5) at 10 s, unmute at 14 s
  {
    const ctx = new OfflineAudioContext(2, 20 * SR, SR), am = A.createAmbient(ctx)
    am.fade(A.MASTER_GAIN, 0, 0.5); am.set(A.MOODS['earth'], 0)
    am.fade(0, 10, 0.25); am.fade(A.MASTER_GAIN, 14, 0.25)
    const buf = await ctx.startRendering(); const l = buf.getChannelData(0)
    const pk = stats(l, 5, 20).peak, d1 = maxDiff(l, 9.9, 11.5), d2 = maxDiff(l, 13.9, 16)
    out.mute = { peak: pk, ratio1: d1.m / pk, ratio2: d2.m / pk, silent: stats(l, 12.5, 13.9).peak }
  }
  // ---- noise seam: variance inside the cross-faded start (0..1.5 s) vs the rest, and the step across the seam
  {
    const x = A.makeLoopNoise(SR, 12, 424242), v = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return s / (b - a) }
    const f = Math.round(SR * 1.5)
    let c = 0, c0 = 0; for (let i = 0; i < f - 1; i++) { c += x[i] * x[i + 1]; c0 += x[i] * x[i] }
    let r = 0, r0 = 0; for (let i = f; i < x.length - 1; i++) { r += x[i] * x[i + 1]; r0 += x[i] * x[i] }
    let cs = 0, cs0 = 0; for (let k = 1; k <= 2000; k++) { cs += x[x.length - k] * x[k - 1]; cs0 += x[k - 1] * x[k - 1] } // mirrored pairs around the seam
    out.noise = { inFade: v(0, f), rest: v(f, x.length), lag1InFade: c / c0, lag1Rest: r / r0, seamCorr: cs / cs0, n: x.length }
  }
  return out
}
"""

with sync_playwright() as p:
    b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.set_content('<html><body></body></html>')
    pg.add_script_tag(path=bundle)
    res = pg.evaluate(PAGE)
    b.close()

db = lambda x: 20 * __import__('math').log10(max(x, 1e-9))
print('\nPer-zone steady state (24 kHz = the app rate, rendered offline, left/right max):')
print('%-18s %8s %8s %10s %10s %8s %8s %6s' % ('zone', 'peak', 'RMS', 'peak dBFS', 'RMS dBFS', '<80Hz %', '>4k %', 'crest'))
for k, v in res['zones'].items(): print('%-18s %8.4f %8.4f %10.1f %10.1f %8.4f %8.5f %6.2f' % (k, v['peak'], v['rms'], db(v['peak']), db(v['rms']), v['lo']*100, v['hi']*100, v['crest']))
print('infall progress   ', {k: (round(v['peak'], 4), round(v['rms'], 4)) for k, v in res['infall'].items()})
print('cost (60 s of the fall rendered offline, x real time):', round(res['cost']['x_realtime'], 1))
print('sweep', {k: (round(v, 4) if isinstance(v, float) else v) for k, v in res['sweep'].items()})
print('mute', res['mute']); print('noise', res['noise'])
open('/tmp/audio_levels.json', 'w').write(json.dumps(res, indent=1))

import re as _re
MOODS_NOISE = {m.group(1).strip("'"): float(m.group(2)) for m in _re.finditer(r"\n  ('?[a-z-]+'?): m\(\{[^\n]*?noise: ([0-9.]+),", open(os.path.join(ROOT, 'src/lib/audio/moods.ts')).read())}
PEAK_MAX, RMS_MAX = 0.14, 0.04   # -17 dBFS peak, -28 dBFS RMS
LO_MAX, HI_MAX, CREST_MAX = 0.005, 0.001, 5.0   # < 0.5 % of the energy under 80 Hz, < 0.1 % above 4 kHz, crest factor (peak / RMS) < 5: no spikes: "well below clipping, overall quiet"
check(not errs, f'no page errors while rendering {errs[:2]}')
check(all(v['peak'] < PEAK_MAX for v in res['zones'].values()), f'every zone peak < {PEAK_MAX} ({db(PEAK_MAX):.0f} dBFS): max {max(v["peak"] for v in res["zones"].values()):.3f}')
check(all(v['rms'] < RMS_MAX for v in res['zones'].values()), f'every zone RMS < {RMS_MAX}: max {max(v["rms"] for v in res["zones"].values()):.3f}')
check(all(v['lo'] < LO_MAX for v in res['zones'].values()), f'NO PRESSURE: energy below 80 Hz < {LO_MAX*100:.1f} % in every zone (max {max(v["lo"] for v in res["zones"].values())*100:.3f} %)')
check(all(v['hi'] < HI_MAX for v in res['zones'].values()), f'NO SPARKS: energy above 4 kHz < {HI_MAX*100:.2f} % in every zone (max {max(v["hi"] for v in res["zones"].values())*100:.4f} %)')
check(all(MOODS_NOISE.get(k, 0) == 0 for k in res['zones'] if k not in ('bh-approach',)), 'noise bed is OFF in every zone except the black hole (no "TV without signal")')
check(all(v['mid'] < 0.02 for k, v in res['zones'].items() if k != 'bh-approach'), f'tone zones: < 2 % of the energy above 1.2 kHz (max {max(v["mid"] for k, v in res["zones"].items() if k != "bh-approach")*100:.2f} %)')
check(res['cost']['x_realtime'] > 20, f'cheap: the busiest mood renders {res["cost"]["x_realtime"]:.0f}x faster than real time offline (> 20x)')
check(all(v['crest'] < CREST_MAX for v in res['zones'].values()), f'no spikes: crest factor < {CREST_MAX} in every zone (max {max(v["crest"] for v in res["zones"].values()):.2f})')
check(all(v['lo'] < LO_MAX and v['hi'] < HI_MAX for v in res['infallBands'].values()), 'the fall (p = 0, .5, .9) is also clean below 80 Hz and above 4 kHz')
check(all(v['rms'] > 0.004 for v in res['zones'].values()), f'every zone is audible (RMS > 0.004, -48 dBFS): min {min(v["rms"] for v in res["zones"].values()):.4f}')
check(all(v['peak'] < PEAK_MAX and v['rms'] < RMS_MAX for v in res['infall'].values()), 'infall (p = 0, .5, .9, 1) stays under the same peak and RMS limits')
sw = res['sweep']
check(sw['peak'] < PEAK_MAX, f'whole sweep peak {sw["peak"]:.3f} < {PEAK_MAX}')
check(sw['ratio'] < 0.30, f'sweep click detector: biggest sample step {sw["maxDiff"]:.4f} = {sw["ratio"]:.2f} x peak (< 0.30) at {sw["at"]:.1f}s')
mu = res['mute']
check(mu['ratio1'] < 0.30 and mu['ratio2'] < 0.30, f'mute / unmute ramps are click-free (steps {mu["ratio1"]:.2f} / {mu["ratio2"]:.2f} x peak)')
check(mu['silent'] < 0.001, f'muted = silent (peak {mu["silent"]:.5f})')
nz = res['noise']
check(abs(nz['inFade'] / nz['rest'] - 1) < 0.15, f'noise loop: cross-faded part keeps the variance ({nz["inFade"]:.4f} vs {nz["rest"]:.4f})')
check(abs(nz['lag1InFade'] - nz['lag1Rest']) < 0.03, f'noise loop: the cross-faded part has the same colour as the rest (lag-1 correlation {nz["lag1InFade"]:.3f} vs {nz["lag1Rest"]:.3f})')
check(nz['lag1Rest'] > 0.5, f'the noise is PINK (strongly low-passed: lag-1 correlation {nz["lag1Rest"]:.2f}), not hissy white noise')
print('\n%s' % ('ALL PASS' if not fails else f'{len(fails)} FAIL'))
sys.exit(1 if fails else 0)
