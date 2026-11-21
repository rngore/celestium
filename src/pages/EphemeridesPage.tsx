import React, { useState } from 'react';
import { Globe, Pause, Play, RefreshCw, RotateCcw } from 'lucide-react';
import { ProvenanceTag } from '../components/common/ProvenanceTag.tsx';
import { SolarSystemViewport } from '../components/three/SolarSystemViewport.tsx';
import { formatLightTime } from '../shared/science/physics.ts';
import type { DataSourceStatus, SolarSystemSnapshot } from '../shared/types.ts';

interface EphemeridesPageProps {
  snapshot: SolarSystemSnapshot;
  sources: DataSourceStatus[];
  selectedId: string | null;
  loading: boolean;
  onSelectId: (id: string | null) => void;
  onDateChange: (dateIso: string) => void;
  onRefreshEphemeris: () => void;
}

export const EphemeridesPage: React.FC<EphemeridesPageProps> = ({
  snapshot,
  sources,
  selectedId,
  loading,
  onSelectId,
  onDateChange,
  onRefreshEphemeris,
}) => {
  const [dateInput, setDateInput] = useState(snapshot.requestedDate);
  const [agencyFilter, setAgencyFilter] = useState<'ALL' | 'ISRO' | 'INTERNATIONAL'>('ALL');
  const [showOrbits, setShowOrbits] = useState(true);
  const [isPaused, setIsPaused] = useState(true);
  const [speedDaysPerSec, setSpeedDaysPerSec] = useState(10);
  const [resetTrigger, setResetTrigger] = useState(0);

  const selectedSpacecraft = snapshot.spacecraft.find((s) => s.id === selectedId) ?? null;
  const selectedBody = snapshot.bodies.find((b) => b.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-cyan-400">
            <Globe className="w-3.5 h-3.5" />
            <span>JPL Horizons Ephemerides &amp; Verified Spacecraft Catalog</span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-50">
            Spacecraft &amp; Ephemerides
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Live NASA/JPL Horizons heliocentric ecliptic J2000 state vectors with explicit reference epoch vs validity epoch tracking and provenance classification.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input
            type="date"
            value={dateInput}
            onChange={(e) => {
              setDateInput(e.target.value);
              if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) {
                onDateChange(e.target.value);
              }
            }}
            aria-label="Ephemeris query epoch"
            className="border border-slate-700 bg-[#090F1D] px-2.5 py-1.5 font-mono text-slate-100"
          />
          <button
            type="button"
            onClick={onRefreshEphemeris}
            disabled={loading}
            className="inline-flex items-center gap-1.5 border border-cyan-500/60 bg-cyan-500/20 px-3 py-1.5 font-mono text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Sync Horizons
          </button>
        </div>
      </div>

      {/* 3D Heliocentric System + Selection Inspector */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="xl:col-span-8 border border-slate-800 bg-[#090F1D]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3.5 py-2 font-mono text-[11px]">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPaused((p) => !p)}
                className="inline-flex items-center gap-1 border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-1 text-cyan-200 cursor-pointer"
              >
                {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                {isPaused ? 'Play' : 'Pause'}
              </button>
              <label className="inline-flex items-center gap-1 text-slate-300">
                <span>Speed:</span>
                <select
                  value={speedDaysPerSec}
                  onChange={(e) => setSpeedDaysPerSec(Number(e.target.value))}
                  className="border border-slate-700 bg-[#060911] px-1.5 py-0.5 text-slate-100"
                >
                  <option value={1}>1 d/s</option>
                  <option value={10}>10 d/s</option>
                  <option value={45}>45 d/s</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => setShowOrbits((o) => !o)}
                className={`border px-2 py-1 cursor-pointer ${showOrbits ? 'border-cyan-400 text-cyan-300' : 'border-slate-700 text-slate-400'}`}
              >
                Orbits: {showOrbits ? 'ON' : 'OFF'}
              </button>
              <button
                type="button"
                onClick={() => setResetTrigger((t) => t + 1)}
                className="inline-flex items-center gap-1 border border-slate-700 px-2 py-1 text-slate-300 hover:text-white cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            </div>

            <div className="flex gap-1">
              {(['ALL', 'ISRO', 'INTERNATIONAL'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setAgencyFilter(f)}
                  className={`border px-2 py-0.5 cursor-pointer ${
                    agencyFilter === f ? 'border-cyan-400 text-cyan-300 bg-cyan-950/30' : 'border-slate-700 text-slate-400'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[380px] w-full">
            <SolarSystemViewport
              snapshot={snapshot}
              selectedId={selectedId}
              showOrbits={showOrbits}
              agencyFilter={agencyFilter}
              simulationSpeedDaysPerSec={speedDaysPerSec}
              isPaused={isPaused}
              resetTrigger={resetTrigger}
              onSelectObject={(_type, id) => onSelectId(id)}
            />
          </div>
        </div>

        {/* Selected Spacecraft / Body Detail Inspector */}
        <section className="xl:col-span-4 border border-slate-800 bg-[#090F1D] p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h2 className="font-display text-sm font-semibold text-slate-100">
              {selectedSpacecraft?.name ?? selectedBody?.name ?? 'Select an Asset'}
            </h2>
            {selectedSpacecraft && <ProvenanceTag provenance={selectedSpacecraft.provenance} compact />}
            {selectedBody && <ProvenanceTag provenance={selectedBody.provenance} compact />}
          </div>

          {selectedSpacecraft ? (
            <div className="space-y-2.5 text-xs">
              <div className="font-mono text-[11px] text-cyan-300">
                {selectedSpacecraft.agency} · NAIF {selectedSpacecraft.naifId ?? 'N/A'} · {selectedSpacecraft.missionStatus}
              </div>
              <p className="text-slate-300 leading-relaxed">{selectedSpacecraft.description}</p>
              <dl className="grid grid-cols-2 gap-2 border-t border-slate-800 pt-2.5 font-mono text-[11px] tabular-nums">
                <div><dt className="text-slate-500">Reference Epoch</dt><dd>{selectedSpacecraft.provenance.observationEpoch.slice(0, 10)}</dd></div>
                <div><dt className="text-slate-500">Validity / Freshness</dt><dd>{selectedSpacecraft.freshnessLabel}</dd></div>
                <div><dt className="text-slate-500">Earth Distance</dt><dd>{selectedSpacecraft.state.distanceFromEarthAU.toFixed(4)} AU</dd></div>
                <div><dt className="text-slate-500">1-Way Light Time</dt><dd>{formatLightTime(selectedSpacecraft.state.oneWayLightTimeSec)}</dd></div>
                <div className="col-span-2">
                  <dt className="text-slate-500">Position (AU, Ecliptic J2000)</dt>
                  <dd className="text-slate-200">
                    [{selectedSpacecraft.state.positionAU.x.toFixed(5)}, {selectedSpacecraft.state.positionAU.y.toFixed(5)}, {selectedSpacecraft.state.positionAU.z.toFixed(5)}]
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-slate-500">Heliocentric Speed</dt>
                  <dd className="text-emerald-400">{selectedSpacecraft.state.speedKmPerSec.toFixed(3)} km/s</dd>
                </div>
              </dl>
            </div>
          ) : selectedBody ? (
            <dl className="grid grid-cols-2 gap-2 font-mono text-[11px] tabular-nums">
              <div><dt className="text-slate-500">NAIF ID</dt><dd>{selectedBody.naifId}</dd></div>
              <div><dt className="text-slate-500">Sun Distance</dt><dd>{selectedBody.state.distanceFromSunAU.toFixed(4)} AU</dd></div>
              <div><dt className="text-slate-500">Earth Distance</dt><dd>{selectedBody.state.distanceFromEarthAU.toFixed(4)} AU</dd></div>
              <div><dt className="text-slate-500">1-Way Light Time</dt><dd>{formatLightTime(selectedBody.state.oneWayLightTimeSec)}</dd></div>
            </dl>
          ) : (
            <p className="text-xs text-slate-400">Click a spacecraft or planet in the 3D scene or catalog table below.</p>
          )}
        </section>
      </div>

      {/* Mission Catalog Table */}
      <section className="border border-slate-800 bg-[#090F1D] p-4">
        <h2 className="font-display text-sm font-semibold text-slate-100 mb-3">
          Tracked Deep-Space Assets ({snapshot.spacecraft.length}) — Reference Epoch vs Validity Epoch
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-[11px] tabular-nums">
            <thead className="border-b border-slate-800 text-slate-400">
              <tr>
                <th className="py-2 pr-3">Spacecraft</th>
                <th className="py-2 pr-3">Agency / NAIF</th>
                <th className="py-2 pr-3">Distance from Earth</th>
                <th className="py-2 pr-3">1-Way Delay</th>
                <th className="py-2 pr-3">Validity / Freshness</th>
                <th className="py-2">Provenance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-slate-200">
              {snapshot.spacecraft.map((sc) => (
                <tr
                  key={sc.id}
                  onClick={() => onSelectId(sc.id)}
                  className={`cursor-pointer hover:bg-slate-900/60 ${selectedId === sc.id ? 'bg-cyan-950/25' : ''}`}
                >
                  <td className="py-2 pr-3 font-semibold text-slate-100">{sc.name}</td>
                  <td className="py-2 pr-3 text-slate-400">{sc.agency} ({sc.naifId ?? 'Catalog'})</td>
                  <td className="py-2 pr-3">{sc.state.distanceFromEarthAU.toFixed(4)} AU</td>
                  <td className="py-2 pr-3 text-cyan-300">{formatLightTime(sc.state.oneWayLightTimeSec)}</td>
                  <td className="py-2 pr-3 text-slate-300">{sc.freshnessLabel}</td>
                  <td className="py-2"><ProvenanceTag provenance={sc.provenance} compact /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* External Provider Status */}
      {sources.length > 0 && (
        <section className="border border-slate-800 bg-[#090F1D] p-4">
          <h2 className="font-display text-sm font-semibold text-slate-100 mb-3">
            Connected Ephemeris &amp; Reference Providers
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {sources.map((src) => (
              <div key={src.id} className="border border-slate-800 bg-[#060911] p-3 text-xs">
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <span className="font-semibold text-slate-100">{src.provider}</span>
                  <span className={src.status === 'CONNECTED' || src.status === 'STATIC_VERIFIED' ? 'text-emerald-400' : 'text-amber-400'}>
                    {src.status}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">{src.notes}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
