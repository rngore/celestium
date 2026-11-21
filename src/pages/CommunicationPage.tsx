import React from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Radio } from 'lucide-react';
import { ProvenanceTag } from '../components/common/ProvenanceTag.tsx';
import { formatLightTime } from '../shared/science/physics.ts';
import { formatDistanceByUnit } from '../shared/science/units.ts';
import type {
  CommAnalysisResult,
  MissionConfig,
  UnitDisplayMode,
} from '../shared/types.ts';

interface CommunicationPageProps {
  config: MissionConfig;
  unitMode: UnitDisplayMode;
  comms: CommAnalysisResult;
  onConfigChange: (next: MissionConfig) => void;
}

export const CommunicationPage: React.FC<CommunicationPageProps> = ({
  config,
  unitMode,
  comms,
  onConfigChange,
}) => {
  const cc = config.commConfig;
  const setComm = (patch: Partial<typeof cc>) => {
    onConfigChange({
      ...config,
      commConfig: { ...cc, ...patch },
    });
  };

  const cur = comms.summaryAtCurrentRange;
  const distFmt = formatDistanceByUnit(cur.rangeKm, unitMode);

  const chartData = comms.timeSeries.map((pt) => ({
    day: Number(pt.elapsedDays.toFixed(2)),
    marginDb: Number(pt.linkMarginDb.toFixed(2)),
    lightTimeSec: Number(pt.oneWayLightTimeSec.toFixed(2)),
    fsplDb: Number(pt.fsplDb.toFixed(2)),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-cyan-400">
            <Radio className="w-3.5 h-3.5" />
            <span>Deep-Space RF / Optical Link &amp; Visibility Engineering</span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-50">
            Communication Analysis
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Light-time delay (R/c, 2R/c), Free-Space Path Loss, Friis link budget (C/N₀, E_b/N₀, Link Margin), and geometric Earth occultation / solar conjunction visibility along the propagated trajectory.
          </p>
        </div>
        <ProvenanceTag provenance={comms.inspection.provenance} />
      </div>

      {/* Live Key Link Budget Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 font-mono tabular-nums">
        <div className="border border-slate-800 bg-[#090F1D] p-3.5">
          <span className="text-[10px] text-slate-400">FINAL SLANT RANGE R</span>
          <div className="mt-1 text-base font-semibold text-slate-100">
            {distFmt.value} {distFmt.unit}
          </div>
          <div className="text-[10px] text-slate-400">{cur.rangeAU.toFixed(4)} AU</div>
        </div>
        <div className="border border-slate-800 bg-[#090F1D] p-3.5">
          <span className="text-[10px] text-slate-400">1-WAY / ROUND-TRIP DELAY</span>
          <div className="mt-1 text-base font-semibold text-cyan-300">
            {formatLightTime(cur.oneWayLightTimeSec)} / {formatLightTime(cur.roundTripLightTimeSec)}
          </div>
          <div className="text-[10px] text-slate-400">
            {cur.oneWayLightTimeSec.toFixed(2)} s 1-way
          </div>
        </div>
        <div className="border border-slate-800 bg-[#090F1D] p-3.5">
          <span className="text-[10px] text-slate-400">FSPL / C/N₀</span>
          <div className="mt-1 text-base font-semibold text-slate-100">
            {cur.fsplDb.toFixed(2)} dB · {cur.cn0DbHz.toFixed(1)} dB-Hz
          </div>
          <div className="text-[10px] text-slate-400">
            Rx P_r = {cur.receivedPowerDbw.toFixed(2)} dBW
          </div>
        </div>
        <div className="border border-slate-800 bg-[#090F1D] p-3.5">
          <span className="text-[10px] text-slate-400">E_b/N₀ &amp; LINK MARGIN</span>
          <div
            className={`mt-1 text-base font-semibold ${
              cur.linkMarginDb >= 3 ? 'text-emerald-400' : cur.linkMarginDb >= 0 ? 'text-amber-400' : 'text-rose-400'
            }`}
          >
            {cur.linkMarginDb.toFixed(2)} dB
          </div>
          <div className="text-[10px] text-slate-400">
            E_b/N₀={cur.ebN0Db.toFixed(2)} vs Req {cc.requiredEbN0Db.toFixed(1)} dB
          </div>
        </div>
      </div>

      {/* Inputs + Full Link Budget Equation Table */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="lg:col-span-5 border border-slate-800 bg-[#090F1D] p-4 space-y-3 text-xs">
          <h2 className="font-display text-sm font-semibold text-slate-100 border-b border-slate-800 pb-2">
            RF / Optical Terminal Parameters
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="font-mono text-[10px] text-slate-400">Carrier Freq f (GHz)</span>
              <input
                type="number"
                step="0.05"
                min={0.1}
                value={cc.frequencyGHz}
                onChange={(e) => setComm({ frequencyGHz: Math.max(0.1, Number(e.target.value) || 8.4) })}
                className="mt-1 w-full border border-slate-700 bg-[#060911] px-2.5 py-1.5 font-mono text-slate-100 tabular-nums"
              />
            </label>
            <label>
              <span className="font-mono text-[10px] text-slate-400">Tx Power P_t (W)</span>
              <input
                type="number"
                step="1"
                min={0.1}
                value={cc.txPowerW}
                onChange={(e) => setComm({ txPowerW: Math.max(0.1, Number(e.target.value) || 10) })}
                className="mt-1 w-full border border-slate-700 bg-[#060911] px-2.5 py-1.5 font-mono text-slate-100 tabular-nums"
              />
            </label>
            <label>
              <span className="font-mono text-[10px] text-slate-400">Tx Gain G_t (dBi)</span>
              <input
                type="number"
                step="0.5"
                value={cc.txAntennaGainDbi}
                onChange={(e) => setComm({ txAntennaGainDbi: Number(e.target.value) || 0 })}
                className="mt-1 w-full border border-slate-700 bg-[#060911] px-2.5 py-1.5 font-mono text-slate-100 tabular-nums"
              />
            </label>
            <label>
              <span className="font-mono text-[10px] text-slate-400">Rx Gain G_r (dBi)</span>
              <input
                type="number"
                step="0.5"
                value={cc.rxAntennaGainDbi}
                onChange={(e) => setComm({ rxAntennaGainDbi: Number(e.target.value) || 0 })}
                className="mt-1 w-full border border-slate-700 bg-[#060911] px-2.5 py-1.5 font-mono text-slate-100 tabular-nums"
              />
            </label>
            <label>
              <span className="font-mono text-[10px] text-slate-400">System Losses L_sys (dB)</span>
              <input
                type="number"
                step="0.2"
                min={0}
                value={cc.systemLossesDb}
                onChange={(e) => setComm({ systemLossesDb: Math.max(0, Number(e.target.value) || 0) })}
                className="mt-1 w-full border border-slate-700 bg-[#060911] px-2.5 py-1.5 font-mono text-slate-100 tabular-nums"
              />
            </label>
            <label>
              <span className="font-mono text-[10px] text-slate-400">Noise Temp T_sys (K)</span>
              <input
                type="number"
                step="1"
                min={5}
                value={cc.systemNoiseTempK}
                onChange={(e) => setComm({ systemNoiseTempK: Math.max(5, Number(e.target.value) || 35) })}
                className="mt-1 w-full border border-slate-700 bg-[#060911] px-2.5 py-1.5 font-mono text-slate-100 tabular-nums"
              />
            </label>
            <label>
              <span className="font-mono text-[10px] text-slate-400">Data Rate R_b (bps)</span>
              <input
                type="number"
                step="100"
                min={1}
                value={cc.dataRateBps}
                onChange={(e) => setComm({ dataRateBps: Math.max(1, Number(e.target.value) || 1000) })}
                className="mt-1 w-full border border-slate-700 bg-[#060911] px-2.5 py-1.5 font-mono text-slate-100 tabular-nums"
              />
            </label>
            <label>
              <span className="font-mono text-[10px] text-slate-400">Required E_b/N₀ (dB)</span>
              <input
                type="number"
                step="0.2"
                value={cc.requiredEbN0Db}
                onChange={(e) => setComm({ requiredEbN0Db: Number(e.target.value) || 0 })}
                className="mt-1 w-full border border-slate-700 bg-[#060911] px-2.5 py-1.5 font-mono text-slate-100 tabular-nums"
              />
            </label>
          </div>

          <div className="border-t border-slate-800 pt-3 font-mono text-[11px] text-slate-300 space-y-1 tabular-nums">
            <div className="flex justify-between"><span>Tx Power (dBW):</span><span>{comms.txPowerDbw.toFixed(2)} dBW</span></div>
            <div className="flex justify-between"><span>EIRP = P_t + G_t:</span><span>{comms.eirpDbw.toFixed(2)} dBW</span></div>
            <div className="flex justify-between"><span>Noise Density N₀ = 10 log₁₀(k T_sys):</span><span>{comms.noiseSpectralDensityDbwHz.toFixed(2)} dBW/Hz</span></div>
            <div className="flex justify-between text-amber-300">
              <span>Geometric Visibility Diagnostics:</span>
              <span>{comms.occultedPointsCount} occulted · {comms.conjunctionRiskPointsCount} conj. risk</span>
            </div>
          </div>
        </section>

        <section className="lg:col-span-7 space-y-4">
          <div className="border border-slate-800 bg-[#090F1D] p-4">
            <h2 className="font-display text-sm font-semibold text-slate-100 mb-3">
              Link Margin (dB) Across Propagated Trajectory
            </h2>
            <div className="h-56 w-full min-w-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <Tooltip contentStyle={{ backgroundColor: '#070B14', borderColor: '#334155', fontSize: 11 }} />
                  <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="marginDb" stroke="#10b981" dot={false} name="Link Margin (dB)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="border border-slate-800 bg-[#090F1D] p-4">
            <h2 className="font-display text-sm font-semibold text-slate-100 mb-3">
              One-Way Light Time (s) vs Elapsed Days (Geometric Visibility)
            </h2>
            <div className="h-52 w-full min-w-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#22d3ee" fontSize={11} />
                  <Tooltip contentStyle={{ backgroundColor: '#070B14', borderColor: '#334155', fontSize: 11 }} />
                  <Line type="monotone" dataKey="lightTimeSec" stroke="#22d3ee" dot={false} name="One-Way Light Time (s)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
