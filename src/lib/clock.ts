/**
 * Seconds on one page-wide clock.
 *
 * Every pinned chapter owns its own WebGL canvas, and R3F's `clock` restarts at each mount. Anything that moves with
 * time (Earth's spin, cloud drift, lunar libration) reads this instead, so two chapters showing the same body at a
 * hand-off agree on its exact pose.
 */
export const clockSeconds = () => performance.now() / 1000
