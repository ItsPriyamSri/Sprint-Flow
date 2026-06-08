import type { ReactNode } from 'react';

type IconTone = 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate';

interface SectionHeaderProps {
  icon?: ReactNode;
  iconTone?: IconTone;
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
}

const iconToneStyles: Record<IconTone, string> = {
  indigo: 'bg-indigo-50 text-indigo-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600',
  slate: 'bg-slate-50 text-slate-500',
};

export function SectionHeader({ icon, iconTone = 'indigo', title, meta, action }: SectionHeaderProps) {
  return (
    <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4">
      <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-slate-800">
        {icon && (
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-lg ${iconToneStyles[iconTone]}`}
          >
            {icon}
          </span>
        )}
        {title}
      </h2>
      {(meta != null || action != null) && (
        <div className="flex items-center gap-3">
          {meta != null && <span className="text-sm font-medium text-slate-400">{meta}</span>}
          {action}
        </div>
      )}
    </div>
  );
}
