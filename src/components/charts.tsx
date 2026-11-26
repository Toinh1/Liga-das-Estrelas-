/**
 * Gráficos leves em SVG (sem dependências novas), no padrão visual do FutebolB3.
 */
import React, { useState } from 'react';

export interface BarSeries {
  key: string;
  label: string;
  color: string;
}

export interface BarDatum {
  label: string;
  title?: string;
  values: Record<string, number>;
}

/** Barras empilhadas (ex.: gols + assistências por pelada). */
export const StackedBarChart: React.FC<{
  data: BarDatum[];
  series: BarSeries[];
  height?: number;
  emptyText?: string;
}> = ({ data, series, height = 150, emptyText = 'Sem dados no período.' }) => {
  const [hover, setHover] = useState<number | null>(null);
  const totals = data.map((d) => series.reduce((acc, s) => acc + (d.values[s.key] || 0), 0));
  const max = Math.max(1, ...totals);
  if (data.length === 0 || totals.every((t) => t === 0)) {
    return <div className="py-8 text-center text-xs text-slate-500">{emptyText}</div>;
  }

  const W = 100;
  const gap = data.length > 12 ? 1 : 2;
  const barW = (W - gap * (data.length - 1)) / data.length;

  return (
    <div className="space-y-2">
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${height}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height }}
          role="img"
          aria-label={series.map((s) => s.label).join(' e ')}
        >
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1={0}
              x2={W}
              y1={height * f}
              y2={height * f}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth={0.4}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {data.map((d, i) => {
            let y = height;
            const x = i * (barW + gap);
            return (
              <g
                key={i}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onClick={() => setHover(i)}
                style={{ cursor: 'pointer' }}
              >
                <rect x={x} y={0} width={barW} height={height} fill="transparent" />
                {series.map((s) => {
                  const v = d.values[s.key] || 0;
                  const h = (v / max) * (height - 6);
                  y -= h;
                  return (
                    <rect
                      key={s.key}
                      x={x}
                      y={y}
                      width={barW}
                      height={Math.max(0, h)}
                      fill={s.color}
                      opacity={hover === null || hover === i ? 1 : 0.45}
                      rx={0.8}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
        {hover !== null && data[hover] && (
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full px-2.5 py-1.5 rounded-lg bg-[#242424] border border-white/10 text-[11px] text-slate-200 whitespace-nowrap pointer-events-none shadow-xl">
            <div className="font-bold text-white">{data[hover].title || data[hover].label}</div>
            {series.map((s) => (
              <span key={s.key} className="mr-2">
                <span style={{ color: s.color }}>●</span> {s.label}: {data[hover].values[s.key] || 0}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex justify-between text-[10px] text-slate-500">
        <span>{data[0]?.label}</span>
        {data.length > 2 && <span>{data[Math.floor(data.length / 2)]?.label}</span>}
        <span>{data[data.length - 1]?.label}</span>
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-slate-400">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
};

/** Barras horizontais com rótulo (rankings). */
export const HorizontalBars: React.FC<{
  rows: { id: string; label: React.ReactNode; value: number; suffix?: string }[];
  color?: string;
}> = ({ rows, color = '#A3E635' }) => {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <div className="py-6 text-center text-xs text-slate-500">Sem dados.</div>;
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="min-w-0 truncate text-slate-200">{r.label}</div>
            <div className="font-display font-extrabold text-white shrink-0">
              {r.value}
              {r.suffix && <span className="text-slate-500 font-sans font-semibold ml-1">{r.suffix}</span>}
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(r.value / max) * 100}%`, backgroundColor: color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};
