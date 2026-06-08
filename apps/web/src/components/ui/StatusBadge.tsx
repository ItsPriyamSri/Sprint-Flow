const VALID_STATUSES = ['ACTIVE', 'PLANNING', 'COMPLETED'] as const;
type SprintStatus = (typeof VALID_STATUSES)[number];

function toStatus(s: string): SprintStatus {
  return VALID_STATUSES.includes(s as SprintStatus) ? (s as SprintStatus) : 'PLANNING';
}

const statusStyles: Record<SprintStatus, { badge: string }> = {
  ACTIVE: { badge: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
  PLANNING: { badge: 'bg-amber-50 text-amber-700 border-amber-100' },
  COMPLETED: { badge: 'bg-slate-100 text-slate-500 border-slate-200' },
};

export function StatusBadge({ status }: { status: string }) {
  const resolved = toStatus(status);
  const styles = statusStyles[resolved];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${styles.badge}`}
    >
      {resolved === 'ACTIVE' && (
        <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-indigo-500 motion-safe:animate-pulse" />
      )}
      {resolved}
    </span>
  );
}
