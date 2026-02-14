import { api } from '../lib/axios';
import type { HistorialHabitacion, HistorialRecompensa } from '../types/history';

export const historyService = {
  getExpeditionHistory: async (expedId: number): Promise<HistorialHabitacion[]> => {
    const { data } = await api.get<HistorialHabitacion[]>(`/historial/expedicion/${expedId}`);
    return data;
  },

  getHabitacion: async (id: number): Promise<HistorialHabitacion> => {
    const { data } = await api.get<HistorialHabitacion>(`/historial/habitaciones/${id}`);
    return data;
  },

  getRecompensas: async (habitacionId: number): Promise<HistorialRecompensa[]> => {
    const { data } = await api.get<HistorialRecompensa[]>(
      `/historial/habitaciones/${habitacionId}/recompensas`
    );
    return data;
  },
};
