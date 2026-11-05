import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Шторка справа — как «Боковые панели» прототипа (.backdrop + .drawer,
 * шапка .dh, тело .db). Закрывается по фону, крестику и Esc; при открытии
 * фокус уходит в шторку, при закрытии возвращается туда, где был.
 *
 *   <Drawer open={!!id} onClose={close} title="Мария Иванова" subtitle="Минск"
 *           actions={<button className="btn-s">Изменить</button>}>
 *     <section className="sec">…</section>
 *   </Drawer>
 *
 * header — полностью своя шапка вместо title/subtitle (вкладки и т.п.).
 */
export default function Drawer({ open, onClose, title, subtitle, actions, header, label, children }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    if (ref.current) ref.current.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (prev && prev.focus) prev.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      <button className="backdrop" type="button" aria-label="Закрыть панель" onClick={onClose} />
      <aside className="drawer" aria-label={label || (typeof title === 'string' ? title : 'Карточка')} tabIndex={-1} ref={ref} role="dialog" aria-modal="true">
        <div className="dh">
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', paddingBottom: header ? 0 : 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 auto', minWidth: 0 }}>
              {title && <h2 style={{ fontSize: 19, fontWeight: 700 }}>{title}</h2>}
              {subtitle && <span className="small muted">{subtitle}</span>}
            </div>
            {actions}
            <button className="ibtn" type="button" aria-label="Закрыть" onClick={onClose}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
          {header}
        </div>
        <div className="db">{children}</div>
      </aside>
    </>,
    document.body,
  );
}
