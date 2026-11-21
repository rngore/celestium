import type { PulsarEntry, Vector3D } from '../types.ts';

const DEG_TO_RAD = Math.PI / 180;
// IAU J2000 obliquity of the ecliptic: 23° 26' 21.448" = 23.4392911 deg
const OBLIQUITY_RAD = 23.4392911 * DEG_TO_RAD;

/**
 * Converts ICRS/J2000 equatorial Right Ascension & Declination (degrees)
 * into a normalized unit vector in Ecliptic J2000 Cartesian coordinates.
 */
function equatorialToEclipticUnitVector(raDeg: number, decDeg: number): Vector3D {
  const ra = raDeg * DEG_TO_RAD;
  const dec = decDeg * DEG_TO_RAD;

  // Equatorial unit vector
  const xEq = Math.cos(dec) * Math.cos(ra);
  const yEq = Math.cos(dec) * Math.sin(ra);
  const zEq = Math.sin(dec);

  // Rotate around X-axis by +obliquity (equatorial -> ecliptic)
  const cosE = Math.cos(OBLIQUITY_RAD);
  const sinE = Math.sin(OBLIQUITY_RAD);
  const xEc = xEq;
  const yEc = yEq * cosE + zEq * sinE;
  const zEc = -yEq * sinE + zEq * cosE;

  const norm = Math.sqrt(xEc * xEc + yEc * yEc + zEc * zEc) || 1;
  return {
    x: Number((xEc / norm).toFixed(6)),
    y: Number((yEc / norm).toFixed(6)),
    z: Number((zEc / norm).toFixed(6)),
  };
}

/**
 * Documented Millisecond & X-ray Pulsars used in XNAV literature (NASA NICER/SEXTANT & ATNF).
 * Coordinates and spin periods sourced from ATNF Pulsar Catalogue (Manchester et al.)
 * and NASA Goddard SEXTANT experiment references.
 */
export const PULSAR_CATALOG: PulsarEntry[] = [
  {
    id: 'psr-b0531+21',
    commonName: 'Crab Pulsar (PSR B0531+21)',
    jName: 'J0534+2200',
    raDeg: 83.63321,
    decDeg: 22.01447,
    eclipticUnitVector: equatorialToEclipticUnitVector(83.63321, 22.01447),
    periodMs: 33.3924,
    periodSec: 0.0333924,
    pDotSecPerSec: 4.21e-13,
    distanceKpc: 2.0,
    timingPrecisionUs: 18.0,
    xrayFluxCrab: 1.0,
    referenceEpochMJD: 57000,
    source: 'ATNF Pulsar Catalogue / NASA HEASARC',
    sourceUrl: 'https://www.atnf.csiro.au/research/pulsar/psrcat/',
  },
  {
    id: 'psr-b1937+21',
    commonName: 'PSR B1937+21',
    jName: 'J1939+2134',
    raDeg: 294.91067,
    decDeg: 21.58308,
    eclipticUnitVector: equatorialToEclipticUnitVector(294.91067, 21.58308),
    periodMs: 1.5578,
    periodSec: 0.0015578,
    pDotSecPerSec: 1.05e-19,
    distanceKpc: 3.5,
    timingPrecisionUs: 4.5,
    xrayFluxCrab: 0.004,
    referenceEpochMJD: 57500,
    source: 'ATNF Pulsar Catalogue / NASA SEXTANT Target List',
    sourceUrl: 'https://www.atnf.csiro.au/research/pulsar/psrcat/',
  },
  {
    id: 'psr-j0437-4715',
    commonName: 'PSR J0437-4715',
    jName: 'J0437-4715',
    raDeg: 69.31623,
    decDeg: -47.25253,
    eclipticUnitVector: equatorialToEclipticUnitVector(69.31623, -47.25253),
    periodMs: 5.7575,
    periodSec: 0.0057575,
    pDotSecPerSec: 5.73e-20,
    distanceKpc: 0.157,
    timingPrecisionUs: 3.2,
    xrayFluxCrab: 0.0012,
    referenceEpochMJD: 57600,
    source: 'ATNF Pulsar Catalogue / NASA NICER Calibration Target',
    sourceUrl: 'https://heasarc.gsfc.nasa.gov/docs/nicer/',
  },
  {
    id: 'psr-b1821-24',
    commonName: 'PSR B1821-24 (M28A)',
    jName: 'J1824-2452A',
    raDeg: 276.13337,
    decDeg: -24.86964,
    eclipticUnitVector: equatorialToEclipticUnitVector(276.13337, -24.86964),
    periodMs: 3.0543,
    periodSec: 0.0030543,
    pDotSecPerSec: 1.62e-18,
    distanceKpc: 5.5,
    timingPrecisionUs: 6.1,
    xrayFluxCrab: 0.008,
    referenceEpochMJD: 57400,
    source: 'ATNF Pulsar Catalogue / NASA SEXTANT Primary Beacon',
    sourceUrl: 'https://www.atnf.csiro.au/research/pulsar/psrcat/',
  },
  {
    id: 'psr-j0218+4232',
    commonName: 'PSR J0218+4232',
    jName: 'J0218+4232',
    raDeg: 34.52646,
    decDeg: 42.53817,
    eclipticUnitVector: equatorialToEclipticUnitVector(34.52646, 42.53817),
    periodMs: 2.3231,
    periodSec: 0.0023231,
    pDotSecPerSec: 7.74e-20,
    distanceKpc: 3.15,
    timingPrecisionUs: 7.8,
    xrayFluxCrab: 0.0035,
    referenceEpochMJD: 57200,
    source: 'ATNF Pulsar Catalogue / NASA NICER',
    sourceUrl: 'https://www.atnf.csiro.au/research/pulsar/psrcat/',
  },
  {
    id: 'psr-j2124-3358',
    commonName: 'PSR J2124-3358',
    jName: 'J2124-3358',
    raDeg: 321.18271,
    decDeg: -33.97908,
    eclipticUnitVector: equatorialToEclipticUnitVector(321.18271, -33.97908),
    periodMs: 4.9311,
    periodSec: 0.0049311,
    pDotSecPerSec: 2.06e-20,
    distanceKpc: 0.41,
    timingPrecisionUs: 8.5,
    xrayFluxCrab: 0.0015,
    referenceEpochMJD: 57550,
    source: 'ATNF Pulsar Catalogue / NASA SEXTANT Target List',
    sourceUrl: 'https://www.atnf.csiro.au/research/pulsar/psrcat/',
  },
];
