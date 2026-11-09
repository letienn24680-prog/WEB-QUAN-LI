import React from 'react';

export interface StatsCardProps {
  title: string;
  value: string | number;
  change: number;
  periodLabel?: string;
  icon?: string | React.ReactNode;
  iconColor?: 'purple' | 'emerald' | 'cyan' | 'amber';
  sparkline?: number[];
}

export const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  change,
  periodLabel = 'vs last 7 days',
  icon = '📦',
  iconColor = 'purple',
  sparkline = [20, 28, 22, 35, 29, 42, 48],
}) => {
  const safeChange = Number.isFinite(change) ? change : 0;
  const isPositive = safeChange >= 0;
  const formattedChange = `${isPositive ? '+' : ''}${safeChange}%`;

  const colorStyles = {
    purple: {
      bg: 'rgba(139, 92, 246, 0.15)',
      text: '#A78BFA',
      stroke: '#8B5CF6',
      fill: 'rgba(139, 92, 246, 0.25)',
    },
    emerald: {
      bg: 'rgba(16, 185, 129, 0.15)',
      text: '#34D399',
      stroke: '#10B981',
      fill: 'rgba(16, 185, 129, 0.25)',
    },
    cyan: {
      bg: 'rgba(6, 182, 212, 0.15)',
      text: '#38BDF8',
      stroke: '#06B6D4',
      fill: 'rgba(6, 182, 212, 0.25)',
    },
    amber: {
      bg: 'rgba(245, 158, 11, 0.15)',
      text: '#FBBF24',
      stroke: '#F59E0B',
      fill: 'rgba(245, 158, 11, 0.25)',
    },
  }[iconColor];

  // Build SVG sparkline path
  const min = Math.min(...sparkline);
  const max = Math.max(...sparkline, min + 1);
  const w = 120;
  const h = 34;
  const pts = sparkline.map((v, i) => {
    const x = (i / Math.max(sparkline.length - 1, 1)) * w;
    const y = h - 4 - ((v - min) / (max - min)) * (h - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const pathD = `M ${pts.join(' L ')}`;
  const areaD = `M 0,${h} L ${pts.join(' L ')} L ${w},${h} Z`;

  return (
    <div className="p-5 rounded-2xl bg-[#111827] border border-white/5 hover:border-violet-500/30 transition-all duration-200 shadow-lg flex flex-col justify-between gap-3">
      <div className="flex items-center justify-between gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-lg shrink-0"
          style={{ background: colorStyles.bg, color: colorStyles.text }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-400">{title}</p>
          <h2 className="text-2xl font-bold tracking-tight text-white tabular-nums mt-0.5">{value}</h2>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-1">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <span className={isPositive ? 'text-emerald-400' : 'text-rose-400'}>
            {isPositive ? '↑' : '↓'} {formattedChange}
          </span>
          <span className="text-slate-500 font-normal text-[11px]">{periodLabel}</span>
        </div>
        <div className="w-24 h-8 shrink-0">
          <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full overflow-visible">
            <path d={areaD} fill={colorStyles.fill} opacity={0.4} />
            <path d={pathD} fill="none" stroke={colorStyles.stroke} strokeWidth={2.2} strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  );
};

export default StatsCard;
