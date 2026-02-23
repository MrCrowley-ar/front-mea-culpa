import { clsx } from 'clsx';
import type { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export function Card({ className, children, hover, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        'rounded-lg border border-[var(--color-dungeon-border)] bg-[var(--color-dungeon-surface)] p-4',
        hover && 'hover:border-amber-600/50 transition-colors cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
