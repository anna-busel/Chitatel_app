import { useEffect, useState } from 'react';
import { useToast } from './Toast';
import { clientDuplicates, mergeClient, undoMerge } from '../api/crm';
import { plural } from '../utils';

/**
 * «Возможные дубли» в карточке клиентки (CRM-PLAN D3) — как DC.dup в
 * прототипе (markup.html): жёлтая плашка «Возможный дубль: …, тот же
 * телефон», кнопки «Посмотреть» и «Объединить сюда». Дубль вливается в
 * открытую карточку; тост с «Отменить».
 */

const REASON = { phone: 'тот же телефон', email: 'та же почта' };
const UNDO_TOAST_MS = 10000;

export function mergedText(results) {
  const orders = results.reduce((s, r) => s + ((r.moved && r.moved.orders) || 0), 0);
  let text = `Дубли объединены. Заказов перенесено: ${orders}.`;
  const applied = results.reduce((s, r) => s + (r.applied || 0), 0);
  if (applied) text += ` Открыто в приложении: ${applied} ${plural(applied, 'заказ', 'заказа', 'заказов')}.`;
  return text;
}

export default function DupBanner({ card, canOrders, onOpen, onMerged }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    clientDuplicates(card.id)
      .then((d) => { if (alive) setItems(d.items || []); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [card.id, tick]);

  if (!items.length) return null;

  const refresh = async () => {
    setTick((t) => t + 1);
    if (onMerged) await onMerged();
  };

  const mergeHere = async (dup) => {
    setBusy(true);
    try {
      const r = await mergeClient(dup.id, card.id);
      await refresh();
      toast(mergedText([r]), {
        duration: UNDO_TOAST_MS,
        undo: r.mergeId ? async () => { await undoMerge(r.mergeId); await refresh(); } : undefined,
      });
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dupbox" role="note" aria-label="Возможные дубли">
      {items.map((d) => (
        <div key={d.id} className="duprow">
          <span className="small">
            Возможный дубль: {d.name || 'без имени'}{d.email ? ` · ${d.email}` : ''}
            {' '}({d.reasons.map((x) => REASON[x] || x).join(', ')}
            {d.orders ? `, заказов: ${d.orders}` : ''}
            {d.linked ? ', связана с приложением' : ''})
          </span>
          <span style={{ display: 'flex', gap: 6 }}>
            {onOpen && <button className="btn-s" type="button" onClick={() => onOpen(d.id)}>Посмотреть</button>}
            {canOrders && (
              <button className="btn-s" type="button" disabled={busy} onClick={() => mergeHere(d)}>Объединить сюда</button>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
