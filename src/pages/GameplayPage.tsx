import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { D20Roller } from '../components/dice/D20Roller';
import { expeditionService } from '../services/expedition.service';
import { gameplayService } from '../services/gameplay.service';
import { configService } from '../services/config.service';
import { useExpeditionStore } from '../stores/expedition.store';
import { useToastStore } from '../stores/toast.store';
import { ROOM_TYPE_ICONS, ROOM_TYPE_COLORS, TIER_LABELS } from '../config/constants';
import type { Piso } from '../types/config';
import type {
  EncounterResponse,
  ProcesarRecompensasResponse,
  ItemPendiente,
  RepartoOro,
} from '../types/gameplay';

export function GameplayPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);

  const store = useExpeditionStore();
  const [loading, setLoading] = useState(true);
  const [pisos, setPisos] = useState<Piso[]>([]);

  // Floor generation state
  const [includeBonus, setIncludeBonus] = useState(false);
  const [includeEvento, setIncludeEvento] = useState(false);
  const [generatingFloor, setGeneratingFloor] = useState(false);

  // Encounter state
  const [encounterLoading, setEncounterLoading] = useState(false);

  // Rewards state
  const [rewardTiradas, setRewardTiradas] = useState<Array<{ d20: string; subtabla: string }>>([]);
  const [rewardsLoading, setRewardsLoading] = useState(false);

  // Item assignment state
  const [itemAssignments, setItemAssignments] = useState<Record<number, number>>({});
  const [assigningItems, setAssigningItems] = useState(false);

  // Gold state
  const [goldTotal, setGoldTotal] = useState('');
  const [distributingGold, setDistributingGold] = useState(false);
  const [goldResults, setGoldResults] = useState<RepartoOro[]>([]);

  // Completing room
  const [completingRoom, setCompletingRoom] = useState(false);

  // Floor selection for multi-floor
  const [newFloor, setNewFloor] = useState('');
  const [changingFloor, setChangingFloor] = useState(false);

  useEffect(() => {
    if (!id) return;
    const expedId = parseInt(id);

    Promise.all([
      expeditionService.getById(expedId),
      expeditionService.getParticipaciones(expedId),
      configService.getPisos(),
    ])
      .then(([exp, parts, pisosData]) => {
        store.setActiveExpedition(exp);
        store.setParticipants(parts);
        setPisos(pisosData);

        if (exp.estado !== 'en_curso') {
          navigate(`/expeditions/${id}`);
          return;
        }

        store.setPhase('floor_select');
      })
      .catch(() => addToast('Error al cargar la expedicion', 'error'))
      .finally(() => setLoading(false));

    return () => store.reset();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentHabitacion = store.habitaciones[store.currentHabitacionIndex] || null;
  const currentPiso = pisos.find((p) => p.numero === store.currentFloor);
  const activeParticipants = store.participants.filter((p) => p.activo);

  const handleGenerateFloor = useCallback(async () => {
    if (!store.activeExpedition) return;
    setGeneratingFloor(true);
    try {
      const floor = store.activeExpedition.piso_actual;
      const layout = await gameplayService.generarLayout({
        expedicion_id: store.activeExpedition.id,
        piso: floor,
        incluir_bonus: includeBonus,
        incluir_evento: includeEvento,
      });
      store.setFloor(floor, layout.habitaciones);
      addToast(`Piso ${floor} generado: ${layout.total_habitaciones} salas`, 'success');
    } catch {
      addToast('Error al generar el piso', 'error');
    } finally {
      setGeneratingFloor(false);
    }
  }, [store, includeBonus, includeEvento, addToast]);

  const handleEncounterRoll = useCallback(
    async (tirada: number) => {
      if (!currentHabitacion) return;
      setEncounterLoading(true);
      try {
        const result = await gameplayService.resolverEncuentroHabitacion(
          currentHabitacion.id,
          tirada
        );
        store.setEncounterResult(result);
        store.setPhase('encounter');

        // Pre-fill reward tiradas array with empty slots for each enemy
        setRewardTiradas(
          Array.from({ length: result.cantidad_total }, () => ({
            d20: '',
            subtabla: '',
          }))
        );
      } catch {
        addToast('Error al resolver encuentro', 'error');
      } finally {
        setEncounterLoading(false);
      }
    },
    [currentHabitacion, store, addToast]
  );

  const handleProcessRewards = useCallback(async () => {
    if (!currentHabitacion || !store.encounterResult) return;

    const tiradas = rewardTiradas.map((t) => ({
      tirada_d20: parseInt(t.d20) || 0,
      tirada_subtabla: t.subtabla ? parseInt(t.subtabla) : undefined,
    }));

    if (tiradas.some((t) => t.tirada_d20 < 1 || t.tirada_d20 > 20)) {
      addToast('Todas las tiradas deben ser entre 1 y 20', 'error');
      return;
    }

    setRewardsLoading(true);
    try {
      const result = await gameplayService.procesarRecompensas({
        historial_habitacion_id: currentHabitacion.id,
        tiradas,
      });
      store.setRewardsResult(result);
      store.setPhase('assign_items');
    } catch {
      addToast('Error al procesar recompensas', 'error');
    } finally {
      setRewardsLoading(false);
    }
  }, [currentHabitacion, store, rewardTiradas, addToast]);

  const handleAssignItems = useCallback(async () => {
    if (!currentHabitacion || !store.rewardsResult) return;
    setAssigningItems(true);
    try {
      for (const item of store.rewardsResult.items_pendientes) {
        const participacionId = itemAssignments[item.indice];
        if (!participacionId) {
          addToast(`Asigna el item "${item.item_nombre}" a un jugador`, 'error');
          setAssigningItems(false);
          return;
        }
        await gameplayService.asignarItem({
          historial_habitacion_id: currentHabitacion.id,
          participacion_id: participacionId,
          item_id: item.item_id,
          modificador_tier: item.modificador_tier,
          tirada_original: item.tirada_d20,
          tirada_subtabla: item.tirada_subtabla ?? undefined,
        });
      }
      addToast('Items asignados', 'success');
      store.setPhase('distribute_gold');
    } catch {
      addToast('Error al asignar items', 'error');
    } finally {
      setAssigningItems(false);
    }
  }, [currentHabitacion, store, itemAssignments, addToast]);

  const handleDistributeGold = useCallback(async () => {
    if (!currentHabitacion || !store.activeExpedition) return;
    const total = parseInt(goldTotal);
    if (isNaN(total) || total < 0) {
      addToast('Ingresa un total de oro valido', 'error');
      return;
    }

    setDistributingGold(true);
    try {
      const result = await gameplayService.repartirOro({
        historial_habitacion_id: currentHabitacion.id,
        expedicion_id: store.activeExpedition.id,
        oro_total: total,
      });
      setGoldResults(result.repartos);
      addToast('Oro repartido', 'success');
      store.setPhase('room_complete');
    } catch {
      addToast('Error al repartir oro', 'error');
    } finally {
      setDistributingGold(false);
    }
  }, [currentHabitacion, store, goldTotal, addToast]);

  const handleCompleteRoom = useCallback(async () => {
    if (!currentHabitacion) return;
    setCompletingRoom(true);
    try {
      await gameplayService.completarHabitacion(currentHabitacion.id);
      store.markHabitacionCompleted(store.currentHabitacionIndex);
      addToast('Sala completada!', 'success');

      // Reset transient state
      setRewardTiradas([]);
      setItemAssignments({});
      setGoldTotal('');
      setGoldResults([]);

      // Move to next room or check if all done
      const nextIndex = store.habitaciones.findIndex(
        (h, i) => i > store.currentHabitacionIndex && !h.completada
      );

      if (nextIndex >= 0) {
        store.nextHabitacion();
      } else {
        store.setPhase('room_list');
      }
    } catch {
      addToast('Error al completar la sala', 'error');
    } finally {
      setCompletingRoom(false);
    }
  }, [currentHabitacion, store, addToast]);

  const handleChangeFloor = useCallback(async () => {
    if (!store.activeExpedition || !newFloor) return;
    setChangingFloor(true);
    try {
      await expeditionService.update(store.activeExpedition.id, {
        piso_actual: parseInt(newFloor),
      });
      store.setActiveExpedition({
        ...store.activeExpedition,
        piso_actual: parseInt(newFloor),
      });
      store.setPhase('floor_select');
      setNewFloor('');
      addToast('Piso actualizado', 'success');
    } catch {
      addToast('Error al cambiar de piso', 'error');
    } finally {
      setChangingFloor(false);
    }
  }, [store, newFloor, addToast]);

  const handleCompleteExpedition = useCallback(async () => {
    if (!store.activeExpedition) return;
    try {
      await expeditionService.update(store.activeExpedition.id, {
        estado: 'completada',
      });
      addToast('Expedicion completada!', 'success');
      navigate(`/expeditions/${id}/summary`);
    } catch {
      addToast('Error al completar expedicion', 'error');
    }
  }, [store, id, navigate, addToast]);

  if (loading) return <Spinner className="py-12" />;
  if (!store.activeExpedition) {
    return <p className="text-stone-500">Expedicion no encontrada</p>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Status bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-100 font-[var(--font-heading)]">
            Expedicion #{store.activeExpedition.id}
          </h1>
          <p className="text-sm text-stone-500">
            Piso {store.activeExpedition.piso_actual}
            {currentPiso &&
              ` — Tier ${currentPiso.tier_numero} (${TIER_LABELS[currentPiso.tier_numero]}) — Bonus +${currentPiso.bonus_recompensa}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge estado="en_curso" label="En Curso" />
          <Button size="sm" variant="danger" onClick={handleCompleteExpedition}>
            Finalizar
          </Button>
        </div>
      </div>

      {/* Participants bar */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {store.participants.map((p) => (
          <div
            key={p.id}
            className={`flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs ${
              p.activo
                ? 'border-amber-600/40 bg-amber-600/10 text-amber-300'
                : 'border-stone-600 bg-stone-800 text-stone-500 line-through'
            }`}
          >
            <span>{p.nombre_personaje}</span>
            <span className="text-stone-500">{p.oro_acumulado}g</span>
          </div>
        ))}
      </div>

      {/* PHASE: Floor Select */}
      {store.phase === 'floor_select' && (
        <Card>
          <h2 className="text-lg font-semibold text-stone-200 mb-4 font-[var(--font-heading)]">
            Generar Piso {store.activeExpedition.piso_actual}
          </h2>
          <div className="space-y-4">
            <div className="flex gap-4 flex-wrap">
              <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeBonus}
                  onChange={(e) => setIncludeBonus(e.target.checked)}
                  className="rounded border-stone-600 bg-stone-800 text-amber-500 focus:ring-amber-500"
                />
                Incluir Sala Bonus
              </label>
              <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeEvento}
                  onChange={(e) => setIncludeEvento(e.target.checked)}
                  className="rounded border-stone-600 bg-stone-800 text-amber-500 focus:ring-amber-500"
                />
                Incluir Sala Evento
              </label>
            </div>
            <Button onClick={handleGenerateFloor} loading={generatingFloor}>
              Generar Salas
            </Button>
          </div>
        </Card>
      )}

      {/* PHASE: Room List */}
      {store.phase === 'room_list' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-stone-200 font-[var(--font-heading)]">
            Salas del Piso {store.currentFloor}
          </h2>
          <div className="grid gap-2">
            {store.habitaciones.map((hab, index) => (
              <Card
                key={hab.id}
                hover={!hab.completada}
                onClick={() => {
                  if (!hab.completada) {
                    store.setCurrentHabitacionIndex(index);
                    store.setPhase('encounter');
                    store.setEncounterResult(null);
                    store.setRewardsResult(null);
                    setRewardTiradas([]);
                    setItemAssignments({});
                    setGoldTotal('');
                    setGoldResults([]);
                  }
                }}
                className={`flex items-center justify-between border-l-4 ${ROOM_TYPE_COLORS[hab.tipo_nombre] || 'border-stone-500'}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">
                    {ROOM_TYPE_ICONS[hab.tipo_nombre] || '?'}
                  </span>
                  <div>
                    <p className="text-stone-200 text-sm font-medium">
                      Sala {hab.orden} — {hab.tipo_nombre}
                    </p>
                  </div>
                </div>
                {hab.completada ? (
                  <span className="text-emerald-500 text-xs">Completada</span>
                ) : (
                  <span className="text-amber-500 text-xs">Pendiente</span>
                )}
              </Card>
            ))}
          </div>

          {/* All rooms completed */}
          {store.habitaciones.every((h) => h.completada) && (
            <Card className="border-amber-600/50">
              <p className="text-amber-400 text-center mb-4">
                Todas las salas completadas!
              </p>
              <div className="flex gap-3 justify-center flex-wrap">
                <div className="flex items-end gap-2">
                  <Select
                    label="Siguiente piso"
                    placeholder="Elegir piso..."
                    value={newFloor}
                    onChange={(e) => setNewFloor(e.target.value)}
                    options={pisos.map((p) => ({
                      value: p.numero,
                      label: `Piso ${p.numero} — Tier ${p.tier_numero}`,
                    }))}
                  />
                  <Button
                    onClick={handleChangeFloor}
                    loading={changingFloor}
                    disabled={!newFloor}
                    size="sm"
                  >
                    Ir
                  </Button>
                </div>
                <Button variant="secondary" onClick={() => navigate(`/expeditions/${id}/summary`)}>
                  Ver Resumen
                </Button>
                <Button variant="danger" size="sm" onClick={handleCompleteExpedition}>
                  Finalizar Expedicion
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* PHASE: Encounter */}
      {store.phase === 'encounter' && currentHabitacion && (
        <Card className={`border-l-4 ${ROOM_TYPE_COLORS[currentHabitacion.tipo_nombre]}`}>
          <h2 className="text-lg font-semibold text-stone-200 mb-4 font-[var(--font-heading)]">
            {ROOM_TYPE_ICONS[currentHabitacion.tipo_nombre]} Sala{' '}
            {currentHabitacion.orden} — {currentHabitacion.tipo_nombre}
          </h2>

          {!store.encounterResult ? (
            <div className="text-center space-y-4">
              <p className="text-stone-400">Tira el d20 para el encuentro</p>
              {encounterLoading ? (
                <Spinner />
              ) : (
                <D20Roller
                  onRoll={handleEncounterRoll}
                  label="Tirada de Encuentro"
                />
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  store.setPhase('room_list');
                  store.setEncounterResult(null);
                }}
              >
                Volver a salas
              </Button>
            </div>
          ) : (
            <div className="space-y-4 animate-fade-in">
              <EncounterDisplay encounter={store.encounterResult} />

              {/* Reward tiradas */}
              <div className="border-t border-[var(--color-dungeon-border)] pt-4">
                <h3 className="text-sm font-medium text-stone-300 mb-3">
                  Tiradas de Recompensa (1 por enemigo derrotado)
                </h3>
                <div className="space-y-2">
                  {rewardTiradas.map((t, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-stone-500 w-20">
                        Enemigo {i + 1}
                      </span>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        placeholder="d20"
                        value={t.d20}
                        onChange={(e) => {
                          const newTiradas = [...rewardTiradas];
                          newTiradas[i] = { ...newTiradas[i], d20: e.target.value };
                          setRewardTiradas(newTiradas);
                        }}
                        className="w-16 rounded border bg-[var(--color-dungeon)] border-[var(--color-dungeon-border)] px-2 py-1 text-center text-sm text-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                      />
                      <input
                        type="number"
                        min="1"
                        max="20"
                        placeholder="Sub"
                        value={t.subtabla}
                        onChange={(e) => {
                          const newTiradas = [...rewardTiradas];
                          newTiradas[i] = {
                            ...newTiradas[i],
                            subtabla: e.target.value,
                          };
                          setRewardTiradas(newTiradas);
                        }}
                        className="w-16 rounded border bg-[var(--color-dungeon)] border-[var(--color-dungeon-border)] px-2 py-1 text-center text-sm text-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                      />
                      <span className="text-xs text-stone-600">(subtabla, si aplica)</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-4">
                  <Button
                    onClick={handleProcessRewards}
                    loading={rewardsLoading}
                    disabled={rewardTiradas.some((t) => !t.d20)}
                  >
                    Procesar Recompensas
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      store.setPhase('room_list');
                      store.setEncounterResult(null);
                    }}
                  >
                    Volver
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* PHASE: Assign Items */}
      {store.phase === 'assign_items' && store.rewardsResult && (
        <Card>
          <h2 className="text-lg font-semibold text-stone-200 mb-4 font-[var(--font-heading)]">
            Asignar Items
          </h2>

          <RewardsDisplay results={store.rewardsResult} />

          {store.rewardsResult.items_pendientes.length > 0 ? (
            <div className="space-y-3 mt-4">
              <h3 className="text-sm font-medium text-stone-300">
                Items a asignar:
              </h3>
              {store.rewardsResult.items_pendientes.map((item) => (
                <ItemAssignment
                  key={item.indice}
                  item={item}
                  participants={activeParticipants}
                  value={itemAssignments[item.indice] || 0}
                  onChange={(partId) =>
                    setItemAssignments({ ...itemAssignments, [item.indice]: partId })
                  }
                />
              ))}
              <Button
                onClick={handleAssignItems}
                loading={assigningItems}
                disabled={store.rewardsResult.items_pendientes.some(
                  (item) => !itemAssignments[item.indice]
                )}
              >
                Confirmar Asignacion
              </Button>
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-stone-500 text-sm mb-3">
                No hay items para asignar.
              </p>
              <Button onClick={() => store.setPhase('distribute_gold')}>
                Continuar al Oro
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* PHASE: Distribute Gold */}
      {store.phase === 'distribute_gold' && (
        <Card>
          <h2 className="text-lg font-semibold text-stone-200 mb-4 font-[var(--font-heading)]">
            Repartir Oro
          </h2>
          {store.rewardsResult && store.rewardsResult.oro_dados.length > 0 ? (
            <div className="space-y-4">
              <p className="text-stone-400 text-sm">
                Dados de oro a tirar:{' '}
                <span className="text-amber-400 font-medium">
                  {store.rewardsResult.oro_dados.join(', ')}
                </span>
              </p>
              <Input
                label="Total de oro (suma de todos los dados)"
                type="number"
                min="0"
                value={goldTotal}
                onChange={(e) => setGoldTotal(e.target.value)}
                placeholder="Ej: 14"
              />
              <Button
                onClick={handleDistributeGold}
                loading={distributingGold}
                disabled={!goldTotal}
              >
                Repartir
              </Button>
            </div>
          ) : (
            <div>
              <p className="text-stone-500 text-sm mb-3">
                No hay oro para repartir en esta sala.
              </p>
              <Button onClick={() => store.setPhase('room_complete')}>
                Completar Sala
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* PHASE: Room Complete */}
      {store.phase === 'room_complete' && currentHabitacion && (
        <Card className="border-amber-600/40">
          <h2 className="text-lg font-semibold text-amber-400 mb-4 font-[var(--font-heading)]">
            Sala Completada!
          </h2>

          {goldResults.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-stone-300 mb-2">
                Oro repartido:
              </h3>
              <div className="space-y-1">
                {goldResults.map((r) => (
                  <div key={r.participacion_id} className="flex justify-between text-sm">
                    <span className="text-stone-300">{r.nombre_personaje}</span>
                    <span className="text-amber-400">{r.oro}g</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button onClick={handleCompleteRoom} loading={completingRoom}>
            Continuar a siguiente sala
          </Button>
        </Card>
      )}
    </div>
  );
}

// Sub-components

function EncounterDisplay({ encounter }: { encounter: EncounterResponse }) {
  return (
    <div className="bg-[var(--color-dungeon)]/50 rounded p-4">
      <p className="text-stone-300 text-sm mb-2">
        Tirada: <span className="text-amber-400 font-bold text-lg">{encounter.tirada}</span>
      </p>
      <p className="text-stone-300 text-sm mb-3">
        Total de enemigos:{' '}
        <span className="text-red-400 font-bold">{encounter.cantidad_total}</span>
      </p>
      <div className="space-y-1">
        {encounter.enemigos.map((e, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="text-red-400">x{e.max_cantidad}</span>
            <span className="text-stone-200">{e.nombre}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RewardsDisplay({ results }: { results: ProcesarRecompensasResponse }) {
  return (
    <div className="bg-[var(--color-dungeon)]/50 rounded p-4 space-y-2">
      {results.resultados.map((r, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="text-stone-500">#{i + 1}</span>
          {r.tipo_resultado === 'nada' && (
            <span className="text-stone-500">Nada</span>
          )}
          {r.tipo_resultado === 'oro' && (
            <span className="text-amber-400">Oro ({r.dados_oro})</span>
          )}
          {r.tipo_resultado === 'subtabla' && (
            <span className="text-emerald-400">
              {r.item_nombre || r.subtabla_nombre}
              {r.modificador_tier ? ` +${r.modificador_tier}` : ''}
            </span>
          )}
          <span className="text-stone-600 text-xs">
            (d20: {r.tirada_original} +{r.bonus_recompensa} = {r.tirada_con_bonus})
          </span>
        </div>
      ))}
    </div>
  );
}

function ItemAssignment({
  item,
  participants,
  value,
  onChange,
}: {
  item: ItemPendiente;
  participants: { id: number; nombre_personaje: string }[];
  value: number;
  onChange: (partId: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded border border-[var(--color-dungeon-border)] bg-[var(--color-dungeon)]">
      <div className="flex-1">
        <p className="text-stone-200 text-sm font-medium">
          {item.item_nombre}
          {item.modificador_tier > 0 && (
            <span className="text-amber-400"> +{item.modificador_tier}</span>
          )}
        </p>
        <p className="text-xs text-stone-500">
          {item.subtabla_nombre} &middot; d20: {item.tirada_d20}
          {item.tirada_subtabla && ` → sub: ${item.tirada_subtabla}`}
        </p>
      </div>
      <select
        value={value || ''}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="rounded border bg-[var(--color-dungeon-surface)] border-[var(--color-dungeon-border)] px-2 py-1 text-sm text-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
      >
        <option value="">Asignar a...</option>
        {participants.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre_personaje}
          </option>
        ))}
      </select>
    </div>
  );
}
