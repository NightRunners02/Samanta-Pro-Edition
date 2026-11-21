import type { DocumentCategory, RoleCode, ScoringWeights } from '../types/database';

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatRoleLabel(role?: RoleCode | string | null): string {
  switch (role) {
    case 'super_admin':
      return 'Super Admin';
    case 'program_admin':
      return 'Admin Program Studi';
    case 'supervisor':
      return 'Dosen Pembimbing';
    case 'examiner':
      return 'Dosen Penguji';
    case 'student':
      return 'Mahasiswa';
    default:
      return 'Pengguna';
  }
}

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  proposal: 'Proposal',
  chapter_1: 'Bab 1 — Pendahuluan',
  chapter_2: 'Bab 2 — Tinjauan Pustaka',
  chapter_3: 'Bab 3 — Metodologi',
  chapter_4: 'Bab 4 — Hasil & Pembahasan',
  chapter_5: 'Bab 5 — Kesimpulan',
  full_thesis: 'Full Thesis',
  research_letter: 'Surat Penelitian',
  payment_receipt: 'Bukti Pembayaran',
  seminar_document: 'Dokumen Seminar',
  defense_document: 'Dokumen Sidang',
  plagiarism_report: 'Bukti Plagiasi',
  graduation_document: 'Dokumen Yudisium',
  supporting_document: 'Dokumen Pendukung',
};

export function calculateWeightedScore(
  scores: {
    presentation_score: number;
    substance_score: number;
    methodology_score: number;
    results_score: number;
    mastery_score: number;
    revision_score: number;
  },
  weights: ScoringWeights
): number {
  const totalWeight =
    weights.presentation +
    weights.substance +
    weights.methodology +
    weights.results +
    weights.mastery +
    weights.revision;
  if (totalWeight <= 0) return 0;

  const weighted =
    (scores.presentation_score * weights.presentation +
      scores.substance_score * weights.substance +
      scores.methodology_score * weights.methodology +
      scores.results_score * weights.results +
      scores.mastery_score * weights.mastery +
      scores.revision_score * weights.revision) /
    totalWeight;

  return Math.round(weighted * 100) / 100;
}

export function getLetterGrade(score: number): string {
  if (score >= 85) return 'A';
  if (score >= 80) return 'A-';
  if (score >= 75) return 'B+';
  if (score >= 70) return 'B';
  if (score >= 65) return 'C+';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'E';
}

export function exportToCsv(filename: string, rows: Array<Record<string, unknown>>): void {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(','),
    ...rows.map((row) =>
      headers
        .map((key) => {
          const val = row[key] ?? '';
          const escaped = String(val).replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(',')
    ),
  ];

  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
