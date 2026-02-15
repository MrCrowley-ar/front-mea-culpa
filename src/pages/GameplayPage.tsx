import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
import { useExpeditionStore } from '../stores/expedition.store';
import { useToastStore } from '../stores/toast.store';
import { rollD20, rollDice } from '../lib/dice';
import { ROOM_TYPE_ICONS, ROOM_TYPE_COLORS, TIER_LABELS } from '../config/constants';
import type { Piso } from '../types/config';
import type { User } from '../types/auth';
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
  const [users, setUsers] = useState<User[]>([]);

  // Floor generation
  const [includeBonus, setIncludeBonus] = useState(false);
  const [includeEvento, setIncludeEvento] = useState(false);
  const [generatingFloor, setGeneratingFloor] = useState(false);

  // Encounter
  const [encounterLoading, setEncounterLoading] = useState(false);

  // Rewards
  const [rewardTiradas, setRewardTiradas] = useState<Array<{ d20: string; subtabla: string }>>([]);
  const [rewardsLoading, setRewardsLoading] = useState(false);

  // Item assignment
  const [itemAssignments, setItemAssignments] = useState<Record<number, number>>({});
  const [assigningItems, setAssigningItems] = useState(false);

  // Gold
  const [goldTotal, setGoldTotal] = useState('');
  const [goldRollResult, setGoldRollResult] = useState<number | null>(null);
  const [distributingGold, setDistributingGold] = useState(false);
  const [goldResults, setGoldResults] = useState<RepartoOro[]>([]);

  // Room completion
  const [completingRoom, setCompletingRoom] = useState(false);

  // Floor change
  const [newFloor, setNewFloor] = useState('');
  const [changingFloor, setChangingFloor] = useState(false);

  // Player management
  const [showPlayerPanel, setShowPlayerPanel] = useState(false);
  const [showAddReplacement, setShowAddReplacement] = useState(false);
  const [replacementUserId, setReplacementUserId] = useState('');
  const [replacementCharName, setReplacementCharName] = useState('');
  const [addingReplacement, setAddingReplacement] = useState(false);

  // Step indicator inside encounter phase
  const [encounterStep, setEncounterStep] = useState<'roll' | 'results' | 'rewards'>('roll');

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

        store.setPhase('floor_select');
      })
      .catch(() => addToast('Error al cargar la expedicion', 'error'))
      .finally(() => setLoading(false));

    return () => store.reset();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentHabitacion = store.habitaciones[store.currentHabitacionIndex] || null;
  const currentPiso = pisos.find((p) => p.numero === store.currentFloor);
  const activeParticipants = store.participants.filter((p) => p.activo);
  const completedCount = store.habitaciones.filter((h) => h.completada).length;

  // --- Handlers ---

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
        setEncounterStep('results');
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

  const handleAutoRollAll = useCallback(() => {
    setRewardTiradas((prev) =>
      prev.map((t) => ({
        ...t,
        d20: t.d20 || String(rollD20()),
      }))
    );
  }, []);

  const handleProcessRewards = useCallback(async () => {
    if (!currentHabitacion || !store.encounterResult) return;

    const tiradas = rewardTiradas.map((t) => ({
      tirada_d20: parseInt(t.d20) || 0,
      tirada_subtabla: t.subtabla ? parseInt(t.subtabla) : undefined,
    }));

    if (tiradas.some((t) => t.tirada_d20 < 1 || t.tirada_d20 > 20)) {
      addToast('Todas las tiradas d20 deben ser entre 1 y 20', 'error');
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
          addToast(`Asigna "${item.item_nombre}" a un jugador`, 'error');
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

  const handleRollGoldDice = useCallback(() => {
    if (!store.rewardsResult) return;
    let total = 0;
    for (const dado of store.rewardsResult.oro_dados) {
      total += rollDice(dado);
    }
    setGoldRollResult(total);
    setGoldTotal(String(total));
  }, [store.rewardsResult]);

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
      resetRoomState();

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
  }, [currentHabitacion, store, addToast]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const resetRoomState = () => {
    setRewardTiradas([]);
    setItemAssignments({});
    setGoldTotal('');
    setGoldRollResult(null);
    setGoldResults([]);
    setEncounterStep('roll');
  };

  const enterRoom = (index: number) => {
    store.setCurrentHabitacionIndex(index);
    store.setPhase('encounter');
    store.setEncounterResult(null);
    store.setRewardsResult(null);
    resetRoomState();
  };

  if (loading) return <Spinner className="py-12" />;
  if (!store.activeExpedition) {
    return <p className="text-stone-500">Expedicion no encontrada</p>;
  }

  const availableUsersForReplacement = users.filter(
    (u) => !store.participants.some((p) => p.usuario_id === u.discord_id)
  );

  return (
    <div className="space-y-4 max-w-5xl">
      {/* ═══════════ HEADER ═══════════ */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-stone-100 font-[var(--font-heading)]">
            Expedicion #{store.activeExpedition.id}
          </h1>
          <p className="text-sm text-stone-500">
            Piso {store.activeExpedition.piso_actual}
            {currentPiso &&
              ` — Tier ${currentPiso.tier_numero} (${TIER_LABELS[currentPiso.tier_numero]}) — Bonus +${currentPiso.bonus_recompensa}`}
            {store.habitaciones.length > 0 &&
              ` — ${completedCount}/${store.habitaciones.length} salas`}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge estado="en_curso" label="En Curso" />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowPlayerPanel(true)}
          >
            Jugadores
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => navigate(`/expeditions/${id}/summary`)}
          >
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
            <span className={!p.activo ? 'line-through' : ''}>
              {p.nombre_personaje}
            </span>
            <span className="text-amber-500/70 font-mono">{p.oro_acumulado}g</span>
          </div>
        ))}
      </div>

      {/* ═══════════ PHASE: FLOOR SELECT ═══════════ */}
      {store.phase === 'floor_select' && (
        <Card>
          <h2 className="text-lg font-semibold text-stone-200 mb-4 font-[var(--font-heading)]">
            Generar Piso {store.activeExpedition.piso_actual}
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
                <span>Sala Bonus</span>
                <span className="text-amber-500 text-lg">✨</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-stone-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeEvento}
                  onChange={(e) => setIncludeEvento(e.target.checked)}
                  className="rounded border-stone-600 bg-stone-800 text-amber-500 focus:ring-amber-500 w-4 h-4"
                />
                <span>Sala Evento</span>
                <span className="text-purple-400 text-lg">⚡</span>
              </label>
            </div>
            <p className="text-xs text-stone-600">
              + 1 sala de jefe (siempre incluida)
            </p>
            <Button onClick={handleGenerateFloor} loading={generatingFloor} size="lg">
              Generar Salas
            </Button>
          </div>
        </Card>
      )}

      {/* ═══════════ PHASE: ROOM LIST ═══════════ */}
      {store.phase === 'room_list' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-200 font-[var(--font-heading)]">
              Salas del Piso {store.currentFloor}
            </h2>
            <span className="text-sm text-stone-500">
              {completedCount}/{store.habitaciones.length}
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 rounded-full bg-[var(--color-dungeon-border)] overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full transition-all duration-500"
              style={{
                width: `${(completedCount / Math.max(store.habitaciones.length, 1)) * 100}%`,
              }}
            />
          </div>

          <div className="grid gap-2">
            {store.habitaciones.map((hab, index) => (
              <Card
                key={hab.id}
                hover={!hab.completada}
                onClick={() => !hab.completada && enterRoom(index)}
                className={`flex items-center justify-between border-l-4 ${
                  ROOM_TYPE_COLORS[hab.tipo_nombre] || 'border-stone-500'
                } ${hab.completada ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl w-8 text-center">
                    {hab.completada ? '✅' : ROOM_TYPE_ICONS[hab.tipo_nombre] || '?'}
                  </span>
                  <div>
                    <p className="text-stone-200 text-sm font-medium capitalize">
                      Sala {hab.orden} — {hab.tipo_nombre}
                    </p>
                  </div>
                </div>
                {!hab.completada && (
                  <Button size="sm" variant="ghost" onClick={() => enterRoom(index)}>
                    Entrar →
                  </Button>
                )}
              </Card>
            ))}
          </div>

          {/* All rooms completed */}
          {store.habitaciones.length > 0 && store.habitaciones.every((h) => h.completada) && (
            <Card className="border-amber-600/50 text-center">
              <p className="text-amber-400 text-lg font-[var(--font-heading)] mb-4">
                Piso Completado!
              </p>
              <div className="flex gap-3 justify-center flex-wrap">
                <div className="flex items-end gap-2">
                  <Select
                    label="Siguiente piso"
                    placeholder="Elegir..."
                    value={newFloor}
                    onChange={(e) => setNewFloor(e.target.value)}
                    options={pisos.map((p) => ({
                      value: p.numero,
                      label: `Piso ${p.numero} — Tier ${p.tier_numero} — Bonus +${p.bonus_recompensa}`,
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

      {/* ═══════════ PHASE: ENCOUNTER (sala activa) ═══════════ */}
      {store.phase === 'encounter' && currentHabitacion && (
        <div className="space-y-4">
          {/* Room header */}
          <Card className={`border-l-4 ${ROOM_TYPE_COLORS[currentHabitacion.tipo_nombre]}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-stone-200 font-[var(--font-heading)]">
                {ROOM_TYPE_ICONS[currentHabitacion.tipo_nombre]} Sala{' '}
                {currentHabitacion.orden} —{' '}
                <span className="capitalize">{currentHabitacion.tipo_nombre}</span>
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  store.setPhase('room_list');
                  store.setEncounterResult(null);
                  resetRoomState();
                }}
              >
                ← Salas
              </Button>
            </div>

            {/* Step indicator */}
            <div className="flex gap-1 mb-6">
              {(['roll', 'results', 'rewards'] as const).map((step, i) => (
                <div
                  key={step}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    i <= ['roll', 'results', 'rewards'].indexOf(encounterStep)
                      ? 'bg-amber-500'
                      : 'bg-[var(--color-dungeon-border)]'
                  }`}
                />
              ))}
            </div>

            {/* STEP 1: Encounter Roll */}
            {encounterStep === 'roll' && (
              <div className="text-center space-y-4">
                <p className="text-stone-400 text-sm">
                  Paso 1 — Tira el d20 para resolver el encuentro
                </p>
                {encounterLoading ? (
                  <Spinner />
                ) : (
                  <D20Roller
                    onRoll={handleEncounterRoll}
                    label="Tirada de Encuentro"
                    size="lg"
                  />
                )}
              </div>
            )}

            {/* STEP 2: Encounter Results */}
            {encounterStep === 'results' && store.encounterResult && (
              <div className="space-y-4 animate-fade-in">
                <EncounterDisplay encounter={store.encounterResult} />
                <Button onClick={() => setEncounterStep('rewards')}>
                  Continuar a Recompensas →
                </Button>
              </div>
            )}

            {/* STEP 3: Reward Rolls */}
            {encounterStep === 'rewards' && store.encounterResult && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-stone-300">
                    Paso 3 — Tiradas de Recompensa ({store.encounterResult.cantidad_total} enemigos)
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleAutoRollAll}
                  >
                    Auto-roll vacios
                  </Button>
                </div>

                <div className="space-y-2">
                  {rewardTiradas.map((t, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-2 rounded bg-[var(--color-dungeon)] border border-[var(--color-dungeon-border)]"
                    >
                      <span className="text-xs text-stone-500 w-20 flex-shrink-0">
                        Enemigo {i + 1}
                      </span>

                      {/* d20 input */}
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-stone-600">d20:</span>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={t.d20}
                          onChange={(e) => {
                            const newTiradas = [...rewardTiradas];
                            newTiradas[i] = { ...newTiradas[i], d20: e.target.value };
                            setRewardTiradas(newTiradas);
                          }}
                          className="w-14 rounded border bg-[var(--color-dungeon-surface)] border-[var(--color-dungeon-border)] px-2 py-1 text-center text-sm text-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                        />
                        <button
                          onClick={() => {
                            const newTiradas = [...rewardTiradas];
                            newTiradas[i] = { ...newTiradas[i], d20: String(rollD20()) };
                            setRewardTiradas(newTiradas);
                          }}
                          className="text-amber-600 hover:text-amber-400 transition-colors text-xs px-1"
                          title="Auto-roll"
                        >
                          🎲
                        </button>
                      </div>

                      {/* Subtable input */}
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-stone-600">sub:</span>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={t.subtabla}
                          onChange={(e) => {
                            const newTiradas = [...rewardTiradas];
                            newTiradas[i] = { ...newTiradas[i], subtabla: e.target.value };
                            setRewardTiradas(newTiradas);
                          }}
                          placeholder="—"
                          className="w-14 rounded border bg-[var(--color-dungeon-surface)] border-[var(--color-dungeon-border)] px-2 py-1 text-center text-sm text-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                        />
                      </div>

                      {/* Indicator */}
                      {t.d20 && (
                        <span className="text-emerald-500 text-xs">✓</span>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 pt-2">
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
                    onClick={() => setEncounterStep('results')}
                  >
                    ← Atras
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ═══════════ PHASE: ASSIGN ITEMS ═══════════ */}
      {store.phase === 'assign_items' && store.rewardsResult && (
        <Card>
          <h2 className="text-lg font-semibold text-stone-200 mb-4 font-[var(--font-heading)]">
            Resultados de Recompensas
          </h2>

          <RewardsDisplay results={store.rewardsResult} />

          {store.rewardsResult.items_pendientes.length > 0 ? (
            <div className="space-y-3 mt-4 pt-4 border-t border-[var(--color-dungeon-border)]">
              <h3 className="text-sm font-medium text-amber-400">
                Items a asignar ({store.rewardsResult.items_pendientes.length})
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
            <div className="mt-4 pt-4 border-t border-[var(--color-dungeon-border)]">
              <p className="text-stone-500 text-sm mb-3">
                No hay items para asignar en esta sala.
              </p>
              <Button onClick={() => store.setPhase('distribute_gold')}>
                Continuar al Oro →
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* ═══════════ PHASE: DISTRIBUTE GOLD ═══════════ */}
      {store.phase === 'distribute_gold' && (
        <Card>
          <h2 className="text-lg font-semibold text-stone-200 mb-4 font-[var(--font-heading)]">
            Repartir Oro
          </h2>
          {store.rewardsResult && store.rewardsResult.oro_dados.length > 0 ? (
            <div className="space-y-4">
              <div className="p-3 rounded bg-[var(--color-dungeon)] border border-[var(--color-dungeon-border)]">
                <p className="text-stone-400 text-sm mb-2">
                  Dados de oro a tirar:
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  {store.rewardsResult.oro_dados.map((dado, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 rounded-full bg-amber-600/20 border border-amber-600/40 text-amber-300 text-sm font-mono"
                    >
                      {dado}
                    </span>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRollGoldDice}
                  >
                    🎲 Tirar dados
                  </Button>
                </div>
                {goldRollResult !== null && (
                  <p className="mt-2 text-xs text-stone-500">
                    Resultado auto-roll: <span className="text-amber-400">{goldRollResult}</span>
                    <span className="text-stone-600"> (podes cambiar el valor abajo)</span>
                  </p>
                )}
              </div>

              <div className="flex items-end gap-3">
                <div className="flex-1 max-w-xs">
                  <Input
                    label="Total de oro"
                    type="number"
                    min="0"
                    value={goldTotal}
                    onChange={(e) => setGoldTotal(e.target.value)}
                    placeholder="Ej: 14"
                  />
                </div>
                <Button
                  onClick={handleDistributeGold}
                  loading={distributingGold}
                  disabled={!goldTotal}
                >
                  Repartir entre {activeParticipants.length} activos
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-stone-500 text-sm mb-3">
                No hay oro para repartir en esta sala.
              </p>
              <Button onClick={() => store.setPhase('room_complete')}>
                Completar Sala →
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* ═══════════ PHASE: ROOM COMPLETE ═══════════ */}
      {store.phase === 'room_complete' && currentHabitacion && (
        <Card className="border-amber-600/40">
          <div className="text-center mb-4">
            <span className="text-3xl">✨</span>
            <h2 className="text-lg font-semibold text-amber-400 mt-2 font-[var(--font-heading)]">
              Sala {currentHabitacion.orden} Completada!
            </h2>
          </div>

          {goldResults.length > 0 && (
            <div className="mb-4 p-3 rounded bg-[var(--color-dungeon)] border border-[var(--color-dungeon-border)]">
              <h3 className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">
                Oro repartido
              </h3>
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

          <div className="flex gap-3 justify-center">
            <Button onClick={handleCompleteRoom} loading={completingRoom}>
              Siguiente Sala →
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowPlayerPanel(true)}
            >
              Gestionar Jugadores
            </Button>
          </div>
        </Card>
      )}

      {/* ═══════════ PLAYER MANAGEMENT MODAL ═══════════ */}
      <Modal
        open={showPlayerPanel}
        onClose={() => setShowPlayerPanel(false)}
        title="Gestion de Jugadores"
      >
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
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                    p.activo
                      ? 'bg-amber-600/20 border border-amber-600/40 text-amber-400'
                      : 'bg-red-900/30 border border-red-800/40 text-red-400'
                  }`}
                >
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
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleDeactivatePlayer(p.id)}
                >
                  Desactivar
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleReactivatePlayer(p.id)}
                >
                  Reactivar
                </Button>
              )}
            </div>
          ))}

          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              setShowPlayerPanel(false);
              setShowAddReplacement(true);
            }}
          >
            + Agregar Reemplazo
          </Button>
        </div>
      </Modal>

      {/* ADD REPLACEMENT MODAL */}
      <Modal
        open={showAddReplacement}
        onClose={() => setShowAddReplacement(false)}
        title="Agregar Reemplazo"
      >
        <div className="space-y-4">
          <Select
            label="Jugador"
            placeholder="Seleccionar..."
            value={replacementUserId}
            onChange={(e) => setReplacementUserId(e.target.value)}
            options={availableUsersForReplacement.map((u) => ({
              value: u.discord_id,
              label: u.nombre,
            }))}
          />
          <Input
            label="Nombre del Personaje"
            value={replacementCharName}
            onChange={(e) => setReplacementCharName(e.target.value)}
            placeholder="Ej: Kael el Ranger"
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              onClick={() => setShowAddReplacement(false)}
            >
              Cancelar
            </Button>
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

// ═══════════ Sub-components ═══════════

function EncounterDisplay({ encounter }: { encounter: EncounterResponse }) {
  return (
    <div className="rounded-lg p-4 bg-[var(--color-dungeon)] border border-[var(--color-dungeon-border)]">
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
            <span className="text-red-400 font-bold text-lg">
              {encounter.cantidad_total}
            </span>{' '}
            enemigos emergen:
          </p>
        </div>
      </div>
      <div className="space-y-1.5 ml-1">
        {encounter.enemigos.map((e, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="text-red-400 font-mono font-bold w-8">
              x{e.max_cantidad}
            </span>
            <span className="text-stone-200">{e.nombre}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RewardsDisplay({ results }: { results: ProcesarRecompensasResponse }) {
  return (
    <div className="rounded-lg p-4 bg-[var(--color-dungeon)] border border-[var(--color-dungeon-border)] space-y-2">
      <h3 className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-2">
        Resultados
      </h3>
      {results.resultados.map((r, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="text-stone-600 font-mono w-6">#{i + 1}</span>
          {r.tipo_resultado === 'nada' && (
            <span className="text-stone-500 italic">Nada encontrado</span>
          )}
          {r.tipo_resultado === 'oro' && (
            <>
              <span className="text-amber-400 font-medium">Oro</span>
              <span className="text-stone-500">({r.dados_oro})</span>
            </>
          )}
          {r.tipo_resultado === 'subtabla' && (
            <>
              <span className="text-emerald-400 font-medium">
                {r.item_nombre || r.subtabla_nombre}
              </span>
              {r.modificador_tier ? (
                <span className="text-amber-400 font-bold">+{r.modificador_tier}</span>
              ) : null}
            </>
          )}
          <span className="text-stone-700 text-xs ml-auto">
            d20:{r.tirada_original} +{r.bonus_recompensa} = {r.tirada_con_bonus}
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
    <div className="flex items-center gap-3 p-3 rounded-lg border border-emerald-800/30 bg-emerald-900/10">
      <div className="flex-1 min-w-0">
        <p className="text-stone-200 text-sm font-medium">
          {item.item_nombre}
          {item.modificador_tier > 0 && (
            <span className="text-amber-400 ml-1">+{item.modificador_tier}</span>
          )}
        </p>
        <p className="text-xs text-stone-500 truncate">
          {item.subtabla_nombre} — d20: {item.tirada_d20}
          {item.tirada_subtabla !== null && ` → sub: ${item.tirada_subtabla}`}
        </p>
      </div>
      <select
        value={value || ''}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="rounded border bg-[var(--color-dungeon)] border-[var(--color-dungeon-border)] px-3 py-1.5 text-sm text-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500/50 max-w-[180px]"
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
