// Test stub of `lenis`: a scroll position, a limit, and the on('scroll') callback, enough for src/engine/scroll.ts.
export default class Lenis {
  scroll = 0
  limit = 10000
  isStopped = false
  cb: Array<(l: Lenis) => void> = []
  constructor(_o?: unknown) { (window as unknown as { __lenis: Lenis }).__lenis = this }
  on(e: string, f: (l: Lenis) => void) { if (e === 'scroll') this.cb.push(f) }
  stop() { this.isStopped = true }
  start() { this.isStopped = false }
  destroy() {}
  resize() {}
  raf(_t: number) {}
  scrollTo(y: number, o?: { immediate?: boolean; force?: boolean }) { if (this.isStopped && !o?.force) return; this.scroll = y; this.cb.forEach((f) => f(this)) }
}
