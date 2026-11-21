import { describe, expect, it } from 'vitest';
import { H_PLANCK_JS } from '../src/shared/science/constants.ts';
import {
  SPACE_SONAR_PRESETS,
  computeSpaceSonarLinkBudget,
  computeSymmetric3x3Eigenvalues,
  runSpaceSonarSimulation,
} from '../src/shared/science/spaceSonar.ts';

describe('Space Sonar (LiDAR & RF Ranging) Mathematical Engine', () => {
  it('computes exact photon energy E = h * f and monotonic SNR scaling', () => {
    const lowPower = computeSpaceSonarLinkBudget({
      modality: 'flash-lidar',
      rangeM: 1200,
      radialVelocityMS: -4.5,
      txPowerW: 4,
      apertureM: 0.14,
      bandwidthMHz: 150,
      integrationMs: 10,
      targetReflectivity: 0.3,
      targetCrossSectionM2: 2.5,
      retroreflector: false,
      solarBackground: true,
      beaconCount: 4,
    });

    const highPower = computeSpaceSonarLinkBudget({
      modality: 'flash-lidar',
      rangeM: 1200,
      radialVelocityMS: -4.5,
      txPowerW: 24,
      apertureM: 0.14,
      bandwidthMHz: 150,
      integrationMs: 10,
      targetReflectivity: 0.3,
      targetCrossSectionM2: 2.5,
      retroreflector: false,
      solarBackground: true,
      beaconCount: 4,
    });

    const preset = SPACE_SONAR_PRESETS['flash-lidar'];
    expect(lowPower.photonEnergyJ).toBeCloseTo(H_PLANCK_JS * preset.carrierFreqHz, 26);
    expect(highPower.snrDb).toBeGreaterThan(lowPower.snrDb);
    expect(highPower.crlbRangeSigmaM).toBeLessThan(lowPower.crlbRangeSigmaM);
  });

  it('computes exact Jacobi 3x3 symmetric eigenvalues preserving matrix trace', () => {
    const matrix = [
      [4.2, 0.8, -0.3],
      [0.8, 2.5, 0.4],
      [-0.3, 0.4, 1.3],
    ];
    const [l1, l2, l3] = computeSymmetric3x3Eigenvalues(matrix);
    expect(l1).toBeGreaterThanOrEqual(l2);
    expect(l2).toBeGreaterThanOrEqual(l3);
    expect(l1 + l2 + l3).toBeCloseTo(4.2 + 2.5 + 1.3, 6);
  });

  it('converges Gauss-Newton WNLS and validates 100-trial Monte Carlo CRLB & NEES consistency', () => {
    const res = runSpaceSonarSimulation({
      modality: 'fmcw-coherent-lidar',
      rangeM: 3500,
      radialVelocityMS: -1.85,
      txPowerW: 4.5,
      apertureM: 0.12,
      bandwidthMHz: 800,
      integrationMs: 25,
      targetReflectivity: 0.32,
      targetCrossSectionM2: 2.5,
      retroreflector: false,
      solarBackground: true,
      beaconCount: 5,
      seed: 20261121,
    });

    expect(res.converged).toBe(true);
    expect(res.linkBudget.linkClosed).toBe(true);
    expect(res.chiSquareDof).toBe(2);
    expect(res.covarianceMatrixM2).toHaveLength(3);
    expect(res.principalAxis1SigmaM[0]).toBeGreaterThan(0);
    expect(res.monteCarloProof.trials).toBe(100);

    // Empirical MC RMS must track theoretical CRLB trace RMS within 40% over 100 trials
    const ratio =
      res.monteCarloProof.empiricalRmsM / Math.max(1e-12, res.monteCarloProof.theoreticalRmsM);
    expect(ratio).toBeGreaterThan(0.6);
    expect(ratio).toBeLessThan(1.4);

    // Unbiased 3D estimator mean NEES must be close to 3.00
    expect(res.monteCarloProof.empiricalMeanNees).toBeGreaterThan(1.8);
    expect(res.monteCarloProof.empiricalMeanNees).toBeLessThan(4.2);
  });
});
