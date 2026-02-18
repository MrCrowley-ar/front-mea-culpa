import { useEffect, useState, type FormEvent } from 'react';
import { Card } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { configService } from '../services/config.service';
import { useToastStore } from '../stores/toast.store';
import { TIER_LABELS } from '../config/constants';
import type { Tier, Piso, TipoHabitacion, Item, AllowedDiscord } from '../types/config';

type Tab = 'tiers' | 'pisos' | 'salas' | 'items' | 'whitelist';

export function ConfigPage() {
  const [activeTab, setActiveTab] = useState<Tab>('tiers');
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [pisos, setPisos] = useState<Piso[]>([]);
  const [tiposHabitacion, setTiposHabitacion] = useState<TipoHabitacion[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [allowedDiscords, setAllowedDiscords] = useState<AllowedDiscord[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemFilter, setItemFilter] = useState('');
  const [newDiscordId, setNewDiscordId] = useState('');
  const [newDiscordNota, setNewDiscordNota] = useState('');
  const [addingDiscord, setAddingDiscord] = useState(false);
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    Promise.all([
      configService.getTiers(),
      configService.getPisos(),
      configService.getTiposHabitacion(),
      configService.getItems(),
      configService.getAllowedDiscords(),
    ])
      .then(([t, p, th, i, ad]) => {
        setTiers(t);
        setPisos(p);
        setTiposHabitacion(th);
        setItems(i);
        setAllowedDiscords(ad);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleAddDiscord = async (e: FormEvent) => {
    e.preventDefault();
    if (!newDiscordId.trim()) return;
    setAddingDiscord(true);
    try {
      const added = await configService.addAllowedDiscord(
        newDiscordId.trim(),
        newDiscordNota.trim() || undefined
      );
      setAllowedDiscords((prev) => [...prev, added]);
      setNewDiscordId('');
      setNewDiscordNota('');
      addToast('Discord ID agregado a la whitelist', 'success');
    } catch {
      addToast('Error al agregar Discord ID', 'error');
    } finally {
      setAddingDiscord(false);
    }
  };

  const handleRemoveDiscord = async (id: number) => {
    try {
      await configService.removeAllowedDiscord(id);
      setAllowedDiscords((prev) => prev.filter((d) => d.id !== id));
      addToast('Discord ID removido de la whitelist', 'success');
    } catch {
      addToast('Error al remover Discord ID', 'error');
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'tiers', label: 'Tiers' },
    { key: 'pisos', label: 'Pisos' },
    { key: 'salas', label: 'Tipos de Sala' },
    { key: 'items', label: 'Items' },
    { key: 'whitelist', label: 'Whitelist' },
  ];

  const filteredItems = itemFilter
    ? items.filter(
        (i) =>
          i.nombre.toLowerCase().includes(itemFilter.toLowerCase()) ||
          i.tipo.toLowerCase().includes(itemFilter.toLowerCase())
      )
    : items;

  if (loading) return <Spinner className="py-12" />;

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-stone-100 font-[var(--font-heading)]">
        Configuracion
      </h1>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--color-dungeon-border)]">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-stone-500 hover:text-stone-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tiers */}
      {activeTab === 'tiers' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-stone-400 text-left border-b border-[var(--color-dungeon-border)]">
                  <th className="pb-2 pr-4">Tier</th>
                  <th className="pb-2 pr-4">Pisos</th>
                  <th className="pb-2 pr-4">Mod Armas</th>
                  <th className="pb-2 pr-4">Mod Armaduras</th>
                  <th className="pb-2">Nivel</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((tier) => (
                  <tr key={tier.id} className="border-b border-[var(--color-dungeon-border)]/50">
                    <td className="py-2 pr-4 text-stone-200 font-medium">
                      {tier.numero}
                    </td>
                    <td className="py-2 pr-4 text-stone-300">
                      {tier.piso_min}-{tier.piso_max}
                    </td>
                    <td className="py-2 pr-4 text-amber-400">+{tier.mod_armas}</td>
                    <td className="py-2 pr-4 text-amber-400">+{tier.mod_armaduras}</td>
                    <td className="py-2 text-stone-400">
                      {TIER_LABELS[tier.numero]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Pisos */}
      {activeTab === 'pisos' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-stone-400 text-left border-b border-[var(--color-dungeon-border)]">
                  <th className="pb-2 pr-4">Piso</th>
                  <th className="pb-2 pr-4">Tier</th>
                  <th className="pb-2 pr-4">Bonus Recompensa</th>
                  <th className="pb-2">Salas Comunes</th>
                </tr>
              </thead>
              <tbody>
                {pisos.map((piso) => (
                  <tr key={piso.numero} className="border-b border-[var(--color-dungeon-border)]/50">
                    <td className="py-2 pr-4 text-stone-200 font-medium">
                      {piso.numero}
                    </td>
                    <td className="py-2 pr-4 text-stone-300">
                      Tier {piso.tier_numero}
                    </td>
                    <td className="py-2 pr-4 text-amber-400">
                      +{piso.bonus_recompensa}
                    </td>
                    <td className="py-2 text-stone-300">
                      {piso.num_habitaciones_comunes}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tipos de Sala */}
      {activeTab === 'salas' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-stone-400 text-left border-b border-[var(--color-dungeon-border)]">
                  <th className="pb-2 pr-4">ID</th>
                  <th className="pb-2 pr-4">Nombre</th>
                  <th className="pb-2 pr-4">Usa Tabla Boss</th>
                  <th className="pb-2">Descripcion</th>
                </tr>
              </thead>
              <tbody>
                {tiposHabitacion.map((tipo) => (
                  <tr key={tipo.id} className="border-b border-[var(--color-dungeon-border)]/50">
                    <td className="py-2 pr-4 text-stone-400">{tipo.id}</td>
                    <td className="py-2 pr-4 text-stone-200 font-medium capitalize">
                      {tipo.nombre}
                    </td>
                    <td className="py-2 pr-4">
                      {tipo.usa_tabla_boss ? (
                        <span className="text-red-400">Si</span>
                      ) : (
                        <span className="text-stone-500">No</span>
                      )}
                    </td>
                    <td className="py-2 text-stone-400">{tipo.descripcion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Items */}
      {activeTab === 'items' && (
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Buscar items..."
            value={itemFilter}
            onChange={(e) => setItemFilter(e.target.value)}
            className="w-full max-w-xs rounded border bg-[var(--color-dungeon)] border-[var(--color-dungeon-border)] px-3 py-2 text-sm text-stone-200 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
          />
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-stone-400 text-left border-b border-[var(--color-dungeon-border)]">
                    <th className="pb-2 pr-4">ID</th>
                    <th className="pb-2 pr-4">Nombre</th>
                    <th className="pb-2 pr-4">Tipo</th>
                    <th className="pb-2 pr-4">Precio Base</th>
                    <th className="pb-2 pr-4">Dados Precio</th>
                    <th className="pb-2">Modificable</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="border-b border-[var(--color-dungeon-border)]/50">
                      <td className="py-2 pr-4 text-stone-400">{item.id}</td>
                      <td className="py-2 pr-4 text-stone-200 font-medium">
                        {item.nombre}
                      </td>
                      <td className="py-2 pr-4 text-stone-300 capitalize">
                        {item.tipo}
                      </td>
                      <td className="py-2 pr-4 text-amber-400">
                        {item.precio_base ?? '-'}
                      </td>
                      <td className="py-2 pr-4 text-stone-300">
                        {item.dados_precio || '-'}
                      </td>
                      <td className="py-2">
                        {item.es_base_modificable ? (
                          <span className="text-emerald-400">Si</span>
                        ) : (
                          <span className="text-stone-500">No</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredItems.length === 0 && (
                <p className="text-stone-500 text-center py-4">
                  No se encontraron items.
                </p>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Whitelist */}
      {activeTab === 'whitelist' && (
        <div className="space-y-4">
          <Card>
            <h3 className="text-sm font-medium text-stone-300 mb-3">
              Agregar Discord ID permitido
            </h3>
            <form onSubmit={handleAddDiscord} className="flex gap-3 items-end">
              <div className="flex-1">
                <Input
                  label="Discord ID"
                  value={newDiscordId}
                  onChange={(e) => setNewDiscordId(e.target.value)}
                  placeholder="123456789012345678"
                  required
                />
              </div>
              <div className="flex-1">
                <Input
                  label="Nota (opcional)"
                  value={newDiscordNota}
                  onChange={(e) => setNewDiscordNota(e.target.value)}
                  placeholder="Nombre del jugador"
                />
              </div>
              <Button type="submit" loading={addingDiscord}>
                Agregar
              </Button>
            </form>
          </Card>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-stone-400 text-left border-b border-[var(--color-dungeon-border)]">
                    <th className="pb-2 pr-4">Discord ID</th>
                    <th className="pb-2 pr-4">Nota</th>
                    <th className="pb-2 pr-4">Agregado</th>
                    <th className="pb-2 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {allowedDiscords.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-b border-[var(--color-dungeon-border)]/50"
                    >
                      <td className="py-2 pr-4 text-stone-200 font-mono text-xs">
                        {entry.discord_id}
                      </td>
                      <td className="py-2 pr-4 text-stone-400">
                        {entry.nota || '-'}
                      </td>
                      <td className="py-2 pr-4 text-stone-500 text-xs">
                        {new Date(entry.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-2">
                        <button
                          onClick={() => handleRemoveDiscord(entry.id)}
                          className="text-red-400 hover:text-red-300 text-xs transition-colors"
                        >
                          Quitar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {allowedDiscords.length === 0 && (
                <p className="text-stone-500 text-center py-4">
                  No hay Discord IDs en la whitelist.
                </p>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
