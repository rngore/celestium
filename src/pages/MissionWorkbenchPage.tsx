import React, { useEffect, useState } from 'react';
import {
  Activity,
  ChevronRight,
  Cpu,
  Pause,
  Play,
  RotateCcw,
  Sliders,
  Terminal,
} from 'lucide-react';
import { ProvenanceTag } from '../components/common/ProvenanceTag.tsx';
import { EngineeringOrbitViewport } from '../components/three/EngineeringOrbitViewport.tsx';
import { DEMO_SCENARIOS } from '../shared/demoScenarios.ts';
import { CENTRAL_BODIES } from '../shared/science/constants.ts';
import { formatDistanceByUnit, formatVelocityByUnit } from '../shared/science/units.ts';
import type {
  CentralBodyId,
  CommAnalysisResult,
  DemoScenarioId,
  MissionConfig,
  NavigationArchitecture,
  PropagationResult,
  UnitDisplayMode,
  WorkbenchRouteId,
  XnavSimulationResult,
} from '../shared/types.ts';

interface MissionWorkbenchPageProps {
  config: MissionConfig;
  unitMode: UnitDisplayMode;
  propagation: PropagationResult;
  xnav: XnavSimulationResult;
  comms: CommAnalysisResult;
  onConfigChange: (next: MissionConfig) => void;
  onLoadScenario: (id: DemoScenarioId) => void;
  onRunSimulation: () => void;
  onResetSimulation: () => void;
  onNavigate: (route: WorkbenchRouteId) => void;
}

export const MissionWorkbenchPage: React.FC<MissionWorkbenchPageProps> = ({
  config,
  unitMode,
  propagation,
  xnav,
  comms,
  onConfigChange,
  onLoadScenario,
  onRunSimulation,
  onResetSimulation,
  onNavigate,
}) => {
  const [epochIdx, setEpochIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showAxes, setShowAxes] = useState(true);
  const [showTrajectory, setShowTrajectory] = useState(true);
  const [showUncertainty, setShowUncertainty] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [cameraPreset, setCameraPreset] = useState<'overview' | 'spacecraft' | 'origin'>('overview');
  const [resetCamTick, setResetCamTick] = useState(0);

  const maxIdx = Math.max(0, propagation.states.length - 1);

  useEffect(() => {
    setEpochIdx((prev) => Math.min(prev, maxIdx));
  }, [maxIdx]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setEpochIdx((prev) => (prev >= maxIdx ? 0 : prev + 1));
    }, 140);
    return () => window.clearInterval(id);
  }, [playing, maxIdx]);

  const currentState = propagation.states[Math.min(epochIdx, maxIdx)] ?? propagation.initialState;
  const rFmt = formatDistanceByUnit(currentState.radiusKm, unitMode);
  const vFmt = formatVelocityByUnit(currentState.speedKmS, unitMode);

  const updatePos = (axis: 'x' | 'y' | 'z', val: number) => {
    if (!Number.isFinite(val)) return;
    onConfigChange({
      ...config,
      initialPositionKm: { ...config.initialPositionKm, [axis]: val },
    });
  };

  const updateVel = (axis: 'x' | 'y' | 'z', val: number) => {
    if (!Number.isFinite(val)) return;
    onConfigChange({
      ...config,
      initialVelocityKmS: { ...config.initialVelocityKmS, [axis]: val },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header & Benchmark Scenario Selector */}
      <div className="flex flex-col gap-4 border-b border-slate-800 pb-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-cyan-400">
            <Cpu className="w-3.5 h-3.5" />
            <span>Deep-Space Mission Analysis &amp; Autonomous Navigation Workbench</span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-50">
            Mission Workbench
          </h1>
          <p className="mt-1 text-xs text-slate-400 max-w-3xl">
            Configure inertial initial state vectors, central gravitational body, perturbation forces,
            autonomous XNAV architecture, and communication link assumptions. All downstream modules stay synchronized.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRunSimulation}
            className="inline-flex items-center gap-1.5 border border-cyan-500 bg-cyan-500/20 px-3.5 py-2 font-mono text-xs font-semibold text-cyan-200 hover:bg-cyan-500/30 cursor-pointer"
          >
            <Activity className="w-3.5 h-3.5" />
            Recompute All Models
          </button>
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              setEpochIdx(0);
              onResetSimulation();
            }}
            className="inline-flex items-center gap-1.5 border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Preset
          </button>
          <a
            href="/api/downloads/celestium-cli.zip"
            download="celestium-python-cli.zip"
            className="inline-flex items-center gap-1.5 border border-slate-700 bg-[#090F1D] px-3 py-2 font-mono text-xs text-cyan-300 hover:border-cyan-500/60 hover:bg-cyan-500/10"
          >
            <Terminal className="w-3.5 h-3.5" />
            Python CLI (.zip)
          </a>
        </div>
      </div>

      {/* 3 Prepared Offline Benchmark Scenarios */}
      <section aria-label="Prepared Engineering Scenarios" className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {(Object.keys(DEMO_SCENARIOS) as DemoScenarioId[]).map((id) => {
          const sc = DEMO_SCENARIOS[id];
          const active = config.scenarioId === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setEpochIdx(0);
                setPlaying(false);
                onLoadScenario(id);
              }}
              className={`border p-3.5 text-left transition-colors cursor-pointer ${
                active
                  ? 'border-cyan-500/70 bg-cyan-950/25'
                  : 'border-slate-800 bg-[#090F1D] hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-semibold text-cyan-300">
                  {active ? '◆ ACTIVE SCENARIO' : '◇ BENCHMARK PRESET'}
                </span>
                <span className="font-mono text-[10px] text-slate-400">
                  {sc.config.centralBody.toUpperCase()} · {sc.config.durationDays}d
                </span>
              </div>
              <div className="mt-1.5 font-display text-sm font-semibold text-slate-100">
                {sc.title}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{sc.subtitle}</p>
            </button>
          );
        })}
      </section>

      {/* Main Split: Configuration Controls (Left) + Engineering Readouts & 3D Orbit Viewport (Right) */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Configuration Panel */}
        <section className="xl:col-span-5 border border-slate-800 bg-[#090F1D] p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <h2 className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-slate-100">
              <Sliders className="w-4 h-4 text-cyan-400" />
              Numerical Mission Parameters
            </h2>
            <span className="font-mono text-[10px] text-slate-400">Seed: {config.seed}</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
            <label className="block">
              <span className="font-mono text-[10px] text-slate-400 uppercase">Mission Name</span>
              <input
                type="text"
                value={config.missionName}
                onChange={(e) => onConfigChange({ ...config, missionName: e.target.value })}
                className="mt-1 w-full border border-slate-700 bg-[#060911] px-2.5 py-1.5 text-slate-100 focus:border-cyan-400 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] text-slate-400 uppercase">Spacecraft Name</span>
              <input
                type="text"
                value={config.spacecraftName}
                onChange={(e) => onConfigChange({ ...config, spacecraftName: e.target.value })}
                className="mt-1 w-full border border-slate-700 bg-[#060911] px-2.5 py-1.5 text-slate-100 focus:border-cyan-400 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] text-slate-400 uppercase">Central Body (μ)</span>
              <select
                value={config.centralBody}
                onChange={(e) =>
                  onConfigChange({ ...config, centralBody: e.target.value as CentralBodyId })
                }
                className="mt-1 w-full border border-slate-700 bg-[#060911] px-2.5 py-1.5 text-slate-100 focus:border-cyan-400 focus:outline-none"
              >
                {Object.values(CENTRAL_BODIES).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} (μ={b.muKm3S2.toExponential(3)})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="font-mono text-[10px] text-slate-400 uppercase">Target Destination</span>
              <select
                value={config.targetDestination}
                onChange={(e) =>
                  onConfigChange({
                    ...config,
                    targetDestination: e.target.value as MissionConfig['targetDestination'],
                  })
                }
                className="mt-1 w-full border border-slate-700 bg-[#060911] px-2.5 py-1.5 text-slate-100 focus:border-cyan-400 focus:outline-none"
              >
                <option value="mars">Mars</option>
                <option value="moon">Moon</option>
                <option value="jupiter">Jupiter</option>
                <option value="sun-earth-l1">Sun-Earth L1</option>
                <option value="interstellar">Outer Heliosphere / Interstellar</option>
              </select>
            </label>

            <label className="block">
              <span className="font-mono text-[10px] text-slate-400 uppercase">Initial Epoch (UTC)</span>
              <input
                type="text"
                value={config.epochIso}
                onChange={(e) => onConfigChange({ ...config, epochIso: e.target.value })}
                className="mt-1 w-full border border-slate-700 bg-[#060911] px-2.5 py-1.5 font-mono text-slate-100 focus:border-cyan-400 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] text-slate-400 uppercase">Duration (Days)</span>
              <input
                type="number"
                min={0.1}
                max={3650}
                step={0.5}
                value={config.durationDays}
                onChange={(e) =>
                  onConfigChange({
                    ...config,
                    durationDays: Math.max(0.1, Number(e.target.value) || 1),
                  })
                }
                className="mt-1 w-full border border-slate-700 bg-[#060911] px-2.5 py-1.5 font-mono text-slate-100 tabular-nums focus:border-cyan-400 focus:outline-none"
              />
            </label>
          </div>

          {/* Initial Position & Velocity Vectors */}
          <div className="border-t border-slate-800 pt-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase text-slate-400">
                Initial Position r₀ (km, Inertial Frame)
              </span>
              <span className="font-mono text-[10px] text-cyan-400 tabular-nums">
                |r₀| = {propagation.initialState.radiusKm.toExponential(4)} km
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['x', 'y', 'z'] as const).map((ax) => (
                <label key={ax} className="block">
                  <span className="font-mono text-[10px] text-slate-500">r_{ax} (km)</span>
                  <input
                    type="number"
                    step="any"
                    value={config.initialPositionKm[ax]}
                    onChange={(e) => updatePos(ax, Number(e.target.value))}
                    className="mt-0.5 w-full border border-slate-700 bg-[#060911] px-2 py-1 font-mono text-[11px] text-slate-100 tabular-nums focus:border-cyan-400 focus:outline-none"
                  />
                </label>
              ))}
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="font-mono text-[10px] uppercase text-slate-400">
                Initial Velocity v₀ (km/s, Inertial Frame)
              </span>
              <span className="font-mono text-[10px] text-cyan-400 tabular-nums">
                |v₀| = {propagation.initialState.speedKmS.toFixed(5)} km/s
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['x', 'y', 'z'] as const).map((ax) => (
                <label key={ax} className="block">
                  <span className="font-mono text-[10px] text-slate-500">v_{ax} (km/s)</span>
                  <input
                    type="number"
                    step="0.001"
                    value={config.initialVelocityKmS[ax]}
                    onChange={(e) => updateVel(ax, Number(e.target.value))}
                    className="mt-0.5 w-full border border-slate-700 bg-[#060911] px-2 py-1 font-mono text-[11px] text-slate-100 tabular-nums focus:border-cyan-400 focus:outline-none"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Spacecraft, Force Models, Navigation & Comms */}
          <div className="border-t border-slate-800 pt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
            <label className="block">
              <span className="font-mono text-[10px] text-slate-400">Mass (kg)</span>
              <input
                type="number"
                min={1}
                value={config.spacecraftMassKg}
                onChange={(e) =>
                  onConfigChange({
                    ...config,
                    spacecraftMassKg: Math.max(1, Number(e.target.value) || 500),
                  })
                }
                className="mt-1 w-full border border-slate-700 bg-[#060911] px-2 py-1 font-mono text-slate-100 tabular-nums"
              />
            </label>
            <label className="block">
              <span className="font-mono text-[10px] text-slate-400">Area (m²) / Cr</span>
              <div className="mt-1 flex gap-1">
                <input
                  type="number"
                  min={0.1}
                  step={0.5}
                  value={config.areaM2}
                  onChange={(e) =>
                    onConfigChange({ ...config, areaM2: Math.max(0.1, Number(e.target.value) || 1) })
                  }
                  className="w-1/2 border border-slate-700 bg-[#060911] px-1.5 py-1 font-mono text-slate-100 tabular-nums"
                  aria-label="Spacecraft cross-sectional area"
                />
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.05}
                  value={config.crReflectivity}
                  onChange={(e) =>
                    onConfigChange({
                      ...config,
                      crReflectivity: Math.max(0, Math.min(2, Number(e.target.value) || 1.2)),
                    })
                  }
                  className="w-1/2 border border-slate-700 bg-[#060911] px-1.5 py-1 font-mono text-slate-100 tabular-nums"
                  aria-label="Reflectivity coefficient Cr"
                />
              </div>
            </label>
            <label className="block">
              <span className="font-mono text-[10px] text-slate-400">Integrator</span>
              <select
                value={config.integrator}
                onChange={(e) =>
                  onConfigChange({ ...config, integrator: e.target.value as 'rk45' | 'rk4' })
                }
                className="mt-1 w-full border border-slate-700 bg-[#060911] px-2 py-1 text-slate-100"
              >
                <option value="rk45">Adaptive RK45</option>
                <option value="rk4">Fixed RK4</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-4 border-t border-slate-800 pt-3 text-xs">
            <label className="inline-flex items-center gap-1.5 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={config.enableJ2}
                onChange={(e) => onConfigChange({ ...config, enableJ2: e.target.checked })}
                className="accent-cyan-400"
              />
              <span>J₂ Oblateness</span>
            </label>
            <label className="inline-flex items-center gap-1.5 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={config.enableSrp}
                onChange={(e) => onConfigChange({ ...config, enableSrp: e.target.checked })}
                className="accent-cyan-400"
              />
              <span>Solar Radiation Pressure</span>
            </label>
            <label className="inline-flex items-center gap-1.5 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={config.enableThirdBody}
                onChange={(e) => onConfigChange({ ...config, enableThirdBody: e.target.checked })}
                className="accent-cyan-400"
              />
              <span>Third-Body Perturbation</span>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 border-t border-slate-800 pt-3 sm:grid-cols-2 text-xs">
            <label className="block">
              <span className="font-mono text-[10px] text-slate-400 uppercase">Navigation Architecture</span>
              <select
                value={config.navArchitecture}
                onChange={(e) =>
                  onConfigChange({
                    ...config,
                    navArchitecture: e.target.value as NavigationArchitecture,
                  })
                }
                className="mt-1 w-full border border-slate-700 bg-[#060911] px-2 py-1.5 text-slate-100"
              >
                <option value="autonomous-xnav">Autonomous XNAV (8-State EKF)</option>
                <option value="hybrid-dsn-xnav">Hybrid DSN + XNAV Fusion</option>
                <option value="earth-dsn">Ground DSN Radiometric</option>
              </select>
            </label>
            <label className="block">
              <span className="font-mono text-[10px] text-slate-400 uppercase">RF Carrier / Data Rate</span>
              <div className="mt-1 flex gap-1.5">
                <input
                  type="number"
                  step={0.1}
                  min={0.3}
                  value={config.commConfig.frequencyGHz}
                  onChange={(e) =>
                    onConfigChange({
                      ...config,
                      commConfig: {
                        ...config.commConfig,
                        frequencyGHz: Math.max(0.1, Number(e.target.value) || 8.4),
                      },
                    })
                  }
                  className="w-1/2 border border-slate-700 bg-[#060911] px-2 py-1.5 font-mono text-slate-100 tabular-nums"
                  aria-label="Carrier frequency GHz"
                />
                <input
                  type="number"
                  min={10}
                  step={100}
                  value={config.commConfig.dataRateBps}
                  onChange={(e) =>
                    onConfigChange({
                      ...config,
                      commConfig: {
                        ...config.commConfig,
                        dataRateBps: Math.max(10, Number(e.target.value) || 1000),
                      },
                    })
                  }
                  className="w-1/2 border border-slate-700 bg-[#060911] px-2 py-1.5 font-mono text-slate-100 tabular-nums"
                  aria-label="Telemetry bitrate bps"
                />
              </div>
            </label>
          </div>
        </section>

        {/* Right Column: Live Numerical Summary + Engineering 3D Viewport */}
        <div className="xl:col-span-7 space-y-4">
          {/* 4 Key Computed Engineering Metrics */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="border border-slate-800 bg-[#090F1D] p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-slate-400">OSC. SEMI-MAJOR a</span>
                <ProvenanceTag provenance={propagation.initialOrbitalElements.inspection.provenance} compact />
              </div>
              <div className="mt-1 font-mono text-sm font-semibold text-slate-100 tabular-nums">
                {Number.isFinite(propagation.initialOrbitalElements.semiMajorAxisKm)
                  ? `${formatDistanceByUnit(propagation.initialOrbitalElements.semiMajorAxisKm, unitMode).value} ${formatDistanceByUnit(propagation.initialOrbitalElements.semiMajorAxisKm, unitMode).unit}`
                  : 'Hyperbolic / Unbound'}
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-slate-400 tabular-nums">
                e = {propagation.initialOrbitalElements.eccentricity.toFixed(5)}
              </div>
            </div>

            <div className="border border-slate-800 bg-[#090F1D] p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-slate-400">ENERGY DRIFT</span>
                <ProvenanceTag provenance={propagation.inspection.provenance} compact />
              </div>
              <div className="mt-1 font-mono text-sm font-semibold text-emerald-400 tabular-nums">
                {propagation.conservationDiagnostics.relativeEnergyDrift.toExponential(2)}
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-slate-400 tabular-nums">
                {propagation.totalSteps} {propagation.integratorUsed.toUpperCase()} steps
              </div>
            </div>

            <div className="border border-slate-800 bg-[#090F1D] p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-slate-400">XNAV 8-EKF ERROR</span>
                <ProvenanceTag provenance={xnav.provenance} compact />
              </div>
              <div className="mt-1 font-mono text-sm font-semibold text-cyan-300 tabular-nums">
                {xnav.ekfErrorKm.toFixed(2)} km
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-slate-400 tabular-nums">
                1σ ±{xnav.uncertainty1SigmaKm.toFixed(2)} km · κ={xnav.conditionNumber.toFixed(1)}
              </div>
            </div>

            <div className="border border-slate-800 bg-[#090F1D] p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-slate-400">LINK MARGIN</span>
                <ProvenanceTag provenance={comms.inspection.provenance} compact />
              </div>
              <div
                className={`mt-1 font-mono text-sm font-semibold tabular-nums ${
                  comms.summaryAtCurrentRange.linkMarginDb >= 3
                    ? 'text-emerald-400'
                    : comms.summaryAtCurrentRange.linkMarginDb >= 0
                      ? 'text-amber-400'
                      : 'text-rose-400'
                }`}
              >
                {comms.summaryAtCurrentRange.linkMarginDb.toFixed(2)} dB
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-slate-400 tabular-nums">
                1-Way LT: {comms.summaryAtCurrentRange.oneWayLightTimeSec.toFixed(1)} s
              </div>
            </div>
          </div>

          {/* Interactive Engineering 3D Viewport */}
          <section className="border border-slate-800 bg-[#090F1D]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3.5 py-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                <button
                  type="button"
                  onClick={() => setPlaying((p) => !p)}
                  className="inline-flex items-center gap-1 border border-cyan-500/50 bg-cyan-500/15 px-2.5 py-1 text-cyan-200 hover:bg-cyan-500/25 cursor-pointer"
                >
                  {playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  {playing ? 'Pause' : 'Play'}
                </button>
                <button
                  type="button"
                  onClick={() => setCameraPreset('overview')}
                  className={`border px-2 py-1 cursor-pointer ${cameraPreset === 'overview' ? 'border-cyan-400 text-cyan-300' : 'border-slate-700 text-slate-400'}`}
                >
                  Overview
                </button>
                <button
                  type="button"
                  onClick={() => setCameraPreset('spacecraft')}
                  className={`border px-2 py-1 cursor-pointer ${cameraPreset === 'spacecraft' ? 'border-cyan-400 text-cyan-300' : 'border-slate-700 text-slate-400'}`}
                >
                  Spacecraft
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCameraPreset('overview');
                    setResetCamTick((t) => t + 1);
                  }}
                  className="border border-slate-700 px-2 py-1 text-slate-400 hover:text-slate-100 cursor-pointer"
                >
                  Reset View
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] text-slate-300">
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={showAxes} onChange={(e) => setShowAxes(e.target.checked)} className="accent-cyan-400" />
                  Axes
                </label>
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={showTrajectory} onChange={(e) => setShowTrajectory(e.target.checked)} className="accent-cyan-400" />
                  Trajectory
                </label>
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={showUncertainty} onChange={(e) => setShowUncertainty(e.target.checked)} className="accent-cyan-400" />
                  3σ Ellipsoid
                </label>
                <label className="inline-flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} className="accent-cyan-400" />
                  Overlay
                </label>
              </div>
            </div>

            <div className="h-[340px] w-full">
              <EngineeringOrbitViewport
                propagation={propagation}
                centralBody={config.centralBody}
                uncertainty1SigmaKm={xnav.uncertainty1SigmaKm}
                selectedEpochIndex={epochIdx}
                showAxes={showAxes}
                showTrajectory={showTrajectory}
                showUncertainty={showUncertainty}
                showLabels={showLabels}
                cameraPreset={cameraPreset}
                resetTrigger={resetCamTick}
              />
            </div>

            {/* Synchronized Epoch Scrubber & Live State Strip */}
            <div className="border-t border-slate-800 px-3.5 py-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between bg-[#070B14]">
              <div className="flex items-center gap-3 flex-1">
                <span className="font-mono text-[10px] text-slate-400 whitespace-nowrap">
                  EPOCH SLIDER ({currentState.elapsedDays.toFixed(2)} / {config.durationDays} d)
                </span>
                <input
                  type="range"
                  min={0}
                  max={maxIdx}
                  value={epochIdx}
                  onChange={(e) => {
                    setPlaying(false);
                    setEpochIdx(Number(e.target.value));
                  }}
                  aria-label="Propagated epoch slider"
                  className="w-full accent-cyan-400"
                />
              </div>
              <div className="font-mono text-[11px] text-slate-300 tabular-nums whitespace-nowrap">
                |r|={rFmt.value} {rFmt.unit} · |v|={vFmt.value} {vFmt.unit}
              </div>
            </div>
          </section>

          {/* Direct Workflow Drill-Down Links */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
            {(
              [
                ['trajectory', 'Trajectory & Lambert'],
                ['navigation', 'XNAV 8-State EKF'],
                ['communications', 'RF Link Budget'],
                ['inspector', 'Inspect Equations'],
              ] as [WorkbenchRouteId, string][]
            ).map(([route, label]) => (
              <button
                key={route}
                type="button"
                onClick={() => onNavigate(route)}
                className="flex items-center justify-between border border-slate-800 bg-[#090F1D] px-3 py-2 font-mono text-[11px] text-slate-200 hover:border-cyan-500/60 hover:text-cyan-300 cursor-pointer"
              >
                <span>{label}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
