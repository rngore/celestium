import React, { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Terminal } from 'lucide-react';
import {
  buildCommsCsv,
  buildEkfCsv,
  buildTrajectoryCsv,
  generateEngineeringPdfBlob,
} from '../shared/science/reportGenerator.ts';
import type { EngineeringReportPayload } from '../shared/types.ts';

interface ReportsPageProps {
  payload: EngineeringReportPayload;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const ReportsPage: React.FC<ReportsPageProps> = ({ payload }) => {
  const [lastExportMsg, setLastExportMsg] = useState<string | null>(null);

  const slug = payload.missionConfig.missionName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'celestium-mission';

  const handleDownloadPdf = () => {
    const blob = generateEngineeringPdfBlob(payload);
    triggerDownload(blob, `${slug}-engineering-report.pdf`);
    setLastExportMsg(`Exported PDF report (${slug}-engineering-report.pdf)`);
  };

  const handleDownloadTrajectoryCsv = () => {
    const csv = buildTrajectoryCsv(payload);
    triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${slug}-trajectory.csv`);
    setLastExportMsg(`Exported ${payload.propagation.states.length} trajectory epoch rows to CSV`);
  };

  const handleDownloadEkfCsv = () => {
    const csv = buildEkfCsv(payload);
    triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${slug}-xnav-ekf.csv`);
    setLastExportMsg(`Exported 8-state EKF history to CSV`);
  };

  const handleDownloadCommsCsv = () => {
    const csv = buildCommsCsv(payload);
    triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${slug}-comms-link.csv`);
    setLastExportMsg(`Exported communication link time series to CSV`);
  };

  const handleDownloadJson = () => {
    const json = JSON.stringify(
      {
        modelVersion: payload.modelVersion,
        generatedAtIso: payload.generatedAtIso,
        missionConfig: payload.missionConfig,
        summaryMetrics: {
          relativeEnergyDrift: payload.propagation.conservationDiagnostics.relativeEnergyDrift,
          xnavWlsErrorKm: payload.xnav.wlsErrorKm,
          xnavEkfErrorKm: payload.xnav.ekfErrorKm,
          linkMarginDb: payload.communications.summaryAtCurrentRange.linkMarginDb,
        },
      },
      null,
      2
    );
    triggerDownload(new Blob([json], { type: 'application/json' }), `${slug}-config.json`);
    setLastExportMsg(`Exported reproducible scenario config JSON`);
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-cyan-400">
          <FileText className="w-3.5 h-3.5" />
          <span>Reproducible Engineering Artifacts &amp; Data Export</span>
        </div>
        <h1 className="mt-1 font-display text-2xl font-bold text-slate-50">
          Reports &amp; Reproducible Exports
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          Generate traceable engineering PDF summaries, RFC-4180 CSV time-series datasets, or download the standalone zero-dependency Python CLI executor configured for these exact scenario JSON exports.
        </p>
      </div>

      {/* Export Action Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <button
          type="button"
          onClick={handleDownloadPdf}
          className="flex flex-col items-start gap-2 border border-cyan-500/60 bg-cyan-500/15 p-3.5 text-left hover:bg-cyan-500/25 cursor-pointer"
        >
          <Download className="w-4 h-4 text-cyan-300" />
          <div className="font-display text-sm font-semibold text-cyan-100">Download PDF Report</div>
          <span className="font-mono text-[10px] text-cyan-300/80">Multi-section technical summary</span>
        </button>

        <button
          type="button"
          onClick={handleDownloadTrajectoryCsv}
          className="flex flex-col items-start gap-2 border border-slate-700 bg-[#090F1D] p-3.5 text-left hover:border-cyan-500/50 cursor-pointer"
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
          <div className="font-display text-sm font-semibold text-slate-100">Trajectory CSV</div>
          <span className="font-mono text-[10px] text-slate-400">{payload.propagation.states.length} epoch states (r, v, ε, h)</span>
        </button>

        <button
          type="button"
          onClick={handleDownloadEkfCsv}
          className="flex flex-col items-start gap-2 border border-slate-700 bg-[#090F1D] p-3.5 text-left hover:border-cyan-500/50 cursor-pointer"
        >
          <FileSpreadsheet className="w-4 h-4 text-sky-400" />
          <div className="font-display text-sm font-semibold text-slate-100">8-State EKF CSV</div>
          <span className="font-mono text-[10px] text-slate-400">Pos, vel, clock bias &amp; 1σ trace</span>
        </button>

        <button
          type="button"
          onClick={handleDownloadCommsCsv}
          className="flex flex-col items-start gap-2 border border-slate-700 bg-[#090F1D] p-3.5 text-left hover:border-cyan-500/50 cursor-pointer"
        >
          <FileSpreadsheet className="w-4 h-4 text-amber-400" />
          <div className="font-display text-sm font-semibold text-slate-100">Link Budget CSV</div>
          <span className="font-mono text-[10px] text-slate-400">FSPL, C/N₀, Eb/N₀, visibility</span>
        </button>

        <button
          type="button"
          onClick={handleDownloadJson}
          className="flex flex-col items-start gap-2 border border-slate-700 bg-[#090F1D] p-3.5 text-left hover:border-cyan-500/50 cursor-pointer"
        >
          <Download className="w-4 h-4 text-slate-300" />
          <div className="font-display text-sm font-semibold text-slate-100">Scenario JSON</div>
          <span className="font-mono text-[10px] text-slate-400">Reproducible seed &amp; parameters</span>
        </button>
      </div>

      {/* Standalone Python CLI Package Download */}
      <section className="border border-cyan-500/40 bg-[#090F1D] p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-3.5">
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-cyan-400">
              <Terminal className="w-3.5 h-3.5" />
              <span>Standalone Command-Line Executor · Python 3.10+ (Zero External Dependencies)</span>
            </div>
            <h2 className="mt-1 font-display text-lg font-bold text-slate-100">
              CELESTIUM Python CLI Project Archive (`celestium-python-cli.zip`)
            </h2>
            <p className="mt-1 text-xs text-slate-400 max-w-3xl">
              Includes modular solvers (`orbital.py`, `xnav.py`, `communications.py`, `space_sonar.py`, `sources.py`, `scenarios.py`, `cli.py`), live NASA/JPL Horizons API fetcher, ATNF/NICER pulsar &amp; ISRO/NASA spacecraft catalogs, `unittest` suite, and full website Scenario JSON compatibility.
            </p>
          </div>
          <a
            href="/api/downloads/celestium-cli.zip"
            download="celestium-python-cli.zip"
            onClick={() => setLastExportMsg('Downloading Python CLI project archive (celestium-python-cli.zip)')}
            className="inline-flex shrink-0 items-center gap-2 border border-cyan-500 bg-cyan-500/20 px-4 py-2.5 font-mono text-xs font-semibold text-cyan-100 hover:bg-cyan-500/30"
          >
            <Download className="w-4 h-4 text-cyan-300" />
            Download Python CLI (.zip)
          </a>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 font-mono text-[11px]">
          <div className="border border-slate-800 bg-[#060911] p-3">
            <div className="text-[10px] text-slate-500 uppercase">1. Run Benchmark Pipeline</div>
            <div className="mt-1 text-cyan-300 break-all">python3 run_celestium.py run --scenario {payload.missionConfig.scenarioId}</div>
          </div>
          <div className="border border-slate-800 bg-[#060911] p-3">
            <div className="text-[10px] text-slate-500 uppercase">2. Replay Exported Website JSON</div>
            <div className="mt-1 text-emerald-300 break-all">python3 run_celestium.py run --config {slug}-config.json --csv-dir ./exports</div>
          </div>
          <div className="border border-slate-800 bg-[#060911] p-3">
            <div className="text-[10px] text-slate-500 uppercase">3. Live JPL Horizons &amp; Interactive Mode</div>
            <div className="mt-1 text-amber-300 break-all">python3 run_celestium.py interactive</div>
          </div>
        </div>
      </section>

      {lastExportMsg && (
        <div className="border border-emerald-500/40 bg-emerald-950/25 px-3.5 py-2 font-mono text-xs text-emerald-300">
          ● {lastExportMsg}
        </div>
      )}

      {/* Reproducible Report Preview */}
      <section className="border border-slate-800 bg-[#090F1D] p-5 space-y-5 font-mono text-xs tabular-nums">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <div className="text-[10px] text-cyan-400">REPRODUCIBLE RUN MANIFEST</div>
            <h2 className="font-display text-lg font-bold text-slate-100 mt-0.5">
              {payload.missionConfig.missionName} — {payload.missionConfig.spacecraftName}
            </h2>
          </div>
          <div className="text-right text-[11px] text-slate-400">
            <div>Model v{payload.modelVersion} · Seed {payload.missionConfig.seed}</div>
            <div>Timestamp: {payload.generatedAtIso}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="border border-slate-800 bg-[#060911] p-3.5 space-y-1.5">
            <div className="text-[10px] text-slate-400 uppercase">Initial State &amp; Force Model</div>
            <div>Central Body: {payload.missionConfig.centralBody.toUpperCase()} ({payload.propagation.referenceFrame})</div>
            <div>Epoch / Duration: {payload.missionConfig.epochIso} (+{payload.missionConfig.durationDays} days)</div>
            <div>r₀ = [{payload.missionConfig.initialPositionKm.x.toExponential(4)}, {payload.missionConfig.initialPositionKm.y.toExponential(4)}, {payload.missionConfig.initialPositionKm.z.toExponential(4)}] km</div>
            <div>v₀ = [{payload.missionConfig.initialVelocityKmS.x.toFixed(5)}, {payload.missionConfig.initialVelocityKmS.y.toFixed(5)}, {payload.missionConfig.initialVelocityKmS.z.toFixed(5)}] km/s</div>
            <div>Integrator: {payload.propagation.integratorUsed.toUpperCase()} ({payload.propagation.totalSteps} steps)</div>
          </div>

          <div className="border border-slate-800 bg-[#060911] p-3.5 space-y-1.5">
            <div className="text-[10px] text-slate-400 uppercase">Verification &amp; Summary Outputs</div>
            <div className="text-emerald-400">Energy Drift |Δε/ε₀|: {payload.propagation.conservationDiagnostics.relativeEnergyDrift.toExponential(3)}</div>
            <div>Step Sensitivity Δr: {payload.propagation.stepSensitivityCheck.finalPositionDiffKm.toExponential(3)} km</div>
            <div>4-State WLS Error: {payload.xnav.wlsErrorKm.toFixed(3)} km (κ={payload.xnav.conditionNumber.toFixed(1)})</div>
            <div className="text-cyan-300">8-State EKF Error: {payload.xnav.ekfErrorKm.toFixed(3)} km (±{payload.xnav.uncertainty1SigmaKm.toFixed(3)} km 1σ)</div>
            <div>Final RF Margin: {payload.communications.summaryAtCurrentRange.linkMarginDb.toFixed(2)} dB (1-way LT: {payload.communications.summaryAtCurrentRange.oneWayLightTimeSec.toFixed(2)} s)</div>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-3">
          <div className="text-[10px] text-amber-400 uppercase mb-1.5">Included Provenance &amp; Limitations Summary</div>
          <ul className="space-y-1 text-[11px] text-slate-400">
            {payload.inspections.map((ins) => (
              <li key={ins.modelId}>
                [{ins.provenance.classification}] <span className="text-slate-200">{ins.name}</span> — {ins.limitations[0]}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
};
