import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getNotifications, readNotifications } from '../api/crm';
import { useAuth } from '../auth/AuthContext';
import { fmtD } from '../utils';
import useOutside from './useOutside';

/**
 * Колокольчик в шапке (CRM-PLAN D8) — как уведомления прототипа
 * (markup.html, header.top; component.js «уведомления»): цифра
 * непрочитанных, список (синяя точка — не прочитано), «Прочитать все».
 * Клик по уведомлению отмечает его прочитанным и открывает, где разбираться:
 * заказ — /orders?open=<id>, сообщение — «Входящие», задача — «Задачи»,
 * заявка в канал — «Сегодня».
 *
 * Список обновляется раз в минуту и при открытии.
 */
const POLL_MS = 60 * 1000;

export default function NotificationsBell() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ items: [], unread: 0 });
  const [error, setError] = useState('');
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useOutside(ref, open, close);

  const load = useCallback(async () => {
    try {
      setData(await getNotifications());
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const toggle = () => {
    setOpen((v) => !v);
    if (!open) load();
  };

  const markLocal = (ids) => setData((d) => {
    const set = new Set(ids);
    const items = d.items.map((n) => (set.has(n.id) ? { ...n, read: true } : n));
    const newly = d.items.filter((n) => set.has(n.id) && !n.read).length;
    return { ...d, items, unread: Math.max(0, d.unread - newly) };
  });

  const readAll = async () => {
    setData((d) => ({ ...d, items: d.items.map((n) => ({ ...n, read: true })), unread: 0 }));
    try {
      const r = await readNotifications({ all: true });
      setData((d) => ({ ...d, unread: r.unread }));
    } catch (err) {
      setError(err.message);
      load();
    }
  };

  const go = (n) => {
    if (!n.read) {
      markLocal([n.id]);
      readNotifications({ ids: [n.id] }).catch(() => load());
    }
    setOpen(false);
    const l = n.link || {};
    if (l.type === 'order') navigate(`/orders?open=${l.id}`);
    else if (l.type === 'inbox' && can('inbox')) navigate('/inbox');
    else if (l.type === 'tasks') navigate('/tasks');
    else navigate('/today');
  };

  const unread = data.unread || 0;

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="ibtn" type="button" aria-label={unread ? `Уведомления: ${unread} новых` : 'Уведомления'}
        aria-expanded={open} onClick={toggle}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, padding: '0 5px', boxSizing: 'border-box',
            borderRadius: 999, background: '#C2412D', color: '#FFFFFF', fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{unread > 99 ? '99+' : unread}</span>
        )}
      </button>
      {open && (
        <div className="menu" style={{ width: 380, maxWidth: 'calc(100vw - 32px)', maxHeight: 480, overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px' }}>
            <span style={{ fontWeight: 600 }}>Уведомления</span>
            {data.items.length > 0 && <button className="lnk small" type="button" onClick={readAll}>Прочитать все</button>}
          </div>
          {data.items.map((n) => (
            <button key={n.id} type="button" className="menuitem" onClick={() => go(n)} style={{ alignItems: 'flex-start' }}>
              {!n.read
                ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2453A6', marginTop: 6, flex: '0 0 auto' }} />
                : <span style={{ width: 8, flex: '0 0 auto' }} />}
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontWeight: n.read ? 500 : 600 }}>{n.text}</span>
                {n.sub && <span className="small muted">{n.sub}</span>}
                <span className="small muted">{fmtD(n.at, true)}</span>
              </span>
            </button>
          ))}
          {!data.items.length && <div className="small muted" style={{ padding: 10 }}>{error || 'Новых событий нет.'}</div>}
        </div>
      )}
    </div>
  );
}
