import { api } from '../lib/axios';
import type {
  GenerarLayoutRequest,
  LayoutResponse,
  EncounterResponse,
  ProcesarRecompensasRequest,
  ProcesarRecompensasResponse,
  AsignarItemRequest,
  RepartirOroRequest,
  RepartirOroResponse,
  ResumenExpedicion,
  LiquidarRequest,
} from '../types/gameplay';
import type { Participacion } from '../types/expedition';

export const gameplayService = {
  generarLayout: async (dto: GenerarLayoutRequest): Promise<LayoutResponse> => {
    const { data } = await api.post<LayoutResponse>('/gameplay/generar-layout-piso', dto);
    return data;
  },

  resolverEncuentroHabitacion: async (habitacionId: number, tirada: number): Promise<EncounterResponse> => {
    const { data } = await api.post<EncounterResponse>('/gameplay/resolver-encuentro-habitacion', {
      historial_habitacion_id: habitacionId,
      tirada,
    });
    return data;
  },

  procesarRecompensas: async (dto: ProcesarRecompensasRequest): Promise<ProcesarRecompensasResponse> => {
    const { data } = await api.post<ProcesarRecompensasResponse>(
      '/gameplay/procesar-recompensas-habitacion',
      dto
    );
    return data;
  },

  asignarItem: async (dto: AsignarItemRequest): Promise<void> => {
    await api.post('/gameplay/asignar-item', dto);
  },

  repartirOro: async (dto: RepartirOroRequest): Promise<RepartirOroResponse> => {
    const { data } = await api.post<RepartirOroResponse>('/gameplay/repartir-oro-habitacion', dto);
    return data;
  },

  completarHabitacion: async (habitacionId: number): Promise<void> => {
    await api.post(`/gameplay/completar-habitacion/${habitacionId}`);
  },

  getParticipantesActivos: async (expedId: number): Promise<Participacion[]> => {
    const { data } = await api.get<Participacion[]>(`/gameplay/participantes-activos/${expedId}`);
    return data;
  },

  getResumen: async (expedId: number): Promise<ResumenExpedicion> => {
    const { data } = await api.get<ResumenExpedicion>(`/gameplay/resumen-expedicion/${expedId}`);
    return data;
  },

  liquidar: async (dto: LiquidarRequest): Promise<void> => {
    await api.post('/gameplay/liquidar-recompensas', dto);
  },
};
