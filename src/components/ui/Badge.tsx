import { clsx } from 'clsx';
import { ESTADO_COLORS } from '../../config/constants';

interface BadgeProps {
  estado: string;
  label?: string;
  className?: string;
}

export function Badge({ estado, label, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        ESTADO_COLORS[estado] || 'bg-stone-600 text-stone-200',
        className
      )}
    >
      {label || estado}
    </span>
  );
}
