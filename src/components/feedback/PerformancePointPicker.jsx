import React from 'react';

const POINT_COLORS = [
  { dot: 'bg-red-400', border: 'border-red-400/40', bg: 'bg-red-500/5', text: 'text-red-400', label: 'Lowest' },
  { dot: 'bg-orange-400', border: 'border-orange-400/40', bg: 'bg-orange-500/5', text: 'text-orange-400', label: '' },
  { dot: 'bg-yellow-400', border: 'border-yellow-400/40', bg: 'bg-yellow-500/5', text: 'text-yellow-400', label: '' },
  { dot: 'bg-blue-400', border: 'border-blue-400/40', bg: 'bg-blue-500/5', text: 'text-blue-400', label: '' },
  { dot: 'bg-green-400', border: 'border-green-400/40', bg: 'bg-green-500/5', text: 'text-green-400', label: 'Highest' },
];

function getColorIndex(pointIndex, maxPoint) {
  const indices = maxPoint === 5 ? [0,1,2,3,4] : maxPoint === 4 ? [0,1,2,4] : [0,2,4];
  return indices[pointIndex] ?? pointIndex;
}

// value format: "aspectId::pointNumber"  e.g. "abc123::3"
export default function PerformancePointPicker({ label, aspect, value, onChange }) {
  if (!aspect) {
    return (
      <div className="space-y-1.5">
        <p className="text-sm text-foreground/80 font-medium">{label}</p>
        <div className="bg-muted rounded-xl px-4 py-3 text-sm text-muted-foreground italic">
          No performance category found for "{label}"
        </div>
      </div>
    );
  }

  const maxPt = aspect.max_point || 5;
  const selectedPoint = value ? parseInt(value.split('::')[1]) : null;

  const points = Array.from({ length: maxPt }, (_, i) => {
    const pointNum = i + 1;
    const desc = aspect[`point_${pointNum}_description`];
    const colorIdx = getColorIndex(i, maxPt);
    const color = POINT_COLORS[colorIdx];
    return { pointNum, desc, color };
  });

  return (
    <div className="space-y-1.5">
      <p className="text-sm text-foreground/80 font-medium">{label}</p>
      <div className="space-y-2">
        {points.map(({ pointNum, desc, color }) => {
          const isSelected = selectedPoint === pointNum;
          const val = desc ? `${aspect.aspect_title}::${pointNum}::${desc}` : `${aspect.aspect_title}::${pointNum}`;
          return (
            <label
              key={pointNum}
              className={`flex items-start gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-all ${
                isSelected
                  ? `${color.bg} ${color.border} border`
                  : 'bg-muted/40 border-border hover:border-border/80'
              }`}
            >
              <input
                type="radio"
                name={`perf_${label.replace(/\s/g, '_')}`}
                checked={isSelected}
                onChange={() => onChange(val)}
                className="hidden"
              />
              <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white mt-0.5 ${color.dot}`}>
                {pointNum}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold ${color.text}`}>Point {pointNum}</span>
                  {color.label && <span className="text-xs text-muted-foreground">({color.label})</span>}
                  {isSelected && (
                    <span className={`ml-auto text-xs font-semibold ${color.text}`}>✓ Selected</span>
                  )}
                </div>
                {desc ? (
                  <p className="text-sm text-foreground/80 mt-0.5 leading-relaxed">{desc}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic mt-0.5">No description</p>
                )}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}