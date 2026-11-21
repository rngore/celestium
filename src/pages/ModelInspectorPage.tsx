import React, { useState } from 'react';
import { BookOpen, CheckCircle2, ShieldAlert } from 'lucide-react';
import { ProvenanceTag } from '../components/common/ProvenanceTag.tsx';
import type { ModelInspectionRecord } from '../shared/types.ts';

interface ModelInspectorPageProps {
  inspections: ModelInspectionRecord[];
}

export const ModelInspectorPage: React.FC<ModelInspectorPageProps> = ({ inspections }) => {
  const [selectedModelId, setSelectedModelId] = useState<string>(
    inspections[0]?.modelId ?? 'numerical-orbit-propagator'
  );

  const active =
    inspections.find((m) => m.modelId === selectedModelId) ?? inspections[0];

  if (!active) {
    return (
      <div className="border border-slate-800 bg-[#090F1D] p-6 text-xs text-slate-400">
        No solver inspection records loaded yet. Run any calculation from the Mission Workbench.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-cyan-400">
          <BookOpen className="w-3.5 h-3.5" />
          <span>White-Box Scientific Audit &amp; Intermediate Calculation Inspector</span>
        </div>
        <h1 className="mt-1 font-display text-2xl font-bold text-slate-50">
          Model Inspector
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          Every numerical solver emits live intermediate steps, governing equations, variable units, assumptions, limitations, and Vitest validation backing directly from the active computation.
        </p>
      </div>

      {/* Model Selector Strip */}
      <div className="flex flex-wrap gap-2">
        {inspections.map((rec) => {
          const isSel = rec.modelId === active.modelId;
          return (
            <button
              key={rec.modelId}
              type="button"
              onClick={() => setSelectedModelId(rec.modelId)}
              className={`border px-3 py-2 text-left font-mono text-xs cursor-pointer transition-colors ${
                isSel
                  ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200'
                  : 'border-slate-800 bg-[#090F1D] text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="text-[10px] text-slate-400">{rec.category.toUpperCase()}</div>
              <div className="font-semibold">{rec.name}</div>
            </button>
          );
        })}
      </div>

      {/* Active Inspection Card */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7 space-y-5">
          {/* Header & Validation Status */}
          <section className="border border-slate-800 bg-[#090F1D] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-100">{active.name}</h2>
                <div className="mt-1 flex items-center gap-2 font-mono text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">{active.validationStatus}</span>
                  <span className="text-slate-500">·</span>
                  <span className="text-slate-400">{active.validationReference}</span>
                </div>
              </div>
              <ProvenanceTag provenance={active.provenance} />
            </div>

            <div>
              <h3 className="font-mono text-[11px] uppercase text-cyan-400 mb-2">Governing Equations</h3>
              <div className="space-y-1.5">
                {active.governingEquations.map((eq, i) => (
                  <div
                    key={i}
                    className="border border-slate-800 bg-[#060911] px-3 py-2 font-mono text-xs text-slate-100"
                  >
                    {eq}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-mono text-[11px] uppercase text-cyan-400 mb-2">
                Live Computed Intermediate Steps (From Current Run)
              </h3>
              <div className="space-y-2">
                {active.intermediateSteps.map((step) => (
                  <div
                    key={step.stepIndex}
                    className="border border-slate-800 bg-[#060911] p-3 font-mono text-xs"
                  >
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>STEP {step.stepIndex}: {step.label}</span>
                      <span>{step.expression}</span>
                    </div>
                    <div className="mt-1 text-cyan-300 font-semibold tabular-nums">
                      {step.value} {step.unit ?? ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Variable Dictionary */}
          <section className="border border-slate-800 bg-[#090F1D] p-4">
            <h3 className="font-mono text-[11px] uppercase text-cyan-400 mb-2">
              Variable Definitions &amp; Physical Units
            </h3>
            <table className="w-full text-left font-mono text-xs">
              <thead className="border-b border-slate-800 text-[10px] text-slate-400">
                <tr>
                  <th className="py-1.5 pr-3">Symbol</th>
                  <th className="py-1.5 pr-3">Quantity</th>
                  <th className="py-1.5 pr-3">Unit</th>
                  <th className="py-1.5">Meaning</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-slate-200">
                {active.variables.map((v) => (
                  <tr key={v.symbol}>
                    <td className="py-1.5 pr-3 font-semibold text-cyan-300">{v.symbol}</td>
                    <td className="py-1.5 pr-3">{v.name}</td>
                    <td className="py-1.5 pr-3 text-slate-400">{v.unit}</td>
                    <td className="py-1.5 text-slate-400">{v.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <div className="lg:col-span-5 space-y-5">
          {/* Active Inputs */}
          <section className="border border-slate-800 bg-[#090F1D] p-4">
            <h3 className="font-mono text-[11px] uppercase text-cyan-400 mb-2">
              Active User Inputs
            </h3>
            <dl className="divide-y divide-slate-800/70 font-mono text-xs tabular-nums">
              {Object.entries(active.inputs).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 py-1.5">
                  <dt className="text-slate-400">{k}</dt>
                  <dd className="text-right text-slate-100">{String(v)}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Final Outputs */}
          <section className="border border-slate-800 bg-[#090F1D] p-4">
            <h3 className="font-mono text-[11px] uppercase text-emerald-400 mb-2">
              Final Computed Outputs
            </h3>
            <dl className="divide-y divide-slate-800/70 font-mono text-xs tabular-nums">
              {Object.entries(active.finalOutputs).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 py-1.5">
                  <dt className="text-slate-400">{k}</dt>
                  <dd className="text-right font-semibold text-emerald-300">{String(v)}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Assumptions & Limitations */}
          <section className="border border-slate-800 bg-[#090F1D] p-4 space-y-3 text-xs">
            <div>
              <h3 className="font-mono text-[11px] uppercase text-slate-300 mb-1.5">
                Engineering Assumptions
              </h3>
              <ul className="list-disc pl-4 space-y-1 text-slate-400">
                {active.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>

            <div className="border-t border-slate-800 pt-3">
              <h3 className="flex items-center gap-1.5 font-mono text-[11px] uppercase text-amber-400 mb-1.5">
                <ShieldAlert className="w-3.5 h-3.5" />
                Known Model Limitations
              </h3>
              <ul className="list-disc pl-4 space-y-1 text-slate-400">
                {active.limitations.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
