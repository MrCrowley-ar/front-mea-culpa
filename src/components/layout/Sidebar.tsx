import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAuthStore } from '../../stores/auth.store';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  roles?: Array<'player' | 'dm' | 'admin'>;
}

const navItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: '🏠' },
  { to: '/expeditions', label: 'Expediciones', icon: '⚔️' },
  { to: '/history', label: 'Historial', icon: '📜' },
  { to: '/config', label: 'Configuracion', icon: '⚙️', roles: ['dm', 'admin'] },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const userRol = useAuthStore((s) => s.user?.rol);

  const visibleItems = navItems.filter(
    (item) => !item.roles || (userRol && item.roles.includes(userRol))
  );

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={clsx(
          'fixed top-0 left-0 z-50 h-full w-64 bg-[var(--color-dungeon-light)] border-r border-[var(--color-dungeon-border)] flex flex-col transition-transform lg:translate-x-0 lg:static lg:z-auto',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="p-6 border-b border-[var(--color-dungeon-border)]">
          <h1 className="font-[var(--font-heading)] text-xl text-amber-500 font-bold tracking-wide">
            Mea Culpa DM
          </h1>
          <p className="text-xs text-stone-500 mt-1">Dungeon Master Tool</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {visibleItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-amber-600/20 text-amber-400 border border-amber-600/30'
                    : 'text-stone-400 hover:text-stone-200 hover:bg-white/5 border border-transparent'
                )
              }
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--color-dungeon-border)]">
          <p className="text-xs text-stone-600 text-center">v1.0</p>
        </div>
      </aside>
    </>
  );
}
