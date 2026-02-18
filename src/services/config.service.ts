import { api } from '../lib/axios';
import type { Tier, Piso, TipoHabitacion, Item, AllowedDiscord } from '../types/config';

export const configService = {
  getTiers: async (): Promise<Tier[]> => {
    const { data } = await api.get<Tier[]>('/configuracion/tiers');
    return data;
  },

  getPisos: async (): Promise<Piso[]> => {
    const { data } = await api.get<Piso[]>('/configuracion/pisos');
    return data;
  },

  getTiposHabitacion: async (): Promise<TipoHabitacion[]> => {
    const { data } = await api.get<TipoHabitacion[]>('/configuracion/tipos-habitacion');
    return data;
  },

  getItems: async (): Promise<Item[]> => {
    const { data } = await api.get<Item[]>('/configuracion/items');
    return data;
  },

  getAllowedDiscords: async (): Promise<AllowedDiscord[]> => {
    const { data } = await api.get<AllowedDiscord[]>('/configuracion/allowed-discords');
    return data;
  },

  addAllowedDiscord: async (discord_id: string, nota?: string): Promise<AllowedDiscord> => {
    const { data } = await api.post<AllowedDiscord>('/configuracion/allowed-discords', {
      discord_id,
      nota,
    });
    return data;
  },

  removeAllowedDiscord: async (id: number): Promise<void> => {
    await api.delete(`/configuracion/allowed-discords/${id}`);
  },
};
