import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { expeditionService } from '../services/expedition.service';
import { ESTADO_LABELS } from '../config/constants';
import type { Expedicion } from '../types/expedition';

export function HistoryPage() {
  const [expeditions, setExpeditions] = useState<Expedicion[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    expeditionService
      .getAll()
      .then((data) =>
        setExpeditions(
          data.sort(
            (a, b) =>
              new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          )
        )
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-stone-100 font-[var(--font-heading)]">
        Historial
      </h1>

      {loading ? (
        <Spinner className="py-12" />
      ) : expeditions.length === 0 ? (
        <Card>
          <p className="text-stone-500 text-center py-8">
            No hay expediciones en el historial.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {expeditions.map((exp) => (
            <Card
              key={exp.id}
              hover
              onClick={() => navigate(`/history/${exp.id}`)}
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
                </div>
              </div>
              <Badge estado={exp.estado} label={ESTADO_LABELS[exp.estado]} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
