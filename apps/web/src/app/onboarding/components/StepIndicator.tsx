interface StepIndicatorProps {
  current: number; // 1-based
  total: number;
  labels: string[];
}

export default function StepIndicator({ current, total, labels }: StepIndicatorProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      {/* Step label */}
      <p className="text-xs font-medium text-slate-400 tracking-wide uppercase">
        Step {current} of {total}
      </p>

      {/* Dot + line track */}
      <div className="flex items-center gap-0">
        {labels.map((label, i) => {
          const idx = i + 1;
          const done    = idx < current;
          const active  = idx === current;
          const future  = idx > current;

          return (
            <div key={label} className="flex items-center">
              {/* Connecting line (left of each dot except first) */}
              {i > 0 && (
                <div
                  className={`h-0.5 w-8 sm:w-12 transition-colors duration-500 ${done ? 'bg-primary' : 'bg-slate-200'}`}
                />
              )}
              {/* Dot */}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all duration-500
                    ${done    ? 'bg-primary text-white shadow-sm shadow-primary/30' : ''}
                    ${active  ? 'bg-primary text-white shadow-md shadow-primary/40 scale-110 ring-4 ring-primary/20' : ''}
                    ${future  ? 'bg-slate-100 text-slate-400 border border-slate-200' : ''}
                  `}
                >
                  {done ? (
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check</span>
                  ) : idx}
                </div>
                <span className={`hidden sm:block text-[10px] font-medium transition-colors duration-300
                  ${active ? 'text-primary' : done ? 'text-slate-500' : 'text-slate-300'}`}>
                  {label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
