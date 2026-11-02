/**
 * The sky catalog for Chapter 06 — Observatory. Static, local, no network.
 *
 * Real data: positions (J2000), visual magnitudes, B–V colours, spectral types and distances of ~150 of the brightest
 * stars, plus a handful of deep-sky objects. Distances are rounded; several (Betelgeuse, Deneb, Rigel …) carry real
 * uncertainty of 10 % or more and are written with "≈".
 *
 * Not real: the faint background field (generated in `lib/skyGeometry.ts`, labelled as such in the UI) and the
 * constellation figures, which are simplified stick figures, not IAU boundaries.
 *
 * Object ids are lower-case ASCII; planets and the Moon have ids 'mercury' … 'saturn', 'moon'.
 */
export type ObjectKind = 'star' | 'planet' | 'moon' | 'dso' | 'centre'

export interface CatalogObject {
  id: string
  name: string
  kind: ObjectKind
  /** Bayer / catalogue designation. */
  designation?: string
  /** Constellation abbreviation (key of CONSTELLATION_NAMES). */
  con?: string
  /** J2000 right ascension, degrees. */
  ra: number
  /** J2000 declination, degrees. */
  dec: number
  mag: number
  /** B–V colour index (stars). */
  bv?: number
  /** Distance, light-years. */
  ly?: number
  /** Spectral class (stars) or object type (deep-sky). */
  type?: string
  /** Label priority: 0 never labelled, higher = labelled first when crowded. */
  label: number
  note?: string
}

export const CONSTELLATION_NAMES: Record<string, string> = {
  And: 'Andromeda', Aql: 'Aquila', Ari: 'Aries', Aur: 'Auriga', Boo: 'Boötes', CMa: 'Canis Major', CMi: 'Canis Minor',
  Car: 'Carina', Cas: 'Cassiopeia', Cen: 'Centaurus', Cet: 'Cetus', CrB: 'Corona Borealis', Crv: 'Corvus', Cru: 'Crux',
  Cyg: 'Cygnus', Eri: 'Eridanus', Gem: 'Gemini', Gru: 'Grus', Hya: 'Hydra', Leo: 'Leo', Lyr: 'Lyra', Oph: 'Ophiuchus',
  Ori: 'Orion', Pav: 'Pavo', Peg: 'Pegasus', Per: 'Perseus', PsA: 'Piscis Austrinus', Sco: 'Scorpius', Sgr: 'Sagittarius',
  Tau: 'Taurus', TrA: 'Triangulum Australe', UMa: 'Ursa Major', UMi: 'Ursa Minor', Vir: 'Virgo', Dor: 'Dorado', Tuc: 'Tucana',
}

// id, name, designation, con, RA (hours), Dec (deg), V mag, B–V, distance (ly), spectral type, label priority
type Row = [string, string, string, string, number, number, number, number, number, string, number]

const R: Row[] = [
  ['sirius', 'Sirius', 'α CMa', 'CMa', 6.7525, -16.716, -1.46, 0.0, 8.6, 'A1V', 9],
  ['canopus', 'Canopus', 'α Car', 'Car', 6.3992, -52.696, -0.74, 0.15, 310, 'A9II', 9],
  ['arcturus', 'Arcturus', 'α Boo', 'Boo', 14.261, 19.182, -0.05, 1.23, 37, 'K1.5III', 9],
  ['rigil', 'Rigil Kentaurus', 'α Cen', 'Cen', 14.66, -60.835, -0.27, 0.71, 4.4, 'G2V + K1V', 8],
  ['vega', 'Vega', 'α Lyr', 'Lyr', 18.6156, 38.784, 0.03, 0.0, 25, 'A0V', 9],
  ['capella', 'Capella', 'α Aur', 'Aur', 5.2782, 45.998, 0.08, 0.8, 43, 'G8III + G0III', 8],
  ['rigel', 'Rigel', 'β Ori', 'Ori', 5.2423, -8.202, 0.13, -0.03, 860, 'B8Ia', 9],
  ['procyon', 'Procyon', 'α CMi', 'CMi', 7.655, 5.225, 0.34, 0.42, 11.5, 'F5IV–V', 8],
  ['achernar', 'Achernar', 'α Eri', 'Eri', 1.6286, -57.237, 0.46, -0.16, 139, 'B6Vep', 7],
  ['betelgeuse', 'Betelgeuse', 'α Ori', 'Ori', 5.9195, 7.407, 0.42, 1.85, 550, 'M1–2Ia–Iab', 9],
  ['hadar', 'Hadar', 'β Cen', 'Cen', 14.0637, -60.373, 0.61, -0.23, 390, 'B1III', 7],
  ['altair', 'Altair', 'α Aql', 'Aql', 19.8464, 8.868, 0.76, 0.22, 16.7, 'A7V', 8],
  ['acrux', 'Acrux', 'α Cru', 'Cru', 12.4433, -63.099, 0.76, -0.24, 320, 'B0.5IV + B1V', 8],
  ['aldebaran', 'Aldebaran', 'α Tau', 'Tau', 4.5987, 16.509, 0.86, 1.54, 65, 'K5III', 8],
  ['antares', 'Antares', 'α Sco', 'Sco', 16.4901, -26.432, 1.06, 1.83, 550, 'M1.5Iab', 9],
  ['spica', 'Spica', 'α Vir', 'Vir', 13.4199, -11.161, 0.97, -0.23, 250, 'B1III–IV', 8],
  ['pollux', 'Pollux', 'β Gem', 'Gem', 7.7553, 28.026, 1.14, 1.0, 34, 'K0III', 8],
  ['fomalhaut', 'Fomalhaut', 'α PsA', 'PsA', 22.9608, -29.622, 1.16, 0.09, 25, 'A3V', 8],
  ['deneb', 'Deneb', 'α Cyg', 'Cyg', 20.6905, 45.28, 1.25, 0.09, 2600, 'A2Ia', 9],
  ['mimosa', 'Mimosa', 'β Cru', 'Cru', 12.7953, -59.689, 1.25, -0.23, 280, 'B0.5III', 6],
  ['regulus', 'Regulus', 'α Leo', 'Leo', 10.1395, 11.967, 1.35, -0.11, 79, 'B8IVn', 8],
  ['adhara', 'Adhara', 'ε CMa', 'CMa', 6.9771, -28.972, 1.5, -0.21, 430, 'B2Iab', 5],
  ['castor', 'Castor', 'α Gem', 'Gem', 7.5767, 31.888, 1.58, 0.03, 51, 'A1V + A2Vm', 7],
  ['gacrux', 'Gacrux', 'γ Cru', 'Cru', 12.5194, -57.113, 1.64, 1.59, 88, 'M3.5III', 5],
  ['shaula', 'Shaula', 'λ Sco', 'Sco', 17.5602, -37.104, 1.62, -0.22, 570, 'B1.5IV', 6],
  ['bellatrix', 'Bellatrix', 'γ Ori', 'Ori', 5.4188, 6.35, 1.64, -0.22, 250, 'B2III', 6],
  ['elnath', 'Elnath', 'β Tau', 'Tau', 5.4382, 28.608, 1.65, -0.13, 130, 'B7III', 5],
  ['miaplacidus', 'Miaplacidus', 'β Car', 'Car', 9.22, -69.717, 1.68, 0.0, 113, 'A1III', 4],
  ['alnilam', 'Alnilam', 'ε Ori', 'Ori', 5.6036, -1.202, 1.69, -0.18, 2000, 'B0Ia', 6],
  ['alnair', 'Alnair', 'α Gru', 'Gru', 22.1372, -46.961, 1.74, -0.13, 100, 'B6V', 5],
  ['alnitak', 'Alnitak', 'ζ Ori', 'Ori', 5.6793, -1.943, 1.77, -0.21, 1260, 'O9.5Iab', 6],
  ['alioth', 'Alioth', 'ε UMa', 'UMa', 12.9005, 55.96, 1.77, -0.02, 83, 'A1III–IVp', 5],
  ['dubhe', 'Dubhe', 'α UMa', 'UMa', 11.0621, 61.751, 1.79, 1.07, 123, 'K0III', 6],
  ['mirfak', 'Mirfak', 'α Per', 'Per', 3.4054, 49.861, 1.79, 0.48, 510, 'F5Ib', 5],
  ['wezen', 'Wezen', 'δ CMa', 'CMa', 7.1399, -26.393, 1.84, 0.68, 1600, 'F8Ia', 4],
  ['sargas', 'Sargas', 'θ Sco', 'Sco', 17.622, -42.998, 1.87, 0.4, 270, 'F0II', 4],
  ['kaus-australis', 'Kaus Australis', 'ε Sgr', 'Sgr', 18.4029, -34.385, 1.85, -0.03, 140, 'B9.5III', 5],
  ['avior', 'Avior', 'ε Car', 'Car', 8.3752, -59.509, 1.86, 1.2, 630, 'K3III + B2V', 4],
  ['alkaid', 'Alkaid', 'η UMa', 'UMa', 13.7923, 49.313, 1.86, -0.19, 100, 'B3V', 5],
  ['menkalinan', 'Menkalinan', 'β Aur', 'Aur', 5.9921, 44.948, 1.9, 0.03, 81, 'A2IV', 4],
  ['atria', 'Atria', 'α TrA', 'TrA', 16.8111, -69.028, 1.92, 1.45, 415, 'K2IIb–IIIa', 4],
  ['alhena', 'Alhena', 'γ Gem', 'Gem', 6.6285, 16.399, 1.93, 0.0, 109, 'A1.5IV', 4],
  ['peacock', 'Peacock', 'α Pav', 'Pav', 20.4275, -56.735, 1.94, -0.2, 180, 'B2IV', 4],
  ['polaris', 'Polaris', 'α UMi', 'UMi', 2.5303, 89.264, 1.98, 0.6, 430, 'F7Ib', 8],
  ['mirzam', 'Mirzam', 'β CMa', 'CMa', 6.3783, -17.956, 1.98, -0.24, 500, 'B1II–III', 3],
  ['alphard', 'Alphard', 'α Hya', 'Hya', 9.4598, -8.659, 1.98, 1.44, 177, 'K3II–III', 5],
  ['hamal', 'Hamal', 'α Ari', 'Ari', 2.1196, 23.462, 2.0, 1.15, 66, 'K2III', 4],
  ['diphda', 'Diphda', 'β Cet', 'Cet', 0.7265, -17.987, 2.04, 1.02, 96, 'K0III', 3],
  ['nunki', 'Nunki', 'σ Sgr', 'Sgr', 18.9211, -26.297, 2.02, -0.22, 228, 'B2.5V', 4],
  ['menkent', 'Menkent', 'θ Cen', 'Cen', 14.1112, -36.37, 2.06, 1.01, 59, 'K0III', 2],
  ['mirach', 'Mirach', 'β And', 'And', 1.1622, 35.621, 2.05, 1.58, 197, 'M0III', 3],
  ['alpheratz', 'Alpheratz', 'α And', 'And', 0.1398, 29.091, 2.06, -0.11, 97, 'B8IVpMnHg', 4],
  ['rasalhague', 'Rasalhague', 'α Oph', 'Oph', 17.5822, 12.56, 2.08, 0.15, 49, 'A5III', 3],
  ['kochab', 'Kochab', 'β UMi', 'UMi', 14.8451, 74.156, 2.08, 1.47, 131, 'K4III', 3],
  ['saiph', 'Saiph', 'κ Ori', 'Ori', 5.7959, -9.67, 2.06, -0.18, 650, 'B0.5Ia', 3],
  ['denebola', 'Denebola', 'β Leo', 'Leo', 11.8177, 14.572, 2.14, 0.09, 36, 'A3V', 3],
  ['algol', 'Algol', 'β Per', 'Per', 3.1361, 40.956, 2.12, -0.05, 90, 'B8V + K0IV', 4],
  ['mizar', 'Mizar', 'ζ UMa', 'UMa', 13.3987, 54.925, 2.23, 0.02, 83, 'A2V', 3],
  ['schedar', 'Schedar', 'α Cas', 'Cas', 0.6751, 56.537, 2.24, 1.17, 228, 'K0IIIa', 4],
  ['caph', 'Caph', 'β Cas', 'Cas', 0.153, 59.15, 2.28, 0.34, 54, 'F2III–IV', 3],
  ['navi', 'Navi', 'γ Cas', 'Cas', 0.9451, 60.717, 2.47, -0.15, 550, 'B0.5IVe', 2],
  ['ruchbah', 'Ruchbah', 'δ Cas', 'Cas', 1.4303, 60.235, 2.68, 0.13, 99, 'A5III–IV', 2],
  ['segin', 'Segin', 'ε Cas', 'Cas', 1.9066, 63.67, 3.38, -0.15, 440, 'B3III', 0],
  ['sadr', 'Sadr', 'γ Cyg', 'Cyg', 20.3705, 40.257, 2.2, 0.67, 1800, 'F8Ib', 4],
  ['gienah-cyg', 'Gienah', 'ε Cyg', 'Cyg', 20.7702, 33.97, 2.46, 1.03, 72, 'K0III', 0],
  ['albireo', 'Albireo', 'β Cyg', 'Cyg', 19.512, 27.96, 3.18, 1.13, 430, 'K3II + B8V', 3],
  ['delta-cyg', 'Fawaris', 'δ Cyg', 'Cyg', 19.7496, 45.131, 2.87, -0.03, 165, 'B9.5III', 0],
  ['sheliak', 'Sheliak', 'β Lyr', 'Lyr', 18.8347, 33.363, 3.52, 0.0, 960, 'B7Ve', 0],
  ['sulafat', 'Sulafat', 'γ Lyr', 'Lyr', 18.9824, 32.69, 3.25, -0.05, 620, 'B9III', 0],
  ['delta2-lyr', 'δ² Lyrae', 'δ² Lyr', 'Lyr', 18.9087, 36.899, 4.3, 1.7, 740, 'M4II', 0],
  ['zeta1-lyr', 'ζ¹ Lyrae', 'ζ¹ Lyr', 'Lyr', 18.7461, 37.605, 4.36, 0.2, 154, 'A4V', 0],
  ['tarazed', 'Tarazed', 'γ Aql', 'Aql', 19.771, 10.613, 2.72, 1.52, 460, 'K3II', 0],
  ['alshain', 'Alshain', 'β Aql', 'Aql', 19.9219, 6.407, 3.71, 0.86, 45, 'G8IV', 0],
  ['dschubba', 'Dschubba', 'δ Sco', 'Sco', 16.0056, -22.622, 2.32, -0.12, 440, 'B0.3IV', 2],
  ['acrab', 'Acrab', 'β Sco', 'Sco', 16.0906, -19.805, 2.62, -0.07, 400, 'B1V', 0],
  ['pi-sco', 'π Scorpii', 'π Sco', 'Sco', 15.9808, -26.114, 2.89, -0.19, 590, 'B1V', 0],
  ['sigma-sco', 'Alniyat', 'σ Sco', 'Sco', 16.3531, -25.593, 2.89, 0.13, 700, 'B1III', 0],
  ['tau-sco', 'Paikauhale', 'τ Sco', 'Sco', 16.5984, -28.216, 2.82, -0.25, 470, 'B0.2V', 0],
  ['epsilon-sco', 'Larawag', 'ε Sco', 'Sco', 16.836, -34.293, 2.29, 1.14, 65, 'K1III', 0],
  ['mu1-sco', 'μ¹ Scorpii', 'μ¹ Sco', 'Sco', 16.8645, -38.047, 3.08, -0.2, 500, 'B1.5V', 0],
  ['zeta2-sco', 'ζ² Scorpii', 'ζ² Sco', 'Sco', 16.9096, -42.362, 3.62, 1.38, 150, 'K4III', 0],
  ['eta-sco', 'η Scorpii', 'η Sco', 'Sco', 17.2023, -43.239, 3.33, 0.4, 70, 'F5IV', 0],
  ['kappa-sco', 'Girtab', 'κ Sco', 'Sco', 17.708, -39.03, 2.41, -0.22, 480, 'B1.5III', 0],
  ['lesath', 'Lesath', 'υ Sco', 'Sco', 17.5129, -37.296, 2.69, -0.22, 580, 'B2IV', 0],
  ['kaus-media', 'Kaus Media', 'δ Sgr', 'Sgr', 18.3499, -29.828, 2.7, 1.38, 350, 'K3II', 0],
  ['kaus-borealis', 'Kaus Borealis', 'λ Sgr', 'Sgr', 18.4662, -25.422, 2.81, 1.04, 77, 'K1IIIb', 0],
  ['ascella', 'Ascella', 'ζ Sgr', 'Sgr', 19.0435, -29.88, 2.6, 0.08, 88, 'A2III + A4IV', 2],
  ['alnasl', 'Alnasl', 'γ Sgr', 'Sgr', 18.0969, -30.424, 2.99, 1.0, 97, 'K0III', 0],
  ['tau-sgr', 'τ Sagittarii', 'τ Sgr', 'Sgr', 19.1156, -27.67, 3.32, 1.19, 120, 'K1III', 0],
  ['phi-sgr', 'Phi Sagittarii', 'φ Sgr', 'Sgr', 18.7608, -26.99, 3.17, -0.11, 230, 'B8.5III', 0],
  ['meissa', 'Meissa', 'λ Ori', 'Ori', 5.5855, 9.934, 3.54, -0.18, 1100, 'O8III', 0],
  ['mintaka', 'Mintaka', 'δ Ori', 'Ori', 5.5334, -0.299, 2.23, -0.22, 1200, 'O9.5II', 4],
  ['merak', 'Merak', 'β UMa', 'UMa', 11.0307, 56.382, 2.37, 0.03, 80, 'A1V', 3],
  ['phecda', 'Phecda', 'γ UMa', 'UMa', 11.8972, 53.695, 2.44, 0.0, 84, 'A0Ve', 2],
  ['megrez', 'Megrez', 'δ UMa', 'UMa', 12.2571, 57.033, 3.31, 0.08, 81, 'A3V', 0],
  ['pherkad', 'Pherkad', 'γ UMi', 'UMi', 15.3454, 71.834, 3.05, 0.05, 480, 'A3II–III', 0],
  ['yildun', 'Yildun', 'δ UMi', 'UMi', 17.5369, 86.586, 4.36, 0.04, 183, 'A1Van', 0],
  ['epsilon-umi', 'ε Ursae Minoris', 'ε UMi', 'UMi', 16.7662, 82.037, 4.21, 0.89, 347, 'G5III', 0],
  ['zeta-umi', 'ζ Ursae Minoris', 'ζ UMi', 'UMi', 15.7344, 77.795, 4.32, 0.04, 380, 'A3Vn', 0],
  ['eta-umi', 'η Ursae Minoris', 'η UMi', 'UMi', 16.2918, 75.755, 4.95, 0.42, 97, 'F5V', 0],
  ['algieba', 'Algieba', 'γ¹ Leo', 'Leo', 10.3329, 19.842, 2.08, 1.13, 130, 'K0III + G7III', 2],
  ['zosma', 'Zosma', 'δ Leo', 'Leo', 11.2351, 20.524, 2.56, 0.12, 58, 'A4V', 0],
  ['chertan', 'Chertan', 'θ Leo', 'Leo', 11.2373, 15.43, 3.33, -0.0, 165, 'A2V', 0],
  ['adhafera', 'Adhafera', 'ζ Leo', 'Leo', 10.2782, 23.417, 3.44, 0.31, 275, 'F0III', 0],
  ['rasalas', 'Rasalas', 'μ Leo', 'Leo', 9.8795, 26.007, 3.88, 1.22, 133, 'K2III', 0],
  ['algenubi', 'Algenubi', 'ε Leo', 'Leo', 9.7642, 23.774, 2.98, 0.81, 247, 'G1II', 0],
  ['eta-leo', 'η Leonis', 'η Leo', 'Leo', 10.122, 16.763, 3.52, -0.03, 2000, 'A0Ib', 0],
  ['zeta-tau', 'Tianguan', 'ζ Tau', 'Tau', 5.6273, 21.143, 3.0, -0.13, 440, 'B2IIIpe', 0],
  ['epsilon-tau', 'Ain', 'ε Tau', 'Tau', 4.4769, 19.18, 3.53, 1.01, 150, 'G9.5III', 0],
  ['delta-tau', 'δ¹ Tauri', 'δ¹ Tau', 'Tau', 4.3822, 17.543, 3.76, 0.98, 154, 'G9.5III', 0],
  ['gamma-tau', 'γ Tauri', 'γ Tau', 'Tau', 4.3298, 15.628, 3.65, 0.18, 154, 'G8III', 0],
  ['theta2-tau', 'θ² Tauri', 'θ² Tau', 'Tau', 4.4776, 15.871, 3.4, 0.18, 150, 'A7III', 0],
  ['tejat', 'Tejat', 'μ Gem', 'Gem', 6.3828, 22.514, 2.88, 1.64, 230, 'M3III', 0],
  ['propus', 'Propus', 'η Gem', 'Gem', 6.248, 22.507, 3.28, 1.6, 350, 'M3III', 0],
  ['mebsuta', 'Mebsuta', 'ε Gem', 'Gem', 6.7322, 25.131, 2.98, 1.4, 840, 'G8Ib', 0],
  ['wasat', 'Wasat', 'δ Gem', 'Gem', 7.3354, 21.982, 3.5, 0.34, 60, 'F0IV', 0],
  ['alzirr', 'Alzirr', 'ξ Gem', 'Gem', 6.7549, 12.896, 3.36, 0.44, 57, 'F5IV', 0],
  ['aludra', 'Aludra', 'η CMa', 'CMa', 7.4016, -29.303, 2.45, -0.08, 2000, 'B5Ia', 0],
  ['gomeisa', 'Gomeisa', 'β CMi', 'CMi', 7.4525, 8.289, 2.89, -0.09, 170, 'B8Ve', 0],
  ['mahasim', 'Mahasim', 'θ Aur', 'Aur', 5.9953, 37.213, 2.62, -0.08, 170, 'A0p', 0],
  ['hassaleh', 'Hassaleh', 'ι Aur', 'Aur', 4.95, 33.166, 2.69, 1.52, 500, 'K3II', 0],
  ['gamma-per', 'Gamma Persei', 'γ Per', 'Per', 3.0799, 53.506, 2.93, 0.7, 250, 'G8III + A3V', 0],
  ['delta-per', 'Delta Persei', 'δ Per', 'Per', 3.7153, 47.787, 3.01, -0.13, 520, 'B5III', 0],
  ['epsilon-per', 'Epsilon Persei', 'ε Per', 'Per', 3.964, 40.01, 2.89, -0.18, 640, 'B0.5V', 0],
  ['zeta-per', 'Zeta Persei', 'ζ Per', 'Per', 3.9022, 31.884, 2.85, 0.12, 980, 'B1Ib', 0],
  ['almach', 'Almach', 'γ And', 'And', 2.065, 42.33, 2.1, 1.37, 355, 'K3II + B9V', 3],
  ['markab', 'Markab', 'α Peg', 'Peg', 23.0794, 15.205, 2.49, -0.04, 133, 'B9III', 3],
  ['scheat', 'Scheat', 'β Peg', 'Peg', 23.0629, 28.083, 2.42, 1.67, 196, 'M2.5II–III', 3],
  ['algenib', 'Algenib', 'γ Peg', 'Peg', 0.2206, 15.184, 2.83, -0.19, 390, 'B2IV', 0],
  ['imai', 'Imai', 'δ Cru', 'Cru', 12.2524, -58.749, 2.8, -0.2, 345, 'B2IV', 0],
  ['izar', 'Izar', 'ε Boo', 'Boo', 14.7498, 27.074, 2.7, 0.97, 200, 'K0II–III + A0V', 0],
  ['muphrid', 'Muphrid', 'η Boo', 'Boo', 13.9114, 18.398, 2.68, 0.58, 37, 'G0IV', 0],
  ['seginus', 'Seginus', 'γ Boo', 'Boo', 14.5346, 38.308, 3.03, 0.19, 85, 'A7III', 0],
  ['nekkar', 'Nekkar', 'β Boo', 'Boo', 15.0324, 40.391, 3.5, 0.97, 220, 'G8III', 0],
  ['delta-boo', 'Delta Boötis', 'δ Boo', 'Boo', 15.2583, 33.315, 3.47, 0.95, 120, 'G8III', 0],
  ['rho-boo', 'Rho Boötis', 'ρ Boo', 'Boo', 14.5309, 30.371, 3.58, 1.3, 150, 'K3III', 0],
  ['porrima', 'Porrima', 'γ Vir', 'Vir', 12.6944, -1.449, 2.74, 0.36, 38, 'F0V + F0V', 0],
  ['vindemiatrix', 'Vindemiatrix', 'ε Vir', 'Vir', 13.0363, 10.959, 2.83, 0.94, 110, 'G8III', 0],
  ['zavijava', 'Zavijava', 'β Vir', 'Vir', 11.8449, 1.765, 3.61, 0.55, 36, 'F9V', 0],
  ['heze', 'Heze', 'ζ Vir', 'Vir', 13.5784, -0.596, 3.37, 0.1, 74, 'A3V', 0],
  ['sabik', 'Sabik', 'η Oph', 'Oph', 17.173, -15.725, 2.43, 0.06, 88, 'A2V + A2V', 2],
  ['cebalrai', 'Cebalrai', 'β Oph', 'Oph', 17.7246, 4.567, 2.77, 1.17, 82, 'K2III', 0],
  ['alphecca', 'Alphecca', 'α CrB', 'CrB', 15.5781, 26.715, 2.23, -0.02, 75, 'A0V', 2],
  ['gienah-crv', 'Gienah', 'γ Crv', 'Crv', 12.2634, -17.542, 2.59, -0.11, 154, 'B8III', 0],
  ['epsilon-cen', 'ε Centauri', 'ε Cen', 'Cen', 13.6649, -53.466, 2.3, -0.22, 430, 'B1III', 0],
  ['gamma-cen', 'Muhlifain', 'γ Cen', 'Cen', 12.6914, -48.96, 2.17, -0.01, 130, 'A1IV + A0IV', 0],
  ['eta-cen', 'η Centauri', 'η Cen', 'Cen', 14.5917, -42.158, 2.31, -0.19, 310, 'B1.5Vne', 0],
  ['zeta-cen', 'ζ Centauri', 'ζ Cen', 'Cen', 13.925, -47.288, 2.55, -0.19, 380, 'B2.5IV', 0],
]

/** Deep-sky objects and the Galactic Centre. `ly` for these is the distance to the object. */
const DEEP: CatalogObject[] = [
  { id: 'm45', name: 'Pleiades', designation: 'M45', kind: 'dso', con: 'Tau', ra: 56.75, dec: 24.117, mag: 1.6, ly: 444, type: 'Open cluster', label: 6, note: 'A young cluster, about 100 million years old, of which six or seven stars are easy to see unaided. It is wrapped in dust that reflects blue light.' },
  { id: 'm42', name: 'Orion Nebula', designation: 'M42', kind: 'dso', con: 'Ori', ra: 83.82, dec: -5.39, mag: 4.0, ly: 1340, type: 'Emission nebula', label: 6, note: 'The nearest large stellar nursery. The glow is hydrogen lit by the four young stars of the Trapezium; the cloud is about 24 light-years across.' },
  { id: 'm31', name: 'Andromeda Galaxy', designation: 'M31', kind: 'dso', con: 'And', ra: 10.685, dec: 41.269, mag: 3.4, ly: 2_540_000, type: 'Spiral galaxy', label: 7, note: 'Among the most distant objects visible to the unaided eye. It holds about a trillion stars and is approaching the Milky Way; the two will merge in some billions of years.' },
  { id: 'lmc', name: 'Large Magellanic Cloud', designation: 'LMC', kind: 'dso', con: 'Dor', ra: 80.894, dec: -69.756, mag: 0.9, ly: 163_000, type: 'Dwarf galaxy', label: 6, note: 'A satellite galaxy of the Milky Way, visible only from the southern hemisphere. It contains the Tarantula Nebula, the most active star-forming region in the Local Group.' },
  { id: 'smc', name: 'Small Magellanic Cloud', designation: 'SMC', kind: 'dso', con: 'Tuc', ra: 13.187, dec: -72.829, mag: 2.7, ly: 200_000, type: 'Dwarf galaxy', label: 5, note: 'A second satellite galaxy, orbiting the Milky Way together with the Large Cloud. Both are being slowly stretched by our galaxy’s gravity.' },
  { id: 'omega-cen', name: 'Omega Centauri', designation: 'NGC 5139', kind: 'dso', con: 'Cen', ra: 201.697, dec: -47.48, mag: 3.7, ly: 17_000, type: 'Globular cluster', label: 4, note: 'The largest globular cluster of the Milky Way, with roughly ten million stars. It may be the stripped core of a small galaxy absorbed long ago.' },
  { id: 'sgra', name: 'Galactic Centre', designation: 'Sgr A*', kind: 'centre', con: 'Sgr', ra: 266.4168, dec: -29.0078, mag: 99, ly: 26_700, type: 'Supermassive black hole', label: 9, note: 'The direction of the black hole at the centre of the Milky Way. Interstellar dust hides it from the eye; radio and infrared telescopes see straight through.' },
]

export const STARS: CatalogObject[] = R.map(([id, name, designation, con, raH, dec, mag, bv, ly, type, label]) => ({
  id, name, designation, kind: 'star' as const, con, ra: raH * 15, dec, mag, bv, ly, type, label,
}))

/** Short notes for the stars that deserve one. Anything without a note gets a generated sentence from its data. */
export const STAR_NOTES: Record<string, string> = {
  sirius: 'The brightest star in the night sky, bright mostly because it is so close. Its faint companion, Sirius B, is a white dwarf.',
  canopus: 'The second-brightest star in the night sky: a luminous bright giant that spacecraft star trackers use as a navigation reference.',
  arcturus: 'An ageing orange giant, bright and nearby, and an old star moving fast relative to the Sun. Follow the curve of the Plough’s handle to find it.',
  rigil: 'The nearest star system to the Sun. The brighter pair is Sun-like; the third member, Proxima Centauri, is closer still, at 4.25 light-years.',
  vega: 'The classic reference star for magnitude scales. It spins so fast that it is flattened, and it is ringed by a dusty disc.',
  capella: 'Two pairs of stars: a close pair of yellow giants, and a distant pair of red dwarfs. The giants together outshine 150 Suns.',
  rigel: 'A blue supergiant roughly 120,000 times as luminous as the Sun, marking Orion’s foot.',
  procyon: 'One of the Sun’s nearest neighbours, a little hotter and larger than the Sun. A white-dwarf companion orbits it every 41 years.',
  betelgeuse: 'A red supergiant so large that, placed in the Sun’s position, it would reach past Mars. It will end in a supernova, within about 100,000 years.',
  achernar: 'One of the most flattened stars known: it spins so fast that its equator is about 50 % wider than its poles.',
  altair: 'One of the closest naked-eye stars. It rotates in about nine hours, against the Sun’s twenty-five days.',
  aldebaran: 'An orange giant, apparently inside the Hyades cluster but only half as far away: a line-of-sight coincidence.',
  antares: 'A red supergiant, its name means “rival of Mars”. It is roughly 700 times the Sun’s diameter.',
  spica: 'A close binary of two blue stars, so close that each is stretched into an egg shape by the other’s gravity.',
  pollux: 'The nearest giant star to the Sun. An exoplanet, Pollux b, was confirmed around it.',
  fomalhaut: 'Surrounded by a broad ring of dusty debris, imaged by Hubble and ALMA. Often called the “lonely star” for the empty patch of sky around it.',
  deneb: 'One of the most luminous stars visible to the eye, perhaps 100,000 times the Sun. The light you see tonight left it some 2,600 years ago.',
  regulus: 'A fast-spinning blue-white star that sits almost exactly on the ecliptic, so the Moon and planets pass close to it.',
  acrux: 'The foot of the Southern Cross; to the eye one star, in a telescope a pair of hot blue stars.',
  polaris: 'The North Star, within a degree of the north celestial pole. It is a pulsating supergiant; Earth’s axis will point there most closely around the year 2100.',
  dubhe: 'The upper “pointer” of the Plough. A line through Dubhe and Merak points to Polaris.',
  mizar: 'The middle of the Plough’s handle, and the first double star ever photographed; the small star beside it is Alcor.',
  algol: 'The “Demon Star”: an eclipsing binary that dips from magnitude 2.1 to 3.4 for several hours every 2.87 days.',
  sadr: 'A yellow supergiant at the heart of the Northern Cross, embedded in a glowing cloud of gas.',
  albireo: 'The head of the swan: a golden star beside a blue one, one of the prettiest double stars in a small telescope.',
  shaula: 'The sting of the Scorpion: a multiple system of hot blue stars.',
  alnilam: 'The central star of Orion’s belt, a blue supergiant roughly 400,000 times as luminous as the Sun.',
  alnitak: 'The eastern belt star, next to the Flame and Horsehead nebulae.',
  mintaka: 'The western belt star, almost exactly on the celestial equator.',
  hadar: 'The second-brightest star of Centaurus, and with Rigil Kentaurus one of the two “Pointers” to the Southern Cross.',
  alphard: 'The “solitary one”: an orange giant in a faint stretch of sky.',
  almach: 'A golden giant with a blue companion, easily split in a small telescope.',
  alphecca: 'The jewel of the Northern Crown, an eclipsing binary.',
  atria: 'The brightest star of the Southern Triangle, an orange giant.',
  kochab: 'Around 1000 BC, when Earth’s axis pointed differently, Kochab and Pherkad were the nearest bright stars to the pole.',
  alkaid: 'The end of the Plough’s handle. Unlike the five stars in the middle of the Plough, which drift together, Alkaid and Dubhe are travelling the opposite way.',
  gacrux: 'The red giant at the head of the Southern Cross, the nearest red giant to the Sun.',
}

export const DEEP_SKY: CatalogObject[] = DEEP

/** Everything fixed on the sky (stars + deep sky), indexed by id. */
export const FIXED: CatalogObject[] = [...STARS, ...DEEP_SKY]
export const BY_ID: Record<string, CatalogObject> = Object.fromEntries(FIXED.map((o) => [o.id, o]))

export interface Constellation {
  id: string
  name: string
  /** Pairs of star ids. */
  lines: [string, string][]
  /** Asterism or a pointer, not an IAU constellation: drawn dimmer. */
  asterism?: boolean
}

const chain = (...ids: string[]): [string, string][] => ids.slice(1).map((id, i) => [ids[i], id])

export const CONSTELLATIONS: Constellation[] = [
  { id: 'ori', name: 'Orion', lines: [['betelgeuse', 'meissa'], ['meissa', 'bellatrix'], ['betelgeuse', 'alnitak'], ['bellatrix', 'mintaka'], ...chain('mintaka', 'alnilam', 'alnitak', 'saiph'), ['mintaka', 'rigel']] },
  { id: 'uma', name: 'Ursa Major', lines: [...chain('dubhe', 'merak', 'phecda', 'megrez', 'dubhe'), ...chain('megrez', 'alioth', 'mizar', 'alkaid')] },
  { id: 'umi', name: 'Ursa Minor', lines: [...chain('polaris', 'yildun', 'epsilon-umi', 'zeta-umi', 'eta-umi', 'pherkad', 'kochab', 'zeta-umi')] },
  { id: 'cas', name: 'Cassiopeia', lines: chain('caph', 'schedar', 'navi', 'ruchbah', 'segin') },
  { id: 'cyg', name: 'Cygnus', lines: [...chain('deneb', 'sadr', 'albireo'), ...chain('delta-cyg', 'sadr', 'gienah-cyg')] },
  { id: 'lyr', name: 'Lyra', lines: [...chain('vega', 'zeta1-lyr'), ...chain('zeta1-lyr', 'delta2-lyr', 'sulafat', 'sheliak', 'zeta1-lyr')] },
  { id: 'aql', name: 'Aquila', lines: chain('tarazed', 'altair', 'alshain') },
  { id: 'sco', name: 'Scorpius', lines: [['acrab', 'dschubba'], ['dschubba', 'pi-sco'], ['dschubba', 'sigma-sco'], ...chain('sigma-sco', 'antares', 'tau-sco', 'epsilon-sco', 'mu1-sco', 'zeta2-sco', 'eta-sco', 'sargas', 'kappa-sco', 'shaula', 'lesath')] },
  { id: 'sgr', name: 'Sagittarius', lines: [...chain('kaus-borealis', 'kaus-media', 'alnasl', 'kaus-australis', 'ascella', 'tau-sgr', 'nunki', 'phi-sgr', 'kaus-media'), ['kaus-borealis', 'phi-sgr'], ['kaus-media', 'ascella']] },
  { id: 'leo', name: 'Leo', lines: [...chain('regulus', 'eta-leo', 'algieba', 'adhafera', 'rasalas', 'algenubi'), ...chain('algieba', 'zosma', 'denebola', 'chertan', 'zosma')] },
  { id: 'tau', name: 'Taurus', lines: [...chain('aldebaran', 'theta2-tau', 'gamma-tau', 'delta-tau', 'epsilon-tau', 'elnath'), ['aldebaran', 'zeta-tau']] },
  { id: 'gem', name: 'Gemini', lines: [...chain('pollux', 'wasat', 'alzirr'), ['wasat', 'mebsuta'], ...chain('castor', 'mebsuta', 'tejat', 'propus'), ...chain('alzirr', 'alhena', 'tejat')] },
  { id: 'cma', name: 'Canis Major', lines: [['mirzam', 'sirius'], ['sirius', 'wezen'], ['wezen', 'adhara'], ['wezen', 'aludra']] },
  { id: 'cmi', name: 'Canis Minor', lines: [['procyon', 'gomeisa']] },
  { id: 'aur', name: 'Auriga', lines: chain('capella', 'menkalinan', 'mahasim', 'elnath', 'hassaleh', 'capella') },
  { id: 'per', name: 'Perseus', lines: [['gamma-per', 'mirfak'], ['mirfak', 'delta-per'], ['mirfak', 'epsilon-per'], ['epsilon-per', 'zeta-per'], ['mirfak', 'algol']] },
  { id: 'peg', name: 'Pegasus', lines: chain('alpheratz', 'scheat', 'markab', 'algenib', 'alpheratz') },
  { id: 'and', name: 'Andromeda', lines: chain('alpheratz', 'mirach', 'almach') },
  { id: 'cru', name: 'Crux', lines: [['acrux', 'gacrux'], ['mimosa', 'imai']] },
  { id: 'boo', name: 'Boötes', lines: chain('arcturus', 'izar', 'delta-boo', 'nekkar', 'seginus', 'rho-boo', 'arcturus') },
  { id: 'vir', name: 'Virgo', lines: [['spica', 'heze'], ['heze', 'porrima'], ['porrima', 'zavijava'], ['porrima', 'vindemiatrix']] },
  { id: 'summer', name: 'Summer Triangle', asterism: true, lines: chain('vega', 'deneb', 'altair', 'vega') },
  { id: 'winter', name: 'Winter Triangle', asterism: true, lines: chain('betelgeuse', 'sirius', 'procyon', 'betelgeuse') },
  { id: 'pointers', name: 'The Pointers', asterism: true, lines: [['hadar', 'rigil']] },
  { id: 'polaris-pointers', name: 'Pointers to Polaris', asterism: true, lines: [['merak', 'dubhe'], ['dubhe', 'polaris']] },
]
