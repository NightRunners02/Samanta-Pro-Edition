import { cn } from '../../lib/utils';

export function SkeletonBox({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-slate-200/80 dark:bg-slate-800/80',
        className
      )}
    />
  );
}

export function TableSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="w-full border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
      <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex gap-4">
        {Array.from({ length: columns }).map((_, idx) => (
          <SkeletonBox key={idx} className="h-3.5 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div key={rIdx} className="px-4 py-3.5 flex items-center gap-4">
            {Array.from({ length: columns }).map((_, cIdx) => (
              <SkeletonBox key={cIdx} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3"
        >
          <SkeletonBox className="h-3.5 w-24" />
          <SkeletonBox className="h-7 w-16" />
          <SkeletonBox className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}
