import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { jwtDecode } from 'jwt-decode';

interface JwtPayload {
  discord_id: string;
  nombre: string;
  rol: 'player' | 'dm' | 'admin';
  email?: string;
  sub?: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: {
    discord_id: string;
    nombre: string;
    rol: 'player' | 'dm' | 'admin';
    email?: string;
  } | null;
  isAuthenticated: boolean;

  setTokens: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,

      setTokens: (accessToken, refreshToken) => {
        try {
          const decoded = jwtDecode<JwtPayload>(accessToken);
          set({
            accessToken,
            refreshToken,
            user: {
              discord_id: decoded.discord_id || decoded.sub || '',
              nombre: decoded.nombre || '',
              rol: decoded.rol || 'player',
              email: decoded.email,
            },
            isAuthenticated: true,
          });
        } catch {
          set({
            accessToken: null,
            refreshToken: null,
            user: null,
            isAuthenticated: false,
          });
        }
      },

      logout: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
        }),
    }),
    { name: 'mea-culpa-auth' }
  )
);
