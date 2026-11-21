import { describe, expect, it } from 'vitest';
import { PULSAR_CATALOG } from '../src/shared/catalog/pulsars.ts';
import { computePulsarPhasePrediction, runXnavSimulation } from '../src/shared/science/xnav.ts';

describe('Autonomous XNAV Mathematical Engine (4-State WLS & 8-State EKF)', () => {
  it('contains at least 4 documented pulsars with normalized J2000 unit vectors', () => {
    expect(PULSAR_CATALOG.length).toBeGreaterThanOrEqual(4);
    for (const p of PULSAR_CATALOG) {
      const mag = Math.hypot(
        p.eclipticUnitVector.x,
        p.eclipticUnitVector.y,
        p.eclipticUnitVector.z
      );
      expect(mag).toBeCloseTo(1, 4);
    }
  });

  it('computes simplified TDB pulsar phase prediction phi(t) = phi0 + f0*dt + 0.5*fdot*dt^2', () => {
    const crab = PULSAR_CATALOG[0];
    const pred = computePulsarPhasePrediction(crab, 1000, 0.25);
    expect(pred.f0Hz).toBeCloseTo(1 / crab.periodSec, 6);
    expect(pred.predictedCycles).toBeGreaterThan(29_000);
    expect(pred.fractionalPhase).toBeGreaterThanOrEqual(0);
    expect(pred.fractionalPhase).toBeLessThan(1);
  });

  it('converges 4-state WLS ([dx,dy,dz,dt]) and 8-state EKF ([r,v,b,d]) from large initial error', () => {
    const res = runXnavSimulation({
      truePositionKm: { x: -4.82e9, y: -2.05e10, z: 1.48e10 },
      initialGuessErrorKm: 2500,
      pulsarIds: ['psr-b0531+21', 'psr-b1937+21', 'psr-j0437-4715', 'psr-b1821-24'],
      observationDurationSec: 3600,
      toaNoiseMultiplier: 1.0,
      dsnDisrupted: false,
      seed: 42,
    });

    expect(res.converged).toBe(true);
    expect(res.rankDeficient).toBe(false);
    expect(res.wlsErrorKm).toBeLessThan(80);
    expect(res.ekfErrorKm).toBeLessThan(80);
    expect(res.designMatrixH[0]).toHaveLength(4);
    expect(res.covariance8x8).toHaveLength(8);
    expect(res.ekfHistory.length).toBe(8);
    expect(res.ekfHistory[7].positionErrorKm).toBeLessThan(res.ekfHistory[0].positionErrorKm + 50);
    expect(res.provenance.classification).toBe('SIMULATED');
  });

  it('detects rank-deficiency when fewer than 4 pulsars are provided for 4-state estimation', () => {
    const res = runXnavSimulation({
      truePositionKm: { x: 1.5e8, y: 0, z: 0 },
      initialGuessErrorKm: 1000,
      pulsarIds: ['psr-b0531+21', 'psr-b1937+21', 'psr-j0437-4715'],
      observationDurationSec: 1800,
      toaNoiseMultiplier: 1.0,
      dsnDisrupted: false,
      seed: 7,
    });

    expect(res.rankDeficient).toBe(true);
    expect(res.geometryWarning).toMatch(/Rank-deficient/i);
  });

  it('scales uncertainty proportionally with TOA noise multiplier and models DSN blackout', () => {
    const lowNoise = runXnavSimulation({
      truePositionKm: { x: 1.5e8, y: 2.0e8, z: 0.3e8 },
      initialGuessErrorKm: 1000,
      pulsarIds: ['psr-b0531+21', 'psr-b1937+21', 'psr-j0437-4715', 'psr-b1821-24'],
      observationDurationSec: 1800,
      toaNoiseMultiplier: 0.5,
      dsnDisrupted: true,
      seed: 99,
    });
    const highNoise = runXnavSimulation({
      truePositionKm: { x: 1.5e8, y: 2.0e8, z: 0.3e8 },
      initialGuessErrorKm: 1000,
      pulsarIds: ['psr-b0531+21', 'psr-b1937+21', 'psr-j0437-4715', 'psr-b1821-24'],
      observationDurationSec: 1800,
      toaNoiseMultiplier: 3.0,
      dsnDisrupted: true,
      seed: 99,
    });

    expect(highNoise.uncertainty1SigmaKm).toBeGreaterThan(lowNoise.uncertainty1SigmaKm);
    expect(highNoise.dsnComparison.dsnStatus).toBe('BLACKOUT');
    expect(highNoise.dsnComparison.dsnModeledErrorKm).toBeGreaterThan(
      highNoise.dsnComparison.xnavErrorKm
    );
  });
});
