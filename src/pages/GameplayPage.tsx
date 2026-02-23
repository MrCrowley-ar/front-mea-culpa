import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { expeditionService } from '../services/expedition.service';
import { gameplayService } from '../services/gameplay.service';
import { configService } from '../services/config.service';
import { useExpeditionStore, type RoomState } from '../stores/expedition.store';
import { useToastStore } from '../stores/toast.store';
import { rollD20, rollDice } from '../lib/dice';
import { ROOM_TYPE_ICONS, ROOM_TYPE_COLORS, TIER_LABELS } from '../config/constants';
import type { Piso } from '../types/config';
import type {
  EncounterResponse,
  ProcesarRecompensasResponse,
  ItemPendiente,
  RepartoOro,
  RewardResponse,
} from '../types/gameplay';
import type { Participacion } from '../types/expedition';

type SetupPhase = 'configure_floor' | 'rooms_generated' | 'playing';

export function GameplayPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);

  const store = useExpeditionStore();
  const [loading, setLoading] = useState(true);
  const [pisos, setPisos] = useState<Piso[]>([]);

  // Setup phase for current floor
  const [setupPhase, setSetupPhase] = useState<SetupPhase>('configure_floor');
  const [includeBonus, setIncludeBonus] = useState(false);
  const [includeEvento, setIncludeEvento] = useState(false);
  const [generatingFloor, setGeneratingFloor] = useState(false);

  // Single "roll all encounters" loading state
  const [rollingAllEncounters, setRollingAllEncounters] = useState(false);

  // Per-room reward state
  const [roomRewardTiradas, setRoomRewardTiradas] = useState<
    Record<number, Array<{ d20: string; subtabla: string }>>
  >({});
  // Which tirada indices need a subtabla after a first processing pass
  const [roomPendingSubtablas, setRoomPendingSubtablas] = useState<
    Record<number, boolean[]>
  >({});
  const [roomItemAssignments, setRoomItemAssignments] = useState<
    Record<number, Record<number, number>>
  >({});
  const [roomGoldTotals, setRoomGoldTotals] = useState<Record<number, string>>({});
  const [roomGoldResults, setRoomGoldResults] = useState<Record<number, RepartoOro[]>>({});
  const [expandedRoomIndex, setExpandedRoomIndex] = useState<number | null>(null);

  // Loading states
  const [rewardsLoading, setRewardsLoading] = useState<number | null>(null);
  const [assigningItems, setAssigningItems] = useState<number | null>(null);
  const [distributingGold, setDistributingGold] = useState<number | null>(null);
  const [completingRoom, setCompletingRoom] = useState<number | null>(null);

  // Drag and drop state
  const draggingItem = useRef<{ roomIndex: number; itemIndex: number } | null>(null);
  const [dragOverParticipantId, setDragOverParticipantId] = useState<number | null>(null);

  const selectedPisosFromUrl =
    searchParams.get('pisos')?.split(',').map(Number).filter(Boolean) || [];

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

        const pisosToUse =
          selectedPisosFromUrl.length > 0 ? selectedPisosFromUrl : [exp.piso_actual];
        store.setSelectedPisos(pisosToUse);
        store.setFloorConfigs(
          pisosToUse.map((p) => ({
            piso: p,
            numSalas: 4,
            includeBonus: false,
            includeEvento: false,
          }))
        );
      })
      .catch(() => addToast('Error al cargar la expedicion', 'error'))
      .finally(() => setLoading(false));

    return () => store.reset();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentFloorConfig = store.floorConfigs[store.currentFloorIndex];
  const currentPiso = pisos.find((p) => p.numero === currentFloorConfig?.piso);
  const activeParticipants = store.participants.filter((p) => p.activo);
  const allRoomsCompleted =
    store.rooms.length > 0 && store.rooms.every((r) => r.completed);
  const allEncountersResolved =
    store.rooms.length > 0 && store.rooms.every((r) => r.encounterResolved);
  const completedCount = store.rooms.filter((r) => r.completed).length;
  const isLastFloor = store.currentFloorIndex >= store.floorConfigs.length - 1;

  // Total gold per participant from room distributions
  const totalGoldByParticipant = useMemo(() => {
    const totals: Record<number, number> = {};
    Object.values(roomGoldResults)
      .flat()
      .forEach((r) => {
        totals[r.participacion_id] = (totals[r.participacion_id] || 0) + r.oro;
      });
    return totals;
  }, [roomGoldResults]);

  // Items assigned per participant (for right panel display)
  const itemsByParticipant = useMemo(() => {
    const byPart: Record<number, Array<{ roomIndex: number; item: ItemPendiente }>> = {};
    Object.entries(roomItemAssignments).forEach(([roomIndexStr, assignments]) => {
      const roomIndex = parseInt(roomIndexStr);
      const room = store.rooms[roomIndex];
      if (!room?.rewardsResult) return;
      Object.entries(assignments).forEach(([itemIndexStr, participacionId]) => {
        const itemIndex = parseInt(itemIndexStr);
        const item = room.rewardsResult!.items_pendientes[itemIndex];
        if (!item) return;
        if (!byPart[participacionId]) byPart[participacionId] = [];
        byPart[participacionId].push({ roomIndex, item });
      });
    });
    return byPart;
  }, [roomItemAssignments, store.rooms]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleGenerateFloor = useCallback(async () => {
    if (!store.activeExpedition || !currentFloorConfig) return;
    setGeneratingFloor(true);
    try {
      await expeditionService.update(store.activeExpedition.id, {
        piso_actual: currentFloorConfig.piso,
      });

      const layout = await gameplayService.generarLayout({
        expedicion_id: store.activeExpedition.id,
        piso: currentFloorConfig.piso,
        incluir_bonus: includeBonus,
        incluir_evento: includeEvento,
      });

      const rooms: RoomState[] = layout.habitaciones.map((h) => ({
        habitacion: h,
        encounterResult: null,
        rewardsResult: null,
        encounterResolved: false,
        rewardsResolved: false,
        itemsAssigned: false,
        goldDistributed: false,
        completed: false,
      }));

      store.setRooms(rooms);
      setSetupPhase('rooms_generated');
      addToast(
        `Piso ${currentFloorConfig.piso} generado: ${layout.total_habitaciones} salas`,
        'success'
      );
    } catch {
      addToast('Error al generar el piso', 'error');
    } finally {
      setGeneratingFloor(false);
    }
  }, [store, currentFloorConfig, includeBonus, includeEvento, addToast]);

  // Single button: roll all encounters at once
  const handleRollAllEncounters = useCallback(async () => {
    setRollingAllEncounters(true);
    try {
      for (let i = 0; i < store.rooms.length; i++) {
        const room = store.rooms[i];
        if (room.encounterResolved) continue;
        const tirada = rollD20();
        const result = await gameplayService.resolverEncuentroHabitacion(
          room.habitacion.id,
          tirada
        );
        store.updateRoom(i, { encounterResult: result, encounterResolved: true });
        // Pre-initialize reward inputs
        setRoomRewardTiradas((prev) => ({
          ...prev,
          [i]: Array.from({ length: result.cantidad_total }, () => ({
            d20: '',
            subtabla: '',
          })),
        }));
      }
      setSetupPhase('playing');
      addToast('Todos los encuentros resueltos', 'success');
    } catch {
      addToast('Error al tirar encuentros', 'error');
    } finally {
      setRollingAllEncounters(false);
    }
  }, [store, addToast]);

  const handleProcessRewards = useCallback(
    async (roomIndex: number) => {
      const room = store.rooms[roomIndex];
      if (!room || !room.encounterResult) return;

      const tiradas = (roomRewardTiradas[roomIndex] || []).map((t) => ({
        tirada_d20: parseInt(t.d20) || 0,
        tirada_subtabla: t.subtabla ? parseInt(t.subtabla) : undefined,
      }));

      if (tiradas.some((t) => t.tirada_d20 < 1 || t.tirada_d20 > 20)) {
        addToast('Todas las tiradas d20 deben ser entre 1 y 20', 'error');
        return;
      }

      setRewardsLoading(roomIndex);
      try {
        const result = await gameplayService.procesarRecompensas({
          historial_habitacion_id: room.habitacion.id,
          tiradas,
        });
        const pendingList = result.resultados.map((r) => r.requiere_subtabla);
        const hasPending = pendingList.some(Boolean);
        store.updateRoom(roomIndex, {
          rewardsResult: result,
          rewardsResolved: !hasPending,
        });
        setRoomPendingSubtablas((prev) => ({ ...prev, [roomIndex]: pendingList }));
        if (hasPending) {
          addToast(
            'Algunas recompensas necesitan una segunda tirada — completa los campos resaltados y re-procesa',
            'error'
          );
        }
      } catch {
        addToast('Error al procesar recompensas', 'error');
      } finally {
        setRewardsLoading(null);
      }
    },
    [store, roomRewardTiradas, addToast]
  );

  const handleAssignItems = useCallback(
    async (roomIndex: number) => {
      const room = store.rooms[roomIndex];
      if (!room?.rewardsResult) return;

      const assignments = roomItemAssignments[roomIndex] || {};
      setAssigningItems(roomIndex);
      try {
        for (const item of room.rewardsResult.items_pendientes) {
          const participacionId = assignments[item.indice];
          if (!participacionId) {
            addToast(`Asigna "${item.item_nombre}" a un jugador`, 'error');
            setAssigningItems(null);
            return;
          }
          await gameplayService.asignarItem({
            historial_habitacion_id: room.habitacion.id,
            participacion_id: participacionId,
            item_id: item.item_id,
            modificador_tier: item.modificador_tier,
            tirada_original: item.tirada_d20,
            tirada_subtabla: item.tirada_subtabla || undefined,
          });
        }
        store.updateRoom(roomIndex, { itemsAssigned: true });
        addToast('Items asignados', 'success');
      } catch {
        addToast('Error al asignar items', 'error');
      } finally {
        setAssigningItems(null);
      }
    },
    [store, roomItemAssignments, addToast]
  );

  const handleDistributeGold = useCallback(
    async (roomIndex: number) => {
      const room = store.rooms[roomIndex];
      if (!room || !store.activeExpedition) return;

      const total = parseInt(roomGoldTotals[roomIndex] || '0');
      if (isNaN(total) || total < 0) {
        addToast('Ingresa un total de oro valido', 'error');
        return;
      }

      setDistributingGold(roomIndex);
      try {
        const result = await gameplayService.repartirOro({
          historial_habitacion_id: room.habitacion.id,
          expedicion_id: store.activeExpedition.id,
          oro_total: total,
        });
        setRoomGoldResults((prev) => ({ ...prev, [roomIndex]: result.repartos }));
        store.updateRoom(roomIndex, { goldDistributed: true });
        addToast('Oro repartido', 'success');
      } catch {
        addToast('Error al repartir oro', 'error');
      } finally {
        setDistributingGold(null);
      }
    },
    [store, roomGoldTotals, addToast]
  );

  const handleCompleteRoom = useCallback(
    async (roomIndex: number) => {
      const room = store.rooms[roomIndex];
      if (!room) return;
      setCompletingRoom(roomIndex);
      try {
        await gameplayService.completarHabitacion(room.habitacion.id);
        store.updateRoom(roomIndex, { completed: true });
        setExpandedRoomIndex(null);
        addToast('Sala completada!', 'success');
      } catch {
        addToast('Error al completar la sala', 'error');
      } finally {
        setCompletingRoom(null);
      }
    },
    [store, addToast]
  );

  const handleNextFloor = useCallback(() => {
    setSetupPhase('configure_floor');
    setIncludeBonus(false);
    setIncludeEvento(false);
    setRoomRewardTiradas({});
    setRoomItemAssignments({});
    setRoomGoldTotals({});
    setRoomGoldResults({});
    setExpandedRoomIndex(null);
    store.nextFloor();
  }, [store]);

  const handleCompleteExpedition = useCallback(async () => {
    if (!store.activeExpedition) return;
    if (
      !window.confirm(
        'Completar la expedicion? No podras seguir jugando despues de esto.'
      )
    )
      return;
    try {
      await expeditionService.update(store.activeExpedition.id, { estado: 'completada' });
      addToast('Expedicion completada!', 'success');
      navigate(`/expeditions/${id}/summary`);
    } catch {
      addToast('Error al completar expedicion', 'error');
    }
  }, [store, id, navigate, addToast]);

  const handleDeactivatePlayer = useCallback(
    async (participacionId: number) => {
      try {
        await expeditionService.desactivarParticipante(participacionId);
        store.setParticipants(
          store.participants.map((p) =>
            p.id === participacionId ? { ...p, activo: false } : p
          )
        );
        addToast('Jugador desactivado', 'info');
      } catch {
        addToast('Error al desactivar jugador', 'error');
      }
    },
    [store, addToast]
  );

  const handleReactivatePlayer = useCallback(
    async (participacionId: number) => {
      try {
        await expeditionService.reactivarParticipante(participacionId);
        store.setParticipants(
          store.participants.map((p) =>
            p.id === participacionId ? { ...p, activo: true } : p
          )
        );
        addToast('Jugador reactivado', 'success');
      } catch {
        addToast('Error al reactivar jugador', 'error');
      }
    },
    [store, addToast]
  );

  const handleRollGoldDice = (roomIndex: number) => {
    const room = store.rooms[roomIndex];
    if (!room?.rewardsResult) return;
    let total = 0;
    for (const dado of room.rewardsResult.oro_dados) {
      total += rollDice(dado);
    }
    setRoomGoldTotals((prev) => ({ ...prev, [roomIndex]: String(total) }));
  };

  // ── Drag and Drop handlers ────────────────────────────────────────────────
  const handleItemDragStart = (roomIndex: number, itemIndex: number) => {
    draggingItem.current = { roomIndex, itemIndex };
  };

  const handleParticipantDragOver = (
    e: React.DragEvent<HTMLDivElement>,
    participantId: number
  ) => {
    e.preventDefault();
    setDragOverParticipantId(participantId);
  };

  const handleParticipantDragLeave = () => {
    setDragOverParticipantId(null);
  };

  const handleParticipantDrop = (
    e: React.DragEvent<HTMLDivElement>,
    participantId: number
  ) => {
    e.preventDefault();
    setDragOverParticipantId(null);
    if (draggingItem.current) {
      const { roomIndex, itemIndex } = draggingItem.current;
      setRoomItemAssignments((prev) => ({
        ...prev,
        [roomIndex]: { ...(prev[roomIndex] || {}), [itemIndex]: participantId },
      }));
      draggingItem.current = null;
    }
  };

  if (loading) return <Spinner className="py-12" />;
  if (!store.activeExpedition) {
    return <p className="text-stone-500">Expedicion no encontrada</p>;
  }

  return (
    <div className="space-y-4 max-w-7xl">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-100 font-[var(--font-heading)]">
            Expedicion #{store.activeExpedition.id}
          </h1>
          <p className="text-sm text-stone-500">
            {currentFloorConfig && (
              <>
                Piso {currentFloorConfig.piso}
                {currentPiso &&
                  ` — Tier ${currentPiso.tier_numero} (${
                    TIER_LABELS[currentPiso.tier_numero]
                  }) — Bonus +${currentPiso.bonus_recompensa}`}
              </>
            )}
            {store.floorConfigs.length > 1 && (
              <> — Piso {store.currentFloorIndex + 1}/{store.floorConfigs.length}</>
            )}
            {store.rooms.length > 0 && ` — ${completedCount}/${store.rooms.length} salas`}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge estado="en_curso" label="En Curso" />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => navigate(`/expeditions/${id}/summary`)}
          >
            Resumen
          </Button>
        </div>
      </div>

      {/* ═══ FLOOR PROGRESS ═══ */}
      {store.floorConfigs.length > 1 && (
        <div className="flex gap-1">
          {store.floorConfigs.map((fc, i) => (
            <div
              key={fc.piso}
              className={`h-2 flex-1 rounded-full transition-colors ${
                i < store.currentFloorIndex
                  ? 'bg-emerald-500'
                  : i === store.currentFloorIndex
                  ? 'bg-amber-500'
                  : 'bg-[var(--color-dungeon-border)]'
              }`}
              title={`Piso ${fc.piso}`}
            />
          ))}
        </div>
      )}

      {/* ═══ CONFIGURE FLOOR ═══ */}
      {setupPhase === 'configure_floor' && currentFloorConfig && (
        <Card>
          <h2 className="text-lg font-semibold text-stone-200 mb-4 font-[var(--font-heading)]">
            Configurar Piso {currentFloorConfig.piso}
          </h2>
          {currentPiso && (
            <div className="mb-4 p-3 rounded bg-[var(--color-dungeon)] border border-[var(--color-dungeon-border)]">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <span className="text-stone-500 text-xs">Tier</span>
                  <p className="text-stone-200">
                    {currentPiso.tier_numero} ({TIER_LABELS[currentPiso.tier_numero]})
                  </p>
                </div>
                <div>
                  <span className="text-stone-500 text-xs">Bonus Recompensa</span>
                  <p className="text-amber-400">+{currentPiso.bonus_recompensa}</p>
                </div>
                <div>
                  <span className="text-stone-500 text-xs">Salas Comunes</span>
                  <p className="text-stone-200">{currentPiso.num_habitaciones_comunes}</p>
                </div>
              </div>
            </div>
          )}
          <div className="space-y-4">
            <div className="flex gap-6 flex-wrap">
              <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeBonus}
                  onChange={(e) => setIncludeBonus(e.target.checked)}
                  className="rounded border-stone-600 bg-stone-800 text-amber-500 focus:ring-amber-500 w-4 h-4"
                />
                <span>Sala Bonus ✨</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeEvento}
                  onChange={(e) => setIncludeEvento(e.target.checked)}
                  className="rounded border-stone-600 bg-stone-800 text-amber-500 focus:ring-amber-500 w-4 h-4"
                />
                <span>Sala Evento ⚡</span>
              </label>
            </div>
            <p className="text-xs text-stone-600">+ 1 sala de jefe (siempre incluida)</p>
            <Button onClick={handleGenerateFloor} loading={generatingFloor} size="lg">
              Generar Salas
            </Button>
          </div>
        </Card>
      )}

      {/* ═══ TWO-COLUMN LAYOUT: Rooms (Left) + Participants (Right) ═══ */}
      {setupPhase !== 'configure_floor' && store.rooms.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 items-start">
          {/* ── LEFT: Rooms ── */}
          <div className="space-y-3">
            {/* Room progress bar */}
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-stone-200 font-[var(--font-heading)]">
                Salas — Piso {currentFloorConfig?.piso}
              </h2>
              <span className="text-sm text-stone-500">
                {completedCount}/{store.rooms.length} completadas
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-[var(--color-dungeon-border)] overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full transition-all duration-500"
                style={{
                  width: `${(completedCount / Math.max(store.rooms.length, 1)) * 100}%`,
                }}
              />
            </div>

            {/* Roll all encounters button */}
            {setupPhase === 'rooms_generated' && !allEncountersResolved && (
              <Card className="text-center">
                <p className="text-stone-400 text-sm mb-3">
                  El sistema tirara 1d20 automaticamente por cada sala para determinar los
                  encuentros.
                </p>
                <Button
                  onClick={handleRollAllEncounters}
                  loading={rollingAllEncounters}
                  size="lg"
                >
                  🎲 Tirar todos los encuentros
                </Button>
              </Card>
            )}

            {/* Rooms list */}
            {store.rooms.map((room, roomIndex) => (
              <RoomCard
                key={room.habitacion.id}
                room={room}
                roomIndex={roomIndex}
                isExpanded={expandedRoomIndex === roomIndex}
                onToggle={() =>
                  setExpandedRoomIndex(expandedRoomIndex === roomIndex ? null : roomIndex)
                }
                isPlaying={setupPhase === 'playing'}
                activeParticipants={activeParticipants}
                rewardsLoading={rewardsLoading === roomIndex}
                assigningItems={assigningItems === roomIndex}
                distributingGold={distributingGold === roomIndex}
                completingRoom={completingRoom === roomIndex}
                rewardTiradas={roomRewardTiradas[roomIndex] || []}
                pendingSubtablas={roomPendingSubtablas[roomIndex] || []}
                itemAssignments={roomItemAssignments[roomIndex] || {}}
                goldTotal={roomGoldTotals[roomIndex] || ''}
                goldResults={roomGoldResults[roomIndex] || []}
                onUpdateRewardTirada={(i, field, value) => {
                  setRoomRewardTiradas((prev) => {
                    const tiradas = [...(prev[roomIndex] || [])];
                    tiradas[i] = { ...tiradas[i], [field]: value };
                    return { ...prev, [roomIndex]: tiradas };
                  });
                }}
                onProcessRewards={() => handleProcessRewards(roomIndex)}
                onItemDragStart={(itemIndex) => handleItemDragStart(roomIndex, itemIndex)}
                onConfirmAssignments={() => handleAssignItems(roomIndex)}
                onGoldTotalChange={(val) =>
                  setRoomGoldTotals((prev) => ({ ...prev, [roomIndex]: val }))
                }
                onRollGoldDice={() => handleRollGoldDice(roomIndex)}
                onDistributeGold={() => handleDistributeGold(roomIndex)}
                onCompleteRoom={() => handleCompleteRoom(roomIndex)}
              />
            ))}

            {/* Floor completed */}
            {setupPhase === 'playing' && allRoomsCompleted && (
              <Card className="border-amber-600/50 text-center">
                <p className="text-amber-400 text-lg font-[var(--font-heading)] mb-4">
                  Piso {currentFloorConfig?.piso} Completado!
                </p>
                <div className="flex gap-3 justify-center flex-wrap">
                  {!isLastFloor ? (
                    <Button onClick={handleNextFloor} size="lg">
                      Siguiente Piso →
                    </Button>
                  ) : (
                    <Button onClick={handleCompleteExpedition} size="lg">
                      Finalizar Expedicion
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    onClick={() => navigate(`/expeditions/${id}/summary`)}
                  >
                    Ver Resumen
                  </Button>
                </div>
              </Card>
            )}
          </div>

          {/* ── RIGHT: Participants ── */}
          <div className="space-y-3 lg:sticky lg:top-4">
            <h2 className="text-base font-semibold text-stone-200 font-[var(--font-heading)]">
              Personajes
            </h2>
            {store.participants.length === 0 && (
              <p className="text-stone-600 text-sm">Sin participantes.</p>
            )}
            {store.participants.map((p) => {
              const goldFromRooms = totalGoldByParticipant[p.id] || 0;
              const assignedItems = itemsByParticipant[p.id] || [];
              const isDragOver = dragOverParticipantId === p.id;

              return (
                <div
                  key={p.id}
                  onDragOver={(e) => handleParticipantDragOver(e, p.id)}
                  onDragLeave={handleParticipantDragLeave}
                  onDrop={(e) => handleParticipantDrop(e, p.id)}
                  className={`rounded-lg border p-3 transition-all ${
                    isDragOver
                      ? 'border-amber-400 bg-amber-500/10 ring-1 ring-amber-400/40'
                      : p.activo
                      ? 'border-[var(--color-dungeon-border)] bg-[var(--color-dungeon-surface)]'
                      : 'border-red-800/30 bg-red-900/10 opacity-70'
                  }`}
                >
                  {/* Participant header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs flex-shrink-0 ${
                          p.activo
                            ? 'bg-amber-600/20 border border-amber-600/40 text-amber-400'
                            : 'bg-red-900/30 border border-red-800/40 text-red-400'
                        }`}
                      >
                        {p.nombre_personaje.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p
                          className={`text-sm font-medium truncate ${
                            p.activo ? 'text-stone-200' : 'text-stone-500 line-through'
                          }`}
                        >
                          {p.nombre_personaje}
                        </p>
                        <p className="text-xs text-stone-500 truncate">{p.usuario_nombre}</p>
                      </div>
                    </div>
                    {/* Active toggle */}
                    <button
                      onClick={() =>
                        p.activo
                          ? handleDeactivatePlayer(p.id)
                          : handleReactivatePlayer(p.id)
                      }
                      className={`text-xs px-2 py-0.5 rounded border transition-colors flex-shrink-0 ${
                        p.activo
                          ? 'border-red-700/40 text-red-400 hover:bg-red-900/20'
                          : 'border-emerald-700/40 text-emerald-400 hover:bg-emerald-900/20'
                      }`}
                    >
                      {p.activo ? 'Desactivar' : 'Reactivar'}
                    </button>
                  </div>

                  {/* Gold */}
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-stone-500">Oro esta sesion</span>
                    <span className="text-amber-400 font-mono font-bold">
                      {goldFromRooms}g
                    </span>
                  </div>

                  {/* Assigned items */}
                  {assignedItems.length > 0 && (
                    <div className="space-y-1 mt-2 pt-2 border-t border-[var(--color-dungeon-border)]">
                      <p className="text-[10px] text-stone-500 uppercase tracking-wider">
                        Items asignados
                      </p>
                      {assignedItems.map(({ roomIndex, item }) => (
                        <div
                          key={`${roomIndex}-${item.indice}`}
                          className="flex items-center gap-1.5 text-xs text-emerald-300"
                        >
                          <span className="text-emerald-600">⚔</span>
                          <span className="truncate">
                            {item.item_nombre}
                            {item.modificador_tier > 0 && (
                              <span className="text-amber-400 ml-0.5">
                                +{item.modificador_tier}
                              </span>
                            )}
                          </span>
                          <span className="text-stone-600 ml-auto flex-shrink-0">
                            S{roomIndex + 1}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Drop hint */}
                  {isDragOver && (
                    <div className="mt-2 text-center text-xs text-amber-400 font-medium">
                      Soltar aqui para asignar
                    </div>
                  )}
                </div>
              );
            })}

            {/* Info about drag-and-drop */}
            {setupPhase === 'playing' && store.rooms.some((r) => r.rewardsResolved) && (
              <p className="text-xs text-stone-600 text-center">
                Arrastra los items desde cada sala hacia un personaje para asignarlos.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ROOM CARD
// ═══════════════════════════════════════════════════════════════

interface RoomCardProps {
  room: RoomState;
  roomIndex: number;
  isExpanded: boolean;
  onToggle: () => void;
  isPlaying: boolean;
  activeParticipants: Participacion[];
  rewardsLoading: boolean;
  assigningItems: boolean;
  distributingGold: boolean;
  completingRoom: boolean;
  rewardTiradas: Array<{ d20: string; subtabla: string }>;
  pendingSubtablas: boolean[];
  itemAssignments: Record<number, number>;
  goldTotal: string;
  goldResults: RepartoOro[];
  onUpdateRewardTirada: (i: number, field: 'd20' | 'subtabla', value: string) => void;
  onProcessRewards: () => void;
  onItemDragStart: (itemIndex: number) => void;
  onConfirmAssignments: () => void;
  onGoldTotalChange: (val: string) => void;
  onRollGoldDice: () => void;
  onDistributeGold: () => void;
  onCompleteRoom: () => void;
}

function RoomCard({
  room,
  roomIndex,
  isExpanded,
  onToggle,
  isPlaying,
  activeParticipants,
  rewardsLoading,
  assigningItems,
  distributingGold,
  completingRoom,
  rewardTiradas,
  pendingSubtablas,
  itemAssignments,
  goldTotal,
  goldResults,
  onUpdateRewardTirada,
  onProcessRewards,
  onItemDragStart,
  onConfirmAssignments,
  onGoldTotalChange,
  onRollGoldDice,
  onDistributeGold,
  onCompleteRoom,
}: RoomCardProps) {
  const hab = room.habitacion;
  const borderColor = ROOM_TYPE_COLORS[hab.tipo_nombre] || 'border-stone-500';

  const statusIcon = room.completed
    ? '✅'
    : room.rewardsResolved
    ? '🏆'
    : room.encounterResolved
    ? '⚔️'
    : ROOM_TYPE_ICONS[hab.tipo_nombre] || '🚪';

  const statusText = room.completed
    ? 'Completada'
    : room.goldDistributed
    ? 'Oro repartido'
    : room.itemsAssigned
    ? 'Items asignados'
    : room.rewardsResolved
    ? 'Recompensas procesadas'
    : room.encounterResolved
    ? `${room.encounterResult?.cantidad_total || 0} enemigos`
    : 'Pendiente';

  // All items assigned via DnD?
  const allItemsAssigned =
    room.rewardsResult?.items_pendientes.length === 0 ||
    room.rewardsResult?.items_pendientes.every((item) => itemAssignments[item.indice] != null);

  return (
    <div
      className={`rounded-lg border ${borderColor} overflow-hidden transition-all ${
        room.completed ? 'opacity-60' : ''
      }`}
    >
      {/* Accordion Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 bg-[var(--color-dungeon-surface)] hover:bg-[var(--color-dungeon-surface)]/80 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg w-7 text-center">{statusIcon}</span>
          <div>
            <p className="text-stone-200 text-sm font-medium capitalize">
              Sala {hab.orden} — {hab.tipo_nombre}
            </p>
            <p className="text-xs text-stone-500">{statusText}</p>
          </div>
        </div>
        <span className={`text-stone-400 transition-transform text-xs ${isExpanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {/* Accordion Body */}
      {isExpanded && (
        <div className="border-t border-[var(--color-dungeon-border)] p-4 bg-[var(--color-dungeon)] space-y-4">
          {/* Encounter result */}
          {room.encounterResolved && room.encounterResult && (
            <EncounterDisplay encounter={room.encounterResult} />
          )}

          {/* Rewards section */}
          {isPlaying && room.encounterResolved && !room.completed && (
            <>
              {/* Warning + partial results when some rewards need subtabla */}
              {!room.rewardsResolved && room.rewardsResult && pendingSubtablas.some(Boolean) && (
                <div className="space-y-2">
                  <div className="flex items-start gap-2 p-2.5 rounded bg-amber-900/20 border border-amber-600/40 text-xs text-amber-300">
                    <span className="flex-shrink-0 text-base">⚠️</span>
                    <p>
                      Algunas recompensas necesitan una segunda tirada.
                      Completa los campos <strong>sub:</strong> resaltados y vuelve a procesar.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-stone-500 font-medium uppercase tracking-wider">Resultados parciales</p>
                    {room.rewardsResult.resultados.map((r, i) => (
                      <RewardResultRow key={i} index={i} result={r} />
                    ))}
                  </div>
                </div>
              )}

              {/* Reward rolls (one input per enemy) */}
              {!room.rewardsResolved && room.encounterResult && (
                <RewardRollSection
                  enemyCount={room.encounterResult.cantidad_total}
                  tiradas={rewardTiradas}
                  pendingSubtablas={pendingSubtablas}
                  loading={rewardsLoading}
                  onUpdate={onUpdateRewardTirada}
                  onProcess={onProcessRewards}
                />
              )}

              {/* Reward results */}
              {room.rewardsResolved && room.rewardsResult && (
                <RewardsDisplay
                  results={room.rewardsResult}
                  itemAssignments={itemAssignments}
                  activeParticipants={activeParticipants}
                  onItemDragStart={onItemDragStart}
                />
              )}

              {/* Items confirm button (shown after DnD assignment) */}
              {room.rewardsResolved &&
                room.rewardsResult &&
                !room.itemsAssigned &&
                (room.rewardsResult.items_pendientes.length === 0 || allItemsAssigned) && (
                  <div className="pt-2 border-t border-[var(--color-dungeon-border)]">
                    <Button
                      onClick={onConfirmAssignments}
                      loading={assigningItems}
                      size="sm"
                    >
                      {room.rewardsResult.items_pendientes.length === 0
                        ? 'Continuar al oro →'
                        : 'Confirmar asignaciones →'}
                    </Button>
                  </div>
                )}

              {/* Gold section */}
              {room.itemsAssigned && !room.goldDistributed && room.rewardsResult && (
                <GoldSection
                  oroDados={room.rewardsResult.oro_dados}
                  goldTotal={goldTotal}
                  loading={distributingGold}
                  activeCount={activeParticipants.length}
                  onGoldChange={onGoldTotalChange}
                  onRollDice={onRollGoldDice}
                  onDistribute={onDistributeGold}
                  hasNoGold={room.rewardsResult.oro_dados.length === 0}
                  onSkip={onCompleteRoom}
                />
              )}

              {/* Gold results + complete room */}
              {room.goldDistributed && !room.completed && (
                <div className="space-y-3">
                  {goldResults.length > 0 && (
                    <div className="p-3 rounded bg-[var(--color-dungeon-surface)] border border-[var(--color-dungeon-border)]">
                      <h4 className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">
                        Oro repartido
                      </h4>
                      <div className="space-y-1">
                        {goldResults.map((r) => (
                          <div
                            key={r.participacion_id}
                            className="flex justify-between text-sm"
                          >
                            <span className="text-stone-300">{r.nombre_personaje}</span>
                            <span className="text-amber-400 font-mono">+{r.oro}g</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <Button
                    onClick={onCompleteRoom}
                    loading={completingRoom}
                    className="w-full"
                  >
                    Completar Sala
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Not playing yet */}
          {!isPlaying && room.encounterResolved && (
            <p className="text-stone-500 text-xs text-center">
              Esperando que todos los encuentros sean resueltos...
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════

function EncounterDisplay({ encounter }: { encounter: EncounterResponse }) {
  return (
    <div className="rounded-lg p-3 bg-[var(--color-dungeon-surface)] border border-[var(--color-dungeon-border)]">
      <div className="flex items-center gap-4 mb-2">
        <div className="text-center">
          <span className="text-stone-500 text-xs block">Tirada</span>
          <span className="text-amber-400 font-bold text-xl font-[var(--font-heading)]">
            {encounter.tirada}
          </span>
        </div>
        <div className="h-8 w-px bg-[var(--color-dungeon-border)]" />
        <p className="text-stone-300 text-sm">
          <span className="text-red-400 font-bold text-base">
            {encounter.cantidad_total}
          </span>{' '}
          enemigos:
        </p>
      </div>
      <div className="space-y-1 ml-1">
        {encounter.enemigos.map((e, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="text-red-400 font-mono font-bold w-8">x{e.max_cantidad}</span>
            <span className="text-stone-300">{e.nombre}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const SUBTABLA_HINT: Record<string, string> = {
  armas: 'Tabla de Armas',
  armaduras: 'Tabla de Armaduras',
  objetos_curiosos: 'Objetos Curiosos',
  botin_alternativo: 'Objetos Curiosos',
  items_boss: 'Items de Boss',
  pociones: 'Tabla de Pociones',
  tesoro_menor: 'Tesoro Menor',
  critico: 'Critico',
};

function RewardRollSection({
  enemyCount,
  tiradas,
  pendingSubtablas,
  loading,
  onUpdate,
  onProcess,
}: {
  enemyCount: number;
  tiradas: Array<{ d20: string; subtabla: string }>;
  pendingSubtablas: boolean[];
  loading: boolean;
  onUpdate: (i: number, field: 'd20' | 'subtabla', value: string) => void;
  onProcess: () => void;
}) {
  if (tiradas.length === 0 || tiradas.length !== enemyCount) return null;

  const hasPending = pendingSubtablas.some(Boolean);
  // Missing required subtablas
  const missingRequired = pendingSubtablas.some((needs, i) => needs && !tiradas[i]?.subtabla);

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-stone-400 uppercase tracking-wider">
        Recompensas — {enemyCount} tiradas
      </h3>
      <div className="space-y-1.5">
        {tiradas.map((t, i) => {
          const needsSubtabla = pendingSubtablas[i] === true;
          return (
            <div
              key={i}
              className={`flex items-center gap-2 p-2 rounded border transition-colors ${
                needsSubtabla
                  ? 'border-amber-600/60 bg-amber-900/10'
                  : 'border-[var(--color-dungeon-border)] bg-[var(--color-dungeon-surface)]'
              }`}
            >
              <span className={`text-xs w-16 flex-shrink-0 ${needsSubtabla ? 'text-amber-400' : 'text-stone-500'}`}>
                Enemigo {i + 1}
              </span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-stone-600">d20:</span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={t.d20}
                  onChange={(e) => onUpdate(i, 'd20', e.target.value)}
                  className="w-12 rounded border bg-[var(--color-dungeon)] border-[var(--color-dungeon-border)] px-1.5 py-1 text-center text-sm text-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className={`text-xs font-medium ${needsSubtabla ? 'text-amber-400' : 'text-stone-600'}`}>
                  sub:
                </span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={t.subtabla}
                  onChange={(e) => onUpdate(i, 'subtabla', e.target.value)}
                  placeholder="—"
                  className={`w-12 rounded border px-1.5 py-1 text-center text-sm text-stone-200 focus:outline-none focus:ring-1 ${
                    needsSubtabla
                      ? 'border-amber-600/60 bg-amber-900/10 focus:ring-amber-400/50 ring-1 ring-amber-600/30'
                      : 'border-[var(--color-dungeon-border)] bg-[var(--color-dungeon)] focus:ring-amber-500/50'
                  }`}
                />
              </div>
              {t.d20 && !needsSubtabla && <span className="text-emerald-500 text-xs">✓</span>}
              {needsSubtabla && (
                <span className="text-amber-400 text-xs flex-shrink-0">← requerido</span>
              )}
            </div>
          );
        })}
      </div>
      <Button
        onClick={onProcess}
        loading={loading}
        disabled={tiradas.some((t) => !t.d20) || missingRequired}
        size="sm"
      >
        {hasPending ? 'Re-procesar con subtablas' : 'Procesar Recompensas'}
      </Button>
    </div>
  );
}

function RewardsDisplay({
  results,
  itemAssignments,
  activeParticipants,
  onItemDragStart,
}: {
  results: ProcesarRecompensasResponse;
  itemAssignments: Record<number, number>;
  activeParticipants: Participacion[];
  onItemDragStart: (itemIndex: number) => void;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-stone-400 uppercase tracking-wider">
        Resultados
      </h3>
      {results.resultados.map((r, i) => (
        <RewardResultRow key={i} index={i} result={r} />
      ))}

      {/* Draggable item cards */}
      {results.items_pendientes.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-[var(--color-dungeon-border)]">
          <p className="text-xs text-stone-500">
            Arrastra los items hacia un personaje para asignarlos:
          </p>
          {results.items_pendientes.map((item) => {
            const assignedTo = activeParticipants.find(
              (p) => p.id === itemAssignments[item.indice]
            );
            return (
              <div
                key={item.indice}
                draggable={!assignedTo}
                onDragStart={() => !assignedTo && onItemDragStart(item.indice)}
                className={`flex items-center gap-2 p-2.5 rounded border text-sm select-none transition-all ${
                  assignedTo
                    ? 'border-emerald-700/40 bg-emerald-900/10 cursor-default opacity-70'
                    : 'border-amber-600/40 bg-amber-600/10 cursor-grab active:cursor-grabbing hover:border-amber-500'
                }`}
              >
                <span className="text-lg">⚔️</span>
                <div className="flex-1 min-w-0">
                  <p className="text-stone-200 font-medium truncate">
                    {item.item_nombre}
                    {item.modificador_tier > 0 && (
                      <span className="text-amber-400 ml-1">+{item.modificador_tier}</span>
                    )}
                  </p>
                  <p className="text-xs text-stone-500">{item.subtabla_nombre}</p>
                </div>
                {assignedTo ? (
                  <span className="text-xs text-emerald-400 flex-shrink-0">
                    → {assignedTo.nombre_personaje}
                  </span>
                ) : (
                  <span className="text-xs text-stone-600 flex-shrink-0">Arrastra →</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {results.oro_dados.length > 0 && (
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs text-stone-500">Oro a tirar:</span>
          {results.oro_dados.map((dado, i) => (
            <span
              key={i}
              className="px-2 py-0.5 rounded-full bg-amber-600/20 border border-amber-600/40 text-amber-300 text-xs font-mono"
            >
              {dado}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function RewardResultRow({ index, result }: { index: number; result: RewardResponse }) {
  const isPending = result.requiere_subtabla;
  return (
    <div
      className={`p-2 rounded border text-xs ${
        isPending
          ? 'border-amber-600/30 bg-amber-900/10'
          : 'border-[var(--color-dungeon-border)] bg-[var(--color-dungeon)]'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-stone-600 font-mono w-5">#{index + 1}</span>
        {result.tipo_resultado === 'nada' && (
          <span className="text-stone-500 italic">Nada</span>
        )}
        {result.tipo_resultado === 'oro' && (
          <>
            <span className="text-amber-400 font-medium">Oro</span>
            <span className="text-stone-500">({result.dados_oro})</span>
          </>
        )}
        {result.tipo_resultado === 'subtabla' && !isPending && (
          <>
            <span className="text-emerald-400 font-medium">
              {result.item_con_modificador || result.item_nombre || result.subtabla_nombre}
            </span>
            {result.modificador_tier ? (
              <span className="text-amber-400 font-bold ml-0.5">+{result.modificador_tier}</span>
            ) : null}
          </>
        )}
        {isPending && (
          <span className="text-amber-400 italic">
            ⏳ {SUBTABLA_HINT[result.subtabla_nombre || ''] || result.subtabla_nombre} — necesita subtabla
          </span>
        )}
        <span className="text-stone-700 text-[10px] ml-auto flex-shrink-0">
          {result.tirada_original}+{result.bonus_recompensa}={result.tirada_con_bonus}
        </span>
      </div>
      {result.descripcion && (
        <p className="text-[11px] text-stone-500 mt-1 pl-7 leading-relaxed">
          {result.descripcion}
        </p>
      )}
    </div>
  );
}

function GoldSection({
  oroDados,
  goldTotal,
  loading,
  activeCount,
  onGoldChange,
  onRollDice,
  onDistribute,
  hasNoGold,
  onSkip,
}: {
  oroDados: string[];
  goldTotal: string;
  loading: boolean;
  activeCount: number;
  onGoldChange: (val: string) => void;
  onRollDice: () => void;
  onDistribute: () => void;
  hasNoGold: boolean;
  onSkip: () => void;
}) {
  if (hasNoGold) {
    return (
      <div className="pt-3 border-t border-[var(--color-dungeon-border)]">
        <p className="text-stone-500 text-sm mb-2">Sin oro para repartir.</p>
        <Button onClick={onSkip} size="sm">
          Completar Sala
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-3 border-t border-[var(--color-dungeon-border)]">
      <h4 className="text-xs font-medium text-stone-400 uppercase tracking-wider">
        Repartir Oro
      </h4>
      <div className="flex items-center gap-2 flex-wrap">
        {oroDados.map((dado, i) => (
          <span
            key={i}
            className="px-2 py-0.5 rounded-full bg-amber-600/20 border border-amber-600/40 text-amber-300 text-sm font-mono"
          >
            {dado}
          </span>
        ))}
        <Button variant="ghost" size="sm" onClick={onRollDice}>
          🎲 Tirar
        </Button>
      </div>
      <div className="flex items-end gap-2">
        <div className="w-28">
          <Input
            label="Total oro"
            type="number"
            min="0"
            value={goldTotal}
            onChange={(e) => onGoldChange(e.target.value)}
            placeholder="Ej: 14"
          />
        </div>
        <Button onClick={onDistribute} loading={loading} disabled={!goldTotal} size="sm">
          Repartir entre {activeCount}
        </Button>
      </div>
    </div>
  );
}
