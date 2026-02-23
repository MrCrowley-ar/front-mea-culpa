import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useAuthStore } from '../stores/auth.store';
import { authService } from '../services/auth.service';
import { useToastStore } from '../stores/toast.store';

export function LoginPage() {
  const [discordId, setDiscordId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const setTokens = useAuthStore((s) => s.setTokens);
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authService.login({ discord_id: discordId, password });
      setTokens(response.access_token, response.refresh_token);
      addToast('Bienvenido de vuelta!', 'success');
      navigate('/dashboard');
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Error al iniciar sesion';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-dungeon)] p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="font-[var(--font-heading)] text-3xl text-amber-500 font-bold tracking-wide">
            Mea Culpa
          </h1>
          <p className="text-stone-500 text-sm mt-2">Dungeon Master Tool</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-[var(--color-dungeon-border)] bg-[var(--color-dungeon-surface)] p-6 space-y-4"
        >
          <h2 className="text-lg font-medium text-stone-200 font-[var(--font-heading)]">
            Iniciar Sesion
          </h2>

          {error && (
            <div className="rounded border border-red-600/50 bg-red-900/30 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <Input
            label="Discord ID"
            value={discordId}
            onChange={(e) => setDiscordId(e.target.value)}
            placeholder="123456789012345678"
            required
          />

          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="********"
            required
          />

          <Button type="submit" className="w-full" loading={loading}>
            Entrar
          </Button>

          <p className="text-center text-sm text-stone-500">
            No tienes cuenta?{' '}
            <Link to="/register" className="text-amber-500 hover:text-amber-400 transition-colors">
              Registrate
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
