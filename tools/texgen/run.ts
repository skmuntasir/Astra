import { makeCtx } from './lib/ctx'
import { writeManifest } from './lib/manifest'
import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { GENS } from './gens'

/**
 * npm run textures [-- --only sun,mars] [--force] [--preview [--scale 0.25]]
 * Idempotent: a generator is skipped when its source files + params hash is unchanged and its outputs exist.
 */
const args = process.argv.slice(2)
const flag = (n: string) => args.includes('--' + n)
const val = (n: string) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : undefined }
const only = val('only')?.split(',')
const preview = flag('preview')
const scale = parseFloat(val('scale') ?? '0.25')

async function main() {
  const ctx = makeCtx(preview, scale)
  const cacheFile = 'public/textures/.cache.json'
  const cache: Record<string, string> = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {}
  for (const g of GENS) {
    if (only && !only.includes(g.id)) continue
    const h = crypto.createHash('sha1')
    for (const s of ['lib/noise.ts', 'lib/sphere.ts', 'lib/craters.ts', 'lib/relief.ts', 'lib/ramps.ts', 'lib/io.ts', 'lib/ctx.ts', ...g.sources]) h.update(fs.readFileSync(path.join('tools/texgen', s)))
    const key = h.digest('hex')
    const fresh = g.outputs.every((o) => fs.existsSync('public/textures/' + o)) && cache[g.id] === key
    if (!preview && fresh && !flag('force')) { console.log(`[${g.id}] up to date`); continue }
    const t0 = Date.now()
    console.log(`[${g.id}] generating${preview ? ' (preview)' : ''}...`)
    await g.run(ctx)
    console.log(`[${g.id}] done in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    if (!preview) { cache[g.id] = key; fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 1)) }
  }
  if (!preview) {
    const { registerReal } = await import('./gen/real')
    await registerReal()
    const sizes = writeManifest()
    console.log(`manifest: desktop ${(sizes.desktop / 1048576).toFixed(1)} MB, mobile ${(sizes.mobile / 1048576).toFixed(1)} MB`)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
