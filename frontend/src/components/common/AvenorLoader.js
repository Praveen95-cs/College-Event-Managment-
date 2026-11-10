import React from 'react';

const BARS = [
  { delay: '0ms', heightClass: 'h-full' },
  { delay: '130ms', heightClass: 'h-full' },
  { delay: '260ms', heightClass: 'h-full' },
  { delay: '390ms', heightClass: 'h-full' }
];

const TONE_CLASS = {
  amber: 'bg-[#ebb05d]',
  light: 'bg-[#efe9de]',
  dark: 'bg-[#12110f]'
};

/**
 * Shared warm-dark geometric loading mark replacing generic circular spinners.
 * Variants:
 * - "page": Centered full-height workspace/page gate loader
 * - "section": Section / tab content loader
 * - "compact": Compact row/popover/table loader
 * - "inline": Button-sized cadence bars (defaults tone to light/dark automatically if passed)
 */
const AvenorLoader = ({
  variant = 'section',
  tone = 'amber',
  label = '',
  sublabel = '',
  className = ''
}) => {
  const barColor = TONE_CLASS[tone] || TONE_CLASS.amber;

  if (variant === 'inline') {
    return (
      <span
        className={`inline-flex items-end gap-[2.5px] h-3.5 px-0.5 shrink-0 ${className}`}
        role="status"
        aria-label={label || 'Loading'}
      >
        {BARS.slice(0, 3).map((bar, idx) => (
          <span
            key={idx}
            className={`avenor-cadence-bar w-[2.5px] ${bar.heightClass} rounded-full ${barColor}`}
            style={{ animationDelay: bar.delay }}
          />
        ))}
        {!label && <span className="sr-only">Loading...</span>}
      </span>
    );
  }

  if (variant === 'compact') {
    return (
      <div
        className={`inline-flex items-center justify-center gap-3 py-3 text-[13px] text-[#aaa398] ${className}`}
        role="status"
      >
        <span className="inline-flex items-end gap-[3px] h-4 px-1.5 py-0.5 rounded-[6px] bg-[#161513] border border-[#efe9de]/[0.08]">
          {BARS.map((bar, idx) => (
            <span
              key={idx}
              className={`avenor-cadence-bar w-[2.5px] ${bar.heightClass} rounded-full ${barColor}`}
              style={{ animationDelay: bar.delay }}
            />
          ))}
        </span>
        {label ? <span className="font-medium">{label}</span> : <span className="sr-only">Loading...</span>}
      </div>
    );
  }

  const containerHeight =
    variant === 'page'
      ? 'min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center px-4'
      : 'flex flex-col items-center justify-center gap-3.5 py-20 text-center px-4';

  return (
    <div className={`${containerHeight} ${className}`} role="status">
      <div
        className="relative h-11 w-11 rounded-[12px] bg-[#1c1a18] border border-[#efe9de]/[0.1] flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
        aria-hidden="true"
      >
        <div className="inline-flex items-end gap-[3.5px] h-5">
          {BARS.map((bar, idx) => (
            <span
              key={idx}
              className={`avenor-cadence-bar w-[3px] ${bar.heightClass} rounded-full ${barColor}`}
              style={{ animationDelay: bar.delay }}
            />
          ))}
        </div>
      </div>

      {label ? (
        <div className="space-y-1">
          <p className="text-[14px] font-medium text-[#efe9de]">{label}</p>
          {sublabel && <p className="text-[12px] text-[#8a847a]">{sublabel}</p>}
        </div>
      ) : (
        <span className="sr-only">Loading...</span>
      )}
    </div>
  );
};

export default AvenorLoader;

