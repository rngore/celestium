import React, { useState } from 'react';
import { ExternalLink, Info, X } from 'lucide-react';
import type { DataClassification, DataProvenance } from '../../shared/types.ts';

const CLASSIFICATION_STYLES: Record<
  DataClassification,
  { glyph: string; textClass: string; label: string }
> = {
  OBSERVED: {
    glyph: '●',
    textClass: 'text-emerald-400',
    label: 'OBSERVED',
  },
  COMPUTED: {
    glyph: '◆',
    textClass: 'text-cyan-400',
    label: 'COMPUTED',
  },
  ESTIMATED: {
    glyph: '▲',
    textClass: 'text-sky-400',
    label: 'ESTIMATED',
  },
  SIMULATED: {
    glyph: '◇',
    textClass: 'text-amber-400',
    label: 'SIMULATED',
  },
};

interface ProvenanceTagProps {
  provenance: DataProvenance;
  valueLabel?: string;
  unit?: string;
  compact?: boolean;
}

export const ProvenanceTag: React.FC<ProvenanceTagProps> = ({
  provenance,
  valueLabel,
  unit,
  compact = false,
}) => {
  const [open, setOpen] = useState(false);
  const style = CLASSIFICATION_STYLES[provenance.classification];

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="Inspect scientific data provenance"
        className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-wide hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 rounded px-1 py-0.5 transition-colors cursor-pointer"
      >
        <span className={style.textClass} aria-hidden="true">
          {style.glyph}
        </span>
        <span className={`font-medium ${style.textClass}`}>{style.label}</span>
        {!compact && (
          <Info className="w-3 h-3 text-slate-500 hover:text-slate-300" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Data Provenance Inspector"
        >
          <div
            className="w-full max-w-lg border border-slate-700 bg-[#0B1120] p-5 text-left shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className={style.textClass}>{style.glyph}</span>
                  <span className={`font-semibold ${style.textClass}`}>
                    {style.label} DATA PROVENANCE
                  </span>
                </div>
                <h3 className="mt-1 font-display text-base font-semibold text-slate-100">
                  Scientific Origin &amp; Uncertainty Record
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400"
                aria-label="Close provenance inspector"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <dl className="mt-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
              {valueLabel && (
                <div className="sm:col-span-2 border border-slate-800 bg-slate-950/60 p-3">
                  <dt className="font-mono text-[11px] text-slate-400">VALUE &amp; UNIT</dt>
                  <dd className="mt-1 font-mono text-sm font-semibold text-slate-100 tabular-nums">
                    {valueLabel} {unit ? <span className="text-slate-400">{unit}</span> : null}
                  </dd>
                </div>
              )}

              <div>
                <dt className="font-mono text-[11px] text-slate-400">SOURCE PROVIDER</dt>
                <dd className="mt-0.5 text-slate-200">{provenance.source}</dd>
              </div>
              <div>
                <dt className="font-mono text-[11px] text-slate-400">CLASSIFICATION</dt>
                <dd className={`mt-0.5 font-mono font-medium ${style.textClass}`}>
                  {style.glyph} {style.label}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[11px] text-slate-400">OBSERVATION EPOCH</dt>
                <dd className="mt-0.5 font-mono text-slate-200 tabular-nums">
                  {provenance.observationEpoch}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[11px] text-slate-400">RETRIEVAL TIME (UTC)</dt>
                <dd className="mt-0.5 font-mono text-slate-200 tabular-nums">
                  {provenance.retrievedAt}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-mono text-[11px] text-slate-400">COORDINATE REFERENCE FRAME</dt>
                <dd className="mt-0.5 font-mono text-slate-200">{provenance.referenceFrame}</dd>
              </div>
              {provenance.uncertainty && (
                <div className="sm:col-span-2">
                  <dt className="font-mono text-[11px] text-slate-400">UNCERTAINTY / ASSUMPTIONS</dt>
                  <dd className="mt-0.5 text-slate-300">{provenance.uncertainty}</dd>
                </div>
              )}
              {provenance.notes && (
                <div className="sm:col-span-2">
                  <dt className="font-mono text-[11px] text-slate-400">ENGINEERING NOTES</dt>
                  <dd className="mt-0.5 text-slate-300">{provenance.notes}</dd>
                </div>
              )}
            </dl>

            <div className="mt-5 flex items-center justify-between border-t border-slate-800 pt-3">
              <a
                href={provenance.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-400 hover:text-cyan-300"
              >
                Open Official Source
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="border border-slate-700 bg-slate-900 px-4 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
