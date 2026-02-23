import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Spinner } from '../components/ui/Spinner';
import { D20Roller } from '../components/dice/D20Roller';
import { expeditionService } from '../services/expedition.service';
import { gameplayService } from '../services/gameplay.service';
import { configService } from '../services/config.service';
import { userService } from '../services/user.service';
import { useExpeditionStore, type RoomState } from '../stores/expedition.store';
import { useToastStore } from '../stores/toast.store';
import { rollDice } from '../lib/dice';
import { ROOM_TYPE_ICONS, ROOM_TYPE_COLORS, TIER_LABELS } from '../config/constants';
import type { Piso } from '../types/config';
import type { User } from '../types/auth';
import type {
  EncounterResponse,
  ProcesarRecompensasResponse,
  ItemPendiente,
  RepartoOro,
  RewardResponse,
} from '../types/gameplay';

type SetupPhase = 'configure_floor' | 'rooms_generated' | 'playing';

export function GameplayPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);

  const store = useExpeditionStore();
  const [loading, setLoading] = useState(true);
  const [pisos, setPisos] = useState<Piso[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Setup phase for current floor
  const [setupPhase, setSetupPhase] = useState<SetupPhase>('configure_floor');
  const [includeBonus, setIncludeBonus] = useState(false);
  const [includeEvento, setIncludeEvento] = useState(false);
  const [generatingFloor, setGeneratingFloor] = useState(false);

  // Per-room state for rewards
  const [roomRewardTiradas, setRoomRewardTiradas] = useState<Record<number, Array<{ d20: string; subtabla: string }>>>({});
  const [roomItemAssignments, setRoomItemAssignments] = useState<Record<number, Record<number, number>>>({});
  const [roomGoldTotals, setRoomGoldTotals] = useState<Record<number, string>>({});
  const [roomGoldResults, setRoomGoldResults] = useState<Record<number, RepartoOro[]>>({});

  // Loading states
  const [encounterLoading, setEncounterLoading] = useState<number | null>(null);
  const [rewardsLoading, setRewardsLoading] = useState<number | null>(null);
  const [assigningItems, setAssigningItems] = useState<number | null>(null);
  const [distributingGold, setDistributingGold] = useState<number | null>(null);
  const [completingRoom, setCompletingRoom] = useState<number | null>(null);

  // Player management
  const [showPlayerPanel, setShowPlayerPanel] = useState(false);
  const [showAddReplacement, setShowAddReplacement] = useState(false);
  const [replacementUserId, setReplacementUserId] = useState('');
  const [replacementCharName, setReplacementCharName] = useState('');
  const [addingReplacement, setAddingReplacement] = useState(false);

  // Parse selected pisos from URL or store
  const selectedPisosFromUrl = searchParams.get('pisos')?.split(',').map(Number).filter(Boolean) || [];

  useEffect(() => {
    if (!id) return;
    const expedId = parseInt(id);

    Promise.all([
      expeditionService.getById(expedId),
      expeditionService.getParticipaciones(expedId),
      configService.getPisos(),
      userService.getAll(),
    ])
      .then(([exp, parts, pisosData, usersData]) => {
        store.setActiveExpedition(exp);
        store.setParticipants(parts);
        setPisos(pisosData);
        setUsers(usersData);

        if (exp.estado !== 'en_curso') {
          navigate(`/expeditions/${id}`);
          return;
        }

        // Set pisos from URL or fallback to current
        const pisosToUse = selectedPisosFromUrl.length > 0
          ? selectedPisosFromUrl
          : [exp.piso_actual];
        store.setSelectedPisos(pisosToUse);
        store.setFloorConfigs(pisosToUse.map((p) => ({
          piso: p,
          numSalas: 4,
          includeBonus: false,
          includeEvento: false,
        })));
      })
      .catch(() => addToast('Error al cargar la expedicion', 'error'))
      .finally(() => setLoading(false));

    return () => store.reset();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentFloorConfig = store.floorConfigs[store.currentFloorIndex];
  const currentPiso = pisos.find((p) => p.numero === currentFloorConfig?.piso);
  const activeParticipants = store.participants.filter((p) => p.activo);
  const allRoomsCompleted = store.rooms.length > 0 && store.rooms.every((r) => r.completed);
  const completedCount = store.rooms.filter((r) => r.completed).length;

  // --- Handlers ---

  const handleGenerateFloor = useCallback(async () => {
    if (!store.activeExpedition || !currentFloorConfig) return;
    setGeneratingFloor(true);
    try {
      // Update piso_actual on backend
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
      addToast(`Piso ${currentFloorConfig.piso} generado: ${layout.total_habitaciones} salas`, 'success');
    } catch {
      addToast('Error al generar el piso', 'error');
    } finally {
      setGeneratingFloor(false);
    }
  }, [store, currentFloorConfig, includeBonus, includeEvento, addToast]);

  const handleEncounterRoll = useCallback(async (roomIndex: number, tirada: number) => {
    const room = store.rooms[roomIndex];
    if (!room) return;
    setEncounterLoading(roomIndex);
    try {
      const result = await gameplayService.resolverEncuentroHabitacion(
        room.habitacion.id,
        tirada
      );
      store.updateRoom(roomIndex, { encounterResult: result, encounterResolved: true });
    } catch {
      addToast('Error al resolver encuentro', 'error');
    } finally {
      setEncounterLoading(null);
    }
  }, [store, addToast]);

  const handleProcessRewards = useCallback(async (roomIndex: number) => {
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
      store.updateRoom(roomIndex, { rewardsResult: result, rewardsResolved: true });
    } catch {
      addToast('Error al procesar recompensas', 'error');
    } finally {
      setRewardsLoading(null);
    }
  }, [store, roomRewardTiradas, addToast]);

  const handleAssignItems = useCallback(async (roomIndex: number) => {
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
          tirada_subtabla: item.tirada_subtabla ?? undefined,
        });
      }
      store.updateRoom(roomIndex, { itemsAssigned: true });
      addToast('Items asignados', 'success');
    } catch {
      addToast('Error al asignar items', 'error');
    } finally {
      setAssigningItems(null);
    }
  }, [store, roomItemAssignments, addToast]);

  const handleDistributeGold = useCallback(async (roomIndex: number) => {
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
  }, [store, roomGoldTotals, addToast]);

  const handleCompleteRoom = useCallback(async (roomIndex: number) => {
    const room = store.rooms[roomIndex];
    if (!room) return;
    setCompletingRoom(roomIndex);
    try {
      await gameplayService.completarHabitacion(room.habitacion.id);
      store.updateRoom(roomIndex, { completed: true });
      store.setExpandedRoom(null);
      addToast('Sala completada!', 'success');
    } catch {
      addToast('Error al completar la sala', 'error');
    } finally {
      setCompletingRoom(null);
    }
  }, [store, addToast]);

  const handleNextFloor = useCallback(() => {
    setSetupPhase('configure_floor');
    setIncludeBonus(false);
    setIncludeEvento(false);
    setRoomRewardTiradas({});
    setRoomItemAssignments({});
    setRoomGoldTotals({});
    setRoomGoldResults({});
    store.nextFloor();
  }, [store]);

  const handleCompleteExpedition = useCallback(async () => {
    if (!store.activeExpedition) return;
    if (!window.confirm('Completar la expedicion? No podras seguir jugando despues de esto.')) return;
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

  const handleDeactivatePlayer = useCallback(async (participacionId: number) => {
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
  }, [store, addToast]);

  const handleReactivatePlayer = useCallback(async (participacionId: number) => {
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
  }, [store, addToast]);

  const handleAddReplacement = useCallback(async () => {
    if (!id || !replacementUserId || !replacementCharName.trim()) return;
    setAddingReplacement(true);
    try {
      const part = await expeditionService.addParticipacion(parseInt(id), {
        usuario_id: replacementUserId,
        nombre_personaje: replacementCharName.trim(),
      });
      store.setParticipants([...store.participants, part]);
      setShowAddReplacement(false);
      setReplacementUserId('');
      setReplacementCharName('');
      addToast('Reemplazo agregado', 'success');
    } catch {
      addToast('Error al agregar reemplazo', 'error');
    } finally {
      setAddingReplacement(false);
    }
  }, [id, replacementUserId, replacementCharName, store, addToast]);

  const initRewardTiradas = (roomIndex: number, count: number) => {
    setRoomRewardTiradas((prev) => ({
      ...prev,
      [roomIndex]: Array.from({ length: count }, () => ({ d20: '', subtabla: '' })),
    }));
  };

  const handleRollGoldDice = (roomIndex: number) => {
    const room = store.rooms[roomIndex];
    if (!room?.rewardsResult) return;
    let total = 0;
    for (const dado of room.rewardsResult.oro_dados) {
      total += rollDice(dado);
    }
    setRoomGoldTotals((prev) => ({ ...prev, [roomIndex]: String(total) }));
  };

  if (loading) return <Spinner className="py-12" />;
  if (!store.activeExpedition) {
    return <p className="text-stone-500">Expedicion no encontrada</p>;
  }

  const availableUsersForReplacement = users.filter(
    (u) => !store.participants.some((p) => p.usuario_id === u.discord_id)
  );

  const isLastFloor = store.currentFloorIndex >= store.floorConfigs.length - 1;

  return (
    <div className="space-y-4 max-w-5xl">
      {/* ═══════════ HEADER ═══════════ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-100 font-[var(--font-heading)]">
            Expedicion #{store.activeExpedition.id}
          </h1>
          <p className="text-sm text-stone-500">
            {currentFloorConfig && (
              <>
                Piso {currentFloorConfig.piso}
                {currentPiso && ` — Tier ${currentPiso.tier_numero} (${TIER_LABELS[currentPiso.tier_numero]}) — Bonus +${currentPiso.bonus_recompensa}`}
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
          <Button size="sm" variant="secondary" onClick={() => setShowPlayerPanel(true)}>
            Jugadores
          </Button>
          <Button size="sm" variant="secondary" onClick={() => navigate(`/expeditions/${id}/summary`)}>
            Resumen
          </Button>
        </div>
      </div>

      {/* ═══════════ PARTICIPANTS BAR ═══════════ */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {store.participants.map((p) => (
          <div
            key={p.id}
            className={`flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs transition-colors ${
              p.activo
                ? 'border-amber-600/40 bg-amber-600/10 text-amber-300'
                : 'border-red-800/40 bg-red-900/10 text-stone-500'
            }`}
          >
            {!p.activo && <span className="text-red-400 text-[10px]">X</span>}
            <span className={!p.activo ? 'line-through' : ''}>{p.nombre_personaje}</span>
            <span className="text-amber-500/70 font-mono">{p.oro_acumulado}g</span>
          </div>
        ))}
      </div>

      {/* ═══════════ FLOOR PROGRESS ═══════════ */}
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

      {/* ═══════════ CONFIGURE FLOOR ═══════════ */}
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
                  <p className="text-stone-200">{currentPiso.tier_numero} ({TIER_LABELS[currentPiso.tier_numero]})</p>
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

      {/* ═══════════ ROOMS GENERATED - ACCORDION VIEW ═══════════ */}
      {(setupPhase === 'rooms_generated' || setupPhase === 'playing') && store.rooms.length > 0 && (
        <div className="space-y-3">
          {/* Progress bar */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-200 font-[var(--font-heading)]">
              Salas del Piso {currentFloorConfig?.piso}
            </h2>
            <span className="text-sm text-stone-500">{completedCount}/{store.rooms.length}</span>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--color-dungeon-border)] overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full transition-all duration-500"
              style={{ width: `${(completedCount / Math.max(store.rooms.length, 1)) * 100}%` }}
            />
          </div>

          {/* Room Accordions */}
          {store.rooms.map((room, roomIndex) => (
            <RoomAccordion
              key={room.habitacion.id}
              room={room}
              roomIndex={roomIndex}
              isExpanded={store.expandedRoomIndex === roomIndex}
              onToggle={() => store.setExpandedRoom(store.expandedRoomIndex === roomIndex ? null : roomIndex)}
              isPlaying={setupPhase === 'playing'}
              participants={activeParticipants}
              encounterLoading={encounterLoading === roomIndex}
              rewardsLoading={rewardsLoading === roomIndex}
              assigningItems={assigningItems === roomIndex}
              distributingGold={distributingGold === roomIndex}
              completingRoom={completingRoom === roomIndex}
              rewardTiradas={roomRewardTiradas[roomIndex] || []}
              itemAssignments={roomItemAssignments[roomIndex] || {}}
              goldTotal={roomGoldTotals[roomIndex] || ''}
              goldResults={roomGoldResults[roomIndex] || []}
              onEncounterRoll={(tirada) => handleEncounterRoll(roomIndex, tirada)}
              onInitRewardTiradas={(count) => initRewardTiradas(roomIndex, count)}
              onUpdateRewardTirada={(i, field, value) => {
                setRoomRewardTiradas((prev) => {
                  const tiradas = [...(prev[roomIndex] || [])];
                  tiradas[i] = { ...tiradas[i], [field]: value };
                  return { ...prev, [roomIndex]: tiradas };
                });
              }}
              onProcessRewards={() => handleProcessRewards(roomIndex)}
              onAssignItem={(itemIndex, partId) => {
                setRoomItemAssignments((prev) => ({
                  ...prev,
                  [roomIndex]: { ...(prev[roomIndex] || {}), [itemIndex]: partId },
                }));
              }}
              onConfirmAssignments={() => handleAssignItems(roomIndex)}
              onGoldTotalChange={(val) => setRoomGoldTotals((prev) => ({ ...prev, [roomIndex]: val }))}
              onRollGoldDice={() => handleRollGoldDice(roomIndex)}
              onDistributeGold={() => handleDistributeGold(roomIndex)}
              onCompleteRoom={() => handleCompleteRoom(roomIndex)}
            />
          ))}

          {/* Transition to playing after setup */}
          {setupPhase === 'rooms_generated' && store.rooms.every((r) => r.encounterResolved) && (
            <Card className="border-amber-600/40 text-center">
              <p className="text-amber-400 font-[var(--font-heading)] mb-3">
                Todos los enemigos han sido lanzados
              </p>
              <Button onClick={() => setSetupPhase('playing')} size="lg">
                Comenzar Recompensas
              </Button>
            </Card>
          )}

          {/* All rooms completed */}
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
                <Button variant="secondary" onClick={() => navigate(`/expeditions/${id}/summary`)}>
                  Ver Resumen
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ═══════════ PLAYER MANAGEMENT MODAL ═══════════ */}
      <Modal open={showPlayerPanel} onClose={() => setShowPlayerPanel(false)} title="Gestion de Jugadores">
        <div className="space-y-3">
          {store.participants.map((p) => (
            <div
              key={p.id}
              className={`flex items-center justify-between p-3 rounded border ${
                p.activo
                  ? 'border-[var(--color-dungeon-border)] bg-[var(--color-dungeon)]'
                  : 'border-red-800/30 bg-red-900/10'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                  p.activo
                    ? 'bg-amber-600/20 border border-amber-600/40 text-amber-400'
                    : 'bg-red-900/30 border border-red-800/40 text-red-400'
                }`}>
                  {p.nombre_personaje.charAt(0)}
                </div>
                <div>
                  <p className={`text-sm font-medium ${p.activo ? 'text-stone-200' : 'text-stone-500 line-through'}`}>
                    {p.nombre_personaje}
                  </p>
                  <p className="text-xs text-stone-500">
                    {p.usuario_nombre} — {p.oro_acumulado}g
                    {!p.activo && p.sala_salida && ` — salio en sala ${p.sala_salida}`}
                  </p>
                </div>
              </div>
              {p.activo ? (
                <Button variant="danger" size="sm" onClick={() => handleDeactivatePlayer(p.id)}>
                  Desactivar
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => handleReactivatePlayer(p.id)}>
                  Reactivar
                </Button>
              )}
            </div>
          ))}
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => { setShowPlayerPanel(false); setShowAddReplacement(true); }}
          >
            + Agregar Reemplazo
          </Button>
        </div>
      </Modal>

      {/* ADD REPLACEMENT MODAL */}
      <Modal open={showAddReplacement} onClose={() => setShowAddReplacement(false)} title="Agregar Reemplazo">
        <div className="space-y-4">
          <Select
            label="Jugador"
            placeholder="Seleccionar..."
            value={replacementUserId}
            onChange={(e) => setReplacementUserId(e.target.value)}
            options={availableUsersForReplacement.map((u) => ({ value: u.discord_id, label: u.nombre }))}
          />
          <Input
            label="Nombre del Personaje"
            value={replacementCharName}
            onChange={(e) => setReplacementCharName(e.target.value)}
            placeholder="Ej: Kael el Ranger"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setShowAddReplacement(false)}>Cancelar</Button>
            <Button
              onClick={handleAddReplacement}
              loading={addingReplacement}
              disabled={!replacementUserId || !replacementCharName.trim()}
            >
              Agregar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ═══════════ ROOM ACCORDION ═══════════

interface RoomAccordionProps {
  room: RoomState;
  roomIndex: number;
  isExpanded: boolean;
  onToggle: () => void;
  isPlaying: boolean;
  participants: { id: number; nombre_personaje: string }[];
  encounterLoading: boolean;
  rewardsLoading: boolean;
  assigningItems: boolean;
  distributingGold: boolean;
  completingRoom: boolean;
  rewardTiradas: Array<{ d20: string; subtabla: string }>;
  itemAssignments: Record<number, number>;
  goldTotal: string;
  goldResults: RepartoOro[];
  onEncounterRoll: (tirada: number) => void;
  onInitRewardTiradas: (count: number) => void;
  onUpdateRewardTirada: (i: number, field: 'd20' | 'subtabla', value: string) => void;
  onProcessRewards: () => void;
  onAssignItem: (itemIndex: number, partId: number) => void;
  onConfirmAssignments: () => void;
  onGoldTotalChange: (val: string) => void;
  onRollGoldDice: () => void;
  onDistributeGold: () => void;
  onCompleteRoom: () => void;
}

function RoomAccordion({
  room, roomIndex, isExpanded, onToggle, isPlaying,
  participants, encounterLoading, rewardsLoading, assigningItems,
  distributingGold, completingRoom, rewardTiradas, itemAssignments,
  goldTotal, goldResults,
  onEncounterRoll, onInitRewardTiradas, onUpdateRewardTirada,
  onProcessRewards, onAssignItem, onConfirmAssignments,
  onGoldTotalChange, onRollGoldDice, onDistributeGold, onCompleteRoom,
}: RoomAccordionProps) {
  const hab = room.habitacion;
  const borderColor = ROOM_TYPE_COLORS[hab.tipo_nombre] || 'border-stone-500';

  const statusIcon = room.completed
    ? '✅'
    : room.encounterResolved
    ? (isPlaying && room.rewardsResolved ? '🏆' : '⚔️')
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

  return (
    <div className={`rounded-lg border ${borderColor} overflow-hidden transition-all ${
      room.completed ? 'opacity-60' : ''
    }`}>
      {/* Accordion Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 bg-[var(--color-dungeon-surface)] hover:bg-[var(--color-dungeon-surface)]/80 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl w-8 text-center">{statusIcon}</span>
          <div>
            <p className="text-stone-200 text-sm font-medium capitalize">
              Sala {hab.orden} — {hab.tipo_nombre}
            </p>
            <p className="text-xs text-stone-500">{statusText}</p>
          </div>
        </div>
        <span className={`text-stone-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {/* Accordion Body */}
      {isExpanded && (
        <div className="border-t border-[var(--color-dungeon-border)] p-4 bg-[var(--color-dungeon)] space-y-4">
          {/* === ENCOUNTER SECTION === */}
          {!room.encounterResolved && (
            <div className="text-center space-y-3">
              <p className="text-stone-400 text-sm">Tirada de encuentro (d20)</p>
              {encounterLoading ? (
                <Spinner />
              ) : (
                <D20Roller
                  onRoll={onEncounterRoll}
                  label="Tirada de Encuentro"
                  size="md"
                />
              )}
            </div>
          )}

          {/* === ENCOUNTER RESULT === */}
          {room.encounterResolved && room.encounterResult && (
            <EncounterDisplay encounter={room.encounterResult} />
          )}

          {/* === REWARDS SECTION (only when playing) === */}
          {isPlaying && room.encounterResolved && !room.completed && (
            <>
              {/* Reward rolls */}
              {!room.rewardsResolved && room.encounterResult && (
                <RewardRollSection
                  enemyCount={room.encounterResult.cantidad_total}
                  tiradas={rewardTiradas}
                  loading={rewardsLoading}
                  onInit={() => onInitRewardTiradas(room.encounterResult!.cantidad_total)}
                  onUpdate={onUpdateRewardTirada}
                  onProcess={onProcessRewards}
                />
              )}

              {/* Rewards results with full chain */}
              {room.rewardsResolved && room.rewardsResult && (
                <RewardsDisplay results={room.rewardsResult} />
              )}

              {/* Item assignment */}
              {room.rewardsResolved && room.rewardsResult && !room.itemsAssigned && (
                <ItemAssignmentSection
                  items={room.rewardsResult.items_pendientes}
                  participants={participants}
                  assignments={itemAssignments}
                  loading={assigningItems}
                  onAssign={onAssignItem}
                  onConfirm={onConfirmAssignments}
                  hasNoItems={room.rewardsResult.items_pendientes.length === 0}
                  onSkip={() => onConfirmAssignments()}
                />
              )}

              {/* Gold distribution */}
              {room.itemsAssigned && !room.goldDistributed && room.rewardsResult && (
                <GoldSection
                  oroDados={room.rewardsResult.oro_dados}
                  goldTotal={goldTotal}
                  loading={distributingGold}
                  activeCount={participants.length}
                  onGoldChange={onGoldTotalChange}
                  onRollDice={onRollGoldDice}
                  onDistribute={onDistributeGold}
                  hasNoGold={room.rewardsResult.oro_dados.length === 0}
                  onSkip={onCompleteRoom}
                />
              )}

              {/* Gold results & complete */}
              {room.goldDistributed && !room.completed && (
                <div className="space-y-3">
                  {goldResults.length > 0 && (
                    <div className="p-3 rounded bg-[var(--color-dungeon-surface)] border border-[var(--color-dungeon-border)]">
                      <h4 className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">Oro repartido</h4>
                      <div className="space-y-1">
                        {goldResults.map((r) => (
                          <div key={r.participacion_id} className="flex justify-between text-sm">
                            <span className="text-stone-300">{r.nombre_personaje}</span>
                            <span className="text-amber-400 font-mono">+{r.oro}g</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <Button onClick={onCompleteRoom} loading={completingRoom} className="w-full">
                    Completar Sala
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════ Sub-components ═══════════

function EncounterDisplay({ encounter }: { encounter: EncounterResponse }) {
  return (
    <div className="rounded-lg p-4 bg-[var(--color-dungeon-surface)] border border-[var(--color-dungeon-border)]">
      <div className="flex items-center gap-4 mb-3">
        <div className="text-center">
          <span className="text-stone-500 text-xs block">Tirada</span>
          <span className="text-amber-400 font-bold text-2xl font-[var(--font-heading)]">
            {encounter.tirada}
          </span>
        </div>
        <div className="h-10 w-px bg-[var(--color-dungeon-border)]" />
        <div>
          <p className="text-stone-300 text-sm">
            <span className="text-red-400 font-bold text-lg">{encounter.cantidad_total}</span>{' '}
            enemigos:
          </p>
        </div>
      </div>
      <div className="space-y-1.5 ml-1">
        {encounter.enemigos.map((e, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="text-red-400 font-mono font-bold w-8">x{e.max_cantidad}</span>
            <span className="text-stone-200">{e.nombre}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RewardRollSection({
  enemyCount, tiradas, loading, onInit, onUpdate, onProcess,
}: {
  enemyCount: number;
  tiradas: Array<{ d20: string; subtabla: string }>;
  loading: boolean;
  onInit: () => void;
  onUpdate: (i: number, field: 'd20' | 'subtabla', value: string) => void;
  onProcess: () => void;
}) {
  useEffect(() => {
    if (tiradas.length === 0 && enemyCount > 0) {
      onInit();
    }
  }, [enemyCount]); // eslint-disable-line react-hooks/exhaustive-deps

  if (tiradas.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-stone-300">
        Tiradas de Recompensa ({enemyCount} enemigos)
      </h3>
      <div className="space-y-2">
        {tiradas.map((t, i) => (
          <div key={i} className="flex items-center gap-3 p-2 rounded bg-[var(--color-dungeon-surface)] border border-[var(--color-dungeon-border)]">
            <span className="text-xs text-stone-500 w-20 flex-shrink-0">Enemigo {i + 1}</span>
            <div className="flex items-center gap-1">
              <span className="text-xs text-stone-600">d20:</span>
              <input
                type="number" min="1" max="20" value={t.d20}
                onChange={(e) => onUpdate(i, 'd20', e.target.value)}
                className="w-14 rounded border bg-[var(--color-dungeon)] border-[var(--color-dungeon-border)] px-2 py-1 text-center text-sm text-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-stone-600">sub:</span>
              <input
                type="number" min="1" max="20" value={t.subtabla}
                onChange={(e) => onUpdate(i, 'subtabla', e.target.value)}
                placeholder="—"
                className="w-14 rounded border bg-[var(--color-dungeon)] border-[var(--color-dungeon-border)] px-2 py-1 text-center text-sm text-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
              />
            </div>
            {t.d20 && <span className="text-emerald-500 text-xs">✓</span>}
          </div>
        ))}
      </div>
      <Button
        onClick={onProcess}
        loading={loading}
        disabled={tiradas.some((t) => !t.d20)}
      >
        Procesar Recompensas
      </Button>
    </div>
  );
}

function RewardsDisplay({ results }: { results: ProcesarRecompensasResponse }) {
  return (
    <div className="rounded-lg p-4 bg-[var(--color-dungeon-surface)] border border-[var(--color-dungeon-border)] space-y-2">
      <h3 className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">Resultados</h3>
      {results.resultados.map((r, i) => (
        <RewardResultRow key={i} index={i} result={r} />
      ))}
    </div>
  );
}

function RewardResultRow({ index, result }: { index: number; result: RewardResponse }) {
  return (
    <div className="p-2 rounded bg-[var(--color-dungeon)] border border-[var(--color-dungeon-border)]">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-stone-600 font-mono w-6">#{index + 1}</span>
        {result.tipo_resultado === 'nada' && (
          <span className="text-stone-500 italic">Nada encontrado</span>
        )}
        {result.tipo_resultado === 'oro' && (
          <>
            <span className="text-amber-400 font-medium">Oro</span>
            <span className="text-stone-500">({result.dados_oro})</span>
          </>
        )}
        {result.tipo_resultado === 'subtabla' && (
          <>
            <span className="text-emerald-400 font-medium">
              {result.item_nombre || result.subtabla_nombre}
            </span>
            {result.modificador_tier ? (
              <span className="text-amber-400 font-bold">+{result.modificador_tier}</span>
            ) : null}
          </>
        )}
        <span className="text-stone-700 text-xs ml-auto">
          d20:{result.tirada_original} +{result.bonus_recompensa} = {result.tirada_con_bonus}
        </span>
      </div>
      {/* Full chain description */}
      <p className="text-xs text-stone-500 mt-1 ml-8">{result.descripcion}</p>
    </div>
  );
}

function ItemAssignmentSection({
  items, participants, assignments, loading, onAssign, onConfirm, hasNoItems, onSkip,
}: {
  items: ItemPendiente[];
  participants: { id: number; nombre_personaje: string }[];
  assignments: Record<number, number>;
  loading: boolean;
  onAssign: (itemIndex: number, partId: number) => void;
  onConfirm: () => void;
  hasNoItems: boolean;
  onSkip: () => void;
}) {
  if (hasNoItems) {
    return (
      <div className="pt-3 border-t border-[var(--color-dungeon-border)]">
        <p className="text-stone-500 text-sm mb-3">No hay items para asignar.</p>
        <Button onClick={onSkip} size="sm">Continuar al Oro →</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-3 border-t border-[var(--color-dungeon-border)]">
      <h4 className="text-sm font-medium text-amber-400">
        Items a asignar ({items.length})
      </h4>
      {items.map((item) => (
        <div key={item.indice} className="flex items-center gap-3 p-3 rounded-lg border border-emerald-800/30 bg-emerald-900/10">
          <div className="flex-1 min-w-0">
            <p className="text-stone-200 text-sm font-medium">
              {item.item_nombre}
              {item.modificador_tier > 0 && <span className="text-amber-400 ml-1">+{item.modificador_tier}</span>}
            </p>
            <p className="text-xs text-stone-500 truncate">
              {item.subtabla_nombre} — d20: {item.tirada_d20}
              {item.tirada_subtabla !== null && ` → sub: ${item.tirada_subtabla}`}
            </p>
          </div>
          <select
            value={assignments[item.indice] || ''}
            onChange={(e) => onAssign(item.indice, parseInt(e.target.value))}
            className="rounded border bg-[var(--color-dungeon)] border-[var(--color-dungeon-border)] px-3 py-1.5 text-sm text-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500/50 max-w-[180px]"
          >
            <option value="">Asignar a...</option>
            {participants.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre_personaje}</option>
            ))}
          </select>
        </div>
      ))}
      <Button
        onClick={onConfirm}
        loading={loading}
        disabled={items.some((item) => !assignments[item.indice])}
      >
        Confirmar Asignacion
      </Button>
    </div>
  );
}

function GoldSection({
  oroDados, goldTotal, loading, activeCount, onGoldChange, onRollDice, onDistribute, hasNoGold, onSkip,
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
        <p className="text-stone-500 text-sm mb-3">No hay oro para repartir.</p>
        <Button onClick={onSkip} size="sm">Completar Sala</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-3 border-t border-[var(--color-dungeon-border)]">
      <h4 className="text-sm font-medium text-stone-300">Repartir Oro</h4>
      <div className="p-3 rounded bg-[var(--color-dungeon-surface)] border border-[var(--color-dungeon-border)]">
        <p className="text-stone-400 text-sm mb-2">Dados de oro:</p>
        <div className="flex items-center gap-3 flex-wrap">
          {oroDados.map((dado, i) => (
            <span key={i} className="px-3 py-1 rounded-full bg-amber-600/20 border border-amber-600/40 text-amber-300 text-sm font-mono">
              {dado}
            </span>
          ))}
          <Button variant="ghost" size="sm" onClick={onRollDice}>🎲 Tirar</Button>
        </div>
      </div>
      <div className="flex items-end gap-3">
        <div className="flex-1 max-w-xs">
          <Input
            label="Total de oro"
            type="number"
            min="0"
            value={goldTotal}
            onChange={(e) => onGoldChange(e.target.value)}
            placeholder="Ej: 14"
          />
        </div>
        <Button onClick={onDistribute} loading={loading} disabled={!goldTotal}>
          Repartir entre {activeCount} activos
        </Button>
      </div>
    </div>
  );
}
