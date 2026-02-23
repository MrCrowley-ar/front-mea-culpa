import { api } from '../lib/axios';
import type { User } from '../types/auth';

export const userService = {
  getAll: async (): Promise<User[]> => {
    const { data } = await api.get<User[]>('/usuarios');
    return data;
  },

  getById: async (discordId: string): Promise<User> => {
    const { data } = await api.get<User>(`/usuarios/${discordId}`);
    return data;
  },
};
