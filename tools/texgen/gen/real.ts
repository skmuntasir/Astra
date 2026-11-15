import fs from 'node:fs'
import sharp from 'sharp'
import { saveRecord } from '../lib/manifest'

/** Records the NASA-derived Earth/Moon files taken from the old Astra project (they are copied, never regenerated). */
export async function registerReal() {
  const credit = 'NASA-derived (Blue Marble / LRO class). CREDIT-NEEDED: exact source product not recorded in old project; verify before launch.'
  const rows: Array<[string, string, string, 'srgb' | 'linear']> = [
    ['real/earth-day.jpg', 'Earth day colour', 'earth', 'srgb'],
    ['real/earth-night.jpg', 'Earth night lights', 'earth', 'srgb'],
    ['real/earth-clouds.jpg', 'Earth cloud cover (greyscale alpha)', 'earth', 'linear'],
    ['real/earth-ocean.png', 'Earth ocean mask (specular)', 'earth', 'linear'],
    ['real/moon-albedo.jpg', 'Moon albedo (greyscale)', 'moon', 'srgb'],
  ]
  for (const [file, usage, zone, cs] of rows) {
    const p = 'public/textures/' + file
    if (!fs.existsSync(p)) continue
    const st = fs.statSync(p)
    const md = await sharp(p).metadata()
    const dims = [md.width!, md.height!, md.channels!]
    saveRecord({ file, w: dims[0], h: dims[1], channels: dims[2], bytes: st.size, kind: 'real', generator: 'copied from old Astra src/assets', zone, usage, credit, tier: 'core', colorSpace: cs })
  }
}
