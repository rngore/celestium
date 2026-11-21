import React from 'react';

interface CelestiumLogoProps {
  compact?: boolean;
  className?: string;
}

export const CelestiumLogo: React.FC<CelestiumLogoProps> = ({ compact = false, className = '' }) => {
  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <svg
        width={compact ? 26 : 30}
        height={compact ? 26 : 30}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <circle cx="18" cy="18" r="15.5" stroke="#1E293B" strokeWidth="1.2" />
        <ellipse
          cx="18"
          cy="18"
          rx="14"
          ry="5.5"
          transform="rotate(-28 18 18)"
          stroke="#22D3EE"
          strokeWidth="1.4"
          strokeOpacity="0.85"
        />
        <ellipse
          cx="18"
          cy="18"
          rx="14"
          ry="5.5"
          transform="rotate(32 18 18)"
          stroke="#38BDF8"
          strokeWidth="1.2"
          strokeOpacity="0.55"
        />
        {/* Pulsar timing crosshair rays */}
        <line x1="18" y1="3" x2="18" y2="9" stroke="#F8FAFC" strokeWidth="1.3" strokeLinecap="round" />
        <line x1="18" y1="27" x2="18" y2="33" stroke="#F8FAFC" strokeWidth="1.3" strokeLinecap="round" />
        <line x1="3" y1="18" x2="9" y2="18" stroke="#F8FAFC" strokeWidth="1.3" strokeLinecap="round" />
        <line x1="27" y1="18" x2="33" y2="18" stroke="#F8FAFC" strokeWidth="1.3" strokeLinecap="round" />
        {/* Core neutron beacon */}
        <circle cx="18" cy="18" r="3.2" fill="#22D3EE" />
        <circle cx="18" cy="18" r="1.4" fill="#F8FAFC" />
      </svg>
      <div className="flex flex-col leading-none">
        <span className="font-display text-base font-bold tracking-[0.16em] text-slate-50 whitespace-nowrap">
          CELESTIUM
        </span>
        {!compact && (
          <span className="text-[10px] font-mono tracking-wider text-slate-400 whitespace-nowrap mt-0.5">
            MISSION WORKBENCH
          </span>
        )}
      </div>
    </div>
  );
};
