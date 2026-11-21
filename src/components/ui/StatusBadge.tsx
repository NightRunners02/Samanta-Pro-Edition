import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileEdit,
  Loader2,
  XCircle,
  CalendarClock,
} from 'lucide-react';
import { cn } from '../../lib/utils';

const STATUS_CONFIG: Record<
  string,
  { label: string; colorClass: string; icon: 'check' | 'clock' | 'alert' | 'x' | 'edit' | 'calendar' | 'spin' }
> = {
  not_started: { label: 'Not Started', colorClass: 'text-slate-500 dark:text-slate-400', icon: 'clock' },
  draft: { label: 'Draft', colorClass: 'text-slate-500 dark:text-slate-400', icon: 'edit' },
  incomplete: { label: 'Incomplete', colorClass: 'text-slate-500 dark:text-slate-400', icon: 'clock' },
  not_submitted: { label: 'Not Submitted', colorClass: 'text-slate-500 dark:text-slate-400', icon: 'clock' },
  pending: { label: 'Pending', colorClass: 'text-amber-700 dark:text-amber-400', icon: 'clock' },
  pending_verification: { label: 'Pending Verification', colorClass: 'text-amber-700 dark:text-amber-400', icon: 'clock' },
  requested: { label: 'Requested', colorClass: 'text-amber-700 dark:text-amber-400', icon: 'clock' },
  submitted: { label: 'Submitted', colorClass: 'text-blue-700 dark:text-blue-400', icon: 'clock' },
  under_review: { label: 'Under Review', colorClass: 'text-cyan-700 dark:text-cyan-400', icon: 'spin' },
  under_verification: { label: 'Under Verification', colorClass: 'text-cyan-700 dark:text-cyan-400', icon: 'spin' },
  verification: { label: 'Verification', colorClass: 'text-cyan-700 dark:text-cyan-400', icon: 'spin' },
  in_progress: { label: 'In Progress', colorClass: 'text-blue-700 dark:text-blue-400', icon: 'spin' },
  scheduled: { label: 'Scheduled', colorClass: 'text-blue-700 dark:text-blue-400', icon: 'calendar' },
  rescheduled: { label: 'Rescheduled', colorClass: 'text-amber-700 dark:text-amber-400', icon: 'calendar' },
  ongoing: { label: 'Ongoing', colorClass: 'text-cyan-700 dark:text-cyan-400', icon: 'spin' },
  needs_revision: { label: 'Needs Revision', colorClass: 'text-amber-700 dark:text-amber-400', icon: 'alert' },
  revision_required: { label: 'Revision Required', colorClass: 'text-amber-700 dark:text-amber-400', icon: 'alert' },
  approved: { label: 'Approved', colorClass: 'text-emerald-700 dark:text-emerald-400', icon: 'check' },
  completed: { label: 'Completed', colorClass: 'text-emerald-700 dark:text-emerald-400', icon: 'check' },
  graduated: { label: 'Graduated', colorClass: 'text-emerald-700 dark:text-emerald-400', icon: 'check' },
  active: { label: 'Active', colorClass: 'text-emerald-700 dark:text-emerald-400', icon: 'check' },
  rejected: { label: 'Rejected', colorClass: 'text-rose-700 dark:text-rose-400', icon: 'x' },
  cancelled: { label: 'Cancelled', colorClass: 'text-rose-700 dark:text-rose-400', icon: 'x' },
  inactive: { label: 'Inactive', colorClass: 'text-slate-500 dark:text-slate-400', icon: 'x' },
};

export function StatusBadge({ status, className }: { status?: string | null; className?: string }) {
  const key = (status || 'pending').toLowerCase();
  const cfg = STATUS_CONFIG[key] || {
    label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    colorClass: 'text-slate-700 dark:text-slate-300',
    icon: 'clock' as const,
  };

  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap', cfg.colorClass, className)}>
      {cfg.icon === 'check' && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
      {cfg.icon === 'clock' && <Clock className="w-3.5 h-3.5 shrink-0" />}
      {cfg.icon === 'alert' && <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
      {cfg.icon === 'x' && <XCircle className="w-3.5 h-3.5 shrink-0" />}
      {cfg.icon === 'edit' && <FileEdit className="w-3.5 h-3.5 shrink-0" />}
      {cfg.icon === 'calendar' && <CalendarClock className="w-3.5 h-3.5 shrink-0" />}
      {cfg.icon === 'spin' && <Loader2 className="w-3.5 h-3.5 shrink-0" />}
      <span>{cfg.label}</span>
    </span>
  );
}
