export interface HistorialHabitacion {
  id: number;
  expedicion_id: number;
  piso_numero: number;
  tipo_habitacion_id: number;
  tipo_habitacion_nombre: string;
  orden: number;
  tirada_encuentro: number | null;
  enemigos_derrotados: number;
  completada: boolean;
  notas: string | null;
  created_at: string;
  recompensas: HistorialRecompensa[];
}

export interface HistorialRecompensa {
  id: number;
  historial_habitacion_id: number;
  participacion_id: number;
  participacion_personaje: string;
  tirada_original: number;
  tirada_subtabla: number | null;
  item_id: number | null;
  item_nombre: string | null;
  modificador_tier: number;
  oro_obtenido: number;
  vendido: boolean;
  precio_venta: number | null;
  created_at: string;
}
