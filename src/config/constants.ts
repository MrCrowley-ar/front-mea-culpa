export const ESTADO_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  en_curso: 'En Curso',
  completada: 'Completada',
  cancelada: 'Cancelada',
};

export const ESTADO_COLORS: Record<string, string> = {
  pendiente: 'bg-yellow-600/80 text-yellow-100',
  en_curso: 'bg-emerald-600/80 text-emerald-100',
  completada: 'bg-blue-600/80 text-blue-100',
  cancelada: 'bg-red-600/80 text-red-100',
};

export const ROOM_TYPE_ICONS: Record<string, string> = {
  comun: '🚪',
  bonus: '✨',
  jefe: '💀',
  evento: '⚡',
};

export const ROOM_TYPE_COLORS: Record<string, string> = {
  comun: 'border-stone-500',
  bonus: 'border-amber-500',
  jefe: 'border-red-500',
  evento: 'border-purple-500',
};

export const MAX_PARTICIPANTS = 5;

export const TIER_LABELS: Record<number, string> = {
  1: 'Principiante',
  2: 'Intermedio',
  3: 'Avanzado',
  4: 'Experto',
};
