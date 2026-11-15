import sharp from 'sharp'
/** Renders ring strips as annuli on a dark background (tilted 55 deg) for visual checks. tsx ringview.ts out.png file:r0:r1:planetKm ... */
async function main() {
  const [out, ...specs] = process.argv.slice(2)
  const S = 480
  const tiles: Buffer[] = []
  for (const sp of specs) {
    const [f, r0s, r1s, rps] = sp.split(':'); const r0 = +r0s, r1 = +r1s, rp = +rps
    const { data, info } = await sharp('public/textures/' + f).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const W = info.width
    const buf = Buffer.alloc(S * S * 3, 6)
    const scale = (r1 * 1.05) / (S / 2)
    const tilt = Math.sin((55 * Math.PI) / 180)
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = (x + 0.5 - S / 2) * scale, dy = ((y + 0.5 - S / 2) * scale) / tilt
      const r = Math.hypot(dx, dy)
      let c = [6, 6, 6]
      if (r > rp && false) c = [40, 40, 40]
      if (r >= r0 && r <= r1) {
        const u = Math.min(W - 1, Math.floor(((r - r0) / (r1 - r0)) * W)), i = u * 4
        const a = data[i + 3] / 255
        c = [data[i] * a + 6 * (1 - a), data[i + 1] * a + 6 * (1 - a), data[i + 2] * a + 6 * (1 - a)]
      }
      if (Math.hypot(dx, (y + 0.5 - S / 2) * scale) < rp && (y + 0.5 - S / 2) > -0) c = [150, 130, 100]
      buf[(y * S + x) * 3] = c[0]; buf[(y * S + x) * 3 + 1] = c[1]; buf[(y * S + x) * 3 + 2] = c[2]
    }
    tiles.push(await sharp(buf, { raw: { width: S, height: S, channels: 3 } }).png().toBuffer())
  }
  await sharp({ create: { width: S * tiles.length, height: S, channels: 3, background: '#000' } }).composite(tiles.map((t, i) => ({ input: t, left: i * S, top: 0 }))).png().toFile(out)
}
main()
