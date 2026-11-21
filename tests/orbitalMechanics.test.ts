import { describe, expect, it } from 'vitest';
import { AU_KM, MU_EARTH_KM3_S2, SECONDS_PER_DAY } from '../src/shared/science/constants.ts';
import {
  computeHohmannTransfer,
  propagateTrajectory,
  stateToOrbitalElements,
} from '../src/shared/science/orbitalMechanics.ts';

describe('Orbital Mechanics, RK45 Propagator & COE Solver', () => {
  it('conserves specific energy and angular momentum to < 1e-8 relative drift on circular Earth orbit', () => {
    const r0 = 7000; // km
    const vCirc = Math.sqrt(MU_EARTH_KM3_S2 / r0);
    const periodDays = (2 * Math.PI * Math.sqrt(Math.pow(r0, 3) / MU_EARTH_KM3_S2)) / SECONDS_PER_DAY;

    const res = propagateTrajectory({
      centralBody: 'earth',
      initialPositionKm: { x: r0, y: 0, z: 0 },
      initialVelocityKmS: { x: 0, y: vCirc * Math.cos(0.45), z: vCirc * Math.sin(0.45) },
      epochIso: '2026-11-21T00:00:00Z',
      durationDays: periodDays,
      integrator: 'rk45',
      enableJ2: false,
      enableSrp: false,
      enableThirdBody: false,
    });

    expect(res.conservationDiagnostics.relativeEnergyDrift).toBeLessThan(1e-8);
    expect(res.conservationDiagnostics.relativeAngularMomentumDrift).toBeLessThan(1e-8);
    expect(res.stepSensitivityCheck.passed).toBe(true);
    // After 1 full orbital period, spacecraft returns near initial position (7000, 0, 0)
    expect(res.finalState.positionKm.x).toBeCloseTo(r0, 0);
    expect(Math.abs(res.finalState.positionKm.y)).toBeLessThan(0.5);
  });

  it('shows J2 oblateness perturbation creates non-zero drift relative to pure two-body', () => {
    const baseReq = {
      centralBody: 'earth' as const,
      initialPositionKm: { x: 6878, y: 0, z: 0 },
      initialVelocityKmS: { x: 0, y: 5.4, z: 5.4 },
      epochIso: '2026-11-21T00:00:00Z',
      durationDays: 0.5,
      integrator: 'rk45' as const,
    };
    const twoBody = propagateTrajectory({ ...baseReq, enableJ2: false });
    const withJ2 = propagateTrajectory({ ...baseReq, enableJ2: true });
    const dr = Math.hypot(
      twoBody.finalState.positionKm.x - withJ2.finalState.positionKm.x,
      twoBody.finalState.positionKm.y - withJ2.finalState.positionKm.y,
      twoBody.finalState.positionKm.z - withJ2.finalState.positionKm.z
    );
    expect(dr).toBeGreaterThan(1.0); // km-level secular/periodic J2 displacement over 12h LEO
  });

  it('compares RK4 and RK45 propagators consistently', () => {
    const rk45 = propagateTrajectory({
      centralBody: 'earth',
      initialPositionKm: { x: 7500, y: 0, z: 0 },
      initialVelocityKmS: { x: 0, y: 7.5, z: 1.0 },
      epochIso: '2026-11-21T00:00:00Z',
      durationDays: 0.25,
      integrator: 'rk45',
    });
    const rk4 = propagateTrajectory({
      centralBody: 'earth',
      initialPositionKm: { x: 7500, y: 0, z: 0 },
      initialVelocityKmS: { x: 0, y: 7.5, z: 1.0 },
      epochIso: '2026-11-21T00:00:00Z',
      durationDays: 0.25,
      integrator: 'rk4',
      stepSizeSec: 15,
    });
    const posDiff = Math.hypot(
      rk45.finalState.positionKm.x - rk4.finalState.positionKm.x,
      rk45.finalState.positionKm.y - rk4.finalState.positionKm.y,
      rk45.finalState.positionKm.z - rk4.finalState.positionKm.z
    );
    expect(posDiff).toBeLessThan(0.01);
  });

  it('handles circular and equatorial edge cases in Classical Orbital Elements without fake angles', () => {
    const r0 = 8000;
    const vCirc = Math.sqrt(MU_EARTH_KM3_S2 / r0);
    const coe = stateToOrbitalElements(
      { x: r0, y: 0, z: 0 },
      { x: 0, y: vCirc, z: 0 },
      'earth'
    );

    expect(coe.edgeCaseFlags.isCircular).toBe(true);
    expect(coe.edgeCaseFlags.isEquatorial).toBe(true);
    expect(coe.raanDeg).toBeNull();
    expect(coe.argPeriapsisDeg).toBeNull();
    expect(coe.trueAnomalyDeg).toBeNull();
    expect(coe.trueLongitudeDeg).toBeCloseTo(0, 6);
    expect(coe.semiMajorAxisKm).toBeCloseTo(r0, 4);
  });

  it('matches analytical Hohmann Earth-Mars (~258.9d, ~5.59 km/s) and LEO-GEO (~3.935 km/s) solutions', () => {
    const earthMars = computeHohmannTransfer({
      centralBody: 'sun',
      r1Km: AU_KM,
      r2Km: 1.52371 * AU_KM,
    });
    expect(earthMars.transferTimeDays).toBeCloseTo(258.9, 0);
    expect(earthMars.totalDeltaVKmS).toBeCloseTo(5.59, 1);

    const leoGeo = computeHohmannTransfer({
      centralBody: 'earth',
      r1Km: 6578,
      r2Km: 42164,
    });
    expect(leoGeo.totalDeltaVKmS).toBeCloseTo(3.935, 2);
    expect(leoGeo.transferTimeSec / 3600).toBeCloseTo(5.26, 1);
  });
});
