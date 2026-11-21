import type {
  CentralBodyId,
  CommAnalysisResult,
  CommLinkRequest,
  CommTimeSeriesPoint,
  ModelInspectionRecord,
  PropagationEpochState,
  Vector3D,
} from '../types.ts';
import {
  AU_KM,
  CELESTIUM_MODEL_VERSION,
  C_MPS,
  K_BOLTZMANN_JK,
  PLANET_ELEMENTS_J2000,
  RADIUS_EARTH_KM,
} from './constants.ts';
import {
  computeKeplerianState,
  oneWayLightTimeSeconds,
  parseDateSafe,
  vecMagnitude,
  vecSub,
} from './physics.ts';
import { kmToAu, wattsToDbw } from './units.ts';

const RAD_TO_DEG = 180 / Math.PI;

/**
 * Free-Space Path Loss in dB:
 *   FSPL = 20 * log10(4 * pi * R_m / lambda_m)
 */
export function computeFreeSpacePathLossDb(rangeKm: number, frequencyGHz: number): number {
  const rangeM = Math.max(1, rangeKm * 1000);
  const freqHz = Math.max(1e6, frequencyGHz * 1e9);
  const wavelengthM = C_MPS / freqHz;
  return 20 * Math.log10((4 * Math.PI * rangeM) / wavelengthM);
}

/**
 * Evaluates a complete RF/Optical Deep-Space Link Budget at a single slant range (km).
 */
export function evaluateSingleLinkPoint(
  req: CommLinkRequest,
  rangeKm: number,
  elapsedDays: number,
  epochIso: string,
  solarElongationDeg = 45,
  earthOcculted = false
): CommTimeSeriesPoint {
  const safeRangeKm = Math.max(1, rangeKm);
  const oneWayLightTimeSec = oneWayLightTimeSeconds(safeRangeKm);
  const roundTripLightTimeSec = 2 * oneWayLightTimeSec;
  const fsplDb = computeFreeSpacePathLossDb(safeRangeKm, req.frequencyGHz);

  const ptDbw = wattsToDbw(req.txPowerW);
  const receivedPowerDbw =
    ptDbw + req.txAntennaGainDbi + req.rxAntennaGainDbi - fsplDb - req.systemLossesDb;

  const n0DbwHz = 10 * Math.log10(K_BOLTZMANN_JK * Math.max(1, req.systemNoiseTempK));
  const cn0DbHz = receivedPowerDbw - n0DbwHz;
  const ebN0Db = cn0DbHz - 10 * Math.log10(Math.max(1, req.dataRateBps));
  const linkMarginDb = ebN0Db - req.requiredEbN0Db;

  const conjThreshold = req.solarConjunctionThresholdDeg ?? 3.0;
  const solarConjunctionRisk = solarElongationDeg < conjThreshold;
  const geometricVisibility: CommTimeSeriesPoint['geometricVisibility'] = earthOcculted
    ? 'OCCULTED'
    : solarConjunctionRisk
      ? 'CONJUNCTION_RISK'
      : 'VISIBLE';

  return {
    elapsedDays,
    epochIso,
    rangeKm: safeRangeKm,
    rangeAU: kmToAu(safeRangeKm),
    oneWayLightTimeSec,
    roundTripLightTimeSec,
    fsplDb,
    receivedPowerDbw,
    cn0DbHz,
    ebN0Db,
    linkMarginDb,
    solarElongationDeg,
    earthOcculted,
    solarConjunctionRisk,
    geometricVisibility,
  };
}

/**
 * Computes geometric communication constraints, light-time, FSPL, link budget,
 * and Earth-occultation / solar-conjunction visibility over a propagated trajectory.
 */
export function analyzeCommunicationLink(
  req: CommLinkRequest,
  trajectoryStates?: PropagationEpochState[],
  centralBody: CentralBodyId = 'sun'
): CommAnalysisResult {
  const freqHz = Math.max(1e6, req.frequencyGHz * 1e9);
  const wavelengthM = C_MPS / freqHz;
  const txPowerDbw = wattsToDbw(req.txPowerW);
  const eirpDbw = txPowerDbw + req.txAntennaGainDbi;
  const noiseSpectralDensityDbwHz =
    10 * Math.log10(K_BOLTZMANN_JK * Math.max(1, req.systemNoiseTempK));

  const earthEl = PLANET_ELEMENTS_J2000.find((p) => p.id === 'earth')!;

  const timeSeries: CommTimeSeriesPoint[] = [];
  if (trajectoryStates && trajectoryStates.length > 0) {
    for (const st of trajectoryStates) {
      const epochDate = parseDateSafe(st.epochIso);
      const earthHelioKm = (() => {
        const eState = computeKeplerianState(earthEl, epochDate);
        return {
          x: eState.positionAU.x * AU_KM,
          y: eState.positionAU.y * AU_KM,
          z: eState.positionAU.z * AU_KM,
        };
      })();

      let rangeFromEarthKm = req.rangeKm ?? st.radiusKm;
      let solarElongationDeg = 45;
      let earthOcculted = false;

      if (centralBody === 'sun') {
        const scFromEarth: Vector3D = vecSub(st.positionKm, earthHelioKm);
        rangeFromEarthKm = Math.max(100, vecMagnitude(scFromEarth));
        const sunFromEarth: Vector3D = {
          x: -earthHelioKm.x,
          y: -earthHelioKm.y,
          z: -earthHelioKm.z,
        };
        const rEarthSun = vecMagnitude(sunFromEarth);
        const dotVal =
          scFromEarth.x * sunFromEarth.x +
          scFromEarth.y * sunFromEarth.y +
          scFromEarth.z * sunFromEarth.z;
        const cosAng = Math.max(-1, Math.min(1, dotVal / (rangeFromEarthKm * rEarthSun)));
        const angDeg = Math.acos(cosAng) * RAD_TO_DEG;
        solarElongationDeg = rangeFromEarthKm > rEarthSun ? angDeg : 90;
      } else if (centralBody === 'earth') {
        rangeFromEarthKm = Math.max(100, st.radiusKm);
        // Check simplified geometric horizon / backside occultation relative to equatorial ground station at +X
        earthOcculted = st.positionKm.x < -RADIUS_EARTH_KM * 0.5 && Math.hypot(st.positionKm.y, st.positionKm.z) < RADIUS_EARTH_KM;
        solarElongationDeg = 45;
      } else {
        // Moon, Mars, Jupiter local body frame: Earth distance ~ mean orbital distance + local offset
        const baseEarthKm =
          centralBody === 'moon'
            ? 384_400
            : centralBody === 'mars'
              ? 1.524 * AU_KM
              : 5.203 * AU_KM;
        rangeFromEarthKm = Math.max(1000, baseEarthKm + st.positionKm.x);
        // Simplified target-body occultation (when spacecraft is directly behind central body from +X Earth direction)
        const rBody = centralBody === 'moon' ? 1737.4 : centralBody === 'mars' ? 3396.19 : 71492;
        earthOcculted = st.positionKm.x < 0 && Math.hypot(st.positionKm.y, st.positionKm.z) < rBody;
        solarElongationDeg = 40;
      }

      timeSeries.push(
        evaluateSingleLinkPoint(
          req,
          rangeFromEarthKm,
          st.elapsedDays,
          st.epochIso,
          solarElongationDeg,
          earthOcculted
        )
      );
    }
  } else {
    const rKm = req.rangeKm ?? AU_KM;
    timeSeries.push(evaluateSingleLinkPoint(req, rKm, 0, new Date().toISOString(), 45, false));
  }

  const summaryAtCurrentRange = timeSeries[timeSeries.length - 1];
  const margins = timeSeries.map((p) => p.linkMarginDb);
  const minMarginDb = Math.min(...margins);
  const maxMarginDb = Math.max(...margins);
  const maxOneWayLightTimeSec = Math.max(...timeSeries.map((p) => p.oneWayLightTimeSec));
  const occultedPointsCount = timeSeries.filter((p) => p.earthOcculted).length;
  const conjunctionRiskPointsCount = timeSeries.filter((p) => p.solarConjunctionRisk).length;

  const inspection: ModelInspectionRecord = {
    modelId: 'rf-link-budget-comms',
    name: 'Deep-Space RF / Optical Link Budget & Geometric Visibility',
    category: 'Communications',
    governingEquations: [
      't_1way = R / c,   t_RTT = 2 R / c',
      'FSPL(dB) = 20 log10(4π R / λ),   λ = c / f',
      'P_r(dBW) = P_t(dBW) + G_t(dBi) + G_r(dBi) - FSPL(dB) - L_sys(dB)',
      'N_0(dBW/Hz) = 10 log10(k_B T_sys)',
      'C/N_0 = P_r - N_0,   E_b/N_0 = C/N_0 - 10 log10(R_b),   Margin = E_b/N_0 - Req E_b/N_0',
    ],
    variables: [
      { symbol: 'R', name: 'Slant range to Earth station', unit: 'km / m', description: 'Computed from trajectory state' },
      { symbol: 'f, λ', name: 'Carrier frequency & wavelength', unit: 'GHz, m', description: 'RF X/Ka-band or Optical' },
      { symbol: 'P_t, G_t, G_r', name: 'Transmit power & antenna gains', unit: 'dBW, dBi', description: 'Spacecraft HPA + dish and DSN 34m/70m dish' },
      { symbol: 'T_sys, R_b', name: 'System noise temperature & bitrate', unit: 'K, bps', description: 'Thermal receiver floor and telemetry rate' },
    ],
    inputs: {
      frequencyGHz: req.frequencyGHz,
      txPowerW: req.txPowerW,
      txAntennaGainDbi: req.txAntennaGainDbi,
      rxAntennaGainDbi: req.rxAntennaGainDbi,
      systemLossesDb: req.systemLossesDb,
      systemNoiseTempK: req.systemNoiseTempK,
      dataRateBps: req.dataRateBps,
      requiredEbN0Db: req.requiredEbN0Db,
    },
    intermediateSteps: [
      { stepIndex: 1, label: 'Carrier wavelength λ = c / f', expression: '299792458 / (f_GHz * 1e9)', value: `${(wavelengthM * 100).toFixed(4)} cm (${wavelengthM.toExponential(3)} m)` },
      { stepIndex: 2, label: 'EIRP = P_t(dBW) + G_t', expression: `${txPowerDbw.toFixed(2)} + ${req.txAntennaGainDbi.toFixed(2)}`, value: `${eirpDbw.toFixed(2)} dBW` },
      { stepIndex: 3, label: 'FSPL at final range', expression: '20 log10(4π R / λ)', value: `${summaryAtCurrentRange.fsplDb.toFixed(2)} dB` },
      { stepIndex: 4, label: 'Noise density N_0 = 10 log10(k T_sys)', expression: '10 log10(1.380649e-23 * T_sys)', value: `${noiseSpectralDensityDbwHz.toFixed(2)} dBW/Hz` },
      { stepIndex: 5, label: 'Carrier-to-Noise C/N_0', expression: 'P_r - N_0', value: `${summaryAtCurrentRange.cn0DbHz.toFixed(2)} dB-Hz` },
    ],
    finalOutputs: {
      finalRangeKm: Number(summaryAtCurrentRange.rangeKm.toFixed(0)),
      oneWayLightTimeSec: Number(summaryAtCurrentRange.oneWayLightTimeSec.toFixed(3)),
      receivedPowerDbw: Number(summaryAtCurrentRange.receivedPowerDbw.toFixed(2)),
      ebN0Db: Number(summaryAtCurrentRange.ebN0Db.toFixed(2)),
      linkMarginDb: Number(summaryAtCurrentRange.linkMarginDb.toFixed(2)),
      minMarginDb: Number(minMarginDb.toFixed(2)),
    },
    assumptions: [
      'Geometric visibility only: Earth/central-body occultation and Sun-Earth-Spacecraft elongation (< 3° conjunction threshold).',
      'Free-space isotropic spreading; excludes rain fade, atmospheric scintillation, and pointing loss dynamics beyond fixed L_sys.',
    ],
    limitations: [
      'Does not claim real-time DSN antenna scheduling or weather-dependent atmospheric attenuation.',
    ],
    provenance: {
      source: `CELESTIUM Communications Link Engine v${CELESTIUM_MODEL_VERSION}`,
      sourceUrl: 'https://deepspace.jpl.nasa.gov/dsndocs/810-005/',
      retrievedAt: new Date().toISOString(),
      observationEpoch: summaryAtCurrentRange.epochIso,
      referenceFrame: 'Topocentric / Geometric Line-of-Sight',
      classification: 'COMPUTED',
      uncertainty: 'Deterministic Friis/Link-Budget calculation ± L_sys uncertainty',
    },
    validationStatus: 'VALIDATED_AGAINST_REFERENCE',
    validationReference: '1 AU Light-Time (499.005s), FSPL & C/N0 Link-Budget Identities (Vitest)',
  };

  return {
    request: req,
    wavelengthM,
    txPowerDbw,
    eirpDbw,
    noiseSpectralDensityDbwHz,
    summaryAtCurrentRange,
    minMarginDb,
    maxMarginDb,
    maxOneWayLightTimeSec,
    occultedPointsCount,
    conjunctionRiskPointsCount,
    timeSeries,
    inspection,
  };
}
