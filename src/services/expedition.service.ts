import { api } from '../lib/axios';
import type {
  Expedicion,
  CreateExpedicionDto,
  UpdateExpedicionDto,
  Participacion,
  CreateParticipacionDto,
} from '../types/expedition';

export const expeditionService = {
  getAll: async (): Promise<Expedicion[]> => {
    const { data } = await api.get<Expedicion[]>('/expediciones');
    return data;
  },

  getById: async (id: number): Promise<Expedicion> => {
    const { data } = await api.get<Expedicion>(`/expediciones/${id}`);
    return data;
  },

  create: async (dto: CreateExpedicionDto): Promise<Expedicion> => {
    const { data } = await api.post<Expedicion>('/expediciones', dto);
    return data;
  },

  update: async (id: number, dto: UpdateExpedicionDto): Promise<Expedicion> => {
    const { data } = await api.put<Expedicion>(`/expediciones/${id}`, dto);
    return data;
  },

  remove: async (id: number): Promise<void> => {
    await api.delete(`/expediciones/${id}`);
  },

  getParticipaciones: async (expedId: number): Promise<Participacion[]> => {
    const { data } = await api.get<Participacion[]>(
      `/expediciones/${expedId}/participaciones`
    );
    return data;
  },

  addParticipacion: async (
    expedId: number,
    dto: CreateParticipacionDto
  ): Promise<Participacion> => {
    const { data } = await api.post<Participacion>(
      `/expediciones/${expedId}/participaciones`,
      dto
    );
    return data;
  },

  removeParticipacion: async (participacionId: number): Promise<void> => {
    await api.delete(`/expediciones/participaciones/${participacionId}`);
  },

  desactivarParticipante: async (participacionId: number): Promise<void> => {
    await api.put(`/expediciones/participaciones/${participacionId}/desactivar`);
  },

  reactivarParticipante: async (participacionId: number): Promise<void> => {
    await api.put(`/expediciones/participaciones/${participacionId}/reactivar`);
  },
};
