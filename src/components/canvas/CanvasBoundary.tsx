import { Component, type ReactNode } from 'react'

/** Keeps a failed WebGL scene (no context, texture 404) from taking the whole page down. The text stays. */
export default class CanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.warn('[ASTRA] 3D scene disabled:', error)
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}
