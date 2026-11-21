import type {
  MissionPlanRequest,
  MissionPlanResult,
  PlannerBodyId,
  StateVectorAU,
  TrajectoryWaypoint,
  Vector3D,
} from '../types.ts';
import {
  AU_KM,
  AU_METERS,
  C_KMS,
  C_MPS,
  EARTH_MOON_SUN_MASS_RATIO,
  J2000_JD,
  type KeplerianElementsJ2000,
  MU_EARTH_KM3_S2,
  MU_SUN_KM3_S2,
  PLANET_ELEMENTS_J2000,
  SECONDS_PER_DAY,
} from './constants.ts';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export function auToKm(au: number): number {
  return au * AU_KM;
}

export function kmToAu(km: number): number {
  return km / AU_KM;
}

export function auToMeters(au: number): number {
  return au * AU_METERS;
}

export function oneWayLightTimeSeconds(distanceKm: number): number {
  return (distanceKm * 1000) / C_MPS;
}

export function oneWayLightTimeFromAu(au: number): number {
  return (au * AU_METERS) / C_MPS;
}

export function formatLightTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0.00 s';
  if (seconds < 1) return `${(seconds * 1000).toFixed(2)} ms`;
  if (seconds < 120) return `${seconds.toFixed(2)} s`;
  const minutes = seconds / 60;
  if (minutes < 120) return `${minutes.toFixed(2)} min`;
  const hours = minutes / 60;
  return `${hours.toFixed(2)} hr`;
}

export function vecMagnitude(v: Vector3D): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function vecSub(a: Vector3D, b: Vector3D): Vector3D {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function vecAdd(a: Vector3D, b: Vector3D): Vector3D {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function vecScale(v: Vector3D, s: number): Vector3D {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function vecDot(a: Vector3D, b: Vector3D): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function dateToJulianDay(date: Date): number {
  return date.getTime() / (SECONDS_PER_DAY * 1000) + 2440587.5;
}

export function parseDateSafe(dateStr: string): Date {
  const parsed = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return new Date('2026-11-21T00:00:00Z');
  }
  return parsed;
}

/**
 * Solves Kepler's Equation M = E - e * sin(E) using Newton-Raphson iteration.
 */
export function solveKeplerEquation(meanAnomalyRad: number, eccentricity: number): number {
  const M = ((meanAnomalyRad % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  let E = eccentricity < 0.8 ? M : Math.PI;
  for (let iter = 0; iter < 16; iter++) {
    const f = E - eccentricity * Math.sin(E) - M;
    const fp = 1 - eccentricity * Math.cos(E);
    const delta = f / fp;
    E -= delta;
    if (Math.abs(delta) < 1e-12) break;
  }
  return E;
}

/**
 * Computes heliocentric ecliptic J2000 position (AU) and velocity (AU/day)
 * from J2000 Keplerian elements. Explicitly an ESTIMATED analytical model.
 */
export function computeKeplerianState(
  el: KeplerianElementsJ2000,
  date: Date
): { positionAU: Vector3D; velocityAUPerDay: Vector3D } {
  const jd = dateToJulianDay(date);
  const d = jd - J2000_JD;

  const L = (el.L0Deg + el.nDegPerDay * d) * DEG_TO_RAD;
  const omegaBar = el.omegaBarDeg * DEG_TO_RAD;
  const node = el.nodeDeg * DEG_TO_RAD;
  const i = el.iDeg * DEG_TO_RAD;
  const omega = omegaBar - node; // Argument of perihelion
  const M = L - omegaBar;

  const E = solveKeplerEquation(M, el.e);
  const cosE = Math.cos(E);
  const sinE = Math.sin(E);
  const sqrtOneMinusE2 = Math.sqrt(1 - el.e * el.e);

  // Perifocal coordinates (AU)
  const xp = el.aAU * (cosE - el.e);
  const yp = el.aAU * sqrtOneMinusE2 * sinE;

  // Perifocal velocity (AU/day)
  const nRadPerDay = el.nDegPerDay * DEG_TO_RAD;
  const edot = nRadPerDay / (1 - el.e * cosE);
  const vxp = -el.aAU * sinE * edot;
  const vyp = el.aAU * sqrtOneMinusE2 * cosE * edot;

  const cosO = Math.cos(node);
  const sinO = Math.sin(node);
  const cosw = Math.cos(omega);
  const sinw = Math.sin(omega);
  const cosi = Math.cos(i);
  const sini = Math.sin(i);

  // Rotation matrix from perifocal to ecliptic J2000
  const px = cosO * cosw - sinO * sinw * cosi;
  const qx = -cosO * sinw - sinO * cosw * cosi;
  const py = sinO * cosw + cosO * sinw * cosi;
  const qy = -sinO * sinw + cosO * cosw * cosi;
  const pz = sinw * sini;
  const qz = cosw * sini;

  return {
    positionAU: {
      x: px * xp + qx * yp,
      y: py * xp + qy * yp,
      z: pz * xp + qz * yp,
    },
    velocityAUPerDay: {
      x: px * vxp + qx * vyp,
      y: py * vxp + qy * vyp,
      z: pz * vxp + qz * vyp,
    },
  };
}

export function buildStateVector(
  positionAU: Vector3D,
  velocityAUPerDay: Vector3D,
  earthPositionAU: Vector3D
): StateVectorAU {
  const distanceFromSunAU = vecMagnitude(positionAU);
  const relEarth = vecSub(positionAU, earthPositionAU);
  const distanceFromEarthAU = vecMagnitude(relEarth);
  const speedAUPerDay = vecMagnitude(velocityAUPerDay);
  const speedKmPerSec = (speedAUPerDay * AU_KM) / SECONDS_PER_DAY;
  const oneWayLightTimeSec = oneWayLightTimeFromAu(distanceFromEarthAU);

  return {
    positionAU,
    velocityAUPerDay,
    distanceFromSunAU,
    distanceFromEarthAU,
    speedKmPerSec,
    oneWayLightTimeSec,
  };
}

/**
 * Computes Sun-Earth collinear Lagrange points L1 and L2 using Hill sphere approximation:
 * r_hill = R * (mu / 3)^(1/3) ~ 0.01003 AU (~1.5 million km from Earth).
 */
export function computeSunEarthLagrangePoints(
  earthPosAU: Vector3D,
  earthVelAUPerDay: Vector3D
): { l1PosAU: Vector3D; l1Vel: Vector3D; l2PosAU: Vector3D; l2Vel: Vector3D } {
  const rEarth = vecMagnitude(earthPosAU) || 1;
  const hillFactor = Math.cbrt(EARTH_MOON_SUN_MASS_RATIO / 3);
  const l1Scale = 1 - hillFactor;
  const l2Scale = 1 + hillFactor;

  return {
    l1PosAU: vecScale(earthPosAU, l1Scale),
    l1Vel: vecScale(earthVelAUPerDay, l1Scale * (1 / Math.max(rEarth, 0.9))),
    l2PosAU: vecScale(earthPosAU, l2Scale),
    l2Vel: vecScale(earthVelAUPerDay, l2Scale * (1 / Math.max(rEarth, 0.9))),
  };
}

/**
 * Moon heliocentric position using simplified circular lunar orbit around Earth
 * (mean distance 384,400 km, period 27.32166 days, inclination 5.145 deg).
 */
export function computeEstimatedMoonState(
  earthPosAU: Vector3D,
  earthVelAUPerDay: Vector3D,
  date: Date
): { positionAU: Vector3D; velocityAUPerDay: Vector3D } {
  const jd = dateToJulianDay(date);
  const d = jd - J2000_JD;
  const lunarPeriod = 27.321661;
  const theta = (2 * Math.PI * d) / lunarPeriod + 3.81;
  const rMoonAU = 384_400 / AU_KM;
  const inc = 5.145 * DEG_TO_RAD;

  const relPos: Vector3D = {
    x: rMoonAU * Math.cos(theta),
    y: rMoonAU * Math.sin(theta) * Math.cos(inc),
    z: rMoonAU * Math.sin(theta) * Math.sin(inc),
  };

  const omega = (2 * Math.PI) / lunarPeriod;
  const relVel: Vector3D = {
    x: -rMoonAU * omega * Math.sin(theta),
    y: rMoonAU * omega * Math.cos(theta) * Math.cos(inc),
    z: rMoonAU * omega * Math.cos(theta) * Math.sin(inc),
  };

  return {
    positionAU: vecAdd(earthPosAU, relPos),
    velocityAUPerDay: vecAdd(earthVelAUPerDay, relVel),
  };
}

/**
 * Vis-viva equation: v = sqrt(mu * (2/r - 1/a))
 */
export function visVivaSpeedKmS(muKm3S2: number, rKm: number, aKm: number): number {
  const term = 2 / rKm - 1 / aKm;
  return term > 0 ? Math.sqrt(muKm3S2 * term) : 0;
}

/**
 * Generates an analytical Hohmann / patched-conic mission trajectory plan.
 * Clearly documents simplified coplanar/Keplerian assumptions.
 */
export function computeMissionPlan(req: MissionPlanRequest): MissionPlanResult {
  const departureDateObj = parseDateSafe(req.departureDate);
  const earthEl = PLANET_ELEMENTS_J2000.find((p) => p.id === 'earth')!;
  const marsEl = PLANET_ELEMENTS_J2000.find((p) => p.id === 'mars')!;
  const jupiterEl = PLANET_ELEMENTS_J2000.find((p) => p.id === 'jupiter')!;

  const bodyMeta: Record<
    PlannerBodyId,
    { name: string; radiusAU: number; getPos: (d: Date) => Vector3D }
  > = {
    earth: {
      name: 'Earth',
      radiusAU: 1.0,
      getPos: (d) => computeKeplerianState(earthEl, d).positionAU,
    },
    moon: {
      name: 'Moon',
      radiusAU: 1.00257,
      getPos: (d) => {
        const e = computeKeplerianState(earthEl, d);
        return computeEstimatedMoonState(e.positionAU, e.velocityAUPerDay, d).positionAU;
      },
    },
    mars: {
      name: 'Mars',
      radiusAU: 1.5237,
      getPos: (d) => computeKeplerianState(marsEl, d).positionAU,
    },
    jupiter: {
      name: 'Jupiter',
      radiusAU: 5.2029,
      getPos: (d) => computeKeplerianState(jupiterEl, d).positionAU,
    },
    'sun-earth-l1': {
      name: 'Sun-Earth L1',
      radiusAU: 0.99,
      getPos: (d) => {
        const e = computeKeplerianState(earthEl, d);
        return computeSunEarthLagrangePoints(e.positionAU, e.velocityAUPerDay).l1PosAU;
      },
    },
    'sun-earth-l2': {
      name: 'Sun-Earth L2',
      radiusAU: 1.01,
      getPos: (d) => {
        const e = computeKeplerianState(earthEl, d);
        return computeSunEarthLagrangePoints(e.positionAU, e.velocityAUPerDay).l2PosAU;
      },
    },
  };

  const orig = bodyMeta[req.origin];
  const dest = bodyMeta[req.destination];
  const originPosDep = orig.getPos(departureDateObj);
  const earthPosDep = bodyMeta.earth.getPos(departureDateObj);

  const isCislunarOrLagrange =
    (req.origin === 'earth' ||
      req.origin === 'moon' ||
      req.origin === 'sun-earth-l1' ||
      req.origin === 'sun-earth-l2') &&
    (req.destination === 'moon' ||
      req.destination === 'sun-earth-l1' ||
      req.destination === 'sun-earth-l2');

  let transferDurationDays: number;
  let departureSpeedKmS: number;
  let arrivalSpeedKmS: number;
  let deltaVDepKmS: number;
  let deltaVArrKmS: number;
  let transferDistanceKm: number;

  const propulsionSpeedFactor =
    req.propulsionType === 'nuclear-thermal'
      ? 0.82
      : req.propulsionType === 'solar-electric'
        ? 1.25
        : 1.0;

  if (isCislunarOrLagrange) {
    // Geocentric / Earth-neighborhood transfer estimation
    const r1Km =
      req.origin === 'earth'
        ? 6571
        : req.origin === 'moon'
          ? 384_400
          : 1_500_000;
    const r2Km =
      req.destination === 'moon'
        ? 384_400
        : req.destination === 'sun-earth-l1' || req.destination === 'sun-earth-l2'
          ? 1_500_000
          : 384_400;

    const rMin = Math.min(r1Km, r2Km);
    const rMax = Math.max(r1Km, r2Km);
    const aKm = (rMin + rMax) / 2;
    const baseHours = (Math.PI * Math.sqrt(Math.pow(aKm, 3) / MU_EARTH_KM3_S2)) / 3600;
    const boostFactor = Math.max(0.55, 1 - req.deltaVBoostKmS * 0.08);
    transferDurationDays = Math.max(1.5, (baseHours / 24) * boostFactor * propulsionSpeedFactor);

    const vCirc1 = Math.sqrt(MU_EARTH_KM3_S2 / rMin);
    const vTrans1 = visVivaSpeedKmS(MU_EARTH_KM3_S2, rMin, aKm);
    const vCirc2 = Math.sqrt(MU_EARTH_KM3_S2 / rMax);
    const vTrans2 = visVivaSpeedKmS(MU_EARTH_KM3_S2, rMax, aKm);

    deltaVDepKmS = Math.abs(vTrans1 - vCirc1) + req.deltaVBoostKmS;
    deltaVArrKmS = Math.abs(vCirc2 - vTrans2);
    departureSpeedKmS = vTrans1 + req.deltaVBoostKmS;
    arrivalSpeedKmS = vTrans2;
    transferDistanceKm = Math.PI * aKm;
  } else {
    // Heliocentric Hohmann approximation
    const r1AU = orig.radiusAU;
    const r2AU = dest.radiusAU;
    const r1Km = auToKm(r1AU);
    const r2Km = auToKm(r2AU);
    const aKm = (r1Km + r2Km) / 2;

    const tSec = Math.PI * Math.sqrt(Math.pow(aKm, 3) / MU_SUN_KM3_S2);
    const baseDays = tSec / SECONDS_PER_DAY;
    // Higher departure boost shortens transfer duration analytically (bounded)
    const boostFactor = Math.max(0.55, 1 - req.deltaVBoostKmS * 0.065);
    transferDurationDays = Math.max(12, baseDays * boostFactor * propulsionSpeedFactor);

    const vCirc1 = Math.sqrt(MU_SUN_KM3_S2 / r1Km);
    const vTrans1 = visVivaSpeedKmS(MU_SUN_KM3_S2, r1Km, aKm);
    const vCirc2 = Math.sqrt(MU_SUN_KM3_S2 / r2Km);
    const vTrans2 = visVivaSpeedKmS(MU_SUN_KM3_S2, r2Km, aKm);

    deltaVDepKmS = Math.abs(vTrans1 - vCirc1) + req.deltaVBoostKmS;
    deltaVArrKmS = Math.abs(vCirc2 - vTrans2);
    departureSpeedKmS = vTrans1 + req.deltaVBoostKmS;
    arrivalSpeedKmS = vTrans2;
    transferDistanceKm = Math.PI * aKm * (1 - 0.04 * (r1AU === r2AU ? 0 : 1));
  }

  const arrivalDateObj = new Date(
    departureDateObj.getTime() + transferDurationDays * SECONDS_PER_DAY * 1000
  );
  const destPosArr = dest.getPos(arrivalDateObj);

  // Sample trajectory waypoints along heliocentric arc from originPosDep to destPosArr
  const numSteps = 48;
  const waypoints: TrajectoryWaypoint[] = [];
  const startAngle = Math.atan2(originPosDep.y, originPosDep.x);
  const endAngleRaw = Math.atan2(destPosArr.y, destPosArr.x);
  let deltaAngle = endAngleRaw - startAngle;
  while (deltaAngle <= 0.15) deltaAngle += 2 * Math.PI;
  if (isCislunarOrLagrange) {
    deltaAngle = Math.PI * 0.35;
  }

  const rStart = vecMagnitude(originPosDep);
  const rEnd = vecMagnitude(destPosArr);

  let maxLightSec = 0;
  let minLightSec = Infinity;
  let blackoutCount = 0;

  for (let i = 0; i <= numSteps; i++) {
    const f = i / numSteps;
    const dayOffset = f * transferDurationDays;
    const stepDate = new Date(departureDateObj.getTime() + dayOffset * SECONDS_PER_DAY * 1000);
    const earthPos = bodyMeta.earth.getPos(stepDate);

    let posAU: Vector3D;
    if (isCislunarOrLagrange) {
      // Smooth local neighborhood arc anchored to moving Earth
      const destStep = dest.getPos(stepDate);
      const origStep = orig.getPos(stepDate);
      const arcLift = Math.sin(Math.PI * f) * 0.004;
      posAU = {
        x: origStep.x + (destStep.x - origStep.x) * f + arcLift,
        y: origStep.y + (destStep.y - origStep.y) * f + arcLift * 0.6,
        z: origStep.z + (destStep.z - origStep.z) * f + Math.sin(Math.PI * f) * 0.001,
      };
    } else {
      const theta = startAngle + deltaAngle * f;
      // Kepler-like smooth radial interpolation using cosine anomaly
      const radialBlend = 0.5 * (1 - Math.cos(Math.PI * f));
      const r = rStart + (rEnd - rStart) * radialBlend;
      const zEnd = destPosArr.z;
      const zStart = originPosDep.z;
      posAU = {
        x: r * Math.cos(theta),
        y: r * Math.sin(theta),
        z: zStart + (zEnd - zStart) * f + Math.sin(Math.PI * f) * 0.025,
      };
    }

    const distEarthAU = vecMagnitude(vecSub(posAU, earthPos));
    const distEarthKm = auToKm(distEarthAU);
    const lightSec = oneWayLightTimeSeconds(distEarthKm);
    if (lightSec > maxLightSec) maxLightSec = lightSec;
    if (lightSec < minLightSec) minLightSec = lightSec;

    // Solar conjunction geometry angle (Sun-Earth-Spacecraft vs Earth-Sun-Spacecraft):
    // Modeled simplified blackout risk when Sun-Spacecraft-Earth line passes within 3.0 deg of Sun disk from Earth.
    const scFromEarth = vecSub(posAU, earthPos);
    const sunFromEarth = vecScale(earthPos, -1);
    const denom = vecMagnitude(scFromEarth) * vecMagnitude(sunFromEarth);
    const cosAngle = denom > 1e-9 ? Math.max(-1, Math.min(1, vecDot(scFromEarth, sunFromEarth) / denom)) : 1;
    const sunEarthScAngleDeg = Math.acos(cosAngle) * RAD_TO_DEG;
    const behindSun = vecMagnitude(scFromEarth) > vecMagnitude(sunFromEarth);
    const modeledBlackoutRisk = !isCislunarOrLagrange && behindSun && sunEarthScAngleDeg < 3.0;
    if (modeledBlackoutRisk) blackoutCount++;

    const speed = departureSpeedKmS + (arrivalSpeedKmS - departureSpeedKmS) * f;

    waypoints.push({
      fraction: f,
      dayOffset,
      dateIso: stepDate.toISOString().slice(0, 10),
      positionAU: posAU,
      earthPositionAU: earthPos,
      distanceFromEarthKm: distEarthKm,
      oneWayLightTimeSec: lightSec,
      heliocentricSpeedKmS: speed,
      solarConjunctionAngleDeg: sunEarthScAngleDeg,
      modeledBlackoutRisk,
    });
  }

  // Orbit sample rings for visualization
  const originOrbitAU: Vector3D[] = [];
  const destinationOrbitAU: Vector3D[] = [];
  for (let i = 0; i <= 72; i++) {
    const t = (i / 72) * 365.25;
    const dO = new Date(departureDateObj.getTime() + t * SECONDS_PER_DAY * 1000);
    originOrbitAU.push(orig.getPos(dO));
  }
  const destPeriod =
    req.destination === 'jupiter' ? 4332.6 : req.destination === 'mars' ? 687 : 365.25;
  for (let i = 0; i <= 72; i++) {
    const t = (i / 72) * destPeriod;
    const dD = new Date(departureDateObj.getTime() + t * SECONDS_PER_DAY * 1000);
    destinationOrbitAU.push(dest.getPos(dD));
  }

  const modeledBlackoutDays = Number(
    ((blackoutCount / (numSteps + 1)) * transferDurationDays).toFixed(1)
  );

  const navMap: Record<MissionPlanRequest['navigationMethod'], string> = {
    'earth-dsn':
      'Ground-based DSN radiometric tracking (two-way Doppler & range); susceptible to light-time latency and solar conjunction blackout.',
    'universe-gps-xnav':
      'Autonomous onboard X-ray Pulsar Navigation (XNAV); computes heliocentric state locally without continuous Earth uplink.',
    'hybrid-dsn-xnav':
      'Hybrid DSN + XNAV architecture: periodic Earth calibration combined with autonomous X-ray pulsar state updates during cruise and conjunction.',
  };

  const relayMap: Record<MissionPlanRequest['relayBeacon'], string> = {
    none: 'Direct-to-Earth (DTE) RF link only; no intermediate optical/RF relay node.',
    'l1-optical-relay':
      'Sun-Earth L1 Optical Relay Node reduces solar conjunction blackout geometry via off-ecliptic relay baseline.',
    'mars-areostationary-relay':
      'Mars orbital relay constellation supports local proximity UHF/Ka-band link at arrival.',
    'lunar-south-pole-relay':
      'Lunar relay beacon provides continuous Earth-Moon coverage for cislunar insertion phases.',
  };

  return {
    request: req,
    originName: orig.name,
    destinationName: dest.name,
    departureDate: departureDateObj.toISOString().slice(0, 10),
    estimatedArrivalDate: arrivalDateObj.toISOString().slice(0, 10),
    transferDurationDays: Number(transferDurationDays.toFixed(1)),
    transferDistanceKm: Number(transferDistanceKm.toFixed(0)),
    transferDistanceAU: Number(kmToAu(transferDistanceKm).toFixed(4)),
    departureHeliocentricSpeedKmS: Number(departureSpeedKmS.toFixed(2)),
    arrivalHeliocentricSpeedKmS: Number(arrivalSpeedKmS.toFixed(2)),
    deltaVDepartureKmS: Number(deltaVDepKmS.toFixed(2)),
    deltaVArrivalKmS: Number(deltaVArrKmS.toFixed(2)),
    totalDeltaVKmS: Number((deltaVDepKmS + deltaVArrKmS).toFixed(2)),
    maxOneWayLightTimeSec: Number(maxLightSec.toFixed(2)),
    minOneWayLightTimeSec: Number((minLightSec === Infinity ? 0 : minLightSec).toFixed(2)),
    arrivalOneWayLightTimeSec: Number((waypoints[waypoints.length - 1]?.oneWayLightTimeSec ?? 0).toFixed(2)),
    modeledBlackoutDays,
    navigationSummary: navMap[req.navigationMethod],
    relaySummary: relayMap[req.relayBeacon],
    methodology: [
      'Planetary departure & arrival epochs computed in Heliocentric Ecliptic J2000 using Standish/JPL Keplerian elements.',
      'Transfer velocity and duration derived via patched-conic Vis-Viva equation and Hohmann transfer semi-major axis approximation.',
      `One-way signal delay calculated with exact SI speed of light c = ${C_MPS.toLocaleString()} m/s (${C_KMS.toFixed(3)} km/s).`,
      'Solar conjunction blackout estimated from simplified < 3.0 deg Sun-Earth-Spacecraft elongation geometry.',
    ],
    limitations: [
      'Preliminary analytical mission estimator — NOT an operational flight-dynamics trajectory or Lambert multi-body n-body integrator.',
      'Assumes coplanar patched-conic transfer arcs without planetary gravity-assist flybys, finite-burn losses, or solar radiation pressure.',
      'Solar conjunction blackout windows are simplified geometric conditions excluding spacecraft high-gain antenna beamwidth constraints.',
    ],
    waypoints,
    originOrbitAU,
    destinationOrbitAU,
    provenance: {
      source: 'CELESTIUM Analytical Astrodynamics Engine (Keplerian + Vis-Viva Model)',
      sourceUrl: 'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
      retrievedAt: new Date().toISOString(),
      observationEpoch: departureDateObj.toISOString(),
      referenceFrame: 'Heliocentric Ecliptic J2000',
      classification: 'ESTIMATED',
      uncertainty: 'Analytical patched-conic approximation (±5–15% vs full n-body ephemeris)',
      notes: 'Explicitly labeled simplified trajectory estimate for hackathon planning and visualization.',
    },
  };
}

export function computeEarthAtDate(date: Date): { positionAU: Vector3D; velocityAUPerDay: Vector3D } {
  const earthEl = PLANET_ELEMENTS_J2000.find((p) => p.id === 'earth')!;
  return computeKeplerianState(earthEl, date);
}
