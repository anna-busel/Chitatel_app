import { useCallback, useEffect, useState } from 'react';
import Drawer from './Drawer';
import Soon from './Soon';
import { useToast } from './Toast';
import { useAuth } from '../auth/AuthContext';
import {
  addComment, balanceOp, clientHistory, getClient, linkClient, patchClient, unlinkClient,
} from '../api/crm';
import {
  avStyle, fmtD, initials, lastDay, localTime, mFull, mLabel, money, monthIdx, monthKey, orderStatus, pill,
} from '../utils';

/**
 * Карточка клиентки — шторка (CRM-PLAN D2), как DC в прототипе
 * (markup.html «DR.client», component.js). Вкладки Обзор / Заказы /
 * История / Комментарии.
 *
 * Неактивны «скоро»: «+ Заказ» и «Выдать без оплаты» (D6), «Написать»
 * (входящие, блок I), «+ Задача» и «В план продаж» (K), «Отправить
 * инструкцию для входа» (письма, F), Telegram-каналы (G4).
 * Кода активации нет (L5): привязка — по почте аккаунта приложения.
 */

const SOURCE = { gk: 'ГК', site: 'сайт', app: 'приложение', manual: 'вручную' };

function Tabs({ tab, setTab, card }) {
  const tabs = [
    ['overview', 'Обзор'],
    ['orders', `Заказы · ${card ? card.orders.length : 0}`],
    ['hist', 'История'],
    ['comments', `Комментарии · ${card ? card.comments.length : 0}`],
  ];
  return (
    <div role="tablist" className="dtabs">
      {tabs.map(([k, label]) => (
        <button key={k} type="button" role="tab" aria-selected={tab === k} className={`dtab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{label}</button>
      ))}
    </div>
  );
}

function Tags({ card, onSave }) {
  const [tag, setTag] = useState('');
  const add = () => {
    const t = tag.trim();
    if (!t) return;
    if (!card.tags.includes(t)) onSave(card.tags.concat(t), `Тег «${t}» добавлен.`);
    setTag('');
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {card.tags.map((t) => (
        <span key={t} className="tag">{t}
          <button type="button" className="tag-x" aria-label={`Снять тег ${t}`}
            onClick={() => onSave(card.tags.filter((x) => x !== t), `Тег «${t}» снят.`, card.tags)}>×</button>
        </span>
      ))}
      <input className="inp tag-inp" aria-label="Новый тег" placeholder="+ тег" value={tag} maxLength={40}
        onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
      {tag && <button className="btn-s" type="button" onClick={add} style={{ minHeight: 26, padding: '2px 8px' }}>Добавить</button>}
    </div>
  );
}

function ContactsEdit({ card, onCancel, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: card.name || '', phone: card.phone || '', city: card.city || '', country: card.country || '',
    telegram: card.telegram.username ? `@${card.telegram.username}` : '', whatsapp: card.whatsapp,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const on = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const save = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) { setErr('Введите имя'); return; }
    setSaving(true);
    try {
      const next = await patchClient(card.id, f);
      onSaved(next);
      toast('Данные сохранены.');
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSaving(false);
    }
  };
  const row = (k, label, props = {}) => (
    <label key={k} style={{ display: 'contents' }}>
      <span className="muted">{label}</span>
      <input className="inp" value={f[k]} onChange={on(k)} {...props} />
    </label>
  );
  return (
    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="kv" style={{ alignItems: 'center' }}>
        {row('name', 'Имя', { maxLength: 200 })}
        {row('phone', 'Телефон', { inputMode: 'tel', maxLength: 40 })}
        {row('telegram', 'Telegram', { placeholder: '@ник', maxLength: 64 })}
        {row('city', 'Город', { maxLength: 120 })}
        {row('country', 'Страна', { maxLength: 120 })}
        <span className="muted">WhatsApp</span>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={f.whatsapp} onChange={on('whatsapp')} /> есть WhatsApp
        </label>
      </div>
      {err && <span className="field-err" role="alert">{err}</span>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-p" type="submit" disabled={saving}>Сохранить</button>
        <button className="btn" type="button" onClick={onCancel}>Отмена</button>
      </div>
    </form>
  );
}

function Overview({ card, setCard, reload, canOrders }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [linkEmail, setLinkEmail] = useState('');
  const [linking, setLinking] = useState(false);
  const [amt, setAmt] = useState('');
  const [reason, setReason] = useState('');
  const [balBusy, setBalBusy] = useState(false);

  const app = card.app && !card.app.missing ? card.app : null;
  const cur = card.access.currentMonth;
  const curIdx = monthIdx(cur);
  const lastIdx = monthIdx(card.access.lastMonth);
  const ent = new Set([...(app ? app.clubMonths : []), ...card.access.legacyMonths]);
  const win = Array.from({ length: 12 }, (_, i) => monthKey(curIdx - 3 + i));
  const wa = card.phoneDigits && card.phoneDigits.length >= 7 ? `https://wa.me/${card.phoneDigits}` : null;

  let until;
  if (lastIdx !== null && lastIdx >= curIdx) {
    until = `Оплачено по ${mFull(card.access.lastMonth)} включительно${app && app.storeSubscription === 'apple' ? ' · автопродление App Store' : ''}${app && app.storeSubscription === 'google' ? ' · автопродление Google Play' : ''}`;
  } else if (lastIdx !== null) {
    until = `Доступ закончился: ${mFull(card.access.lastMonth)}`;
  } else {
    until = 'Доступа к клубу не было';
  }

  const link = async () => {
    const email = linkEmail.trim();
    if (!email) { toast('Укажите почту, под которой она вошла в приложение.'); return; }
    setLinking(true);
    try {
      const r = await linkClient(card.id, email);
      setLinkEmail('');
      await reload();
      toast(`Связано с ${r.email}. Открыто заказов: ${r.applied}.`);
    } catch (err) {
      toast(err.message);
    } finally {
      setLinking(false);
    }
  };

  const unlink = async () => {
    // eslint-disable-next-line no-alert
    if (!window.confirm('Отвязать аккаунт приложения? Доступ, выданный заказами этой клиентки, будет снят.')) return;
    try {
      const r = await unlinkClient(card.id);
      await reload();
      toast(`Аккаунт отвязан. Снято заказов: ${r.revoked}.`);
    } catch (err) {
      toast(err.message);
    }
  };

  const doBalance = async (op) => {
    const amount = parseFloat(String(amt).replace(',', '.'));
    if (!(amount > 0)) { toast('Укажите сумму больше нуля.'); return; }
    if (!reason.trim()) { toast('Укажите, за что пополнение или списание — это попадёт в историю.'); return; }
    if (op === 'spend' && amount > card.balance + 0.001) { toast(`На балансе только ${money(card.balance)}.`); return; }
    setBalBusy(true);
    try {
      const r = await balanceOp(card.id, op, amount, reason.trim());
      setCard({ ...card, balance: r.balance, balanceOps: [r.op, ...card.balanceOps] });
      setAmt('');
      setReason('');
      toast(op === 'topup' ? `Баланс пополнен на ${money(amount)}.` : `Списано ${money(amount)} с баланса.`);
    } catch (err) {
      toast(err.message);
    } finally {
      setBalBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="sec" style={{ padding: 0, gap: 0 }}>
        <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="sech">Задачи и следующий контакт</span>
          <Soon className="btn-s" hint="задачи — блок K">+ Задача</Soon>
        </div>
        <div className="small muted" style={{ padding: '0 16px 12px' }}>Следующий контакт не запланирован.</div>
      </div>

      <div className="sec">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span className="sech">Контакты</span>
          {canOrders && !editing && <button className="btn-s" type="button" onClick={() => setEditing(true)}>Изменить</button>}
        </div>
        {editing ? (
          <ContactsEdit card={card} onCancel={() => setEditing(false)} onSaved={(c) => { setCard(c); setEditing(false); }} />
        ) : (
          <div className="kv">
            <span className="muted">Почта (ГК / сайт)</span>
            <span style={{ overflowWrap: 'anywhere' }}>
              {card.emails.length
                ? card.emails.map((e) => `${e.email}${SOURCE[e.source] ? ` (${SOURCE[e.source]})` : ''}`).join(', ')
                : '—'}
            </span>
            <span className="muted">Телефон</span><span>{card.phone || '—'}</span>
            <span className="muted">Telegram</span><span>{card.telegram.username ? `@${card.telegram.username}` : '—'}</span>
            <span className="muted">Telegram-бот</span>
            <span style={{ color: card.telegram.botSubscribed ? 'var(--ok)' : 'var(--muted)' }}>
              {card.telegram.botSubscribed ? 'подписана — можно писать через бота' : 'не подписана'}
            </span>
            <span className="muted">WhatsApp</span>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {card.whatsapp ? `есть, ${card.phone || ''}` : 'нет'}
              {wa && <a className="btn-s" href={wa} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>Написать</a>}
            </span>
          </div>
        )}
      </div>

      <div className="sec">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span className="sech">Приложение</span>
          <span style={pill(card.linked ? 'ok' : 'warn')}>{card.linked ? 'Связан' : 'Не связан'}</span>
        </div>
        {card.linked ? (
          <>
            <div className="kv">
              <span className="muted">Почта в приложении</span>
              <span style={{ overflowWrap: 'anywhere' }}>
                {card.app && card.app.missing ? 'аккаунт не найден' : (app && app.email) || '—'}
                {app && app.deleted ? ' · аккаунт удалён' : ''}
              </span>
              <span className="muted">Последний вход</span>
              <span>{app && app.lastSeenAt ? fmtD(app.lastSeenAt, true) : 'нет данных'}</span>
            </div>
            {canOrders && <div><button className="btn-d" type="button" onClick={unlink}>Отвязать</button></div>}
          </>
        ) : (
          <>
            <p className="small muted">
              Пока аккаунт не связан, оплаты не открывают доступ в приложении. Доступ откроется сам, когда она войдёт
              в приложение под почтой оплаты. Или укажите почту, под которой она вошла.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Soon hint="письма — блок F">Отправить инструкцию для входа</Soon>
              {canOrders && (
                <div style={{ display: 'flex', gap: 6, flex: '1 1 260px' }}>
                  <input className="inp" type="email" aria-label="Почта в приложении" placeholder="почта в приложении"
                    value={linkEmail} onChange={(e) => setLinkEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); link(); } }} />
                  <button className="btn" type="button" disabled={linking} onClick={link}>Связать</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="sec">
        <span className="sech">Доступ к клубу</span>
        <span style={{ fontWeight: 500 }}>{until}</span>
        {card.access.legacyNote && <span className="small muted">{card.access.legacyNote}</span>}
        <div className="months">
          {win.map((k) => (
            <span key={k} className={`mcell${ent.has(k) ? ' on' : ''}${k === cur ? ' cur' : ''}`}>{mLabel(k)}</span>
          ))}
        </div>
        <span className="small muted">Синим — оплаченные месяцы, рамкой — текущий.</span>
        <span className="small">
          {app && app.inClubNow ? `Чат месяца открыт до ${lastDay(cur)}, потом закрывается.` : 'Чат месяца закрыт.'}{' '}
          {app && app.tier3
            ? 'Материалы оплаченных месяцев остаются навсегда (Тариф 3).'
            : 'Материалы месяца — на время доступа. Навсегда — покупкой разбора или Тарифом 3.'}
        </span>
        {app && app.tier2Now && (
          <span style={{ ...pill('ask'), alignSelf: 'flex-start' }}>Тариф 2: зум-встречи в этом месяце</span>
        )}
        <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="small" style={{ fontWeight: 600 }}>Telegram-каналы</span>
          <span className="small muted">Приём в каналы по оплатам и ручное добавление появятся с Telegram-ботом.</span>
          <div><Soon className="btn-s" hint="Telegram-бот — блок G">Отправить ссылки на каналы ещё раз</Soon></div>
        </div>
        <div className="kv">
          <span className="muted">Разборы</span>
          <span>{app && app.books.length ? app.books.map((b) => b.title).join(', ') : '—'}</span>
          <span className="muted">Пакеты</span>
          <span>{app && app.packages.length ? app.packages.map((p) => p.title).join(', ') : '—'}</span>
        </div>
      </div>

      <div className="sec">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="sech">Баланс</span>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{money(card.balance)}</span>
        </div>
        {card.balanceOps.map((x) => (
          <div key={x.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span className="small"><span className="muted">{fmtD(x.at)} · </span>{x.reason || '—'}{x.who ? <span className="muted"> · {x.who}</span> : null}</span>
            <span style={{ fontWeight: 600, whiteSpace: 'nowrap', color: x.amount > 0 ? 'var(--ok)' : 'var(--text)' }}>
              {x.amount > 0 ? '+' : '−'}{money(Math.abs(x.amount))}
            </span>
          </div>
        ))}
        {canOrders && (
          <div style={{ display: 'grid', gridTemplateColumns: '110px minmax(0,1fr) auto auto', gap: 6, alignItems: 'center' }}>
            <input className="inp" inputMode="decimal" aria-label="Сумма" placeholder="Сумма" value={amt} onChange={(e) => setAmt(e.target.value)} />
            <input className="inp" aria-label="За что" placeholder="За что (акция, перезачёт…)" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
            <button className="btn-s" type="button" disabled={balBusy} onClick={() => doBalance('topup')}>Пополнить</button>
            <button className="btn-s" type="button" disabled={balBusy} onClick={() => doBalance('spend')}>Списать</button>
          </div>
        )}
      </div>
    </div>
  );
}

function OrdersTab({ card }) {
  if (!card.orders.length) return <div className="sec"><div className="muted">Заказов нет.</div></div>;
  return (
    <div className="sec" style={{ padding: 0, gap: 0 }}>
      {card.orders.map((o) => {
        const [st, tone] = orderStatus(o);
        return (
          <div key={o.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '4px 12px', padding: '12px 16px', borderBottom: '1px solid var(--border-soft)' }}>
            <span className="cell" style={{ fontWeight: 600 }}>
              {o.product}{o.productUnmatched && <span className="unmatched">продукт не сопоставлен</span>}
            </span>
            <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{money(o.price, o.cur)}</span>
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="small muted">#{o.num} · {fmtD(o.createdAt)}</span>
              <span style={pill(tone)}>{st}</span>
              <span style={pill(o.app.tone)}>{o.app.text}</span>
              {o.clientId !== card.id && <span className="small muted">· подарок</span>}
            </span>
            <span />
          </div>
        );
      })}
    </div>
  );
}

function HistoryTab({ id }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    clientHistory(id).then((d) => { if (alive) setItems(d.items); }).catch((e) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [id]);
  if (err) return <p className="field-err">{err}</p>;
  if (!items) return <p className="muted">Загрузка…</p>;
  if (!items.length) return <p className="small muted">Событий пока нет.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {items.map((h) => (
        <div key={h.id} className="hist">
          <span className="small muted">{fmtD(h.at, true)}</span>
          <span className="small"><b>{h.who}</b> · {h.text}</span>
        </div>
      ))}
    </div>
  );
}

function CommentsTab({ card, setCard }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    try {
      const c = await addComment(card.id, t);
      setCard({ ...card, comments: [c, ...card.comments] });
      setText('');
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input className="inp" aria-label="Новый комментарий" placeholder="Подарок, депозит, договорённость… Enter — сохранить"
          value={text} maxLength={2000} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button className="btn" type="button" disabled={busy} onClick={add}>Добавить</button>
      </div>
      {card.comments.map((m) => (
        <div key={m.id} className="note">
          <span className="small muted">{m.who} · {fmtD(m.at, true)}</span>
          <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>
        </div>
      ))}
      {!card.comments.length && <p className="small muted">Комментариев пока нет.</p>}
    </div>
  );
}

export default function ClientDrawer({ id, onClose, onChanged }) {
  const { can } = useAuth();
  const toast = useToast();
  const [card, setCardState] = useState(null);
  const [tab, setTab] = useState('overview');
  const [error, setError] = useState('');
  const canOrders = can('orders');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setCardState(await getClient(id));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => {
    setCardState(null);
    setTab('overview');
    setError('');
    load();
  }, [load]);

  // Любое изменение в карточке — обновить и строку списка.
  const setCard = (c) => { setCardState(c); if (onChanged) onChanged(); };
  const reload = async () => { await load(); if (onChanged) onChanged(); };

  const saveTags = async (tags, message, undoTo) => {
    try {
      setCard(await patchClient(card.id, { tags }));
      toast(message, undoTo ? { undo: async () => setCard(await patchClient(card.id, { tags: undoTo })) } : undefined);
    } catch (err) {
      toast(err.message);
    }
  };

  const lt = card ? localTime(card.city, card.country) : null;
  const sub = card ? [card.city || card.country, card.since ? `клиентка с ${fmtD(card.since)}` : null].filter(Boolean).join(' · ') : '';

  const header = card ? (
    <>
      {lt && <span style={{ fontSize: 13, color: lt.night ? 'var(--danger)' : 'var(--muted)' }}>Сейчас у неё {lt.text}{lt.night ? ' · ночь' : ''}</span>}
      <Tags card={card} onSave={saveTags} />
      <div className="row-actions">
        {canOrders && (
          <>
            <Soon className="btn-p" hint="новый заказ — задача D6">+ Заказ</Soon>
            <Soon hint="новый заказ без оплаты — задача D6">Выдать без оплаты</Soon>
          </>
        )}
        <Soon hint="входящие — блок I">Написать ▾</Soon>
        <Soon hint="задачи — блок K">+ Задача</Soon>
        <Soon hint="план продаж — блок K">В план продаж</Soon>
      </div>
      <Tabs tab={tab} setTab={setTab} card={card} />
    </>
  ) : null;

  const title = card ? (
    <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <span className="av" style={avStyle(card.name, 44)}>{initials(card.name)}</span>
      <span>{card.name || card.primaryEmail || 'Без имени'}</span>
    </span>
  ) : (error ? 'Карточка' : 'Загрузка…');

  return (
    <Drawer open={Boolean(id)} onClose={onClose} title={title} subtitle={sub} header={header}
      label={card ? `Карточка: ${card.name}` : 'Карточка клиентки'}>
      {error && <div className="auth-err" role="alert">{error}</div>}
      {card && tab === 'overview' && <Overview card={card} setCard={setCard} reload={reload} canOrders={canOrders} />}
      {card && tab === 'orders' && <OrdersTab card={card} />}
      {card && tab === 'hist' && <HistoryTab id={card.id} />}
      {card && tab === 'comments' && <CommentsTab card={card} setCard={setCard} />}
    </Drawer>
  );
}
