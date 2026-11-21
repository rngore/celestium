import { describe, expect, it } from 'vitest';
import { SECONDS_PER_DAY } from '../src/shared/science/constants.ts';
import { solveLambert } from '../src/shared/science/lambert.ts';
import { propagateTrajectory } from '../src/shared/science/orbitalMechanics.ts';

describe('Universal-Variable Lambert Boundary-Value Solver', () => {
  it('matches Curtis Example 5.2 textbook Earth Lambert solution and propagates back to r2', () => {
    const r1 = { x: 5000, y: 10000, z: 2100 };
    const r2 = { x: -14600, y: 2500, z: 7000 };
    const tofSec = 3600;

    const sol = solveLambert({
      centralBody: 'earth',
      r1Km: r1,
      r2Km: r2,
      tofSec,
      direction: 'prograde',
    });

    expect(sol.converged).toBe(true);
    // Curtis Example 5.2 reference: v1 = [-5.9925, 1.9254, 3.2456] km/s, v2 = [-3.3125, -4.1966, -1.1853] km/s
    expect(sol.v1KmS.x).toBeCloseTo(-5.9925, 2);
    expect(sol.v1KmS.y).toBeCloseTo(1.9254, 2);
    expect(sol.v1KmS.z).toBeCloseTo(3.2456, 2);

    expect(sol.v2KmS.x).toBeCloseTo(-3.3125, 2);
    expect(sol.v2KmS.y).toBeCloseTo(-4.1966, 2);
    expect(sol.v2KmS.z).toBeCloseTo(-0.3853, 2);

    // Round-trip verification: propagate (r1, v1) with RK45 for tofSec and verify arrival at (r2, v2)
    const prop = propagateTrajectory({
      centralBody: 'earth',
      initialPositionKm: r1,
      initialVelocityKmS: sol.v1KmS,
      epochIso: '2026-11-21T00:00:00Z',
      durationDays: tofSec / SECONDS_PER_DAY,
      integrator: 'rk45',
    });

    const errKm = Math.hypot(
      prop.finalState.positionKm.x - r2.x,
      prop.finalState.positionKm.y - r2.y,
      prop.finalState.positionKm.z - r2.z
    );
    expect(errKm).toBeLessThan(0.05);
    expect(prop.finalState.velocityKmS.z).toBeCloseTo(sol.v2KmS.z, 3);
  });

  it('reports explicit singularity failure for 180-degree collinear boundary vectors', () => {
    const sol = solveLambert({
      centralBody: 'earth',
      r1Km: { x: 7000, y: 0, z: 0 },
      r2Km: { x: -10000, y: 0, z: 0 },
      tofSec: 3600,
      direction: 'prograde',
    });

    expect(sol.converged).toBe(false);
    expect(sol.failureReason).toMatch(/Singularity/i);
  });
});
