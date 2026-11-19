import { useCallback, useEffect, useState } from 'react';
import Drawer from './Drawer';
import Soon from './Soon';
import { useToast } from './Toast';
import { useAuth } from '../auth/AuthContext';
import {
  addOrderComment, addOrderPayment, applyOrderPromo, confirmOrderPayment, deleteOrderPayment, fakeOrder, getOrder,
  orderMeta, patchOrder, refundOrder, restoreOrder,
} from '../api/crm';
import { fmtD, money, orderStatus, pill } from '../utils';

/**
 * Карточка заказа — шторка (CRM-PLAN D5), как DO в прототипе
 * (markup.html «DR.order», component.js).
 *
 * Позиция и цена меняются только до первого платежа (решение 28.10).
 * «Изменить заказ» после оплаты — удаление ошибочного платежа с причиной.
 * Заказы App Store / Google Play — только просмотр и комментарии.
 * Неактивны «скоро»: «Скопировать ссылку на оплату» (страницы оплаты, E3),
 * «Отправить на почту» и «Отправить письмо после оплаты ещё раз» (письма, F).
 */

/** Текст ошибки API: первое поле из details (ошибки формы) или message. */
export function errText(err) {
  const d = err && err.details ? Object.values(err.details).find(Boolean) : null;
  return d || (err && err.message) || 'Не получилось, попробуйте ещё раз';
}

export const PAY_METHODS = [['transfer', 'Перевод на карту'], ['lava', 'lava.top'], ['bepaid', 'bePaid']];
const parseNum = (v) => parseFloat(String(v || '').replace(/\s/g, '').replace(',', '.'));
const dayInput = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

function chipStyle(on) {
  return {
    font: 'inherit', fontSize: 13, fontWeight: 600, borderRadius: 999, padding: '5px 12px', minHeight: 32, cursor: 'pointer',
    border: `1px solid ${on ? 'var(--accent)' : 'var(--border-ctl)'}`, background: on ? 'var(--accent)' : 'var(--surface)',
    color: on ? '#FFFFFF' : 'var(--text)',
  };
}

function Payments({ o, meta, edit, canOrders, canConfirm, act }) {
  const toast = useToast();
  const [amt, setAmt] = useState(String(o.left || ''));
  const [method, setMethod] = useState('transfer');
  const [account, setAccount] = useState((meta && meta.accounts[0]) || '');
  const [note, setNote] = useState('');
  const [del, setDel] = useState(null);
  const [delReason, setDelReason] = useState('');

  useEffect(() => { setAmt(String(o.left || '')); }, [o.left]);
  useEffect(() => { if (!account && meta && meta.accounts[0]) setAccount(meta.accounts[0]); }, [meta, account]);

  const add = async () => {
    const amount = parseNum(amt);
    if (!(amount > 0)) { toast('Укажите сумму платежа.'); return; }
    if (amount > o.left + 0.001) { toast(`Сумма больше остатка (${money(o.left, o.cur)}).`); return; }
    if (method === 'balance' && amount > o.client.balance + 0.001) { toast(`На балансе только ${money(o.client.balance)}.`); return; }
    const body = { amount, method, note: note.trim() || null };
    if (method === 'transfer') body.account = account || null;
    const next = await act(() => addOrderPayment(o.id, body));
    if (!next) return;
    setNote('');
    const p = next.payments[next.payments.length - 1];
    if (p && p.pending) toast('Перевод записан. Анна подтвердит, что деньги пришли, тогда откроется доступ.');
    else if (next.status === 'paid') toast(`Заказ #${next.num} оплачен. В приложении: ${next.app.text}.`);
    else toast(`Платёж принят. Осталось ${money(next.left, next.cur)}.`);
  };

  const remove = async () => {
    if (delReason.trim().length < 2) { toast('Укажите причину удаления платежа.'); return; }
    const next = await act(() => deleteOrderPayment(o.id, del, delReason.trim()));
    if (!next) return;
    setDel(null);
    setDelReason('');
    toast('Платёж удалён. Статус заказа пересчитан.');
  };

  const confirm = async (pid) => {
    const next = await act(() => confirmOrderPayment(o.id, pid));
    if (next) toast(`Перевод подтверждён. ${next.status === 'paid' ? `В приложении: ${next.app.text}.` : `Осталось ${money(next.left, next.cur)}.`}`);
  };

  const methods = [...PAY_METHODS];
  if (o.cur === 'BYN') methods.push(['balance', `С баланса · ${money(o.client ? o.client.balance : 0)}`]);
  const accounts = (meta && meta.accounts) || [];

  return (
    <div className="sec">
      <span className="sech">Платежи</span>
      {o.payments.map((p) => (
        <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>{p.methodLabel}<span className="small muted">{p.account ? ` → ${p.account}` : ''}{p.note ? ` · ${p.note}` : ''} · {fmtD(p.at)}{p.by ? ` · ${p.by}` : ''}</span></span>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {edit && canOrders && del !== p.id && <button className="btn-d" type="button" onClick={() => { setDel(p.id); setDelReason(''); }}>Удалить</button>}
              {p.pending && !canConfirm && <span style={pill('ask')}>ждёт подтверждения Анны</span>}
              {p.pending && canConfirm && !o.readOnly && (
                <button className="btn-s" type="button" onClick={() => confirm(p.id)} style={{ borderColor: 'var(--ok)', color: 'var(--ok)' }}>Деньги пришли</button>
              )}
              <span style={{ fontWeight: 600 }}>{money(p.amount, p.cur)}</span>
            </span>
          </div>
          {del === p.id && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <input className="inp" style={{ flex: '1 1 220px' }} aria-label="Причина удаления" placeholder="Причина (обязательно): внесли дважды, ошибка суммы…"
                value={delReason} maxLength={300} onChange={(e) => setDelReason(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); remove(); } }} />
              <button className="btn-d" type="button" onClick={remove}>Удалить платёж</button>
              <button className="btn-s" type="button" onClick={() => setDel(null)}>Отмена</button>
            </div>
          )}
        </div>
      ))}
      {!o.payments.length && <span className="small muted">Платежей ещё не было.</span>}
      {o.actions.pay && canOrders && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '130px minmax(0,1fr) auto', gap: 6, alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--border-soft)' }}>
            <input className="inp" inputMode="decimal" aria-label="Сумма платежа" value={amt} onChange={(e) => setAmt(e.target.value)} />
            <select className="inp" aria-label="Способ" value={method} onChange={(e) => setMethod(e.target.value)}>
              {methods.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button className="btn-p" type="button" onClick={add}>Добавить платёж</button>
          </div>
          {method === 'transfer' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,220px) minmax(0,1fr)', gap: 6 }}>
                <select className="inp" aria-label="На какую карту" value={account} onChange={(e) => setAccount(e.target.value)}>
                  {!accounts.length && <option value="">Карты не заданы в настройках</option>}
                  {accounts.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
                <input className="inp" aria-label="Примечание" placeholder="Примечание: «Анна подтвердила в чате»" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
              </div>
              <span className="small muted">
                {meta && meta.requireTransferConfirm
                  ? 'Перевод на карту подтверждает Анна в CRM, доступ откроется после подтверждения.'
                  : 'Укажите, куда пришли деньги. Подтверждение Анны можно записать в примечание.'}
              </span>
            </>
          )}
          {method !== 'transfer' && (
            <input className="inp" aria-label="Примечание" placeholder="Примечание" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          )}
          <span className="small muted">Можно частями: заказ станет «Оплачен», когда сумма платежей дойдёт до итога. Доступ откроется в этот момент (при рассрочке: после первого платежа).</span>
        </>
      )}
    </div>
  );
}

function Refund({ o, act }) {
  const toast = useToast();
  const { can } = useAuth();
  const [mode, setMode] = useState('money');
  const [amt, setAmt] = useState(String(o.paid || ''));
  const [reason, setReason] = useState('');

  const doRefund = async () => {
    const amount = parseNum(amt);
    if (!(amount > 0) || amount > o.paid + 0.001) { toast(`Сумма возврата: от 0 до ${money(o.paid, o.cur)}.`); return; }
    if (!reason.trim()) { toast('Укажите причину возврата.'); return; }
    if (mode === 'balance' && o.cur !== 'BYN') { toast('Перезачесть на баланс можно только заказ в BYN.'); return; }
    const next = await act(() => refundOrder(o.id, { amount, mode, reason: reason.trim() }));
    if (next) {
      toast(`${mode === 'balance' ? 'Перезачёт на баланс' : 'Возврат денег'} оформлен. Доступ по заказу #${next.num} закрыт${mode === 'balance' ? `, ${money(amount)} на балансе.` : '.'}`);
    }
  };

  return (
    <div className="sec">
      <span className="sech">Возврат или перезачёт</span>
      {can('refund') ? (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" style={chipStyle(mode === 'money')} onClick={() => setMode('money')}>Вернуть деньги</button>
            {o.cur === 'BYN' && <button type="button" style={chipStyle(mode === 'balance')} onClick={() => setMode('balance')}>Перезачесть на баланс</button>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '130px minmax(0,1fr) auto', gap: 6, alignItems: 'center' }}>
            <input className="inp" inputMode="decimal" aria-label="Сумма" value={amt} onChange={(e) => setAmt(e.target.value)} />
            <input className="inp" aria-label="Причина" placeholder="Причина (обязательно)" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
            <button className="btn-d" type="button" onClick={doRefund} style={{ minHeight: 38 }}>Оформить</button>
          </div>
          <span className="small muted">Доступ по заказу закроется. Перезачёт кладёт сумму на баланс клиентки (только BYN).</span>
        </>
      ) : (
        <span className="small muted">Возвраты оформляют владелец и администратор.</span>
      )}
    </div>
  );
}

function Comments({ o, setO }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      const c = await addOrderComment(o.id, t);
      setO({ ...o, comments: [c, ...o.comments] });
      setText('');
    } catch (err) {
      toast(errText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="sec">
      <span className="sech">Комментарии к заказу</span>
      <div style={{ display: 'flex', gap: 6 }}>
        <input className="inp" aria-label="Комментарий к заказу" placeholder="Нестандартная оплата, договорённость… Enter — сохранить"
          value={text} maxLength={2000} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button className="btn" type="button" disabled={busy} onClick={add}>Добавить</button>
      </div>
      {o.comments.map((m) => (
        <div key={m.id} className="note">
          <span className="small muted">{m.who} · {fmtD(m.at, true)}</span>
          <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>
        </div>
      ))}
      {!o.comments.length && <span className="small muted">Комментариев нет.</span>}
    </div>
  );
}

export default function OrderDrawer({ id, onClose, onChanged, onOpenClient }) {
  const toast = useToast();
  const { can } = useAuth();
  const [o, setO] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState(false);
  const [fakeAsk, setFakeAsk] = useState(false);
  const [price, setPrice] = useState('');
  const [promo, setPromo] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const canOrders = can('orders');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [card, m] = await Promise.all([getOrder(id), orderMeta()]);
      setO(card);
      setMeta(m);
      setError('');
    } catch (err) {
      setError(errText(err));
    }
  }, [id]);

  useEffect(() => {
    setO(null);
    setEdit(false);
    setFakeAsk(false);
    setError('');
    load();
  }, [load]);

  useEffect(() => {
    if (!o) return;
    setPrice(String(o.price));
    setPromo(o.promoCode || '');
    setNote(o.note || '');
  }, [o]);

  /** Выполнить действие: новая карточка заказа или null (ошибка — тостом). */
  const act = async (fn) => {
    setBusy(true);
    try {
      const next = await fn();
      setO(next);
      if (onChanged) onChanged();
      return next;
    } catch (err) {
      toast(errText(err));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const patch = async (body, message) => {
    const next = await act(() => patchOrder(o.id, body));
    if (next && message) toast(message);
  };

  const savePrice = () => {
    const v = parseNum(price);
    if (!(v >= 0)) { toast('Цена должна быть числом.'); return; }
    patch({ price: v }, 'Цена обновлена.');
  };
  const doPromo = async () => {
    if (!promo.trim()) { toast('Введите промокод.'); return; }
    const next = await act(() => applyOrderPromo(o.id, promo.trim()));
    if (next) toast(`Промокод ${next.promoCode} применён: −${money(next.discount, next.cur)}.`);
  };
  const doFake = async () => {
    const next = await act(() => fakeOrder(o.id));
    setFakeAsk(false);
    if (next) toast(`Заказ #${next.num} помечен как ложный.`);
  };
  const doRestore = async () => {
    const next = await act(() => restoreOrder(o.id));
    if (next) toast(`Заказ #${next.num} возвращён в работу.`);
  };

  const st = o ? orderStatus(o) : null;
  const unpaid = o && ['new', 'partial'].includes(o.status) && !o.readOnly;
  const products = (meta && meta.products) || [];
  const productOpts = o && o.productId && !products.some((p) => p.id === o.productId)
    ? [{ id: o.productId, name: o.product }, ...products]
    : products;
  const managers = (meta && meta.managers) || [];
  const managerOpts = o && o.managerId && !managers.some((m) => m.id === o.managerId)
    ? [{ id: o.managerId, name: o.managerName || 'менеджер' }, ...managers]
    : managers;

  const title = o ? (
    <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <span>Заказ #{o.num}</span>
      <span style={pill(st[1])}>{st[0]}</span>
    </span>
  ) : (error ? 'Заказ' : 'Загрузка…');

  const header = o ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 14 }}>
      {o.readOnly && (
        <span className="small" style={{ color: '#7A4A0B' }}>
          {o.store ? 'Заказ из App Store или Google Play: доступ ведёт стор.' : 'Заказ перенесён из админки: доступ ведёт админка.'} Здесь можно только комментировать.
        </span>
      )}
      {!o.readOnly && (o.status === 'paid' || o.status === 'free') && (
        <div><Soon hint="письма — блок F">Отправить письмо после оплаты ещё раз</Soon></div>
      )}
      {unpaid && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Soon hint="страницы оплаты — задача E3">Скопировать ссылку на оплату</Soon>
          <Soon hint="письма — блок F">Отправить на почту</Soon>
          {canOrders && o.actions.fake && !fakeAsk && (
            <button className="btn-d" type="button" onClick={() => setFakeAsk(true)} style={{ minHeight: 38 }}>Пометить ложным…</button>
          )}
        </div>
      )}
      {fakeAsk && (
        <div style={{ padding: '12px 14px', background: '#FDF3F0', border: '1px solid #F2D3CA', borderRadius: 8, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="small">Пометить заказ #{o.num} ложным? Он уйдёт из неоплаченных.</span>
          <span style={{ display: 'flex', gap: 6 }}>
            <button className="btn-d" type="button" disabled={busy} onClick={doFake}>Да, ложный</button>
            <button className="btn-s" type="button" onClick={() => setFakeAsk(false)}>Отмена</button>
          </span>
        </div>
      )}
      {canOrders && !edit && o.actions.deletePayments && o.payments.length > 0 && (
        <div><button className="btn" type="button" onClick={() => setEdit(true)}>Изменить заказ</button></div>
      )}
      {canOrders && o.actions.restore && (
        <div><button className="btn" type="button" disabled={busy} onClick={doRestore}>Вернуть в работу</button></div>
      )}
      {edit && (
        <div style={{ padding: '12px 14px', background: '#FFF6E8', border: '1px solid #F0D9AE', borderRadius: 8, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="small">Режим правки: можно удалить ошибочный платёж. Позицию и цену после первого платежа менять нельзя. Все изменения попадут в историю.</span>
          <button className="btn-p" type="button" onClick={() => setEdit(false)}>Готово</button>
        </div>
      )}
    </div>
  ) : null;

  const editItem = o && o.actions.editItem && canOrders;
  const editFields = o && o.actions.editFields && canOrders;

  return (
    <Drawer open={Boolean(id)} onClose={onClose} title={title}
      subtitle={o ? `Создан ${fmtD(o.createdAt)} · ${o.sourceLabel}` : ''} header={header}
      label={o ? `Заказ #${o.num}` : 'Карточка заказа'}>
      {error && <div className="auth-err" role="alert">{error}</div>}
      {o && (
        <>
          <div className="sec">
            <div className="kv" style={{ alignItems: 'center' }}>
              <span className="muted">Клиент</span>
              <span>
                {onOpenClient
                  ? <button className="lnk" type="button" onClick={() => onOpenClient(o.clientId)}>{o.clientName}</button>
                  : o.clientName}
                {o.clientEmail ? <span className="small muted"> · {o.clientEmail}</span> : null}
              </span>
              {o.giftInfo && (
                <>
                  <span className="muted">Подарок для</span>
                  <span>
                    {o.giftInfo.name ? `${o.giftInfo.name} · ` : ''}{o.giftInfo.email || '—'}
                    <span className="small muted"> · доступ получит она{o.giftInfo.linked ? '' : ', когда войдёт в приложение под этой почтой'}</span>
                  </span>
                </>
              )}
              <span className="muted">Оплата</span><span>{o.sourceLabel}</span>
              <span className="muted">Срок оплаты</span>
              <span>
                {editFields && unpaid ? (
                  <input className="inp" type="date" aria-label="Срок оплаты" style={{ maxWidth: 180 }} value={dayInput(o.deadline)}
                    onChange={(e) => patch({ deadline: e.target.value || null }, 'Срок оплаты изменён.')} />
                ) : (o.deadline ? fmtD(o.deadline) : '—')}
              </span>
              <span className="muted">Менеджер</span>
              <span>
                {editFields ? (
                  <select className="inp" aria-label="Менеджер" style={{ maxWidth: 260 }} value={o.managerId || ''}
                    onChange={(e) => patch({ managerId: e.target.value || null }, 'Менеджер изменён.')}>
                    <option value="">Не назначен</option>
                    {managerOpts.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                ) : (o.managerName || '—')}
              </span>
              <span className="muted">Теги</span><span>{o.tags.length ? o.tags.join(', ') : '—'}</span>
              <span className="muted">Заметка</span>
              <span>
                {editFields ? (
                  <span style={{ display: 'flex', gap: 6 }}>
                    <input className="inp" aria-label="Заметка" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
                    {note !== (o.note || '') && <button className="btn-s" type="button" disabled={busy} onClick={() => patch({ note: note.trim() || null }, 'Заметка сохранена.')}>Сохранить</button>}
                  </span>
                ) : (o.note || '—')}
              </span>
            </div>
          </div>

          <div className="sec">
            <span className="sech">Позиция</span>
            <select className="inp" aria-label="Позиция" value={o.productId || ''} disabled={!editItem || busy}
              onChange={(e) => patch({ productId: e.target.value }, 'Позиция изменена.')}>
              {!o.productId && <option value="">{o.product}</option>}
              {productOpts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <span className="small muted">В приложении: {o.productInfo ? o.productInfo.grant : 'не связано'}{o.productInfo && o.productInfo.accessOnFirstPayment ? ' · рассрочка: доступ после первого платежа' : ''}</span>
            {editItem && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 8 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="inp" inputMode="decimal" aria-label="Цена" value={price} onChange={(e) => setPrice(e.target.value)} />
                  <button className="btn-s" type="button" disabled={busy} onClick={savePrice}>Сохранить цену</button>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="inp" aria-label="Промокод" placeholder="Промокод" value={promo} maxLength={40} onChange={(e) => setPromo(e.target.value)} />
                  <button className="btn-s" type="button" disabled={busy} onClick={doPromo}>Применить</button>
                </div>
              </div>
            )}
            {!o.readOnly && !o.actions.editItem && o.payments.length > 0 && (
              <span className="small muted">Позицию и цену нельзя менять после первого платежа.</span>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 12px', paddingTop: 6, borderTop: '1px solid var(--border-soft)' }}>
              <span className="muted">Сумма</span><span>{money(o.price, o.cur)}</span>
              {o.discount > 0 && (
                <>
                  <span className="muted">Скидка</span>
                  <span style={{ color: 'var(--ok)' }}>−{money(o.discount, o.cur)}{o.promoCode ? ` · ${o.promoCode}` : ''}</span>
                </>
              )}
              <span style={{ fontWeight: 600 }}>Итого</span><span style={{ fontWeight: 600 }}>{money(o.total, o.cur)}</span>
              <span className="muted">Оплачено</span><span>{money(o.paid, o.cur)}</span>
              {o.pending > 0 && (
                <>
                  <span className="muted">Ждёт подтверждения</span><span>{money(o.pending, o.cur)}</span>
                </>
              )}
              {o.left > 0.001 && (
                <>
                  <span style={{ fontWeight: 600, color: '#7A4A0B' }}>Осталось</span>
                  <span style={{ fontWeight: 600, color: '#7A4A0B' }}>{money(o.left, o.cur)}</span>
                </>
              )}
            </div>
          </div>

          <Payments o={o} meta={meta} edit={edit} canOrders={canOrders} canConfirm={can('confirm')} act={act} />

          <div className="sec">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <span className="sech">В приложении</span>
              <span style={pill(o.app.tone)}>{o.app.text}</span>
            </div>
          </div>

          {o.refund && (
            <div className="sec" style={{ background: '#FDF3F0', borderColor: '#F2D3CA' }}>
              <span className="sech">Возврат</span>
              <span className="small">
                {o.refund.mode === 'balance' ? 'Перезачтено на баланс ' : 'Возвращено '}{money(o.refund.amount, o.cur)} · {o.refund.reason} · {fmtD(o.refund.at)}
              </span>
            </div>
          )}
          {o.actions.refund && <Refund key={o.id} o={o} act={act} />}

          <Comments o={o} setO={setO} />

          <div className="sec">
            <span className="sech">История</span>
            {o.history.map((h, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '110px minmax(0,1fr)', gap: 10 }}>
                <span className="small muted">{fmtD(h.at, true)}</span>
                <span className="small"><b>{h.who}</b> · {h.text}</span>
              </div>
            ))}
            {!o.history.length && <span className="small muted">Пока пусто.</span>}
          </div>
        </>
      )}
    </Drawer>
  );
}
