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
import { rollDice } from '../lib/dice';
import { ROOM_TYPE_ICONS, ROOM_TYPE_COLORS, TIER_LABELS } from '../config/constants';
import type { Piso, Item } from '../types/config';
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
  // Manual d20 input per room for encounter resolution
  const [encounterTiradas, setEncounterTiradas] = useState<Record<number, string>>({});

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

  // Config items for precio_base lookup
  const [configItems, setConfigItems] = useState<Item[]>([]);
  // Items marked for sale (per room, list of item.indice values)
  const [roomItemsForSale, setRoomItemsForSale] = useState<Record<number, number[]>>({});
  // Incremented after each key action to trigger a backend snapshot save
  const [saveCounter, setSaveCounter] = useState(0);

  // Loading states
  const [rewardsLoading, setRewardsLoading] = useState<number | null>(null);
  const [assigningItems, setAssigningItems] = useState<number | null>(null);
  const [distributingGold, setDistributingGold] = useState<number | null>(null);
  const [completingRoom, setCompletingRoom] = useState<number | null>(null);

  // Drag and drop state
  const draggingItem = useRef<{ roomIndex: number; itemIndex: number } | null>(null);
  const [dragOverParticipantId, setDragOverParticipantId] = useState<number | null>(null);
  const [dragOverSellZone, setDragOverSellZone] = useState(false);

  const selectedPisosFromUrl =
    searchParams.get('pisos')?.split(',').map(Number).filter(Boolean) || [];

  useEffect(() => {
    if (!id) return;
    const expedId = parseInt(id);

    Promise.all([
      expeditionService.getById(expedId),
      expeditionService.getParticipaciones(expedId),
      configService.getPisos(),
      configService.getItems(),
    ])
      .then(async ([exp, parts, pisosData, itemsData]) => {
        store.setActiveExpedition(exp);
        store.setParticipants(parts);
        setPisos(pisosData);
        setConfigItems(itemsData);

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

        // Restore gameplay state from backend snapshot
        if (exp.tiene_snapshot) {
          try {
            const snapshot = await expeditionService.getSnapshot(expedId);
            if (snapshot && typeof snapshot === 'object') {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const s = snapshot as any;
              if (s.rooms?.length > 0) {
                store.setRooms(s.rooms);
                store.setCurrentFloorIndex(s.currentFloorIndex || 0);
                setSetupPhase(s.setupPhase || 'configure_floor');
                setEncounterTiradas(s.encounterTiradas || {});
                setRoomRewardTiradas(s.roomRewardTiradas || {});
                setRoomPendingSubtablas(s.roomPendingSubtablas || {});
                setRoomItemAssignments(s.roomItemAssignments || {});
                setRoomItemsForSale(s.roomItemsForSale || {});
                setRoomGoldTotals(s.roomGoldTotals || {});
                setRoomGoldResults(s.roomGoldResults || {});
              }
            }
          } catch {
            // Ignore snapshot restore failures — start fresh
          }
        }
      })
      .catch(() => addToast('Error al cargar la expedicion', 'error'))
      .finally(() => setLoading(false));

    return () => store.reset();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save snapshot to backend after each key action (saveCounter is incremented by handlers)
  useEffect(() => {
    if (saveCounter === 0 || !id) return;
    const snapshot = {
      setupPhase,
      currentFloorIndex: store.currentFloorIndex,
      rooms: store.rooms,
      encounterTiradas,
      roomRewardTiradas,
      roomPendingSubtablas,
      roomItemAssignments,
      roomItemsForSale,
      roomGoldTotals,
      roomGoldResults,
    };
    expeditionService.saveSnapshot(parseInt(id), snapshot).catch(() => {
      // Silent fail — don't block the DM if snapshot save fails
    });
  }, [saveCounter]); // eslint-disable-line react-hooks/exhaustive-deps

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
        // find by indice (NOT array position — items_pendientes is a subset of tiradas)
        const item = room.rewardsResult!.items_pendientes.find((it) => it.indice === itemIndex);
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
      // Initialize one empty input per room for manual encounter d20 entry
      const initTiradas: Record<number, string> = {};
      rooms.forEach((_, i) => { initTiradas[i] = ''; });
      setEncounterTiradas(initTiradas);
      setSetupPhase('rooms_generated');
      setSaveCounter((c) => c + 1);
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

  // Resolve all encounters using manually entered d20 values
  const handleRollAllEncounters = useCallback(async () => {
    // Validate all inputs
    for (let i = 0; i < store.rooms.length; i++) {
      const val = parseInt(encounterTiradas[i] || '');
      if (isNaN(val) || val < 1) {
        addToast('Todas las tiradas deben ser entre 1 y 20', 'error');
        return;
      }
    }
    setRollingAllEncounters(true);
    try {
      for (let i = 0; i < store.rooms.length; i++) {
        const room = store.rooms[i];
        if (room.encounterResolved) continue;
        const tiradaBase = parseInt(encounterTiradas[i]);
        const bonus = currentPiso?.bonus_recompensa ?? 0;
        const tirada = Math.min(tiradaBase + bonus, 20);
        const result = await gameplayService.resolverEncuentroHabitacion(
          currentFloorConfig!.piso,
          room.habitacion.tipo_habitacion_id,
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
      setSaveCounter((c) => c + 1);
      addToast('Todos los encuentros resueltos', 'success');
    } catch {
      addToast('Error al resolver encuentros', 'error');
    } finally {
      setRollingAllEncounters(false);
    }
  }, [store, encounterTiradas, currentPiso, addToast]);

  const handleProcessRewards = useCallback(
    async (roomIndex: number) => {
      const room = store.rooms[roomIndex];
      if (!room || !room.encounterResult || !currentFloorConfig) return;

      const bonus = currentPiso?.bonus_recompensa ?? 0;
      const allTiradas = (roomRewardTiradas[roomIndex] || []).map((t) => ({
        tirada_d20: Math.min((parseInt(t.d20) || 0) + bonus, 20),
        tirada_subtabla: t.subtabla ? parseInt(t.subtabla) : undefined,
      }));

      if (allTiradas.some((t) => t.tirada_d20 < 1)) {
        addToast('Todas las tiradas d20 deben ser entre 1 y 20', 'error');
        return;
      }

      const pendingFlags = roomPendingSubtablas[roomIndex] || [];
      const isReprocess = pendingFlags.some(Boolean);

      // On reprocess, only send the pending subtabla tiradas to avoid re-hitting resolved ones
      const globalIndices = allTiradas
        .map((_, i) => i)
        .filter((i) => !isReprocess || pendingFlags[i]);
      const tiradas = globalIndices.map((i) => allTiradas[i]);

      setRewardsLoading(roomIndex);
      try {
        const result = await gameplayService.procesarRecompensas({
          historial_habitacion_id: room.habitacion.id,
          piso: currentFloorConfig.piso,
          tipo_habitacion_id: room.habitacion.tipo_habitacion_id,
          tiradas,
        });

        if (isReprocess && room.rewardsResult) {
          // Merge new results back into existing resultados at the correct global positions
          const mergedResultados = [...room.rewardsResult.resultados];
          result.resultados.forEach((r, j) => {
            mergedResultados[globalIndices[j]] = r;
          });

          // Fix item indices to global positions, then merge with existing non-pending items
          const fixedItems = result.items_pendientes.map((item) => ({
            ...item,
            indice: globalIndices[item.indice],
          }));
          const existingItems = room.rewardsResult.items_pendientes.filter(
            (item) => !pendingFlags[item.indice]
          );

          const mergedResult = {
            ...room.rewardsResult,
            resultados: mergedResultados,
            items_pendientes: [...existingItems, ...fixedItems],
            oro_dados: [...room.rewardsResult.oro_dados, ...result.oro_dados],
          };

          const newPendingList = mergedResultados.map((r) => r.requiere_subtabla);
          const hasPending = newPendingList.some(Boolean);
          store.updateRoom(roomIndex, {
            rewardsResult: mergedResult,
            rewardsResolved: !hasPending,
          });
          setRoomPendingSubtablas((prev) => ({ ...prev, [roomIndex]: newPendingList }));
          setSaveCounter((c) => c + 1);
          if (hasPending) {
            addToast(
              'Algunas recompensas necesitan una segunda tirada — completa los campos resaltados y re-procesa',
              'error'
            );
          }
        } else {
          const pendingList = result.resultados.map((r) => r.requiere_subtabla);
          const hasPending = pendingList.some(Boolean);
          store.updateRoom(roomIndex, {
            rewardsResult: result,
            rewardsResolved: !hasPending,
          });
          setRoomPendingSubtablas((prev) => ({ ...prev, [roomIndex]: pendingList }));
          setSaveCounter((c) => c + 1);
          if (hasPending) {
            addToast(
              'Algunas recompensas necesitan una segunda tirada — completa los campos resaltados y re-procesa',
              'error'
            );
          }
        }
      } catch {
        addToast('Error al procesar recompensas', 'error');
      } finally {
        setRewardsLoading(null);
      }
    },
    [store, roomRewardTiradas, roomPendingSubtablas, addToast, currentFloorConfig]
  );

  const handleUnassignItem = useCallback((roomIndex: number, itemIndice: number) => {
    setRoomItemAssignments((prev) => {
      const current = { ...(prev[roomIndex] || {}) };
      delete current[itemIndice];
      return { ...prev, [roomIndex]: current };
    });
  }, []);

  const handleMarkItemForSale = useCallback((roomIndex: number, itemIndice: number) => {
    setRoomItemsForSale((prev) => {
      const current = prev[roomIndex] || [];
      const isForSale = current.includes(itemIndice);
      const updated = isForSale
        ? current.filter((i) => i !== itemIndice)
        : [...current, itemIndice];
      return { ...prev, [roomIndex]: updated };
    });
    // Un-assign from any participant if marking for sale
    setRoomItemAssignments((prev) => {
      const current = prev[roomIndex] || {};
      if (current[itemIndice] != null) {
        const updated = { ...current };
        delete updated[itemIndice];
        return { ...prev, [roomIndex]: updated };
      }
      return prev;
    });
  }, []);

  const handleAssignItems = useCallback(
    async (roomIndex: number) => {
      const room = store.rooms[roomIndex];
      if (!room?.rewardsResult) return;

      const assignments = roomItemAssignments[roomIndex] || {};
      const forSale = roomItemsForSale[roomIndex] || [];
      setAssigningItems(roomIndex);
      try {
        for (const item of room.rewardsResult.items_pendientes) {
          if (forSale.includes(item.indice)) continue; // skip — marked for sale
          const participacionId = assignments[item.indice];
          if (!participacionId) {
            addToast(`Asigna "${item.item_nombre}" a un jugador o marca para vender`, 'error');
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

        // Add sale items' precio_base to the gold total
        if (forSale.length > 0) {
          const fixedSaleTotal = forSale.reduce((sum, indice) => {
            const item = room.rewardsResult!.items_pendientes.find((it) => it.indice === indice);
            const ci = configItems.find((c) => c.id === item?.item_id);
            return sum + (ci?.precio_base ?? 0);
          }, 0);
          if (fixedSaleTotal > 0) {
            setRoomGoldTotals((prev) => {
              const existing = parseInt(prev[roomIndex] || '0') || 0;
              return { ...prev, [roomIndex]: String(existing + fixedSaleTotal) };
            });
          }
        }

        store.updateRoom(roomIndex, { itemsAssigned: true });
        setSaveCounter((c) => c + 1);
        addToast('Items asignados', 'success');
      } catch {
        addToast('Error al asignar items', 'error');
      } finally {
        setAssigningItems(null);
      }
    },
    [store, roomItemAssignments, roomItemsForSale, configItems, addToast]
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
        setSaveCounter((c) => c + 1);
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
        setSaveCounter((c) => c + 1);
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
    setEncounterTiradas({});
    setRoomRewardTiradas({});
    setRoomItemAssignments({});
    setRoomItemsForSale({});
    setRoomGoldTotals({});
    setRoomGoldResults({});
    setExpandedRoomIndex(null);
    store.nextFloor();
    setSaveCounter((c) => c + 1);
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
    const forSale = roomItemsForSale[roomIndex] || [];
    const saleDados = forSale
      .map((indice) => {
        const item = room.rewardsResult!.items_pendientes.find((it) => it.indice === indice);
        const ci = configItems.find((c) => c.id === item?.item_id);
        // Only add dados_precio when there's no fixed precio_base (would already be counted)
        return ci?.dados_precio != null && ci.precio_base == null ? ci.dados_precio : null;
      })
      .filter((d): d is string => d !== null);
    let total = 0;
    for (const dado of [...room.rewardsResult.oro_dados, ...saleDados]) {
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
      // Un-mark as for sale if it was
      setRoomItemsForSale((prev) => {
        const current = prev[roomIndex] || [];
        if (!current.includes(itemIndex)) return prev;
        return { ...prev, [roomIndex]: current.filter((i) => i !== itemIndex) };
      });
      draggingItem.current = null;
    }
  };

  if (loading) return <Spinner className="py-12" />;
  if (!store.activeExpedition) {
    return <p className="text-stone-500">Expedicion no encontrada</p>;
  }

  // Items marked for sale across all rooms (for sell zone display)
  const allItemsForSale = Object.entries(roomItemsForSale).flatMap(([roomIndexStr, indices]) => {
    const roomIndex = parseInt(roomIndexStr);
    const room = store.rooms[roomIndex];
    return indices.map((indice) => {
      const item = room?.rewardsResult?.items_pendientes.find((it) => it.indice === indice);
      return item?.item_nombre ?? 'Item';
    });
  });

  return (
    <div className="space-y-3">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-base font-bold text-stone-100 font-[var(--font-heading)] leading-tight">
            Exp #{store.activeExpedition.id}
            {currentFloorConfig && (
              <span className="text-stone-500 font-normal ml-2 text-sm">
                · Piso {currentFloorConfig.piso}
                {store.floorConfigs.length > 1 &&
                  ` (${store.currentFloorIndex + 1}/${store.floorConfigs.length})`}
                {store.rooms.length > 0 && ` · ${completedCount}/${store.rooms.length}`}
              </span>
            )}
          </h1>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Badge estado="en_curso" label="En Curso" />
          <Button size="sm" variant="secondary" onClick={() => navigate(`/expeditions/${id}/summary`)}>
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
              className={`h-1 flex-1 rounded-full transition-colors ${
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
        <Card className="max-w-sm">
          <h2 className="text-sm font-semibold text-stone-200 mb-3 font-[var(--font-heading)]">
            Piso {currentFloorConfig.piso}
            {currentPiso && (
              <span className="text-stone-500 font-normal ml-2">
                · Tier {currentPiso.tier_numero} · Bonus +{currentPiso.bonus_recompensa}
              </span>
            )}
          </h2>
          <div className="space-y-3">
            <div className="flex gap-5">
              <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeBonus}
                  onChange={(e) => setIncludeBonus(e.target.checked)}
                  className="rounded border-stone-600 bg-stone-800 text-amber-500 focus:ring-amber-500 w-4 h-4"
                />
                Bonus ✨
              </label>
              <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeEvento}
                  onChange={(e) => setIncludeEvento(e.target.checked)}
                  className="rounded border-stone-600 bg-stone-800 text-amber-500 focus:ring-amber-500 w-4 h-4"
                />
                Evento ⚡
              </label>
            </div>
            <p className="text-xs text-stone-600">+ 1 sala de jefe siempre incluida</p>
            <Button onClick={handleGenerateFloor} loading={generatingFloor}>
              Generar Salas
            </Button>
          </div>
        </Card>
      )}

      {/* ═══ TWO-COLUMN: sidebar fijo + salas scrollables ═══ */}
      {setupPhase !== 'configure_floor' && store.rooms.length > 0 && (
        <div className="flex gap-3 items-start">

          {/* ── SIDEBAR: registro + zona de venta (sticky) ── */}
          <div className="w-52 flex-shrink-0 sticky top-4 max-h-[calc(100vh-5rem)] overflow-y-auto space-y-2">
            <p className="text-[10px] font-semibold text-stone-600 uppercase tracking-widest px-1">
              Registro
            </p>

            {store.participants.length === 0 && (
              <p className="text-stone-600 text-xs px-1">Sin participantes.</p>
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
                  className={`rounded-lg border p-2.5 transition-all ${
                    isDragOver
                      ? 'border-amber-400 bg-amber-500/10 ring-1 ring-amber-400/40'
                      : p.activo
                      ? 'border-[var(--color-dungeon-border)] bg-[var(--color-dungeon-surface)]'
                      : 'border-red-800/30 bg-red-900/10 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className={`text-sm font-semibold leading-tight truncate ${p.activo ? 'text-stone-100' : 'text-stone-500 line-through'}`}>
                        {p.nombre_personaje}
                      </p>
                      <p className="text-[11px] text-stone-500 truncate">{p.usuario_nombre}</p>
                      {assignedItems.length > 0 && (
                        <p className="text-[11px] text-emerald-400 leading-relaxed break-words pt-0.5">
                          {assignedItems.map(({ roomIndex, item }) => {
                            const resultado = store.rooms[roomIndex]?.rewardsResult?.resultados[item.indice];
                            return resultado?.item_con_modificador ||
                              (item.modificador_tier > 0
                                ? `${item.item_nombre} +${item.modificador_tier}`
                                : item.item_nombre);
                          }).join(', ')}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-amber-400 font-mono font-bold text-sm">
                        {goldFromRooms}g
                      </span>
                      <button
                        onClick={() =>
                          p.activo ? handleDeactivatePlayer(p.id) : handleReactivatePlayer(p.id)
                        }
                        className={`text-[9px] px-1 py-0.5 rounded border transition-colors ${
                          p.activo
                            ? 'border-red-700/40 text-red-400 hover:bg-red-900/20'
                            : 'border-emerald-700/40 text-emerald-400 hover:bg-emerald-900/20'
                        }`}
                      >
                        {p.activo ? '✕' : '↩'}
                      </button>
                    </div>
                  </div>
                  {isDragOver && (
                    <p className="text-center text-[11px] text-amber-400 font-medium mt-1.5 pt-1.5 border-t border-amber-500/20">
                      Soltar aqui
                    </p>
                  )}
                </div>
              );
            })}

            {/* Zona de venta */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOverSellZone(true); }}
              onDragLeave={() => setDragOverSellZone(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverSellZone(false);
                if (draggingItem.current) {
                  const { roomIndex, itemIndex } = draggingItem.current;
                  handleMarkItemForSale(roomIndex, itemIndex);
                  draggingItem.current = null;
                }
              }}
              className={`rounded-lg border-2 border-dashed p-2.5 transition-all ${
                dragOverSellZone
                  ? 'border-amber-400 bg-amber-500/10'
                  : 'border-stone-700 bg-[var(--color-dungeon-surface)]/30'
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="text-lg flex-shrink-0 leading-none">💰</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-stone-400 font-medium leading-tight">Vender</p>
                  {allItemsForSale.length > 0 ? (
                    <p className="text-[11px] text-amber-300 mt-0.5 leading-relaxed break-words">
                      {allItemsForSale.join(', ')}
                    </p>
                  ) : (
                    <p className="text-[11px] text-stone-600 mt-0.5">
                      Arrastra items aqui
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── MAIN: encuentros + salas ── */}
          <div className="flex-1 min-w-0 space-y-3">

            {/* Tiradas d20 encuentros */}
            {setupPhase === 'rooms_generated' && !allEncountersResolved && (
              <Card>
                <h3 className="text-sm font-semibold text-stone-200 mb-3 font-[var(--font-heading)]">
                  Tiradas d20 — encuentros
                </h3>
                <div className="space-y-2 mb-3">
                  {store.rooms.map((room, i) => (
                    <div key={room.habitacion.id} className="flex items-center gap-3">
                      <span className="text-base w-6 text-center flex-shrink-0">
                        {ROOM_TYPE_ICONS[room.habitacion.tipo_nombre] || '🚪'}
                      </span>
                      <span className="text-stone-400 text-sm flex-1 capitalize">
                        Sala {room.habitacion.orden} — {room.habitacion.tipo_nombre}
                      </span>
                      <select
                        value={encounterTiradas[i] ?? ''}
                        onChange={(e) =>
                          setEncounterTiradas((prev) => ({ ...prev, [i]: e.target.value }))
                        }
                        className="w-16 rounded border bg-[var(--color-dungeon)] border-[var(--color-dungeon-border)] px-1 py-1 text-center text-sm text-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                      >
                        <option value="" disabled>—</option>
                        {Array.from({ length: 20 }, (_, n) => n + 1).map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <Button
                  onClick={handleRollAllEncounters}
                  loading={rollingAllEncounters}
                  disabled={store.rooms.some((_, i) => !encounterTiradas[i])}
                >
                  Resolver encuentros →
                </Button>
              </Card>
            )}

            {/* Salas */}
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <p className="text-[10px] font-semibold text-stone-600 uppercase tracking-widest">
                  Salas — Piso {currentFloorConfig?.piso}
                </p>
                <span className="text-xs text-stone-600">
                  {completedCount}/{store.rooms.length}
                </span>
              </div>
              <div className="h-1 rounded-full bg-[var(--color-dungeon-border)] overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-500"
                  style={{ width: `${(completedCount / Math.max(store.rooms.length, 1)) * 100}%` }}
                />
              </div>
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
                  itemsForSale={roomItemsForSale[roomIndex] || []}
                  goldTotal={roomGoldTotals[roomIndex] || ''}
                  goldResults={roomGoldResults[roomIndex] || []}
                  configItems={configItems}
                  onUpdateRewardTirada={(i, field, value) => {
                    setRoomRewardTiradas((prev) => {
                      const tiradas = [...(prev[roomIndex] || [])];
                      tiradas[i] = { ...tiradas[i], [field]: value };
                      return { ...prev, [roomIndex]: tiradas };
                    });
                  }}
                  onProcessRewards={() => handleProcessRewards(roomIndex)}
                  onItemDragStart={(itemIndex) => handleItemDragStart(roomIndex, itemIndex)}
                  onUnassignItem={(itemIndex) => handleUnassignItem(roomIndex, itemIndex)}
                  onMarkItemForSale={(itemIndex) => handleMarkItemForSale(roomIndex, itemIndex)}
                  onConfirmAssignments={() => handleAssignItems(roomIndex)}
                  onGoldTotalChange={(val) =>
                    setRoomGoldTotals((prev) => ({ ...prev, [roomIndex]: val }))
                  }
                  onRollGoldDice={() => handleRollGoldDice(roomIndex)}
                  onDistributeGold={() => handleDistributeGold(roomIndex)}
                  onCompleteRoom={() => handleCompleteRoom(roomIndex)}
                />
              ))}
            </div>

            {/* Piso completado */}
            {setupPhase === 'playing' && allRoomsCompleted && (
              <div className="rounded-lg border border-amber-600/40 p-4 text-center space-y-3">
                <p className="text-amber-400 font-[var(--font-heading)] text-sm">
                  ✓ Piso {currentFloorConfig?.piso} completado
                </p>
                <div className="flex gap-2 justify-center flex-wrap">
                  {!isLastFloor ? (
                    <Button onClick={handleNextFloor}>Siguiente Piso →</Button>
                  ) : (
                    <Button onClick={handleCompleteExpedition}>Finalizar Expedicion</Button>
                  )}
                  <Button variant="secondary" onClick={() => navigate(`/expeditions/${id}/summary`)}>
                    Ver Resumen
                  </Button>
                </div>
              </div>
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
  itemsForSale: number[];
  goldTotal: string;
  goldResults: RepartoOro[];
  configItems: Item[];
  onUpdateRewardTirada: (i: number, field: 'd20' | 'subtabla', value: string) => void;
  onProcessRewards: () => void;
  onItemDragStart: (itemIndex: number) => void;
  onUnassignItem: (itemIndex: number) => void;
  onMarkItemForSale: (itemIndex: number) => void;
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
  itemsForSale,
  goldTotal,
  goldResults,
  configItems,
  onUpdateRewardTirada,
  onProcessRewards,
  onItemDragStart,
  onUnassignItem,
  onMarkItemForSale,
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

  // Sum of precio_base for items marked for sale (pre-filled into gold total)
  const saleGoldValue = itemsForSale.reduce((sum, indice) => {
    const item = room.rewardsResult?.items_pendientes.find((it) => it.indice === indice);
    const ci = configItems.find((c) => c.id === item?.item_id);
    return sum + (ci?.precio_base ?? 0);
  }, 0);

  // Dice expressions (dados_precio) from sold items that have no fixed price
  const saleDados = itemsForSale
    .map((indice) => {
      const item = room.rewardsResult?.items_pendientes.find((it) => it.indice === indice);
      const ci = configItems.find((c) => c.id === item?.item_id);
      return ci?.dados_precio != null && ci.precio_base == null ? ci.dados_precio : null;
    })
    .filter((d): d is string => d !== null);

  // All items assigned via DnD or marked for sale?
  const allItemsAssigned =
    room.rewardsResult?.items_pendientes.length === 0 ||
    room.rewardsResult?.items_pendientes.every(
      (item) => itemAssignments[item.indice] != null || itemsForSale.includes(item.indice)
    );

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
                  itemsForSale={itemsForSale}
                  activeParticipants={activeParticipants}
                  configItems={configItems}
                  onItemDragStart={onItemDragStart}
                  onUnassignItem={onUnassignItem}
                  onMarkItemForSale={onMarkItemForSale}
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
                  oroDados={[...room.rewardsResult.oro_dados, ...saleDados]}
                  goldTotal={goldTotal}
                  loading={distributingGold}
                  activeCount={activeParticipants.length}
                  saleGoldValue={saleGoldValue}
                  onGoldChange={onGoldTotalChange}
                  onRollDice={onRollGoldDice}
                  onDistribute={onDistributeGold}
                  hasNoGold={room.rewardsResult.oro_dados.length === 0 && saleGoldValue === 0 && saleDados.length === 0}
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
                <select
                  value={t.d20}
                  onChange={(e) => onUpdate(i, 'd20', e.target.value)}
                  className="w-14 rounded border bg-[var(--color-dungeon)] border-[var(--color-dungeon-border)] px-1 py-1 text-center text-sm text-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                >
                  <option value="" disabled>—</option>
                  {Array.from({ length: 20 }, (_, n) => n + 1).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
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
  itemsForSale,
  activeParticipants,
  configItems,
  onItemDragStart,
  onUnassignItem,
  onMarkItemForSale,
}: {
  results: ProcesarRecompensasResponse;
  itemAssignments: Record<number, number>;
  itemsForSale: number[];
  activeParticipants: Participacion[];
  configItems: Item[];
  onItemDragStart: (itemIndex: number) => void;
  onUnassignItem: (itemIndex: number) => void;
  onMarkItemForSale: (itemIndex: number) => void;
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
            Arrastra los items hacia un personaje para asignarlos, o marca como "Vender":
          </p>
          {results.items_pendientes.map((item) => {
            const assignedTo = activeParticipants.find(
              (p) => p.id === itemAssignments[item.indice]
            );
            const isForSale = itemsForSale.includes(item.indice);
            const isResolved = assignedTo != null || isForSale;
            // Look up the full resultado to get descripcion and formatted name
            const resultado = results.resultados[item.indice];
            const displayName =
              resultado?.item_con_modificador ||
              (item.modificador_tier > 0
                ? `${item.item_nombre} +${item.modificador_tier}`
                : item.item_nombre);
            const descripcion = resultado?.descripcion;
            // Look up config item for precio_base
            const configItem = configItems.find((ci) => ci.id === item.item_id);
            const precioBase = configItem?.precio_base ?? null;
            const dadosPrecio = configItem?.dados_precio ?? null;

            return (
              <div
                key={item.indice}
                draggable={!isResolved}
                onDragStart={() => !isResolved && onItemDragStart(item.indice)}
                className={`rounded border text-sm select-none transition-all ${
                  isForSale
                    ? 'border-stone-600/40 bg-stone-800/40 cursor-default opacity-80'
                    : assignedTo
                    ? 'border-emerald-700/40 bg-emerald-900/10 cursor-default opacity-70'
                    : 'border-amber-600/40 bg-amber-600/10 cursor-grab active:cursor-grabbing hover:border-amber-500'
                }`}
              >
                <div className="flex items-center gap-2 p-2.5">
                  <span className="text-lg flex-shrink-0">
                    {isForSale ? '💰' : '⚔️'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium truncate ${isForSale ? 'text-stone-400 line-through' : 'text-stone-200'}`}>
                      {displayName}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs text-stone-500 capitalize">{item.subtabla_nombre}</p>
                      {(precioBase != null || dadosPrecio) && (
                        <span className="text-xs text-amber-500/80 font-mono">
                          {precioBase != null ? `${precioBase}g` : dadosPrecio}
                        </span>
                      )}
                    </div>
                  </div>
                  {assignedTo ? (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-xs text-emerald-400">
                        → {assignedTo.nombre_personaje}
                      </span>
                      <button
                        onClick={() => onUnassignItem(item.indice)}
                        title="Deshacer asignación"
                        className="text-stone-600 hover:text-red-400 transition-colors text-sm leading-none"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => onMarkItemForSale(item.indice)}
                      className={`text-xs px-2 py-0.5 rounded border transition-colors flex-shrink-0 ${
                        isForSale
                          ? 'border-amber-500/60 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                          : 'border-stone-600/60 text-stone-500 hover:border-stone-500 hover:text-stone-400'
                      }`}
                    >
                      {isForSale ? '💰 Vender' : 'Vender'}
                    </button>
                  )}
                </div>
                {descripcion && (
                  <p className="text-[11px] text-stone-500 px-3 pb-2 leading-relaxed border-t border-current/10">
                    {descripcion}
                  </p>
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
  saleGoldValue,
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
  saleGoldValue: number;
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

      {/* Sale items gold contribution */}
      {saleGoldValue > 0 && (
        <div className="flex items-center gap-2 text-xs p-2 rounded bg-amber-900/10 border border-amber-700/30">
          <span>💰</span>
          <span className="text-stone-400">Items vendidos:</span>
          <span className="text-amber-400 font-mono font-bold">+{saleGoldValue}g</span>
          <span className="text-stone-600">(ya incluido en el total)</span>
        </div>
      )}

      {oroDados.length > 0 && (
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
      )}

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
