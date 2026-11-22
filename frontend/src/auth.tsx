import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, apiMessage, clearAuthRedirect, getToken, setToken, type AuthUser } from './api';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (...roles: AuthUser['role'][]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .get<AuthUser>('/auth/me')
      .then((response) => {
        if (active) setUser(response.data);
      })
      .catch(() => {
        if (active) setToken(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login: async (email, password) => {
        try {
          const response = await api.post<{ access_token: string; user: AuthUser }>('/auth/login', {
            email,
            password,
          });
          clearAuthRedirect();
          setToken(response.data.access_token);
          setUser(response.data.user);
        } catch (error) {
          throw new Error(apiMessage(error));
        }
      },
      logout: () => {
        clearAuthRedirect();
        setToken(null);
        setUser(null);
      },
      can: (...roles) => (user ? roles.includes(user.role) : false),
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
