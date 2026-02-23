import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Spinner } from '../components/ui/Spinner';
import { expeditionService } from '../services/expedition.service';
import { userService } from '../services/user.service';
import { useToastStore } from '../stores/toast.store';
import { ESTADO_LABELS, MAX_PARTICIPANTS } from '../config/constants';
import type { Expedicion, Participacion } from '../types/expedition';
import type { User, Personaje } from '../types/auth';

export function ExpeditionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);

  const [expedition, setExpedition] = useState<Expedicion | null>(null);
  const [participants, setParticipants] = useState<Participacion[]>([]);
  const [loading, setLoading] = useState(true);

  // Players list for search
  const [players, setPlayers] = useState<User[]>([]);
  const [playerPersonajes, setPlayerPersonajes] = useState<Record<string, Personaje[]>>({});
  const [loadingPersonajes, setLoadingPersonajes] = useState<string | null>(null);
  const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Manual piso selection
  const [pisoInput, setPisoInput] = useState('');
  const [selectedPisos, setSelectedPisos] = useState<number[]>([]);
  const [startingExpedition, setStartingExpedition] = useState(false);

  // Create player/character modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createMode, setCreateMode] = useState<'new_player' | 'new_character'>('new_player');
  const [newDiscordId, setNewDiscordId] = useState('');
  const [newPlayerNombre, setNewPlayerNombre] = useState('');
  const [newCharNombre, setNewCharNombre] = useState('');
  const [selectedPlayerForChar, setSelectedPlayerForChar] = useState('');
  const [savingCreate, setSavingCreate] = useState(false);

  useEffect(() => {
    if (!id) return;
    const expedId = parseInt(id);
    Promise.all([
      expeditionService.getById(expedId),
      expeditionService.getParticipaciones(expedId),
      userService.getJugadores(),
    ])
      .then(([exp, parts, jugadores]) => {
        setExpedition(exp);
        setParticipants(parts);
        setPlayers(jugadores);
      })
      .catch(() => addToast('Error al cargar expedicion', 'error'))
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Piso selection ──────────────────────────────────────────────────────────
  const addPiso = () => {
    const num = parseInt(pisoInput);
    if (isNaN(num) || num < 1 || num > 20) {
      addToast('Piso invalido (1-20)', 'error');
      return;
    }
    if (selectedPisos.includes(num)) {
      addToast('Ese piso ya fue agregado', 'error');
      return;
    }
    setSelectedPisos((prev) => [...prev, num].sort((a, b) => a - b));
    setPisoInput('');
  };

  const removePiso = (num: number) =>
    setSelectedPisos((prev) => prev.filter((p) => p !== num));

  // ── Character search ────────────────────────────────────────────────────────
  const handleExpandPlayer = useCallback(
    async (discordId: string) => {
      if (expandedPlayer === discordId) {
        setExpandedPlayer(null);
        return;
      }
      setExpandedPlayer(discordId);
      if (!playerPersonajes[discordId]) {
        setLoadingPersonajes(discordId);
        try {
          const chars = await userService.getPersonajes(discordId);
          setPlayerPersonajes((prev) => ({ ...prev, [discordId]: chars }));
        } catch {
          addToast('Error al cargar personajes', 'error');
        } finally {
          setLoadingPersonajes(null);
        }
      }
    },
    [expandedPlayer, playerPersonajes, addToast]
  );

  const handleAddParticipant = useCallback(
    async (usuarioId: string, personajeId: number, _personajeNombre: string) => {
      if (!id) return;
      if (participants.length >= MAX_PARTICIPANTS) {
        addToast(`Maximo ${MAX_PARTICIPANTS} participantes`, 'error');
        return;
      }
      if (participants.some((p) => p.usuario_id === usuarioId)) {
        addToast('Este jugador ya esta en la expedicion', 'error');
        return;
      }
      try {
        const part = await expeditionService.addParticipacion(parseInt(id), {
          usuario_id: usuarioId,
          personaje_id: personajeId,
        });
        setParticipants((prev) => [...prev, part]);
        addToast('Participante agregado', 'success');
      } catch {
        addToast('Error al agregar participante', 'error');
      }
    },
    [id, participants, addToast]
  );

  const handleRemoveParticipant = useCallback(
    async (partId: number) => {
      try {
        await expeditionService.removeParticipacion(partId);
        setParticipants((prev) => prev.filter((p) => p.id !== partId));
        addToast('Participante removido', 'info');
      } catch {
        addToast('Error al remover participante', 'error');
      }
    },
    [addToast]
  );

  // ── Create player / character ───────────────────────────────────────────────
  const handleCreate = async () => {
    if (!id) return;
    setSavingCreate(true);
    try {
      if (createMode === 'new_player') {
        if (!newDiscordId.trim() || !newPlayerNombre.trim() || !newCharNombre.trim()) {
          addToast('Completa todos los campos', 'error');
          return;
        }
        // Create player
        const newPlayer = await userService.createJugador({
          discord_id: newDiscordId.trim(),
          nombre: newPlayerNombre.trim(),
        });
        // Create character for that player
        const newChar = await userService.createPersonaje(newPlayer.discord_id, {
          nombre: newCharNombre.trim(),
        });
        // Update local players list
        setPlayers((prev) => [...prev, newPlayer]);
        setPlayerPersonajes((prev) => ({
          ...prev,
          [newPlayer.discord_id]: [newChar],
        }));
        // Add as participant
        await handleAddParticipant(newPlayer.discord_id, newChar.id, newChar.nombre);
        addToast('Jugador y personaje creados', 'success');
      } else {
        // new_character for existing player
        if (!selectedPlayerForChar || !newCharNombre.trim()) {
          addToast('Selecciona un jugador y escribe el nombre del personaje', 'error');
          return;
        }
        const newChar = await userService.createPersonaje(selectedPlayerForChar, {
          nombre: newCharNombre.trim(),
        });
        setPlayerPersonajes((prev) => ({
          ...prev,
          [selectedPlayerForChar]: [
            ...(prev[selectedPlayerForChar] || []),
            newChar,
          ],
        }));
        await handleAddParticipant(selectedPlayerForChar, newChar.id, newChar.nombre);
        addToast('Personaje creado y agregado', 'success');
      }
      setShowCreateModal(false);
      resetCreateForm();
    } catch {
      addToast('Error al crear', 'error');
    } finally {
      setSavingCreate(false);
    }
  };

  const resetCreateForm = () => {
    setNewDiscordId('');
    setNewPlayerNombre('');
    setNewCharNombre('');
    setSelectedPlayerForChar('');
  };

  // ── Start expedition ────────────────────────────────────────────────────────
  const handleStartExpedition = async () => {
    if (!id || selectedPisos.length === 0 || participants.length === 0) return;
    setStartingExpedition(true);
    try {
      await expeditionService.update(parseInt(id), {
        estado: 'en_curso',
        piso_actual: selectedPisos[0],
      });
      addToast('Expedicion iniciada!', 'success');
      navigate(`/expeditions/${id}/play?pisos=${selectedPisos.join(',')}`);
    } catch {
      addToast('Error al iniciar expedicion', 'error');
    } finally {
      setStartingExpedition(false);
    }
  };

  const handleCancel = async () => {
    if (!id) return;
    if (!window.confirm('Cancelar esta expedicion? Esta accion no se puede deshacer.')) return;
    try {
      await expeditionService.update(parseInt(id), { estado: 'cancelada' });
      setExpedition((e) => (e ? { ...e, estado: 'cancelada' } : null));
      addToast('Expedicion cancelada', 'info');
    } catch {
      addToast('Error al cancelar', 'error');
    }
  };

  if (loading) return <Spinner className="py-12" />;
  if (!expedition) return <p className="text-stone-500">Expedicion no encontrada</p>;

  const canStart =
    expedition.estado === 'pendiente' &&
    participants.length > 0 &&
    selectedPisos.length > 0;

  const filteredPlayers = players.filter((u) =>
    u.nombre.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const alreadyAdded = new Set(participants.map((p) => p.usuario_id));

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-100 font-[var(--font-heading)]">
            Expedicion #{expedition.id}
          </h1>
          <p className="text-stone-500 text-sm mt-1">
            {new Date(expedition.fecha).toLocaleDateString()} &middot; por{' '}
            {expedition.organizador_nombre}
          </p>
        </div>
        <Badge estado={expedition.estado} label={ESTADO_LABELS[expedition.estado]} />
      </div>

      {/* Info */}
      <Card>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-stone-500">Piso Actual</span>
            <p className="text-stone-200 font-medium">{expedition.piso_actual}</p>
          </div>
          <div>
            <span className="text-stone-500">Estado</span>
            <p className="text-stone-200 font-medium">{ESTADO_LABELS[expedition.estado]}</p>
          </div>
          {expedition.notas && (
            <div className="col-span-2">
              <span className="text-stone-500">Notas</span>
              <p className="text-stone-300">{expedition.notas}</p>
            </div>
          )}
        </div>
      </Card>

      {/* ──────────── STEP 1: SELECCIÓN DE PISOS ──────────── */}
      {expedition.estado === 'pendiente' && (
        <section>
          <h2 className="text-lg font-semibold text-stone-200 font-[var(--font-heading)] mb-3">
            1. Selección de Pisos
          </h2>
          <Card className="space-y-4">
            <p className="text-xs text-stone-500">
              Ingresa el numero de piso (1-20) y presiona Agregar. Puedes agregar varios pisos.
            </p>
            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                max="20"
                value={pisoInput}
                onChange={(e) => setPisoInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addPiso()}
                placeholder="Ej: 3"
                className="w-24 rounded border bg-[var(--color-dungeon)] border-[var(--color-dungeon-border)] px-3 py-2 text-sm text-stone-200 placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
              />
              <Button size="sm" onClick={addPiso} disabled={!pisoInput}>
                + Agregar
              </Button>
            </div>

            {selectedPisos.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs text-stone-400 font-medium uppercase tracking-wider">
                  Pisos seleccionados
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedPisos.map((num) => (
                    <div
                      key={num}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-600/40 bg-amber-600/10 text-amber-300 text-sm"
                    >
                      <span className="font-mono font-medium">Piso {num}</span>
                      <button
                        onClick={() => removePiso(num)}
                        className="text-amber-500/60 hover:text-red-400 transition-colors ml-1 font-bold"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-stone-600 pt-1">
                  Orden: {selectedPisos.join(' → ')}
                </p>
              </div>
            ) : (
              <p className="text-stone-600 text-sm italic">
                Sin pisos seleccionados todavia.
              </p>
            )}
          </Card>
        </section>
      )}

      {/* ──────────── STEP 2: PARTICIPANTES ──────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-stone-200 font-[var(--font-heading)]">
            {expedition.estado === 'pendiente' ? '2. ' : ''}Participantes ({participants.length}/{MAX_PARTICIPANTS})
          </h2>
        </div>

        {/* Current participants */}
        {participants.length > 0 && (
          <div className="space-y-2 mb-4">
            {participants.map((p) => (
              <Card key={p.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-600/20 border border-amber-600/40 flex items-center justify-center">
                    <span className="text-sm text-amber-400">
                      {p.nombre_personaje.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p className="text-stone-200 text-sm font-medium">{p.nombre_personaje}</p>
                    <p className="text-xs text-stone-500">
                      {p.usuario_nombre} &middot; {p.oro_acumulado}g
                      {!p.activo && <span className="ml-2 text-red-400">(Inactivo)</span>}
                    </p>
                  </div>
                </div>
                {expedition.estado === 'pendiente' && (
                  <button
                    onClick={() => handleRemoveParticipant(p.id)}
                    className="text-stone-500 hover:text-red-400 transition-colors text-sm"
                  >
                    Quitar
                  </button>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* Search + invite (only pending) */}
        {expedition.estado === 'pendiente' && participants.length < MAX_PARTICIPANTS && (
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-stone-300">Buscar jugador</p>
              <button
                onClick={() => {
                  resetCreateForm();
                  setShowCreateModal(true);
                }}
                className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
              >
                + Crear nuevo jugador/personaje
              </button>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre..."
              className="w-full rounded border bg-[var(--color-dungeon)] border-[var(--color-dungeon-border)] px-3 py-2 text-sm text-stone-200 placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
            />

            {filteredPlayers.length === 0 ? (
              <p className="text-stone-600 text-sm text-center py-2">
                {searchQuery ? 'No se encontraron jugadores.' : 'No hay jugadores registrados.'}
              </p>
            ) : (
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {filteredPlayers.map((player) => {
                  const isAdded = alreadyAdded.has(player.discord_id);
                  const isExpanded = expandedPlayer === player.discord_id;
                  const chars = playerPersonajes[player.discord_id] || [];
                  const isLoadingChars = loadingPersonajes === player.discord_id;

                  return (
                    <div
                      key={player.discord_id}
                      className={`rounded border ${
                        isAdded
                          ? 'border-emerald-700/40 bg-emerald-900/10'
                          : 'border-[var(--color-dungeon-border)] bg-[var(--color-dungeon)]'
                      } overflow-hidden`}
                    >
                      <button
                        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/5 transition-colors"
                        onClick={() => !isAdded && handleExpandPlayer(player.discord_id)}
                        disabled={isAdded}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-stone-700 border border-stone-600 flex items-center justify-center">
                            <span className="text-xs text-stone-300">
                              {player.nombre.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className={`text-sm ${isAdded ? 'text-stone-500' : 'text-stone-200'}`}>
                            {player.nombre}
                          </span>
                          {isAdded && (
                            <span className="text-xs text-emerald-500">Ya en expedicion</span>
                          )}
                        </div>
                        {!isAdded && (
                          <span className="text-stone-500 text-xs">
                            {isExpanded ? '▲' : '▼'} ver personajes
                          </span>
                        )}
                      </button>

                      {/* Characters list */}
                      {isExpanded && !isAdded && (
                        <div className="border-t border-[var(--color-dungeon-border)] bg-[var(--color-dungeon-surface)]">
                          {isLoadingChars ? (
                            <div className="flex justify-center py-3">
                              <Spinner />
                            </div>
                          ) : chars.length === 0 ? (
                            <p className="text-stone-600 text-xs text-center py-3">
                              Sin personajes. Crea uno desde el modal.
                            </p>
                          ) : (
                            chars.map((char) => (
                              <div
                                key={char.id}
                                className="flex items-center justify-between px-4 py-2 hover:bg-white/5 transition-colors"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-amber-500 text-xs">⚔</span>
                                  <span className="text-stone-300 text-sm">{char.nombre}</span>
                                </div>
                                <button
                                  onClick={() =>
                                    handleAddParticipant(player.discord_id, char.id, char.nombre)
                                  }
                                  className="text-xs text-amber-400 hover:text-amber-300 border border-amber-600/40 px-2 py-0.5 rounded transition-colors"
                                >
                                  Agregar
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        {expedition.estado === 'pendiente' && participants.length === 0 && (
          <p className="text-stone-600 text-sm italic mt-2">
            Agrega al menos un participante para poder iniciar.
          </p>
        )}
      </section>

      {/* ──────────── STEP 3: INICIAR ──────────── */}
      {expedition.estado === 'pendiente' && (
        <section className="pt-2">
          <h2 className="text-lg font-semibold text-stone-200 font-[var(--font-heading)] mb-3">
            3. Comenzar Expedicion
          </h2>
          <Card className="space-y-3">
            <div className="text-sm space-y-1">
              <div className="flex items-center gap-2">
                <span className={selectedPisos.length > 0 ? 'text-emerald-400' : 'text-stone-600'}>
                  {selectedPisos.length > 0 ? '✓' : '○'}
                </span>
                <span className={selectedPisos.length > 0 ? 'text-stone-300' : 'text-stone-600'}>
                  {selectedPisos.length > 0
                    ? `${selectedPisos.length} piso${selectedPisos.length !== 1 ? 's' : ''} seleccionado${selectedPisos.length !== 1 ? 's' : ''}`
                    : 'Selecciona al menos un piso'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={participants.length > 0 ? 'text-emerald-400' : 'text-stone-600'}>
                  {participants.length > 0 ? '✓' : '○'}
                </span>
                <span className={participants.length > 0 ? 'text-stone-300' : 'text-stone-600'}>
                  {participants.length > 0
                    ? `${participants.length} participante${participants.length !== 1 ? 's' : ''}`
                    : 'Agrega al menos un participante'}
                </span>
              </div>
            </div>
            <Button
              onClick={handleStartExpedition}
              disabled={!canStart}
              loading={startingExpedition}
              size="lg"
            >
              Iniciar Expedicion
            </Button>
          </Card>
        </section>
      )}

      {/* Actions for active expedition */}
      {expedition.estado === 'en_curso' && (
        <div className="flex gap-3">
          <Button onClick={() => navigate(`/expeditions/${id}/play`)}>
            Continuar Jugando
          </Button>
          <Button onClick={() => navigate(`/history/${id}`)} variant="secondary">
            Ver Historial
          </Button>
        </div>
      )}

      {expedition.estado === 'completada' && (
        <div className="flex gap-3">
          <Button onClick={() => navigate(`/history/${id}`)} variant="secondary">
            Ver Historial
          </Button>
          <Button onClick={() => navigate(`/expeditions/${id}/summary`)} variant="secondary">
            Ver Resumen
          </Button>
        </div>
      )}

      {/* Cancel */}
      {(expedition.estado === 'pendiente' || expedition.estado === 'en_curso') && (
        <div className="pt-4 border-t border-[var(--color-dungeon-border)]">
          <Button variant="danger" size="sm" onClick={handleCancel}>
            Cancelar Expedicion
          </Button>
        </div>
      )}

      {/* ──────────── MODAL: Crear Jugador / Personaje ──────────── */}
      <Modal
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          resetCreateForm();
        }}
        title="Crear Jugador / Personaje"
      >
        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 p-1 rounded-lg bg-[var(--color-dungeon)] border border-[var(--color-dungeon-border)]">
            <button
              onClick={() => setCreateMode('new_player')}
              className={`flex-1 py-1.5 text-xs rounded font-medium transition-colors ${
                createMode === 'new_player'
                  ? 'bg-amber-600/30 text-amber-300 border border-amber-600/40'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Nuevo jugador + personaje
            </button>
            <button
              onClick={() => setCreateMode('new_character')}
              className={`flex-1 py-1.5 text-xs rounded font-medium transition-colors ${
                createMode === 'new_character'
                  ? 'bg-amber-600/30 text-amber-300 border border-amber-600/40'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Nuevo personaje (jugador existente)
            </button>
          </div>

          {createMode === 'new_player' ? (
            <>
              <Input
                label="Discord ID"
                value={newDiscordId}
                onChange={(e) => setNewDiscordId(e.target.value)}
                placeholder="ej: 123456789012345678"
              />
              <Input
                label="Nombre del Jugador"
                value={newPlayerNombre}
                onChange={(e) => setNewPlayerNombre(e.target.value)}
                placeholder="ej: MrCrowley"
              />
              <Input
                label="Nombre del Personaje"
                value={newCharNombre}
                onChange={(e) => setNewCharNombre(e.target.value)}
                placeholder="ej: Aldric el Guerrero"
              />
            </>
          ) : (
            <>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-stone-300">
                  Jugador existente
                </label>
                <select
                  value={selectedPlayerForChar}
                  onChange={(e) => setSelectedPlayerForChar(e.target.value)}
                  className="w-full rounded border bg-[var(--color-dungeon)] border-[var(--color-dungeon-border)] px-3 py-2 text-sm text-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                >
                  <option value="">Seleccionar jugador...</option>
                  {players.map((p) => (
                    <option key={p.discord_id} value={p.discord_id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                label="Nombre del Personaje"
                value={newCharNombre}
                onChange={(e) => setNewCharNombre(e.target.value)}
                placeholder="ej: Lyra la Arquera"
              />
            </>
          )}

          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                setShowCreateModal(false);
                resetCreateForm();
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              loading={savingCreate}
              disabled={
                createMode === 'new_player'
                  ? !newDiscordId.trim() || !newPlayerNombre.trim() || !newCharNombre.trim()
                  : !selectedPlayerForChar || !newCharNombre.trim()
              }
            >
              Crear y Agregar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
