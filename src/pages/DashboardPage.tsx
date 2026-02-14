import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Spinner } from '../components/ui/Spinner';
import { useAuthStore } from '../stores/auth.store';
import { expeditionService } from '../services/expedition.service';
import { ESTADO_LABELS } from '../config/constants';
import type { Expedicion } from '../types/expedition';

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [expeditions, setExpeditions] = useState<Expedicion[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    expeditionService
      .getAll()
      .then(setExpeditions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const activeExpeditions = expeditions.filter((e) => e.estado === 'en_curso');
  const recentExpeditions = expeditions
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-stone-100 font-[var(--font-heading)]">
          Bienvenido, {user?.nombre || 'Dungeon Master'}
        </h1>
        <p className="text-stone-500 mt-1">Panel de control</p>
      </div>

      {/* Quick actions */}
      <div className="flex gap-3">
        <Button onClick={() => navigate('/expeditions')}>
          Nueva Expedicion
        </Button>
      </div>

      {loading ? (
        <Spinner className="py-12" />
      ) : (
        <>
          {/* Active expeditions */}
          {activeExpeditions.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-stone-200 mb-3 font-[var(--font-heading)]">
                Expediciones Activas
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {activeExpeditions.map((exp) => (
                  <Card key={exp.id} hover onClick={() => navigate(`/expeditions/${exp.id}`)}>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-stone-200 font-medium">
                          Expedicion #{exp.id}
                        </p>
                        <p className="text-sm text-stone-500 mt-1">
                          Piso {exp.piso_actual} &middot;{' '}
                          {new Date(exp.fecha).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge estado={exp.estado} label={ESTADO_LABELS[exp.estado]} />
                    </div>
                    <Button
                      size="sm"
                      className="mt-3"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/expeditions/${exp.id}/play`);
                      }}
                    >
                      Continuar
                    </Button>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Recent */}
          <section>
            <h2 className="text-lg font-semibold text-stone-200 mb-3 font-[var(--font-heading)]">
              Expediciones Recientes
            </h2>
            {recentExpeditions.length === 0 ? (
              <Card>
                <p className="text-stone-500 text-center py-4">
                  No hay expediciones todavia.{' '}
                  <Link to="/expeditions" className="text-amber-500 hover:text-amber-400">
                    Crea una!
                  </Link>
                </p>
              </Card>
            ) : (
              <div className="space-y-2">
                {recentExpeditions.map((exp) => (
                  <Card
                    key={exp.id}
                    hover
                    onClick={() => navigate(`/expeditions/${exp.id}`)}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-stone-400 text-sm">#{exp.id}</span>
                      <div>
                        <p className="text-stone-200 text-sm">
                          {new Date(exp.fecha).toLocaleDateString()} &middot; Piso{' '}
                          {exp.piso_actual}
                        </p>
                        {exp.notas && (
                          <p className="text-xs text-stone-500 mt-0.5 truncate max-w-xs">
                            {exp.notas}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge estado={exp.estado} label={ESTADO_LABELS[exp.estado]} />
                  </Card>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
