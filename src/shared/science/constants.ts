/**
 * Fundamental SI physical and astronomical constants for CELESTIUM.
 * Sources: IAU 2012/2015 Resolutions, CODATA 2018, NASA/JPL Astrodynamics Constants.
 */

export const CELESTIUM_MODEL_VERSION = '2.0.0';

// Exact SI speed of light in vacuum (m/s)
export const C_MPS = 299_792_458;
export const C_KMS = C_MPS / 1000;

// Exact SI Planck & Boltzmann constants (2019 SI redefinition)
export const H_PLANCK_JS = 6.62607015e-34;
export const K_BOLTZMANN_JK = 1.380649e-23;

// Solar radiation pressure at 1 AU (W/m^2 / c = 1361 / 299792458 ~ 4.54e-6 N/m^2; standard 4.56e-6)
export const SOLAR_FLUX_1AU_WM2 = 1361.0;
export const P_SOLAR_1AU_N_M2 = 4.56e-6;

// Solar spectral irradiance at 1 AU (~1550 nm & ~1064 nm bands, W / (m^2 * nm))
export const SOLAR_SPECTRAL_IRRADIANCE_1550NM = 0.26;
export const SOLAR_SPECTRAL_IRRADIANCE_1064NM = 0.65;

// Exact IAU 2012 definition of the Astronomical Unit (m)
export const AU_METERS = 149_597_870_700;
export const AU_KM = AU_METERS / 1000;

// Time constants
export const SECONDS_PER_DAY = 86_400;
export const DAYS_PER_JULIAN_CENTURY = 36_525;
export const J2000_JD = 2_451_545.0; // 2000-01-01 12:00:00 TDB/TT

// Standard gravitational parameters (km^3 / s^2) — JPL DE440/DE441 nominal values
export const MU_SUN_KM3_S2 = 1.32712440018e11;
export const MU_EARTH_KM3_S2 = 3.986004418e5;
export const MU_MOON_KM3_S2 = 4.902800066e3;
export const MU_MARS_KM3_S2 = 4.282837e4;
export const MU_JUPITER_KM3_S2 = 1.26686534e8;

// Equatorial radii (km) and J2 zonal harmonic coefficients
export const RADIUS_SUN_KM = 695_700;
export const RADIUS_EARTH_KM = 6378.137;
export const RADIUS_MOON_KM = 1737.4;
export const RADIUS_MARS_KM = 3396.19;
export const RADIUS_JUPITER_KM = 71492.0;

export const J2_SUN = 2.0e-7;
export const J2_EARTH = 1.08262668e-3;
export const J2_MOON = 2.027e-4;
export const J2_MARS = 1.96045e-3;
export const J2_JUPITER = 1.4736e-2;

export interface CentralBodyConstant {
  id: 'sun' | 'earth' | 'moon' | 'mars' | 'jupiter';
  name: string;
  naifId: string;
  muKm3S2: number;
  radiusKm: number;
  j2: number;
  defaultFrame: string;
}

export const CENTRAL_BODIES: Record<CentralBodyConstant['id'], CentralBodyConstant> = {
  sun: {
    id: 'sun',
    name: 'Sun (Heliocentric)',
    naifId: '10',
    muKm3S2: MU_SUN_KM3_S2,
    radiusKm: RADIUS_SUN_KM,
    j2: J2_SUN,
    defaultFrame: 'Heliocentric Ecliptic J2000',
  },
  earth: {
    id: 'earth',
    name: 'Earth (Geocentric)',
    naifId: '399',
    muKm3S2: MU_EARTH_KM3_S2,
    radiusKm: RADIUS_EARTH_KM,
    j2: J2_EARTH,
    defaultFrame: 'Earth-Centered Inertial (EME2000/GCRF)',
  },
  moon: {
    id: 'moon',
    name: 'Moon (Selenocentric)',
    naifId: '301',
    muKm3S2: MU_MOON_KM3_S2,
    radiusKm: RADIUS_MOON_KM,
    j2: J2_MOON,
    defaultFrame: 'Selenocentric Inertial J2000',
  },
  mars: {
    id: 'mars',
    name: 'Mars (Areocentric)',
    naifId: '499',
    muKm3S2: MU_MARS_KM3_S2,
    radiusKm: RADIUS_MARS_KM,
    j2: J2_MARS,
    defaultFrame: 'Mars-Centered Inertial J2000',
  },
  jupiter: {
    id: 'jupiter',
    name: 'Jupiter (Jovicentric)',
    naifId: '599',
    muKm3S2: MU_JUPITER_KM3_S2,
    radiusKm: RADIUS_JUPITER_KM,
    j2: J2_JUPITER,
    defaultFrame: 'Jupiter-Centered Inertial J2000',
  },
};

// Planetary masses relative to Sun (for L1/L2 Hill sphere ratio)
export const EARTH_MOON_SUN_MASS_RATIO = 3.040432648e-6;

export interface KeplerianElementsJ2000 {
  id: string;
  naifId: string;
  name: string;
  type: 'planet' | 'moon';
  color: string;
  radiusKm: number;
  aAU: number;         // Semi-major axis (AU)
  e: number;           // Eccentricity
  iDeg: number;        // Inclination to J2000 ecliptic (deg)
  omegaBarDeg: number; // Longitude of perihelion (deg)
  nodeDeg: number;     // Longitude of ascending node (deg)
  L0Deg: number;       // Mean longitude at J2000 (deg)
  nDegPerDay: number;  // Mean motion (deg/day)
  orbitalPeriodDays: number;
}

/**
 * Standish (1992) / JPL J2000 low-precision Keplerian elements (valid 1800-2050 AD)
 * used strictly as documented ESTIMATED fallback when JPL Horizons is unavailable
 * or for smooth orbital path curves.
 */
export const PLANET_ELEMENTS_J2000: KeplerianElementsJ2000[] = [
  {
    id: 'mercury',
    naifId: '199',
    name: 'Mercury',
    type: 'planet',
    color: '#94a3b8',
    radiusKm: 2439.7,
    aAU: 0.38709927,
    e: 0.20563593,
    iDeg: 7.00497902,
    omegaBarDeg: 77.45779628,
    nodeDeg: 48.33076593,
    L0Deg: 252.2503235,
    nDegPerDay: 4.09233445,
    orbitalPeriodDays: 87.969,
  },
  {
    id: 'venus',
    naifId: '299',
    name: 'Venus',
    type: 'planet',
    color: '#eab308',
    radiusKm: 6051.8,
    aAU: 0.72333566,
    e: 0.00677672,
    iDeg: 3.39467605,
    omegaBarDeg: 131.60246718,
    nodeDeg: 76.67984255,
    L0Deg: 181.9790995,
    nDegPerDay: 1.60213034,
    orbitalPeriodDays: 224.701,
  },
  {
    id: 'earth',
    naifId: '399',
    name: 'Earth',
    type: 'planet',
    color: '#38bdf8',
    radiusKm: 6371.0,
    aAU: 1.00000261,
    e: 0.01671123,
    iDeg: 0.00001531,
    omegaBarDeg: 102.93768193,
    nodeDeg: 0.0,
    L0Deg: 100.46457166,
    nDegPerDay: 0.9856091,
    orbitalPeriodDays: 365.256,
  },
  {
    id: 'mars',
    naifId: '499',
    name: 'Mars',
    type: 'planet',
    color: '#ef4444',
    radiusKm: 3389.5,
    aAU: 1.52371034,
    e: 0.0933941,
    iDeg: 1.84969142,
    omegaBarDeg: -23.94362959,
    nodeDeg: 49.55953891,
    L0Deg: -4.55343205,
    nDegPerDay: 0.52402068,
    orbitalPeriodDays: 686.98,
  },
  {
    id: 'jupiter',
    naifId: '599',
    name: 'Jupiter',
    type: 'planet',
    color: '#f59e0b',
    radiusKm: 69911,
    aAU: 5.202887,
    e: 0.04838624,
    iDeg: 1.30439695,
    omegaBarDeg: 14.72847983,
    nodeDeg: 100.47390909,
    L0Deg: 34.39644051,
    nDegPerDay: 0.08308529,
    orbitalPeriodDays: 4332.589,
  },
  {
    id: 'saturn',
    naifId: '699',
    name: 'Saturn',
    type: 'planet',
    color: '#fde047',
    radiusKm: 58232,
    aAU: 9.53667594,
    e: 0.05386179,
    iDeg: 2.48599187,
    omegaBarDeg: 92.59887831,
    nodeDeg: 113.66242448,
    L0Deg: 49.95424423,
    nDegPerDay: 0.03344414,
    orbitalPeriodDays: 10759.22,
  },
  {
    id: 'uranus',
    naifId: '799',
    name: 'Uranus',
    type: 'planet',
    color: '#22d3ee',
    radiusKm: 25362,
    aAU: 19.18916464,
    e: 0.04725744,
    iDeg: 0.77263783,
    omegaBarDeg: 170.9542763,
    nodeDeg: 74.01692503,
    L0Deg: 313.23810451,
    nDegPerDay: 0.01172834,
    orbitalPeriodDays: 30685.4,
  },
  {
    id: 'neptune',
    naifId: '899',
    name: 'Neptune',
    type: 'planet',
    color: '#3b82f6',
    radiusKm: 24622,
    aAU: 30.06992276,
    e: 0.00859048,
    iDeg: 1.77004347,
    omegaBarDeg: 44.96476227,
    nodeDeg: 131.78422574,
    L0Deg: -55.12002969,
    nDegPerDay: 0.00598103,
    orbitalPeriodDays: 60189.0,
  },
];
