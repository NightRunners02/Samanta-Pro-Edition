import { jsPDF } from 'jspdf';
import type {
  DecreeType,
  OfficialDecreeSnapshot,
} from '../types/database';

export interface DecreePdfInput {
  decreeType: DecreeType;
  letterNumber: string;
  issuedDate: string;
  issuerName: string;
  issuerTitle: string;
  issuerNip?: string | null;
  institutionName: string;
  facultyName: string;
  programName: string;
  contactEmail?: string | null;
  versionNumber: number;
  snapshot: OfficialDecreeSnapshot;
  verificationCode: string;
}

const INDONESIAN_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export function formatIndonesianLongDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return dateStr;
  const day = parsed.getDate();
  const month = INDONESIAN_MONTHS[parsed.getMonth()] || '';
  const year = parsed.getFullYear();
  return `${day} ${month} ${year}`;
}

function drawAcademicEmblem(doc: jsPDF, cx: number, cy: number, code: string) {
  // Outer deep navy double crest ring
  doc.setDrawColor(15, 23, 42);
  doc.setFillColor(248, 250, 252);
  doc.setLineWidth(0.75);
  doc.circle(cx, cy, 10.5, 'FD');

  doc.setDrawColor(29, 78, 216);
  doc.setLineWidth(0.35);
  doc.circle(cx, cy, 8.8, 'S');

  // Inner shield silhouette
  doc.setFillColor(15, 23, 42);
  doc.setDrawColor(180, 83, 9);
  doc.setLineWidth(0.4);
  doc.roundedRect(cx - 4.4, cy - 5.2, 8.8, 7.6, 1.4, 1.4, 'FD');

  // Open book motif inside shield
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.45);
  doc.line(cx, cy - 3.6, cx, cy + 0.6);
  doc.line(cx - 3.0, cy - 3.2, cx, cy - 2.4);
  doc.line(cx + 3.0, cy - 3.2, cx, cy - 2.4);
  doc.line(cx - 3.0, cy - 0.1, cx, cy + 0.6);
  doc.line(cx + 3.0, cy - 0.1, cx, cy + 0.6);

  // Faculty code banner below shield
  doc.setFont('times', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(15, 23, 42);
  doc.text((code || 'AKAD').slice(0, 8).toUpperCase(), cx, cy + 5.7, { align: 'center' });
}

function drawOfficialStamp(
  doc: jsPDF,
  cx: number,
  cy: number,
  facultyCode: string,
  institutionShort: string
) {
  doc.saveGraphicsState();
  // Soft deep indigo official ink tone
  doc.setDrawColor(30, 58, 138);
  doc.setTextColor(30, 58, 138);
  doc.setLineWidth(0.55);
  doc.circle(cx, cy, 12.5, 'S');

  doc.setLineWidth(0.25);
  doc.circle(cx, cy, 11.4, 'S');
  doc.circle(cx, cy, 7.6, 'S');

  doc.setFont('times', 'bold');
  doc.setFontSize(5.2);
  doc.text(institutionShort.slice(0, 18).toUpperCase(), cx, cy - 8.7, { align: 'center' });
  doc.text('RESMI TERVERIFIKASI', cx, cy + 9.8, { align: 'center' });

  doc.setFontSize(6.8);
  doc.text((facultyCode || 'FAKULTAS').slice(0, 10).toUpperCase(), cx, cy - 0.4, { align: 'center' });
  doc.setFont('times', 'normal');
  doc.setFontSize(4.8);
  doc.text('AKADEMIK TA', cx, cy + 2.8, { align: 'center' });
  doc.restoreGraphicsState();
}

function drawSignatureStroke(doc: jsPDF, x: number, y: number) {
  doc.saveGraphicsState();
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.45);
  // Crisp formal calligraphic flourish
  doc.lines(
    [
      [5, -4],
      [4, 5],
      [6, -6],
      [5, 4],
      [9, -2],
      [-18, 3],
      [24, -1],
    ],
    x,
    y
  );
  doc.restoreGraphicsState();
}

export function generateOfficialDecreePdf(input: DecreePdfInput): Blob {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginLeft = 24;
  const marginRight = 22;
  const contentWidth = pageWidth - marginLeft - marginRight; // 164mm
  const centerX = marginLeft + contentWidth / 2;

  const ensureSpace = (currentY: number, neededHeight: number): number => {
    if (currentY + neededHeight > pageHeight - 24) {
      doc.addPage();
      return 22;
    }
    return currentY;
  };

  // ========================================================================
  // 1. KOP SURAT RESMI (UNIVERSITY & FACULTY LETTERHEAD)
  // ========================================================================
  const facultyCode = input.snapshot.faculty_code || 'FAK';
  drawAcademicEmblem(doc, marginLeft + 11, 24.5, facultyCode);

  const kopCenterX = marginLeft + 24 + (contentWidth - 24) / 2;
  doc.setTextColor(15, 23, 42);

  doc.setFont('times', 'bold');
  doc.setFontSize(10);
  doc.text(
    `SISTEM AKADEMIK TUGAS AKHIR · ${input.institutionName.toUpperCase()}`,
    kopCenterX,
    17.5,
    { align: 'center', maxWidth: contentWidth - 26 }
  );

  doc.setFontSize(12.5);
  doc.text(input.facultyName.toUpperCase(), kopCenterX, 23, {
    align: 'center',
    maxWidth: contentWidth - 26,
  });

  const degreeLabel = input.snapshot.program_degree ? `${input.snapshot.program_degree} ` : '';
  doc.setFontSize(10.5);
  doc.text(
    `PROGRAM STUDI ${degreeLabel}${input.programName.toUpperCase()}`,
    kopCenterX,
    28.2,
    { align: 'center', maxWidth: contentWidth - 26 }
  );

  doc.setFont('times', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Layanan Administrasi Tugas Akhir Terintegrasi · ${input.contactEmail || 'akademik@taflow.ac.id'}`,
    kopCenterX,
    33.2,
    { align: 'center', maxWidth: contentWidth - 26 }
  );

  // Double horizontal dividing line
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.9);
  doc.line(marginLeft, 37.5, pageWidth - marginRight, 37.5);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, 38.8, pageWidth - marginRight, 38.8);

  // ========================================================================
  // 2. JUDUL SURAT & NOMOR SURAT
  // ========================================================================
  let y = 47;
  doc.setTextColor(15, 23, 42);
  doc.setFont('times', 'bold');
  doc.setFontSize(11.5);
  doc.text(`SURAT KEPUTUSAN DEKAN ${input.facultyName.toUpperCase()}`, centerX, y, {
    align: 'center',
    maxWidth: contentWidth,
  });

  y += 5.2;
  doc.setFont('times', 'normal');
  doc.setFontSize(10.5);
  doc.text(`Nomor : ${input.letterNumber}`, centerX, y, { align: 'center' });

  y += 7;
  doc.setFont('times', 'bold');
  doc.setFontSize(10);
  doc.text('TENTANG', centerX, y, { align: 'center' });

  y += 5.2;
  doc.setFontSize(10.5);
  const decreeTitle =
    input.decreeType === 'sk_pembimbing'
      ? 'PENETAPAN DOSEN PEMBIMBING TUGAS AKHIR MAHASISWA'
      : 'PENETAPAN DEWAN PENGUJI SIDANG TUGAS AKHIR MAHASISWA';
  doc.text(decreeTitle, centerX, y, { align: 'center', maxWidth: contentWidth });

  // ========================================================================
  // 3. KONSIDERANS (MENIMBANG, MENGINGAT, MEMPERHATIKAN)
  // ========================================================================
  y += 9;
  doc.setFont('times', 'bold');
  doc.setFontSize(10);
  doc.text(`Dekan ${input.facultyName},`, marginLeft, y);

  const labelWidth = 31;
  const colonX = marginLeft + labelWidth;
  const textX = colonX + 4;
  const textMaxW = contentWidth - labelWidth - 4;

  const renderClauseRow = (label: string, items: string[]) => {
    doc.setFont('times', 'normal');
    doc.setFontSize(9.8);
    let estimatedH = 0;
    const wrappedItems = items.map((item) => {
      const lines = doc.splitTextToSize(item, textMaxW);
      estimatedH += lines.length * 4.4 + 1.2;
      return lines;
    });

    y = ensureSpace(y, estimatedH + 4);
    doc.setFont('times', 'bold');
    doc.text(label, marginLeft, y);
    doc.text(':', colonX, y);

    doc.setFont('times', 'normal');
    for (const lines of wrappedItems) {
      doc.text(lines, textX, y, { lineHeightFactor: 1.28 });
      y += lines.length * 4.4 + 1.2;
    }
    y += 1.5;
  };

  y += 6;
  renderClauseRow(
    'Menimbang',
    input.decreeType === 'sk_pembimbing'
      ? [
          'a. bahwa untuk kelancaran penyusunan dan pembimbingan Tugas Akhir mahasiswa, perlu ditetapkan Dosen Pembimbing yang memiliki kompetensi sesuai bidang kajian;',
          'b. bahwa dosen yang namanya tercantum dalam Surat Keputusan ini dipandang cakap dan memenuhi syarat akademik untuk melaksanakan tugas pembimbingan.',
        ]
      : [
          'a. bahwa dalam rangka pelaksanaan Ujian Sidang Tugas Akhir mahasiswa sebagai evaluasi akhir capaian akademik, perlu dibentuk Dewan Penguji yang objektif dan kompeten;',
          'b. bahwa dosen yang namanya tercantum dalam Surat Keputusan ini memenuhi kualifikasi untuk bertugas sebagai Ketua dan Anggota Dewan Penguji.',
        ]
  );

  renderClauseRow('Mengingat', [
    `1. Pedoman Akademik Penyelenggaraan Tugas Akhir ${input.institutionName} dan ${input.facultyName};`,
    `2. Kalender Akademik ${input.snapshot.period_name} Tahun Akademik ${input.snapshot.academic_year}.`,
  ]);

  renderClauseRow(
    'Memperhatikan',
    input.decreeType === 'sk_pembimbing'
      ? [
          `Hasil persetujuan usulan judul Tugas Akhir dan penetapan dosen pembimbing oleh Program Studi ${input.programName}.`,
        ]
      : [
          `Persetujuan kelayakan sidang akhir dan penetapan jadwal Dewan Penguji oleh Program Studi ${input.programName}.`,
        ]
  );

  // ========================================================================
  // 4. DIKTUM KEPUTUSAN (MEMUTUSKAN / MENETAPKAN)
  // ========================================================================
  y = ensureSpace(y, 16);
  y += 2;
  doc.setFont('times', 'bold');
  doc.setFontSize(10.5);
  doc.text('MEMUTUSKAN', centerX, y, { align: 'center' });

  y += 6.5;
  doc.setFontSize(10);
  doc.text('Menetapkan', marginLeft, y);
  doc.text(':', colonX, y);

  y += 6;
  const renderDiktumIntro = (diktum: string, body: string) => {
    const lines = doc.splitTextToSize(body, textMaxW);
    y = ensureSpace(y, lines.length * 4.5 + 4);
    doc.setFont('times', 'bold');
    doc.setFontSize(9.8);
    doc.text(diktum, marginLeft, y);
    doc.text(':', colonX, y);
    doc.setFont('times', 'normal');
    doc.text(lines, textX, y, { lineHeightFactor: 1.28 });
    y += lines.length * 4.5 + 2.5;
  };

  renderDiktumIntro(
    'PERTAMA',
    input.decreeType === 'sk_pembimbing'
      ? 'Menetapkan Dosen Pembimbing Tugas Akhir bagi mahasiswa berikut untuk periode akademik berjalan:'
      : 'Menetapkan Susunan Dewan Penguji Sidang Tugas Akhir bagi mahasiswa berikut:'
  );

  // Formal Identity Box for Student + Thesis Title
  const titleLines = doc.splitTextToSize(`"${input.snapshot.thesis_title}"`, contentWidth - 46);
  const infoBoxHeight = 25 + titleLines.length * 4.3;
  y = ensureSpace(y, infoBoxHeight + 6);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.35);
  doc.rect(marginLeft, y, contentWidth, infoBoxHeight, 'FD');

  let boxY = y + 5.5;
  const drawBoxField = (key: string, val: string, boldVal = false) => {
    doc.setFont('times', 'normal');
    doc.setFontSize(9.5);
    doc.text(key, marginLeft + 4, boxY);
    doc.text(':', marginLeft + 38, boxY);
    doc.setFont('times', boldVal ? 'bold' : 'normal');
    doc.text(val, marginLeft + 41, boxY);
    boxY += 5;
  };

  drawBoxField('Nama Mahasiswa', input.snapshot.student_name, true);
  drawBoxField('NIM', input.snapshot.student_nim);
  drawBoxField('Program Studi', `${degreeLabel}${input.programName} — ${input.snapshot.period_name}`);

  doc.setFont('times', 'normal');
  doc.text('Judul Tugas Akhir', marginLeft + 4, boxY);
  doc.text(':', marginLeft + 38, boxY);
  doc.setFont('times', 'bold');
  doc.text(titleLines, marginLeft + 41, boxY, { lineHeightFactor: 1.25 });

  y += infoBoxHeight + 4.5;

  // Assignees Table (Supervisors or Examiners + Schedule)
  if (input.decreeType === 'sk_penguji' && input.snapshot.exam_date) {
    y = ensureSpace(y, 12);
    doc.setFont('times', 'normal');
    doc.setFontSize(9.5);
    const schedLine = `Pelaksanaan Sidang: ${formatIndonesianLongDate(input.snapshot.exam_date)}${
      input.snapshot.exam_time ? ` · Pukul ${input.snapshot.exam_time}` : ''
    }${input.snapshot.room_name ? ` · Ruang ${input.snapshot.room_name}` : ''}`;
    doc.text(schedLine, marginLeft, y);
    y += 5;
  }

  const personnel =
    input.decreeType === 'sk_pembimbing'
      ? input.snapshot.supervisors || []
      : input.snapshot.examiners || [];

  const colNoW = 10;
  const colRoleW = 40;
  const colNameW = 72;
  const colNipW = contentWidth - colNoW - colRoleW - colNameW;

  y = ensureSpace(y, 18 + personnel.length * 8);
  // Table Header
  doc.setFillColor(226, 232, 240);
  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.35);
  doc.rect(marginLeft, y, contentWidth, 7, 'FD');
  doc.setFont('times', 'bold');
  doc.setFontSize(9);
  doc.text('No', marginLeft + colNoW / 2, y + 4.7, { align: 'center' });
  doc.text('Kedudukan / Peran', marginLeft + colNoW + 2.5, y + 4.7);
  doc.text('Nama Dosen & Gelar', marginLeft + colNoW + colRoleW + 2.5, y + 4.7);
  doc.text('NIP / NIDN', marginLeft + colNoW + colRoleW + colNameW + 2.5, y + 4.7);

  // Vertical dividers header
  doc.line(marginLeft + colNoW, y, marginLeft + colNoW, y + 7);
  doc.line(marginLeft + colNoW + colRoleW, y, marginLeft + colNoW + colRoleW, y + 7);
  doc.line(marginLeft + colNoW + colRoleW + colNameW, y, marginLeft + colNoW + colRoleW + colNameW, y + 7);
  y += 7;

  personnel.forEach((person, idx) => {
    const nameLines = doc.splitTextToSize(person.full_name, colNameW - 5);
    const rowH = Math.max(7.2, nameLines.length * 4.2 + 3);
    y = ensureSpace(y, rowH + 2);

    doc.setDrawColor(148, 163, 184);
    doc.rect(marginLeft, y, contentWidth, rowH, 'S');
    doc.line(marginLeft + colNoW, y, marginLeft + colNoW, y + rowH);
    doc.line(marginLeft + colNoW + colRoleW, y, marginLeft + colNoW + colRoleW, y + rowH);
    doc.line(marginLeft + colNoW + colRoleW + colNameW, y, marginLeft + colNoW + colRoleW + colNameW, y + rowH);

    doc.setFont('times', 'normal');
    doc.setFontSize(9.2);
    doc.text(String(idx + 1), marginLeft + colNoW / 2, y + 4.8, { align: 'center' });
    doc.setFont('times', 'bold');
    doc.text(person.role_label, marginLeft + colNoW + 2.5, y + 4.8);
    doc.text(nameLines, marginLeft + colNoW + colRoleW + 2.5, y + 4.8, { lineHeightFactor: 1.2 });
    doc.setFont('times', 'normal');
    doc.text(person.nim_nip || '-', marginLeft + colNoW + colRoleW + colNameW + 2.5, y + 4.8);
    y += rowH;
  });

  y += 5.5;
  renderDiktumIntro(
    'KEDUA',
    input.decreeType === 'sk_pembimbing'
      ? 'Dosen Pembimbing bertugas memberikan arahan substansi, metodologi, serta melakukan verifikasi progres Bab 1 sampai Bab 5 hingga mahasiswa siap mengikuti seminar dan sidang.'
      : 'Dewan Penguji bertugas menyelenggarakan ujian sidang akhir, menguji penguasaan materi, memberikan catatan revisi akademik, serta menetapkan penilaian sesuai rubrik yang berlaku.'
  );

  renderDiktumIntro(
    'KETIGA',
    `Keputusan ini berlaku sejak tanggal ditetapkan dan apabila di kemudian hari terdapat perubahan penugasan atau kekeliruan, akan dilakukan penerbitan ulang sebagaimana mestinya (Versi Dokumen: v${input.versionNumber}).`
  );

  // ========================================================================
  // 5. TANGGAL PENERBITAN, IDENTITAS PEJABAT, TANDA TANGAN & STEMPEL RESMI
  // ========================================================================
  y = ensureSpace(y, 52);
  y += 4;
  const sigX = marginLeft + 92;
  doc.setFont('times', 'normal');
  doc.setFontSize(9.8);
  doc.text('Ditetapkan di', sigX, y);
  doc.text(':', sigX + 24, y);
  doc.text(input.institutionName, sigX + 27, y, { maxWidth: 45 });

  y += 4.8;
  doc.text('Pada tanggal', sigX, y);
  doc.text(':', sigX + 24, y);
  doc.text(formatIndonesianLongDate(input.issuedDate), sigX + 27, y);

  y += 5.8;
  doc.setFont('times', 'bold');
  const issuerTitleLines = doc.splitTextToSize(input.issuerTitle, 72);
  doc.text(issuerTitleLines, sigX, y);
  y += issuerTitleLines.length * 4.5;

  // Stamp overlapping left of signature area + signature flourish
  const stampCenterX = sigX + 4;
  const stampCenterY = y + 11;
  drawOfficialStamp(doc, stampCenterX, stampCenterY, facultyCode, input.institutionName);
  drawSignatureStroke(doc, sigX + 18, y + 12);

  y += 22.5;
  doc.setFont('times', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(input.issuerName, sigX, y);
  const nameW = Math.min(70, doc.getTextWidth(input.issuerName));
  doc.setLineWidth(0.35);
  doc.line(sigX, y + 1, sigX + nameW, y + 1);

  y += 4.8;
  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  doc.text(
    input.issuerNip ? `NIP/NIDN. ${input.issuerNip}` : 'Pejabat Penerbit Akademik Terdaftar',
    sigX,
    y
  );

  // ========================================================================
  // 6. OFFICIAL DIGITAL FOOTER ON ALL PAGES
  // ========================================================================
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.line(marginLeft, pageHeight - 15, pageWidth - marginRight, pageHeight - 15);
    doc.setFont('times', 'italic');
    doc.setFontSize(7.8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Arsip Resmi ${input.institutionName} · No. ${input.letterNumber} · Kode Verifikasi: ${input.verificationCode} · v${input.versionNumber}`,
      marginLeft,
      pageHeight - 11
    );
    doc.text(`Halaman ${p} dari ${totalPages}`, pageWidth - marginRight, pageHeight - 11, {
      align: 'right',
    });
  }

  return doc.output('blob');
}
