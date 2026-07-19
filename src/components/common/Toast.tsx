import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

type ToastKind = 'info' | 'success' | 'error';
type Toast = { id: string; kind: ToastKind; title: string; description?: string };

type ToastState = {
  push: (toast: Omit<Toast, 'id'>) => void;
};

const ToastCtx = createContext<ToastState | null>(null);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setItems((current) => [...current, { ...toast, id }]);
    setTimeout(() => {
      setItems((current) => current.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div aria-live="polite" className="fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`flex w-full max-w-md items-start gap-3 rounded-lg border p-3 shadow-card ${
              t.kind === 'error'
                ? 'border-danger-500 bg-danger-100 text-danger-700'
                : t.kind === 'success'
                  ? 'border-success-500 bg-success-100 text-success-700'
                  : 'border-border bg-white text-ink-900'
            }`}
          >
            <span className="mt-0.5">
              {t.kind === 'error' ? (
                <AlertTriangle size={18} aria-hidden="true" />
              ) : t.kind === 'success' ? (
                <CheckCircle2 size={18} aria-hidden="true" />
              ) : (
                <Info size={18} aria-hidden="true" />
              )}
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold">{t.title}</p>
              {t.description && <p className="mt-0.5 text-xs opacity-90">{t.description}</p>}
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              className="rounded p-1 hover:bg-cream-100"
              onClick={() => setItems((cur) => cur.filter((i) => i.id !== t.id))}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
};

export const useToast = (): ToastState => {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
};
