import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';

interface RequireRoleProps {
  roles: Array<'player' | 'dm' | 'admin'>;
}

export function RequireRole({ roles }: RequireRoleProps) {
  const user = useAuthStore((s) => s.user);

  if (!user || !roles.includes(user.rol)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
