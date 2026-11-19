import { useCallback, useEffect, useState } from 'react';
import { useToast } from './Toast';
import { mergedText } from './DupBanner';
import { listDuplicates, mergeClient, undoMerge } from '../api/crm';
import { money, pill, plural } from '../utils';

/**
 * «Дубли» на экране «Клиенты» (CRM-PLAN D3): группы карточек с тем же
 * телефоном или общей почтой. Выбираете, какая карточка остаётся, —
 * «Объединить» вливает в неё остальные. Тост с «Отменить».
 */

const PAGE = 20;
const UNDO_TOAST_MS = 10000;

const reasonText = (r) => (r.type === 'phone' ? `тот же телефон ${r.value}` : `та же почта ${r.value}`);

// По умолчанию остаётся связанная с приложением, потом с большим числом заказов.
const defaultKeep = (clients) =>
  clients.slice().sort((a, b) => (b.linked - a.linked) || (b.orders - a.orders) || (b.balance - a.balance))[0].id;

function Group({ g, canOrders, busy, onMerge, onOpen }) {
  const [keep, setKeep] = useState(() => defaultKeep(g.clients));
  const twoApps = g.clients.filter((c) => c.linked).length > 1;
  return (
    <div className="dupgroup">
      <span className="small muted">{g.reasons.map(reasonText).join(' · ')}</span>
      {g.clients.map((c) => (
        <label key={c.id} className="dupclient">
          <input type="radio" name={`keep-${g.key}`} checked={keep === c.id} disabled={!canOrders}
            aria-label={`Оставить карточку ${c.name || c.email || ''}`} onChange={() => setKeep(c.id)} />
          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <button className="lnk cell" type="button" style={{ fontWeight: 600, textAlign: 'left' }} onClick={() => onOpen(c.id)}>
              {c.name || 'Без имени'}
            </button>
            <span className="cell small muted">{[c.email, c.phone].filter(Boolean).join(' · ') || '—'}</span>
          </span>
          <span className="small">
            {c.orders} {plural(c.orders, 'заказ', 'заказа', 'заказов')}{c.balance ? ` · ${money(c.balance)}` : ''}
          </span>
          <span style={pill(c.linked ? 'ok' : 'mute')}>{c.linked ? 'в приложении' : 'не связана'}</span>
          <span className="small muted">{keep === c.id ? 'остаётся' : ''}</span>
        </label>
      ))}
      {twoApps && (
        <span className="small" style={{ color: 'var(--danger)' }}>
          Несколько карточек связаны с разными аккаунтами приложения. Сначала отвяжите лишний аккаунт в карточке.
        </span>
      )}
      {canOrders && (
        <div>
          <button className="btn" type="button" disabled={busy} onClick={() => onMerge(g, keep)}>Объединить</button>
        </div>
      )}
    </div>
  );
}

export default function DupGroups({ canOrders, onOpen, onChanged, refreshKey }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await listDuplicates({ page, limit: PAGE }));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [page]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const refresh = async () => {
    await load();
    if (onChanged) onChanged();
  };

  const doMerge = async (g, keep) => {
    setBusy(true);
    const done = [];
    let failed = '';
    try {
      for (const c of g.clients) {
        if (c.id !== keep) done.push(await mergeClient(c.id, keep));
      }
    } catch (err) {
      failed = err.message;
    }
    setBusy(false);
    if (!done.length) { toast(failed); return; }
    await refresh();
    const ids = done.map((r) => r.mergeId).filter(Boolean);
    toast(`${mergedText(done)}${failed ? ` Не все: ${failed}` : ''}`, {
      duration: UNDO_TOAST_MS,
      undo: ids.length === done.length
        ? async () => {
          for (const id of ids.slice().reverse()) await undoMerge(id);
          await refresh();
        }
        : undefined,
    });
  };

  if (error) return <div className="auth-err" role="alert">{error} <button className="lnk" type="button" onClick={load}>Повторить</button></div>;
  if (!data) return <p className="muted">Ищем дубли…</p>;
  if (!data.items.length) return <p className="small muted">Дублей не нашли: нет карточек с одинаковым телефоном или почтой.</p>;

  const pages = Math.max(1, Math.ceil(data.total / PAGE));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p className="small muted">
        Найдено групп: {data.total}. Отметьте карточку, которая останется. В неё перейдут заказы, баланс, теги,
        комментарии и почты, остальные скроются из списка.
      </p>
      {data.items.map((g) => (
        <Group key={g.key} g={g} canOrders={canOrders} busy={busy} onMerge={doMerge} onOpen={onOpen} />
      ))}
      {pages > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-s" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Назад</button>
          <span className="small muted">{page} из {pages}</span>
          <button className="btn-s" type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Дальше</button>
        </div>
      )}
    </div>
  );
}
