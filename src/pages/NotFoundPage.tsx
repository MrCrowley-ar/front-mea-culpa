import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-6xl font-bold text-stone-700 font-[var(--font-heading)]">404</p>
      <p className="text-stone-400 mt-4 mb-6">La pagina que buscas no existe.</p>
      <Link to="/dashboard">
        <Button variant="secondary">Volver al Dashboard</Button>
      </Link>
    </div>
  );
}
