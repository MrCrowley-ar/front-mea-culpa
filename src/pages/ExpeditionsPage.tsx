import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Spinner } from '../components/ui/Spinner';
import { expeditionService } from '../services/expedition.service';
import { useToastStore } from '../stores/toast.store';
import { ESTADO_LABELS } from '../config/constants';
import type { Expedicion, EstadoExpedicion } from '../types/expedition';

export function ExpeditionsPage() {
  const [expeditions, setExpeditions] = useState<Expedicion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<EstadoExpedicion | ''>('');
  const [createDate, setCreateDate] = useState(new Date().toISOString().split('T')[0]);
  const [createNotes, setCreateNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);

  const fetchExpeditions = () => {
    setLoading(true);
    expeditionService
      .getAll()
      .then(setExpeditions)
      .catch(() => addToast('Error al cargar expediciones', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchExpeditions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const exp = await expeditionService.create({
        fecha: createDate,
        notas: createNotes || undefined,
      });
      addToast('Expedicion creada', 'success');
      setShowCreate(false);
      setCreateNotes('');
      navigate(`/expeditions/${exp.id}`);
    } catch {
      addToast('Error al crear expedicion', 'error');
    } finally {
      setCreating(false);
    }
  };

  const filtered = filter
    ? expeditions.filter((e) => e.estado === filter)
    : expeditions;

  const sorted = [...filtered].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-100 font-[var(--font-heading)]">
          Expediciones
        </h1>
        <Button onClick={() => setShowCreate(true)}>
          + Nueva
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(['', 'pendiente', 'en_curso', 'completada', 'cancelada'] as const).map(
          (estado) => (
            <button
              key={estado}
              onClick={() => setFilter(estado)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                filter === estado
                  ? 'border-amber-600 bg-amber-600/20 text-amber-400'
                  : 'border-[var(--color-dungeon-border)] text-stone-400 hover:text-stone-200 hover:border-stone-500'
              }`}
            >
              {estado ? ESTADO_LABELS[estado] : 'Todas'}
            </button>
          )
        )}
      </div>

      {loading ? (
        <Spinner className="py-12" />
      ) : sorted.length === 0 ? (
        <Card>
          <p className="text-stone-500 text-center py-8">
            No hay expediciones{filter ? ` con estado "${ESTADO_LABELS[filter]}"` : ''}.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {sorted.map((exp) => (
            <Card
              key={exp.id}
              hover
              onClick={() => navigate(`/expeditions/${exp.id}`)}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-4 min-w-0">
                <span className="text-stone-500 text-sm font-mono">#{exp.id}</span>
                <div className="min-w-0">
                  <p className="text-stone-200 text-sm">
                    {new Date(exp.fecha).toLocaleDateString()} &middot; Piso{' '}
                    {exp.piso_actual}
                  </p>
                  {exp.notas && (
                    <p className="text-xs text-stone-500 truncate">{exp.notas}</p>
                  )}
                  <p className="text-xs text-stone-600 mt-0.5">
                    por {exp.organizador_nombre}
                  </p>
                </div>
              </div>
              <Badge estado={exp.estado} label={ESTADO_LABELS[exp.estado]} />
            </Card>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Nueva Expedicion"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Fecha"
            type="date"
            value={createDate}
            onChange={(e) => setCreateDate(e.target.value)}
            required
          />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-stone-300">
              Notas (opcional)
            </label>
            <textarea
              value={createNotes}
              onChange={(e) => setCreateNotes(e.target.value)}
              placeholder="Notas sobre la expedicion..."
              rows={3}
              className="w-full rounded border bg-[var(--color-dungeon)] border-[var(--color-dungeon-border)] px-3 py-2 text-sm text-stone-200 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-600 resize-none"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowCreate(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={creating}>
              Crear
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
