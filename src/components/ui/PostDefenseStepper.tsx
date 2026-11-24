import { AlertCircle, CheckCircle2, Clock, Lock, XCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import type {
  DefenseRegistration,
  ExamSchedule,
  ExamScore,
  GraduationRecord,
  PlagiarismCheck,
  ThesisDocument,
} from '../../types/database';

export type PostDefenseStepStatus =
  | 'completed'
  | 'approved'
  | 'in_progress'
  | 'pending'
  | 'needs_revision'
  | 'rejected'
  | 'locked';

export interface PostDefenseStepperProps {
  currentPage: 'plagiarism' | 'yudisium';
  defenseSchedule: ExamSchedule | null;
  defenseRegistration?: DefenseRegistration | null;
  scores: ExamScore[];
  fullThesisDoc: ThesisDocument | null;
  plagiarism: PlagiarismCheck | null;
  graduation: GraduationRecord | null;
  onNavigate?: (pageId: string) => void;
}

export function isDefenseCompleted(
  defenseSchedule: ExamSchedule | null,
  defenseRegistration?: DefenseRegistration | null,
  scores: ExamScore[] = []
): boolean {
  return (
    defenseSchedule?.status === 'completed' ||
    defenseRegistration?.status === 'completed' ||
    scores.length > 0
  );
}

export function PostDefenseStepper({
  currentPage,
  defenseSchedule,
  defenseRegistration,
  scores,
  fullThesisDoc,
  plagiarism,
  graduation,
  onNavigate,
}: PostDefenseStepperProps) {
  const defenseDone = isDefenseCompleted(defenseSchedule, defenseRegistration, scores);
  const scoresFinalized = scores.some((s) => s.is_finalized) || scores.length > 0;
  const revisionApproved =
    fullThesisDoc?.status === 'approved' ||
    (scoresFinalized && fullThesisDoc?.status !== 'revision_required' && fullThesisDoc?.status !== 'rejected');

  const step1Status: PostDefenseStepStatus = defenseDone
    ? 'completed'
    : defenseSchedule
      ? 'in_progress'
      : 'locked';

  const step2Status: PostDefenseStepStatus = !defenseDone
    ? 'locked'
    : fullThesisDoc?.status === 'revision_required' || fullThesisDoc?.status === 'rejected'
      ? 'needs_revision'
      : scoresFinalized && revisionApproved
        ? 'completed'
        : scoresFinalized
          ? 'in_progress'
          : 'pending';

  const step3Status: PostDefenseStepStatus = !defenseDone
    ? 'locked'
    : !plagiarism || plagiarism.status === 'not_submitted'
      ? 'in_progress'
      : plagiarism.status === 'approved'
        ? 'approved'
        : plagiarism.status === 'rejected'
          ? 'rejected'
          : plagiarism.status === 'revision_required'
            ? 'needs_revision'
            : 'pending';

  const step4Status: PostDefenseStepStatus =
    !defenseDone || plagiarism?.status !== 'approved'
      ? graduation?.status && graduation.status !== 'incomplete'
        ? 'pending'
        : 'locked'
      : !graduation || graduation.status === 'incomplete'
        ? 'in_progress'
        : graduation.status === 'revision_required'
          ? 'needs_revision'
          : graduation.status === 'submitted' || graduation.status === 'under_verification'
            ? 'pending'
            : 'completed';

  const step5Status: PostDefenseStepStatus =
    graduation?.status === 'graduated'
      ? 'completed'
      : graduation?.status === 'approved'
        ? 'approved'
        : 'locked';

  const steps: Array<{
    num: string;
    title: string;
    caption: string;
    status: PostDefenseStepStatus;
    pageId: string;
    isCurrent: boolean;
  }> = [
    {
      num: '01',
      title: 'Sidang Akhir Berakhir',
      caption: defenseDone
        ? 'Sidang selesai dilaksanakan'
        : defenseSchedule
          ? 'Menunggu sidang selesai'
          : 'Belum terjadwal',
      status: step1Status,
      pageId: 'defense',
      isCurrent: false,
    },
    {
      num: '02',
      title: 'Nilai & Revisi Final',
      caption:
        step2Status === 'completed'
          ? 'Nilai & naskah final siap'
          : step2Status === 'needs_revision'
            ? 'Perbaiki revisi naskah'
            : defenseDone
              ? 'Menunggu finalisasi nilai'
              : 'Menunggu sidang selesai',
      status: step2Status,
      pageId: step2Status === 'needs_revision' ? 'documents' : 'defense',
      isCurrent: false,
    },
    {
      num: '03',
      title: 'Cek & Verifikasi Plagiasi',
      caption:
        plagiarism?.status === 'approved'
          ? `Lolos (${plagiarism.similarity_percent ?? 0}%)`
          : plagiarism?.status === 'pending_verification'
            ? 'Menunggu verifikasi Prodi'
            : plagiarism?.status === 'revision_required'
              ? 'Perlu unggah ulang'
              : plagiarism?.status === 'rejected'
                ? 'Melebihi batas ambang'
                : defenseDone
                  ? 'Unggah laporan plagiasi'
                  : 'Dibuka pasca sidang',
      status: step3Status,
      pageId: 'plagiarism',
      isCurrent: currentPage === 'plagiarism',
    },
    {
      num: '04',
      title: 'Pengajuan Yudisium',
      caption:
        step4Status === 'completed'
          ? 'Berkas yudisium disetujui'
          : step4Status === 'pending'
            ? 'Menunggu validasi admin'
            : step4Status === 'needs_revision'
              ? 'Perlu revisi berkas'
              : plagiarism?.status === 'approved'
                ? 'Lengkapi & ajukan berkas'
                : 'Menunggu plagiasi lolos',
      status: step4Status,
      pageId: 'yudisium',
      isCurrent: currentPage === 'yudisium' && graduation?.status !== 'graduated',
    },
    {
      num: '05',
      title: 'Yudisium & Kelulusan',
      caption:
        graduation?.status === 'graduated'
          ? `Lulus · ${graduation.certificate_number || 'SK Terbit'}`
          : graduation?.status === 'approved'
            ? 'Penerbitan SK Yudisium'
            : 'Tahap akhir kelulusan',
      status: step5Status,
      pageId: 'yudisium',
      isCurrent: currentPage === 'yudisium' && graduation?.status === 'graduated',
    },
  ];

  const completedCount = steps.filter(
    (s) => s.status === 'completed' || s.status === 'approved'
  ).length;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Tahapan Pasca Sidang hingga Akhir Yudisium
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Setelah sidang akhir berakhir, selesaikan tahapan berikut secara berurutan hingga yudisium selesai.
          </p>
        </div>
        <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300 shrink-0">
          {completedCount}/5 Tahap Selesai
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
        {steps.map((step) => {
          const isDone = step.status === 'completed' || step.status === 'approved';
          const isWarn = step.status === 'needs_revision';
          const isError = step.status === 'rejected';
          const isActive = step.status === 'in_progress' || step.status === 'pending';

          return (
            <button
              key={step.num}
              type="button"
              onClick={() => onNavigate?.(step.pageId)}
              className={cn(
                'text-left p-3 rounded-lg border transition-colors flex flex-col justify-between gap-2',
                step.isCurrent && 'ring-2 ring-blue-600/35 dark:ring-cyan-400/35',
                isDone
                  ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/20'
                  : isError
                    ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/20'
                    : isWarn
                      ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20'
                      : isActive
                        ? 'border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono font-semibold text-slate-500 dark:text-slate-400">
                  Step {step.num}
                </span>
                {isDone ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                ) : isError ? (
                  <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                ) : isWarn ? (
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                ) : isActive ? (
                  <Clock className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                ) : (
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                  {step.title}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
                  {step.caption}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
