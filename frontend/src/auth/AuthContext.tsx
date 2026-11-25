import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, refreshSession, setAccessToken, setSessionLostHandler } from '../api/client';
import type { Lang, User } from '../api/types';
import { setLanguage } from '../i18n';

interface AuthCtx {
  user: User | null;
  /** false until the silent session restore has finished */
  ready: boolean;
  login(email: string, password: string): Promise<void>;
  register(name: string, email: string, password: string, language: Lang): Promise<void>;
  logout(): Promise<void>;
  /** adopt a session returned by reset/change-password */
  adopt(res: { access_token: string; user: User }): void;
  updateProfile(p: { name?: string; language?: Lang }): Promise<void>;
}

const Ctx = createContext<AuthCtx>(null!);
export const useAuth = () => useContext(Ctx);

interface SessionRes {
  access_token: string;
  user: User;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const adopt = useCallback((res: SessionRes) => {
    setAccessToken(res.access_token);
    setUser(res.user);
    setLanguage(res.user.language);
  }, []);

  // Silent restore: if the refresh cookie is still valid the user never sees a login screen.
  useEffect(() => {
    setSessionLostHandler(() => setUser(null));
    (async () => {
      if (await refreshSession()) {
        try {
          const { user } = await api.get<{ user: User }>('/me');
          setUser(user);
          setLanguage(user.language);
        } catch {
          /* fall through to login */
        }
      }
      setReady(true)
    })();
  }, []);

  // Coming back to the app after hours: make sure the session is still alive.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && user) api.get('/me').catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user]);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      ready,
      adopt,
      async login(email, password) {
        adopt(await api.post<SessionRes>('/auth/login', { email, password }));
      },
      async register(name, email, password, language) {
        adopt(await api.post<SessionRes>('/auth/register', { name, email, password, language }));
      },
      async logout() {
        try {
          await api.post('/auth/logout');
        } catch {
          /* ignore */
        }
        setAccessToken(null);
        setUser(null);
        try {
          localStorage.removeItem('lastPath');
        } catch {
          /* ignore */
        }
      },
      async updateProfile(p) {
        const { user } = await api.patch<{ user: User }>('/me', p);
        setUser(user);
        if (p.language) setLanguage(p.language);
      },
    }),
    [user, ready, adopt]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
