import { useState, useCallback, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { rollD20 } from '../../lib/dice';

interface D20RollerProps {
  onRoll: (value: number) => void;
  label?: string;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function D20Roller({ onRoll, label, disabled = false, size = 'md' }: D20RollerProps) {
  const [displayValue, setDisplayValue] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [settled, setSettled] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const sizeClasses = {
    sm: 'w-16 h-16 text-xl',
    md: 'w-24 h-24 text-3xl',
    lg: 'w-32 h-32 text-4xl',
  };

  const handleAutoRoll = useCallback(() => {
    if (disabled || isRolling) return;

    setIsRolling(true);
    setSettled(false);

    let count = 0;
    const maxCount = 15;

    intervalRef.current = setInterval(() => {
      setDisplayValue(rollD20());
      count++;
      if (count >= maxCount) {
        clearInterval(intervalRef.current);
        const finalValue = rollD20();
        setDisplayValue(finalValue);
        setIsRolling(false);
        setSettled(true);
        onRoll(finalValue);
      }
    }, 60);
  }, [disabled, isRolling, onRoll]);

  const handleManualSubmit = useCallback(() => {
    const val = parseInt(manualValue, 10);
    if (val >= 1 && val <= 20) {
      setDisplayValue(val);
      setSettled(true);
      onRoll(val);
      setManualValue('');
    }
  }, [manualValue, onRoll]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const isNat20 = settled && displayValue === 20;
  const isNat1 = settled && displayValue === 1;

  return (
    <div className="flex flex-col items-center gap-3">
      {label && (
        <span className="text-sm font-medium text-stone-400">{label}</span>
      )}

      {/* D20 Display */}
      <button
        onClick={handleAutoRoll}
        disabled={disabled || isRolling}
        className={clsx(
          'relative flex items-center justify-center rounded-full border-2 font-bold font-[var(--font-heading)] transition-all',
          sizeClasses[size],
          disabled
            ? 'border-stone-600 bg-stone-800 text-stone-500 cursor-not-allowed'
            : 'border-amber-600 bg-[var(--color-dungeon)] text-amber-400 hover:border-amber-400 hover:shadow-lg hover:shadow-amber-600/20 cursor-pointer',
          isRolling && 'animate-dice-spin',
          settled && !isRolling && 'animate-dice-settle',
          isNat20 && 'animate-glow border-yellow-400 text-yellow-300',
          isNat1 && 'animate-shake border-red-500 text-red-400'
        )}
      >
        {/* D20 shape indicator */}
        <div className="absolute inset-0 flex items-center justify-center">
          <svg viewBox="0 0 100 100" className="w-full h-full opacity-10" fill="currentColor">
            <polygon points="50,5 95,35 80,90 20,90 5,35" />
          </svg>
        </div>
        <span className="relative z-10">
          {displayValue !== null ? displayValue : 'd20'}
        </span>
      </button>

      {isNat20 && (
        <span className="text-yellow-400 font-bold text-sm animate-fade-in">
          CRITICO!
        </span>
      )}
      {isNat1 && (
        <span className="text-red-400 font-bold text-sm animate-fade-in">
          PIFIA!
        </span>
      )}

      {/* Manual entry */}
      {!disabled && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            max="20"
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
            placeholder="1-20"
            className="w-16 rounded border bg-[var(--color-dungeon)] border-[var(--color-dungeon-border)] px-2 py-1 text-center text-sm text-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
          />
          <button
            onClick={handleManualSubmit}
            className="text-xs text-amber-500 hover:text-amber-400 transition-colors"
          >
            OK
          </button>
        </div>
      )}
    </div>
  );
}
