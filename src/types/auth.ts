export interface LoginRequest {
  discord_id: string;
  password: string;
}

export interface RegisterRequest {
  discord_id: string;
  nombre: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
}

export interface User {
  discord_id: string;
  nombre: string;
  rol: 'JUGADOR' | 'DM' | 'ADMIN';
  created_at: string;
}
