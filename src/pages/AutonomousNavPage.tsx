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
import { AlertTriangle, Compass, Radar } from 'lucide-react';
import { ProvenanceTag } from '../components/common/ProvenanceTag.tsx';
import { UniverseGpsViewport } from '../components/three/UniverseGpsViewport.tsx';
import { PULSAR_CATALOG } from '../shared/catalog/pulsars.ts';
import { SPACE_SONAR_PRESETS, runSpaceSonarSimulation } from '../shared/science/spaceSonar.ts';
import { runXnavSimulation } from '../shared/science/xnav.ts';
import type {
  MissionConfig,
  SpaceSonarModality,
  SpaceSonarSimulationResult,
  XnavSimulationResult,
} from '../shared/types.ts';

interface AutonomousNavPageProps {
  config: MissionConfig;
  xnav: XnavSimulationResult;
  onXnavChange: (next: XnavSimulationResult) => void;
  sonar: SpaceSonarSimulationResult;
  onSonarChange: (next: SpaceSonarSimulationResult) => void;
}

export const AutonomousNavPage: React.FC<AutonomousNavPageProps> = ({
  config,
  xnav,
  onXnavChange,
  sonar,
  onSonarChange,
}) => {
  const [tab, setTab] = useState<'xnav' | 'sonar'>('xnav');
  const [selectedPulsars, setSelectedPulsars] = useState<string[]>(xnav.request.pulsarIds);
  const [obsDurationSec, setObsDurationSec] = useState<number>(xnav.request.observationDurationSec);
  const [guessErrorKm, setGuessErrorKm] = useState<number>(xnav.request.initialGuessErrorKm);
  const [toaNoiseMult, setToaNoiseMult] = useState<number>(xnav.request.toaNoiseMultiplier);
  const [dsnDisrupted, setDsnDisrupted] = useState<boolean>(xnav.request.dsnDisrupted);

  const [sonarModality, setSonarModality] = useState<SpaceSonarModality>(sonar.request.modality);
  const [sonarRangeM, setSonarRangeM] = useState<number>(sonar.request.rangeM);

  const togglePulsar = (id: string) => {
    setSelectedPulsars((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const runXnav = () => {
    const safeList = selectedPulsars.length >= 2 ? selectedPulsars : PULSAR_CATALOG.slice(0, 2).map((p) => p.id);
    onXnavChange(
      runXnavSimulation({
        ...xnav.request,
        truePositionKm: config.initialPositionKm,
        trueVelocityKmS: config.initialVelocityKmS,
        centralBody: config.centralBody,
        pulsarIds: safeList,
        observationDurationSec: obsDurationSec,
        initialGuessErrorKm: guessErrorKm,
        toaNoiseMultiplier: toaNoiseMult,
        dsnDisrupted,
        architecture: config.navArchitecture,
        seed: config.seed,
      })
    );
  };

  const runSonar = () => {
    const preset = SPACE_SONAR_PRESETS[sonarModality];
    onSonarChange(
      runSpaceSonarSimulation({
        ...sonar.request,
        modality: sonarModality,
        rangeM: sonarRangeM,
        txPowerW: preset.defaultTxPowerW,
        apertureM: preset.defaultApertureM,
        bandwidthMHz: preset.defaultBandwidthHz / 1e6,
        integrationMs: preset.defaultIntegrationMs,
        targetReflectivity: preset.defaultTargetReflectivity,
        retroreflector: preset.retroreflectorEnabled,
      })
    );
  };

  const ekfChartData = useMemo(
    () =>
      xnav.ekfHistory.map((e) => ({
        epoch: `E${e.epochIndex} (${e.elapsedSec}s)`,
        posErrorKm: e.positionErrorKm,
        sigma1Km: e.uncertainty1SigmaKm,
        velErrorMS: Number((e.velocityErrorKmS * 1000).toFixed(3)),
        clockBiasUs: e.clockBiasErrorUs,
      })),
    [xnav]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-cyan-400">
            <Compass className="w-3.5 h-3.5" />
            <span>Autonomous Navigation Laboratory</span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-50">
            Autonomous Navigation (XNAV 4-WLS / 8-EKF &amp; Space Sonar)
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Pulsar timing model, 4-state Weighted Least Squares with clock bias &amp; geometry condition number, true 8-state Extended Kalman Filter, and DSN vs XNAV vs Hybrid architecture tradeoffs.
          </p>
        </div>

        <div className="flex gap-1 border border-slate-800 bg-[#090F1D] p-1 font-mono text-xs">
          <button
            type="button"
            onClick={() => setTab('xnav')}
            className={`px-3 py-1.5 cursor-pointer ${tab === 'xnav' ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40' : 'text-slate-400 hover:text-slate-100'}`}
          >
            Pulsar XNAV Solver
          </button>
          <button
            type="button"
            onClick={() => setTab('sonar')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 cursor-pointer ${tab === 'sonar' ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40' : 'text-slate-400 hover:text-slate-100'}`}
          >
            <Radar className="w-3.5 h-3.5" />
            Space Sonar LiDAR / RF
          </button>
        </div>
      </div>

      {tab === 'xnav' ? (
        <div className="space-y-6">
          {xnav.geometryWarning && (
            <div className="flex items-start gap-2.5 border border-amber-500/50 bg-amber-950/30 p-3 text-xs text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-mono text-[10px] font-semibold uppercase text-amber-400">
                  Geometry / Rank-Deficiency Warning
                </div>
                <p className="mt-0.5">{xnav.geometryWarning}</p>
              </div>
            </div>
          )}

          {/* Controls + Geometry Viewport */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <section className="xl:col-span-5 border border-slate-800 bg-[#090F1D] p-4 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h2 className="font-display text-sm font-semibold text-slate-100">
                  Pulsar Constellation &amp; Filter Configuration
                </h2>
                <ProvenanceTag provenance={xnav.provenance} compact />
              </div>

              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {PULSAR_CATALOG.map((p) => {
                  const checked = selectedPulsars.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`flex items-center justify-between border p-2 text-xs cursor-pointer ${
                        checked ? 'border-cyan-500/50 bg-cyan-950/20' : 'border-slate-800 bg-[#060911]'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePulsar(p.id)}
                          className="accent-cyan-400"
                        />
                        <span className="font-medium text-slate-200">{p.commonName}</span>
                      </span>
                      <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                        P={p.periodMs.toFixed(2)}ms · σ={p.timingPrecisionUs}μs
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <label>
                  <span className="font-mono text-[10px] text-slate-400">Obs Time (s)</span>
                  <input
                    type="number"
                    min={60}
                    max={86400}
                    value={obsDurationSec}
                    onChange={(e) => setObsDurationSec(Math.max(60, Number(e.target.value) || 600))}
                    className="mt-1 w-full border border-slate-700 bg-[#060911] px-2 py-1 font-mono text-slate-100 tabular-nums"
                  />
                </label>
                <label>
                  <span className="font-mono text-[10px] text-slate-400">Prior Err (km)</span>
                  <input
                    type="number"
                    min={1}
                    value={guessErrorKm}
                    onChange={(e) => setGuessErrorKm(Math.max(1, Number(e.target.value) || 500))}
                    className="mt-1 w-full border border-slate-700 bg-[#060911] px-2 py-1 font-mono text-slate-100 tabular-nums"
                  />
                </label>
                <label>
                  <span className="font-mono text-[10px] text-slate-400">TOA Noise ×</span>
                  <input
                    type="number"
                    min={0.1}
                    max={10}
                    step={0.1}
                    value={toaNoiseMult}
                    onChange={(e) => setToaNoiseMult(Math.max(0.1, Number(e.target.value) || 1))}
                    className="mt-1 w-full border border-slate-700 bg-[#060911] px-2 py-1 font-mono text-slate-100 tabular-nums"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dsnDisrupted}
                    onChange={(e) => setDsnDisrupted(e.target.checked)}
                    className="accent-amber-400"
                  />
                  <span>Simulate Earth DSN Blackout</span>
                </label>
                <button
                  type="button"
                  onClick={runXnav}
                  className="border border-cyan-500 bg-cyan-500/20 px-3.5 py-1.5 font-mono text-xs font-semibold text-cyan-200 hover:bg-cyan-500/30 cursor-pointer"
                >
                  Run 4-WLS &amp; 8-EKF
                </button>
              </div>
            </section>

            {/* Telemetry Summary + 3D Constellation Viewport */}
            <div className="xl:col-span-7 space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 font-mono tabular-nums">
                <div className="border border-slate-800 bg-[#090F1D] p-3">
                  <span className="text-[10px] text-slate-400">4-STATE WLS ERR</span>
                  <div className="mt-1 text-base font-semibold text-slate-100">
                    {xnav.wlsErrorKm.toFixed(2)} km
                  </div>
                  <div className="text-[10px] text-slate-400">
                    δt_clk={(xnav.wlsClockBiasSec * 1e6).toFixed(2)} μs
                  </div>
                </div>
                <div className="border border-slate-800 bg-[#090F1D] p-3">
                  <span className="text-[10px] text-slate-400">8-STATE EKF ERR</span>
                  <div className="mt-1 text-base font-semibold text-cyan-300">
                    {xnav.ekfErrorKm.toFixed(2)} km
                  </div>
                  <div className="text-[10px] text-slate-400">
                    δv={((xnav.ekfHistory[xnav.ekfHistory.length - 1]?.velocityErrorKmS ?? 0) * 1000).toFixed(2)} m/s
                  </div>
                </div>
                <div className="border border-slate-800 bg-[#090F1D] p-3">
                  <span className="text-[10px] text-slate-400">GDOP / PDOP / TDOP</span>
                  <div className="mt-1 text-base font-semibold text-slate-100">
                    {xnav.rankDeficient ? 'SINGULAR' : xnav.gdop.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    κ(HᵀH) = {xnav.conditionNumber.toFixed(1)}
                  </div>
                </div>
                <div className="border border-slate-800 bg-[#090F1D] p-3">
                  <span className="text-[10px] text-slate-400">CONSISTENCY (NEES)</span>
                  <div className={`mt-1 text-base font-semibold ${xnav.neesConsistent95 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {xnav.nees.toFixed(2)} / 7.82
                  </div>
                  <div className="text-[10px] text-slate-400">
                    RMS res: {xnav.rmsTimingResidualUs.toFixed(2)} μs
                  </div>
                </div>
              </div>

              <div className="h-[270px] border border-slate-800 bg-[#090F1D]">
                <UniverseGpsViewport
                  mode={config.navArchitecture === 'earth-dsn' ? 'DSN' : 'XNAV'}
                  result={xnav}
                  dsnDisrupted={dsnDisrupted}
                />
              </div>
            </div>
          </div>

          {/* 8-State EKF Convergence Chart */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="border border-slate-800 bg-[#090F1D] p-4">
              <h2 className="font-display text-sm font-semibold text-slate-100 mb-3">
                8-State EKF Position Error vs 1σ Uncertainty Envelope (km)
              </h2>
              <div className="h-60 w-full min-w-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={ekfChartData}>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                    <XAxis dataKey="epoch" stroke="#94a3b8" fontSize={10} />
                    <YAxis stroke="#94a3b8" fontSize={11} />
                    <Tooltip contentStyle={{ backgroundColor: '#070B14', borderColor: '#334155', fontSize: 11 }} />
                    <Line type="monotone" dataKey="posErrorKm" stroke="#22d3ee" name="EKF Position Error (km)" strokeWidth={2} />
                    <Line type="monotone" dataKey="sigma1Km" stroke="#f59e0b" name="1σ Covariance Bound (km)" strokeWidth={2} strokeDasharray="4 4" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="border border-slate-800 bg-[#090F1D] p-4">
              <h2 className="font-display text-sm font-semibold text-slate-100 mb-3">
                Architecture Comparison (Ground DSN vs Autonomous XNAV vs Hybrid)
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-[11px] tabular-nums">
                  <thead className="border-b border-slate-800 text-slate-400">
                    <tr>
                      <th className="py-2 pr-2">Architecture</th>
                      <th className="py-2 pr-2">Pos Error</th>
                      <th className="py-2 pr-2">Latency</th>
                      <th className="py-2">Blackout Resilience</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 text-slate-200">
                    {xnav.architectureComparison.map((row) => (
                      <tr key={row.architecture} className={row.architecture === config.navArchitecture ? 'bg-cyan-950/20' : ''}>
                        <td className="py-2 pr-2 font-semibold text-slate-100">{row.label}</td>
                        <td className="py-2 pr-2 text-cyan-300">{row.steadyStatePosErrorKm.toFixed(2)} km</td>
                        <td className="py-2 pr-2">{row.updateLatencySec} s</td>
                        <td className="py-2 text-slate-300">{row.blackoutResilience}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Simplified Pulsar Timing Phase Prediction Table */}
          <div className="border border-slate-800 bg-[#090F1D] p-4">
            <h2 className="font-display text-sm font-semibold text-slate-100 mb-3">
              Pulsar Timing Phase Model: φ(t) = φ₀ + f₀(t − t₀) + ½ ḟ₀(t − t₀)² (TDB / SSB)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-[11px] tabular-nums">
                <thead className="border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="py-2 pr-3">Pulsar</th>
                    <th className="py-2 pr-3">Ref MJD</th>
                    <th className="py-2 pr-3">f₀ (Hz)</th>
                    <th className="py-2 pr-3">ḟ₀ (Hz/s)</th>
                    <th className="py-2 pr-3">Fractional Phase</th>
                    <th className="py-2 pr-3">TOA Residual (μs)</th>
                    <th className="py-2">1σ Noise (μs)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 text-slate-200">
                  {xnav.pulsarObservations.map((obs) => (
                    <tr key={obs.pulsarId}>
                      <td className="py-1.5 pr-3 text-slate-100">{obs.commonName}</td>
                      <td className="py-1.5 pr-3">{obs.phasePrediction.referenceEpochMJD}</td>
                      <td className="py-1.5 pr-3">{obs.phasePrediction.f0Hz.toFixed(4)}</td>
                      <td className="py-1.5 pr-3">{obs.phasePrediction.fDotHzPerS.toExponential(2)}</td>
                      <td className="py-1.5 pr-3 text-cyan-300">{obs.phasePrediction.fractionalPhase.toFixed(5)}</td>
                      <td className="py-1.5 pr-3">{obs.timingResidualUs.toFixed(3)}</td>
                      <td className="py-1.5">±{obs.measurementSigmaUs.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Auxiliary Space Sonar Optical/RF Proximity Ranging Panel */
        <div className="border border-slate-800 bg-[#090F1D] p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-100">
                Space Sonar — Active Proximity LiDAR &amp; Ka-Band Ranging CRLB Benchmark
              </h2>
              <p className="text-xs text-slate-400">
                Computes photon-shot + thermal SNR, Cramér-Rao Lower Bound (CRLB), and 100-trial Monte Carlo NEES verification for close-proximity rendezvous.
              </p>
            </div>
            <ProvenanceTag provenance={sonar.provenance} />
          </div>

          <div className="flex flex-wrap items-end gap-3 text-xs">
            <label>
              <span className="font-mono text-[10px] text-slate-400">Sensor Modality</span>
              <select
                value={sonarModality}
                onChange={(e) => setSonarModality(e.target.value as SpaceSonarModality)}
                className="mt-1 block border border-slate-700 bg-[#060911] px-2.5 py-1.5 text-slate-100"
              >
                {Object.values(SPACE_SONAR_PRESETS).map((pr) => (
                  <option key={pr.id} value={pr.id}>{pr.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="font-mono text-[10px] text-slate-400">Slant Range (m)</span>
              <input
                type="number"
                min={5}
                value={sonarRangeM}
                onChange={(e) => setSonarRangeM(Math.max(5, Number(e.target.value) || 500))}
                className="mt-1 block border border-slate-700 bg-[#060911] px-2.5 py-1.5 font-mono text-slate-100 tabular-nums"
              />
            </label>
            <button
              type="button"
              onClick={runSonar}
              className="border border-cyan-500 bg-cyan-500/20 px-3.5 py-1.5 font-mono text-xs font-semibold text-cyan-200 hover:bg-cyan-500/30 cursor-pointer"
            >
              Run Space Sonar Solver
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 font-mono tabular-nums">
            <div className="border border-slate-800 bg-[#060911] p-3">
              <span className="text-[10px] text-slate-400">LINK SNR (dB)</span>
              <div className="mt-1 text-base font-semibold text-cyan-300">{sonar.linkBudget.snrDb.toFixed(2)} dB</div>
            </div>
            <div className="border border-slate-800 bg-[#060911] p-3">
              <span className="text-[10px] text-slate-400">CRLB RANGE σ_R</span>
              <div className="mt-1 text-base font-semibold text-slate-100">{sonar.linkBudget.crlbRangeSigmaM.toExponential(3)} m</div>
            </div>
            <div className="border border-slate-800 bg-[#060911] p-3">
              <span className="text-[10px] text-slate-400">3D GN POS ERROR</span>
              <div className="mt-1 text-base font-semibold text-emerald-400">{sonar.positionErrorM.toExponential(3)} m</div>
            </div>
            <div className="border border-slate-800 bg-[#060911] p-3">
              <span className="text-[10px] text-slate-400">100-MC MEAN NEES</span>
              <div className="mt-1 text-base font-semibold text-slate-100">{sonar.monteCarloProof.empiricalMeanNees.toFixed(2)} / 3.00</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
