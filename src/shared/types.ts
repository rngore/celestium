export type DataClassification = 'OBSERVED' | 'COMPUTED' | 'ESTIMATED' | 'SIMULATED';

export interface DataProvenance {
  source: string;
  sourceUrl: string;
  retrievedAt: string;
  observationEpoch: string;
  referenceFrame: string;
  classification: DataClassification;
  uncertainty?: string;
  notes?: string;
}

export interface ProvenanceValue<T> {
  value: T;
  unit: string;
  provenance: DataProvenance;
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export type CentralBodyId = 'sun' | 'earth' | 'moon' | 'mars' | 'jupiter';
export type UnitDisplayMode = 'km' | 'si' | 'au';

export type WorkbenchRouteId =
  | 'workbench'
  | 'trajectory'
  | 'navigation'
  | 'communications'
  | 'ephemerides'
  | 'inspector'
  | 'reports';

export interface ModelVariableDef {
  symbol: string;
  name: string;
  unit: string;
  description: string;
}

export interface ModelIntermediateStep {
  stepIndex: number;
  label: string;
  expression: string;
  value: string;
  unit?: string;
}

export type ValidationBadgeStatus = 'VALIDATED_AGAINST_REFERENCE' | 'INTERNAL_CONSISTENCY_CHECKED' | 'SIMULATION_BENCHMARK';

export interface ModelInspectionRecord {
  modelId: string;
  name: string;
  category: 'Astrodynamics' | 'Autonomous Navigation' | 'Communications' | 'Ranging / LiDAR';
  governingEquations: string[];
  variables: ModelVariableDef[];
  inputs: Record<string, string | number | boolean>;
  intermediateSteps: ModelIntermediateStep[];
  finalOutputs: Record<string, string | number | boolean>;
  assumptions: string[];
  limitations: string[];
  provenance: DataProvenance;
  validationStatus: ValidationBadgeStatus;
  validationReference: string;
}

export interface StateVectorAU {
  positionAU: Vector3D;
  velocityAUPerDay: Vector3D;
  distanceFromSunAU: number;
  distanceFromEarthAU: number;
  speedKmPerSec: number;
  oneWayLightTimeSec: number;
}

export interface CelestialBodyData {
  id: string;
  naifId: string;
  name: string;
  type: 'star' | 'planet' | 'moon' | 'lagrange';
  color: string;
  radiusKm: number;
  semiMajorAxisAU: number;
  orbitalPeriodDays: number;
  state: StateVectorAU;
  provenance: DataProvenance;
}

export type AgencyGroup = 'ISRO' | 'NASA' | 'NASA/ESA/CSA';

export interface SpacecraftMetadata {
  id: string;
  name: string;
  agency: AgencyGroup;
  country: string;
  naifId: string | null;
  horizonsSupported: boolean;
  launchDate: string;
  missionStatus: string;
  isActive: boolean;
  regime: string;
  description: string;
  officialUrl: string;
  sourceName: string;
  historicalEpoch?: string;
  orbitalFallback: {
    center: 'sun' | 'earth' | 'moon' | 'mars' | 'L1' | 'L2';
    radiusAU: number;
    inclinationDeg: number;
    speedRadPerDay: number;
    phaseOffsetRad: number;
  };
}

export interface SpacecraftState extends SpacecraftMetadata {
  state: StateVectorAU;
  provenance: DataProvenance;
  freshnessLabel: string;
}

export interface SolarSystemSnapshot {
  requestedDate: string;
  generatedAt: string;
  referenceFrame: string;
  bodies: CelestialBodyData[];
  spacecraft: SpacecraftState[];
  summary: {
    totalTrackedAssets: number;
    verifiedActiveMissions: number;
    observedHorizonsCount: number;
    simulatedOrEstimatedCount: number;
    nearestSpacecraft: { name: string; distanceKm: number; oneWayLightTimeSec: number } | null;
    longestSignalDelay: { name: string; distanceAU: number; oneWayLightTimeSec: number } | null;
  };
}

export interface PulsarEntry {
  id: string;
  commonName: string;
  jName: string;
  raDeg: number;
  decDeg: number;
  eclipticUnitVector: Vector3D;
  periodMs: number;
  periodSec: number;
  pDotSecPerSec: number;
  distanceKpc: number;
  timingPrecisionUs: number;
  xrayFluxCrab: number;
  referenceEpochMJD: number;
  source: string;
  sourceUrl: string;
}

export type NavigationMode = 'DSN' | 'XNAV';
export type NavigationArchitecture = 'earth-dsn' | 'autonomous-xnav' | 'hybrid-dsn-xnav';

export interface MissionConfig {
  scenarioId: string;
  missionName: string;
  spacecraftName: string;
  centralBody: CentralBodyId;
  targetDestination: 'mars' | 'moon' | 'jupiter' | 'interstellar' | 'sun-earth-l1';
  epochIso: string;
  durationDays: number;
  initialPositionKm: Vector3D;
  initialVelocityKmS: Vector3D;
  spacecraftMassKg: number;
  areaM2: number;
  crReflectivity: number;
  propulsionType: 'chemical' | 'solar-electric' | 'nuclear-thermal';
  specificImpulseSec: number;
  enableJ2: boolean;
  enableSrp: boolean;
  enableThirdBody: boolean;
  integrator: 'rk45' | 'rk4';
  navArchitecture: NavigationArchitecture;
  seed: number;
  commConfig: CommLinkRequest;
}

export interface PropagationRequest {
  centralBody: CentralBodyId;
  initialPositionKm: Vector3D;
  initialVelocityKmS: Vector3D;
  epochIso: string;
  durationDays: number;
  stepSizeSec?: number;
  toleranceKm?: number;
  integrator?: 'rk45' | 'rk4';
  sampleCount?: number;
  enableJ2?: boolean;
  enableSrp?: boolean;
  enableThirdBody?: boolean;
  spacecraftMassKg?: number;
  areaM2?: number;
  crReflectivity?: number;
}

export interface PropagationEpochState {
  index: number;
  elapsedSec: number;
  elapsedDays: number;
  epochIso: string;
  positionKm: Vector3D;
  velocityKmS: Vector3D;
  radiusKm: number;
  speedKmS: number;
  specificEnergyKm2S2: number;
  angularMomentumKm2S: number;
}

export interface OrbitalElementsResult {
  centralBody: CentralBodyId;
  muKm3S2: number;
  semiMajorAxisKm: number;
  eccentricity: number;
  inclinationDeg: number;
  raanDeg: number | null;
  argPeriapsisDeg: number | null;
  trueAnomalyDeg: number | null;
  trueLongitudeDeg: number | null;
  specificEnergyKm2S2: number;
  angularMomentumKm2S: number;
  orbitalPeriodSec: number | null;
  periapsisKm: number;
  apoapsisKm: number | null;
  orbitRegime: 'circular' | 'elliptical' | 'parabolic' | 'hyperbolic';
  edgeCaseFlags: {
    isCircular: boolean;
    isEquatorial: boolean;
    notes: string[];
  };
  intermediateVectors: {
    hVecKm2S: Vector3D;
    nodeVecKm2S: Vector3D;
    eccVec: Vector3D;
  };
  inspection: ModelInspectionRecord;
}

export interface PropagationResult {
  request: PropagationRequest;
  muKm3S2: number;
  referenceFrame: string;
  integratorUsed: 'rk45' | 'rk4';
  totalSteps: number;
  rejectedSteps: number;
  minStepSec: number;
  maxStepSec: number;
  initialState: PropagationEpochState;
  finalState: PropagationEpochState;
  initialOrbitalElements: OrbitalElementsResult;
  finalOrbitalElements: OrbitalElementsResult;
  conservationDiagnostics: {
    initialEnergyKm2S2: number;
    finalEnergyKm2S2: number;
    relativeEnergyDrift: number;
    initialAngularMomentumKm2S: number;
    finalAngularMomentumKm2S: number;
    relativeAngularMomentumDrift: number;
  };
  stepSensitivityCheck: {
    comparedAgainst: string;
    finalPositionDiffKm: number;
    finalVelocityDiffKmS: number;
    passed: boolean;
  };
  states: PropagationEpochState[];
  inspection: ModelInspectionRecord;
}

export interface HohmannRequest {
  centralBody: CentralBodyId;
  r1Km: number;
  r2Km: number;
}

export interface HohmannResult {
  request: HohmannRequest;
  muKm3S2: number;
  semiMajorAxisTransferKm: number;
  vCircular1KmS: number;
  vCircular2KmS: number;
  vTransferPeriapsisKmS: number;
  vTransferApoapsisKmS: number;
  deltaV1KmS: number;
  deltaV2KmS: number;
  totalDeltaVKmS: number;
  transferTimeSec: number;
  transferTimeDays: number;
  inspection: ModelInspectionRecord;
}

export interface LambertRequest {
  centralBody: CentralBodyId;
  r1Km: Vector3D;
  r2Km: Vector3D;
  tofSec: number;
  direction: 'prograde' | 'retrograde';
  initialVelocityKmS?: Vector3D;
  targetVelocityKmS?: Vector3D;
}

export interface LambertResult {
  request: LambertRequest;
  muKm3S2: number;
  converged: boolean;
  failureReason: string | null;
  iterations: number;
  zFinal: number;
  transferAngleDeg: number;
  v1KmS: Vector3D;
  v2KmS: Vector3D;
  deltaVDepartureKmS: number | null;
  deltaVArrivalKmS: number | null;
  totalDeltaVKmS: number | null;
  semiMajorAxisKm: number | null;
  eccentricity: number | null;
  lagrangeCoefficients: {
    f: number;
    g: number;
    gDot: number;
  };
  inspection: ModelInspectionRecord;
}

export interface PulsarPhasePrediction {
  pulsarId: string;
  commonName: string;
  referenceEpochMJD: number;
  deltaTSec: number;
  f0Hz: number;
  fDotHzPerS: number;
  predictedCycles: number;
  fractionalPhase: number;
}

export interface XnavSimulationRequest {
  spacecraftId?: string;
  truePositionKm: Vector3D;
  trueVelocityKmS?: Vector3D;
  centralBody?: CentralBodyId;
  initialGuessErrorKm: number;
  initialClockBiasSec?: number;
  initialClockDriftSecPerSec?: number;
  pulsarIds: string[];
  observationDurationSec: number;
  toaNoiseMultiplier: number;
  dsnDisrupted: boolean;
  architecture?: NavigationArchitecture;
  seed?: number;
}

export interface PulsarObservationSample {
  pulsarId: string;
  commonName: string;
  unitVector: Vector3D;
  periodMs: number;
  trueRangeProjectionKm: number;
  measuredRangeProjectionKm: number;
  timingResidualUs: number;
  measurementSigmaUs: number;
  weight: number;
  pulseProfile: number[];
  phasePrediction: PulsarPhasePrediction;
}

export interface EkfIterationStep {
  epochIndex: number;
  elapsedSec: number;
  truePositionKm: Vector3D;
  estimatedPositionKm: Vector3D;
  estimatedVelocityKmS: Vector3D;
  estimatedClockBiasSec: number;
  estimatedClockDriftSS: number;
  positionErrorKm: number;
  velocityErrorKmS: number;
  clockBiasErrorUs: number;
  uncertainty1SigmaKm: number;
  rmsResidualUs: number;
}

export interface XnavArchitectureComparisonRow {
  architecture: NavigationArchitecture;
  label: string;
  steadyStatePosErrorKm: number;
  steadyStateVelErrorMS: number;
  updateLatencySec: number;
  blackoutResilience: string;
  earthDependency: string;
  assumptionSummary: string;
}

export interface XnavSimulationResult {
  request: XnavSimulationRequest;
  timestamp: string;
  referenceFrame: string;
  truePositionKm: Vector3D;
  trueVelocityKmS: Vector3D;
  initialGuessKm: Vector3D;
  wlsEstimateKm: Vector3D;
  wlsClockBiasSec: number;
  ekfEstimateKm: Vector3D;
  ekfVelocityEstimateKmS: Vector3D;
  ekfClockBiasSec: number;
  ekfClockDriftSS: number;
  positionErrorVectorKm: Vector3D;
  wlsErrorKm: number;
  ekfErrorKm: number;
  uncertainty1SigmaKm: number;
  gdop: number;
  pdop: number;
  tdop: number;
  conditionNumber: number;
  rankDeficient: boolean;
  geometryWarning: string | null;
  converged: boolean;
  iterationsUsed: number;
  rmsTimingResidualUs: number;
  covarianceKm2: number[][];
  covariance8x8: number[][];
  designMatrixH: number[][];
  residualVectorKm: number[];
  nees: number;
  neesConsistent95: boolean;
  chiSquare: number;
  chiSquareDof: number;
  pulsarObservations: PulsarObservationSample[];
  ekfHistory: EkfIterationStep[];
  dsnComparison: {
    distanceFromEarthKm: number;
    oneWayLightTimeSec: number;
    roundTripLightTimeSec: number;
    dsnStatus: 'NOMINAL' | 'DEGRADED' | 'BLACKOUT';
    dsnModeledErrorKm: number;
    dsnUpdateLatencySec: number;
    xnavErrorKm: number;
    xnavLocalProcessingMs: number;
    earthDependencyDsn: string;
    earthDependencyXnav: string;
  };
  architectureComparison: XnavArchitectureComparisonRow[];
  assumptions: string[];
  provenance: DataProvenance;
  inspection: ModelInspectionRecord;
}

export interface CommLinkRequest {
  frequencyGHz: number;
  txPowerW: number;
  txAntennaGainDbi: number;
  rxAntennaGainDbi: number;
  systemLossesDb: number;
  systemNoiseTempK: number;
  dataRateBps: number;
  requiredEbN0Db: number;
  rangeKm?: number;
  solarConjunctionThresholdDeg?: number;
}

export interface CommTimeSeriesPoint {
  elapsedDays: number;
  epochIso: string;
  rangeKm: number;
  rangeAU: number;
  oneWayLightTimeSec: number;
  roundTripLightTimeSec: number;
  fsplDb: number;
  receivedPowerDbw: number;
  cn0DbHz: number;
  ebN0Db: number;
  linkMarginDb: number;
  solarElongationDeg: number;
  earthOcculted: boolean;
  solarConjunctionRisk: boolean;
  geometricVisibility: 'VISIBLE' | 'OCCULTED' | 'CONJUNCTION_RISK';
}

export interface CommAnalysisResult {
  request: CommLinkRequest;
  wavelengthM: number;
  txPowerDbw: number;
  eirpDbw: number;
  noiseSpectralDensityDbwHz: number;
  summaryAtCurrentRange: CommTimeSeriesPoint;
  minMarginDb: number;
  maxMarginDb: number;
  maxOneWayLightTimeSec: number;
  occultedPointsCount: number;
  conjunctionRiskPointsCount: number;
  timeSeries: CommTimeSeriesPoint[];
  inspection: ModelInspectionRecord;
}

export type PlannerBodyId = 'earth' | 'moon' | 'mars' | 'jupiter' | 'sun-earth-l1' | 'sun-earth-l2';

export interface MissionPlanRequest {
  origin: PlannerBodyId;
  destination: PlannerBodyId;
  departureDate: string;
  deltaVBoostKmS: number;
  propulsionType: 'chemical' | 'solar-electric' | 'nuclear-thermal';
  navigationMethod: 'earth-dsn' | 'universe-gps-xnav' | 'hybrid-dsn-xnav';
  relayBeacon: 'none' | 'l1-optical-relay' | 'mars-areostationary-relay' | 'lunar-south-pole-relay';
}

export interface TrajectoryWaypoint {
  fraction: number;
  dayOffset: number;
  dateIso: string;
  positionAU: Vector3D;
  earthPositionAU: Vector3D;
  distanceFromEarthKm: number;
  oneWayLightTimeSec: number;
  heliocentricSpeedKmS: number;
  solarConjunctionAngleDeg: number;
  modeledBlackoutRisk: boolean;
}

export interface MissionPlanResult {
  request: MissionPlanRequest;
  originName: string;
  destinationName: string;
  departureDate: string;
  estimatedArrivalDate: string;
  transferDurationDays: number;
  transferDistanceKm: number;
  transferDistanceAU: number;
  departureHeliocentricSpeedKmS: number;
  arrivalHeliocentricSpeedKmS: number;
  deltaVDepartureKmS: number;
  deltaVArrivalKmS: number;
  totalDeltaVKmS: number;
  maxOneWayLightTimeSec: number;
  minOneWayLightTimeSec: number;
  arrivalOneWayLightTimeSec: number;
  modeledBlackoutDays: number;
  navigationSummary: string;
  relaySummary: string;
  methodology: string[];
  limitations: string[];
  waypoints: TrajectoryWaypoint[];
  originOrbitAU: Vector3D[];
  destinationOrbitAU: Vector3D[];
  provenance: DataProvenance;
}

export interface DataSourceStatus {
  id: string;
  provider: string;
  categories: string[];
  officialUrl: string;
  status: 'CONNECTED' | 'DEGRADED' | 'OFFLINE' | 'STATIC_VERIFIED';
  lastSuccessfulRequest: string | null;
  cacheEntries: number;
  cacheTtlSeconds: number;
  lastError: string | null;
  notes: string;
}

export type DemoScenarioId = 'earth-to-mars' | 'voyager-xnav' | 'earth-to-moon';

export type SpaceSonarModality = 'flash-lidar' | 'fmcw-coherent-lidar' | 'optical-twtt' | 'ka-band-pn-rf';

export interface SpaceSonarPreset {
  id: SpaceSonarModality;
  name: string;
  bandLabel: string;
  wavelengthM: number;
  carrierFreqHz: number;
  defaultTxPowerW: number;
  defaultApertureM: number;
  defaultBandwidthHz: number;
  defaultIntegrationMs: number;
  defaultRangeM: number;
  defaultVelocityMS: number;
  defaultTargetReflectivity: number;
  retroreflectorEnabled: boolean;
  quantumEfficiency: number;
  noiseEquivalentPowerW: number;
  opticalEfficiency: number;
  referenceNote: string;
}

export interface SpaceSonarRequest {
  modality: SpaceSonarModality;
  rangeM: number;
  radialVelocityMS: number;
  txPowerW: number;
  apertureM: number;
  bandwidthMHz: number;
  integrationMs: number;
  targetReflectivity: number;
  targetCrossSectionM2: number;
  retroreflector: boolean;
  solarBackground: boolean;
  beaconCount: number;
  seed?: number;
}

export interface SpaceSonarLinkBudget {
  carrierFrequencyHz: number;
  photonEnergyJ: number;
  beamDivergenceRad: number;
  beamFootprintRadiusM: number;
  receivedPowerW: number;
  receivedPowerDbm: number;
  signalPhotons: number;
  backgroundPhotons: number;
  thermalNoiseElectrons: number;
  snrLinear: number;
  snrDb: number;
  detectionProbability: number;
  twoWayLightTimeSec: number;
  relativisticDopplerShiftHz: number;
  crlbRangeSigmaM: number;
  crlbVelocitySigmaMS: number;
  linkClosed: boolean;
}

export interface SpaceSonarBeaconMeasurement {
  beaconId: string;
  label: string;
  positionM: Vector3D;
  trueRangeM: number;
  measuredRangeM: number;
  rangeResidualM: number;
  trueRangeRateMS: number;
  measuredRangeRateMS: number;
  velocityResidualMS: number;
  sigmaRM: number;
  sigmaVMS: number;
}

export interface SpaceSonarSimulationResult {
  request: SpaceSonarRequest;
  presetName: string;
  timestamp: string;
  linkBudget: SpaceSonarLinkBudget;
  truePositionM: Vector3D;
  estimatedPositionM: Vector3D;
  positionErrorM: number;
  trueVelocityMS: Vector3D;
  estimatedVelocityMS: Vector3D;
  velocityErrorMS: number;
  covarianceMatrixM2: number[][];
  principalAxis1SigmaM: [number, number, number];
  principalAxis3SigmaM: [number, number, number];
  pdop: number;
  nees: number;
  neesConsistent95: boolean;
  chiSquare: number;
  chiSquareDof: number;
  chiSquareThreshold95: number;
  chiSquareConsistent: boolean;
  gaussNewtonIterations: number;
  converged: boolean;
  beacons: SpaceSonarBeaconMeasurement[];
  returnWaveform: { sampleIndex: number; distanceOffsetM: number; amplitude: number }[];
  monteCarloProof: {
    trials: number;
    theoreticalRmsM: number;
    empiricalRmsM: number;
    empiricalMeanNees: number;
    chiSquarePassRatePct: number;
    proofStatement: string;
  };
  provenance: DataProvenance;
}

export interface EngineeringReportPayload {
  generatedAtIso: string;
  modelVersion: string;
  missionConfig: MissionConfig;
  propagation: PropagationResult;
  hohmann: HohmannResult | null;
  lambert: LambertResult | null;
  xnav: XnavSimulationResult;
  communications: CommAnalysisResult;
  inspections: ModelInspectionRecord[];
}
