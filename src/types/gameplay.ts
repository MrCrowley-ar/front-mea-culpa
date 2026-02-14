export interface GenerarLayoutRequest {
  expedicion_id: number;
  piso: number;
  incluir_bonus?: boolean;
  incluir_evento?: boolean;
}

export interface HabitacionLayout {
  id: number;
  orden: number;
  tipo_habitacion_id: number;
  tipo_nombre: string;
  completada: boolean;
}

export interface LayoutResponse {
  expedicion_id: number;
  piso: number;
  total_habitaciones: number;
  habitaciones: HabitacionLayout[];
}

export interface EncounterRequest {
  piso: number;
  tipo_habitacion_id: number;
  tirada: number;
}

export interface EnemyResult {
  nombre: string;
  max_cantidad: number;
}

export interface EncounterResponse {
  piso: number;
  tipo_habitacion_id: number;
  tirada: number;
  cantidad_total: number;
  enemigos: EnemyResult[];
}

export interface RewardRequest {
  piso: number;
  tipo_habitacion_id: number;
  tirada_d20: number;
  tirada_subtabla?: number;
}

export interface RewardResponse {
  piso: number;
  tipo_habitacion_id: number;
  tirada_original: number;
  bonus_recompensa: number;
  tirada_con_bonus: number;
  tipo_resultado: 'nada' | 'oro' | 'subtabla';
  dados_oro?: string;
  subtabla_nombre?: string;
  tirada_subtabla?: number;
  requiere_subtabla: boolean;
  item_nombre?: string;
  item_id?: number;
  item_con_modificador?: string;
  modificador_tier?: number;
  descripcion: string;
}

export interface ProcesarRecompensasRequest {
  historial_habitacion_id: number;
  tiradas: Array<{
    tirada_d20: number;
    tirada_subtabla?: number;
  }>;
}

export interface ItemPendiente {
  indice: number;
  tirada_d20: number;
  tirada_subtabla: number | null;
  subtabla_nombre: string;
  item_id: number;
  item_nombre: string;
  modificador_tier: number;
}

export interface ProcesarRecompensasResponse {
  historial_habitacion_id: number;
  piso: number;
  tipo_habitacion_id: number;
  resultados: RewardResponse[];
  items_pendientes: ItemPendiente[];
  oro_dados: string[];
}

export interface AsignarItemRequest {
  historial_habitacion_id: number;
  participacion_id: number;
  item_id: number;
  modificador_tier: number;
  tirada_original: number;
  tirada_subtabla?: number;
}

export interface RepartirOroRequest {
  historial_habitacion_id: number;
  expedicion_id: number;
  oro_total: number;
}

export interface RepartoOro {
  participacion_id: number;
  nombre_personaje: string;
  oro: number;
}

export interface RepartirOroResponse {
  repartos: RepartoOro[];
}

export interface ResumenParticipante {
  participacion_id: number;
  nombre_personaje: string;
  usuario_id: string;
  items: Array<{
    recompensa_id: number;
    habitacion_orden: number;
    item_id: number;
    item_nombre: string;
    modificador_tier: number;
    oro_obtenido: number;
    vendido: boolean;
    precio_venta: number | null;
  }>;
  total_oro_bruto: number;
  total_oro_ventas: number;
  total_oro: number;
  oro_acumulado_actual: number;
}

export interface ResumenExpedicion {
  expedicion_id: number;
  estado: string;
  piso_actual: number;
  total_habitaciones: number;
  participantes: ResumenParticipante[];
  oro_total_expedicion: number;
}

export interface LiquidarRequest {
  expedicion_id: number;
  ventas: Array<{
    recompensa_id: number;
    precio_venta: number;
  }>;
}
