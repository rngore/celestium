import type { DemoScenarioId, MissionConfig } from './types.ts';
import { AU_KM } from './science/constants.ts';

export interface DemoScenarioPreset {
  id: DemoScenarioId;
  title: string;
  subtitle: string;
  config: MissionConfig;
}

/**
 * Three self-contained offline engineering benchmark scenarios so every workspace
 * runs immediately without external APIs or paid keys.
 */
export const DEMO_SCENARIOS: Record<DemoScenarioId, DemoScenarioPreset> = {
  'earth-to-mars': {
    id: 'earth-to-mars',
    title: 'Scenario A — Earth-to-Mars Interplanetary Cruise',
    subtitle: 'Heliocentric RK45 cruise arc starting at 1 AU with Type-I Mars injection Δv (~32.73 km/s), X-band link budget, and hybrid navigation.',
    config: {
      scenarioId: 'earth-to-mars',
      missionName: 'Mars Transfer Benchmark (Type-I)',
      spacecraftName: 'Ares-Nav Explorer',
      centralBody: 'sun',
      targetDestination: 'mars',
      epochIso: '2026-11-21T00:00:00Z',
      durationDays: 259,
      // Starting near 1 AU on X-axis, injected into Hohmann-like transfer ellipse (v_periapsis ~ 32.73 km/s)
      initialPositionKm: { x: AU_KM, y: 0, z: 0 },
      initialVelocityKmS: { x: 0, y: 32.729, z: 0.45 },
      spacecraftMassKg: 1450,
      areaM2: 14,
      crReflectivity: 1.32,
      propulsionType: 'chemical',
      specificImpulseSec: 322,
      enableJ2: false,
      enableSrp: true,
      enableThirdBody: false,
      integrator: 'rk45',
      navArchitecture: 'hybrid-dsn-xnav',
      seed: 20261121,
      commConfig: {
        frequencyGHz: 8.42, // X-band DSN
        txPowerW: 35,
        txAntennaGainDbi: 41.5, // ~2.2 m HGA
        rxAntennaGainDbi: 68.2, // DSN 34m BWG
        systemLossesDb: 2.5,
        systemNoiseTempK: 38,
        dataRateBps: 16384,
        requiredEbN0Db: 3.2,
        solarConjunctionThresholdDeg: 3.0,
      },
    },
  },
  'voyager-xnav': {
    id: 'voyager-xnav',
    title: 'Scenario B — Voyager-Style Deep-Space XNAV Cruise',
    subtitle: 'Outer heliosphere autonomous trajectory (~172 AU hyperbolic escape) under simulated Earth DSN blackout comparing XNAV 8-state EKF.',
    config: {
      scenarioId: 'voyager-xnav',
      missionName: 'Heliosphere Autonomous XNAV Study',
      spacecraftName: 'Voyager-Class Deep Probe',
      centralBody: 'sun',
      targetDestination: 'interstellar',
      epochIso: '2026-11-21T00:00:00Z',
      durationDays: 180,
      initialPositionKm: { x: -32.2 * AU_KM, y: -137.2 * AU_KM, z: 99.3 * AU_KM },
      initialVelocityKmS: { x: -2.07, y: -13.61, z: 9.83 },
      spacecraftMassKg: 721.9,
      areaM2: 10.7,
      crReflectivity: 1.25,
      propulsionType: 'nuclear-thermal',
      specificImpulseSec: 850,
      enableJ2: false,
      enableSrp: false,
      enableThirdBody: false,
      integrator: 'rk45',
      navArchitecture: 'autonomous-xnav',
      seed: 19770905,
      commConfig: {
        frequencyGHz: 8.415,
        txPowerW: 22.4,
        txAntennaGainDbi: 48.0, // 3.7m Voyager HGA
        rxAntennaGainDbi: 74.3, // DSN 70m DSS-43
        systemLossesDb: 3.0,
        systemNoiseTempK: 28,
        dataRateBps: 160, // Voyager deep-space telemetry rate
        requiredEbN0Db: 2.5,
        solarConjunctionThresholdDeg: 3.0,
      },
    },
  },
  'earth-to-moon': {
    id: 'earth-to-moon',
    title: 'Scenario C — Earth-to-Moon Geocentric Transfer Orbit',
    subtitle: 'High-energy geocentric trans-lunar elliptical arc (r_p = 6,678 km, v_p = 10.82 km/s) with Earth J2 perturbation and S-band lunar telemetry.',
    config: {
      scenarioId: 'earth-to-moon',
      missionName: 'Cislunar Transfer & Occultation Analysis',
      spacecraftName: 'Chandrayaan-Class TLI Vehicle',
      centralBody: 'earth',
      targetDestination: 'moon',
      epochIso: '2026-11-21T00:00:00Z',
      durationDays: 5.0,
      initialPositionKm: { x: 6678, y: 0, z: 0 },
      initialVelocityKmS: { x: 0, y: 10.818, z: 0.92 },
      spacecraftMassKg: 2150,
      areaM2: 9.5,
      crReflectivity: 1.3,
      propulsionType: 'chemical',
      specificImpulseSec: 318,
      enableJ2: true,
      enableSrp: true,
      enableThirdBody: false,
      integrator: 'rk45',
      navArchitecture: 'hybrid-dsn-xnav',
      seed: 20230714,
      commConfig: {
        frequencyGHz: 2.25, // S-band cislunar
        txPowerW: 15,
        txAntennaGainDbi: 22.0,
        rxAntennaGainDbi: 52.0,
        systemLossesDb: 2.0,
        systemNoiseTempK: 110,
        dataRateBps: 262144, // 256 kbps
        requiredEbN0Db: 4.5,
        solarConjunctionThresholdDeg: 3.0,
      },
    },
  },
};

export function cloneDemoScenarioConfig(id: DemoScenarioId): MissionConfig {
  const src = DEMO_SCENARIOS[id].config;
  return {
    ...src,
    initialPositionKm: { ...src.initialPositionKm },
    initialVelocityKmS: { ...src.initialVelocityKmS },
    commConfig: { ...src.commConfig },
  };
}
