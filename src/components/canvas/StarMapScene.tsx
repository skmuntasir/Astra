import { useEffect, useRef } from 'react'
import { DEEP_SKY, STARS } from '@/data/sky'
import { EQ_TO_GAL, apply, vecFromRaDec, type Vec3 } from '@/lib/astro'
import { buildStars } from '@/lib/skyGeometry'
import { fmtMag } from '@/lib/skyInfo'
import {
  ECLIPTIC, FIGURES, buildDeepField, FIGURE_BY_ID, FIGURES_OF, HOME, INTRO_FOV, easeOut, figureOf, flyTo,
  fovForFigure, isFigureId, makeFrame, niceSpan, panByPixels, projectBuffer, projectTo, pxPerDegreeAt, stepView, targetFor,
  zoomAt, fmtFov, type Frame, type MapControl,
} from '@/lib/starMap'

const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif'
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'
const SIGNAL = '143,180,255'
const INK = '232,236,244'
const WARM = '255,217,176'

interface Props {
  ctrl: MapControl
  /** false under prefers-reduced-motion: no intro, no flights, no inertia. */
  animate: boolean
  /** Procedural faint stars (on top of the 148 catalogue stars). */
  fieldCount: number
  /** Faint telescope-style layer shown only when zoomed in. */
  deepCount: number
  maxDpr: number
  /** Chapter is on screen; the loop idles otherwise. */
  active: boolean
  onReady: () => void
}

interface Hit {
  id: string
  x: number
  y: number
  r: number
}
interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}
interface ConHit extends Rect {
  id: string
}

/** Milky Way is evaluated on a coarse grid (one cell per this many px) and smoothed up by the canvas. */
const MW_CELL = 14

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** Faintest magnitude drawn: widening the view hides the faint end, zooming in reveals it. */
const limMag = (fov: number) => 6.5 - 1.3 * clamp01((fov - 25) / 145) ** 0.7
/** The deep layer's limit: nothing at 35° and wider, everything (to magnitude 10) by about 6°. */
const deepLim = (fov: number) => 6.4 + 3.6 * clamp01((36 - fov) / 30) ** 0.85

/** How important a label must be to appear at this field of view. */
const labelFloor = (fov: number) =>
  fov >= 130 ? 9 : fov >= 100 ? 8 : fov >= 70 ? 6 : fov >= 45 ? 5 : fov >= 28 ? 4 : fov >= 16 ? 3 : fov >= 9 ? 2 : 0

function setSpacing(ctx: CanvasRenderingContext2D, px: number) {
  ;(ctx as unknown as { letterSpacing: string }).letterSpacing = `${px}px`
}

/**
 * Chapter 07 — the star map canvas. A stereographic chart of the equatorial sky (J2000): a dense field, constellation
 * figures, 148 selectable catalogue stars and the deep-sky objects, with a graticule, scale bar and collision-culled
 * labels. Renders on demand: while the view is moving or a selection is settling, and not at all when idle or off screen.
 */
export default function StarMapScene({ ctrl, animate, fieldCount, deepCount, maxDpr, active, onReady }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const activeRef = useRef(active)
  const kick = useRef<(() => void) | null>(null)
  const intro = useRef<(() => void) | null>(null)

  useEffect(() => {
    activeRef.current = active
    if (active) {
      intro.current?.()
      kick.current?.()
    }
  }, [active])

  useEffect(() => {
    const cv0 = canvas.current
    const ctx0 = cv0?.getContext('2d', { alpha: false })
    if (!cv0 || !ctx0) return
    // Explicit types: the hoisted drawing functions below do not inherit the null-narrowing above.
    const cv: HTMLCanvasElement = cv0
    const ctx: CanvasRenderingContext2D = ctx0
    const parent = cv.parentElement as HTMLElement

    // --- data (shared architecture: the Observatory's star buffers, built once) -------------------------------------
    const stars = buildStars(fieldCount)
    const real = stars.real
    const flux = new Float32Array(stars.count)
    for (let i = 0; i < stars.count; i++) flux[i] = 10 ** (-0.4 * (stars.mag[i] - 3))
    const proj = new Float32Array(stars.count * 3)
    const dsoDir: Record<string, Vec3> = Object.fromEntries(DEEP_SKY.map((o) => [o.id, vecFromRaDec(o.ra, o.dec)]))
    const raws = [...STARS, ...DEEP_SKY]

    // --- sizing -----------------------------------------------------------------------------------------------------
    let W = 0
    let H = 0
    let dpr = 1
    let fs = 1
    let field: HTMLCanvasElement | null = null
    let fctx: CanvasRenderingContext2D | null = null
    let img: ImageData | null = null
    let u32: Uint32Array | null = null
    let bg: CanvasGradient | null = null
    let mw: HTMLCanvasElement | null = null
    let mwCtx: CanvasRenderingContext2D | null = null
    let mwImg: ImageData | null = null
    let mwW = 0
    let mwH = 0
    // Built the first time the view is zoomed in far enough to need it.
    let deep: ReturnType<typeof buildDeepField> | null = null
    let deepProj: Float32Array | null = null
    let vig: CanvasGradient | null = null

    const resize = () => {
      const r = parent.getBoundingClientRect()
      W = Math.max(1, Math.round(r.width))
      H = Math.max(1, Math.round(r.height))
      dpr = Math.min(window.devicePixelRatio || 1, maxDpr)
      fs = Math.min(dpr, maxDpr >= 2 ? 1.5 : 1)
      cv.width = Math.round(W * dpr)
      cv.height = Math.round(H * dpr)
      field = document.createElement('canvas')
      field.width = Math.max(1, Math.round(W * fs))
      field.height = Math.max(1, Math.round(H * fs))
      fctx = field.getContext('2d')
      img = fctx ? fctx.createImageData(field.width, field.height) : null
      u32 = img ? new Uint32Array(img.data.buffer) : null
      const g = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.hypot(W, H) * 0.62)
      g.addColorStop(0, '#0b1226')
      g.addColorStop(0.55, '#060913')
      g.addColorStop(1, '#03040a')
      bg = g
      mwW = Math.ceil(W / MW_CELL) + 1
      mwH = Math.ceil(H / MW_CELL) + 1
      mw = document.createElement('canvas')
      mw.width = mwW
      mw.height = mwH
      mwCtx = mw.getContext('2d')
      mwImg = mwCtx ? mwCtx.createImageData(mwW, mwH) : null
      const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62)
      v.addColorStop(0, 'rgba(3,4,10,0)')
      v.addColorStop(1, 'rgba(3,4,10,0.62)')
      vig = v
      request()
    }

    // --- per-frame state --------------------------------------------------------------------------------------------
    let raf = 0
    let last = 0
    let introT0 = 0
    let introStarted = false
    let introDone = !animate
    let lastSel: string | null = null
    let selAt = -10
    let hover: string | null = null
    let readyFired = false
    let lastView = 0
    let hits: Hit[] = []
    let conHits: ConHit[] = []
    let touchLike = false
    const widthCache = new Map<string, number>()
    const tmp: [number, number] = [0, 0]

    const measure = (font: string, text: string) => {
      const key = `${font}|${text}`
      let w = widthCache.get(key)
      if (w === undefined) {
        ctx.font = font
        w = ctx.measureText(text).width
        widthCache.set(key, w)
      }
      return w
    }

    function request() {
      if (!raf && activeRef.current) raf = requestAnimationFrame(frame)
    }

    function frame(tms: number) {
      raf = 0
      const now = tms / 1000
      const dt = last ? Math.min(0.05, now - last) : 1 / 60
      last = now
      const moving = stepView(ctrl, dt, now)
      const ia = !introStarted ? 0 : animate ? easeOut(clamp01((now - introT0) / 2.6)) : 1
      if (introStarted && now - introT0 > 2.8) introDone = true
      if (ctrl.selected !== lastSel) {
        lastSel = ctrl.selected
        selAt = now
      }
      draw(now, ia)
      if (!readyFired) {
        readyFired = true
        onReady()
      }
      if (ctrl.onView && (moving || now - lastView > 0.2)) {
        if (now - lastView > 0.1 || !moving) {
          lastView = now
          ctrl.onView({ ra: ctrl.ra, dec: ctrl.dec, fov: ctrl.fov })
        }
      }
      const settling = now - selAt < 0.9 || (introStarted && !introDone)
      if (moving || settling) request()
      else last = 0
    }

    // --- drawing ----------------------------------------------------------------------------------------------------
    function draw(now: number, ia: number) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      ctx.fillStyle = bg ?? '#03040a'
      ctx.fillRect(0, 0, W, H)
      if (ia <= 0) return

      const f = makeFrame(ctrl, W, H)
      const fov = ctrl.fov
      const ppd = pxPerDegreeAt(H, fov)
      projectBuffer(stars.pos, stars.count, f, proj)
      if (fov < 36) drawDeep(f, fov, ia)

      drawMilkyWay(f, ia)
      if (ctrl.grid) drawGrid(f, fov, ia)
      if (ctrl.ecliptic) drawEcliptic(f, ia)
      drawField(fov, ia)
      const selId = ctrl.selected
      const selFig = selId ? (isFigureId(selId) ? figureOf(selId) : FIGURE_BY_ID[FIGURES_OF[selId]?.[0] ?? '']) : undefined
      if (ctrl.figures) drawFigures(f, ia, selFig?.id ?? null, selId !== null && isFigureId(selId))
      hits = []
      drawCatalogue(f, fov, ia)
      drawLabels(f, fov, ia, selId)
      drawMarkers(f, now, selId)
      drawScale(ppd, fov, ia)

      ctx.globalAlpha = 1
      ctx.fillStyle = vig ?? 'transparent'
      ctx.fillRect(0, 0, W, H)
    }

    function drawMilkyWay(f: Frame, ia: number) {
      if (!mw || !mwCtx || !mwImg) return
      // Inverse stereographic projection per cell: pixel -> sky direction -> galactic latitude/longitude -> brightness.
      // A smooth field (not stroked lines), so there are no edges or joins at any zoom.
      const [fx, fy, fz] = f.b.fwd
      const [rx, ry, rz] = f.b.right
      const [ux, uy, uz] = f.b.up
      const u8 = mwImg.data
      const D = 180 / Math.PI
      for (let j = 0; j < mwH; j++) {
        for (let i = 0; i < mwW; i++) {
          const o = (j * mwW + i) * 4
          const X = ((i + 0.5) * MW_CELL - f.cx) / f.k
          const Y = -((j + 0.5) * MW_CELL - f.cy) / f.k
          const r2 = X * X + Y * Y
          const cosT = (1 - r2) / (1 + r2)
          if (cosT < -0.92) {
            u8[o] = u8[o + 1] = u8[o + 2] = 0
            u8[o + 3] = 255
            continue
          }
          const rho = Math.sqrt(r2)
          const k = rho > 1e-9 ? 2 / (1 + r2) : 0 // sinθ / ρ
          const dx = cosT * fx + k * (X * rx + Y * ux)
          const dy = cosT * fy + k * (X * ry + Y * uy)
          const dz = cosT * fz + k * (X * rz + Y * uz)
          const g = apply(EQ_TO_GAL, [dx, dy, dz])
          const bd = Math.asin(Math.max(-1, Math.min(1, g[2]))) * D
          let ld = Math.atan2(g[1], g[0]) * D
          if (ld > 180) ld -= 360
          const band = 0.62 * Math.exp(-0.5 * (bd / 7) ** 2) + 0.38 * Math.exp(-0.5 * (bd / 18) ** 2)
          const bulge = Math.exp(-0.5 * (ld / 24) ** 2 - 0.5 * (bd / 10) ** 2)
          const mott = 0.78 + 0.22 * Math.sin(ld * 0.16 + bd * 0.31) * Math.sin(bd * 0.52 - ld * 0.065)
          const lane = 1 - 0.4 * Math.exp(-0.5 * (bd / 1.7) ** 2) * (0.5 + 0.5 * Math.sin(ld * 0.071 + 1.3))
          const I = (band * mott * lane + 0.55 * bulge) * 0.17 * ia
          const warm = Math.min(1, bulge * 1.2)
          u8[o] = (150 + 105 * warm) * I
          u8[o + 1] = (168 + 49 * warm) * I
          u8[o + 2] = (215 - 39 * warm) * I
          u8[o + 3] = 255
        }
      }
      mwCtx.putImageData(mwImg, 0, 0)
      ctx.globalCompositeOperation = 'lighter'
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(mw, 0, 0, mwW * MW_CELL, mwH * MW_CELL)
      ctx.globalCompositeOperation = 'source-over'
    }

    function drawGrid(f: Frame, fov: number, ia: number) {
      const step = fov > 110 ? 30 : fov > 55 ? 15 : fov > 28 ? 10 : fov > 13 ? 5 : fov > 6 ? 2 : fov > 3 ? 1 : 0.5
      const span = Math.min(180, Math.max(fov, fov * (W / H)) * 0.62 + 6)
      const polar = Math.abs(ctrl.dec) + span > 80
      const raSpan = polar ? 180 : Math.min(180, span / Math.max(0.2, Math.cos((Math.abs(ctrl.dec) + span * 0.5) * (Math.PI / 180))))
      const lab = `rgba(154,163,184,${(0.62 * ia).toFixed(3)})`
      ctx.font = `9.5px ${MONO}`
      setSpacing(ctx, 1.1)
      ctx.textBaseline = 'middle'

      // Declination circles
      const d0 = Math.max(-90 + step, Math.ceil((ctrl.dec - span) / step) * step)
      for (let d = d0; d <= Math.min(90 - step, ctrl.dec + span); d += step) {
        const n = 72
        ctx.strokeStyle = `rgba(${SIGNAL},${((d === 0 ? 0.17 : 0.075) * ia).toFixed(3)})`
        ctx.lineWidth = 1
        ctx.beginPath()
        let pen = false
        let best: [number, number] | null = null
        for (let i = 0; i <= n; i++) {
          const ra = ctrl.ra + (i / n - 0.5) * 2 * raSpan
          const v = vecFromRaDec(ra, d)
          if (!projectTo(v, f, tmp)) {
            pen = false
            continue
          }
          if (pen) ctx.lineTo(tmp[0], tmp[1])
          else ctx.moveTo(tmp[0], tmp[1])
          pen = true
          if (tmp[0] >= 18 && tmp[1] > 70 && tmp[1] < H - 70 && (!best || tmp[0] < best[0])) best = [tmp[0], tmp[1]]
        }
        ctx.stroke()
        if (best) {
          ctx.fillStyle = lab
          ctx.textAlign = 'left'
          ctx.fillText(`${d < 0 ? '\u2212' : d > 0 ? '+' : ''}${Math.abs(Math.round(d * 10) / 10)}°`, best[0] + 6, best[1] - 8)
        }
      }

      // Right-ascension meridians
      const r0 = Math.ceil((ctrl.ra - raSpan) / step) * step
      for (let ra = r0; ra <= ctrl.ra + raSpan; ra += step) {
        const dLo = Math.max(-90, ctrl.dec - span)
        const dHi = Math.min(90, ctrl.dec + span)
        const n = 48
        ctx.strokeStyle = `rgba(${SIGNAL},${(0.075 * ia).toFixed(3)})`
        ctx.beginPath()
        let pen = false
        let best: [number, number] | null = null
        for (let i = 0; i <= n; i++) {
          const v = vecFromRaDec(ra, dLo + ((dHi - dLo) * i) / n)
          if (!projectTo(v, f, tmp)) {
            pen = false
            continue
          }
          if (pen) ctx.lineTo(tmp[0], tmp[1])
          else ctx.moveTo(tmp[0], tmp[1])
          pen = true
          if (tmp[1] <= H - 56 && tmp[0] > 90 && tmp[0] < W - 90 && (!best || tmp[1] > best[1])) best = [tmp[0], tmp[1]]
        }
        ctx.stroke()
        if (best) {
          const h = ((((ra / 15) % 24) + 24) % 24)
          const hh = Math.floor(h + 1e-6)
          const mm = Math.round((h - hh) * 60)
          ctx.fillStyle = lab
          ctx.textAlign = 'left'
          ctx.fillText(mm ? `${hh}h ${String(mm).padStart(2, '0')}m` : `${hh}h`, best[0] + 6, best[1] - 8)
        }
      }
      setSpacing(ctx, 0)
    }

    function drawEcliptic(f: Frame, ia: number) {
      ctx.strokeStyle = `rgba(${WARM},${(0.34 * ia).toFixed(3)})`
      ctx.lineWidth = 1
      ctx.setLineDash([7, 6])
      ctx.beginPath()
      let pen = false
      let tag: [number, number] | null = null
      const n = ECLIPTIC.length / 3
      for (let i = 0; i < n; i++) {
        if (!projectTo([ECLIPTIC[i * 3], ECLIPTIC[i * 3 + 1], ECLIPTIC[i * 3 + 2]], f, tmp)) {
          pen = false
          continue
        }
        if (pen) ctx.lineTo(tmp[0], tmp[1])
        else ctx.moveTo(tmp[0], tmp[1])
        pen = true
        if (tmp[0] > 40 && tmp[0] < W - 40 && tmp[1] > 90 && tmp[1] < H - 90 && (!tag || Math.abs(tmp[0] - W * 0.72) < Math.abs(tag[0] - W * 0.72))) tag = [tmp[0], tmp[1]]
      }
      ctx.stroke()
      ctx.setLineDash([])
      if (tag) {
        ctx.font = `9.5px ${MONO}`
        setSpacing(ctx, 1.4)
        ctx.fillStyle = `rgba(${WARM},${(0.7 * ia).toFixed(3)})`
        ctx.textAlign = 'left'
        ctx.textBaseline = 'middle'
        ctx.fillText('ECLIPTIC', tag[0] + 8, tag[1] - 10)
        setSpacing(ctx, 0)
      }
    }

    function drawDeep(f: Frame, fov: number, ia: number) {
      if (deepCount <= 0) return
      if (!deep) {
        deep = buildDeepField(deepCount)
        deepProj = new Float32Array(deep.count * 3)
      }
      if (!deepProj) return
      projectBuffer(deep.pos, deep.count, f, deepProj)
      const lim = deepLim(fov)
      const zoom = (36 / fov) ** 0.3
      for (let i = 0; i < deep.count; i++) {
        const o = i * 3
        if (!deepProj[o + 2]) continue
        const x = deepProj[o]
        const y = deepProj[o + 1]
        if (x < -2 || y < -2 || x > W + 2 || y > H + 2) continue
        const fade = clamp01((lim - deep.mag[i]) * 1.6)
        if (fade <= 0) continue
        const br = 10 ** (-0.4 * (deep.mag[i] - 6.4))
        const a = (0.3 + 0.55 * br ** 0.4) * fade * ia
        const r = (0.45 + 0.9 * br ** 0.4) * zoom
        ctx.fillStyle = `rgba(${Math.round(deep.col[o] * 255)},${Math.round(deep.col[o + 1] * 255)},${Math.round(deep.col[o + 2] * 255)},${a.toFixed(2)})`
        if (r < 1) ctx.fillRect(x - 0.6, y - 0.6, 1.2, 1.2)
        else {
          ctx.beginPath()
          ctx.arc(x, y, r, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    function drawField(fov: number, ia: number) {
      const lim = limMag(fov)
      if (fov >= 22 && fctx && field && img && u32) {
        // Wide view: additive sub-pixel splats into one pixel buffer, then composited. Thousands of stars, one draw call.
        u32.fill(0xff000000)
        const d = img.data
        const fw = field.width
        const fh = field.height
        for (let i = real; i < stars.count; i++) {
          const o = i * 3
          if (!proj[o + 2]) continue
          const x = proj[o] * fs
          const y = proj[o + 1] * fs
          if (x < 0 || y < 0 || x >= fw - 1 || y >= fh - 1) continue
          const fade = clamp01((lim - stars.mag[i]) * 1.6)
          if (fade <= 0) continue
          const a = (0.36 + 0.64 * flux[i] ** 0.4) * fade * ia * 255
          const ix = x | 0
          const iy = y | 0
          const fx = x - ix
          const fy = y - iy
          const p = (iy * fw + ix) * 4
          const w00 = (1 - fx) * (1 - fy)
          const w10 = fx * (1 - fy)
          const w01 = (1 - fx) * fy
          const w11 = fx * fy
          for (let c = 0; c < 3; c++) {
            const v = stars.col[o + c] * a
            d[p + c] += v * w00
            d[p + 4 + c] += v * w10
            d[p + fw * 4 + c] += v * w01
            d[p + fw * 4 + 4 + c] += v * w11
          }
        }
        fctx.putImageData(img, 0, 0)
        ctx.globalCompositeOperation = 'lighter'
        ctx.drawImage(field, 0, 0, W, H)
        ctx.globalCompositeOperation = 'source-over'
        return
      }
      // Close view: few stars on screen, so draw each one crisply.
      const zoom = (60 / fov) ** 0.35
      for (let i = real; i < stars.count; i++) {
        const o = i * 3
        if (!proj[o + 2]) continue
        const x = proj[o]
        const y = proj[o + 1]
        if (x < -4 || y < -4 || x > W + 4 || y > H + 4) continue
        const fade = clamp01((lim - stars.mag[i]) * 1.6)
        if (fade <= 0) continue
        const a = (0.45 + 0.55 * flux[i] ** 0.4) * fade * ia
        const r = (0.5 + 1.7 * flux[i] ** 0.4) * zoom
        ctx.fillStyle = `rgba(${Math.round(stars.col[o] * 255)},${Math.round(stars.col[o + 1] * 255)},${Math.round(stars.col[o + 2] * 255)},${a.toFixed(3)})`
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    function drawFigures(f: Frame, ia: number, focusFig: string | null, figSelected: boolean) {
      const a = [tmp[0], tmp[1]] as [number, number]
      const b = [0, 0] as [number, number]
      const batch = (pick: (id: string, aster: boolean) => boolean, style: string, width: number) => {
        ctx.strokeStyle = style
        ctx.lineWidth = width
        ctx.beginPath()
        for (const fig of FIGURES) {
          if (!pick(fig.id, fig.asterism)) continue
          const s = fig.seg
          for (let i = 0; i < s.length; i += 6) {
            if (!projectTo([s[i], s[i + 1], s[i + 2]], f, a) || !projectTo([s[i + 3], s[i + 4], s[i + 5]], f, b)) continue
            if ((a[0] < -60 && b[0] < -60) || (a[0] > W + 60 && b[0] > W + 60) || (a[1] < -60 && b[1] < -60) || (a[1] > H + 60 && b[1] > H + 60)) continue
            ctx.moveTo(a[0], a[1])
            ctx.lineTo(b[0], b[1])
          }
        }
        ctx.stroke()
      }
      batch((id, aster) => !aster && id !== focusFig, `rgba(${SIGNAL},${(0.3 * ia).toFixed(3)})`, 1)
      batch((id, aster) => aster && id !== focusFig, `rgba(${SIGNAL},${(0.15 * ia).toFixed(3)})`, 1)
      if (focusFig) batch((id) => id === focusFig, `rgba(${SIGNAL},${((figSelected ? 0.85 : 0.55) * ia).toFixed(3)})`, figSelected ? 1.6 : 1.2)
    }

    function sizeOf(mag: number, fov: number) {
      return (0.9 + Math.max(0, 4.6 - mag) * 0.62) * (60 / fov) ** 0.18
    }

    function drawCatalogue(f: Frame, fov: number, ia: number) {
      // Catalogue stars: real colour, a soft glow on the brightest.
      for (let i = 0; i < real; i++) {
        const o = i * 3
        if (!proj[o + 2]) continue
        const x = proj[o]
        const y = proj[o + 1]
        if (x < -30 || y < -30 || x > W + 30 || y > H + 30) continue
        const s = STARS[i]
        const r = sizeOf(s.mag, fov)
        const cr = Math.round(stars.col[o] * 255)
        const cg = Math.round(stars.col[o + 1] * 255)
        const cb = Math.round(stars.col[o + 2] * 255)
        if (s.mag < 2.6) {
          const gr = r * 5.5
          const g = ctx.createRadialGradient(x, y, 0, x, y, gr)
          g.addColorStop(0, `rgba(${cr},${cg},${cb},${(0.34 * ia).toFixed(3)})`)
          g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
          ctx.fillStyle = g
          ctx.fillRect(x - gr, y - gr, gr * 2, gr * 2)
        }
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${((s.mag < 3.6 ? 1 : 0.85) * ia).toFixed(3)})`
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
        hits.push({ id: s.id, x, y, r: Math.max(10, r + 6) })
      }
      // Deep-sky objects: one symbol per kind, never mistaken for a star.
      ctx.lineWidth = 1
      for (const o of DEEP_SKY) {
        if (!projectTo(dsoDir[o.id], f, tmp)) continue
        const [x, y] = tmp
        if (x < -30 || y < -30 || x > W + 30 || y > H + 30) continue
        const centre = o.kind === 'centre'
        const t = (o.type ?? '').toLowerCase()
        ctx.strokeStyle = centre ? `rgba(${WARM},${(0.85 * ia).toFixed(3)})` : `rgba(${SIGNAL},${(0.78 * ia).toFixed(3)})`
        ctx.beginPath()
        if (t.includes('galaxy')) ctx.ellipse(x, y, 9, 4.5, -0.5, 0, Math.PI * 2)
        else ctx.arc(x, y, centre ? 6 : 7, 0, Math.PI * 2)
        ctx.stroke()
        if (t.includes('globular') || centre) {
          ctx.beginPath()
          ctx.moveTo(x - 10, y)
          ctx.lineTo(x + 10, y)
          ctx.moveTo(x, y - 10)
          ctx.lineTo(x, y + 10)
          ctx.stroke()
        } else if (!t.includes('galaxy')) {
          ctx.setLineDash([2, 3])
          ctx.beginPath()
          ctx.arc(x, y, 11, 0, Math.PI * 2)
          ctx.stroke()
          ctx.setLineDash([])
        }
        hits.push({ id: o.id, x, y, r: 14 })
      }
    }

    function drawLabels(f: Frame, fov: number, ia: number, selId: string | null) {
      conHits = []
      const placed: Rect[] = []
      const free = (r: Rect) => r.x0 >= 4 && r.x1 <= W - 4 && r.y0 >= 4 && r.y1 <= H - 4 && !placed.some((p) => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0)
      const show = ctrl.names
      const floor = labelFloor(fov)
      const nameFont = `12px ${SANS}`
      const subFont = `9.5px ${MONO}`
      const wantSub = fov < 34
      const byId = new Map<string, Hit>(hits.map((h): [string, Hit] => [h.id, h]))
      const forced = new Set<string>()
      if (selId && !isFigureId(selId)) forced.add(selId)
      if (hover) forced.add(hover)

      const order = raws
        .filter((o) => byId.has(o.id) && (forced.has(o.id) || (show && (o.label >= Math.max(1, floor) || (floor === 0 && fov < 14)))))
        .sort((a, b) => Number(forced.has(b.id)) - Number(forced.has(a.id)) || b.label - a.label || a.mag - b.mag)

      let drawn = 0
      for (const o of order) {
        if (drawn > 70 && !forced.has(o.id)) break
        const h = byId.get(o.id)!
        const r = o.kind === 'star' ? sizeOf(o.mag, fov) : 9
        const nameW = measure(nameFont, o.name)
        const sub = wantSub || forced.has(o.id) ? `${o.designation ?? ''}${o.kind === 'star' ? ` · ${fmtMag(o.mag)}` : ''}` : ''
        const subW = sub ? measure(subFont, sub) : 0
        const w = Math.max(nameW, subW)
        const hgt = sub ? 25 : 14
        const right: Rect = { x0: h.x + r + 8, y0: h.y - 9, x1: h.x + r + 8 + w, y1: h.y - 9 + hgt }
        const left: Rect = { x0: h.x - r - 8 - w, y0: h.y - 9, x1: h.x - r - 8, y1: h.y - 9 + hgt }
        const spot = free(right) ? right : free(left) ? left : forced.has(o.id) ? right : null
        if (!spot) continue
        placed.push(spot)
        drawn++
        const isSel = o.id === selId
        const alpha = (forced.has(o.id) ? 1 : 0.8) * ia
        ctx.textBaseline = 'alphabetic'
        ctx.textAlign = spot === right ? 'left' : 'right'
        const tx = spot === right ? spot.x0 : spot.x1
        ctx.font = nameFont
        ctx.fillStyle = isSel ? `rgba(${SIGNAL},${alpha.toFixed(3)})` : `rgba(${INK},${alpha.toFixed(3)})`
        ctx.shadowColor = 'rgba(3,4,10,0.9)'
        ctx.shadowBlur = 5
        ctx.fillText(o.name, tx, spot.y0 + 10)
        if (sub) {
          ctx.font = subFont
          setSpacing(ctx, 0.6)
          ctx.fillStyle = `rgba(154,163,184,${(0.85 * ia).toFixed(3)})`
          ctx.fillText(sub, tx, spot.y0 + 22)
          setSpacing(ctx, 0)
        }
        ctx.shadowBlur = 0
      }

      // Constellation names: after the stars, so they only take what is left.
      const conAlpha = clamp01((fov - 12) / 16)
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'center'
      ctx.font = `9.5px ${MONO}`
      for (const fig of FIGURES) {
        const isSel = selId === `con:${fig.id}`
        const live = show && conAlpha > 0 && (!fig.asterism || fov > 45)
        if (!live && !isSel) continue
        if (!projectTo(fig.centre, f, tmp)) continue
        const [x, y] = tmp
        const text = fig.name.toUpperCase()
        const spacing = fig.asterism ? 1.4 : 2.4
        const w = measure(`9.5px ${MONO}`, text) + text.length * spacing
        const r: Rect = { x0: x - w / 2, y0: y - 8, x1: x + w / 2, y1: y + 8 }
        if (!isSel && !free(r)) continue
        placed.push(r)
        conHits.push({ id: `con:${fig.id}`, ...r })
        setSpacing(ctx, spacing)
        const a = (isSel ? 1 : fig.asterism ? 0.4 : 0.58) * (isSel ? 1 : conAlpha) * ia
        ctx.fillStyle = `rgba(${SIGNAL},${a.toFixed(3)})`
        ctx.fillText(text, x + spacing / 2, y)
        setSpacing(ctx, 0)
      }
    }

    function drawMarkers(f: Frame, now: number, selId: string | null) {
      const byId = new Map<string, Hit>(hits.map((h): [string, Hit] => [h.id, h]))
      if (hover && hover !== selId) {
        const h = byId.get(hover)
        if (h) {
          ctx.strokeStyle = `rgba(${INK},0.55)`
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.arc(h.x, h.y, h.r + 3, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
      if (selId && !isFigureId(selId)) {
        const h = byId.get(selId)
        if (h) {
          const t = clamp01((now - selAt) / 0.7)
          const e = easeOut(t)
          const R = (h.r + 8) * (1 + (1 - e) * 2.4)
          ctx.strokeStyle = `rgba(${SIGNAL},${(0.35 + 0.6 * e).toFixed(3)})`
          ctx.lineWidth = 1.2
          for (let q = 0; q < 4; q++) {
            const a0 = (q * Math.PI) / 2 + 0.28 + (1 - e) * 1.2
            ctx.beginPath()
            ctx.arc(h.x, h.y, R, a0, a0 + Math.PI / 2 - 0.56)
            ctx.stroke()
          }
          ctx.beginPath()
          for (let q = 0; q < 4; q++) {
            const a = (q * Math.PI) / 2 + (1 - e) * 1.2
            ctx.moveTo(h.x + Math.cos(a) * (R + 3), h.y + Math.sin(a) * (R + 3))
            ctx.lineTo(h.x + Math.cos(a) * (R + 9), h.y + Math.sin(a) * (R + 9))
          }
          ctx.stroke()
        }
      }
      // Centre tick: the point RA/Dec in the readout refers to.
      ctx.strokeStyle = `rgba(${INK},0.22)`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(f.cx - 7, f.cy)
      ctx.lineTo(f.cx + 7, f.cy)
      ctx.moveTo(f.cx, f.cy - 7)
      ctx.lineTo(f.cx, f.cy + 7)
      ctx.stroke()
    }

    function drawScale(ppd: number, fov: number, ia: number) {
      const span = niceSpan(fov)
      const len = span * ppd
      const x = 24
      const y = H - 66
      ctx.strokeStyle = `rgba(${INK},${(0.5 * ia).toFixed(3)})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, y - 4)
      ctx.lineTo(x, y + 4)
      ctx.moveTo(x, y)
      ctx.lineTo(x + len, y)
      ctx.moveTo(x + len, y - 4)
      ctx.lineTo(x + len, y + 4)
      ctx.stroke()
      ctx.font = `9.5px ${MONO}`
      setSpacing(ctx, 1.2)
      ctx.fillStyle = `rgba(154,163,184,${(0.8 * ia).toFixed(3)})`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(`${fmtFov(span)} · FIELD ${fmtFov(fov)}`, x, y - 9)
      setSpacing(ctx, 0)
    }

    // --- interaction ------------------------------------------------------------------------------------------------
    const pointers = new Map<number, { x: number; y: number }>()
    let dragMoved = 0
    let pinch = 0
    let lastMove = 0
    let vx = 0
    let vy = 0

    const local = (e: { clientX: number; clientY: number }) => {
      const r = cv.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const snap = () => {
      ctrl.ra = ctrl.tRa
      ctrl.dec = ctrl.tDec
      ctrl.fov = ctrl.tFov
    }
    const nearest = (x: number, y: number): string | null => {
      const reach = touchLike ? 22 : 0
      let best: string | null = null
      let bd = Infinity
      for (const h of hits) {
        const d = Math.hypot(h.x - x, h.y - y)
        const lim = Math.max(h.r, reach)
        if (d <= lim && d < bd) {
          bd = d
          best = h.id
        }
      }
      return best
    }
    const conAt = (x: number, y: number) => conHits.find((r) => x >= r.x0 - 4 && x <= r.x1 + 4 && y >= r.y0 - 4 && y <= r.y1 + 4)?.id ?? null

    const select = (id: string | null, fromClick: boolean) => {
      ctrl.selected = id
      ctrl.onSelect?.(id)
      if (id && fromClick) {
        const t = targetFor(id)
        if (t) flyTo(ctrl, t.ra, t.dec, isFigureId(id) ? t.fov : Math.min(ctrl.fov, ctrl.fov > 40 ? 30 : ctrl.fov), performance.now() / 1000, !animate)
      }
      request()
    }

    const onDown = (e: PointerEvent) => {
      touchLike = e.pointerType !== 'mouse'
      cv.focus({ preventScroll: true })
      cv.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, local(e))
      if (pointers.size === 1) {
        dragMoved = 0
        vx = vy = 0
        lastMove = performance.now()
        ctrl.flight = null
        ctrl.vRa = ctrl.vDec = 0
      }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        pinch = Math.hypot(a.x - b.x, a.y - b.y)
      }
      cv.style.cursor = 'grabbing'
    }
    const onMove = (e: PointerEvent) => {
      const p = local(e)
      const prev = pointers.get(e.pointerId)
      if (!prev) {
        if (e.pointerType === 'mouse') {
          const h = nearest(p.x, p.y)
          const c = h ? null : conAt(p.x, p.y)
          if (h !== hover) {
            hover = h
            request()
          }
          cv.style.cursor = h || c ? 'pointer' : 'grab'
        }
        return
      }
      if (pointers.size === 2) {
        pointers.set(e.pointerId, p)
        const [a, b] = [...pointers.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (pinch > 0 && d > 0) {
          zoomAt(ctrl, pinch / d, (a.x + b.x) / 2 - W / 2, (a.y + b.y) / 2 - H / 2, H)
          snap()
          dragMoved += 20
        }
        pinch = d
        request()
        return
      }
      const dx = p.x - prev.x
      const dy = p.y - prev.y
      pointers.set(e.pointerId, p)
      dragMoved += Math.abs(dx) + Math.abs(dy)
      if (dragMoved < 4) return
      const ra0 = ctrl.tRa
      const dec0 = ctrl.tDec
      panByPixels(ctrl, dx, dy, H)
      snap()
      const t = performance.now()
      const dt = Math.max(0.008, (t - lastMove) / 1000)
      lastMove = t
      const ra = ((ctrl.tRa - ra0 + 540) % 360) - 180
      vx = vx * 0.6 + (ra / dt) * 0.4
      vy = vy * 0.6 + ((ctrl.tDec - dec0) / dt) * 0.4
      request()
    }
    const onUp = (e: PointerEvent) => {
      const had = pointers.delete(e.pointerId)
      if (!had) return
      cv.style.cursor = 'grab'
      if (pointers.size > 0) {
        pinch = 0
        return
      }
      if (dragMoved < 5) {
        const p = local(e)
        const id = nearest(p.x, p.y) ?? conAt(p.x, p.y)
        select(id, id !== null)
      } else if (animate && performance.now() - lastMove < 80) {
        const speed = Math.hypot(vx, vy)
        const cap = Math.min(1, 400 / Math.max(speed, 1))
        ctrl.vRa = vx * cap
        ctrl.vDec = vy * cap
        request()
      }
    }
    const onWheel = (e: WheelEvent) => {
      // A plain wheel scrolls the page until the map has focus (a click), or unless it is a pinch (ctrl) gesture.
      if (!(e.ctrlKey || e.metaKey || document.activeElement === cv)) return
      e.preventDefault()
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
      const k = e.ctrlKey ? 0.01 : 0.0016
      const factor = Math.max(0.8, Math.min(1.25, Math.exp(e.deltaY * unit * k)))
      const p = local(e)
      zoomAt(ctrl, factor, p.x - W / 2, p.y - H / 2, H)
      if (!animate) snap()
      request()
    }
    const onKey = (e: KeyboardEvent) => {
      const stepDeg = ctrl.tFov * (e.shiftKey ? 0.32 : 0.1)
      let used = true
      const cosDec = Math.max(0.15, Math.cos((ctrl.tDec * Math.PI) / 180))
      ctrl.flight = null
      switch (e.key) {
        case 'ArrowLeft': ctrl.tRa = (ctrl.tRa + stepDeg / cosDec + 360) % 360; break
        case 'ArrowRight': ctrl.tRa = (ctrl.tRa - stepDeg / cosDec + 360) % 360; break
        case 'ArrowUp': ctrl.tDec = Math.min(89.5, ctrl.tDec + stepDeg); break
        case 'ArrowDown': ctrl.tDec = Math.max(-89.5, ctrl.tDec - stepDeg); break
        case '+': case '=': ctrl.zoomBy?.(0.68); break
        case '-': case '_': ctrl.zoomBy?.(1.47); break
        case '0': case 'Home': ctrl.reset?.(); break
        case 'Escape': select(null, false); break
        default: used = false
      }
      if (used) {
        e.preventDefault()
        if (!animate) snap()
        request()
      }
    }

    cv.addEventListener('pointerdown', onDown)
    cv.addEventListener('pointermove', onMove)
    cv.addEventListener('pointerup', onUp)
    cv.addEventListener('pointercancel', onUp)
    const onLeave = () => {
      if (hover) {
        hover = null
        request()
      }
    }
    cv.addEventListener('pointerleave', onLeave)
    cv.addEventListener('wheel', onWheel, { passive: false })
    cv.addEventListener('keydown', onKey)
    cv.style.cursor = 'grab'

    // --- hooks the chapter calls ------------------------------------------------------------------------------------
    ctrl.focusOn = (id) => {
      const t = targetFor(id)
      if (!t) return
      const fov = isFigureId(id) ? t.fov : Math.min(t.fov, Math.max(14, ctrl.fov))
      flyTo(ctrl, t.ra, t.dec, isFigureId(id) ? fovForFigure(figureOf(id)) : fov, performance.now() / 1000, !animate)
      request()
    }
    ctrl.zoomBy = (factor) => {
      zoomAt(ctrl, factor, 0, 0, H)
      if (!animate) snap()
      request()
    }
    ctrl.reset = () => {
      flyTo(ctrl, HOME.ra, HOME.dec, HOME.fov, performance.now() / 1000, !animate)
      request()
    }
    ctrl.poke = request
    kick.current = request
    intro.current = () => {
      if (introStarted) return
      introStarted = true
      introT0 = performance.now() / 1000
      if (ctrl.introPlayed) {
        introT0 -= 10 // already seen: draw at full strength, no flight
      } else if (animate) {
        ctrl.introPlayed = true
        ctrl.fov = INTRO_FOV
        flyTo(ctrl, HOME.ra, HOME.dec, HOME.fov, introT0, false)
        if (ctrl.flight) {
          ctrl.flight.dur = 3.8
          ctrl.flight.arc = 0
        }
      } else {
        ctrl.introPlayed = true
        snapHome()
      }
      request()
    }
    function snapHome() {
      ctrl.ra = ctrl.tRa = HOME.ra
      ctrl.dec = ctrl.tDec = HOME.dec
      ctrl.fov = ctrl.tFov = HOME.fov
    }

    const ro = new ResizeObserver(resize)
    ro.observe(parent)
    resize()
    if (activeRef.current) intro.current()

    return () => {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      ro.disconnect()
      cv.removeEventListener('pointerdown', onDown)
      cv.removeEventListener('pointermove', onMove)
      cv.removeEventListener('pointerup', onUp)
      cv.removeEventListener('pointercancel', onUp)
      cv.removeEventListener('pointerleave', onLeave)
      cv.removeEventListener('wheel', onWheel)
      cv.removeEventListener('keydown', onKey)
      ctrl.focusOn = ctrl.zoomBy = ctrl.reset = ctrl.poke = null
      kick.current = null
      intro.current = null
    }
  }, [ctrl, animate, fieldCount, deepCount, maxDpr, onReady])

  return (
    <canvas
      ref={canvas}
      tabIndex={0}
      role="application"
      aria-label="Interactive star map. Drag to pan, pinch or use plus and minus to zoom, arrow keys to move, click a star to select it."
      className="absolute inset-0 h-full w-full touch-none outline-none focus-visible:ring-1 focus-visible:ring-signal/60"
    />
  )
}
