import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  ChevronRight,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Sun,
  UserCheck,
  Users,
  X,
  Wrench,
} from 'lucide-react';
import { getNavItemsForRole } from '../../config/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import { cn, formatDateTime, formatRoleLabel } from '../../lib/utils';
import type { AppNotification, LecturerQuotaSummary } from '../../types/database';
import { Modal } from '../ui/Modal';

interface AppShellProps {
  activePage: string;
  onNavigate: (pageId: string) => void;
  children: React.ReactNode;
}

export function AppShell({ activePage, onNavigate, children }: AppShellProps) {
  const { profile, avatarSignedUrl, systemSettings, activePeriod, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [lecturerQuotas, setLecturerQuotas] = useState<LecturerQuotaSummary[]>([]);
  const [selectedQuotaLecturer, setSelectedQuotaLecturer] = useState<LecturerQuotaSummary | null>(null);

  useEffect(() => {
    setAvatarLoadError(false);
  }, [avatarSignedUrl]);

  const roleCode = profile?.role_code || 'student';
  const allowedNav = useMemo(() => getNavItemsForRole(roleCode), [roleCode]);
  const currentNav = allowedNav.find((n) => n.id === activePage) || allowedNav[0];

  const groupedNav = useMemo(() => {
    const map = new Map<string, typeof allowedNav>();
    for (const item of allowedNav) {
      const list = map.get(item.group) || [];
      list.push(item);
      map.set(item.group, list);
    }
    return Array.from(map.entries());
  }, [allowedNav]);

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return allowedNav.filter(
      (n) => n.label.toLowerCase().includes(q) || n.group.toLowerCase().includes(q)
    );
  }, [searchQuery, allowedNav]);

  // Real-time notifications listener
  useEffect(() => {
    if (!profile?.id) return;

    const loadNotifs = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(15);
      if (data) setNotifications(data as AppNotification[]);
    };

    loadNotifs();

    const channel = supabase
      .channel(`notifications_${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${profile.id}`,
        },
        () => {
          loadNotifs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  // Real-time lecturer availability & supervision quota list in sidebar
  const loadLecturerQuotas = useCallback(async () => {
    if (!profile?.id) return;

    const { data, error } = await supabase.rpc('get_lecturer_quota_summary');
    if (!error && Array.isArray(data)) {
      setLecturerQuotas(data as LecturerQuotaSummary[]);
      return;
    }

    // Fallback if get_lecturer_quota_summary RPC has not been applied yet
    const [{ data: lecData }, { data: supData }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, title_prefix, title_suffix, role_code, research_field, consultation_schedule, max_supervisee_quota, program:programs(name)')
        .in('role_code', ['supervisor', 'examiner'])
        .eq('is_active', true)
        .order('full_name'),
      supabase.from('thesis_supervisors').select('lecturer_id').eq('status', 'active'),
    ]);

    const loadMap: Record<string, number> = {};
    for (const s of supData || []) {
      loadMap[s.lecturer_id] = (loadMap[s.lecturer_id] || 0) + 1;
    }

    const mapped: LecturerQuotaSummary[] = (lecData || []).map((l) => {
      const maxQ = l.max_supervisee_quota ?? 10;
      const activeC = loadMap[l.id] || 0;
      const progObj = Array.isArray(l.program) ? l.program[0] : l.program;
      return {
        id: l.id,
        full_name: l.full_name,
        title_prefix: l.title_prefix,
        title_suffix: l.title_suffix,
        role_code: l.role_code as LecturerQuotaSummary['role_code'],
        program_name: (progObj as { name?: string } | null)?.name || null,
        research_field: l.research_field,
        consultation_schedule: l.consultation_schedule,
        max_quota: maxQ,
        active_count: activeC,
        available_quota: Math.max(0, maxQ - activeC),
        is_available: activeC < maxQ,
      };
    });
    mapped.sort((a, b) => Number(b.is_available) - Number(a.is_available) || b.available_quota - a.available_quota);
    setLecturerQuotas(mapped);
  }, [profile?.id]);

  useEffect(() => {
    loadLecturerQuotas();
    if (!profile?.id) return;

    const channel = supabase
      .channel(`sidebar_lecturer_quotas_${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'thesis_supervisors' }, () => {
        loadLecturerQuotas();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        loadLecturerQuotas();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadLecturerQuotas, profile?.id]);

  const availableLecturersCount = useMemo(
    () => lecturerQuotas.filter((l) => l.is_available).length,
    [lecturerQuotas]
  );

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markAsRead = async (id: string) => {
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  };

  const appName = systemSettings?.app_name || 'TAFlow';

  // Maintenance mode banner/block for non-admins
  const isMaintenanceBlocked =
    Boolean(systemSettings?.maintenance_mode) &&
    roleCode !== 'super_admin' &&
    roleCode !== 'program_admin';

  if (isMaintenanceBlocked) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 flex items-center justify-center mx-auto text-amber-700 dark:text-amber-400">
            <Wrench className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Pemeliharaan Sistem Terjadwal
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {appName} sedang dalam mode pemeliharaan oleh Administrator. Silakan coba kembali beberapa saat lagi.
          </p>
          <button
            type="button"
            onClick={signOut}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Keluar dari Sesi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Collapsible Sidebar */}
      <aside
        className={cn(
          'fixed lg:sticky top-0 left-0 z-40 h-screen flex flex-col border-r border-slate-200 dark:border-slate-800 bg-slate-900 text-slate-100 transition-all duration-200 shrink-0',
          collapsed ? 'w-[72px]' : 'w-[260px]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Brand Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800 shrink-0">
          <button
            type="button"
            onClick={() => {
              onNavigate('dashboard');
              setMobileOpen(false);
            }}
            className="flex items-center gap-2.5 min-w-0 text-left"
          >
            <img
              src={systemSettings?.logo_url || '/src/assets/images/taflow_academic_crest_1795267591909.jpg'}
              alt={appName}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-lg object-cover shrink-0 border border-slate-700"
            />
            {!collapsed && (
              <span className="text-base font-bold tracking-tight text-white font-display truncate">
                {appName}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="p-1.5 rounded-md text-slate-400 hover:text-white lg:hidden"
            aria-label="Tutup menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-4 space-y-5">
          {groupedNav.map(([group, items]) => (
            <div key={group} className="space-y-1">
              {!collapsed && (
                <p className="px-3 text-[11px] font-medium text-slate-400 tracking-wide">
                  {group}
                </p>
              )}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activePage === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={collapsed ? item.label : undefined}
                      onClick={() => {
                        onNavigate(item.id);
                        setMobileOpen(false);
                      }}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
                        isActive
                          ? 'bg-blue-700 text-white'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/80',
                        collapsed && 'justify-center px-2'
                      )}
                    >
                      <Icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-cyan-300' : 'text-slate-400')} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Kuota Pembimbing — mengikuti struktur grup sidebar */}
          <div className="space-y-1">
            {!collapsed && (
              <p className="px-3 text-[11px] font-medium text-slate-400 tracking-wide">
                Kuota Pembimbing ({availableLecturersCount}/{lecturerQuotas.length})
              </p>
            )}
            <div className="space-y-0.5">
              {collapsed ? (
                <button
                  type="button"
                  title={`Kuota Pembimbing (${availableLecturersCount}/${lecturerQuotas.length} tersedia)`}
                  onClick={() => setCollapsed(false)}
                  className="w-full flex items-center justify-center px-2 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors whitespace-nowrap"
                >
                  <Users className="w-4 h-4 shrink-0 text-slate-400" />
                </button>
              ) : lecturerQuotas.length === 0 ? (
                <p className="px-3 py-2 text-xs text-slate-400">
                  Belum ada data dosen
                </p>
              ) : (
                lecturerQuotas.map((lec) => {
                  const displayName = [lec.title_prefix, lec.full_name, lec.title_suffix]
                    .filter(Boolean)
                    .join(' ');
                  const isSelected = selectedQuotaLecturer?.id === lec.id;
                  return (
                    <button
                      key={lec.id}
                      type="button"
                      title={`${displayName} — ${lec.is_available ? `Sisa ${lec.available_quota} kuota` : 'Kuota penuh'} (${lec.active_count}/${lec.max_quota})`}
                      onClick={() => {
                        setSelectedQuotaLecturer(lec);
                        setMobileOpen(false);
                      }}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap',
                        isSelected
                          ? 'bg-blue-700 text-white'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                      )}
                    >
                      <UserCheck
                        className={cn(
                          'w-4 h-4 shrink-0',
                          isSelected ? 'text-cyan-300' : 'text-slate-400'
                        )}
                      />
                      <span className="truncate flex-1 text-left">{displayName}</span>
                      <span
                        className={cn(
                          'text-[11px] font-mono tabular-nums shrink-0',
                          isSelected
                            ? 'text-cyan-200'
                            : lec.is_available
                              ? 'text-cyan-300'
                              : 'text-rose-400'
                        )}
                      >
                        {lec.active_count}/{lec.max_quota}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </nav>

        {/* Collapse Control & Period Info */}
        <div className="p-3 border-t border-slate-800 space-y-2 shrink-0">
          {!collapsed && activePeriod && (
            <div className="px-2.5 py-2 rounded-lg bg-slate-800/60 text-[11px] text-slate-300">
              <p className="font-medium text-white truncate">{activePeriod.name}</p>
              <p className="text-slate-400 mt-0.5">{activePeriod.academic_year}</p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="hidden lg:flex w-full items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            {!collapsed && <span>Ciutkan Menu</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navbar */}
        <header className="sticky top-0 z-30 h-16 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur flex items-center justify-between gap-4">
          {/* Left: Mobile Menu + Breadcrumb */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 lg:hidden text-slate-600 dark:text-slate-300"
              aria-label="Buka navigasi"
            >
              <Menu className="w-4 h-4" />
            </button>

            <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs min-w-0">
              <span className="text-slate-400 dark:text-slate-500 hidden sm:inline whitespace-nowrap">
                {currentNav?.breadcrumb[0] || appName}
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 hidden sm:inline shrink-0" />
              <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                {currentNav?.breadcrumb[1] || currentNav?.label || 'Dashboard'}
              </span>
            </nav>
          </div>

          {/* Right: Search, Notifications, Theme, Profile */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Quick Menu Search */}
            <div className="relative hidden md:block w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari menu atau modul..."
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
              />
              {searchMatches.length > 0 && (
                <div className="absolute left-0 right-0 mt-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1 z-50">
                  {searchMatches.slice(0, 6).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        onNavigate(m.id);
                        setSearchQuery('');
                      }}
                      className="w-full px-3 py-2 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-between"
                    >
                      <span className="font-medium text-slate-800 dark:text-slate-200">{m.label}</span>
                      <span className="text-[11px] text-slate-400">{m.group}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Ubah mode tampilan"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Notifications Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotifOpen((v) => !v);
                  setProfileMenuOpen(false);
                }}
                className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Notifikasi"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-700 text-white text-[10px] font-mono font-semibold flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-semibold">Notifikasi Terbaru</span>
                    <button
                      type="button"
                      onClick={() => {
                        setNotifOpen(false);
                        onNavigate('notifications');
                      }}
                      className="text-xs font-medium text-blue-700 dark:text-cyan-400 hover:underline"
                    >
                      Lihat Semua
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {notifications.length === 0 ? (
                      <p className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                        Belum ada notifikasi.
                      </p>
                    ) : (
                      notifications.slice(0, 6).map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            if (!n.is_read) markAsRead(n.id);
                            setNotifOpen(false);
                            onNavigate('notifications');
                          }}
                          className={cn(
                            'w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors',
                            !n.is_read && 'bg-blue-50/50 dark:bg-blue-950/20'
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-medium text-slate-900 dark:text-slate-100">
                              {n.title}
                            </p>
                            {!n.is_read && (
                              <span className="text-[10px] font-medium text-blue-700 dark:text-cyan-400 shrink-0">
                                Baru
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                            {n.message}
                          </p>
                          <p className="text-[10px] font-mono text-slate-400 mt-1">
                            {formatDateTime(n.created_at)}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setProfileMenuOpen((v) => !v);
                  setNotifOpen(false);
                }}
                className="flex items-center gap-2.5 pl-2 pr-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <div className="w-7 h-7 rounded-md bg-blue-700 text-white text-xs font-semibold flex items-center justify-center shrink-0 overflow-hidden">
                  {avatarSignedUrl && !avatarLoadError ? (
                    <img
                      src={avatarSignedUrl}
                      alt={profile?.full_name || 'Foto Profil'}
                      referrerPolicy="no-referrer"
                      onError={() => setAvatarLoadError(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    (profile?.full_name || 'U').slice(0, 2).toUpperCase()
                  )}
                </div>
                <div className="hidden sm:block text-left min-w-0 max-w-[140px]">
                  <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                    {profile?.full_name || 'Pengguna'}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    {formatRoleLabel(roleCode)}
                  </p>
                </div>
              </button>

              {profileMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl py-1.5 z-50">
                  <div className="px-3.5 py-2 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-xs font-semibold truncate">{profile?.full_name}</p>
                    <p className="text-[11px] font-mono text-slate-500 truncate">
                      {profile?.nim_nip || profile?.email}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      onNavigate('profile');
                    }}
                    className="w-full px-3.5 py-2 text-left text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    Pengaturan Profil
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      signOut();
                    }}
                    className="w-full px-3.5 py-2 text-left text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-2"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Keluar
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Lecturer Quota Detail Modal */}
      <Modal
        open={Boolean(selectedQuotaLecturer)}
        onClose={() => setSelectedQuotaLecturer(null)}
        title={
          selectedQuotaLecturer
            ? [selectedQuotaLecturer.title_prefix, selectedQuotaLecturer.full_name, selectedQuotaLecturer.title_suffix]
                .filter(Boolean)
                .join(' ')
            : ''
        }
        subtitle={selectedQuotaLecturer?.program_name || 'Informasi Kuota Dosen Pembimbing'}
        maxWidth="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setSelectedQuotaLecturer(null)}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Tutup
            </button>
            {roleCode === 'student' && selectedQuotaLecturer?.is_available && (
              <button
                type="button"
                onClick={() => {
                  setSelectedQuotaLecturer(null);
                  onNavigate('title-submission');
                }}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-700 hover:bg-blue-800 text-white"
              >
                Buka Pengajuan Judul
              </button>
            )}
            {(roleCode === 'super_admin' || roleCode === 'program_admin') && (
              <button
                type="button"
                onClick={() => {
                  setSelectedQuotaLecturer(null);
                  onNavigate('supervisors');
                }}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-700 hover:bg-blue-800 text-white"
              >
                Kelola Pembimbing
              </button>
            )}
          </>
        }
      >
        {selectedQuotaLecturer && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-3 gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Terisi</p>
                <p className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                  {selectedQuotaLecturer.active_count}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Maksimal</p>
                <p className="text-sm font-mono font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                  {selectedQuotaLecturer.max_quota}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Sisa Kuota</p>
                <p
                  className={cn(
                    'text-sm font-mono font-bold mt-0.5',
                    selectedQuotaLecturer.is_available
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  )}
                >
                  {selectedQuotaLecturer.is_available
                    ? `${selectedQuotaLecturer.available_quota} Tersedia`
                    : 'Penuh'}
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Program Studi</p>
                <p className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                  {selectedQuotaLecturer.program_name || 'Lintas Program Studi'}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Bidang Penelitian</p>
                <p className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                  {selectedQuotaLecturer.research_field || 'Belum dicantumkan'}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Jadwal Konsultasi</p>
                <p className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                  {selectedQuotaLecturer.consultation_schedule || 'Sesuai perjanjian melalui Sesi Bimbingan'}
                </p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
