import { api } from '../lib/axios';
import type {
  GenerarLayoutRequest,
  LayoutResponse,
  EncounterResponse,
  ProcesarRecompensasRequest,
  ProcesarRecompensasResponse,
  RewardResponse,
  ItemPendiente,
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

  // POST /gameplay/resolver-encuentro → {piso, tipo_habitacion_id, tirada}
  resolverEncuentroHabitacion: async (
    piso: number,
    tipoHabitacionId: number,
    tirada: number
  ): Promise<EncounterResponse> => {
    const { data } = await api.post<EncounterResponse>('/gameplay/resolver-encuentro', {
      piso,
      tipo_habitacion_id: tipoHabitacionId,
      tirada,
    });
    return data;
  },

  // Calls POST /gameplay/resolver-recompensa once per tirada and aggregates results
  procesarRecompensas: async (
    dto: ProcesarRecompensasRequest
  ): Promise<ProcesarRecompensasResponse> => {
    const resultados: RewardResponse[] = [];
    const items_pendientes: ItemPendiente[] = [];
    const oro_dados: string[] = [];

    for (let i = 0; i < dto.tiradas.length; i++) {
      const t = dto.tiradas[i];
      const { data } = await api.post<RewardResponse>('/gameplay/resolver-recompensa', {
        piso: dto.piso,
        tipo_habitacion_id: dto.tipo_habitacion_id,
        tirada_d20: t.tirada_d20,
        ...(t.tirada_subtabla != null ? { tirada_subtabla: t.tirada_subtabla } : {}),
      });
      resultados.push(data);

      if (data.tipo_resultado === 'oro' && data.dados_oro) {
        oro_dados.push(data.dados_oro);
      }
      if (
        data.tipo_resultado === 'subtabla' &&
        !data.requiere_subtabla &&
        data.item_id != null
      ) {
        items_pendientes.push({
          indice: i,
          tirada_d20: t.tirada_d20,
          tirada_subtabla: t.tirada_subtabla ?? null,
          subtabla_nombre: data.subtabla_nombre ?? '',
          item_id: data.item_id,
          item_nombre: data.item_nombre ?? '',
          modificador_tier: data.modificador_tier ?? 0,
        });
      }
    }

    return {
      historial_habitacion_id: dto.historial_habitacion_id,
      piso: dto.piso,
      tipo_habitacion_id: dto.tipo_habitacion_id,
      resultados,
      items_pendientes,
      oro_dados,
    };
  },

  // POST /historial/recompensas
  asignarItem: async (dto: AsignarItemRequest): Promise<void> => {
    await api.post('/historial/recompensas', {
      historial_habitacion_id: dto.historial_habitacion_id,
      participacion_id: dto.participacion_id,
      item_id: dto.item_id,
      modificador_tier: dto.modificador_tier,
      tirada_original: dto.tirada_original,
      tirada_subtabla: dto.tirada_subtabla ?? null,
      oro_obtenido: 0,
      vendido: false,
    });
  },

  repartirOro: async (dto: RepartirOroRequest): Promise<RepartirOroResponse> => {
    const { data } = await api.post<RepartirOroResponse>('/gameplay/repartir-oro-habitacion', dto);
    return data;
  },

  // PUT /historial/habitaciones/:id
  completarHabitacion: async (habitacionId: number): Promise<void> => {
    await api.put(`/historial/habitaciones/${habitacionId}`, { completada: true });
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
