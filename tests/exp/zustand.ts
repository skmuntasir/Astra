// Test stub of `zustand` (the sandbox has no network, so the real package is missing): same create() contract, built on useSyncExternalStore.
import { useSyncExternalStore } from 'react'
type Listener = () => void
export function create<T>(init: (set: (p: Partial<T> | ((s: T) => Partial<T>)) => void, get: () => T) => T) {
  let state: T
  const ls = new Set<Listener>()
  const set = (p: Partial<T> | ((s: T) => Partial<T>)) => { const n = typeof p === 'function' ? (p as (s: T) => Partial<T>)(state) : p; state = { ...state, ...n }; ls.forEach((l) => l()) }
  const get = () => state
  state = init(set, get)
  const hook = <U,>(sel: (s: T) => U = (s) => s as unknown as U) => useSyncExternalStore((l) => { ls.add(l); return () => { ls.delete(l) } }, () => sel(state))
  return Object.assign(hook, { getState: get, setState: set, subscribe: (l: Listener) => { ls.add(l); return () => { ls.delete(l) } } })
}
