import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Edit3, Loader2, Plus, Trash2 } from 'lucide-react';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';
import { Modal } from '../../components/ui/Modal';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { logActivity, supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';
import type { AcademicPeriod, Department, Program, SubmissionRequirement } from '../../types/database';

// ==========================================
// 1. Academic Period Management
// ==========================================
export function AcademicPeriodPage() {
  const { systemSettings, refreshSettings } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [periods, setPeriods] = useState<AcademicPeriod[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingPeriod, setEditingPeriod] = useState<AcademicPeriod | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AcademicPeriod | null>(null);

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [academicYear, setAcademicYear] = useState('2026/2027');
  const [semester, setSemester] = useState<'Ganjil' | 'Genap' | 'Pendek'>('Ganjil');
  const [startDate, setStartDate] = useState('2026-09-01');
  const [endDate, setEndDate] = useState('2027-01-31');
  const [subOpen, setSubOpen] = useState('2026-09-01');
  const [subClose, setSubClose] = useState('2026-12-31');

  const loadData = useCallback(async (withLoader = true) => {
    if (withLoader) setLoading(true);
    const { data } = await supabase
      .from('academic_periods')
      .select('*')
      .order('start_date', { ascending: false });
    setPeriods((data || []) as AcademicPeriod[]);
    if (withLoader) setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel('realtime-academic-periods')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'academic_periods' },
        () => {
          loadData(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  const openAddModal = () => {
    setEditingPeriod(null);
    setCode('');
    setName('');
    setAcademicYear('2026/2027');
    setSemester('Ganjil');
    setStartDate('2026-09-01');
    setEndDate('2027-01-31');
    setSubOpen('2026-09-01');
    setSubClose('2026-12-31');
    setModalOpen(true);
  };

  const openEditModal = (p: AcademicPeriod) => {
    setEditingPeriod(p);
    setCode(p.code);
    setName(p.name);
    setAcademicYear(p.academic_year);
    setSemester(p.semester);
    setStartDate(p.start_date);
    setEndDate(p.end_date);
    setSubOpen(p.submission_open || '');
    setSubClose(p.submission_close || '');
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const payload = {
      code: code.trim(),
      name: name.trim(),
      academic_year: academicYear.trim(),
      semester,
      start_date: startDate,
      end_date: endDate,
      submission_open: subOpen || null,
      submission_close: subClose || null,
    };

    if (editingPeriod) {
      const { error } = await supabase
        .from('academic_periods')
        .update(payload)
        .eq('id', editingPeriod.id);

      setSaving(false);
      if (error) {
        showToast('Gagal memperbarui periode akademik', 'error', error.message);
        return;
      }
      await logActivity('update_academic_period', 'academic_periods', editingPeriod.id, {
        code: payload.code,
      });
      if (editingPeriod.is_active) {
        await refreshSettings();
      }
      setModalOpen(false);
      showToast('Periode akademik diperbarui', 'success');
      loadData(false);
    } else {
      const { data: inserted, error } = await supabase
        .from('academic_periods')
        .insert({ ...payload, is_active: false })
        .select('*')
        .single();

      setSaving(false);
      if (error) {
        showToast('Gagal menambah periode akademik', 'error', error.message);
        return;
      }
      await logActivity('create_academic_period', 'academic_periods', inserted.id, {
        code: payload.code,
      });
      setModalOpen(false);
      showToast('Periode akademik ditambahkan', 'success');
      loadData(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.is_active) {
      showToast(
        'Periode aktif tidak dapat dihapus',
        'warning',
        'Aktifkan periode lain terlebih dahulu sebelum menghapus periode ini.'
      );
      setDeleteTarget(null);
      return;
    }

    setDeleting(true);
    const { error } = await supabase
      .from('academic_periods')
      .delete()
      .eq('id', deleteTarget.id);
    setDeleting(false);

    if (error) {
      const isFk = error.code === '23503';
      showToast(
        'Gagal menghapus periode akademik',
        'error',
        isFk
          ? 'Periode ini masih digunakan oleh data pengajuan atau sidang tugas akhir.'
          : error.message
      );
      return;
    }

    await logActivity('delete_academic_period', 'academic_periods', deleteTarget.id, {
      code: deleteTarget.code,
    });
    setDeleteTarget(null);
    showToast('Periode akademik dihapus', 'success');
    loadData(false);
  };

  const activatePeriod = async (p: AcademicPeriod) => {
    await supabase.from('academic_periods').update({ is_active: false }).neq('id', p.id);
    await supabase.from('academic_periods').update({ is_active: true }).eq('id', p.id);
    if (systemSettings?.id) {
      await supabase.from('system_settings').update({ active_period_id: p.id }).eq('id', systemSettings.id);
      await refreshSettings();
    }
    showToast(`${p.name} diaktifkan`, 'success');
    loadData(false);
  };

  const columns: ColumnDef<AcademicPeriod>[] = [
    { key: 'code', header: 'Kode', render: (r) => <span className="font-mono font-medium">{r.code}</span> },
    { key: 'name', header: 'Nama Periode', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'year', header: 'Tahun / Semester', render: (r) => <span>{r.academic_year} · {r.semester}</span> },
    {
      key: 'dates',
      header: 'Rentang Pendaftaran',
      render: (r) => (
        <span className="font-mono text-xs">
          {formatDate(r.submission_open)} – {formatDate(r.submission_close)}
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.is_active ? 'active' : 'inactive'} /> },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (r) => (
        <div className="inline-flex items-center justify-end gap-1">
          {!r.is_active ? (
            <button
              type="button"
              onClick={() => activatePeriod(r)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 mr-1"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Aktifkan
            </button>
          ) : (
            <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 mr-1.5">
              Aktif
            </span>
          )}
          <button
            type="button"
            title="Edit Periode"
            onClick={() => openEditModal(r)}
            className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title={r.is_active ? 'Periode aktif tidak dapat dihapus' : 'Hapus Periode'}
            onClick={() => setDeleteTarget(r)}
            className="p-1.5 rounded-md text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Academic Period Management</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Kelola tahun akademik, semester berjalan, dan jendela pendaftaran TA secara realtime.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white"
        >
          <Plus className="w-3.5 h-3.5" />
          Tambah Periode
        </button>
      </div>

      <DataTable data={periods} columns={columns} keyField={(r) => r.id} loading={loading} />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingPeriod ? 'Edit Periode Akademik' : 'Tambah Periode Akademik'}
      >
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Kode *</label>
              <input
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="2026-2"
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Tahun Akademik *</label>
              <input
                required
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="col-span-2">
              <label className="block font-medium mb-1">Nama Periode *</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Semester Genap 2026/2027"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Semester</label>
              <select
                value={semester}
                onChange={(e) => setSemester(e.target.value as 'Ganjil' | 'Genap' | 'Pendek')}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="Ganjil">Ganjil</option>
                <option value="Genap">Genap</option>
                <option value="Pendek">Pendek</option>
              </select>
            </div>
            <div />
            <div>
              <label className="block font-medium mb-1">Mulai Periode</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Akhir Periode</label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Buka Pendaftaran</label>
              <input
                type="date"
                value={subOpen}
                onChange={(e) => setSubOpen(e.target.value)}
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Tutup Pendaftaran</label>
              <input
                type="date"
                value={subClose}
                onChange={(e) => setSubClose(e.target.value)}
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editingPeriod ? 'Simpan Perubahan' : 'Simpan'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Hapus Periode Akademik"
        maxWidth="sm"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            Apakah Anda yakin ingin menghapus periode{' '}
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {deleteTarget?.name}
            </span>{' '}
            (<span className="font-mono">{deleteTarget?.code}</span>)? Tindakan ini tidak dapat dibatalkan.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 px-4 py-2 font-medium rounded-lg bg-rose-600 hover:bg-rose-700 text-white"
            >
              {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Hapus
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ==========================================
// 2. Program & Faculty Management
// ==========================================
export function ProgramManagementPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [savingDept, setSavingDept] = useState(false);
  const [savingProg, setSavingProg] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);

  // Faculty modal state
  const [deptOpen, setDeptOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptCode, setDeptCode] = useState('');
  const [deptName, setDeptName] = useState('');
  const [deptDean, setDeptDean] = useState('');
  const [deptActive, setDeptActive] = useState(true);

  // Program modal state
  const [progOpen, setProgOpen] = useState(false);
  const [editingProg, setEditingProg] = useState<Program | null>(null);
  const [progDeptId, setProgDeptId] = useState('');
  const [progCode, setProgCode] = useState('');
  const [progName, setProgName] = useState('');
  const [degreeLevel, setDegreeLevel] = useState('S1');
  const [minSks, setMinSks] = useState(110);
  const [minGpa, setMinGpa] = useState(2.75);
  const [maxPlag, setMaxPlag] = useState(25);
  const [maxSup, setMaxSup] = useState(2);
  const [minGuidance, setMinGuidance] = useState(8);
  const [allowProposedSup, setAllowProposedSup] = useState(true);
  const [progActive, setProgActive] = useState(true);

  // Delete confirmation target
  const [deleteTarget, setDeleteTarget] = useState<
    | { type: 'department'; item: Department }
    | { type: 'program'; item: Program }
    | null
  >(null);

  const loadData = useCallback(async (withLoader = true) => {
    if (withLoader) setLoading(true);
    const [{ data: dData }, { data: pData }] = await Promise.all([
      supabase.from('departments').select('*').order('name'),
      supabase.from('programs').select('*, department:departments(*)').order('name'),
    ]);
    setDepartments((dData || []) as Department[]);
    setPrograms((pData || []) as Program[]);
    if (dData && dData.length > 0 && !progDeptId) {
      setProgDeptId(dData[0].id);
    }
    if (withLoader) setLoading(false);
  }, [progDeptId]);

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel('realtime-programs-departments')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'departments' },
        () => {
          loadData(false);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'programs' },
        () => {
          loadData(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  const openAddDept = () => {
    setEditingDept(null);
    setDeptCode('');
    setDeptName('');
    setDeptDean('');
    setDeptActive(true);
    setDeptOpen(true);
  };

  const openEditDept = (d: Department) => {
    setEditingDept(d);
    setDeptCode(d.code);
    setDeptName(d.name);
    setDeptDean(d.dean_name || '');
    setDeptActive(d.is_active);
    setDeptOpen(true);
  };

  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingDept(true);
    const payload = {
      code: deptCode.trim(),
      name: deptName.trim(),
      dean_name: deptDean.trim() || null,
      is_active: deptActive,
    };

    if (editingDept) {
      const { error } = await supabase
        .from('departments')
        .update(payload)
        .eq('id', editingDept.id);
      setSavingDept(false);
      if (error) {
        showToast('Gagal memperbarui fakultas', 'error', error.message);
        return;
      }
      await logActivity('update_department', 'departments', editingDept.id, { code: payload.code });
      setDeptOpen(false);
      showToast('Data fakultas diperbarui', 'success');
      loadData(false);
    } else {
      const { data: inserted, error } = await supabase
        .from('departments')
        .insert(payload)
        .select('*')
        .single();
      setSavingDept(false);
      if (error) {
        showToast('Gagal menambah fakultas', 'error', error.message);
        return;
      }
      if (inserted?.id) {
        await logActivity('create_department', 'departments', inserted.id, { code: payload.code });
      }
      setDeptOpen(false);
      showToast('Fakultas ditambahkan', 'success');
      loadData(false);
    }
  };

  const openAddProg = () => {
    setEditingProg(null);
    setProgDeptId(departments[0]?.id || '');
    setProgCode('');
    setProgName('');
    setDegreeLevel('S1');
    setMinSks(110);
    setMinGpa(2.75);
    setMaxPlag(25);
    setMaxSup(2);
    setMinGuidance(8);
    setAllowProposedSup(true);
    setProgActive(true);
    setProgOpen(true);
  };

  const openEditProg = (p: Program) => {
    setEditingProg(p);
    setProgDeptId(p.department_id);
    setProgCode(p.code);
    setProgName(p.name);
    setDegreeLevel(p.degree_level || 'S1');
    setMinSks(p.min_sks);
    setMinGpa(Number(p.min_gpa));
    setMaxPlag(p.max_plagiarism_pct);
    setMaxSup(p.max_supervisors);
    setMinGuidance(p.min_guidance_sessions);
    setAllowProposedSup(p.allow_proposed_supervisor);
    setProgActive(p.is_active);
    setProgOpen(true);
  };

  const handleSaveProg = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProg(true);

    const payload = {
      department_id: progDeptId,
      code: progCode.trim(),
      name: progName.trim(),
      degree_level: degreeLevel.trim() || 'S1',
      min_sks: minSks,
      min_gpa: minGpa,
      max_plagiarism_pct: maxPlag,
      max_supervisors: maxSup,
      min_guidance_sessions: minGuidance,
      allow_proposed_supervisor: allowProposedSup,
      is_active: progActive,
    };

    if (editingProg) {
      const { error } = await supabase
        .from('programs')
        .update(payload)
        .eq('id', editingProg.id);
      setSavingProg(false);
      if (error) {
        showToast('Gagal memperbarui program studi', 'error', error.message);
        return;
      }
      await logActivity('update_program', 'programs', editingProg.id, { code: payload.code });
      setProgOpen(false);
      showToast('Program studi diperbarui', 'success');
      loadData(false);
    } else {
      const { data: inserted, error } = await supabase
        .from('programs')
        .insert(payload)
        .select('*')
        .single();
      setSavingProg(false);
      if (error) {
        showToast('Gagal menambah program studi', 'error', error.message);
        return;
      }
      if (inserted?.id) {
        await logActivity('create_program', 'programs', inserted.id, { code: payload.code });
      }
      setProgOpen(false);
      showToast('Program studi ditambahkan', 'success');
      loadData(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    if (deleteTarget.type === 'department') {
      const { error } = await supabase
        .from('departments')
        .delete()
        .eq('id', deleteTarget.item.id);
      setDeleting(false);

      if (error) {
        const isFk = error.code === '23503';
        showToast(
          'Gagal menghapus fakultas',
          'error',
          isFk
            ? 'Fakultas ini masih memiliki Program Studi atau akun pengguna terkait.'
            : error.message
        );
        return;
      }
      await logActivity('delete_department', 'departments', deleteTarget.item.id, {
        code: deleteTarget.item.code,
      });
      showToast('Fakultas dihapus', 'success');
    } else {
      const { error } = await supabase
        .from('programs')
        .delete()
        .eq('id', deleteTarget.item.id);
      setDeleting(false);

      if (error) {
        const isFk = error.code === '23503';
        showToast(
          'Gagal menghapus program studi',
          'error',
          isFk
            ? 'Program studi ini masih memiliki data mahasiswa, dosen, atau tugas akhir terkait.'
            : error.message
        );
        return;
      }
      await logActivity('delete_program', 'programs', deleteTarget.item.id, {
        code: deleteTarget.item.code,
      });
      showToast('Program studi dihapus', 'success');
    }

    setDeleteTarget(null);
    loadData(false);
  };

  const deptColumns: ColumnDef<Department>[] = [
    { key: 'code', header: 'Kode', render: (r) => <span className="font-mono font-medium">{r.code}</span> },
    { key: 'name', header: 'Nama Fakultas', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'dean', header: 'Dekan', render: (r) => <span className="text-slate-600 dark:text-slate-300">{r.dean_name || '—'}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.is_active ? 'active' : 'inactive'} /> },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (r) => (
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            title="Edit Fakultas"
            onClick={() => openEditDept(r)}
            className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Hapus Fakultas"
            onClick={() => setDeleteTarget({ type: 'department', item: r })}
            className="p-1.5 rounded-md text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  const progColumns: ColumnDef<Program>[] = [
    { key: 'code', header: 'Kode', render: (r) => <span className="font-mono font-medium">{r.code}</span> },
    {
      key: 'name',
      header: 'Program Studi',
      render: (r) => (
        <div>
          <p className="font-medium">{r.degree_level} {r.name}</p>
          <p className="text-[11px] text-slate-500">{r.department?.name || '—'}</p>
        </div>
      ),
    },
    {
      key: 'sks',
      header: 'Min SKS / IPK',
      align: 'right',
      render: (r) => <span className="font-mono tabular-nums">{r.min_sks} SKS · {Number(r.min_gpa).toFixed(2)}</span>,
    },
    {
      key: 'plag',
      header: 'Batas Plagiasi',
      align: 'right',
      render: (r) => <span className="font-mono tabular-nums">{r.max_plagiarism_pct}%</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge status={r.is_active ? 'active' : 'inactive'} />,
    },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (r) => (
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            title="Edit Program Studi"
            onClick={() => openEditProg(r)}
            className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Hapus Program Studi"
            onClick={() => setDeleteTarget({ type: 'program', item: r })}
            className="p-1.5 rounded-md text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Fakultas & Program Studi</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Kelola struktur fakultas, program studi, serta ambang batas SKS, IPK, dan plagiasi per prodi secara realtime.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openAddDept}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Plus className="w-3.5 h-3.5" />
            Tambah Fakultas
          </button>
          <button
            type="button"
            onClick={openAddProg}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white"
          >
            <Plus className="w-3.5 h-3.5" />
            Tambah Prodi
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Daftar Fakultas</h2>
        <DataTable data={departments} columns={deptColumns} keyField={(r) => r.id} loading={loading} />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Daftar Program Studi</h2>
        <DataTable data={programs} columns={progColumns} keyField={(r) => r.id} loading={loading} />
      </div>

      <Modal
        open={deptOpen}
        onClose={() => setDeptOpen(false)}
        title={editingDept ? 'Edit Fakultas' : 'Tambah Fakultas'}
        maxWidth="sm"
      >
        <form onSubmit={handleSaveDept} className="space-y-3 text-xs">
          <div>
            <label className="block font-medium mb-1">Kode Fakultas *</label>
            <input
              required
              placeholder="mis. FT / FIKOM"
              value={deptCode}
              onChange={(e) => setDeptCode(e.target.value)}
              className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Nama Fakultas *</label>
            <input
              required
              placeholder="Nama Fakultas"
              value={deptName}
              onChange={(e) => setDeptName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Nama Dekan (Opsional)</label>
            <input
              placeholder="Contoh: Prof. Dr. Ir. ..."
              value={deptDean}
              onChange={(e) => setDeptDean(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
          <label className="flex items-center gap-2 pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={deptActive}
              onChange={(e) => setDeptActive(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span>Fakultas Aktif</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDeptOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={savingDept}
              className="inline-flex items-center gap-1.5 px-4 py-2 font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white"
            >
              {savingDept && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editingDept ? 'Simpan Perubahan' : 'Simpan'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={progOpen}
        onClose={() => setProgOpen(false)}
        title={editingProg ? 'Edit Program Studi' : 'Tambah Program Studi'}
      >
        <form onSubmit={handleSaveProg} className="space-y-3 text-xs">
          <div>
            <label className="block font-medium mb-1">Fakultas *</label>
            <select
              required
              value={progDeptId}
              onChange={(e) => setProgDeptId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Kode Prodi *</label>
              <input
                required
                placeholder="mis. TI"
                value={progCode}
                onChange={(e) => setProgCode(e.target.value)}
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Jenjang</label>
              <select
                value={degreeLevel}
                onChange={(e) => setDegreeLevel(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="D3">D3</option>
                <option value="D4">D4</option>
                <option value="S1">S1</option>
                <option value="S2">S2</option>
                <option value="S3">S3</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block font-medium mb-1">Nama Program Studi *</label>
              <input
                required
                placeholder="Teknik Informatika"
                value={progName}
                onChange={(e) => setProgName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Min SKS</label>
              <input
                type="number"
                value={minSks}
                onChange={(e) => setMinSks(Number(e.target.value))}
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Min IPK</label>
              <input
                type="number"
                step="0.01"
                value={minGpa}
                onChange={(e) => setMinGpa(Number(e.target.value))}
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Batas Plagiasi (%)</label>
              <input
                type="number"
                value={maxPlag}
                onChange={(e) => setMaxPlag(Number(e.target.value))}
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Min Sesi Bimbingan</label>
              <input
                type="number"
                value={minGuidance}
                onChange={(e) => setMinGuidance(Number(e.target.value))}
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Maks Pembimbing</label>
              <input
                type="number"
                min={1}
                max={3}
                value={maxSup}
                onChange={(e) => setMaxSup(Number(e.target.value))}
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="flex flex-col justify-end gap-1.5 pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowProposedSup}
                  onChange={(e) => setAllowProposedSup(e.target.checked)}
                />
                <span>Izinkan Usulan Pembimbing</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={progActive}
                  onChange={(e) => setProgActive(e.target.checked)}
                />
                <span>Program Studi Aktif</span>
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setProgOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={savingProg}
              className="inline-flex items-center gap-1.5 px-4 py-2 font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white"
            >
              {savingProg && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editingProg ? 'Simpan Perubahan' : 'Simpan'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={deleteTarget?.type === 'department' ? 'Hapus Fakultas' : 'Hapus Program Studi'}
        maxWidth="sm"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            Apakah Anda yakin ingin menghapus{' '}
            {deleteTarget?.type === 'department' ? 'fakultas' : 'program studi'}{' '}
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {deleteTarget?.item.name}
            </span>{' '}
            (<span className="font-mono">{deleteTarget?.item.code}</span>)?
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 px-4 py-2 font-medium rounded-lg bg-rose-600 hover:bg-rose-700 text-white"
            >
              {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Hapus
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ==========================================
// 3. Dynamic Requirements Management
// ==========================================
export function RequirementsManagementPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [reqs, setReqs] = useState<SubmissionRequirement[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingReq, setEditingReq] = useState<SubmissionRequirement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SubmissionRequirement | null>(null);

  const [programId, setProgramId] = useState('');
  const [stage, setStage] = useState<SubmissionRequirement['stage']>('title_submission');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reqType, setReqType] = useState<SubmissionRequirement['requirement_type']>('academic');
  const [ruleKey, setRuleKey] = useState('min_sks');
  const [ruleValue, setRuleValue] = useState('110');
  const [sortOrder, setSortOrder] = useState(1);
  const [isRequired, setIsRequired] = useState(true);
  const [isActive, setIsActive] = useState(true);

  const loadData = useCallback(async (withLoader = true) => {
    if (withLoader) setLoading(true);
    const [{ data: rData }, { data: pData }] = await Promise.all([
      supabase.from('submission_requirements').select('*').order('stage').order('sort_order'),
      supabase.from('programs').select('*').order('name'),
    ]);
    setReqs((rData || []) as SubmissionRequirement[]);
    setPrograms((pData || []) as Program[]);
    if (withLoader) setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel('realtime-submission-requirements')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'submission_requirements' },
        () => {
          loadData(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  const openAddModal = () => {
    setEditingReq(null);
    setProgramId('');
    setStage('title_submission');
    setTitle('');
    setDescription('');
    setReqType('academic');
    setRuleKey('min_sks');
    setRuleValue('110');
    setSortOrder(reqs.length + 1);
    setIsRequired(true);
    setIsActive(true);
    setModalOpen(true);
  };

  const openEditModal = (r: SubmissionRequirement) => {
    setEditingReq(r);
    setProgramId(r.program_id || '');
    setStage(r.stage);
    setTitle(r.title);
    setDescription(r.description || '');
    setReqType(r.requirement_type);
    setRuleKey(r.rule_key || '');
    setRuleValue(r.rule_value || '');
    setSortOrder(r.sort_order ?? 1);
    setIsRequired(r.is_required);
    setIsActive(r.is_active);
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const payload = {
      program_id: programId || null,
      stage,
      title: title.trim(),
      description: description.trim() || null,
      requirement_type: reqType,
      rule_key: ruleKey.trim() || null,
      rule_value: ruleValue.trim() || null,
      sort_order: sortOrder,
      is_required: isRequired,
      is_active: isActive,
    };

    if (editingReq) {
      const { error } = await supabase
        .from('submission_requirements')
        .update(payload)
        .eq('id', editingReq.id);
      setSaving(false);
      if (error) {
        showToast('Gagal memperbarui persyaratan', 'error', error.message);
        return;
      }
      await logActivity('update_requirement', 'submission_requirements', editingReq.id, {
        title: payload.title,
      });
      setModalOpen(false);
      showToast('Persyaratan diperbarui', 'success');
      loadData(false);
    } else {
      const { data: inserted, error } = await supabase
        .from('submission_requirements')
        .insert(payload)
        .select('*')
        .single();
      setSaving(false);
      if (error) {
        showToast('Gagal menambah persyaratan', 'error', error.message);
        return;
      }
      if (inserted?.id) {
        await logActivity('create_requirement', 'submission_requirements', inserted.id, {
          title: payload.title,
        });
      }
      setModalOpen(false);
      showToast('Persyaratan dinamis ditambahkan', 'success');
      loadData(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase
      .from('submission_requirements')
      .delete()
      .eq('id', deleteTarget.id);
    setDeleting(false);

    if (error) {
      showToast('Gagal menghapus persyaratan', 'error', error.message);
      return;
    }

    await logActivity('delete_requirement', 'submission_requirements', deleteTarget.id, {
      title: deleteTarget.title,
    });
    setDeleteTarget(null);
    showToast('Persyaratan dihapus', 'success');
    loadData(false);
  };

  const columns: ColumnDef<SubmissionRequirement>[] = [
    { key: 'stage', header: 'Tahap', render: (r) => <span className="capitalize font-medium">{r.stage.replace(/_/g, ' ')}</span> },
    {
      key: 'title',
      header: 'Persyaratan',
      render: (r) => (
        <div>
          <p className="font-medium">{r.title}</p>
          {r.description && <p className="text-[11px] text-slate-500">{r.description}</p>}
        </div>
      ),
    },
    {
      key: 'program',
      header: 'Program Studi',
      render: (r) => {
        const prog = programs.find((p) => p.id === r.program_id);
        return <span className="text-xs text-slate-600 dark:text-slate-300">{prog ? prog.name : 'Semua Prodi'}</span>;
      },
    },
    { key: 'rule', header: 'Aturan Sistem', render: (r) => <span className="font-mono text-xs">{r.rule_key ? `${r.rule_key} = ${r.rule_value}` : 'Manual Checklist'}</span> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.is_active ? 'active' : 'inactive'} /> },
    {
      key: 'actions',
      header: 'Aksi',
      align: 'right',
      render: (r) => (
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            title="Edit Persyaratan"
            onClick={() => openEditModal(r)}
            className="p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            title="Hapus Persyaratan"
            onClick={() => setDeleteTarget(r)}
            className="p-1.5 rounded-md text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Requirements Management</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Konfigurasi persyaratan akademik & administrasi secara dinamis dan realtime untuk setiap tahapan tugas akhir.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white"
        >
          <Plus className="w-3.5 h-3.5" />
          Tambah Persyaratan
        </button>
      </div>

      <DataTable data={reqs} columns={columns} keyField={(r) => r.id} loading={loading} />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingReq ? 'Edit Aturan Persyaratan TA' : 'Tambah Aturan Persyaratan TA'}
      >
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Tahapan *</label>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as SubmissionRequirement['stage'])}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="title_submission">Title Submission</option>
                <option value="seminar_proposal">Seminar Proposal</option>
                <option value="defense_registration">Defense Registration</option>
                <option value="yudisium">Yudisium</option>
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Program Studi</label>
              <select
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="">Semua Program Studi</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block font-medium mb-1">Judul Persyaratan *</label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Contoh: Minimum IPK 3.00"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="col-span-2">
              <label className="block font-medium mb-1">Deskripsi</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Tipe</label>
              <select
                value={reqType}
                onChange={(e) => setReqType(e.target.value as SubmissionRequirement['requirement_type'])}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="academic">Akademik</option>
                <option value="administrative">Administrasi</option>
                <option value="document">Dokumen</option>
                <option value="guidance">Bimbingan</option>
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Rule Key (Opsional)</label>
              <select
                value={ruleKey}
                onChange={(e) => setRuleKey(e.target.value)}
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="min_sks">min_sks</option>
                <option value="min_gpa">min_gpa</option>
                <option value="active_status">active_status</option>
                <option value="chapters_approved">chapters_approved</option>
                <option value="min_guidance">min_guidance</option>
                <option value="supervisor_approval">supervisor_approval</option>
                <option value="">Manual</option>
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Nilai Ambang (Rule Value)</label>
              <input
                value={ruleValue}
                onChange={(e) => setRuleValue(e.target.value)}
                placeholder="Contoh: 110 / 2.75 / 8"
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Urutan Tampil</label>
              <input
                type="number"
                min={1}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
                className="w-full px-3 py-2 font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            </div>
            <div className="col-span-2 flex items-center gap-6 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isRequired}
                  onChange={(e) => setIsRequired(e.target.checked)}
                />
                <span>Wajib Dipenuhi</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                <span>Aturan Aktif</span>
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 font-medium rounded-lg bg-blue-700 hover:bg-blue-800 text-white"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {editingReq ? 'Simpan Perubahan' : 'Simpan'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Hapus Persyaratan"
        maxWidth="sm"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
            Apakah Anda yakin ingin menghapus persyaratan{' '}
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {deleteTarget?.title}
            </span>
            ?
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 px-4 py-2 font-medium rounded-lg bg-rose-600 hover:bg-rose-700 text-white"
            >
              {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Hapus
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
