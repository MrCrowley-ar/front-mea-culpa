import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import { historyService } from '../services/history.service';
import { ROOM_TYPE_ICONS } from '../config/constants';
import type { HistorialHabitacion } from '../types/history';

export function ExpeditionHistoryPage() {
  const { expeditionId } = useParams<{ expeditionId: string }>();
  const [history, setHistory] = useState<HistorialHabitacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRoom, setExpandedRoom] = useState<number | null>(null);

  useEffect(() => {
    if (!expeditionId) return;
    historyService
      .getExpeditionHistory(parseInt(expeditionId))
      .then(setHistory)
      .finally(() => setLoading(false));
  }, [expeditionId]);

  if (loading) return <Spinner className="py-12" />;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-100 font-[var(--font-heading)]">
          Historial — Expedicion #{expeditionId}
        </h1>
        <Link
          to={`/expeditions/${expeditionId}`}
          className="text-sm text-amber-500 hover:text-amber-400"
        >
          Ver detalle
        </Link>
      </div>

      {history.length === 0 ? (
        <Card>
          <p className="text-stone-500 text-center py-8">
            No hay salas registradas todavia.
          </p>
        </Card>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-[var(--color-dungeon-border)]" />

          <div className="space-y-4">
            {history.map((room) => (
              <div key={room.id} className="relative pl-10">
                {/* Timeline dot */}
                <div
                  className={`absolute left-2.5 top-5 w-3 h-3 rounded-full border-2 ${
                    room.completada
                      ? 'bg-emerald-500 border-emerald-400'
                      : 'bg-stone-600 border-stone-500'
                  }`}
                />

                <Card
                  hover
                  onClick={() =>
                    setExpandedRoom(expandedRoom === room.id ? null : room.id)
                  }
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">
                        {ROOM_TYPE_ICONS[room.tipo_habitacion_nombre] || '?'}
                      </span>
                      <div>
                        <p className="text-stone-200 text-sm font-medium">
                          Sala {room.orden} — {room.tipo_habitacion_nombre}
                        </p>
                        <p className="text-xs text-stone-500">
                          Piso {room.piso_numero} &middot; d20:{' '}
                          {room.tirada_encuentro ?? '?'} &middot;{' '}
                          {room.enemigos_derrotados} enemigos
                        </p>
                      </div>
                    </div>
                    {room.completada ? (
                      <span className="text-emerald-500 text-xs">Completada</span>
                    ) : (
                      <span className="text-amber-500 text-xs">En progreso</span>
                    )}
                  </div>

                  {/* Expanded rewards */}
                  {expandedRoom === room.id && room.recompensas.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-[var(--color-dungeon-border)] space-y-2 animate-fade-in">
                      <h4 className="text-xs font-medium text-stone-400 uppercase tracking-wider">
                        Recompensas
                      </h4>
                      {room.recompensas.map((rew) => (
                        <div
                          key={rew.id}
                          className="flex items-center justify-between text-sm py-1"
                        >
                          <div>
                            <span className="text-stone-300">
                              {rew.participacion_personaje}
                            </span>
                            {rew.item_nombre && (
                              <span className="text-emerald-400 ml-2">
                                {rew.item_nombre}
                                {rew.modificador_tier > 0 &&
                                  ` +${rew.modificador_tier}`}
                              </span>
                            )}
                            {rew.oro_obtenido > 0 && (
                              <span className="text-amber-400 ml-2">
                                {rew.oro_obtenido}g
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-stone-500">
                            d20: {rew.tirada_original}
                            {rew.tirada_subtabla && ` → ${rew.tirada_subtabla}`}
                            {rew.vendido && (
                              <span className="ml-2 text-emerald-400">
                                Vendido: {rew.precio_venta}g
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {expandedRoom === room.id && room.notas && (
                    <p className="mt-2 text-xs text-stone-500 italic">
                      {room.notas}
                    </p>
                  )}
                </Card>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
