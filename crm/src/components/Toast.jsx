import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Тосты — как flash()/doUndo в прототипе (component.js): одно сообщение
 * внизу по центру, 4,2 с, необязательная кнопка «Отменить».
 *
 *   const toast = useToast();
 *   toast('Тег добавлен: 3.', { undo: () => restore(prev) });
 *
 * undo может вернуть Promise (откат через API) — тогда «Отменено.»
 * показывается после него, а ошибка отката — текстом ошибки.
 */
const ToastContext = createContext(null);
const DURATION = 4200;

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const show = useCallback((message, opts = {}) => {
    clearTimeout(timer.current);
    setToast({ message, undo: opts.undo || null, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), opts.duration || DURATION);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const doUndo = useCallback(async () => {
    if (!toast || !toast.undo) return;
    const { undo } = toast;
    setToast((t) => (t ? { ...t, undo: null } : t));
    try {
      await undo();
      show('Отменено.');
    } catch (err) {
      show((err && err.message) || 'Не удалось отменить.');
    }
  }, [toast, show]);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <div key={toast.id} className="toast toastbox" role="status" aria-live="polite">
          <span>{toast.message}</span>
          {toast.undo && (
            <button type="button" className="toast-undo" onClick={doUndo}>Отменить</button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast вне ToastProvider');
  return ctx;
}
