<div align="center">

# TAFlow — Integrated Academic Thesis Management System

**Platform manajemen tugas akhir (skripsi/tesis) terpadu end-to-end — mulai dari pengajuan judul, penetapan pembimbing, bimbingan digital, progres bab, seminar proposal, sidang akhir, verifikasi plagiasi, hingga yudisium.**

[![React](https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.3-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth_&_PostgreSQL-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![Recharts](https://img.shields.io/badge/Recharts-Analytics-22B5BF?style=for-the-badge&logo=chartdotjs&logoColor=white)](https://recharts.org/)
[![Vercel](https://img.shields.io/badge/Vercel-Deploy_Ready-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com/)

[![RBAC](https://img.shields.io/badge/RBAC-5_Academic_Roles-1E40AF?style=flat-square)](#role--permission-matrix)
[![Database](https://img.shields.io/badge/PostgreSQL-22_Tables_+_RLS-0F766E?style=flat-square)](#arsitektur-database--keamanan)
[![Storage](https://img.shields.io/badge/Storage-7_Private_Buckets-0369A1?style=flat-square)](#arsitektur-database--keamanan)
[![Realtime](https://img.shields.io/badge/Realtime-WebSocket_Sync-7C3AED?style=flat-square)](#fitur-unggulan)
[![Dark Mode](https://img.shields.io/badge/UI-Light_%26_Dark_Mode-334155?style=flat-square)](#desain--pengalaman-pengguna)

</div>

---

## Ringkasan Platform

**TAFlow** adalah platform SaaS akademik untuk mengelola seluruh siklus tugas akhir mahasiswa secara terstruktur, transparan, dan real-time. Sistem ini menggabungkan autentikasi berbasis **NIM/NIP**, kontrol akses berbasis peran (**RBAC**), penyimpanan dokumen privat dengan riwayat versi, deteksi bentrok jadwal ujian otomatis, hingga pemantauan kuota dosen pembimbing secara langsung di sidebar navigasi.

---

## Fitur Unggulan

### 1. Autentikasi & Manajemen Akun Berbasis NIM/NIP
- **Login Fleksibel**: Mendukung masuk menggunakan **NIM** (Mahasiswa), **NIP/NIDN** (Dosen & Admin), maupun email akademik.
- **Registrasi Mahasiswa Mandiri**: Mendukung pengisian identitas akademik lengkap (Nama, NIM, Fakultas, Program Studi, Tahun Masuk) dengan email bersifat opsional serta pembuatan akun instan via RPC.
- **Manajemen Profil & Avatar Real-Time**: Pembaruan foto profil (disimpan di bucket privat `avatars` dengan signed URL) langsung tersinkronisasi di top navbar dan seluruh tampilan peran.
- **Keamanan Role Terkontrol**: Pendaftar baru tidak pernah memperoleh hak administrator secara otomatis; perubahan role dan email pengguna hanya dapat dilakukan melalui RPC resmi oleh Administrator.

### 2. Alur Tugas Akhir 9 Tahap (*Progress Stepper*)
Status tugas akhir mahasiswa diperbarui secara otomatis berdasarkan progres aktual pada setiap tahap:

| No | Tahap Tugas Akhir | Modul Terkait | Aktor Utama |
| :-: | :--- | :--- | :--- |
| 1 | **Title Submission** | Pengajuan Judul, Proposal Awal & Persyaratan Prodi | Mahasiswa, Pembimbing, Admin |
| 2 | **Supervisor Assignment** | Penetapan Pembimbing 1 & 2 serta Kuota Bimbingan | Admin Prodi, Super Admin |
| 3 | **Consultation & Guidance** | Permintaan Jadwal, Catatan Revisi & Riwayat Kronologis | Mahasiswa, Dosen Pembimbing |
| 4 | **Proposal Seminar** | Pendaftaran Seminar, ACC Pembimbing & Jadwal Ruang | Mahasiswa, Pembimbing, Admin |
| 5 | **Final Defense Registration** | Validasi Kelengkapan Bab 1–5, Bimbingan & ACC Sidang | Mahasiswa, Pembimbing, Admin |
| 6 | **Final Defense** | Penugasan Penguji, Jadwal Sidang & Anti-Conflict Check | Admin, Penguji, Pembimbing |
| 7 | **Final Assessment** | Rubrik Penilaian, Evaluasi & Catatan Revisi Ujian | Dosen Penguji, Pembimbing |
| 8 | **Plagiarism Verification** | Unggah Dokumen & Cek Ambang Batas Kemiripan | Mahasiswa, Admin Prodi |
| 9 | **Graduation / Yudisium** | Verifikasi Berkas Kelulusan & SK Yudisium | Mahasiswa, Admin Prodi |

### 3. Dashboard Dosen Pembimbing & Penguji
- **Mahasiswa Bimbingan & Sesi Bimbingan Real-Time**: Pengajuan bimbingan baru dari mahasiswa langsung muncul secara real-time di dashboard maupun drawer sesi bimbingan pada halaman Mahasiswa Bimbingan.
- **Persetujuan Satu Kali Klik (Anti-Duplikat)**: Tombol **ACC Seminar** dan **ACC Sidang** terkunci otomatis setelah persetujuan tersimpan di database untuk mencegah klik berulang dan duplikasi notifikasi.
- **Kuota Pembimbing di Sidebar**: Daftar ketersediaan dosen pembimbing beserta rasio beban bimbingan (`terisi/maks`) terintegrasi langsung di struktur navigasi sidebar dan diperbarui secara real-time.
- **Jadwal & Penilaian Penguji**: Dosen penguji dapat melihat jadwal sidang, meninjau dokumen PDF tugas akhir secara inline, mengisi lembar evaluasi, dan menyetujui hasil sidang.

### 4. Operasional & Konfigurasi Administrator
- **Manajemen Pengguna & Institusi**: CRUD real-time untuk Mahasiswa, Dosen, Admin & Role Access, Fakultas, dan Program Studi (termasuk edit email pengguna & pratinjau foto profil).
- **Dynamic Academic Rules**: Admin dapat mengonfigurasi syarat akademik (SKS minimal, IPK minimal, status aktif, batas plagiasi, kuota bimbingan) per program studi dan tahapan tanpa mengubah kode.
- **Deteksi Bentrok Jadwal Otomatis**: Fungsi SQL `check_exam_schedule_conflicts` mencegah bentrok ruangan, mahasiswa, maupun dosen penguji/pembimbing pada jam yang tumpang tindih.
- **Laporan & Audit Trail**: Grafik interaktif dengan **Recharts**, ekspor laporan akademik, serta log aktivitas permanen (`activity_logs`).

---

## Role & Permission Matrix

| Fitur / Hak Akses | Super Admin | Admin Prodi | Dosen Pembimbing | Dosen Penguji | Mahasiswa |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Konfigurasi Sistem & Periode Akademik | ✅ | ✅ *(Terbatas)* | ❌ | ❌ | ❌ |
| Kelola Fakultas, Prodi & Role Access | ✅ | ✅ *(Prodi)* | ❌ | ❌ | ❌ |
| Kelola Mahasiswa & Dosen | ✅ | ✅ *(Prodi)* | ❌ | ❌ | ❌ |
| Penetapan Pembimbing & Jadwal Ujian | ✅ | ✅ | ❌ | ❌ | ❌ |
| Review Judul, Bab 1–5 & Sesi Bimbingan | ✅ *(Monitor)* | ✅ *(Monitor)* | ✅ | ❌ | ❌ |
| ACC Seminar & ACC Sidang | ❌ | ✅ *(Verifikasi)* | ✅ | ❌ | ❌ |
| Penilaian Ujian & Lembar Evaluasi | ✅ *(Monitor)* | ✅ | ✅ *(Pembimbing)* | ✅ | ❌ |
| Pengajuan Judul, Bimbingan & Unggah Berkas | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## Desain & Pengalaman Pengguna

- **Academic Identity Palette**: Kombinasi Navy (`slate-900`), Putih bersih, Biru akademik, dan aksen Cyan.
- **Responsive AppShell**: Collapsible sidebar di desktop, drawer menu di tablet/mobile, breadcrumb dinamis, quick search menu, dan pusat notifikasi real-time.
- **Light Mode & Dark Mode**: Transisi tema konsisten di seluruh komponen, tabel, modal, dan grafik.
- **UI Components**: Data table dengan pagination & filter, modal & slide-over drawer, inline PDF/document viewer, toast notification, skeleton loader, dan empty state.

---

## Tech Stack

| Layer | Teknologi |
| :--- | :--- |
| **Frontend Framework** | React 19, TypeScript, Vite 8 |
| **Styling & Icons** | Tailwind CSS v4 (`@tailwindcss/vite`), Lucide React |
| **Visualisasi Data** | Recharts |
| **Backend & Database** | Supabase (PostgreSQL, Auth, Realtime, Storage) |
| **Routing & Deployment** | SPA Client Routing + `vercel.json` Rewrite Configuration |

---

## Struktur Proyek

```text
├── index.html
├── metadata.json
├── package.json
├── vercel.json
├── vite.config.ts
├── .env.example
├── supabase/
│   └── migrations/
│       └── 0004_taflow_complete.sql   # Skema 22 tabel, RLS, RPC, Trigger, Storage & Seed
└── src/
    ├── App.tsx                        # Router berbasis role & session guard
    ├── main.tsx
    ├── index.css
    ├── components/
    │   ├── DatabaseSetupView.tsx
    │   ├── layout/
    │   │   └── AppShell.tsx           # Sidebar, Kuota Pembimbing, Topbar, Notifikasi
    │   └── ui/                        # DataTable, Modal, Drawer, DocumentViewer, FileUpload, Avatar
    ├── config/
    │   └── navigation.ts              # Definisi menu navigasi & hak akses per role
    ├── contexts/
    │   ├── AuthContext.tsx            # Session, Profile, Avatar Signed URL, Settings
    │   ├── ThemeContext.tsx           # Light/Dark Mode
    │   └── ToastContext.tsx           # Notifikasi Toast
    ├── lib/
    │   ├── supabase.ts                # Supabase client & error formatter
    │   └── utils.ts                   # Helper format tanggal, status, dan className
    ├── pages/
    │   ├── auth/                      # Login (NIM/NIP/Email), Register, Forgot/Reset Password
    │   ├── student/                   # Dashboard, Judul, Bimbingan, Bab 1–5, Dokumen, Seminar, Sidang, Plagiasi, Yudisium
    │   ├── lecturer/                  # Dashboard, Mahasiswa Bimbingan, Sesi Bimbingan, Review Bab, Jadwal & Penilaian
    │   ├── admin/                     # Dashboard, User Mgmt, Operasional TA, Penjadwalan, Penilaian, Konfigurasi, Laporan
    │   └── shared/                    # Notifikasi & Pengaturan Profil
    └── types/
        └── database.ts                # Kontrak TypeScript untuk seluruh entitas & RPC
```

---

## Arsitektur Database & Keamanan

Seluruh definisi backend tersedia secara **idempotent** di `supabase/migrations/0004_taflow_complete.sql`, mencakup:

- **22 Tabel Relasional**: `roles`, `departments`, `programs`, `academic_periods`, `profiles`, `submission_requirements`, `thesis_submissions`, `thesis_supervisors`, `thesis_documents`, `document_reviews`, `thesis_progress`, `supervision_sessions`, `seminar_registrations`, `defense_registrations`, `exam_schedules`, `examiner_assignments`, `exam_scores`, `plagiarism_checks`, `graduation_records`, `notifications`, `activity_logs`, dan `system_settings`.
- **Row Level Security (RLS)**: Kebijakan ketat pada seluruh tabel agar mahasiswa hanya mengakses datanya, dosen hanya mengakses mahasiswa bimbingan/ujiannya, admin prodi terisolasi per program studi, dan super admin memiliki akses penuh.
- **RPC `SECURITY DEFINER`**:
  - `register_student_account` — Registrasi akun mahasiswa dengan email opsional tanpa kendala rate-limit email.
  - `admin_create_user_account` & `admin_update_user_email` — Pembuatan dan pembaruan email akun oleh administrator.
  - `admin_update_user_role` — Penetapan role aman dengan audit log otomatis.
  - `get_lecturer_quota_summary` — Agregasi kuota pembimbing aktif yang aman dibaca seluruh role terautentikasi.
  - `check_exam_schedule_conflicts` — Validasi bentrok jadwal ruangan, mahasiswa, dan dosen penguji.
- **7 Bucket Storage Privat**: `avatars`, `thesis-documents`, `thesis-proposals`, `seminar-documents`, `defense-documents`, `plagiarism-documents`, dan `graduation-documents` yang dilindungi Storage RLS dan diakses via Signed URL.
- **Supabase Realtime**: Publikasi aktif untuk pembaruan langsung pada profil, bimbingan, progres bab, seminar, sidang, penilaian, dan notifikasi.

---

## Memulai Instalasi Lokal

### Prasyarat
- **Node.js** v20+ (`npm` atau `bun`)
- Proyek **Supabase** aktif

### 1. Kloning & Instalasi Dependensi
```bash
git clone <repository-url>
cd taflow
npm install
```

### 2. Konfigurasi Environment Variable
Salin berkas `.env.example` menjadi `.env` lalu isi kredensial proyek Supabase Anda:

```env
VITE_SUPABASE_URL="https://your-project-ref.supabase.co"
VITE_SUPABASE_ANON_KEY="your-supabase-anon-key"
```

> **Catatan Keamanan:** Jangan pernah memasukkan `SUPABASE_SERVICE_ROLE_KEY` di environment variable client-side (`VITE_*`).

### 3. Migrasi Database Supabase
1. Buka **Supabase Dashboard → SQL Editor**.
2. Salin seluruh isi berkas `supabase/migrations/0004_taflow_complete.sql`.
3. Jalankan skrip hingga selesai. Skrip ini otomatis membuat seluruh tabel, kebijakan RLS, fungsi RPC, bucket storage, publikasi realtime, serta data awal fakultas, program studi, periode akademik, dan persyaratan TA.

### 4. Menjalankan Server Pengembangan
```bash
npm run dev
```
Aplikasi berjalan pada `http://localhost:3000`.

### 5. Verifikasi Type Check & Build Produksi
```bash
npm run lint
npm run build
```

---

## Deployment ke Vercel

1. Hubungkan repositori ke **Vercel**.
2. Atur **Build Command** menjadi `npm run build` dan **Output Directory** menjadi `dist`.
3. Tambahkan Environment Variables di Vercel Project Settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Konfigurasi rewrite SPA sudah tersedia pada `vercel.json` sehingga seluruh rute client-side tertangani dengan baik.

---

<div align="center">

Dikembangkan untuk efisiensi tata kelola akademik tugas akhir yang modern, transparan, dan terukur.

</div>
