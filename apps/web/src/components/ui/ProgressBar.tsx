'use client';

import { useEffect, useRef, useState } from 'react';

export type ProgressTone = 'auto' | 'emerald' | 'indigo' | 'rose' | 'amber' | 'slate';

interface ProgressBarProps {
  value: number;
  tone?: ProgressTone;
  fillClassName?: string;
  height?: 'xs' | 'sm';
}

const toneFill: Record<Exclude<ProgressTone, 'auto'>, string> = {
  emerald: 'bg-emerald-500',
  indigo: 'bg-indigo-500',
  rose: 'bg-rose-500',
  amber: 'bg-amber-400',
  slate: 'bg-slate-400',
};

function autoTone(value: number): Exclude<ProgressTone, 'auto'> {
  if (value >= 80) return 'emerald';
  if (value >= 50) return 'amber';
  return 'rose';
}

export function ProgressBar({ value, tone = 'auto', fillClassName, height = 'xs' }: ProgressBarProps) {
  const [width, setWidth] = useState(0);
  const hasMounted = useRef(false);
  const id1 = useRef<number>(0);
  const id2 = useRef<number>(0);

  useEffect(() => {
    if (hasMounted.current) {
      setWidth(value);
      return;
    }
    hasMounted.current = true;
    id1.current = requestAnimationFrame(() => {
      id2.current = requestAnimationFrame(() => setWidth(value));
    });
    return () => {
      cancelAnimationFrame(id1.current);
      cancelAnimationFrame(id2.current);
    };
  }, [value]);

  const resolvedTone = tone === 'auto' ? autoTone(value) : tone;
  const fillClass = fillClassName ?? toneFill[resolvedTone];
  const heightClass = height === 'xs' ? 'h-1.5' : 'h-2';

  return (
    <div className={`${heightClass} w-full overflow-hidden rounded-full bg-slate-100`}>
      <div
        className={`h-full rounded-full ${fillClass} motion-safe:transition-all motion-safe:duration-700 motion-safe:ease-out`}
        style={{ width: `${Math.min(100, Math.max(0, width))}%` }}
      />
    </div>
  );
}
