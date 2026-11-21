import { SPACECRAFT_CATALOG } from '../../src/shared/catalog/missions.ts';
import {
  AU_KM,
  PLANET_ELEMENTS_J2000,
  SECONDS_PER_DAY,
} from '../../src/shared/science/constants.ts';
import {
  buildStateVector,
  computeEstimatedMoonState,
  computeKeplerianState,
  computeSunEarthLagrangePoints,
  dateToJulianDay,
  parseDateSafe,
  vecAdd,
} from '../../src/shared/science/physics.ts';
import type {
  CelestialBodyData,
  SolarSystemSnapshot,
  SpacecraftState,
  Vector3D,
} from '../../src/shared/types.ts';
import { getHorizonsVector } from './horizons.ts';

function computeOrbitalFallbackOffset(
  radiusAU: number,
  inclinationDeg: number,
  speedRadPerDay: number,
  phaseOffsetRad: number,
  date: Date
): { pos: Vector3D; vel: Vector3D } {
  const daysSinceJ2000 = dateToJulianDay(date) - 2451545.0;
  const theta = phaseOffsetRad + speedRadPerDay * daysSinceJ2000;
  const inc = (inclinationDeg * Math.PI) / 180;
  const pos: Vector3D = {
    x: radiusAU * Math.cos(theta),
    y: radiusAU * Math.sin(theta) * Math.cos(inc),
    z: radiusAU * Math.sin(theta) * Math.sin(inc),
  };
  const vel: Vector3D = {
    x: -radiusAU * speedRadPerDay * Math.sin(theta),
    y: radiusAU * speedRadPerDay * Math.cos(theta) * Math.cos(inc),
    z: radiusAU * speedRadPerDay * Math.cos(theta) * Math.sin(inc),
  };
  return { pos, vel };
}

export async function buildSolarSystemSnapshot(
  dateInput: string,
  forceRefresh = false
): Promise<SolarSystemSnapshot> {
  const dateObj = parseDateSafe(dateInput);
  const dateIso = dateObj.toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  // 1. Resolve Earth first (live Horizons or Keplerian fallback)
  const earthEl = PLANET_ELEMENTS_J2000.find((p) => p.id === 'earth')!;
  const earthHorizons = await getHorizonsVector(earthEl.naifId, dateIso, forceRefresh);
  const earthFallback = computeKeplerianState(earthEl, dateObj);
  const earthPos = earthHorizons.sample?.positionAU ?? earthFallback.positionAU;
  const earthVel = earthHorizons.sample?.velocityAUPerDay ?? earthFallback.velocityAUPerDay;

  // 2. Build Sun + 8 planets
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
        source: 'IAU / Heliocentric Ecliptic J2000 Origin',
        sourceUrl: 'https://ssd.jpl.nasa.gov/doc/horizons.html',
        retrievedAt: nowIso,
        observationEpoch: `${dateIso} 00:00:00 TDB`,
        referenceFrame: 'Heliocentric Ecliptic J2000',
        classification: 'COMPUTED',
      },
    },
  ];

  const bodyPositionMap = new Map<string, { pos: Vector3D; vel: Vector3D }>();
  bodyPositionMap.set('sun', { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } });
  bodyPositionMap.set('earth', { pos: earthPos, vel: earthVel });

  for (const el of PLANET_ELEMENTS_J2000) {
    if (el.id === 'earth') {
      bodies.push({
        id: el.id,
        naifId: el.naifId,
        name: el.name,
        type: 'planet',
        color: el.color,
        radiusKm: el.radiusKm,
        semiMajorAxisAU: el.aAU,
        orbitalPeriodDays: el.orbitalPeriodDays,
        state: buildStateVector(earthPos, earthVel, earthPos),
        provenance: earthHorizons.sample
          ? {
              source: `NASA/JPL Horizons (${earthHorizons.sample.sourceDescriptor})`,
              sourceUrl: 'https://ssd-api.jpl.nasa.gov/doc/horizons.html',
              retrievedAt: earthHorizons.sample.retrievedAt,
              observationEpoch: earthHorizons.sample.epochTdb,
              referenceFrame: earthHorizons.sample.referenceFrame,
              classification: 'OBSERVED',
            }
          : {
              source: 'Standish/JPL J2000 Keplerian Elements (Fallback)',
              sourceUrl: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
              retrievedAt: nowIso,
              observationEpoch: `${dateIso}T00:00:00Z`,
              referenceFrame: 'Heliocentric Ecliptic J2000',
              classification: 'ESTIMATED',
              notes: earthHorizons.error ?? 'Horizons unavailable; Keplerian analytical model active.',
            },
      });
      continue;
    }

    const res = await getHorizonsVector(el.naifId, dateIso, forceRefresh);
    const fallback = computeKeplerianState(el, dateObj);
    const pos = res.sample?.positionAU ?? fallback.positionAU;
    const vel = res.sample?.velocityAUPerDay ?? fallback.velocityAUPerDay;
    bodyPositionMap.set(el.id, { pos, vel });

    bodies.push({
      id: el.id,
      naifId: el.naifId,
      name: el.name,
      type: 'planet',
      color: el.color,
      radiusKm: el.radiusKm,
      semiMajorAxisAU: el.aAU,
      orbitalPeriodDays: el.orbitalPeriodDays,
      state: buildStateVector(pos, vel, earthPos),
      provenance: res.sample
        ? {
            source: `NASA/JPL Horizons (${res.sample.sourceDescriptor})`,
            sourceUrl: 'https://ssd-api.jpl.nasa.gov/doc/horizons.html',
            retrievedAt: res.sample.retrievedAt,
            observationEpoch: res.sample.epochTdb,
            referenceFrame: res.sample.referenceFrame,
            classification: 'OBSERVED',
          }
        : {
            source: 'Standish/JPL J2000 Keplerian Elements (Fallback)',
            sourceUrl: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
            retrievedAt: nowIso,
            observationEpoch: `${dateIso}T00:00:00Z`,
            referenceFrame: 'Heliocentric Ecliptic J2000',
            classification: 'ESTIMATED',
            notes: res.error ?? 'Horizons unavailable; Keplerian analytical model active.',
          },
    });
  }

  // 3. Moon (NAIF 301)
  const moonRes = await getHorizonsVector('301', dateIso, forceRefresh);
  const moonFallback = computeEstimatedMoonState(earthPos, earthVel, dateObj);
  const moonPos = moonRes.sample?.positionAU ?? moonFallback.positionAU;
  const moonVel = moonRes.sample?.velocityAUPerDay ?? moonFallback.velocityAUPerDay;
  bodyPositionMap.set('moon', { pos: moonPos, vel: moonVel });

  bodies.push({
    id: 'moon',
    naifId: '301',
    name: 'Moon',
    type: 'moon',
    color: '#cbd5e1',
    radiusKm: 1737.4,
    semiMajorAxisAU: 1.00257,
    orbitalPeriodDays: 27.322,
    state: buildStateVector(moonPos, moonVel, earthPos),
    provenance: moonRes.sample
      ? {
          source: `NASA/JPL Horizons (${moonRes.sample.sourceDescriptor})`,
          sourceUrl: 'https://ssd-api.jpl.nasa.gov/doc/horizons.html',
          retrievedAt: moonRes.sample.retrievedAt,
          observationEpoch: moonRes.sample.epochTdb,
          referenceFrame: moonRes.sample.referenceFrame,
          classification: 'OBSERVED',
        }
      : {
          source: 'Simplified Geocentric Lunar Orbit Model',
          sourceUrl: 'https://ssd.jpl.nasa.gov/',
          retrievedAt: nowIso,
          observationEpoch: `${dateIso}T00:00:00Z`,
          referenceFrame: 'Heliocentric Ecliptic J2000',
          classification: 'ESTIMATED',
        },
  });

  // 4. Sun-Earth L1 and L2 Lagrange points
  const { l1PosAU, l1Vel, l2PosAU, l2Vel } = computeSunEarthLagrangePoints(earthPos, earthVel);
  bodyPositionMap.set('L1', { pos: l1PosAU, vel: l1Vel });
  bodyPositionMap.set('L2', { pos: l2PosAU, vel: l2Vel });

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
      state: buildStateVector(l1PosAU, l1Vel, earthPos),
      provenance: {
        source: 'CELESTIUM Hill-Sphere Collinear Lagrange Solver',
        sourceUrl: 'https://ssd.jpl.nasa.gov/',
        retrievedAt: nowIso,
        observationEpoch: `${dateIso}T00:00:00Z`,
        referenceFrame: 'Heliocentric Ecliptic J2000',
        classification: 'COMPUTED',
        uncertainty: '±15,000 km vs full halo libration manifold',
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
      state: buildStateVector(l2PosAU, l2Vel, earthPos),
      provenance: {
        source: 'CELESTIUM Hill-Sphere Collinear Lagrange Solver',
        sourceUrl: 'https://ssd.jpl.nasa.gov/',
        retrievedAt: nowIso,
        observationEpoch: `${dateIso}T00:00:00Z`,
        referenceFrame: 'Heliocentric Ecliptic J2000',
        classification: 'COMPUTED',
        uncertainty: '±15,000 km vs full halo libration manifold',
      },
    }
  );

  // 5. Spacecraft states
  const spacecraft: SpacecraftState[] = [];
  for (const meta of SPACECRAFT_CATALOG) {
    let posAU: Vector3D | null = null;
    let velAU: Vector3D | null = null;
    let provenance: SpacecraftState['provenance'] | null = null;
    let freshnessLabel = '';

    if (meta.horizonsSupported && meta.naifId) {
      const targetEpoch =
        meta.historicalEpoch && dateIso > meta.historicalEpoch ? meta.historicalEpoch : dateIso;
      const res = await getHorizonsVector(meta.naifId, targetEpoch, forceRefresh);

      if (res.sample) {
        posAU = res.sample.positionAU;
        velAU = res.sample.velocityAUPerDay;
        const isHistorical = Boolean(meta.historicalEpoch && dateIso > meta.historicalEpoch);
        freshnessLabel = isHistorical
          ? `Historical verified epoch (${meta.historicalEpoch})`
          : `Horizons epoch ${res.sample.epochTdb}`;
        provenance = {
          source: `NASA/JPL Horizons (${res.sample.sourceDescriptor})`,
          sourceUrl: meta.officialUrl,
          retrievedAt: res.sample.retrievedAt,
          observationEpoch: res.sample.epochTdb,
          referenceFrame: res.sample.referenceFrame,
          classification: 'OBSERVED',
          notes: isHistorical
            ? `Mission concluded active phase; displaying last verified Horizons epoch (${meta.historicalEpoch}) rather than live tracking.`
            : undefined,
        };
      }
    }

    if (!posAU || !velAU || !provenance) {
      const centerBody = bodyPositionMap.get(meta.orbitalFallback.center) ?? {
        pos: earthPos,
        vel: earthVel,
      };
      const offset = computeOrbitalFallbackOffset(
        meta.orbitalFallback.radiusAU,
        meta.orbitalFallback.inclinationDeg,
        meta.orbitalFallback.speedRadPerDay,
        meta.orbitalFallback.phaseOffsetRad,
        dateObj
      );
      posAU = vecAdd(centerBody.pos, offset.pos);
      velAU = vecAdd(centerBody.vel, offset.vel);
      freshnessLabel = meta.horizonsSupported
        ? 'SIMULATED fallback (Horizons unavailable)'
        : `SIMULATED (${meta.regime})`;
      provenance = {
        source: meta.sourceName,
        sourceUrl: meta.officialUrl,
        retrievedAt: nowIso,
        observationEpoch: `${dateIso}T00:00:00Z`,
        referenceFrame: 'Heliocentric Ecliptic J2000',
        classification: 'SIMULATED',
        notes: meta.horizonsSupported
          ? 'JPL Horizons ephemeris temporarily unavailable; rendering documented orbital regime model.'
          : 'Public continuous ephemeris not published by agency; rendering verified orbital regime model.',
      };
    }

    spacecraft.push({
      ...meta,
      state: buildStateVector(posAU, velAU, earthPos),
      provenance,
      freshnessLabel,
    });
  }

  // 6. Compute aggregate dashboard summary strictly from actual retrieved/modeled items
  const activeSpacecraft = spacecraft.filter((s) => s.isActive);
  let nearest: { name: string; distanceKm: number; oneWayLightTimeSec: number } | null = null;
  let longest: { name: string; distanceAU: number; oneWayLightTimeSec: number } | null = null;

  for (const sc of spacecraft) {
    const distKm = sc.state.distanceFromEarthAU * AU_KM;
    if (!nearest || distKm < nearest.distanceKm) {
      nearest = {
        name: sc.name,
        distanceKm: Number(distKm.toFixed(0)),
        oneWayLightTimeSec: Number(sc.state.oneWayLightTimeSec.toFixed(4)),
      };
    }
    if (!longest || sc.state.oneWayLightTimeSec > longest.oneWayLightTimeSec) {
      longest = {
        name: sc.name,
        distanceAU: Number(sc.state.distanceFromEarthAU.toFixed(3)),
        oneWayLightTimeSec: Number(sc.state.oneWayLightTimeSec.toFixed(2)),
      };
    }
  }

  return {
    requestedDate: dateIso,
    generatedAt: nowIso,
    referenceFrame: 'Heliocentric Ecliptic J2000 (ICRF)',
    bodies,
    spacecraft,
    summary: {
      totalTrackedAssets: spacecraft.length,
      verifiedActiveMissions: activeSpacecraft.length,
      observedHorizonsCount: spacecraft.filter((s) => s.provenance.classification === 'OBSERVED')
        .length,
      simulatedOrEstimatedCount: spacecraft.filter(
        (s) => s.provenance.classification !== 'OBSERVED'
      ).length,
      nearestSpacecraft: nearest,
      longestSignalDelay: longest,
    },
  };
}
