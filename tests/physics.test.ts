import { describe, expect, it } from 'vitest';
import { AU_KM, AU_METERS, C_MPS, MU_SUN_KM3_S2 } from '../src/shared/science/constants.ts';
import {
  auToKm,
  auToMeters,
  computeMissionPlan,
  kmToAu,
  oneWayLightTimeFromAu,
  oneWayLightTimeSeconds,
  solveKeplerEquation,
  visVivaSpeedKmS,
} from '../src/shared/science/physics.ts';

describe('Astrophysics & Orbital Mechanics Engine', () => {
  it('uses exact SI speed of light and AU definitions', () => {
    expect(C_MPS).toBe(299_792_458);
    expect(AU_METERS).toBe(149_597_870_700);
    expect(auToKm(1)).toBeCloseTo(AU_KM, 6);
    expect(kmToAu(AU_KM)).toBeCloseTo(1, 9);
    expect(auToMeters(1)).toBe(AU_METERS);
  });

  it('calculates 1 AU one-way light travel time accurately (~499.005 s)', () => {
    const tSec = oneWayLightTimeFromAu(1);
    expect(tSec).toBeCloseTo(499.00478, 3);
    expect(oneWayLightTimeSeconds(C_MPS / 1000)).toBeCloseTo(1.0, 9);
  });

  it('solves Kepler equation M = E - e*sin(E) to machine tolerance', () => {
    const e = 0.0934; // Mars eccentricity
    const M = 1.25;
    const E = solveKeplerEquation(M, e);
    expect(E - e * Math.sin(E)).toBeCloseTo(M, 10);
  });

  it('computes circular orbital speed via Vis-Viva (~29.78 km/s at 1 AU)', () => {
    const vEarth = visVivaSpeedKmS(MU_SUN_KM3_S2, AU_KM, AU_KM);
    expect(vEarth).toBeCloseTo(29.785, 2);
  });

  it('computes Hohmann Earth-to-Mars transfer duration (~258.9 days baseline)', () => {
    const plan = computeMissionPlan({
      origin: 'earth',
      destination: 'mars',
      departureDate: '2026-11-21',
      deltaVBoostKmS: 0,
      propulsionType: 'chemical',
      navigationMethod: 'hybrid-dsn-xnav',
      relayBeacon: 'l1-optical-relay',
    });

    expect(plan.transferDurationDays).toBeGreaterThan(240);
    expect(plan.transferDurationDays).toBeLessThan(275);
    expect(plan.totalDeltaVKmS).toBeGreaterThan(4.5);
    expect(plan.waypoints.length).toBeGreaterThan(20);
    expect(plan.provenance.classification).toBe('ESTIMATED');
  });
});
