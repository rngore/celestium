import React, { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, CheckCircle2, Compass, Orbit } from 'lucide-react';
import { ProvenanceTag } from '../components/common/ProvenanceTag.tsx';
import { solveLambert } from '../shared/science/lambert.ts';
import { computeHohmannTransfer } from '../shared/science/orbitalMechanics.ts';
import { AU_KM, CENTRAL_BODIES, SECONDS_PER_DAY } from '../shared/science/constants.ts';
import { formatDistanceByUnit, formatVelocityByUnit } from '../shared/science/units.ts';
import type {
  CentralBodyId,
  HohmannResult,
  LambertResult,
  MissionConfig,
  PropagationResult,
  UnitDisplayMode,
} from '../shared/types.ts';

interface TrajectoryAnalysisPageProps {
  config: MissionConfig;
  unitMode: UnitDisplayMode;
  propagation: PropagationResult;
  hohmann: HohmannResult;
  lambert: LambertResult;
  onHohmannChange: (next: HohmannResult) => void;
  onLambertChange: (next: LambertResult) => void;
}

export const TrajectoryAnalysisPage: React.FC<TrajectoryAnalysisPageProps> = ({
  config,
  unitMode,
  propagation,
  hohmann,
  lambert,
  onHohmannChange,
  onLambertChange,
}) => {
  const [subTab, setSubTab] = useState<'propagation' | 'coe' | 'hohmann-lambert'>('propagation');

  const [r1Km, setR1Km] = useState<number>(hohmann.request.r1Km);
  const [r2Km, setR2Km] = useState<number>(hohmann.request.r2Km);
  const [hohmannBody, setHohmannBody] = useState<CentralBodyId>(hohmann.request.centralBody);

  const [lambertBody, setLambertBody] = useState<CentralBodyId>(lambert.request.centralBody);
  const [lambertR1, setLambertR1] = useState(lambert.request.r1Km);
  const [lambertR2, setLambertR2] = useState(lambert.request.r2Km);
  const [lambertTofDays, setLambertTofDays] = useState(lambert.request.tofSec / SECONDS_PER_DAY);
  const [lambertDir, setLambertDir] = useState<'prograde' | 'retrograde'>(lambert.request.direction);

  const chartData = useMemo(
    () =>
      propagation.states.map((s) => ({
        day: Number(s.elapsedDays.toFixed(2)),
        radiusKm: Number(s.radiusKm.toFixed(2)),
        speedKmS: Number(s.speedKmS.toFixed(4)),
        energyDrift:
          Math.abs(propagation.conservationDiagnostics.initialEnergyKm2S2) > 1e-12
            ? Math.abs(
                s.specificEnergyKm2S2 - propagation.conservationDiagnostics.initialEnergyKm2S2
              ) / Math.abs(propagation.conservationDiagnostics.initialEnergyKm2S2)
            : 0,
      })),
    [propagation]
  );

  const runHohmann = () => {
    onHohmannChange(
      computeHohmannTransfer({
        centralBody: hohmannBody,
        r1Km,
        r2Km,
      })
    );
  };

  const runLambert = () => {
    onLambertChange(
      solveLambert({
        centralBody: lambertBody,
        r1Km: lambertR1,
        r2Km: lambertR2,
        tofSec: Math.max(60, lambertTofDays * SECONDS_PER_DAY),
        direction: lambertDir,
        initialVelocityKmS: config.initialVelocityKmS,
      })
    );
  };

  const coe = propagation.initialOrbitalElements;
  const finalCoe = propagation.finalOrbitalElements;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-cyan-400">
            <Orbit className="w-3.5 h-3.5" />
            <span>Astrodynamics &amp; Trajectory Mechanics</span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-50">
            Trajectory Analysis
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Numerical propagation ({propagation.integratorUsed.toUpperCase()}), Classical Orbital Elements with singularity handling, idealized Hohmann transfer, and Universal-Variable Lambert solver.
          </p>
        </div>

        <div className="flex flex-wrap gap-1 border border-slate-800 bg-[#090F1D] p-1 text-xs font-mono">
          {(
            [
              ['propagation', 'Numerical Propagation'],
              ['coe', 'Orbital Elements (COE)'],
              ['hohmann-lambert', 'Hohmann & Lambert'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSubTab(id)}
              className={`px-3 py-1.5 cursor-pointer transition-colors ${
                subTab === id
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {subTab === 'propagation' && (
        <div className="space-y-6">
          {/* Conservation & Integration Diagnostics */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="border border-slate-800 bg-[#090F1D] p-3.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-slate-400">INTEGRATOR TELEMETRY</span>
                <ProvenanceTag provenance={propagation.inspection.provenance} compact />
              </div>
              <div className="mt-1 font-mono text-base font-semibold text-slate-100 tabular-nums">
                {propagation.integratorUsed.toUpperCase()} · {propagation.totalSteps} steps
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-slate-400 tabular-nums">
                Rejected: {propagation.rejectedSteps} · dt [{propagation.minStepSec.toFixed(1)}s, {propagation.maxStepSec.toFixed(1)}s]
              </div>
            </div>

            <div className="border border-slate-800 bg-[#090F1D] p-3.5">
              <span className="font-mono text-[10px] text-slate-400">REL. ENERGY DRIFT |Δε/ε₀|</span>
              <div className="mt-1 font-mono text-base font-semibold text-emerald-400 tabular-nums">
                {propagation.conservationDiagnostics.relativeEnergyDrift.toExponential(3)}
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                {config.enableJ2 || config.enableSrp || config.enableThirdBody
                  ? 'Non-conservative perturbations active'
                  : 'Conserved two-body invariant'}
              </div>
            </div>

            <div className="border border-slate-800 bg-[#090F1D] p-3.5">
              <span className="font-mono text-[10px] text-slate-400">ANGULAR MOMENTUM DRIFT</span>
              <div className="mt-1 font-mono text-base font-semibold text-cyan-300 tabular-nums">
                {propagation.conservationDiagnostics.relativeAngularMomentumDrift.toExponential(3)}
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-slate-400 tabular-nums">
                |h₀| = {propagation.conservationDiagnostics.initialAngularMomentumKm2S.toExponential(3)} km²/s
              </div>
            </div>

            <div className="border border-slate-800 bg-[#090F1D] p-3.5">
              <span className="font-mono text-[10px] text-slate-400">STEP-SENSITIVITY CHECK</span>
              <div className="mt-1 flex items-center gap-1.5 font-mono text-base font-semibold text-slate-100 tabular-nums">
                {propagation.stepSensitivityCheck.passed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                )}
                Δr = {propagation.stepSensitivityCheck.finalPositionDiffKm.toExponential(2)} km
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                vs {propagation.stepSensitivityCheck.comparedAgainst}
              </div>
            </div>
          </div>

          {/* Time-Series Charts */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="border border-slate-800 bg-[#090F1D] p-4">
              <h2 className="font-display text-sm font-semibold text-slate-100 mb-3">
                Orbital Radius (km) &amp; Speed (km/s) vs Elapsed Days
              </h2>
              <div className="h-64 w-full min-w-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                    <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} />
                    <YAxis yAxisId="left" stroke="#22d3ee" fontSize={11} tickFormatter={(v) => Number(v).toExponential(1)} />
                    <YAxis yAxisId="right" orientation="right" stroke="#10b981" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: '#070B14', borderColor: '#334155', fontSize: 11 }} />
                    <Line yAxisId="left" type="monotone" dataKey="radiusKm" stroke="#22d3ee" dot={false} name="Radius (km)" strokeWidth={2} />
                    <Line yAxisId="right" type="monotone" dataKey="speedKmS" stroke="#10b981" dot={false} name="Speed (km/s)" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="border border-slate-800 bg-[#090F1D] p-4">
              <h2 className="font-display text-sm font-semibold text-slate-100 mb-3">
                Relative Specific Orbital Energy Drift |Δε / ε₀|
              </h2>
              <div className="h-64 w-full min-w-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                    <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#f59e0b" fontSize={11} tickFormatter={(v) => Number(v).toExponential(1)} />
                    <Tooltip contentStyle={{ backgroundColor: '#070B14', borderColor: '#334155', fontSize: 11 }} />
                    <Line type="monotone" dataKey="energyDrift" stroke="#f59e0b" dot={false} name="|Δε/ε₀|" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Sampled Epoch State Table */}
          <div className="border border-slate-800 bg-[#090F1D] p-4">
            <h2 className="font-display text-sm font-semibold text-slate-100 mb-3">
              Propagated State Vector Table ({propagation.referenceFrame})
            </h2>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-left font-mono text-[11px] tabular-nums">
                <thead className="sticky top-0 bg-[#070B14] border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="py-2 pr-3">Day</th>
                    <th className="py-2 pr-3">Epoch (UTC)</th>
                    <th className="py-2 pr-3">Position (r_x, r_y, r_z)</th>
                    <th className="py-2 pr-3">Velocity (v_x, v_y, v_z)</th>
                    <th className="py-2 pr-3">|r|</th>
                    <th className="py-2 pr-3">|v|</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-slate-200">
                  {propagation.states.slice(0, 30).map((s) => {
                    const rU = formatDistanceByUnit(s.radiusKm, unitMode);
                    const vU = formatVelocityByUnit(s.speedKmS, unitMode);
                    return (
                      <tr key={s.index} className="hover:bg-slate-900/50">
                        <td className="py-1.5 pr-3 text-cyan-300">{s.elapsedDays.toFixed(2)}</td>
                        <td className="py-1.5 pr-3 text-slate-400">{s.epochIso.slice(0, 19)}Z</td>
                        <td className="py-1.5 pr-3">
                          [{s.positionKm.x.toExponential(3)}, {s.positionKm.y.toExponential(3)}, {s.positionKm.z.toExponential(3)}] km
                        </td>
                        <td className="py-1.5 pr-3">
                          [{s.velocityKmS.x.toFixed(3)}, {s.velocityKmS.y.toFixed(3)}, {s.velocityKmS.z.toFixed(3)}] km/s
                        </td>
                        <td className="py-1.5 pr-3">{rU.value} {rU.unit}</td>
                        <td className="py-1.5 pr-3">{vU.value} {vU.unit}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {subTab === 'coe' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="border border-slate-800 bg-[#090F1D] p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h2 className="font-display text-sm font-semibold text-slate-100">
                Osculating Classical Orbital Elements (Initial vs Final)
              </h2>
              <ProvenanceTag provenance={coe.inspection.provenance} />
            </div>

            {coe.edgeCaseFlags.notes.length > 0 && (
              <div className="border border-amber-500/40 bg-amber-950/20 p-3 text-xs text-amber-300 space-y-1">
                <div className="font-mono text-[10px] font-semibold uppercase">Singularity / Edge-Case Handling</div>
                {coe.edgeCaseFlags.notes.map((n, i) => (
                  <p key={i}>{n}</p>
                ))}
              </div>
            )}

            <table className="w-full font-mono text-xs tabular-nums">
              <thead className="border-b border-slate-800 text-slate-400 text-[11px]">
                <tr>
                  <th className="py-2 text-left">Element</th>
                  <th className="py-2 text-right">Initial (t₀)</th>
                  <th className="py-2 text-right">Final (t_end)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-slate-200">
                <tr>
                  <td className="py-2 text-slate-400">Regime</td>
                  <td className="py-2 text-right uppercase text-cyan-300">{coe.orbitRegime}</td>
                  <td className="py-2 text-right uppercase text-cyan-300">{finalCoe.orbitRegime}</td>
                </tr>
                <tr>
                  <td className="py-2 text-slate-400">Semi-Major Axis a (km)</td>
                  <td className="py-2 text-right">{Number.isFinite(coe.semiMajorAxisKm) ? coe.semiMajorAxisKm.toExponential(5) : 'Infinity'}</td>
                  <td className="py-2 text-right">{Number.isFinite(finalCoe.semiMajorAxisKm) ? finalCoe.semiMajorAxisKm.toExponential(5) : 'Infinity'}</td>
                </tr>
                <tr>
                  <td className="py-2 text-slate-400">Eccentricity e</td>
                  <td className="py-2 text-right">{coe.eccentricity.toFixed(6)}</td>
                  <td className="py-2 text-right">{finalCoe.eccentricity.toFixed(6)}</td>
                </tr>
                <tr>
                  <td className="py-2 text-slate-400">Inclination i (deg)</td>
                  <td className="py-2 text-right">{coe.inclinationDeg.toFixed(4)}°</td>
                  <td className="py-2 text-right">{finalCoe.inclinationDeg.toFixed(4)}°</td>
                </tr>
                <tr>
                  <td className="py-2 text-slate-400">RAAN Ω (deg)</td>
                  <td className="py-2 text-right">{coe.raanDeg !== null ? `${coe.raanDeg.toFixed(4)}°` : 'Undefined (Equatorial)'}</td>
                  <td className="py-2 text-right">{finalCoe.raanDeg !== null ? `${finalCoe.raanDeg.toFixed(4)}°` : 'Undefined (Equatorial)'}</td>
                </tr>
                <tr>
                  <td className="py-2 text-slate-400">Arg. of Periapsis ω (deg)</td>
                  <td className="py-2 text-right">{coe.argPeriapsisDeg !== null ? `${coe.argPeriapsisDeg.toFixed(4)}°` : 'Undefined / N/A'}</td>
                  <td className="py-2 text-right">{finalCoe.argPeriapsisDeg !== null ? `${finalCoe.argPeriapsisDeg.toFixed(4)}°` : 'Undefined / N/A'}</td>
                </tr>
                <tr>
                  <td className="py-2 text-slate-400">True Anomaly ν (deg)</td>
                  <td className="py-2 text-right">{coe.trueAnomalyDeg !== null ? `${coe.trueAnomalyDeg.toFixed(4)}°` : `u/l=${coe.trueLongitudeDeg?.toFixed(4) ?? 'N/A'}°`}</td>
                  <td className="py-2 text-right">{finalCoe.trueAnomalyDeg !== null ? `${finalCoe.trueAnomalyDeg.toFixed(4)}°` : `u/l=${finalCoe.trueLongitudeDeg?.toFixed(4) ?? 'N/A'}°`}</td>
                </tr>
                <tr>
                  <td className="py-2 text-slate-400">Periapsis / Apoapsis (km)</td>
                  <td className="py-2 text-right">{coe.periapsisKm.toExponential(3)} / {coe.apoapsisKm ? coe.apoapsisKm.toExponential(3) : 'Unbound'}</td>
                  <td className="py-2 text-right">{finalCoe.periapsisKm.toExponential(3)} / {finalCoe.apoapsisKm ? finalCoe.apoapsisKm.toExponential(3) : 'Unbound'}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="border border-slate-800 bg-[#090F1D] p-4 space-y-4">
            <h2 className="font-display text-sm font-semibold text-slate-100 border-b border-slate-800 pb-2.5">
              Intermediate Vector Decomposition (h, n, e)
            </h2>
            <div className="space-y-3 font-mono text-xs tabular-nums">
              <div className="border border-slate-800 bg-[#060911] p-3">
                <div className="text-[10px] text-slate-400">SPECIFIC ANGULAR MOMENTUM h = r × v (km²/s)</div>
                <div className="mt-1 text-cyan-300">
                  [{coe.intermediateVectors.hVecKm2S.x.toExponential(4)}, {coe.intermediateVectors.hVecKm2S.y.toExponential(4)}, {coe.intermediateVectors.hVecKm2S.z.toExponential(4)}]
                </div>
                <div className="mt-1 text-slate-400">|h| = {coe.angularMomentumKm2S.toExponential(5)} km²/s</div>
              </div>

              <div className="border border-slate-800 bg-[#060911] p-3">
                <div className="text-[10px] text-slate-400">ASCENDING NODE VECTOR n = k × h (km²/s)</div>
                <div className="mt-1 text-slate-200">
                  [{coe.intermediateVectors.nodeVecKm2S.x.toExponential(4)}, {coe.intermediateVectors.nodeVecKm2S.y.toExponential(4)}, 0]
                </div>
              </div>

              <div className="border border-slate-800 bg-[#060911] p-3">
                <div className="text-[10px] text-slate-400">LAPLACE-RUNGE-LENZ ECCENTRICITY VECTOR e</div>
                <div className="mt-1 text-emerald-400">
                  [{coe.intermediateVectors.eccVec.x.toFixed(6)}, {coe.intermediateVectors.eccVec.y.toFixed(6)}, {coe.intermediateVectors.eccVec.z.toFixed(6)}]
                </div>
                <div className="mt-1 text-slate-400">Specific Orbital Energy ε = {coe.specificEnergyKm2S2.toFixed(5)} km²/s²</div>
              </div>
            </div>
          </section>
        </div>
      )}

      {subTab === 'hohmann-lambert' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Idealized Hohmann Transfer */}
          <section className="border border-slate-800 bg-[#090F1D] p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-100">
                  Idealized Coplanar Hohmann Transfer
                </h2>
                <span className="font-mono text-[10px] text-amber-400">
                  ▲ Idealized Two-Body Coplanar Model (Circular Orbits Only)
                </span>
              </div>
              <ProvenanceTag provenance={hohmann.inspection.provenance} compact />
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <label>
                <span className="font-mono text-[10px] text-slate-400">Central Body</span>
                <select
                  value={hohmannBody}
                  onChange={(e) => setHohmannBody(e.target.value as CentralBodyId)}
                  className="mt-1 w-full border border-slate-700 bg-[#060911] px-2 py-1.5 text-slate-100"
                >
                  {Object.values(CENTRAL_BODIES).map((b) => (
                    <option key={b.id} value={b.id}>{b.id.toUpperCase()}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="font-mono text-[10px] text-slate-400">r₁ (km)</span>
                <input
                  type="number"
                  value={r1Km}
                  onChange={(e) => setR1Km(Number(e.target.value) || AU_KM)}
                  className="mt-1 w-full border border-slate-700 bg-[#060911] px-2 py-1.5 font-mono text-slate-100 tabular-nums"
                />
              </label>
              <label>
                <span className="font-mono text-[10px] text-slate-400">r₂ (km)</span>
                <input
                  type="number"
                  value={r2Km}
                  onChange={(e) => setR2Km(Number(e.target.value) || 1.5237 * AU_KM)}
                  className="mt-1 w-full border border-slate-700 bg-[#060911] px-2 py-1.5 font-mono text-slate-100 tabular-nums"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={runHohmann}
                className="border border-cyan-500/60 bg-cyan-500/20 px-3 py-1.5 font-mono text-xs text-cyan-200 hover:bg-cyan-500/30 cursor-pointer"
              >
                Compute Hohmann
              </button>
              <button
                type="button"
                onClick={() => {
                  setHohmannBody('sun');
                  setR1Km(AU_KM);
                  setR2Km(1.52371 * AU_KM);
                }}
                className="border border-slate-700 px-2.5 py-1.5 font-mono text-[11px] text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Earth→Mars Preset
              </button>
              <button
                type="button"
                onClick={() => {
                  setHohmannBody('earth');
                  setR1Km(6678);
                  setR2Km(42164);
                }}
                className="border border-slate-700 px-2.5 py-1.5 font-mono text-[11px] text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                LEO→GEO Preset
              </button>
            </div>

            <dl className="grid grid-cols-2 gap-2 border-t border-slate-800 pt-3 font-mono text-xs tabular-nums">
              <div><dt className="text-[10px] text-slate-400">a_transfer</dt><dd>{hohmann.semiMajorAxisTransferKm.toExponential(4)} km</dd></div>
              <div><dt className="text-[10px] text-slate-400">Transfer Time</dt><dd className="text-cyan-300">{hohmann.transferTimeDays.toFixed(2)} d ({(hohmann.transferTimeSec / 3600).toFixed(2)} hr)</dd></div>
              <div><dt className="text-[10px] text-slate-400">v_c1 / v_t1</dt><dd>{hohmann.vCircular1KmS.toFixed(4)} / {hohmann.vTransferPeriapsisKmS.toFixed(4)} km/s</dd></div>
              <div><dt className="text-[10px] text-slate-400">v_c2 / v_t2</dt><dd>{hohmann.vCircular2KmS.toFixed(4)} / {hohmann.vTransferApoapsisKmS.toFixed(4)} km/s</dd></div>
              <div><dt className="text-[10px] text-slate-400">Δv₁ / Δv₂</dt><dd>{hohmann.deltaV1KmS.toFixed(4)} / {hohmann.deltaV2KmS.toFixed(4)} km/s</dd></div>
              <div><dt className="text-[10px] text-slate-400">Total Δv</dt><dd className="text-emerald-400 font-semibold">{hohmann.totalDeltaVKmS.toFixed(4)} km/s</dd></div>
            </dl>
          </section>

          {/* Universal-Variable Lambert Boundary-Value Solver */}
          <section className="border border-slate-800 bg-[#090F1D] p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div>
                <h2 className="flex items-center gap-1.5 font-display text-sm font-semibold text-slate-100">
                  <Compass className="w-4 h-4 text-cyan-400" />
                  Universal-Variable Lambert Solver
                </h2>
                <span className="font-mono text-[10px] text-cyan-400">
                  ◆ Stumpff C(z), S(z) Zero-Revolution BVP
                </span>
              </div>
              <ProvenanceTag provenance={lambert.inspection.provenance} compact />
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <label>
                <span className="font-mono text-[10px] text-slate-400">Central Body</span>
                <select
                  value={lambertBody}
                  onChange={(e) => setLambertBody(e.target.value as CentralBodyId)}
                  className="mt-1 w-full border border-slate-700 bg-[#060911] px-2 py-1.5 text-slate-100"
                >
                  {Object.values(CENTRAL_BODIES).map((b) => (
                    <option key={b.id} value={b.id}>{b.id.toUpperCase()}</option>
                  ))}
                </select>
              </label>
              <label>
                <span className="font-mono text-[10px] text-slate-400">TOF Δt (days)</span>
                <input
                  type="number"
                  step="any"
                  value={lambertTofDays}
                  onChange={(e) => setLambertTofDays(Math.max(0.01, Number(e.target.value) || 1))}
                  className="mt-1 w-full border border-slate-700 bg-[#060911] px-2 py-1.5 font-mono text-slate-100 tabular-nums"
                />
              </label>
              <label>
                <span className="font-mono text-[10px] text-slate-400">Direction</span>
                <select
                  value={lambertDir}
                  onChange={(e) => setLambertDir(e.target.value as 'prograde' | 'retrograde')}
                  className="mt-1 w-full border border-slate-700 bg-[#060911] px-2 py-1.5 text-slate-100"
                >
                  <option value="prograde">Prograde</option>
                  <option value="retrograde">Retrograde</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              {(['x', 'y', 'z'] as const).map((ax) => (
                <label key={`r1-${ax}`}>
                  <span className="font-mono text-[10px] text-slate-400">r1_{ax} (km)</span>
                  <input
                    type="number"
                    step="any"
                    value={lambertR1[ax]}
                    onChange={(e) => setLambertR1({ ...lambertR1, [ax]: Number(e.target.value) })}
                    className="mt-0.5 w-full border border-slate-700 bg-[#060911] px-2 py-1 font-mono text-[11px] text-slate-100 tabular-nums"
                  />
                </label>
              ))}
              {(['x', 'y', 'z'] as const).map((ax) => (
                <label key={`r2-${ax}`}>
                  <span className="font-mono text-[10px] text-slate-400">r2_{ax} (km)</span>
                  <input
                    type="number"
                    step="any"
                    value={lambertR2[ax]}
                    onChange={(e) => setLambertR2({ ...lambertR2, [ax]: Number(e.target.value) })}
                    className="mt-0.5 w-full border border-slate-700 bg-[#060911] px-2 py-1 font-mono text-[11px] text-slate-100 tabular-nums"
                  />
                </label>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={runLambert}
                className="border border-cyan-500/60 bg-cyan-500/20 px-3 py-1.5 font-mono text-xs text-cyan-200 hover:bg-cyan-500/30 cursor-pointer"
              >
                Solve Lambert BVP
              </button>
              <button
                type="button"
                onClick={() => {
                  setLambertBody('earth');
                  setLambertR1({ x: 5000, y: 10000, z: 2100 });
                  setLambertR2({ x: -14600, y: 2500, z: 7000 });
                  setLambertTofDays(3600 / SECONDS_PER_DAY);
                  setLambertDir('prograde');
                }}
                className="border border-slate-700 px-2.5 py-1.5 font-mono text-[11px] text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Curtis Ex 5.2 Reference
              </button>
            </div>

            {!lambert.converged ? (
              <div className="border border-rose-500/50 bg-rose-950/30 p-3 text-xs text-rose-300">
                {lambert.failureReason}
              </div>
            ) : (
              <dl className="grid grid-cols-1 gap-2 border-t border-slate-800 pt-3 font-mono text-xs tabular-nums">
                <div className="flex justify-between">
                  <dt className="text-slate-400">Convergence / Sweep</dt>
                  <dd className="text-emerald-400">Converged ({lambert.iterations} iters, z={lambert.zFinal.toFixed(5)}, Δθ={lambert.transferAngleDeg.toFixed(2)}°)</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-400">Departure v₁ (km/s)</dt>
                  <dd className="text-cyan-300">[{lambert.v1KmS.x.toFixed(4)}, {lambert.v1KmS.y.toFixed(4)}, {lambert.v1KmS.z.toFixed(4)}]</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-400">Arrival v₂ (km/s)</dt>
                  <dd className="text-cyan-300">[{lambert.v2KmS.x.toFixed(4)}, {lambert.v2KmS.y.toFixed(4)}, {lambert.v2KmS.z.toFixed(4)}]</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-400">Lagrange (f, g, ġ)</dt>
                  <dd>f={lambert.lagrangeCoefficients.f.toFixed(5)}, g={lambert.lagrangeCoefficients.g.toFixed(1)}s, ġ={lambert.lagrangeCoefficients.gDot.toFixed(5)}</dd>
                </div>
                {lambert.deltaVDepartureKmS !== null && (
                  <div className="flex justify-between">
                    <dt className="text-slate-400">Departure Δv vs r₀/v₀</dt>
                    <dd className="text-amber-300">{lambert.deltaVDepartureKmS.toFixed(4)} km/s</dd>
                  </div>
                )}
              </dl>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
