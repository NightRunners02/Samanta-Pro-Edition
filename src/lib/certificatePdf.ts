import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import type {
  CertificateStatus,
  CertificateTemplateStyle,
  GraduationCertificateMetadata,
} from '../types/database';
import { formatIndonesianLongDate } from './decreePdf';

export interface CertificatePdfInput {
  certificateNumber: string;
  certificateType: string;
  issueDate: string;
  graduationDate: string;
  certificateStatus: CertificateStatus;
  verificationCode: string;
  verificationUrl: string;
  version: number;
  metadata: GraduationCertificateMetadata;
  logoUrl?: string | null;
  signatureImageUrl?: string | null;
  stampImageUrl?: string | null;
}

interface PaletteSpec {
  primary: [number, number, number];
  accent: [number, number, number];
  borderLight: [number, number, number];
  tintBg: [number, number, number];
  muted: [number, number, number];
}

const PALETTES: Record<CertificateTemplateStyle, PaletteSpec> = {
  academic_navy: {
    primary: [15, 35, 72], // Deep Royal Navy
    accent: [180, 134, 42], // Antique Gold
    borderLight: [203, 213, 225],
    tintBg: [248, 250, 253],
    muted: [71, 85, 105],
  },
  classic_gold: {
    primary: [92, 24, 34], // Academic Crimson / Burgundy
    accent: [176, 128, 36], // Rich Gold
    borderLight: [226, 212, 184],
    tintBg: [253, 251, 246],
    muted: [92, 82, 72],
  },
  modern_minimal: {
    primary: [15, 23, 42], // Slate 900
    accent: [29, 78, 216], // Cobalt Blue
    borderLight: [226, 232, 240],
    tintBg: [250, 251, 253],
    muted: [100, 116, 139],
  },
};

async function loadRasterImageDataUrl(url?: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    return await new Promise<string | null>((resolve) => {
      const img = new Image();
      if (!url.startsWith('data:') && !url.startsWith('blob:')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => {
        try {
          const w = Math.max(img.naturalWidth || 256, 256);
          const h = Math.max(img.naturalHeight || 256, 256);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  } catch {
    return null;
  }
}

function drawVectorUniversityCrest(
  doc: jsPDF,
  cx: number,
  cy: number,
  palette: PaletteSpec,
  code: string
) {
  doc.saveGraphicsState();
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...palette.primary);
  doc.setLineWidth(0.7);
  doc.circle(cx, cy, 9.5, 'FD');

  doc.setDrawColor(...palette.accent);
  doc.setLineWidth(0.4);
  doc.circle(cx, cy, 8.0, 'S');

  // Inner shield motif
  doc.setFillColor(...palette.primary);
  doc.roundedRect(cx - 3.8, cy - 4.5, 7.6, 6.4, 1.2, 1.2, 'F');

  // Open book inside crest
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.38);
  doc.line(cx, cy - 3.1, cx, cy + 0.5);
  doc.line(cx - 2.4, cy - 2.7, cx, cy - 2.0);
  doc.line(cx + 2.4, cy - 2.7, cx, cy - 2.0);
  doc.line(cx - 2.4, cy - 0.1, cx, cy + 0.5);
  doc.line(cx + 2.4, cy - 0.1, cx, cy + 0.5);

  doc.setFont('times', 'bold');
  doc.setFontSize(4.6);
  doc.setTextColor(...palette.primary);
  doc.text((code || 'UNIV').slice(0, 6).toUpperCase(), cx, cy + 5.2, { align: 'center' });
  doc.restoreGraphicsState();
}

function drawCornerOrnaments(
  doc: jsPDF,
  width: number,
  height: number,
  margin: number,
  palette: PaletteSpec,
  style: CertificateTemplateStyle
) {
  doc.saveGraphicsState();

  // Outer crisp background border
  doc.setFillColor(...palette.tintBg);
  doc.rect(margin, margin, width - margin * 2, height - margin * 2, 'F');

  // Inner white certificate sheet
  doc.setFillColor(255, 255, 255);
  doc.rect(margin + 3.5, margin + 3.5, width - (margin + 3.5) * 2, height - (margin + 3.5) * 2, 'F');

  // Outer Primary Frame
  doc.setDrawColor(...palette.primary);
  doc.setLineWidth(style === 'modern_minimal' ? 0.9 : 1.35);
  doc.rect(margin, margin, width - margin * 2, height - margin * 2, 'S');

  // Accent Middle Rule
  doc.setDrawColor(...palette.accent);
  doc.setLineWidth(0.5);
  doc.rect(margin + 2.2, margin + 2.2, width - (margin + 2.2) * 2, height - (margin + 2.2) * 2, 'S');

  // Fine Inner Frame
  doc.setDrawColor(...palette.primary);
  doc.setLineWidth(0.3);
  doc.rect(margin + 3.8, margin + 3.8, width - (margin + 3.8) * 2, height - (margin + 3.8) * 2, 'S');

  // Ornamental corner brackets on classic & academic styles
  if (style !== 'modern_minimal') {
    const cLen = 13;
    const inset = margin + 3.8;
    const corners: Array<[number, number, number, number]> = [
      [inset, inset, 1, 1],
      [width - inset, inset, -1, 1],
      [inset, height - inset, 1, -1],
      [width - inset, height - inset, -1, -1],
    ];

    doc.setDrawColor(...palette.accent);
    doc.setLineWidth(0.95);
    for (const [cx, cy, dx, dy] of corners) {
      doc.line(cx, cy + dy * 2.5, cx + dx * cLen, cy + dy * 2.5);
      doc.line(cx + dx * 2.5, cy, cx + dx * 2.5, cy + dy * cLen);
      doc.setFillColor(...palette.primary);
      doc.circle(cx + dx * 2.5, cy + dy * 2.5, 1.15, 'F');
    }
  } else {
    // Top & bottom subtle accent bars for modern minimal
    doc.setFillColor(...palette.accent);
    doc.rect(width / 2 - 28, margin, 56, 1.4, 'F');
    doc.rect(width / 2 - 28, height - margin - 1.4, 56, 1.4, 'F');
  }

  doc.restoreGraphicsState();
}

function drawOfficialCertificateStamp(
  doc: jsPDF,
  cx: number,
  cy: number,
  palette: PaletteSpec,
  universityShort: string,
  facultyCode: string
) {
  doc.saveGraphicsState();
  doc.setDrawColor(...palette.primary);
  doc.setTextColor(...palette.primary);
  doc.setLineWidth(0.5);
  doc.circle(cx, cy, 11.5, 'S');

  doc.setLineWidth(0.25);
  doc.circle(cx, cy, 10.4, 'S');
  doc.circle(cx, cy, 6.8, 'S');

  doc.setFont('times', 'bold');
  doc.setFontSize(4.6);
  doc.text(universityShort.slice(0, 20).toUpperCase(), cx, cy - 8.0, { align: 'center' });
  doc.text('DOKUMEN SAH KELULUSAN', cx, cy + 8.9, { align: 'center' });

  doc.setFontSize(6.2);
  doc.text((facultyCode || 'AKADEMIK').slice(0, 10).toUpperCase(), cx, cy - 0.3, { align: 'center' });
  doc.setFont('times', 'normal');
  doc.setFontSize(4.4);
  doc.text('TERVERIFIKASI', cx, cy + 2.7, { align: 'center' });
  doc.restoreGraphicsState();
}

export async function generateGraduationCertificatePdf(
  input: CertificatePdfInput
): Promise<Blob> {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 297;
  const pageHeight = 210;
  const margin = 10;
  const centerX = pageWidth / 2;

  const style: CertificateTemplateStyle = input.metadata.template_style || 'academic_navy';
  const palette = PALETTES[style] || PALETTES.academic_navy;

  // Prepare visual assets in parallel
  const [qrDataUrl, logoDataUrl, signatureDataUrl, stampDataUrl] = await Promise.all([
    QRCode.toDataURL(input.verificationUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 240,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    }),
    loadRasterImageDataUrl(input.logoUrl),
    loadRasterImageDataUrl(input.signatureImageUrl),
    loadRasterImageDataUrl(input.stampImageUrl),
  ]);

  // 1. Borders & Frame
  drawCornerOrnaments(doc, pageWidth, pageHeight, margin, palette, style);

  // 2. Top Institutional Header (Logo + University + Faculty)
  const logoY = 26.5;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', centerX - 9, logoY - 9, 18, 18, undefined, 'FAST');
    } catch {
      drawVectorUniversityCrest(doc, centerX, logoY, palette, input.metadata.faculty_code || 'TA');
    }
  } else {
    drawVectorUniversityCrest(doc, centerX, logoY, palette, input.metadata.faculty_code || 'TA');
  }

  let y = 41.5;
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...palette.primary);
  doc.text(input.metadata.university_name.toUpperCase(), centerX, y, {
    align: 'center',
    maxWidth: 230,
  });

  y += 4.6;
  doc.setFont('times', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...palette.muted);
  doc.text(
    `${input.metadata.faculty_name.toUpperCase()}  ·  PROGRAM STUDI ${input.metadata.program_name.toUpperCase()}`,
    centerX,
    y,
    { align: 'center', maxWidth: 245 }
  );

  if (input.metadata.university_subtitle?.trim()) {
    y += 4;
    doc.setFont('times', 'italic');
    doc.setFontSize(8.2);
    doc.setTextColor(...palette.muted);
    doc.text(input.metadata.university_subtitle.trim(), centerX, y, {
      align: 'center',
      maxWidth: 230,
    });
  }

  // Ornamental divider below header
  y += 3.8;
  doc.setDrawColor(...palette.accent);
  doc.setLineWidth(0.55);
  doc.line(centerX - 68, y, centerX + 68, y);

  // 3. Certificate Title & Certificate Number
  y += 9;
  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...palette.primary);
  doc.text((input.certificateType || 'SERTIFIKAT KELULUSAN TUGAS AKHIR').toUpperCase(), centerX, y, {
    align: 'center',
    maxWidth: 245,
  });

  y += 5.8;
  doc.setFont('times', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...palette.muted);
  doc.text(`Nomor Sertifikat : ${input.certificateNumber}`, centerX, y, { align: 'center' });

  // 4. Presentation Statement & Student Identity
  y += 8;
  doc.setFont('times', 'italic');
  doc.setFontSize(10.5);
  doc.setTextColor(51, 65, 85);
  doc.text('Dengan ini menyatakan bahwa mahasiswa:', centerX, y, { align: 'center' });

  y += 9;
  doc.setFont('times', 'bold');
  const studentNameSize = input.metadata.student_name.length > 34 ? 18.5 : 22;
  doc.setFontSize(studentNameSize);
  doc.setTextColor(...palette.primary);
  doc.text(input.metadata.student_name.toUpperCase(), centerX, y, {
    align: 'center',
    maxWidth: 235,
  });

  // Subtle gold underline below student name
  const nameLineHalfW = Math.min(82, Math.max(48, doc.getTextWidth(input.metadata.student_name.toUpperCase()) / 2 + 8));
  doc.setDrawColor(...palette.accent);
  doc.setLineWidth(0.55);
  doc.line(centerX - nameLineHalfW, y + 2, centerX + nameLineHalfW, y + 2);

  y += 7;
  doc.setFont('times', 'bold');
  doc.setFontSize(10.8);
  doc.setTextColor(30, 41, 59);
  doc.text(
    `NIM : ${input.metadata.student_nim}    |    Program Studi : ${input.metadata.program_name}`,
    centerX,
    y,
    { align: 'center', maxWidth: 240 }
  );

  // 5. Official Completion Statement & Thesis Title Box
  y += 7.5;
  doc.setFont('times', 'normal');
  doc.setFontSize(10.2);
  doc.setTextColor(51, 65, 85);
  const completionText =
    `Telah memenuhi seluruh persyaratan akademik, melaksanakan sidang akhir, serta dinyatakan LULUS yudisium` +
    `${input.metadata.yudisium_period ? ` pada ${input.metadata.yudisium_period}` : ''} ` +
    `dengan Tugas Akhir berjudul:`;
  const completionLines = doc.splitTextToSize(completionText, 224);
  doc.text(completionLines, centerX, y, { align: 'center', lineHeightFactor: 1.32 });
  y += completionLines.length * 4.4 + 2;

  // Dynamic Thesis Title Container
  const titleFontSize = input.metadata.thesis_title.length > 140 ? 10 : 11.2;
  doc.setFont('times', 'bolditalic');
  doc.setFontSize(titleFontSize);
  const wrappedTitle = doc.splitTextToSize(`"${input.metadata.thesis_title}"`, 222);
  const titleBoxH = Math.max(12, wrappedTitle.length * 4.9 + 5.5);

  doc.setFillColor(...palette.tintBg);
  doc.setDrawColor(...palette.borderLight);
  doc.setLineWidth(0.35);
  doc.roundedRect(centerX - 118, y - 3.5, 236, titleBoxH, 1.5, 1.5, 'FD');

  doc.setTextColor(...palette.primary);
  doc.text(wrappedTitle, centerX, y + 1.5, { align: 'center', lineHeightFactor: 1.28 });
  y += titleBoxH + 2.5;

  // Graduation date & Optional Score/Grade summary
  doc.setFont('times', 'normal');
  doc.setFontSize(9.8);
  doc.setTextColor(51, 65, 85);
  const gradSummaryParts = [
    `Dinyatakan lulus pada tanggal ${formatIndonesianLongDate(input.graduationDate)}`,
  ];
  if (input.metadata.final_score !== null && input.metadata.final_score !== undefined) {
    const gradePart = input.metadata.final_grade ? ` (Predikat/Nilai Huruf: ${input.metadata.final_grade})` : '';
    gradSummaryParts.push(`Nilai Akhir Tugas Akhir: ${input.metadata.final_score}${gradePart}`);
  }
  doc.text(gradSummaryParts.join('  ·  '), centerX, y, { align: 'center', maxWidth: 235 });

  // 6. Bottom Footer Band: Left = QR Verification Block, Right = Signatory + Official Stamp
  const bottomAnchorY = 148;

  // Left: QR Verification Box
  const qrBoxX = 24;
  const qrSize = 23;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...palette.borderLight);
  doc.setLineWidth(0.35);
  doc.roundedRect(qrBoxX, bottomAnchorY + 2, 62, 32.5, 1.5, 1.5, 'FD');

  if (qrDataUrl) {
    doc.addImage(qrDataUrl, 'PNG', qrBoxX + 3, bottomAnchorY + 4.5, qrSize, qrSize);
  }

  doc.setFont('times', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...palette.primary);
  doc.text('VERIFIKASI KEASLIAN', qrBoxX + 29, bottomAnchorY + 9.5);

  doc.setFont('times', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(...palette.muted);
  doc.text('Pindai QR untuk memvalidasi', qrBoxX + 29, bottomAnchorY + 13.8);
  doc.text('status resmi sertifikat ini.', qrBoxX + 29, bottomAnchorY + 17.2);

  doc.setFont('courier', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...palette.primary);
  doc.text(input.verificationCode, qrBoxX + 29, bottomAnchorY + 23.2);

  doc.setFont('times', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(...palette.muted);
  doc.text(`Terbit: ${formatIndonesianLongDate(input.issueDate)} · v${input.version}`, qrBoxX + 29, bottomAnchorY + 28.5);

  // Right: Official Signatory & Stamp Block
  const sigCenterX = 224;
  let sigY = bottomAnchorY + 4;
  const issueCity = input.metadata.city?.trim() || input.metadata.university_name;

  doc.setFont('times', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);
  doc.text(`${issueCity}, ${formatIndonesianLongDate(input.issueDate)}`, sigCenterX, sigY, {
    align: 'center',
  });

  sigY += 4.6;
  doc.setFont('times', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...palette.primary);
  const titleLines = doc.splitTextToSize(input.metadata.signatory_title || `Dekan ${input.metadata.faculty_name}`, 84);
  doc.text(titleLines, sigCenterX, sigY, { align: 'center' });
  sigY += titleLines.length * 4.1;

  // Stamp placement (left edge of signature zone)
  if (input.metadata.show_official_stamp) {
    if (stampDataUrl) {
      try {
        doc.addImage(stampDataUrl, 'PNG', sigCenterX - 36, sigY - 1, 21, 21, undefined, 'FAST');
      } catch {
        drawOfficialCertificateStamp(
          doc,
          sigCenterX - 24,
          sigY + 9.5,
          palette,
          input.metadata.university_name,
          input.metadata.faculty_code || 'FAK'
        );
      }
    } else {
      drawOfficialCertificateStamp(
        doc,
        sigCenterX - 24,
        sigY + 9.5,
        palette,
        input.metadata.university_name,
        input.metadata.faculty_code || 'FAK'
      );
    }
  }

  // Optional uploaded signature image OR blank formal signature space (never hardcoded signature strokes unless admin uploaded one)
  if (signatureDataUrl) {
    try {
      doc.addImage(signatureDataUrl, 'PNG', sigCenterX - 18, sigY + 1, 36, 15, undefined, 'FAST');
    } catch {
      // keep clean signing space if raster image fails
    }
  }

  const nameY = bottomAnchorY + 31.5;
  doc.setFont('times', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...palette.primary);
  doc.text(input.metadata.signatory_name, sigCenterX, nameY, { align: 'center', maxWidth: 88 });

  const underlineHalfW = Math.min(40, Math.max(24, doc.getTextWidth(input.metadata.signatory_name) / 2 + 2));
  doc.setDrawColor(...palette.primary);
  doc.setLineWidth(0.35);
  doc.line(sigCenterX - underlineHalfW, nameY + 1.2, sigCenterX + underlineHalfW, nameY + 1.2);

  doc.setFont('times', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...palette.muted);
  doc.text(
    input.metadata.signatory_nip ? `NIP/NIDN. ${input.metadata.signatory_nip}` : 'Pejabat Akademik Berwenang',
    sigCenterX,
    nameY + 5.2,
    { align: 'center' }
  );

  // Subtle status watermark ONLY if certificate is revoked
  if (input.certificateStatus === 'revoked') {
    doc.saveGraphicsState();
    doc.setFont('times', 'bold');
    doc.setFontSize(36);
    doc.setTextColor(220, 38, 38);
    doc.text('REVOKED / TIDAK BERLAKU', centerX, pageHeight / 2 + 12, {
      align: 'center',
      angle: 18,
    });
    doc.restoreGraphicsState();
  }

  return doc.output('blob');
}
