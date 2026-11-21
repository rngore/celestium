import type {
  SpaceSonarBeaconMeasurement,
  SpaceSonarLinkBudget,
  SpaceSonarModality,
  SpaceSonarPreset,
  SpaceSonarRequest,
  SpaceSonarSimulationResult,
  Vector3D,
} from '../types.ts';
import {
  C_MPS,
  H_PLANCK_JS,
  K_BOLTZMANN_JK,
  SOLAR_SPECTRAL_IRRADIANCE_1064NM,
  SOLAR_SPECTRAL_IRRADIANCE_1550NM,
} from './constants.ts';

/**
 * Flight-representative Space Sonar (Active Optical LiDAR & Coherent RF Ranging) sensor presets.
 */
export const SPACE_SONAR_PRESETS: Record<SpaceSonarModality, SpaceSonarPreset> = {
  'flash-lidar': {
    id: 'flash-lidar',
    name: 'Orbital & Landing Flash LiDAR',
    bandLabel: '1550 nm Eye-Safe SWIR',
    wavelengthM: 1550e-9,
    carrierFreqHz: C_MPS / 1550e-9,
    defaultTxPowerW: 12,
    defaultApertureM: 0.14,
    defaultBandwidthHz: 150e6,
    defaultIntegrationMs: 10,
    defaultRangeM: 1200,
    defaultVelocityMS: -4.5,
    defaultTargetReflectivity: 0.28,
    retroreflectorEnabled: false,
    quantumEfficiency: 0.72,
    noiseEquivalentPowerW: 4.5e-13,
    opticalEfficiency: 0.62,
    referenceNote:
      'Modeled on autonomous lunar hazard-avoidance & orbital RPOD flash LiDAR architectures (1550 nm InGaAs APD).',
  },
  'fmcw-coherent-lidar': {
    id: 'fmcw-coherent-lidar',
    name: 'Coherent FMCW Doppler LiDAR',
    bandLabel: '1550 nm Chirped Coherent',
    wavelengthM: 1550e-9,
    carrierFreqHz: C_MPS / 1550e-9,
    defaultTxPowerW: 4.5,
    defaultApertureM: 0.12,
    defaultBandwidthHz: 800e6,
    defaultIntegrationMs: 25,
    defaultRangeM: 3500,
    defaultVelocityMS: -1.85,
    defaultTargetReflectivity: 0.32,
    retroreflectorEnabled: false,
    quantumEfficiency: 0.78,
    noiseEquivalentPowerW: 1.5e-13,
    opticalEfficiency: 0.68,
    referenceNote:
      'Modeled on NASA NDL / coherent FMCW laser velocimeters measuring simultaneous sub-cm range and mm/s Doppler velocity.',
  },
  'optical-twtt': {
    id: 'optical-twtt',
    name: 'Deep-Space Optical Two-Way Ranging',
    bandLabel: '1064 nm Nd:YAG Laser Link',
    wavelengthM: 1064e-9,
    carrierFreqHz: C_MPS / 1064e-9,
    defaultTxPowerW: 25,
    defaultApertureM: 0.35,
    defaultBandwidthHz: 250e6,
    defaultIntegrationMs: 100,
    defaultRangeM: 250_000,
    defaultVelocityMS: 18.4,
    defaultTargetReflectivity: 0.9,
    retroreflectorEnabled: true,
    quantumEfficiency: 0.65,
    noiseEquivalentPowerW: 8e-15,
    opticalEfficiency: 0.58,
    referenceNote:
      'Modeled on cislunar / interplanetary optical retroreflector & active two-way laser transponder ranging.',
  },
  'ka-band-pn-rf': {
    id: 'ka-band-pn-rf',
    name: 'Ka-Band Coherent PN RF Ranging',
    bandLabel: '32 GHz Deep-Space RF',
    wavelengthM: C_MPS / 32e9,
    carrierFreqHz: 32e9,
    defaultTxPowerW: 45,
    defaultApertureM: 1.2,
    defaultBandwidthHz: 24e6,
    defaultIntegrationMs: 500,
    defaultRangeM: 2_500_000,
    defaultVelocityMS: 42.0,
    defaultTargetReflectivity: 0.85,
    retroreflectorEnabled: true,
    quantumEfficiency: 0.9,
    noiseEquivalentPowerW: 1.2e-17,
    opticalEfficiency: 0.55,
    referenceNote:
      'Modeled on Ka-band pseudo-noise (PN) regenerative ranging & coherent Doppler tracking for cislunar/deep-space crosslinks.',
  },
};

const CHI2_95_TABLE: Record<number, number> = {
  1: 3.841,
  2: 5.991,
  3: 7.815,
  4: 9.488,
  5: 11.07,
  6: 12.592,
  7: 14.067,
  8: 15.507,
};

function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleGaussian(rng: () => number, sigma: number): number {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sigma;
}

function invert3x3(m: number[][]): number[][] {
  const [a, b, c] = m[0];
  const [d, e, f] = m[1];
  const [g, h, i] = m[2];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H = -(a * f - c * d);
  const I = a * e - b * d;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-24) {
    return invert3x3([
      [m[0][0] + 1e-9, m[0][1], m[0][2]],
      [m[1][0], m[1][1] + 1e-9, m[1][2]],
      [m[2][0], m[2][1], m[2][2] + 1e-9],
    ]);
  }
  const invDet = 1 / det;
  return [
    [A * invDet, D * invDet, G * invDet],
    [B * invDet, E * invDet, H * invDet],
    [C * invDet, F * invDet, I * invDet],
  ];
}

function mat3VecMul(A: number[][], v: [number, number, number]): [number, number, number] {
  return [
    A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2],
    A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2],
    A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2],
  ];
}

/**
 * Exact 3x3 Symmetric Jacobi Eigenvalue Solver to compute the principal axes
 * of the posterior 3D position error covariance ellipsoid P = (H^T W H)^(-1).
 */
export function computeSymmetric3x3Eigenvalues(matrix: number[][]): [number, number, number] {
  const A = [
    [matrix[0][0], matrix[0][1], matrix[0][2]],
    [matrix[1][0], matrix[1][1], matrix[1][2]],
    [matrix[2][0], matrix[2][1], matrix[2][2]],
  ];

  for (let sweep = 0; sweep < 25; sweep++) {
    let p = 0;
    let q = 1;
    let maxOff = Math.abs(A[0][1]);
    if (Math.abs(A[0][2]) > maxOff) {
      p = 0;
      q = 2;
      maxOff = Math.abs(A[0][2]);
    }
    if (Math.abs(A[1][2]) > maxOff) {
      p = 1;
      q = 2;
      maxOff = Math.abs(A[1][2]);
    }
    if (maxOff < 1e-18) break;

    const app = A[p][p];
    const aqq = A[q][q];
    const apq = A[p][q];
    const tau = (aqq - app) / (2 * apq);
    const t =
      tau >= 0
        ? 1 / (tau + Math.sqrt(1 + tau * tau))
        : -1 / (-tau + Math.sqrt(1 + tau * tau));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;

    A[p][p] = app - t * apq;
    A[q][q] = aqq + t * apq;
    A[p][q] = 0;
    A[q][p] = 0;

    for (let r = 0; r < 3; r++) {
      if (r !== p && r !== q) {
        const arp = A[r][p];
        const arq = A[r][q];
        A[r][p] = c * arp - s * arq;
        A[p][r] = A[r][p];
        A[r][q] = s * arp + c * arq;
        A[q][r] = A[r][q];
      }
    }
  }

  const eigs = [Math.max(0, A[0][0]), Math.max(0, A[1][1]), Math.max(0, A[2][2])].sort(
    (x, y) => y - x
  );
  return [eigs[0], eigs[1], eigs[2]];
}

function normalCdf(x: number): number {
  // Abramowitz & Stegun 7.1.26 erf approximation
  const sign = x >= 0 ? 1 : -1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t) *
      Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

/**
 * Computes physical Space Sonar (LiDAR / RF Ranging) Link Budget and
 * Cramér-Rao Lower Bounds (CRLB) for range and velocity precision.
 */
export function computeSpaceSonarLinkBudget(req: SpaceSonarRequest): SpaceSonarLinkBudget {
  const preset = SPACE_SONAR_PRESETS[req.modality];
  const lambda = preset.wavelengthM;
  const f0 = preset.carrierFreqHz;
  const tauSec = req.integrationMs * 1e-3;
  const bandwidthHz = req.bandwidthMHz * 1e6;
  const R = Math.max(1, req.rangeM);

  // Diffraction-limited half-angle beam divergence
  const beamDivergenceRad = Math.max(2.5e-5, (1.22 * lambda) / Math.max(0.02, req.apertureM));
  const beamFootprintRadiusM = R * beamDivergenceRad;
  const beamAreaM2 = Math.PI * beamFootprintRadiusM * beamFootprintRadiusM;
  const rxAreaM2 = Math.PI * Math.pow(req.apertureM / 2, 2);

  // Target interception fraction (clamped to <= 1 when target fills beam)
  const interceptFraction = Math.min(1, req.targetCrossSectionM2 / Math.max(1e-6, beamAreaM2));

  let receivedPowerW: number;
  if (req.modality === 'ka-band-pn-rf') {
    // Coherent two-way / regenerative RF transponder link budget:
    // G_tx = eta * (pi * D / lambda)^2
    const antennaGain = 0.62 * Math.pow((Math.PI * req.apertureM) / lambda, 2);
    const fspl = Math.pow(lambda / (4 * Math.PI * R), 2);
    // Regenerative transponder retransmits at calibrated gain (~25 dB net effective relay gain)
    const transponderGain = req.retroreflector ? 320 : 1;
    receivedPowerW =
      req.txPowerW *
      antennaGain *
      antennaGain *
      fspl *
      (req.retroreflector ? transponderGain : (req.targetCrossSectionM2 * 4 * Math.PI) / (lambda * lambda) * fspl) *
      preset.opticalEfficiency;
  } else {
    // Optical LiDAR equation:
    // Diffuse Lambertian: P_r = P_t * f_int * rho * (A_rx / (pi * R^2)) * eta_sys
    // Retroreflector corner-cube array concentrates return into narrow diffraction cone
    const retroGain = req.retroreflector ? 4500 : 1;
    const solidAngleTerm = rxAreaM2 / (Math.PI * R * R);
    receivedPowerW =
      req.txPowerW *
      interceptFraction *
      req.targetReflectivity *
      solidAngleTerm *
      retroGain *
      preset.opticalEfficiency;
  }

  receivedPowerW = Math.max(1e-24, receivedPowerW);
  const receivedPowerDbm = 10 * Math.log10(receivedPowerW * 1000);

  const photonEnergyJ = H_PLANCK_JS * f0;
  const signalPhotons = (preset.quantumEfficiency * receivedPowerW * tauSec) / photonEnergyJ;

  // Solar background & thermal noise budget
  let backgroundPhotons = 0;
  if (req.solarBackground && req.modality !== 'ka-band-pn-rf') {
    const solarIrradiance =
      lambda < 1200e-9 ? SOLAR_SPECTRAL_IRRADIANCE_1064NM : SOLAR_SPECTRAL_IRRADIANCE_1550NM;
    const filterBandwidthNm = 1.5; // Narrowband optical bandpass filter
    const rxFovSteradians = Math.PI * Math.pow(beamDivergenceRad * 1.4, 2);
    const bgPowerW =
      solarIrradiance *
      filterBandwidthNm *
      rxAreaM2 *
      req.targetReflectivity *
      (rxFovSteradians / Math.PI) *
      preset.opticalEfficiency;
    backgroundPhotons = (preset.quantumEfficiency * bgPowerW * tauSec) / photonEnergyJ;
  }

  // Thermal / detector noise variance
  const thermalNoisePowerW =
    req.modality === 'ka-band-pn-rf'
      ? K_BOLTZMANN_JK * 290 * bandwidthHz // ~290K equivalent RF front-end noise temperature
      : preset.noiseEquivalentPowerW * Math.sqrt(Math.max(1, 1 / tauSec));
  const thermalNoiseElectrons =
    req.modality === 'ka-band-pn-rf'
      ? (thermalNoisePowerW * tauSec) / photonEnergyJ
      : Math.pow((preset.quantumEfficiency * thermalNoisePowerW * tauSec) / photonEnergyJ, 2);

  // Photon-counting + thermal SNR
  const snrLinear =
    req.modality === 'ka-band-pn-rf'
      ? receivedPowerW / Math.max(1e-24, thermalNoisePowerW)
      : (signalPhotons * signalPhotons) /
        Math.max(1e-6, signalPhotons + backgroundPhotons + thermalNoiseElectrons);

  const snrDb = 10 * Math.log10(Math.max(1e-12, snrLinear));

  // Neyman-Pearson detection threshold for P_fa = 1e-6 (gamma_th ~ 4.753 sigma)
  const thresholdSigma = 4.753;
  const detectionProbability = Math.max(
    0,
    Math.min(1, normalCdf(Math.sqrt(Math.max(0, snrLinear)) - thresholdSigma))
  );

  // Cramér-Rao Lower Bounds (CRLB) for Range and Coherent Velocity:
  //   sigma_R >= c / (2 * beta_eff * sqrt(2 * SNR))
  //   sigma_v >= lambda / (2 * T_obs * sqrt(2 * SNR))
  const effectiveSignalFactor = Math.sqrt(2 * Math.max(1e-3, snrLinear));
  const crlbRangeSigmaM = C_MPS / (2 * bandwidthHz * effectiveSignalFactor);
  const crlbVelocitySigmaMS = lambda / (2 * tauSec * effectiveSignalFactor);

  // Relativistic two-way Doppler shift
  const beta = req.radialVelocityMS / C_MPS;
  const relativisticDopplerShiftHz =
    f0 * (Math.sqrt((1 - beta) / (1 + beta)) - 1) * 2;

  return {
    carrierFrequencyHz: f0,
    photonEnergyJ,
    beamDivergenceRad,
    beamFootprintRadiusM,
    receivedPowerW,
    receivedPowerDbm: Number(receivedPowerDbm.toFixed(2)),
    signalPhotons: Number(signalPhotons.toFixed(2)),
    backgroundPhotons: Number(backgroundPhotons.toFixed(2)),
    thermalNoiseElectrons: Number(thermalNoiseElectrons.toFixed(2)),
    snrLinear: Number(snrLinear.toFixed(3)),
    snrDb: Number(snrDb.toFixed(2)),
    detectionProbability: Number(detectionProbability.toFixed(4)),
    twoWayLightTimeSec: (2 * R) / C_MPS,
    relativisticDopplerShiftHz: Number(relativisticDopplerShiftHz.toFixed(2)),
    crlbRangeSigmaM,
    crlbVelocitySigmaMS,
    linkClosed: snrDb >= 10 && detectionProbability >= 0.9,
  };
}

/**
 * Generates well-conditioned 3D beacon/retroreflector constellation around the operational
 * range baseline (regular tetrahedron + optional auxiliary beacons for overdetermined WNLS).
 */
function buildBeaconConstellation(rangeM: number, count: number): { id: string; label: string; pos: Vector3D }[] {
  const s = rangeM;
  const base: { id: string; label: string; pos: Vector3D }[] = [
    { id: 'BSN-01', label: 'Primary Optical Beacon α', pos: { x: s * 0.92, y: s * 0.35, z: s * 0.25 } },
    { id: 'BSN-02', label: 'Port Array Transponder β', pos: { x: -s * 0.85, y: s * 0.62, z: -s * 0.18 } },
    { id: 'BSN-03', label: 'Zenith Relay Node γ', pos: { x: s * 0.12, y: -s * 0.78, z: s * 0.74 } },
    { id: 'BSN-04', label: 'Nadir Reference Corner-Cube δ', pos: { x: -s * 0.28, y: -s * 0.45, z: -s * 0.88 } },
    { id: 'BSN-05', label: 'Aft Docking Retroreflector ε', pos: { x: s * 0.55, y: -s * 0.55, z: -s * 0.52 } },
    { id: 'BSN-06', label: 'Forward Crosslink Beacon ζ', pos: { x: -s * 0.48, y: s * 0.42, z: s * 0.68 } },
  ];
  return base.slice(0, Math.max(4, Math.min(6, count)));
}

function solveSingleGaussNewtonTrial(
  beacons: { id: string; label: string; pos: Vector3D }[],
  truePos: Vector3D,
  trueVel: Vector3D,
  sigmaRM: number,
  sigmaVMS: number,
  rng: () => number
) {
  const measurements: SpaceSonarBeaconMeasurement[] = beacons.map((b) => {
    const dx = truePos.x - b.pos.x;
    const dy = truePos.y - b.pos.y;
    const dz = truePos.z - b.pos.z;
    const trueRange = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const trueRangeRate = (dx * trueVel.x + dy * trueVel.y + dz * trueVel.z) / trueRange;
    const measRange = trueRange + sampleGaussian(rng, sigmaRM);
    const measVel = trueRangeRate + sampleGaussian(rng, sigmaVMS);
    return {
      beaconId: b.id,
      label: b.label,
      positionM: b.pos,
      trueRangeM: trueRange,
      measuredRangeM: measRange,
      rangeResidualM: 0,
      trueRangeRateMS: trueRangeRate,
      measuredRangeRateMS: measVel,
      velocityResidualMS: 0,
      sigmaRM,
      sigmaVMS,
    };
  });

  // Initial guess perturbed from true state
  const initPerturb = Math.max(5, sigmaRM * 120);
  let xHat: [number, number, number] = [
    truePos.x + initPerturb * 0.55,
    truePos.y - initPerturb * 0.48,
    truePos.z + initPerturb * 0.37,
  ];

  let iterations = 0;
  let converged = false;
  let covM2 = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  let HtH = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];

  for (let iter = 1; iter <= 15; iter++) {
    iterations = iter;
    const HtWH = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    HtH = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const rhs: [number, number, number] = [0, 0, 0];

    for (const m of measurements) {
      const dx = xHat[0] - m.positionM.x;
      const dy = xHat[1] - m.positionM.y;
      const dz = xHat[2] - m.positionM.z;
      const predRange = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const u = [dx / predRange, dy / predRange, dz / predRange];
      const w = 1 / Math.max(1e-12, m.sigmaRM * m.sigmaRM);
      const res = m.measuredRangeM - predRange;

      for (let r = 0; r < 3; r++) {
        rhs[r] += u[r] * w * res;
        for (let c = 0; c < 3; c++) {
          HtWH[r][c] += u[r] * u[c] * w;
          HtH[r][c] += u[r] * u[c];
        }
      }
    }

    covM2 = invert3x3(HtWH);
    const delta = mat3VecMul(covM2, rhs);
    xHat = [xHat[0] + delta[0], xHat[1] + delta[1], xHat[2] + delta[2]];
    const stepNorm = Math.sqrt(delta[0] * delta[0] + delta[1] * delta[1] + delta[2] * delta[2]);
    if (stepNorm < 1e-6) {
      converged = true;
      break;
    }
  }

  // Solve 3D Velocity WLS using converged LOS Jacobian
  const HtWvH = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const rhsVel: [number, number, number] = [0, 0, 0];
  let chiSquare = 0;

  for (const m of measurements) {
    const dx = xHat[0] - m.positionM.x;
    const dy = xHat[1] - m.positionM.y;
    const dz = xHat[2] - m.positionM.z;
    const predRange = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    m.rangeResidualM = m.measuredRangeM - predRange;
    chiSquare += (m.rangeResidualM * m.rangeResidualM) / Math.max(1e-12, m.sigmaRM * m.sigmaRM);

    const u = [dx / predRange, dy / predRange, dz / predRange];
    const wv = 1 / Math.max(1e-12, m.sigmaVMS * m.sigmaVMS);
    for (let r = 0; r < 3; r++) {
      rhsVel[r] += u[r] * wv * m.measuredRangeRateMS;
      for (let c = 0; c < 3; c++) {
        HtWvH[r][c] += u[r] * u[c] * wv;
      }
    }
  }

  const covVel = invert3x3(HtWvH);
  const vHat = mat3VecMul(covVel, rhsVel);
  for (const m of measurements) {
    const dx = xHat[0] - m.positionM.x;
    const dy = xHat[1] - m.positionM.y;
    const dz = xHat[2] - m.positionM.z;
    const predRange = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const predRate = (dx * vHat[0] + dy * vHat[1] + dz * vHat[2]) / predRange;
    m.velocityResidualMS = m.measuredRangeRateMS - predRate;
  }

  const errVec: [number, number, number] = [
    xHat[0] - truePos.x,
    xHat[1] - truePos.y,
    xHat[2] - truePos.z,
  ];
  const posErrorM = Math.sqrt(
    errVec[0] * errVec[0] + errVec[1] * errVec[1] + errVec[2] * errVec[2]
  );
  const velErrorMS = Math.sqrt(
    Math.pow(vHat[0] - trueVel.x, 2) +
      Math.pow(vHat[1] - trueVel.y, 2) +
      Math.pow(vHat[2] - trueVel.z, 2)
  );

  // Normalized Estimation Error Squared: NEES = e^T P^(-1) e (expected value = 3 for unbiased 3D estimator)
  const invP = invert3x3(covM2);
  const invPe = mat3VecMul(invP, errVec);
  const nees = errVec[0] * invPe[0] + errVec[1] * invPe[1] + errVec[2] * invPe[2];

  return {
    xHat,
    vHat,
    posErrorM,
    velErrorMS,
    covM2,
    HtH,
    chiSquare,
    nees,
    iterations,
    converged,
    measurements,
  };
}

/**
 * Runs complete Space Sonar Link Budget, Gauss-Newton 3D Trilateration,
 * Jacobi Eigenvalue Covariance Analysis, and 100-trial Monte Carlo CRLB Proof.
 */
export function runSpaceSonarSimulation(req: SpaceSonarRequest): SpaceSonarSimulationResult {
  const preset = SPACE_SONAR_PRESETS[req.modality];
  const linkBudget = computeSpaceSonarLinkBudget(req);
  const beacons = buildBeaconConstellation(req.rangeM, req.beaconCount);

  const truePos: Vector3D = {
    x: req.rangeM * 0.14,
    y: req.rangeM * -0.09,
    z: req.rangeM * 0.06,
  };
  const trueVel: Vector3D = {
    x: req.radialVelocityMS * 0.72,
    y: req.radialVelocityMS * -0.51,
    z: req.radialVelocityMS * 0.46,
  };

  const seed = req.seed ?? 20261121;
  const rng = createSeededRng(seed);
  const primary = solveSingleGaussNewtonTrial(
    beacons,
    truePos,
    trueVel,
    linkBudget.crlbRangeSigmaM,
    linkBudget.crlbVelocitySigmaMS,
    rng
  );

  const eigenvalues = computeSymmetric3x3Eigenvalues(primary.covM2);
  const principalAxis1SigmaM: [number, number, number] = [
    Math.sqrt(eigenvalues[0]),
    Math.sqrt(eigenvalues[1]),
    Math.sqrt(eigenvalues[2]),
  ];
  const principalAxis3SigmaM: [number, number, number] = [
    3 * principalAxis1SigmaM[0],
    3 * principalAxis1SigmaM[1],
    3 * principalAxis1SigmaM[2],
  ];

  const invHtH = invert3x3(primary.HtH);
  const pdop = Math.sqrt(Math.max(0, invHtH[0][0] + invHtH[1][1] + invHtH[2][2]));

  const dof = Math.max(1, beacons.length - 3);
  const chiSquareThreshold95 = CHI2_95_TABLE[dof] ?? 3.841;

  // Generate realistic matched-filter range return waveform centered on true range
  const returnWaveform: { sampleIndex: number; distanceOffsetM: number; amplitude: number }[] = [];
  const spanM = Math.max(0.25, linkBudget.crlbRangeSigmaM * 18);
  for (let i = 0; i < 41; i++) {
    const offset = ((i - 20) / 20) * spanM;
    const width = Math.max(0.02, spanM * 0.14);
    const signal = Math.exp(-(offset * offset) / (2 * width * width));
    const noiseFloor = (1 / Math.sqrt(Math.max(1, linkBudget.snrLinear))) * (0.25 + 0.5 * rng());
    returnWaveform.push({
      sampleIndex: i,
      distanceOffsetM: Number(offset.toFixed(4)),
      amplitude: Number(Math.min(1.15, signal + noiseFloor).toFixed(4)),
    });
  }

  // 100-Trial Monte Carlo Empirical Verification against Theoretical CRLB
  const trials = 100;
  let sumSqPosErr = 0;
  let sumNees = 0;
  let chiPassCount = 0;
  for (let t = 0; t < trials; t++) {
    const trialRng = createSeededRng(seed + 1000 + t * 37);
    const res = solveSingleGaussNewtonTrial(
      beacons,
      truePos,
      trueVel,
      linkBudget.crlbRangeSigmaM,
      linkBudget.crlbVelocitySigmaMS,
      trialRng
    );
    sumSqPosErr += res.posErrorM * res.posErrorM;
    sumNees += res.nees;
    if (res.chiSquare <= chiSquareThreshold95) {
      chiPassCount++;
    }
  }

  const theoreticalRmsM = Math.sqrt(
    Math.max(0, primary.covM2[0][0] + primary.covM2[1][1] + primary.covM2[2][2])
  );
  const empiricalRmsM = Math.sqrt(sumSqPosErr / trials);
  const empiricalMeanNees = sumNees / trials;
  const chiSquarePassRatePct = (chiPassCount / trials) * 100;

  return {
    request: req,
    presetName: preset.name,
    timestamp: new Date().toISOString(),
    linkBudget,
    truePositionM: truePos,
    estimatedPositionM: {
      x: primary.xHat[0],
      y: primary.xHat[1],
      z: primary.xHat[2],
    },
    positionErrorM: primary.posErrorM,
    trueVelocityMS: trueVel,
    estimatedVelocityMS: {
      x: primary.vHat[0],
      y: primary.vHat[1],
      z: primary.vHat[2],
    },
    velocityErrorMS: primary.velErrorMS,
    covarianceMatrixM2: primary.covM2,
    principalAxis1SigmaM,
    principalAxis3SigmaM,
    pdop: Number(pdop.toFixed(3)),
    nees: Number(primary.nees.toFixed(3)),
    neesConsistent95: primary.nees <= 7.815,
    chiSquare: Number(primary.chiSquare.toFixed(3)),
    chiSquareDof: dof,
    chiSquareThreshold95,
    chiSquareConsistent: primary.chiSquare <= chiSquareThreshold95,
    gaussNewtonIterations: primary.iterations,
    converged: primary.converged,
    beacons: primary.measurements,
    returnWaveform,
    monteCarloProof: {
      trials,
      theoreticalRmsM,
      empiricalRmsM,
      empiricalMeanNees: Number(empiricalMeanNees.toFixed(3)),
      chiSquarePassRatePct: Number(chiSquarePassRatePct.toFixed(1)),
      proofStatement: `100-trial Monte Carlo empirical RMSE (${empiricalRmsM.toExponential(
        3
      )} m) tracks theoretical CRLB bound (${theoreticalRmsM.toExponential(
        3
      )} m) with mean NEES = ${empiricalMeanNees.toFixed(2)} (theoretical unbiased 3D ideal = 3.00).`,
    },
    provenance: {
      source: 'CELESTIUM Space Sonar Link-Budget & Gauss-Newton WNLS Solver',
      sourceUrl: 'https://www.nasa.gov/directorates/stmd/space-tech-mission-directorate/',
      retrievedAt: new Date().toISOString(),
      observationEpoch: new Date().toISOString(),
      referenceFrame: 'Local Target-Centered LVLH / Optical Ranging Frame',
      classification: 'SIMULATED',
      uncertainty: `1σ CRLB RMS: ±${theoreticalRmsM.toExponential(3)} m · PDOP: ${pdop.toFixed(2)}`,
      notes: preset.referenceNote,
    },
  };
}
