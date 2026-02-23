import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { Spinner } from '../components/ui/Spinner';
import { expeditionService } from '../services/expedition.service';
import { configService } from '../services/config.service';
import { userService } from '../services/user.service';
import { useToastStore } from '../stores/toast.store';
import { ESTADO_LABELS, MAX_PARTICIPANTS, TIER_LABELS } from '../config/constants';
import type { Expedicion, Participacion } from '../types/expedition';
import type { Piso } from '../types/config';
import type { User } from '../types/auth';

export function ExpeditionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);

  const [expedition, setExpedition] = useState<Expedicion | null>(null);
  const [participants, setParticipants] = useState<Participacion[]>([]);
  const [pisos, setPisos] = useState<Piso[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Add participant
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [characterName, setCharacterName] = useState('');
  const [addingPlayer, setAddingPlayer] = useState(false);

  // Multi-piso selection
  const [selectedPisos, setSelectedPisos] = useState<number[]>([]);
  const [startingExpedition, setStartingExpedition] = useState(false);

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
        setExpedition(exp);
        setParticipants(parts);
        setPisos(pisosData);
        setUsers(usersData);
      })
      .catch(() => addToast('Error al cargar expedicion', 'error'))
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAddParticipant = async () => {
    if (!id || !selectedUserId || !characterName.trim()) return;
    setAddingPlayer(true);
    try {
      const part = await expeditionService.addParticipacion(parseInt(id), {
        usuario_id: selectedUserId,
        nombre_personaje: characterName.trim(),
      });
      setParticipants([...participants, part]);
      setShowAddPlayer(false);
      setSelectedUserId('');
      setCharacterName('');
      addToast('Participante agregado', 'success');
    } catch {
      addToast('Error al agregar participante', 'error');
    } finally {
      setAddingPlayer(false);
    }
  };

  const handleRemoveParticipant = async (partId: number) => {
    try {
      await expeditionService.removeParticipacion(partId);
      setParticipants(participants.filter((p) => p.id !== partId));
      addToast('Participante removido', 'info');
    } catch {
      addToast('Error al remover participante', 'error');
    }
  };

  const togglePiso = (pisoNum: number) => {
    setSelectedPisos((prev) =>
      prev.includes(pisoNum)
        ? prev.filter((p) => p !== pisoNum)
        : [...prev, pisoNum].sort((a, b) => a - b)
    );
  };

  const handleStartExpedition = async () => {
    if (!id || selectedPisos.length === 0) return;
    setStartingExpedition(true);
    try {
      await expeditionService.update(parseInt(id), {
        estado: 'en_curso',
        piso_actual: selectedPisos[0],
      });
      addToast('Expedicion iniciada!', 'success');
      const pisosParam = selectedPisos.join(',');
      navigate(`/expeditions/${id}/play?pisos=${pisosParam}`);
    } catch {
      addToast('Error al iniciar expedicion', 'error');
    } finally {
      setStartingExpedition(false);
    }
  };

  const handleCancel = async () => {
    if (!id) return;
    if (!window.confirm('Estas seguro de cancelar esta expedicion? Esta accion no se puede deshacer.')) return;
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

  const availableUsers = users.filter(
    (u) => !participants.some((p) => p.usuario_id === u.discord_id)
  );

  const canStart =
    expedition.estado === 'pendiente' &&
    participants.length > 0 &&
    selectedPisos.length > 0;

  const pisosByTier = pisos.reduce<Record<number, Piso[]>>((acc, p) => {
    if (!acc[p.tier_numero]) acc[p.tier_numero] = [];
    acc[p.tier_numero].push(p);
    return acc;
  }, {});

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
            <p className="text-stone-200 font-medium">
              {ESTADO_LABELS[expedition.estado]}
            </p>
          </div>
          {expedition.notas && (
            <div className="col-span-2">
              <span className="text-stone-500">Notas</span>
              <p className="text-stone-300">{expedition.notas}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Participants */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-stone-200 font-[var(--font-heading)]">
            Participantes ({participants.length}/{MAX_PARTICIPANTS})
          </h2>
          {expedition.estado === 'pendiente' &&
            participants.length < MAX_PARTICIPANTS && (
              <Button size="sm" onClick={() => setShowAddPlayer(true)}>
                + Agregar
              </Button>
            )}
        </div>

        {participants.length === 0 ? (
          <Card>
            <p className="text-stone-500 text-center py-4">
              No hay participantes todavia. Agrega jugadores para comenzar.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {participants.map((p) => (
              <Card key={p.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-amber-600/20 border border-amber-600/40 flex items-center justify-center">
                    <span className="text-sm text-amber-400">
                      {p.nombre_personaje.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p className="text-stone-200 text-sm font-medium">
                      {p.nombre_personaje}
                    </p>
                    <p className="text-xs text-stone-500">
                      {p.usuario_nombre} &middot; Oro: {p.oro_acumulado}
                      {!p.activo && (
                        <span className="ml-2 text-red-400">(Inactivo)</span>
                      )}
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
      </section>

      {/* Multi-piso selection (only for pending) */}
      {expedition.estado === 'pendiente' && (
        <Card>
          <h3 className="text-sm font-medium text-stone-300 mb-3">
            Seleccionar Pisos para la Expedicion
          </h3>
          <p className="text-xs text-stone-500 mb-4">
            Elige uno o mas pisos. Se jugaran en orden ascendente.
          </p>

          <div className="space-y-4">
            {Object.entries(pisosByTier).map(([tierNum, tierPisos]) => (
              <div key={tierNum}>
                <p className="text-xs text-stone-400 mb-2 font-medium uppercase tracking-wider">
                  Tier {tierNum} — {TIER_LABELS[parseInt(tierNum)]}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {tierPisos.map((p) => {
                    const isSelected = selectedPisos.includes(p.numero);
                    return (
                      <button
                        key={p.numero}
                        onClick={() => togglePiso(p.numero)}
                        className={`px-3 py-2 rounded border text-sm font-mono transition-all ${
                          isSelected
                            ? 'border-amber-500 bg-amber-600/20 text-amber-300 ring-1 ring-amber-500/30'
                            : 'border-[var(--color-dungeon-border)] text-stone-400 hover:text-stone-200 hover:border-stone-500'
                        }`}
                      >
                        {p.numero}
                        <span className="text-[10px] block text-stone-500">
                          +{p.bonus_recompensa}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {selectedPisos.length > 0 && (
            <div className="mt-4 p-3 rounded bg-[var(--color-dungeon)] border border-[var(--color-dungeon-border)]">
              <p className="text-xs text-stone-400 mb-1">Pisos seleccionados:</p>
              <p className="text-stone-200 text-sm font-mono">
                {selectedPisos.join(' → ')}
              </p>
            </div>
          )}

          <div className="mt-4">
            <Button
              onClick={handleStartExpedition}
              disabled={!canStart}
              loading={startingExpedition}
              size="lg"
            >
              Iniciar Expedicion ({selectedPisos.length} piso{selectedPisos.length !== 1 ? 's' : ''})
            </Button>
          </div>
        </Card>
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

      {/* Add player modal */}
      <Modal
        open={showAddPlayer}
        onClose={() => setShowAddPlayer(false)}
        title="Agregar Participante"
      >
        <div className="space-y-4">
          <Select
            label="Jugador"
            placeholder="Seleccionar jugador..."
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            options={availableUsers.map((u) => ({
              value: u.discord_id,
              label: u.nombre,
            }))}
          />
          <Input
            label="Nombre del Personaje"
            value={characterName}
            onChange={(e) => setCharacterName(e.target.value)}
            placeholder="Ej: Aldric el Guerrero"
          />
          <div className="flex gap-2 justify-end">
            <Button
              variant="secondary"
              onClick={() => setShowAddPlayer(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAddParticipant}
              loading={addingPlayer}
              disabled={!selectedUserId || !characterName.trim()}
            >
              Agregar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
