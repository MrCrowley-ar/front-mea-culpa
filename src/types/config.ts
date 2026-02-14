export interface Tier {
  id: number;
  numero: number;
  piso_min: number;
  piso_max: number;
  mod_armas: number;
  mod_armaduras: number;
  descripcion: string | null;
}

export interface Piso {
  numero: number;
  tier_id: number;
  tier_numero: number;
  bonus_recompensa: number;
  num_habitaciones_comunes: number;
}

export interface TipoHabitacion {
  id: number;
  nombre: string;
  usa_tabla_boss: boolean;
  descripcion: string;
}

export type TipoItem = 'consumible' | 'equipo' | 'arma' | 'armadura' | 'material' | 'otro';

export interface Item {
  id: number;
  nombre: string;
  tipo: TipoItem;
  precio_base: number | null;
  dados_precio: string | null;
  descripcion: string | null;
  es_base_modificable: boolean;
}
