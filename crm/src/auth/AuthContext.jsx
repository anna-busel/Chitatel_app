import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchMe, logout as apiLogout, onLogout, tokens } from '../api/client';

/**
 * Кто вошёл: { id, name, email, role, perms[] } из GET /api/crm/me.
 * status: 'loading' (проверяем сохранённый токен) | 'in' | 'out'.
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [member, setMember] = useState(null);
  const [status, setStatus] = useState(tokens.access || tokens.refresh ? 'loading' : 'out');
  const [error, setError] = useState('');

  useEffect(() => onLogout(() => {
    setMember(null);
    setStatus('out');
  }), []);

  useEffect(() => {
    if (status !== 'loading') return undefined;
    let alive = true;
    fetchMe()
      .then((me) => {
        if (!alive) return;
        setMember(me);
        setStatus('in');
      })
      .catch((err) => {
        if (!alive) return;
        // 401 после неудачного refresh клиент уже сам вызвал выход.
        if (err.status === 401 || err.status === 403) {
          tokens.clear();
          setStatus('out');
        } else {
          setError(err.message);
          setStatus('error');
        }
      });
    return () => { alive = false; };
  }, [status]);

  const signedIn = useCallback((m) => {
    setMember(m);
    setError('');
    setStatus('in');
  }, []);

  const retry = useCallback(() => {
    setError('');
    setStatus('loading');
  }, []);

  const logout = useCallback(() => apiLogout(), []);

  const can = useCallback(
    (perm) => !perm || Boolean(member && member.perms && member.perms.includes(perm)),
    [member],
  );

  const value = useMemo(
    () => ({ member, status, error, signedIn, retry, logout, can }),
    [member, status, error, signedIn, retry, logout, can],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth вне AuthProvider');
  return ctx;
}
