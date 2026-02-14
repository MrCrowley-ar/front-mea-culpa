import { useAuthStore } from '../../stores/auth.store';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';

interface HeaderProps {
  onMenuToggle: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="h-14 border-b border-[var(--color-dungeon-border)] bg-[var(--color-dungeon-light)] flex items-center justify-between px-4">
      {/* Mobile menu button */}
      <button
        onClick={onMenuToggle}
        className="lg:hidden text-stone-400 hover:text-stone-200 transition-colors"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div className="hidden lg:block" />

      <div className="flex items-center gap-4">
        {user && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-amber-600/30 border border-amber-600/50 flex items-center justify-center">
              <span className="text-sm text-amber-400 font-medium">
                {user.nombre.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="hidden sm:block">
              <p className="text-sm text-stone-200">{user.nombre}</p>
              <p className="text-xs text-stone-500 capitalize">{user.rol}</p>
            </div>
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          Salir
        </Button>
      </div>
    </header>
  );
}
