/**
 * Labels, markers and hover rings for the Solar System zone: a small vanilla-DOM layer (created once, never removed) so the engine
 * and App stay untouched. Planets are far too small to read at overview scale, so each gets (a) a DOM marker dot where its true disc
 * is under ~4 px (the sphere itself is never enlarged: sizes stay true) and (b) a restrained name label, which is also a real
 * <button> (keyboard focus + click -> focus(id)). Updated from <SolarFx/>'s useFrame, after the camera moved, so labels never lag.
 */
const CSS = `
.sol-ov{position:fixed;inset:0;z-index:25;pointer-events:none;overflow:hidden}
.sol-i{position:absolute;left:0;top:0;width:0;height:0;padding:0;margin:0;border:0;background:none;font:inherit;color:inherit;will-change:transform,opacity;visibility:hidden}
.sol-i>*{position:absolute;white-space:nowrap}
.sol-dot{left:-3px;top:-3px;width:6px;height:6px;border-radius:50%;box-shadow:0 0 6px currentColor}
.sol-ring{left:-15px;top:-15px;width:30px;height:30px;border-radius:50%;border:1px solid var(--accent,#7fb2ff);opacity:0;transform:scale(.7);transition:opacity .15s,transform .15s}
.sol-t{font-family:var(--font-mono,ui-monospace,monospace);font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-dim,#9aa6bf);text-shadow:0 0 8px #02030a,0 0 3px #02030a;transition:color .15s}
.sol-n{font-family:var(--font-mono,ui-monospace,monospace);font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-dim,#9aa6bf);opacity:.8;text-shadow:0 0 8px #02030a}
button.sol-i .sol-dot,button.sol-i .sol-t{pointer-events:auto;cursor:pointer}
button.sol-i:focus-visible .sol-t{outline:1px solid var(--accent,#7fb2ff);outline-offset:3px}
.sol-i.hov .sol-t{color:#fff}
.sol-i.hov .sol-ring{opacity:.95;transform:scale(1)}
@media (max-width:640px){.sol-t{font-size:9.5px;letter-spacing:.12em}}
`

export interface OverlayItem { id: string; text: string; color: string; button: boolean; onClick?: () => void; label?: boolean }
interface Rec { root: HTMLElement; dot?: HTMLElement; ring?: HTMLElement; t: HTMLElement; last: string; hov: boolean }

export class Overlay {
  private host: HTMLDivElement
  private style: HTMLStyleElement
  private items = new Map<string, Rec>()
  onHover: (id: string | null) => void = () => {}

  constructor(items: OverlayItem[], testid = 'solar-overlay') {
    // one shared stylesheet for every Overlay instance (Prompt 5 adds more instances; this file's behaviour is otherwise unchanged)
    const old = document.getElementById('sol-ov-css') as HTMLStyleElement | null
    this.style = old ?? document.createElement('style')
    if (!old) { this.style.id = 'sol-ov-css'; this.style.textContent = CSS; document.head.appendChild(this.style) }
    this.host = document.createElement('div')
    this.host.className = 'sol-ov'
    this.host.setAttribute('data-testid', testid)
    document.body.appendChild(this.host)
    for (const it of items) {
      const root = document.createElement(it.button ? 'button' : 'div')
      root.className = 'sol-i'
      if (it.button) {
        ;(root as HTMLButtonElement).type = 'button'
        root.setAttribute('aria-label', `${it.text}: fly to it`)
        root.setAttribute('data-testid', `label-${it.id}`)
        root.addEventListener('click', () => it.onClick?.())
        root.addEventListener('pointerenter', () => this.onHover(it.id))
        root.addEventListener('pointerleave', () => this.onHover(null))
      } else root.setAttribute('aria-hidden', 'true')
      let dot: HTMLElement | undefined, ring: HTMLElement | undefined
      if (it.button) {
        ring = document.createElement('span'); ring.className = 'sol-ring'
        dot = document.createElement('span'); dot.className = 'sol-dot'; dot.style.background = it.color; dot.style.color = it.color
        root.append(ring, dot)
      }
      const t = document.createElement('span')
      t.className = it.button ? 'sol-t' : 'sol-n'
      t.textContent = it.text
      root.append(t)
      this.host.appendChild(root)
      this.items.set(it.id, { root, dot, ring, t, last: '', hov: false })
    }
  }

  /**
   * x, y: CSS px of the anchor. a: opacity 0..1 of the label. dotA: opacity of the marker dot. (dx, dy): label offset from the anchor.
   * hidden elements get visibility:hidden (out of the tab order, no pointer events).
   */
  place(id: string, x: number, y: number, a: number, dotA: number, dx: number, dy: number, hover: boolean) {
    const r = this.items.get(id)
    if (!r) return
    const vis = a > 0.02 || dotA > 0.02
    if (!vis) { if (r.last === 'h') return; r.last = 'h'; r.root.style.visibility = 'hidden'; return } // a label that stays hidden costs nothing (was: a string built per label per frame)
    const key = `${vis ? 1 : 0}|${x.toFixed(1)}|${y.toFixed(1)}|${a.toFixed(2)}|${dotA.toFixed(2)}|${dx.toFixed(0)}|${dy.toFixed(0)}|${hover ? 1 : 0}`
    if (key === r.last) return
    r.last = key
    r.root.style.visibility = vis ? 'visible' : 'hidden'
    if (!vis) return
    r.root.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`
    r.root.style.opacity = String(Math.max(a, dotA))
    r.t.style.opacity = String(a > 0.02 ? Math.min(1, a / Math.max(a, dotA)) : 0)
    r.t.style.transform = `translate(${dx.toFixed(0)}px,${dy.toFixed(0)}px) translate(${dx < -2 ? '-100%' : dx > 2 ? '0%' : '-50%'},-50%)`
    if (r.dot) r.dot.style.opacity = String(dotA > 0.02 ? dotA / Math.max(a, dotA) : 0)
    if (r.hov !== hover) { r.hov = hover; r.root.classList.toggle('hov', hover) }
  }
  dispose() { this.host.remove(); this.items.clear() }
  hideAll() { for (const [, r] of this.items) { if (r.last !== 'h') { r.root.style.visibility = 'hidden'; r.last = 'h' } } }
}
