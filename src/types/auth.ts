export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  discord_id: string;
  nombre: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
}

export interface User {
  discord_id: string;
  nombre: string;
  email: string;
  rol: 'player' | 'dm' | 'admin';
  created_at: string;
}
