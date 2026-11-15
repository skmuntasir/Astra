import type { Ctx } from './lib/ctx'
import { genSun } from './gen/sun'
import { genMercury } from './gen/mercury'
import { genMars } from './gen/mars'
import { genRings } from './gen/rings'
import { genGiants } from './gen/giants'
import { genMoons } from './gen/moons'
import { genSky } from './gen/sky'
import { genGalaxies } from './gen/galaxies'
import { genCosmos } from './gen/cosmos'
import { genTiers } from './gen/tiers'
import { genStarField } from './gen/starfield'
import { genEarthNormal } from './gen/earthnormal'
import { genWeb3d } from './gen/web3d'
import { genVenusClouds, genVenusRadar } from './gen/venus'

export interface GenDef { id: string; run: (c: Ctx) => Promise<void>; outputs: string[]; sources: string[] }
/** Registry of generators. Add new bodies here. */
export const GENS: GenDef[] = [
  { id: 'sun', run: genSun, outputs: ['sun_4k.jpg', 'sun_2k.jpg'], sources: ['gen/sun.ts'] },
  { id: 'mercury', run: genMercury, outputs: ['mercury_albedo_2k.jpg', 'mercury_normal_2k.jpg'], sources: ['gen/mercury.ts'] },
  { id: 'venus', run: async (c) => { await genVenusClouds(c); await genVenusRadar(c) }, outputs: ['venus_clouds_2k.jpg', 'venus_radar_2k.jpg'], sources: ['gen/venus.ts'] },
  { id: 'mars', run: genMars, outputs: ['mars_albedo_2k.jpg', 'mars_normal_2k.jpg'], sources: ['gen/mars.ts'] },
  { id: 'rings', run: genRings, outputs: ['saturn_rings_4k.png', 'uranus_rings_2k.png', 'jupiter_ring_1k.png'], sources: ['gen/rings.ts', 'lib/ringstrip.ts', 'lib/noise.ts'] },
  { id: 'giants', run: (c) => genGiants(c), outputs: ['jupiter_4k.jpg', 'jupiter_2k.jpg', 'saturn_4k.jpg', 'saturn_2k.jpg', 'uranus_2k.jpg', 'neptune_2k.jpg'], sources: ['gen/giants.ts', 'lib/bands.ts', 'lib/save.ts'] },
  { id: 'moons', run: (c) => genMoons(c), outputs: ['pluto_2k.jpg', 'charon_1k.jpg', 'ceres_1k.jpg', 'triton_2k.jpg', 'enceladus_1k.jpg', 'io_2k.jpg', 'europa_2k.jpg', 'ganymede_2k.jpg', 'callisto_2k.jpg', 'titan_2k.jpg'], sources: ['gen/moons.ts'] },
  { id: 'sky', run: (c) => genSky(c), outputs: ['milkyway_8k.jpg', 'milkyway_4k.jpg', 'sky_fallback_256.jpg', 'stars_8k.jpg', 'stars_4k.jpg', 'stars_faint.bin', 'stars_bright.json'], sources: ['gen/sky.ts', 'lib/galactic.ts', 'data/brightStars.ts'] },
  { id: 'galaxies', run: (c) => genGalaxies(c), outputs: ['galaxy_spiral_face_2k.webp', 'galaxy_spiral_edge_2k.webp', 'galaxy_spiral_barred_2k.webp', 'galaxy_elliptical_2k.webp', 'galaxy_irregular_2k.webp', 'galaxy_m31_2k.webp', 'galaxy_m33_2k.webp', 'galaxy_milkyway_topdown_2k.webp'], sources: ['gen/galaxies.ts'] },
  { id: 'cosmos', run: (c) => genCosmos(c), outputs: ['cmb_color_2k.jpg', 'cmb_temp_2k.png', 'cosmicweb_2k.jpg', 'dust_noise_1k.png', 'bh_disc_noise_2k.png'], sources: ['gen/cosmos.ts', 'lib/fft.ts'] },
  { id: 'tiers', run: (c) => genTiers(c), outputs: ['milkyway_2k.jpg', 'stars_2k.jpg', 'cosmicweb_1k.jpg', 'galaxy_spiral_face_1k.webp', 'galaxy_spiral_edge_1k.webp', 'galaxy_spiral_barred_1k.webp', 'galaxy_elliptical_1k.webp', 'galaxy_irregular_1k.webp', 'galaxy_m31_1k.webp', 'galaxy_m33_1k.webp', 'galaxy_milkyway_topdown_1k.webp'], sources: ['gen/tiers.ts'] },
  { id: 'starfield', run: (c) => genStarField(c), outputs: ['stars_field.bin'], sources: ['gen/starfield.ts'] },
  { id: 'earthnormal', run: (c) => genEarthNormal(c), outputs: ['earth_normal_2k.jpg'], sources: ['gen/earthnormal.ts'] },
  { id: 'web3d', run: (c) => genWeb3d(c), outputs: ['cosmicweb3d.bin', 'cosmicweb3d_lo.bin'], sources: ['gen/web3d.ts'] },
]
