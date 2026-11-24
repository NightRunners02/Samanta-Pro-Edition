import { jsPDF } from 'jspdf';
import autoTable, { type CellHookData } from 'jspdf-autotable';
import { formatIndonesianLongDate } from './decreePdf';

export type ReportType =
  | 'submissions'
  | 'supervisees'
  | 'progress'
  | 'seminars'
  | 'defenses'
  | 'scores'
  | 'plagiarism'
  | 'yudisium'
  | 'graduations'
  | 'delayed';

export const REPORT_TYPES: Array<{ id: ReportType; label: string }> = [
  { id: 'submissions', label: '1. Laporan Pengajuan TA' },
  { id: 'supervisees', label: '2. Laporan Mahasiswa Bimbingan' },
  { id: 'progress', label: '3. Laporan Progres TA' },
  { id: 'seminars', label: '4. Laporan Seminar Proposal' },
  { id: 'defenses', label: '5. Laporan Sidang Akhir' },
  { id: 'scores', label: '6. Laporan Nilai Sidang' },
  { id: 'plagiarism', label: '7. Laporan Plagiasi' },
  { id: 'yudisium', label: '8. Laporan Yudisium' },
  { id: 'graduations', label: '9. Laporan Kelulusan' },
  { id: 'delayed', label: '10. Laporan Mahasiswa Terlambat' },
];

export interface ReportSummaryStat {
  label: string;
  value: string;
  hint?: string;
  accent?: 'blue' | 'emerald' | 'amber' | 'rose' | 'cyan';
}

export interface AcademicReportPdfPayload {
  reportType: ReportType;
  reportTitle: string;
  reportSubtitle: string;
  institutionName: string;
  facultyName: string;
  programName: string;
  periodLabel: string;
  dateRangeLabel: string;
  generatedBy: string;
  generatedByRole: string;
  generatedAt: string;
  signerName: string;
  signerTitle: string;
  signerNip?: string | null;
  contactEmail?: string | null;
  rows: Array<Record<string, string | number>>;
  stats: ReportSummaryStat[];
}

interface ReportColumnSpec {
  header: string;
  key: string;
  widthWeight: number;
  halign?: 'left' | 'center' | 'right';
}

interface ReportLayoutConfig {
  orientation: 'portrait' | 'landscape';
  columns: ReportColumnSpec[];
  statusKeys: string[];
}

const REPORT_LAYOUTS: Record<ReportType, ReportLayoutConfig> = {
  submissions: {
    orientation: 'landscape',
    statusKeys: ['Status_Persetujuan'],
    columns: [
      { header: 'No', key: '_no', widthWeight: 6, halign: 'center' },
      { header: 'NIM', key: 'NIM', widthWeight: 13 },
      { header: 'Nama Mahasiswa', key: 'Nama_Mahasiswa', widthWeight: 18 },
      { header: 'Program Studi', key: 'Prodi', widthWeight: 14 },
      { header: 'Judul Tugas Akhir', key: 'Judul_TA', widthWeight: 28 },
      { header: 'Tgl Pengajuan', key: 'Tanggal_Pengajuan', widthWeight: 13 },
      { header: 'Status', key: 'Status_Persetujuan', widthWeight: 13, halign: 'center' },
      { header: 'Catatan Admin', key: 'Catatan_Admin', widthWeight: 20 },
    ],
  },
  supervisees: {
    orientation: 'landscape',
    statusKeys: ['Status_Bimbingan'],
    columns: [
      { header: 'No', key: '_no', widthWeight: 6, halign: 'center' },
      { header: 'Dosen Pembimbing', key: 'Dosen_Pembimbing', widthWeight: 20 },
      { header: 'Peran', key: 'Peran', widthWeight: 12, halign: 'center' },
      { header: 'NIM', key: 'NIM', widthWeight: 13 },
      { header: 'Mahasiswa Bimbingan', key: 'Mahasiswa_Bimbingan', widthWeight: 18 },
      { header: 'Judul Tugas Akhir', key: 'Judul_TA', widthWeight: 26 },
      { header: 'Sesi', key: 'Jumlah_Bimbingan', widthWeight: 10, halign: 'center' },
      { header: 'Status Bimbingan', key: 'Status_Bimbingan', widthWeight: 15, halign: 'center' },
    ],
  },
  progress: {
    orientation: 'landscape',
    statusKeys: ['Status'],
    columns: [
      { header: 'No', key: '_no', widthWeight: 6, halign: 'center' },
      { header: 'NIM', key: 'NIM', widthWeight: 13 },
      { header: 'Nama Mahasiswa', key: 'Nama_Mahasiswa', widthWeight: 18 },
      { header: 'Judul Tugas Akhir', key: 'Judul_TA', widthWeight: 28 },
      { header: 'Tahapan Pengerjaan', key: 'Tahapan_Pengerjaan', widthWeight: 18 },
      { header: 'Progres', key: 'Progres', widthWeight: 10, halign: 'center' },
      { header: 'Status', key: 'Status', widthWeight: 13, halign: 'center' },
      { header: 'Tgl Pembaruan', key: 'Tanggal_Pembaruan', widthWeight: 14 },
    ],
  },
  seminars: {
    orientation: 'landscape',
    statusKeys: ['Status_Seminar'],
    columns: [
      { header: 'No', key: '_no', widthWeight: 6, halign: 'center' },
      { header: 'NIM', key: 'NIM', widthWeight: 12 },
      { header: 'Mahasiswa', key: 'Mahasiswa', widthWeight: 17 },
      { header: 'Judul Tugas Akhir', key: 'Judul_TA', widthWeight: 24 },
      { header: 'Dosen Pembimbing', key: 'Dosen_Pembimbing', widthWeight: 20 },
      { header: 'Dosen Penguji', key: 'Dosen_Penguji', widthWeight: 20 },
      { header: 'Jadwal Seminar', key: 'Jadwal_Seminar', widthWeight: 17 },
      { header: 'Status', key: 'Status_Seminar', widthWeight: 12, halign: 'center' },
    ],
  },
  defenses: {
    orientation: 'landscape',
    statusKeys: ['Status_Pelaksanaan'],
    columns: [
      { header: 'No', key: '_no', widthWeight: 6, halign: 'center' },
      { header: 'NIM', key: 'NIM', widthWeight: 12 },
      { header: 'Mahasiswa', key: 'Mahasiswa', widthWeight: 17 },
      { header: 'Judul Tugas Akhir', key: 'Judul_TA', widthWeight: 24 },
      { header: 'Dosen Pembimbing', key: 'Dosen_Pembimbing', widthWeight: 20 },
      { header: 'Dosen Penguji', key: 'Dosen_Penguji', widthWeight: 20 },
      { header: 'Jadwal Sidang', key: 'Jadwal_Sidang', widthWeight: 17 },
      { header: 'Status', key: 'Status_Pelaksanaan', widthWeight: 12, halign: 'center' },
    ],
  },
  scores: {
    orientation: 'landscape',
    statusKeys: ['Status_Penilaian'],
    columns: [
      { header: 'No', key: '_no', widthWeight: 6, halign: 'center' },
      { header: 'NIM', key: 'NIM', widthWeight: 13 },
      { header: 'Nama Mahasiswa', key: 'Mahasiswa', widthWeight: 18 },
      { header: 'Dosen Penguji', key: 'Penguji', widthWeight: 19 },
      { header: 'Komponen Penilaian', key: 'Komponen_Penilaian', widthWeight: 32 },
      { header: 'Nilai Akhir', key: 'Nilai_Akhir', widthWeight: 11, halign: 'center' },
      { header: 'Grade', key: 'Grade', widthWeight: 8, halign: 'center' },
      { header: 'Status', key: 'Status_Penilaian', widthWeight: 12, halign: 'center' },
    ],
  },
  plagiarism: {
    orientation: 'portrait',
    statusKeys: ['Status_Verifikasi'],
    columns: [
      { header: 'No', key: '_no', widthWeight: 6, halign: 'center' },
      { header: 'NIM', key: 'NIM', widthWeight: 14 },
      { header: 'Nama Mahasiswa', key: 'Mahasiswa', widthWeight: 19 },
      { header: 'Judul Tugas Akhir', key: 'Judul_TA', widthWeight: 28 },
      { header: 'Kemiripan', key: 'Persentase_Kemiripan', widthWeight: 12, halign: 'center' },
      { header: 'Tgl Pemeriksaan', key: 'Tanggal_Pemeriksaan', widthWeight: 15 },
      { header: 'Status', key: 'Status_Verifikasi', widthWeight: 15, halign: 'center' },
    ],
  },
  yudisium: {
    orientation: 'portrait',
    statusKeys: ['Status_Kelengkapan'],
    columns: [
      { header: 'No', key: '_no', widthWeight: 6, halign: 'center' },
      { header: 'NIM', key: 'NIM', widthWeight: 14 },
      { header: 'Nama Mahasiswa', key: 'Mahasiswa', widthWeight: 20 },
      { header: 'Periode', key: 'Periode', widthWeight: 14 },
      { header: 'Persyaratan Yudisium', key: 'Persyaratan_Yudisium', widthWeight: 28 },
      { header: 'Status', key: 'Status_Kelengkapan', widthWeight: 14, halign: 'center' },
      { header: 'Tgl Yudisium', key: 'Tanggal_Yudisium', widthWeight: 14 },
    ],
  },
  graduations: {
    orientation: 'landscape',
    statusKeys: ['Status_Kelulusan'],
    columns: [
      { header: 'No', key: '_no', widthWeight: 6, halign: 'center' },
      { header: 'NIM', key: 'NIM', widthWeight: 13 },
      { header: 'Nama Mahasiswa', key: 'Mahasiswa', widthWeight: 18 },
      { header: 'Program Studi', key: 'Prodi', widthWeight: 15 },
      { header: 'Judul Tugas Akhir', key: 'Judul_TA', widthWeight: 29 },
      { header: 'Nilai / Grade', key: 'Nilai_Grade', widthWeight: 12, halign: 'center' },
      { header: 'Tgl Penyelesaian', key: 'Tanggal_Penyelesaian', widthWeight: 15 },
      { header: 'Status', key: 'Status_Kelulusan', widthWeight: 13, halign: 'center' },
    ],
  },
  delayed: {
    orientation: 'portrait',
    statusKeys: ['Status_Penyelesaian'],
    columns: [
      { header: 'No', key: '_no', widthWeight: 6, halign: 'center' },
      { header: 'NIM', key: 'NIM', widthWeight: 14 },
      { header: 'Nama Mahasiswa', key: 'Mahasiswa', widthWeight: 21 },
      { header: 'Smt', key: 'Semester', widthWeight: 8, halign: 'center' },
      { header: 'Tahapan Terlambat', key: 'Tahapan_Terlambat', widthWeight: 21 },
      { header: 'Durasi Terlambat', key: 'Durasi_Keterlambatan', widthWeight: 18 },
      { header: 'Status', key: 'Status_Penyelesaian', widthWeight: 14, halign: 'center' },
    ],
  },
};

function drawReportCrest(doc: jsPDF, cx: number, cy: number) {
  doc.setDrawColor(15, 23, 42);
  doc.setFillColor(248, 250, 252);
  doc.setLineWidth(0.7);
  doc.circle(cx, cy, 9.5, 'FD');

  doc.setDrawColor(29, 78, 216);
  doc.setLineWidth(0.35);
  doc.circle(cx, cy, 8.0, 'S');

  doc.setFillColor(15, 23, 42);
  doc.setDrawColor(180, 83, 9);
  doc.setLineWidth(0.35);
  doc.roundedRect(cx - 4.0, cy - 4.6, 8.0, 6.8, 1.2, 1.2, 'FD');

  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.4);
  doc.line(cx, cy - 3.2, cx, cy + 0.5);
  doc.line(cx - 2.6, cy - 2.8, cx, cy - 2.1);
  doc.line(cx + 2.6, cy - 2.8, cx, cy - 2.1);
  doc.line(cx - 2.6, cy - 0.1, cx, cy + 0.5);
  doc.line(cx + 2.6, cy - 0.1, cx, cy + 0.5);

  doc.setFont('times', 'bold');
  doc.setFontSize(5);
  doc.setTextColor(15, 23, 42);
  doc.text('TA FLOW', cx, cy + 5.1, { align: 'center' });
}

function getAccentRgb(accent?: ReportSummaryStat['accent']): [number, number, number] {
  switch (accent) {
    case 'emerald':
      return [5, 150, 105];
    case 'amber':
      return [217, 119, 6];
    case 'rose':
      return [225, 29, 72];
    case 'cyan':
      return [8, 145, 178];
    default:
      return [29, 78, 216];
  }
}

function getStatusTextColor(value: string): [number, number, number] | null {
  const lower = value.toLowerCase();
  if (
    lower.includes('approved') ||
    lower.includes('disetujui') ||
    lower.includes('completed') ||
    lower.includes('selesai') ||
    lower.includes('graduated') ||
    lower.includes('lulus') ||
    lower === 'final' ||
    lower.includes('lolos')
  ) {
    return [4, 120, 87];
  }
  if (
    lower.includes('rejected') ||
    lower.includes('ditolak') ||
    lower.includes('terlambat') ||
    lower.includes('melebihi')
  ) {
    return [190, 18, 60];
  }
  if (
    lower.includes('revision') ||
    lower.includes('revisi') ||
    lower.includes('pending') ||
    lower.includes('menunggu') ||
    lower.includes('verification') ||
    lower.includes('under') ||
    lower.includes('draft')
  ) {
    return [180, 83, 9];
  }
  if (lower.includes('scheduled') || lower.includes('terjadwal') || lower.includes('submitted')) {
    return [29, 78, 216];
  }
  return null;
}

export function generateAcademicReportPdf(payload: AcademicReportPdfPayload): Blob {
  const config = REPORT_LAYOUTS[payload.reportType];
  const isLandscape = config.orientation === 'landscape';

  const doc = new jsPDF({
    orientation: config.orientation,
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = isLandscape ? 297 : 210;
  const pageHeight = isLandscape ? 210 : 297;
  const marginX = 16;
  const marginTop = 14;
  const marginBottom = 18;
  const contentWidth = pageWidth - marginX * 2;
  const centerX = pageWidth / 2;

  // ========================================================================
  // 1. KOP DOKUMEN RESMI
  // ========================================================================
  drawReportCrest(doc, marginX + 10.5, marginTop + 9.5);

  const headerTextCenterX = marginX + 22 + (contentWidth - 22) / 2;
  doc.setTextColor(15, 23, 42);
  doc.setFont('times', 'bold');
  doc.setFontSize(10);
  doc.text(
    `${payload.institutionName.toUpperCase()} — SISTEM AKADEMIK TUGAS AKHIR`,
    headerTextCenterX,
    marginTop + 4.5,
    { align: 'center', maxWidth: contentWidth - 24 }
  );

  doc.setFontSize(12.5);
  doc.text(payload.facultyName.toUpperCase(), headerTextCenterX, marginTop + 10, {
    align: 'center',
    maxWidth: contentWidth - 24,
  });

  doc.setFontSize(10);
  doc.text(`PROGRAM STUDI: ${payload.programName.toUpperCase()}`, headerTextCenterX, marginTop + 14.8, {
    align: 'center',
    maxWidth: contentWidth - 24,
  });

  doc.setFont('times', 'italic');
  doc.setFontSize(8.2);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Dokumen Laporan Akademik Resmi · ${payload.contactEmail || 'akademik@taflow.ac.id'}`,
    headerTextCenterX,
    marginTop + 19,
    { align: 'center', maxWidth: contentWidth - 24 }
  );

  let y = marginTop + 22.5;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.8);
  doc.line(marginX, y, pageWidth - marginX, y);
  doc.setLineWidth(0.28);
  doc.line(marginX, y + 1.2, pageWidth - marginX, y + 1.2);

  // ========================================================================
  // 2. JUDUL LAPORAN & METADATA PERIODE / FILTER
  // ========================================================================
  y += 7;
  doc.setTextColor(15, 23, 42);
  doc.setFont('times', 'bold');
  doc.setFontSize(12.5);
  doc.text(payload.reportTitle.toUpperCase(), centerX, y, {
    align: 'center',
    maxWidth: contentWidth,
  });

  y += 4.6;
  doc.setFont('times', 'normal');
  doc.setFontSize(8.8);
  doc.setTextColor(71, 85, 105);
  doc.text(payload.reportSubtitle, centerX, y, {
    align: 'center',
    maxWidth: contentWidth,
  });

  // Metadata Box
  y += 4.5;
  const metaHeight = 14;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, y, contentWidth, metaHeight, 1.5, 1.5, 'FD');

  const colMid = marginX + contentWidth * 0.52;
  doc.setFont('times', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(51, 65, 85);
  doc.text('Periode Akademik', marginX + 3.5, y + 5.2);
  doc.text('Rentang Tanggal', marginX + 3.5, y + 10.4);
  doc.text('Program Studi', colMid, y + 5.2);
  doc.text('Tanggal Pembuatan', colMid, y + 10.4);

  doc.setFont('times', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(`: ${payload.periodLabel}`, marginX + 33, y + 5.2, {
    maxWidth: contentWidth * 0.5 - 36,
  });
  doc.text(`: ${payload.dateRangeLabel}`, marginX + 33, y + 10.4, {
    maxWidth: contentWidth * 0.5 - 36,
  });
  doc.text(`: ${payload.programName}`, colMid + 29, y + 5.2, {
    maxWidth: contentWidth * 0.46 - 30,
  });
  doc.text(
    `: ${payload.generatedAt} (${payload.generatedBy})`,
    colMid + 29,
    y + 10.4,
    { maxWidth: contentWidth * 0.46 - 30 }
  );

  y += metaHeight + 4.5;

  // ========================================================================
  // 3. RINGKASAN STATISTIK (KPI CARDS)
  // ========================================================================
  if (payload.stats.length > 0) {
    const gap = 3;
    const count = payload.stats.length;
    const cardW = (contentWidth - gap * (count - 1)) / count;
    const cardH = 16.5;

    payload.stats.forEach((stat, idx) => {
      const cx = marginX + idx * (cardW + gap);
      const [r, g, b] = getAccentRgb(stat.accent);

      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.roundedRect(cx, y, cardW, cardH, 1.4, 1.4, 'FD');

      // Left accent bar
      doc.setFillColor(r, g, b);
      doc.rect(cx, y, 1.4, cardH, 'F');

      doc.setFont('times', 'bold');
      doc.setFontSize(7.2);
      doc.setTextColor(100, 116, 139);
      doc.text(stat.label.toUpperCase(), cx + 3.6, y + 4.8, { maxWidth: cardW - 5 });

      doc.setFont('times', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.text(stat.value, cx + 3.6, y + 10.5, { maxWidth: cardW - 5 });

      if (stat.hint) {
        doc.setFont('times', 'normal');
        doc.setFontSize(6.8);
        doc.setTextColor(100, 116, 139);
        doc.text(stat.hint, cx + 3.6, y + 14.3, { maxWidth: cardW - 5 });
      }
    });

    y += cardH + 5;
  }

  // ========================================================================
  // 4. TABEL DATA AKTUAL (AUTO-PAGINATE & REPEATING HEADER)
  // ========================================================================
  const totalWeight = config.columns.reduce((sum, col) => sum + col.widthWeight, 0);
  const columnStyles: Record<
    number,
    { cellWidth: number; halign?: 'left' | 'center' | 'right' }
  > = {};
  config.columns.forEach((col, idx) => {
    columnStyles[idx] = {
      cellWidth: (col.widthWeight / totalWeight) * contentWidth,
      halign: col.halign || 'left',
    };
  });

  const bodyRows =
    payload.rows.length > 0
      ? payload.rows.map((row, rowIdx) =>
          config.columns.map((col) => {
            if (col.key === '_no') return String(rowIdx + 1);
            const raw = row[col.key];
            return raw === null || raw === undefined || raw === '' ? '—' : String(raw);
          })
        )
      : [
          [
            {
              content:
                'Tidak ditemukan data laporan untuk kombinasi jenis laporan, program studi, periode, atau filter yang dipilih.',
              colSpan: config.columns.length,
              styles: {
                halign: 'center' as const,
                fontStyle: 'italic' as const,
                textColor: [100, 116, 139] as [number, number, number],
                cellPadding: 8,
              },
            },
          ],
        ];

  const statusColumnIndices = new Set(
    config.columns
      .map((c, idx) => (config.statusKeys.includes(c.key) ? idx : -1))
      .filter((idx) => idx >= 0)
  );

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX, top: 20, bottom: marginBottom + 2 },
    head: [config.columns.map((c) => c.header)],
    body: bodyRows,
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    theme: 'grid',
    styles: {
      font: 'times',
      fontSize: isLandscape ? 8.3 : 8.0,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.22,
      cellPadding: { top: 2.4, right: 2.3, bottom: 2.4, left: 2.3 },
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: isLandscape ? 8.4 : 8.0,
      halign: 'left',
      cellPadding: { top: 2.8, right: 2.3, bottom: 2.8, left: 2.3 },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles,
    didParseCell: (hookData: CellHookData) => {
      if (hookData.section === 'head') {
        const colSpec = config.columns[hookData.column.index];
        if (colSpec?.halign) {
          hookData.cell.styles.halign = colSpec.halign;
        }
      }
      if (hookData.section === 'body' && statusColumnIndices.has(hookData.column.index)) {
        const textVal = String(hookData.cell.raw ?? '');
        const rgb = getStatusTextColor(textVal);
        if (rgb) {
          hookData.cell.styles.textColor = rgb;
          hookData.cell.styles.fontStyle = 'bold';
        }
      }
    },
    didDrawPage: (hookData) => {
      // Compact continuation banner on Page 2+
      if (hookData.pageNumber > 1) {
        doc.setFont('times', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(51, 65, 85);
        doc.text(
          `${payload.institutionName.toUpperCase()} · ${payload.reportTitle.toUpperCase()}`,
          marginX,
          11
        );
        doc.setFont('times', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(
          `Periode: ${payload.periodLabel} · Prodi: ${payload.programName}`,
          pageWidth - marginX,
          11,
          { align: 'right' }
        );
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.3);
        doc.line(marginX, 13.5, pageWidth - marginX, 13.5);
      }
    },
  });

  // ========================================================================
  // 5. AREA TANDA TANGAN PEJABAT (ON FINAL PAGE OR NEW PAGE IF NEEDED)
  // ========================================================================
  const lastTableY =
    (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
  let sigY = lastTableY + 9;
  const requiredSigHeight = 38;

  if (sigY + requiredSigHeight > pageHeight - marginBottom) {
    doc.addPage();
    sigY = 24;
  }

  const sigX = pageWidth - marginX - 68;
  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(`Diterbitkan di Kampus Akademik, ${formatIndonesianLongDate(new Date().toISOString())}`, sigX, sigY);
  doc.text('Mengetahui,', sigX, sigY + 4.8);
  doc.setFont('times', 'bold');
  doc.text(payload.signerTitle, sigX, sigY + 9.4, { maxWidth: 66 });

  doc.setFont('times', 'bold');
  doc.text(payload.signerName, sigX, sigY + 27.5, { maxWidth: 66 });
  const nameLineW = Math.min(64, doc.getTextWidth(payload.signerName));
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.3);
  doc.line(sigX, sigY + 28.5, sigX + nameLineW, sigY + 28.5);

  doc.setFont('times', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(71, 85, 105);
  doc.text(
    payload.signerNip ? `NIP/ID. ${payload.signerNip}` : `Peran: ${payload.generatedByRole}`,
    sigX,
    sigY + 32.8
  );

  // ========================================================================
  // 6. FOOTER IDENTITAS TA FLOW & NOMOR HALAMAN DI SEMUA HALAMAN
  // ========================================================================
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    const footerLineY = pageHeight - 12.5;
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.28);
    doc.line(marginX, footerLineY, pageWidth - marginX, footerLineY);

    doc.setFont('times', 'italic');
    doc.setFontSize(7.8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `TA FLOW · Laporan Akademik Terintegrasi (${payload.institutionName})`,
      marginX,
      pageHeight - 8.2
    );
    doc.text(
      `Halaman ${p} dari ${totalPages}`,
      pageWidth - marginX,
      pageHeight - 8.2,
      { align: 'right' }
    );
  }

  return doc.output('blob');
}
