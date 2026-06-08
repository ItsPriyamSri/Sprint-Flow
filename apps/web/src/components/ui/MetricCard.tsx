'use client';

import type { ReactNode } from 'react';
import { useCountUp } from '@/hooks/useCountUp';

export type MetricTone = 'neutral' | 'emerald' | 'indigo' | 'rose' | 'amber' | 'slate';

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  tone?: MetricTone;
  icon?: ReactNode;
  badge?: ReactNode;
}

const toneStyles: Record<
  MetricTone,
  { border: string; accent: string; valueText: string; iconBg: string; iconText: string }
> = {
  neutral: {
    border: 'border-slate-200',
    accent: 'border-l-slate-400',
    valueText: 'text-slate-900',
    iconBg: 'bg-slate-50',
    iconText: 'text-slate-400',
  },
  emerald: {
    border: 'border-emerald-100',
    accent: 'border-l-emerald-500',
    valueText: 'text-emerald-600',
    iconBg: 'bg-emerald-50',
    iconText: 'text-emerald-500',
  },
  indigo: {
    border: 'border-indigo-100',
    accent: 'border-l-indigo-500',
    valueText: 'text-indigo-600',
    iconBg: 'bg-indigo-50',
    iconText: 'text-indigo-500',
  },
  rose: {
    border: 'border-rose-200',
    accent: 'border-l-rose-500',
    valueText: 'text-rose-600',
    iconBg: 'bg-rose-50',
    iconText: 'text-rose-500',
  },
  amber: {
    border: 'border-amber-100',
    accent: 'border-l-amber-500',
    valueText: 'text-amber-600',
    iconBg: 'bg-amber-50',
    iconText: 'text-amber-500',
  },
  slate: {
    border: 'border-slate-200',
    accent: 'border-l-slate-300',
    valueText: 'text-slate-600',
    iconBg: 'bg-slate-50',
    iconText: 'text-slate-400',
  },
};

function AnimatedNumber({ target }: { target: number }) {
  const animated = useCountUp(target, 600);
  return <>{animated}</>;
}

export function MetricCard({ label, value, sub, tone = 'neutral', icon, badge }: MetricCardProps) {
  const styles = toneStyles[tone];
  const isNumeric = typeof value === 'number';

  return (
    <div
      className={`group relative rounded-xl border border-l-2 bg-white p-5 ${styles.border} ${styles.accent}
        shadow-[0_1px_2px_rgba(15,23,42,0.04)]
        motion-safe:hover:-translate-y-0.5
        hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)]
        transition-all duration-200 ease-out
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1`}
    >
      {icon && (
        <div
          className={`absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-md ${styles.iconBg} ${styles.iconText}`}
        >
          {icon}
        </div>
      )}
      <p className="pr-8 text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <div className={`mt-1.5 flex items-center gap-2 text-3xl font-bold tracking-tight ${styles.valueText}`}>
        <span>{isNumeric ? <AnimatedNumber target={value as number} /> : value}</span>
        {badge}
      </div>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
