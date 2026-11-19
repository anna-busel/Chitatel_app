import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchAll } from '../api/crm';
import ClientDrawer from './ClientDrawer';
import useOutside from './useOutside';

/**
 * Поиск по всей базе в шапке (CRM-PLAN D8) — как поиск в header.top
 * прототипа (markup.html, «глобальный поиск» в component.js): клиентки по
 * имени, почте, телефону, @нику; заказы по номеру. Ctrl K / Cmd K — фокус
 * (и в русской раскладке, «Л»), Esc — очистить.
 *
 * Клиентка открывается в шторке ClientDrawer, заказ — переходом на
 * /orders?open=<id> (карточку заказа по этому параметру открывает экран
 * «Заказы», D5).
 */
const isNumQuery = (s) => /^(#|№)?\s*\d+$/.test(s);

export default function GlobalSearch() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [res, setRes] = useState(null);
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState(null);
  const inputRef = useRef(null);
  const boxRef = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useOutside(boxRef, open, close);

  const q = value.trim();
  const active = q.length >= 2 || isNumQuery(q);

  useEffect(() => {
    const onKey = (e) => {
      const k = e.key || '';
      if ((e.ctrlKey || e.metaKey) && ['k', 'K', 'л', 'Л'].includes(k)) {
        e.preventDefault();
        if (inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!active) { setRes(null); return undefined; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      searchAll(q, ctl.signal)
        .then((d) => setRes(d))
        .catch((err) => { if (err.name !== 'AbortError') setRes({ items: [], error: err.message }); });
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, active]);

  const pick = (item) => {
    setOpen(false);
    setValue('');
    if (inputRef.current) inputRef.current.blur();
    if (item.kind === 'client') setClientId(item.id);
    else navigate(`/orders?open=${item.id}`);
  };

  const items = (res && res.items) || [];
  const closeDrawer = useCallback(() => setClientId(null), []);

  return (
    <div ref={boxRef} style={{ position: 'relative', flex: '1 1 360px', maxWidth: 520 }}>
      <span style={{ position: 'absolute', left: 11, top: 10, color: '#8A909C', display: 'flex' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
      </span>
      <input
        ref={inputRef}
        className="inp"
        type="search"
        aria-label="Поиск по всей базе"
        placeholder="Поиск: имя, почта, телефон, @ник или номер заказа"
        value={value}
        onChange={(e) => { setValue(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.stopPropagation(); if (value) setValue(''); else { setOpen(false); e.currentTarget.blur(); } }
          if (e.key === 'Enter' && items.length) { e.preventDefault(); pick(items[0]); }
        }}
        style={{ paddingLeft: 36, paddingRight: 64 }}
      />
      <span className="kbd hide-sm" style={{ position: 'absolute', right: 10, top: 10 }} aria-hidden="true">Ctrl K</span>
      {open && active && res && (
        <div className="menu" style={{ left: 0, right: 'auto', width: '100%', boxSizing: 'border-box' }}>
          {items.map((g) => (
            <button key={`${g.kind}-${g.id}`} type="button" className="menuitem" onClick={() => pick(g)}
              style={{ justifyContent: 'space-between', gap: 12 }}>
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontWeight: 600 }}>{g.title}</span>
                {g.sub && <span className="small muted cell">{g.sub}</span>}
              </span>
              <span className="tag">{g.kind === 'client' ? 'Клиент' : 'Заказ'}</span>
            </button>
          ))}
          {!items.length && <div className="small muted" style={{ padding: 10 }}>{res.error || 'Ничего не найдено.'}</div>}
        </div>
      )}
      <ClientDrawer id={clientId} onClose={closeDrawer} />
    </div>
  );
}
