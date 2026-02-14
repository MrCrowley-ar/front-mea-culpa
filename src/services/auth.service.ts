import axios from 'axios';
import type { LoginRequest, RegisterRequest, AuthResponse } from '../types/auth';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

export const authService = {
  login: async (dto: LoginRequest): Promise<AuthResponse> => {
    const { data } = await axios.post<AuthResponse>(`${baseURL}/auth/login`, dto);
    return data;
  },

  register: async (dto: RegisterRequest): Promise<AuthResponse> => {
    const { data } = await axios.post<AuthResponse>(`${baseURL}/auth/register`, dto);
    return data;
  },

  refresh: async (refreshToken: string): Promise<AuthResponse> => {
    const { data } = await axios.post<AuthResponse>(`${baseURL}/auth/refresh`, {
      refresh_token: refreshToken,
    });
    return data;
  },
};
