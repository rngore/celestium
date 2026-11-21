import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Compass,
  Cpu,
  FileText,
  Globe,
  Menu,
  Orbit,
  Radio,
  X,
} from 'lucide-react';
import { CelestiumLogo } from './components/common/CelestiumLogo.tsx';
import {
  buildOfflineSolarSystemSnapshot,
  createDefaultSpaceSonarResult,
} from './data/demoPresets.ts';
import { AutonomousNavPage } from './pages/AutonomousNavPage.tsx';
import { CommunicationPage } from './pages/CommunicationPage.tsx';
import { EphemeridesPage } from './pages/EphemeridesPage.tsx';
import { MissionWorkbenchPage } from './pages/MissionWorkbenchPage.tsx';
import { ModelInspectorPage } from './pages/ModelInspectorPage.tsx';
import { ReportsPage } from './pages/ReportsPage.tsx';
import { TrajectoryAnalysisPage } from './pages/TrajectoryAnalysisPage.tsx';
import { cloneDemoScenarioConfig } from './shared/demoScenarios.ts';
import { analyzeCommunicationLink } from './shared/science/communications.ts';
import { AU_KM, CELESTIUM_MODEL_VERSION, SECONDS_PER_DAY } from './shared/science/constants.ts';
import { solveLambert } from './shared/science/lambert.ts';
import {
  computeHohmannTransfer,
  propagateTrajectory,
} from './shared/science/orbitalMechanics.ts';
import { runXnavSimulation } from './shared/science/xnav.ts';
import type {
  DataSourceStatus,
  DemoScenarioId,
  EngineeringReportPayload,
  HohmannResult,
  LambertResult,
  MissionConfig,
  ModelInspectionRecord,
  SolarSystemSnapshot,
  SpaceSonarSimulationResult,
  UnitDisplayMode,
  WorkbenchRouteId,
  XnavSimulationResult,
} from './shared/types.ts';

const NAV_ITEMS: { id: WorkbenchRouteId; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'workbench', label: 'Mission Workbench', icon: Cpu },
  { id: 'trajectory', label: 'Trajectory Analysis', icon: Orbit },
  { id: 'navigation', label: 'Autonomous Navigation', icon: Compass },
  { id: 'communications', label: 'Communication Analysis', icon: Radio },
  { id: 'ephemerides', label: 'Spacecraft & Ephemerides', icon: Globe },
  { id: 'inspector', label: 'Model Inspector', icon: BookOpen },
  { id: 'reports', label: 'Reports', icon: FileText },
];

export default function App() {
  const [activeRoute, setActiveRoute] = useState<WorkbenchRouteId>('workbench');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [unitMode, setUnitMode] = useState<UnitDisplayMode>('km');
  const [utcClock, setUtcClock] = useState(() => new Date().toISOString().slice(11, 19) + ' UTC');

  const [config, setConfig] = useState<MissionConfig>(() =>
    cloneDemoScenarioConfig('earth-to-mars')
  );
  const [runCounter, setRunCounter] = useState(0);

  // Ephemeris & JPL Horizons state
  const [snapshot, setSnapshot] = useState<SolarSystemSnapshot>(() =>
    buildOfflineSolarSystemSnapshot('2026-11-21')
  );
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [selectedMapId, setSelectedMapId] = useState<string | null>('aditya-l1');
  const [sources, setSources] = useState<DataSourceStatus[]>([]);
  const [syncStatusLabel, setSyncStatusLabel] = useState('Local Analytical');

  // Recomputed synchronized core engineering outputs
  const propagation = useMemo(
    () =>
      propagateTrajectory({
        centralBody: config.centralBody,
        initialPositionKm: config.initialPositionKm,
        initialVelocityKmS: config.initialVelocityKmS,
        epochIso: config.epochIso,
        durationDays: config.durationDays,
        integrator: config.integrator,
        enableJ2: config.enableJ2,
        enableSrp: config.enableSrp,
        enableThirdBody: config.enableThirdBody,
        spacecraftMassKg: config.spacecraftMassKg,
        areaM2: config.areaM2,
        crReflectivity: config.crReflectivity,
        sampleCount: 60,
      }),
    [config, runCounter]
  );

  const communications = useMemo(
    () =>
      analyzeCommunicationLink(
        config.commConfig,
        propagation.states,
        config.centralBody
      ),
    [config.commConfig, propagation.states, config.centralBody]
  );

  const [xnavOverride, setXnavOverride] = useState<XnavSimulationResult | null>(null);
  const defaultXnav = useMemo(
    () =>
      runXnavSimulation({
        spacecraftId: config.spacecraftName,
        truePositionKm: propagation.finalState.positionKm,
        trueVelocityKmS: propagation.finalState.velocityKmS,
        centralBody: config.centralBody,
        initialGuessErrorKm: 1850,
        pulsarIds: ['psr-b0531+21', 'psr-b1937+21', 'psr-j0437-4715', 'psr-b1821-24'],
        observationDurationSec: 3600,
        toaNoiseMultiplier: 1.0,
        dsnDisrupted: config.scenarioId === 'voyager-xnav',
        architecture: config.navArchitecture,
        seed: config.seed,
      }),
    [config, propagation.finalState, runCounter]
  );
  const activeXnav = xnavOverride ?? defaultXnav;

  const [hohmannResult, setHohmannResult] = useState<HohmannResult>(() =>
    computeHohmannTransfer({
      centralBody: 'sun',
      r1Km: AU_KM,
      r2Km: 1.52371 * AU_KM,
    })
  );

  const [lambertResult, setLambertResult] = useState<LambertResult>(() =>
    solveLambert({
      centralBody: 'earth',
      r1Km: { x: 5000, y: 10000, z: 2100 },
      r2Km: { x: -14600, y: 2500, z: 7000 },
      tofSec: 3600,
      direction: 'prograde',
    })
  );

  const [sonarResult, setSonarResult] = useState<SpaceSonarSimulationResult>(() =>
    createDefaultSpaceSonarResult()
  );

  const inspections: ModelInspectionRecord[] = useMemo(
    () => [
      propagation.inspection,
      propagation.initialOrbitalElements.inspection,
      hohmannResult.inspection,
      lambertResult.inspection,
      activeXnav.inspection,
      communications.inspection,
    ],
    [propagation, hohmannResult, lambertResult, activeXnav, communications]
  );

  const reportPayload: EngineeringReportPayload = useMemo(
    () => ({
      generatedAtIso: new Date().toISOString(),
      modelVersion: CELESTIUM_MODEL_VERSION,
      missionConfig: config,
      propagation,
      hohmann: hohmannResult,
      lambert: lambertResult,
      xnav: activeXnav,
      communications,
      inspections,
    }),
    [config, propagation, hohmannResult, lambertResult, activeXnav, communications, inspections]
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      setUtcClock(new Date().toISOString().slice(11, 19) + ' UTC');
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const fetchSourcesAndHealth = useCallback(async () => {
    try {
      const srcRes = await fetch('/api/sources');
      if (srcRes.ok) {
        const srcData = (await srcRes.json()) as { sources: DataSourceStatus[] };
        setSources(srcData.sources);
        const jpl = srcData.sources.find((s) => s.id === 'jpl-horizons');
        if (jpl?.status === 'CONNECTED') setSyncStatusLabel('Horizons Live');
        else if (jpl?.status === 'DEGRADED') setSyncStatusLabel('Horizons Degraded');
        else setSyncStatusLabel('Cached / Fallback');
      }
    } catch {
      setSyncStatusLabel('Offline Analytical');
    }
  }, []);

  const fetchSolarSystem = useCallback(
    async (dateIso: string, refresh = false) => {
      setLoadingSnapshot(true);
      try {
        const res = await fetch(
          `/api/solar-system?date=${encodeURIComponent(dateIso)}&refresh=${refresh ? 'true' : 'false'}`
        );
        if (res.ok) {
          setSnapshot((await res.json()) as SolarSystemSnapshot);
        } else {
          setSnapshot(buildOfflineSolarSystemSnapshot(dateIso));
        }
      } catch {
        setSnapshot(buildOfflineSolarSystemSnapshot(dateIso));
      } finally {
        setLoadingSnapshot(false);
        fetchSourcesAndHealth();
      }
    },
    [fetchSourcesAndHealth]
  );

  useEffect(() => {
    fetchSolarSystem('2026-11-21', false);
  }, [fetchSolarSystem]);

  const handleLoadScenario = (id: DemoScenarioId) => {
    setXnavOverride(null);
    const next = cloneDemoScenarioConfig(id);
    setConfig(next);
    if (id === 'earth-to-moon') {
      setHohmannResult(computeHohmannTransfer({ centralBody: 'earth', r1Km: 6678, r2Km: 384400 }));
      setLambertResult(
        solveLambert({
          centralBody: 'earth',
          r1Km: { x: 6678, y: 0, z: 0 },
          r2Km: { x: -350000, y: 120000, z: 24000 },
          tofSec: 4.5 * SECONDS_PER_DAY,
          direction: 'prograde',
          initialVelocityKmS: next.initialVelocityKmS,
        })
      );
    } else {
      setHohmannResult(
        computeHohmannTransfer({ centralBody: 'sun', r1Km: AU_KM, r2Km: 1.52371 * AU_KM })
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#060911] text-slate-100 flex flex-col">
      {/* Top Institutional Engineering Bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-slate-800 bg-[#070B14] px-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileNavOpen((o) => !o)}
            className="p-1.5 text-slate-300 hover:text-white lg:hidden focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400"
            aria-label="Toggle navigation menu"
          >
            {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <button
            type="button"
            onClick={() => setActiveRoute('workbench')}
            className="text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400"
          >
            <CelestiumLogo />
          </button>
        </div>

        <div className="hidden md:flex items-center gap-4 font-mono text-[11px] text-slate-300 tabular-nums">
          <span>{utcClock}</span>
          <span className="text-slate-600" aria-hidden="true">|</span>
          <span>Model v{CELESTIUM_MODEL_VERSION}</span>
          <span className="text-slate-600" aria-hidden="true">|</span>
          <span>Ephemeris: {syncStatusLabel}</span>
        </div>

        {/* Unit System Selector (km / SI m / AU) */}
        <div className="flex items-center gap-1 border border-slate-800 bg-[#090F1D] p-0.5 font-mono text-[11px]">
          {(['km', 'si', 'au'] as UnitDisplayMode[]).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUnitMode(u)}
              className={`px-2 py-1 uppercase cursor-pointer ${
                unitMode === u ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {u === 'si' ? 'SI (m)' : u}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-1">
        {/* 7-Workspace Engineering Sidebar */}
        <aside
          className={`${
            mobileNavOpen ? 'fixed inset-y-14 left-0 z-40 block w-64' : 'hidden'
          } lg:static lg:block lg:w-64 shrink-0 border-r border-slate-800 bg-[#080D1A]`}
        >
          <nav className="flex flex-col p-3 space-y-1" aria-label="Primary Sidebar Navigation">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeRoute === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveRoute(item.id);
                    setMobileNavOpen(false);
                  }}
                  className={`flex items-center gap-2.5 px-3 py-2.5 text-left text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-cyan-500/15 text-cyan-300 border-r-2 border-cyan-400'
                      : 'text-slate-400 hover:bg-slate-900/70 hover:text-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="mt-4 mx-3 border-t border-slate-800 pt-4 text-[11px] font-mono text-slate-400 space-y-2.5 tabular-nums">
            <div>
              <span className="block text-[10px] text-slate-500">ACTIVE MISSION</span>
              <span className="text-cyan-300 truncate block">{config.missionName}</span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-500">CENTRAL BODY / FRAME</span>
              <span className="text-slate-200">{config.centralBody.toUpperCase()} · {config.integrator.toUpperCase()}</span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-500">8-STATE EKF ACCURACY</span>
              <span className="text-emerald-400">
                {activeXnav.ekfErrorKm.toFixed(2)} km (±{activeXnav.uncertainty1SigmaKm.toFixed(2)} km)
              </span>
            </div>
          </div>
        </aside>

        {/* Active Engineering Workspace */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 overflow-x-hidden">
          {activeRoute === 'workbench' && (
            <MissionWorkbenchPage
              config={config}
              unitMode={unitMode}
              propagation={propagation}
              xnav={activeXnav}
              comms={communications}
              onConfigChange={(next) => {
                setXnavOverride(null);
                setConfig(next);
              }}
              onLoadScenario={handleLoadScenario}
              onRunSimulation={() => {
                setXnavOverride(null);
                setRunCounter((c) => c + 1);
              }}
              onResetSimulation={() => handleLoadScenario(config.scenarioId as DemoScenarioId)}
              onNavigate={setActiveRoute}
            />
          )}

          {activeRoute === 'trajectory' && (
            <TrajectoryAnalysisPage
              config={config}
              unitMode={unitMode}
              propagation={propagation}
              hohmann={hohmannResult}
              lambert={lambertResult}
              onHohmannChange={setHohmannResult}
              onLambertChange={setLambertResult}
            />
          )}

          {activeRoute === 'navigation' && (
            <AutonomousNavPage
              config={config}
              xnav={activeXnav}
              onXnavChange={setXnavOverride}
              sonar={sonarResult}
              onSonarChange={setSonarResult}
            />
          )}

          {activeRoute === 'communications' && (
            <CommunicationPage
              config={config}
              unitMode={unitMode}
              comms={communications}
              onConfigChange={setConfig}
            />
          )}

          {activeRoute === 'ephemerides' && (
            <EphemeridesPage
              snapshot={snapshot}
              sources={sources}
              selectedId={selectedMapId}
              loading={loadingSnapshot}
              onSelectId={setSelectedMapId}
              onDateChange={(dateIso) => fetchSolarSystem(dateIso, false)}
              onRefreshEphemeris={() => fetchSolarSystem(snapshot.requestedDate, true)}
            />
          )}

          {activeRoute === 'inspector' && <ModelInspectorPage inspections={inspections} />}

          {activeRoute === 'reports' && <ReportsPage payload={reportPayload} />}
        </main>
      </div>
    </div>
  );
}
