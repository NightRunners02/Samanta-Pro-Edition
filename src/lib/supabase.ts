import { createClient } from '@supabase/supabase-js';
import type { DocumentCategory, ThesisDocument } from '../types/database';

const DEFAULT_SUPABASE_URL = 'https://tfmekdwgyadlvoqlfqus.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmbWVrZHdneWFkbHZvcWxmcXVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUyNjEzNjUsImV4cCI6MjExMDgzNzM2NX0.Tp-gDEAjNVIW2DG9NbmuSrXridPp4sr1C_GyMqn-C_k';

function sanitizeEnvValue(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.trim().replace(/^["']+|["']+$/g, '').trim();
  return cleaned || undefined;
}

function normalizeSupabaseUrl(raw: string | undefined): string {
  const cleaned = sanitizeEnvValue(raw);
  if (!cleaned || cleaned.includes('your-project-ref') || cleaned.includes('placeholder.supabase.co')) {
    return DEFAULT_SUPABASE_URL;
  }
  const withProtocol = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
  return withProtocol.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
}

function normalizeAnonKey(raw: string | undefined): string {
  const cleaned = sanitizeEnvValue(raw);
  if (!cleaned || cleaned.includes('your-supabase-anon-key') || cleaned === 'placeholder-key') {
    return DEFAULT_SUPABASE_ANON_KEY;
  }
  return cleaned;
}

export const supabaseUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined);
export const supabaseAnonKey = normalizeAnonKey(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  }
);

export function formatSupabaseError(error: unknown, fallback = 'Terjadi kesalahan saat menghubungi server.'): string {
  const rawMessage =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string'
        ? (error as { message: string }).message
        : '';

  const lower = rawMessage.toLowerCase();
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('load failed') ||
    lower.includes('fetch') && lower.includes('typeerror')
  ) {
    return 'Tidak dapat terhubung ke server database Supabase. Periksa koneksi internet Anda atau pastikan konfigurasi VITE_SUPABASE_URL valid.';
  }

  return rawMessage || fallback;
}

export function isSchemaMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string };
  return (
    err.code === 'PGRST205' ||
    err.code === '42P01' ||
    Boolean(err.message?.includes('schema cache')) ||
    Boolean(err.message?.includes('does not exist')) ||
    Boolean(err.message?.includes('permission denied for table')) ||
    Boolean(err.message?.includes('permission denied for schema'))
  );
}

export function getBucketForCategory(category: DocumentCategory): string {
  switch (category) {
    case 'proposal':
      return 'thesis-proposals';
    case 'seminar_document':
      return 'seminar-documents';
    case 'defense_document':
      return 'defense-documents';
    case 'plagiarism_report':
      return 'plagiarism-documents';
    case 'graduation_document':
      return 'graduation-documents';
    default:
      return 'thesis-documents';
  }
}

export async function getSignedDocumentUrl(
  bucketName: string,
  filePath: string,
  expiresIn = 3600
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(bucketName)
    .createSignedUrl(filePath, expiresIn);
  if (error || !data?.signedUrl) {
    console.error('Signed URL error:', error?.message);
    return null;
  }
  return data.signedUrl;
}

export async function getSignedAvatarUrls(
  avatarPaths: Array<string | null | undefined>,
  expiresIn = 3600
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const storagePaths: string[] = [];

  for (const raw of avatarPaths) {
    if (!raw) continue;
    if (/^(https?:|blob:|data:)/i.test(raw)) {
      result[raw] = raw;
    } else if (!storagePaths.includes(raw)) {
      storagePaths.push(raw);
    }
  }

  if (storagePaths.length === 0) return result;

  const { data, error } = await supabase.storage
    .from('avatars')
    .createSignedUrls(storagePaths, expiresIn);

  if (error || !data) {
    console.warn('Batch signed avatar URLs skipped:', error?.message);
    return result;
  }

  for (const item of data) {
    if (item.path && item.signedUrl) {
      result[item.path] = item.signedUrl;
    }
  }
  return result;
}

export async function uploadPrivateDocument(params: {
  file: File;
  userId: string;
  studentId: string;
  category: DocumentCategory;
  title: string;
  thesisId?: string | null;
  bucketOverride?: string;
  parentDocumentId?: string | null;
  versionNumber?: number;
  maxUploadMb?: number;
  allowedFormats?: string[];
}): Promise<{ data: ThesisDocument | null; error: string | null }> {
  const {
    file,
    userId,
    studentId,
    category,
    title,
    thesisId = null,
    bucketOverride,
    parentDocumentId = null,
    versionNumber = 1,
    maxUploadMb = 25,
    allowedFormats = ['pdf', 'docx', 'png', 'jpg', 'jpeg'],
  } = params;

  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (allowedFormats.length > 0 && !allowedFormats.includes(ext)) {
    return {
      data: null,
      error: `Format file .${ext} tidak diizinkan. Format yang didukung: ${allowedFormats.join(', ').toUpperCase()}.`,
    };
  }

  if (file.size > maxUploadMb * 1024 * 1024) {
    return {
      data: null,
      error: `Ukuran file melebihi batas maksimal ${maxUploadMb} MB.`,
    };
  }

  const bucketName = bucketOverride || getBucketForCategory(category);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${studentId}/${category}/${Date.now()}_v${versionNumber}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    });

  if (uploadError) {
    return { data: null, error: uploadError.message };
  }

  if (parentDocumentId) {
    await supabase
      .from('thesis_documents')
      .update({ is_latest: false })
      .eq('id', parentDocumentId);
  }

  const { data: docData, error: dbError } = await supabase
    .from('thesis_documents')
    .insert({
      thesis_id: thesisId,
      student_id: studentId,
      category,
      title,
      file_name: file.name,
      file_path: filePath,
      bucket_name: bucketName,
      mime_type: file.type || 'application/pdf',
      file_size: file.size,
      version_number: versionNumber,
      parent_document_id: parentDocumentId,
      is_latest: true,
      status: 'pending',
      uploaded_by: userId,
    })
    .select('*')
    .single();

  if (dbError) {
    return { data: null, error: dbError.message };
  }

  await logActivity('upload_document', 'thesis_documents', docData.id, {
    category,
    file_name: file.name,
    version: versionNumber,
  });

  return { data: docData as ThesisDocument, error: null };
}

export async function sendNotification(params: {
  userId: string;
  title: string;
  message: string;
  category?: string;
  entityType?: string;
  entityId?: string;
}): Promise<void> {
  const { error } = await supabase.from('notifications').insert({
    user_id: params.userId,
    title: params.title,
    message: params.message,
    category: params.category || 'general',
    entity_type: params.entityType || null,
    entity_id: params.entityId || null,
  });
  if (error) {
    console.warn('Notification insert skipped:', error.message);
  }
}

export async function logActivity(
  action: string,
  entity: string,
  entityId?: string | null,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const { error } = await supabase.rpc('log_user_activity', {
    p_action: action,
    p_entity: entity,
    p_entity_id: entityId || null,
    p_metadata: metadata,
  });
  if (error) {
    console.warn('Activity log skipped:', error.message);
  }
}
