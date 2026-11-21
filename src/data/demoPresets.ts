import { SPACECRAFT_CATALOG } from '../shared/catalog/missions.ts';
import { PLANET_ELEMENTS_J2000 } from '../shared/science/constants.ts';
import {
  buildStateVector,
  computeEstimatedMoonState,
  computeKeplerianState,
  computeMissionPlan,
  computeSunEarthLagrangePoints,
  dateToJulianDay,
  parseDateSafe,
  vecAdd,
} from '../shared/science/physics.ts';
import { SPACE_SONAR_PRESETS, runSpaceSonarSimulation } from '../shared/science/spaceSonar.ts';
import { runXnavSimulation } from '../shared/science/xnav.ts';
import type {
  CelestialBodyData,
  MissionPlanRequest,
  SolarSystemSnapshot,
  SpaceSonarRequest,
  SpacecraftState,
  Vector3D,
  XnavSimulationRequest,
} from '../shared/types.ts';

export const DEFAULT_SPACE_SONAR_REQUEST: SpaceSonarRequest = {
  modality: 'fmcw-coherent-lidar',
  rangeM: SPACE_SONAR_PRESETS['fmcw-coherent-lidar'].defaultRangeM,
  radialVelocityMS: SPACE_SONAR_PRESETS['fmcw-coherent-lidar'].defaultVelocityMS,
  txPowerW: SPACE_SONAR_PRESETS['fmcw-coherent-lidar'].defaultTxPowerW,
  apertureM: SPACE_SONAR_PRESETS['fmcw-coherent-lidar'].defaultApertureM,
  bandwidthMHz: SPACE_SONAR_PRESETS['fmcw-coherent-lidar'].defaultBandwidthHz / 1e6,
  integrationMs: SPACE_SONAR_PRESETS['fmcw-coherent-lidar'].defaultIntegrationMs,
  targetReflectivity: SPACE_SONAR_PRESETS['fmcw-coherent-lidar'].defaultTargetReflectivity,
  targetCrossSectionM2: 2.5,
  retroreflector: SPACE_SONAR_PRESETS['fmcw-coherent-lidar'].retroreflectorEnabled,
  solarBackground: true,
  beaconCount: 4,
  seed: 20261121,
};

export const VOYAGER_DEMO_XNAV_REQUEST: XnavSimulationRequest = {
  spacecraftId: 'voyager-1',
  truePositionKm: {
    x: -4.82e9,
    y: -2.05e10,
    z: 1.48e10,
  },
  initialGuessErrorKm: 1850,
  pulsarIds: ['psr-b0531+21', 'psr-b1937+21', 'psr-j0437-4715', 'psr-b1821-24'],
  observationDurationSec: 3600,
  toaNoiseMultiplier: 1.0,
  dsnDisrupted: true,
  seed: 19770905,
};

export const EARTH_MARS_DEMO_PLAN_REQUEST: MissionPlanRequest = {
  origin: 'earth',
  destination: 'mars',
  departureDate: '2026-11-21',
  deltaVBoostKmS: 0.4,
  propulsionType: 'chemical',
  navigationMethod: 'hybrid-dsn-xnav',
  relayBeacon: 'l1-optical-relay',
};

export function createDefaultSpaceSonarResult() {
  return runSpaceSonarSimulation(DEFAULT_SPACE_SONAR_REQUEST);
}

export function createDemoXnavResult() {
  return runXnavSimulation(VOYAGER_DEMO_XNAV_REQUEST);
}

export function createDemoMarsPlanResult() {
  return computeMissionPlan(EARTH_MARS_DEMO_PLAN_REQUEST);
}

/**
 * Generates a self-contained SolarSystemSnapshot locally using J2000 Keplerian elements
 * and documented spacecraft orbital regimes so offline/cache fallback remains physically consistent.
 */
export function buildOfflineSolarSystemSnapshot(dateInput = '2026-11-21'): SolarSystemSnapshot {
  const dateObj = parseDateSafe(dateInput);
  const dateIso = dateObj.toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  const earthEl = PLANET_ELEMENTS_J2000.find((p) => p.id === 'earth')!;
  const earthState = computeKeplerianState(earthEl, dateObj);
  const earthPos = earthState.positionAU;
  const earthVel = earthState.velocityAUPerDay;

  const bodies: CelestialBodyData[] = [
    {
      id: 'sun',
      naifId: '10',
      name: 'Sun',
      type: 'star',
      color: '#fbbf24',
      radiusKm: 695700,
      semiMajorAxisAU: 0,
      orbitalPeriodDays: 0,
      state: buildStateVector({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, earthPos),
      provenance: {
        source: 'IAU Heliocentric Ecliptic J2000 Origin',
        sourceUrl: 'https://ssd.jpl.nasa.gov/doc/horizons.html',
        retrievedAt: nowIso,
        observationEpoch: `${dateIso}T00:00:00Z`,
        referenceFrame: 'Heliocentric Ecliptic J2000',
        classification: 'COMPUTED',
      },
    },
  ];

  const posMap = new Map<string, { pos: Vector3D; vel: Vector3D }>();
  posMap.set('sun', { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } });
  posMap.set('earth', { pos: earthPos, vel: earthVel });

  for (const el of PLANET_ELEMENTS_J2000) {
    const st = el.id === 'earth' ? earthState : computeKeplerianState(el, dateObj);
    posMap.set(el.id, { pos: st.positionAU, vel: st.velocityAUPerDay });
    bodies.push({
      id: el.id,
      naifId: el.naifId,
      name: el.name,
      type: 'planet',
      color: el.color,
      radiusKm: el.radiusKm,
      semiMajorAxisAU: el.aAU,
      orbitalPeriodDays: el.orbitalPeriodDays,
      state: buildStateVector(st.positionAU, st.velocityAUPerDay, earthPos),
      provenance: {
        source: 'Standish/JPL J2000 Keplerian Analytical Model (Offline Fallback)',
        sourceUrl: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
        retrievedAt: nowIso,
        observationEpoch: `${dateIso}T00:00:00Z`,
        referenceFrame: 'Heliocentric Ecliptic J2000',
        classification: 'ESTIMATED',
      },
    });
  }

  const moon = computeEstimatedMoonState(earthPos, earthVel, dateObj);
  posMap.set('moon', { pos: moon.positionAU, vel: moon.velocityAUPerDay });
  bodies.push({
    id: 'moon',
    naifId: '301',
    name: 'Moon',
    type: 'moon',
    color: '#cbd5e1',
    radiusKm: 1737.4,
    semiMajorAxisAU: 1.00257,
    orbitalPeriodDays: 27.322,
    state: buildStateVector(moon.positionAU, moon.velocityAUPerDay, earthPos),
    provenance: {
      source: 'Simplified Geocentric Lunar Orbit Model',
      sourceUrl: 'https://ssd.jpl.nasa.gov/',
      retrievedAt: nowIso,
      observationEpoch: `${dateIso}T00:00:00Z`,
      referenceFrame: 'Heliocentric Ecliptic J2000',
      classification: 'ESTIMATED',
    },
  });

  const lag = computeSunEarthLagrangePoints(earthPos, earthVel);
  posMap.set('L1', { pos: lag.l1PosAU, vel: lag.l1Vel });
  posMap.set('L2', { pos: lag.l2PosAU, vel: lag.l2Vel });

  bodies.push(
    {
      id: 'sun-earth-l1',
      naifId: 'L1',
      name: 'Sun-Earth L1',
      type: 'lagrange',
      color: '#22d3ee',
      radiusKm: 1200,
      semiMajorAxisAU: 0.99,
      orbitalPeriodDays: 365.256,
      state: buildStateVector(lag.l1PosAU, lag.l1Vel, earthPos),
      provenance: {
        source: 'CELESTIUM Hill-Sphere Solver',
        sourceUrl: 'https://ssd.jpl.nasa.gov/',
        retrievedAt: nowIso,
        observationEpoch: `${dateIso}T00:00:00Z`,
        referenceFrame: 'Heliocentric Ecliptic J2000',
        classification: 'COMPUTED',
      },
    },
    {
      id: 'sun-earth-l2',
      naifId: 'L2',
      name: 'Sun-Earth L2',
      type: 'lagrange',
      color: '#38bdf8',
      radiusKm: 1200,
      semiMajorAxisAU: 1.01,
      orbitalPeriodDays: 365.256,
      state: buildStateVector(lag.l2PosAU, lag.l2Vel, earthPos),
      provenance: {
        source: 'CELESTIUM Hill-Sphere Solver',
        sourceUrl: 'https://ssd.jpl.nasa.gov/',
        retrievedAt: nowIso,
        observationEpoch: `${dateIso}T00:00:00Z`,
        referenceFrame: 'Heliocentric Ecliptic J2000',
        classification: 'COMPUTED',
      },
    }
  );

  const dJ2000 = dateToJulianDay(dateObj) - 2451545.0;
  const spacecraft: SpacecraftState[] = SPACECRAFT_CATALOG.map((meta) => {
    const c = posMap.get(meta.orbitalFallback.center) ?? { pos: earthPos, vel: earthVel };
    const theta = meta.orbitalFallback.phaseOffsetRad + meta.orbitalFallback.speedRadPerDay * dJ2000;
    const inc = (meta.orbitalFallback.inclinationDeg * Math.PI) / 180;
    const offsetPos: Vector3D = {
      x: meta.orbitalFallback.radiusAU * Math.cos(theta),
      y: meta.orbitalFallback.radiusAU * Math.sin(theta) * Math.cos(inc),
      z: meta.orbitalFallback.radiusAU * Math.sin(theta) * Math.sin(inc),
    };
    const offsetVel: Vector3D = {
      x: -meta.orbitalFallback.radiusAU * meta.orbitalFallback.speedRadPerDay * Math.sin(theta),
      y: meta.orbitalFallback.radiusAU * meta.orbitalFallback.speedRadPerDay * Math.cos(theta) * Math.cos(inc),
      z: meta.orbitalFallback.radiusAU * meta.orbitalFallback.speedRadPerDay * Math.cos(theta) * Math.sin(inc),
    };

    return {
      ...meta,
      state: buildStateVector(vecAdd(c.pos, offsetPos), vecAdd(c.vel, offsetVel), earthPos),
      freshnessLabel: 'SIMULATED (Local Regime Fallback)',
      provenance: {
        source: `${meta.sourceName} (Local Analytical Model)`,
        sourceUrl: meta.officialUrl,
        retrievedAt: nowIso,
        observationEpoch: `${dateIso}T00:00:00Z`,
        referenceFrame: 'Heliocentric Ecliptic J2000',
        classification: 'SIMULATED',
        notes: 'Rendered from documented orbital parameters while awaiting live JPL Horizons sync.',
      },
    };
  });

  return {
    requestedDate: dateIso,
    generatedAt: nowIso,
    referenceFrame: 'Heliocentric Ecliptic J2000 (ICRF)',
    bodies,
    spacecraft,
    summary: {
      totalTrackedAssets: spacecraft.length,
      verifiedActiveMissions: spacecraft.filter((s) => s.isActive).length,
      observedHorizonsCount: 0,
      simulatedOrEstimatedCount: spacecraft.length,
      nearestSpacecraft: {
        name: 'XPoSat',
        distanceKm: 7020,
        oneWayLightTimeSec: 0.0234,
      },
      longestSignalDelay: {
        name: 'Voyager 1',
        distanceAU: 172.4,
        oneWayLightTimeSec: 86028,
      },
    },
  };
}
