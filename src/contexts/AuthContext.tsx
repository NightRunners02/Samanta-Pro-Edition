import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { formatSupabaseError, getSignedDocumentUrl, isSchemaMissingError, logActivity, supabase } from '../lib/supabase';
import type { AcademicPeriod, Profile, SystemSettings } from '../types/database';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  avatarSignedUrl: string | null;
  setAvatarSignedUrl: (url: string | null) => void;
  systemSettings: SystemSettings | null;
  activePeriod: AcademicPeriod | null;
  loading: boolean;
  schemaMissing: boolean;
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => void;
  refreshProfile: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  signInWithIdentifier: (identifier: string, password: string) => Promise<{ error: string | null }>;
  signUpStudent: (payload: {
    fullName: string;
    nim: string;
    email?: string;
    departmentId: string;
    programId: string;
    entryYear: number;
    password: string;
  }) => Promise<{ error: string | null }>;
  sendPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [avatarSignedUrl, setAvatarSignedUrl] = useState<string | null>(null);
  const [systemSettings, setSystemSettings] = useState<SystemSettings | null>(null);
  const [activePeriod, setActivePeriod] = useState<AcademicPeriod | null>(null);
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  const fetchSettings = useCallback(async () => {
    const { data: settingsData, error: settingsError } = await supabase
      .from('system_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (settingsError) {
      if (isSchemaMissingError(settingsError)) {
        setSchemaMissing(true);
      }
      return;
    }

    setSchemaMissing(false);
    if (settingsData) {
      setSystemSettings(settingsData as SystemSettings);
      if (settingsData.app_name) {
        document.title = `${settingsData.app_name} — Academic Thesis Management Platform`;
      }
      if (settingsData.active_period_id) {
        const { data: periodData } = await supabase
          .from('academic_periods')
          .select('*')
          .eq('id', settingsData.active_period_id)
          .maybeSingle();
        if (periodData) setActivePeriod(periodData as AcademicPeriod);
      } else {
        const { data: periodData } = await supabase
          .from('academic_periods')
          .select('*')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        if (periodData) setActivePeriod(periodData as AcademicPeriod);
      }
    }
  }, []);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, department:departments(*), program:programs(*)')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      if (isSchemaMissingError(error)) {
        setSchemaMissing(true);
      }
      return;
    }

    if (data) {
      setProfile(data as Profile);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const init = async () => {
      setLoading(true);
      await fetchSettings();
      const { data } = await supabase.auth.getSession();
      if (!active) return;

      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        await fetchProfile(data.session.user.id);
      }
      setLoading(false);
    };

    init();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }
      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (nextSession?.user) {
        await fetchProfile(nextSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [fetchProfile, fetchSettings]);

  // Resolve signed URL whenever profile.avatar_url changes
  useEffect(() => {
    let active = true;
    const rawAvatar = profile?.avatar_url;

    if (!rawAvatar) {
      setAvatarSignedUrl(null);
      return;
    }

    if (/^(https?:|blob:|data:)/i.test(rawAvatar)) {
      setAvatarSignedUrl(rawAvatar);
      return;
    }

    getSignedDocumentUrl('avatars', rawAvatar, 3600).then((signed) => {
      if (active && signed) {
        setAvatarSignedUrl(signed);
      }
    });

    return () => {
      active = false;
    };
  }, [profile?.avatar_url]);

  // Real-time listener on own profile row for instant updates across all roles & tabs
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`profile_realtime_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        () => {
          fetchProfile(user.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchProfile]);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await fetchProfile(user.id);
    }
  }, [user?.id, fetchProfile]);

  const signInWithIdentifier = async (identifier: string, password: string) => {
    const cleanId = identifier.trim();
    if (!cleanId || !password) {
      return { error: 'NIM / NIP / NIDN dan kata sandi wajib diisi.' };
    }

    try {
      let emailToUse = cleanId;
      if (!cleanId.includes('@')) {
        const { data: resolvedEmail, error: lookupError } = await supabase.rpc('login_lookup_email', {
          p_identifier: cleanId,
        });
        if (lookupError) {
          if (isSchemaMissingError(lookupError)) {
            setSchemaMissing(true);
            return { error: 'Database schema belum diperbarui di Supabase.' };
          }
          return { error: formatSupabaseError(lookupError) };
        }
        if (!resolvedEmail) {
          return { error: 'NIM atau NIP/NIDN tidak ditemukan atau akun tidak aktif.' };
        }
        emailToUse = resolvedEmail as string;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password,
      });

      if (error) {
        if (error.message.toLowerCase().includes('invalid login credentials')) {
          return { error: 'NIM / NIP / NIDN atau kata sandi salah.' };
        }
        return { error: formatSupabaseError(error) };
      }

      if (data.user) {
        await fetchProfile(data.user.id);
        await logActivity('login', 'auth', data.user.id, { method: cleanId.includes('@') ? 'email' : 'nim_nip' });
      }

      return { error: null };
    } catch (err) {
      return { error: formatSupabaseError(err) };
    }
  };

  const signUpStudent = async (payload: {
    fullName: string;
    nim: string;
    email?: string;
    departmentId: string;
    programId: string;
    entryYear: number;
    password: string;
  }) => {
    try {
      const { data: regData, error: regError } = await supabase.rpc('register_student_account', {
        p_full_name: payload.fullName.trim(),
        p_nim: payload.nim.trim(),
        p_password: payload.password,
        p_department_id: payload.departmentId,
        p_program_id: payload.programId,
        p_entry_year: payload.entryYear,
        p_email: payload.email?.trim() || null,
      });

      if (regError) {
        if (regError.code === 'PGRST202' || regError.message.includes('Could not find the function')) {
          setSchemaMissing(true);
          return { error: 'Fungsi registrasi database belum diperbarui. Silakan jalankan ulang 0004_taflow_complete.sql di Supabase SQL Editor.' };
        }
        return { error: formatSupabaseError(regError) };
      }

      const createdEmail = (regData as { email?: string } | null)?.email;
      if (!createdEmail) {
        return { error: 'Akun berhasil dibuat, silakan masuk menggunakan NIM Anda.' };
      }

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: createdEmail,
        password: payload.password,
      });

      if (signInError) {
        return { error: formatSupabaseError(signInError) };
      }

      if (signInData.user) {
        await fetchProfile(signInData.user.id);
        await logActivity('register_student', 'auth', signInData.user.id, { nim: payload.nim.trim() });
      }

      return { error: null };
    } catch (err) {
      return { error: formatSupabaseError(err) };
    }
  };

  const sendPasswordReset = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/`,
      });
      return { error: error ? formatSupabaseError(error) : null };
    } catch (err) {
      return { error: formatSupabaseError(err) };
    }
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (!error && user) {
      await logActivity('password_changed', 'auth', user.id, {});
      setIsPasswordRecovery(false);
    }
    return { error: error ? error.message : null };
  };

  const signOut = async () => {
    if (user) {
      await logActivity('logout', 'auth', user.id, {});
    }
    await supabase.auth.signOut();
    setProfile(null);
    setAvatarSignedUrl(null);
    setSession(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        avatarSignedUrl,
        setAvatarSignedUrl,
        systemSettings,
        activePeriod,
        loading,
        schemaMissing,
        isPasswordRecovery,
        clearPasswordRecovery: () => setIsPasswordRecovery(false),
        refreshProfile,
        refreshSettings: fetchSettings,
        signInWithIdentifier,
        signUpStudent,
        sendPasswordReset,
        updatePassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
