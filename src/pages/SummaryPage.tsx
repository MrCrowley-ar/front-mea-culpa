import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { gameplayService } from '../services/gameplay.service';
import { expeditionService } from '../services/expedition.service';
import { useToastStore } from '../stores/toast.store';
import type { ResumenExpedicion } from '../types/gameplay';

export function SummaryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);

  const [resumen, setResumen] = useState<ResumenExpedicion | null>(null);
  const [loading, setLoading] = useState(true);
  const [ventas, setVentas] = useState<Record<number, number>>({});
  const [liquidating, setLiquidating] = useState(false);

  useEffect(() => {
    if (!id) return;
    gameplayService
      .getResumen(parseInt(id))
      .then(setResumen)
      .catch(() => addToast('Error al cargar resumen', 'error'))
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleVenta = (recompensaId: number) => {
    setVentas((prev) => {
      const copy = { ...prev };
      if (recompensaId in copy) {
        delete copy[recompensaId];
      } else {
        copy[recompensaId] = 0;
      }
      return copy;
    });
  };

  const handleLiquidar = useCallback(async () => {
    if (!id) return;
    setLiquidating(true);
    try {
      const ventasArray = Object.entries(ventas).map(([recompensaId, precio]) => ({
        recompensa_id: parseInt(recompensaId),
        precio_venta: precio,
      }));

      await gameplayService.liquidar({
        expedicion_id: parseInt(id),
        ventas: ventasArray,
      });

      addToast('Recompensas liquidadas!', 'success');

      // Refresh summary
      const updated = await gameplayService.getResumen(parseInt(id));
      setResumen(updated);
      setVentas({});
    } catch {
      addToast('Error al liquidar', 'error');
    } finally {
      setLiquidating(false);
    }
  }, [id, ventas, addToast]);

  const handleComplete = useCallback(async () => {
    if (!id) return;
    try {
      await expeditionService.update(parseInt(id), { estado: 'completada' });
      addToast('Expedicion completada!', 'success');
      navigate('/dashboard');
    } catch {
      addToast('Error al completar', 'error');
    }
  }, [id, navigate, addToast]);

  if (loading) return <Spinner className="py-12" />;
  if (!resumen) return <p className="text-stone-500">No se encontro el resumen</p>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-100 font-[var(--font-heading)]">
            Resumen — Expedicion #{resumen.expedicion_id}
          </h1>
          <p className="text-sm text-stone-500">
            Piso {resumen.piso_actual} &middot; {resumen.total_habitaciones} salas &middot;
            Oro total: {resumen.oro_total_expedicion}g
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate(`/expeditions/${id}`)}>
            Volver
          </Button>
          {resumen.estado === 'en_curso' && (
            <Button variant="danger" onClick={handleComplete}>
              Completar
            </Button>
          )}
        </div>
      </div>

      {/* Per-participant summary */}
      {resumen.participantes.map((part) => (
        <Card key={part.participacion_id}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-600/20 border border-amber-600/40 flex items-center justify-center">
                <span className="text-amber-400 font-medium">
                  {part.nombre_personaje.charAt(0)}
                </span>
              </div>
              <div>
                <p className="text-stone-200 font-medium">{part.nombre_personaje}</p>
                <p className="text-xs text-stone-500">
                  Oro bruto: {part.total_oro_bruto}g &middot; Ventas:{' '}
                  {part.total_oro_ventas}g &middot;{' '}
                  <span className="text-amber-400 font-medium">
                    Total: {part.total_oro}g
                  </span>
                </p>
              </div>
            </div>
          </div>

          {part.items.length > 0 ? (
            <div className="space-y-2">
              {part.items.map((item) => (
                <div
                  key={item.recompensa_id}
                  className="flex items-center justify-between p-2 rounded bg-[var(--color-dungeon)] border border-[var(--color-dungeon-border)]"
                >
                  <div>
                    <p className="text-stone-200 text-sm">
                      {item.item_nombre}
                      {item.modificador_tier > 0 && (
                        <span className="text-amber-400"> +{item.modificador_tier}</span>
                      )}
                    </p>
                    <p className="text-xs text-stone-500">
                      Sala #{item.habitacion_orden}
                      {item.vendido && (
                        <span className="ml-2 text-emerald-400">
                          Vendido: {item.precio_venta}g
                        </span>
                      )}
                    </p>
                  </div>

                  {!item.vendido && resumen.estado !== 'completada' && (
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-xs text-stone-400 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.recompensa_id in ventas}
                          onChange={() => toggleVenta(item.recompensa_id)}
                          className="rounded border-stone-600 bg-stone-800 text-amber-500 focus:ring-amber-500"
                        />
                        Vender
                      </label>
                      {item.recompensa_id in ventas && (
                        <input
                          type="number"
                          min="0"
                          value={ventas[item.recompensa_id] || ''}
                          onChange={(e) =>
                            setVentas({
                              ...ventas,
                              [item.recompensa_id]: parseInt(e.target.value) || 0,
                            })
                          }
                          placeholder="Precio"
                          className="w-20 rounded border bg-[var(--color-dungeon-surface)] border-[var(--color-dungeon-border)] px-2 py-1 text-xs text-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                        />
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-stone-500 text-sm">Sin items</p>
          )}
        </Card>
      ))}

      {/* Liquidation button */}
      {Object.keys(ventas).length > 0 && (
        <Card className="border-amber-600/40">
          <div className="flex items-center justify-between">
            <p className="text-stone-300 text-sm">
              {Object.keys(ventas).length} item(s) marcados para venta
            </p>
            <Button onClick={handleLiquidar} loading={liquidating}>
              Liquidar Ventas
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
