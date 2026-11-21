import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, Trash2, Check, Eye } from 'lucide-react';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { TableSkeleton } from '../../components/ui/Skeleton';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { supabase } from '../../lib/supabase';
import { cn, formatDateTime } from '../../lib/utils';
import type { AppNotification } from '../../types/database';

export function NotificationsPage() {
  const { profile } = useAuth();
  const { showToast } = useToast();

  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [selected, setSelected] = useState<AppNotification | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });
    if (error) {
      showToast('Gagal memuat notifikasi', 'error', error.message);
    } else {
      setItems((data || []) as AppNotification[]);
    }
    setLoading(false);
  }, [profile?.id, showToast]);

  useEffect(() => {
    load();
    if (!profile?.id) return;
    const channel = supabase
      .channel(`notif_page_${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, profile?.id]);

  const markRead = async (item: AppNotification) => {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', item.id);
    if (error) {
      showToast('Gagal memperbarui status', 'error', error.message);
      return;
    }
    setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)));
  };

  const markAllRead = async () => {
    if (!profile?.id) return;
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', profile.id)
      .eq('is_read', false);
    if (error) {
      showToast('Gagal menandai semua terbaca', 'error', error.message);
      return;
    }
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    showToast('Semua notifikasi ditandai sudah dibaca', 'success');
  };

  const deleteOne = async (id: string) => {
    const { error } = await supabase.from('notifications').delete().eq('id', id);
    if (error) {
      showToast('Gagal menghapus notifikasi', 'error', error.message);
      return;
    }
    setItems((prev) => prev.filter((n) => n.id !== id));
    if (selected?.id === id) setSelected(null);
    showToast('Notifikasi dihapus', 'success');
  };

  const clearAll = async () => {
    if (!profile?.id) return;
    const { error } = await supabase.from('notifications').delete().eq('user_id', profile.id);
    if (error) {
      showToast('Gagal membersihkan notifikasi', 'error', error.message);
      return;
    }
    setItems([]);
    showToast('Seluruh notifikasi dibersihkan', 'success');
  };

  const visibleItems = filter === 'unread' ? items.filter((n) => !n.is_read) : items;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Pusat Notifikasi</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Pembaruan real-time pengajuan judul, bimbingan, jadwal sidang, nilai, dan yudisium.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                filter === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              )}
            >
              Semua ({items.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('unread')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                filter === 'unread'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              )}
            >
              Belum Dibaca ({items.filter((i) => !i.is_read).length})
            </button>
          </div>
          <button
            type="button"
            onClick={markAllRead}
            disabled={!items.some((i) => !i.is_read)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Tandai Semua Dibaca
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={items.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Hapus Semua
          </button>
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={5} columns={3} />
      ) : visibleItems.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Tidak ada notifikasi"
          description="Semua pembaruan status tugas akhir dan jadwal akan muncul secara otomatis di sini."
        />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
          {visibleItems.map((n) => (
            <div
              key={n.id}
              className={cn(
                'p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors',
                !n.is_read && 'bg-blue-50/40 dark:bg-blue-950/15'
              )}
            >
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{n.title}</span>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="text-slate-500 dark:text-slate-400 capitalize">
                    {n.category.replace(/_/g, ' ')}
                  </span>
                  {!n.is_read && (
                    <>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                      <span className="font-medium text-blue-700 dark:text-cyan-400">Belum Dibaca</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{n.message}</p>
                <p className="text-[11px] font-mono text-slate-400">{formatDateTime(n.created_at)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setSelected(n);
                    if (!n.is_read) markRead(n);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Detail
                </button>
                {!n.is_read && (
                  <button
                    type="button"
                    onClick={() => markRead(n)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Dibaca
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => deleteOne(n.id)}
                  className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  aria-label="Hapus notifikasi"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.title || 'Detail Notifikasi'}
        subtitle={selected ? formatDateTime(selected.created_at) : undefined}
        maxWidth="md"
      >
        {selected && (
          <div className="space-y-4 text-xs">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <span>Kategori: {selected.category}</span>
              {selected.entity_type && (
                <>
                  <span>·</span>
                  <span>Entitas: {selected.entity_type}</span>
                </>
              )}
            </div>
            <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
              {selected.message}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
