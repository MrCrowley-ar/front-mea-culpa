import { api } from '../lib/axios';
import type { User, Personaje } from '../types/auth';

export const userService = {
  getAll: async (): Promise<User[]> => {
    const { data } = await api.get<User[]>('/usuarios');
    return data;
  },

  getJugadores: async (): Promise<User[]> => {
    const { data } = await api.get<User[]>('/usuarios/jugadores');
    return data;
  },

  getById: async (discordId: string): Promise<User> => {
    const { data } = await api.get<User>(`/usuarios/${discordId}`);
    return data;
  },

  getPersonajes: async (discordId: string): Promise<Personaje[]> => {
    const { data } = await api.get<Personaje[]>(`/usuarios/${discordId}/personajes`);
    return data;
  },

  createJugador: async (dto: { discord_id: string; nombre: string }): Promise<User> => {
    const { data } = await api.post<User>('/usuarios/jugadores', dto);
    return data;
  },

  createPersonaje: async (discordId: string, dto: { nombre: string }): Promise<Personaje> => {
    const { data } = await api.post<Personaje>(`/usuarios/${discordId}/personajes`, dto);
    return data;
  },
};
