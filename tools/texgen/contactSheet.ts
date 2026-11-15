import sharp, { type OverlayOptions } from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

/** Tiles every generated map into public/textures/contact-sheet.png (or _preview/ with --preview). Labels via SVG text. */
const preview = process.argv.includes('--preview')
const dir = path.resolve('public/textures', preview ? '_preview' : '')
const files = fs.readdirSync(dir).filter((f) => /\.(png|jpg|webp)$/.test(f) && !f.startsWith('contact-sheet') && f !== 'sun_2k.jpg').sort()
async function main() {
  const TW = 640, TH = 320, PAD = 14, LABEL = 24, COLS = 3
  const rows = Math.ceil(files.length / COLS)
  const W = COLS * (TW + PAD) + PAD, H = rows * (TH + LABEL + PAD) + PAD
  const comps: OverlayOptions[] = []
  for (let i = 0; i < files.length; i++) {
    const cx = PAD + (i % COLS) * (TW + PAD), cy = PAD + Math.floor(i / COLS) * (TH + LABEL + PAD)
    const meta = await sharp(path.join(dir, files[i])).metadata()
    const isStrip = (meta.height ?? 1) < 32
    const buf = await sharp(path.join(dir, files[i])).flatten({ background: '#202020' }).resize(TW, isStrip ? 48 : TH, { fit: 'fill' }).png().toBuffer()
    comps.push({ input: buf, left: cx, top: cy + LABEL })
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${LABEL}"><text x="2" y="17" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" fill="#cfd6e4">${files[i]}  ${meta.width}x${meta.height}</text></svg>`
    comps.push({ input: Buffer.from(svg), left: cx, top: cy })
  }
  const out = path.join(dir, 'contact-sheet.png')
  await sharp({ create: { width: W, height: H, channels: 3, background: '#0a0d14' } }).composite(comps).png().toFile(out)
  console.log(`contact sheet: ${out} (${files.length} maps)`)
}
main()
