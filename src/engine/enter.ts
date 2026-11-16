import { useStore } from './store'

/**
 * The "Enter" tap. Browsers refuse to play sound before the person has tapped / clicked / pressed a key on the page (scrolling does not count),
 * so when everything is loaded and the sound is wanted but still blocked, the loading screen waits for ONE tap. That tap is the gesture that
 * starts the sound, so the journey begins with the sound already on. If the browser already allows sound, this never shows.
 */
let resolver: (() => void) | null = null
export const waitForEnter = () => new Promise<void>((res) => { resolver = res; useStore.setState({ awaitEnter: true }) })
export const enterNow = () => { useStore.setState({ awaitEnter: false }); const r = resolver; resolver = null; r?.() }
