import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authApi } from './auth.api';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setError('');
    try {
      const settings = await authApi.config();
      setConfig(settings);
      if (settings.enabled) {
        try {
          const result = await authApi.me();
          setUser(result.user);
        } catch (err) {
          if (![401, 403].includes(err.status)) throw err;
          setUser(null);
          if (err.status === 403) setError(err.message);
        }
      } else setUser(null);
    } catch {
      setUser(null);
      setError('We could not connect to Courtly. Check your connection and try again.');
    } finally {
      setStatus('ready');
    }
  }, []);
  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);
  async function logout() {
    await authApi.logout();
    setUser(null);
  }
  return (
    <AuthContext.Provider value={{ user, status, config, error, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
