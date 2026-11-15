"""Renders the real ambient graph to a WAV (stereo, 24 kHz, 16-bit) so the sound can be heard without building the app.
Each zone gets 12 s of scroll (cross-fading in from the previous one exactly like the app, 4 Hz updates), then the fall (24 s). Levels are the
app's real levels (quiet: peak about -18 dBFS), so turn your player up.   python3 tests/render_preview.py [out.wav]"""
import base64, os, subprocess, sys, tempfile, wave
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ESB = next((p for p in (os.path.join(ROOT, 'node_modules/.bin/esbuild'), '/opt/npm-tools/node_modules/.bin/esbuild') if os.path.exists(p)), 'esbuild')
entry = os.path.join(tempfile.mkdtemp(), 'e.ts')
open(entry, 'w').write(f"import {{ createAmbient, MASTER_GAIN }} from '{ROOT}/src/lib/audio/ambient'\nimport {{ mk, moodAt, moodInfall }} from '{ROOT}/src/lib/audio/moods'\n;(window as any).A = {{ createAmbient, MASTER_GAIN, mk, moodAt, moodInfall }}")
js = entry.replace('.ts', '.js'); subprocess.run([ESB, entry, '--bundle', '--format=iife', '--outfile=' + js, '--log-level=error'], check=True)
PAGE = """async () => { const A = window.A, SR = 24000, ids = ['earth','moon','sun','solar-system','beyond','milky-way','local-group','nearby-galaxies','bh-approach','universe','multiverse'], STEP = 12, FALL = 24
  const total = ids.length * STEP + FALL + 6, ctx = new OfflineAudioContext(2, total * SR, SR), am = A.createAmbient(ctx)
  am.fade(A.MASTER_GAIN, 0, 1.5); const m = A.mk(); let t = 0
  for (let z = 0; z < ids.length; z++) for (let k = 0; k < STEP * 4; k++, t += 0.25) am.set(A.moodAt(ids[z], k / (STEP * 4), z ? ids[z-1] : null, m), t)
  for (let k = 0; k < FALL * 4; k++, t += 0.25) am.set(A.moodInfall(k / (FALL * 4 - 1), m), t)
  am.fade(0, total - 3, 0.5)
  const b = await ctx.startRendering(), l = b.getChannelData(0), r = b.getChannelData(1), o = new Int16Array(l.length * 2)
  for (let i = 0; i < l.length; i++) { o[2*i] = Math.max(-1, Math.min(1, l[i])) * 32767; o[2*i+1] = Math.max(-1, Math.min(1, r[i])) * 32767 }
  let s = ''; const u = new Uint8Array(o.buffer); for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s) }"""
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(); pg.set_content('<html></html>'); pg.add_script_tag(path=js)
    data = base64.b64decode(pg.evaluate(PAGE)); b.close()
out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/astra-sound-preview.wav'
w = wave.open(out, 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(24000); w.writeframes(data); w.close()
print('wrote', out, len(data) // 4 / 24000, 'seconds')
