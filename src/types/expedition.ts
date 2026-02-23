export type EstadoExpedicion = 'pendiente' | 'en_curso' | 'completada' | 'cancelada';

export interface Expedicion {
  id: number;
  organizador_id: string;
  organizador_nombre: string;
  fecha: string;
  estado: EstadoExpedicion;
  piso_actual: number;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateExpedicionDto {
  fecha: string;
  notas?: string;
}

export interface UpdateExpedicionDto {
  estado?: EstadoExpedicion;
  piso_actual?: number;
  notas?: string;
}

export interface Participacion {
  id: number;
  expedicion_id: number;
  usuario_id: string;
  usuario_nombre: string;
  nombre_personaje: string;
  oro_acumulado: number;
  activo: boolean;
  sala_salida: number | null;
  created_at: string;
}

export interface CreateParticipacionDto {
  usuario_id: string;
  personaje_id: number;
}
