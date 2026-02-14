import { clsx } from 'clsx';
import { useToastStore } from '../../stores/toast.store';

const typeStyles = {
  success: 'border-emerald-600 bg-emerald-900/80 text-emerald-200',
  error: 'border-red-600 bg-red-900/80 text-red-200',
  info: 'border-blue-600 bg-blue-900/80 text-blue-200',
};

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={clsx(
            'rounded-lg border px-4 py-3 text-sm shadow-lg animate-slide-in max-w-sm',
            typeStyles[toast.type]
          )}
          onClick={() => removeToast(toast.id)}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
