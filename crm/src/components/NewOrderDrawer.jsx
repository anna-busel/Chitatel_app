import { useEffect, useState } from 'react';
import Drawer from './Drawer';
import { useToast } from './Toast';
import { useAuth } from '../auth/AuthContext';
import { createOrder, getClient, listClients, orderMeta } from '../api/crm';
import { money } from '../utils';
import { errText, PAY_METHODS } from './OrderDrawer';

/**
 * Новый заказ — шторка (CRM-PLAN D6), как DN в прототипе
 * (markup.html «DR.newo», component.js createOrder).
 *
 * preset: { clientId, mode } — из карточки клиентки («+ Заказ»,
 * «Выдать без оплаты» → mode 'free').
 * «Ссылка на оплату»: заказ создаётся «Не оплачен» со сроком N дней; сама
 * ссылка появится со страницами оплаты (E3), копировать пока нечего.
 * Промокод проверяет сервер при создании заказа.
 */

const MODES = [
  ['link', 'Ссылка на оплату', 'Клиентка оплатит сама. Ссылка появится со страницами оплаты, пока: счёт со сроком'],
  ['paid_manual', 'Оплата уже пришла', 'Перевод на карту, lava.top, bePaid: проводим сразу'],
  ['balance', 'С баланса', 'Списать с внутреннего баланса клиентки (только BYN)'],
  ['free', 'Без оплаты', 'Подарок, розыгрыш, перезачёт: с причиной'],
];
const CURS = ['BYN', 'RUB', 'USD', 'EUR', 'GEL'];
const DAYS = [['1', '1 день'], ['3', '3 дня'], ['7', '7 дней']];
const parseNum = (v) => parseFloat(String(v || '').replace(/\s/g, '').replace(',', '.'));
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function modeStyle(on) {
  return {
    font: 'inherit', color: 'var(--text)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2,
    alignItems: 'flex-start', textAlign: 'left', padding: '10px 12px', borderRadius: 8,
    border: `1px solid ${on ? 'var(--accent)' : 'var(--border-ctl)'}`, background: on ? '#F2F6FD' : 'var(--surface)',
    boxShadow: on ? 'inset 0 0 0 1px var(--accent)' : 'none',
  };
}

export default function NewOrderDrawer({ open, preset, onClose, onCreated }) {
  const toast = useToast();
  const { member } = useAuth();
  const [meta, setMeta] = useState(null);
  const [client, setClient] = useState(null); // { id, name, email, linked, balance }
  const [isNew, setIsNew] = useState(false);
  const [nc, setNc] = useState({ name: '', email: '', phone: '' });
  const [cq, setCq] = useState('');
  const [found, setFound] = useState([]);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const presetClient = preset && preset.clientId;
  const presetMode = preset && preset.mode;

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setClient(null);
    setIsNew(false);
    setNc({ name: '', email: '', phone: '' });
    setCq('');
    setFound([]);
    setError('');
    setF(null);
    (async () => {
      try {
        const [m, c] = await Promise.all([orderMeta(), presetClient ? getClient(presetClient) : null]);
        if (!alive) return;
        setMeta(m);
        if (c) setClient({ id: c.id, name: c.name || c.primaryEmail, email: c.primaryEmail, linked: c.linked, balance: c.balance });
        const p = m.products[0];
        setF({
          productId: p ? p.id : '', price: p && p.price !== null ? String(p.price) : '', cur: p ? p.cur : 'BYN',
          promo: '', gift: false, giftName: '', giftEmail: '', mode: presetMode || 'link', days: '3',
          method: 'transfer', account: m.accounts[0] || '', note: '', reason: '',
          managerId: member && m.managers.some((x) => x.id === member.id) ? member.id : '',
        });
      } catch (err) {
        if (alive) setError(errText(err));
      }
    })();
    return () => { alive = false; };
  }, [open, presetClient, presetMode, member]);

  useEffect(() => {
    const t = cq.trim();
    if (t.length < 2 || client || isNew) { setFound([]); return undefined; }
    let alive = true;
    const timer = setTimeout(() => {
      listClients({ q: t, limit: 6 })
        .then((d) => { if (alive) setFound(d.items); })
        .catch(() => { if (alive) setFound([]); });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [cq, client, isNew]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const product = meta && f ? meta.products.find((p) => p.id === f.productId) : null;
  const pickProduct = (e) => {
    const p = meta.products.find((x) => x.id === e.target.value);
    setF({ ...f, productId: e.target.value, price: p && p.price !== null ? String(p.price) : '', cur: p ? p.cur : f.cur });
  };

  const free = f && f.mode === 'free';
  const price = f ? parseNum(f.price) || 0 : 0;
  const total = free ? 0 : price;
  const cur = f ? f.cur : 'BYN';
  const balance = client ? client.balance : 0;

  const create = async () => {
    if (!client && !isNew) { toast('Выберите клиентку.'); return; }
    if (isNew && !EMAIL_RE.test(nc.email.trim())) { toast('Укажите почту новой клиентки.'); return; }
    if (!product) { toast('Выберите позицию.'); return; }
    if (!free && !(price > 0)) { toast('Укажите сумму.'); return; }
    if (free && !f.reason.trim()) { toast('Укажите причину выдачи без оплаты.'); return; }
    if (f.gift && !EMAIL_RE.test(f.giftEmail.trim())) { toast('Укажите почту получательницы подарка.'); return; }
    if (f.mode === 'balance') {
      if (cur !== 'BYN') { toast('С баланса: только в BYN.'); return; }
      if (isNew || total > balance + 0.001) { toast(`На балансе только ${money(isNew ? 0 : balance)}.`); return; }
    }
    if (f.mode === 'paid_manual' && f.method === 'transfer' && !f.account) { toast('Укажите, на какую карту пришёл перевод.'); return; }

    const body = { productId: f.productId, mode: f.mode, managerId: f.managerId || null };
    if (isNew) body.client = { name: nc.name.trim(), email: nc.email.trim(), phone: nc.phone.trim() || null };
    else body.clientId = client.id;
    if (!free) {
      body.price = price;
      body.cur = cur;
      if (f.promo.trim()) body.promoCode = f.promo.trim();
    }
    if (f.gift) body.gift = { name: f.giftName.trim(), email: f.giftEmail.trim() };
    if (f.mode === 'link') body.days = Number(f.days);
    if (f.mode === 'paid_manual') {
      body.method = f.method;
      if (f.method === 'transfer') body.account = f.account;
      body.note = f.note.trim() || null;
    }
    if (free) body.reason = f.reason.trim();

    setBusy(true);
    try {
      const o = await createOrder(body);
      if (o.status === 'confirm') toast(`Заказ #${o.num} создан. Перевод ждёт подтверждения Анны, доступ откроется после него.`);
      else if (o.status === 'new') toast(`Заказ #${o.num} создан, срок оплаты ${new Date(o.deadline).toLocaleDateString('ru-RU')}. Ссылка на оплату появится со страницами оплаты.`);
      else toast(`Заказ #${o.num} ${o.status === 'free' ? 'выдан' : 'оплачен'}. В приложении: ${o.app.text}.`);
      onCreated(o);
    } catch (err) {
      toast(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const grantLine = product
    ? `${product.grant}${f.gift ? ' (у получательницы)' : ((client && !client.linked) || isNew ? ' (после привязки к приложению)' : '')}`
    : '—';
  const createLabel = f && f.mode === 'link' ? 'Создать счёт' : (free ? 'Выдать доступ' : 'Провести оплату');

  return (
    <Drawer open={open} onClose={onClose} title="Новый заказ" label="Новый заказ">
      {error && <div className="auth-err" role="alert">{error}</div>}
      {!f && !error && <p className="muted">Загрузка…</p>}
      {f && (
        <>
          <div className="sec">
            <span className="sech">Клиент</span>
            {client && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <span style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 600 }}>{client.name}</span>
                  <span className="small muted">{client.email || '—'} · {client.linked ? 'приложение связано' : 'приложение не связано'}</span>
                </span>
                <button className="btn-s" type="button" onClick={() => setClient(null)}>Изменить</button>
              </div>
            )}
            {!client && !isNew && (
              <>
                <input className="inp" type="search" aria-label="Найти клиентку" placeholder="Имя, почта, телефон или @ник"
                  value={cq} onChange={(e) => setCq(e.target.value)} />
                {found.map((c) => (
                  <button key={c.id} type="button" className="rowbtn"
                    onClick={() => { setClient({ id: c.id, name: c.name || c.email, email: c.email, linked: c.linked, balance: c.balance }); setCq(''); }}
                    style={{ font: 'inherit', color: 'var(--text)', textAlign: 'left', border: '1px solid var(--border-soft)', background: 'var(--surface)', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 600 }}>{c.name || c.email}</span>
                    <span className="small muted">{c.email || '—'}{c.phone ? ` · ${c.phone}` : ''}</span>
                  </button>
                ))}
                <div><button className="lnk small" type="button" onClick={() => setIsNew(true)}>+ Новая клиентка</button></div>
              </>
            )}
            {isNew && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 8 }}>
                  <input className="inp" aria-label="Имя" placeholder="Имя" value={nc.name} maxLength={200} onChange={(e) => setNc({ ...nc, name: e.target.value })} />
                  <input className="inp" type="email" aria-label="Почта" placeholder="Почта (обязательно)" value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} />
                  <input className="inp" inputMode="tel" aria-label="Телефон" placeholder="Телефон" value={nc.phone} maxLength={40} onChange={(e) => setNc({ ...nc, phone: e.target.value })} />
                </div>
                <span className="small muted">Если клиентка с этой почтой уже есть, заказ попадёт к ней. Аккаунт приложения под этой почтой свяжется сам.</span>
                <div><button className="lnk small" type="button" onClick={() => setIsNew(false)}>Найти среди клиенток</button></div>
              </>
            )}
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={f.gift} onChange={set('gift')} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
              <span>Подарок другому человеку: платит эта клиентка, доступ получает другая</span>
            </label>
            {f.gift && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 8 }}>
                <input className="inp" aria-label="Имя получательницы" placeholder="Имя получательницы" value={f.giftName} maxLength={200} onChange={set('giftName')} />
                <input className="inp" type="email" aria-label="Почта получательницы" placeholder="Почта получательницы" value={f.giftEmail} onChange={set('giftEmail')} />
              </div>
            )}
          </div>

          <div className="sec">
            <span className="sech">Позиция</span>
            <select className="inp" aria-label="Позиция" value={f.productId} onChange={pickProduct}>
              {!meta.products.length && <option value="">Продуктов пока нет</option>}
              {meta.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <span className="small muted">В приложении: {product ? product.grant : '—'}</span>
            {!free && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 100px', gap: 8 }}>
                  <div><label className="lbl" htmlFor="nprice">Цена</label><input id="nprice" className="inp" inputMode="decimal" value={f.price} onChange={set('price')} /></div>
                  <div>
                    <label className="lbl" htmlFor="ncur">Валюта</label>
                    <select id="ncur" className="inp" value={f.cur} onChange={set('cur')}>{CURS.map((x) => <option key={x} value={x}>{x}</option>)}</select>
                  </div>
                </div>
                <input className="inp" aria-label="Промокод" placeholder="Промокод (скидка посчитается при создании)" value={f.promo} maxLength={40} onChange={set('promo')} />
              </>
            )}
          </div>

          <div className="sec">
            <span className="sech">Как оплачивает</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 8 }}>
              {MODES.map(([k, label, hint]) => (
                <button key={k} type="button" style={modeStyle(f.mode === k)} onClick={() => setF({ ...f, mode: k })}>
                  <span style={{ fontWeight: 600 }}>{label}</span>
                  <span className="small muted">{hint}</span>
                </button>
              ))}
            </div>
            {f.mode === 'link' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label className="small muted" htmlFor="ndays">Срок оплаты</label>
                <select id="ndays" className="inp" value={f.days} onChange={set('days')} style={{ width: 'auto' }}>
                  {DAYS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            )}
            {f.mode === 'paid_manual' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label className="small muted" htmlFor="npm">Способ</label>
                  <select id="npm" className="inp" value={f.method} onChange={set('method')} style={{ width: 'auto' }}>
                    {PAY_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  {f.method === 'transfer' && (
                    <select className="inp" aria-label="На какую карту" value={f.account} onChange={set('account')} style={{ width: 'auto' }}>
                      {!meta.accounts.length && <option value="">Карты не заданы в настройках</option>}
                      {meta.accounts.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  )}
                </div>
                <input className="inp" aria-label="Примечание" placeholder="Примечание: «Анна подтвердила в чате»" value={f.note} maxLength={300} onChange={set('note')} />
                {f.method === 'transfer' && meta.requireTransferConfirm && (
                  <span className="small muted">Перевод на карту подтверждает Анна в CRM, доступ откроется после подтверждения.</span>
                )}
              </div>
            )}
            {f.mode === 'balance' && (
              <span style={{ fontSize: 13, color: client && total > balance ? 'var(--danger)' : 'var(--muted)' }}>
                {client
                  ? `На балансе ${money(balance)}${total > balance ? `: не хватает ${money(total - balance)}` : ''}`
                  : 'Выберите клиентку'}
              </span>
            )}
            {free && (
              <input className="inp" aria-label="Причина" placeholder="Причина (обязательно): розыгрыш, подарок, перезачёт…" value={f.reason} maxLength={300} onChange={set('reason')} />
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label className="small muted" htmlFor="nmgr">Менеджер</label>
              <select id="nmgr" className="inp" value={f.managerId} onChange={set('managerId')} style={{ width: 'auto' }}>
                <option value="">Не назначен</option>
                {meta.managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>

          <div className="sec" style={{ background: '#F7F9FC', borderColor: '#D9E1EE' }}>
            <span className="sech">Итог</span>
            <div className="kv">
              <span className="muted">Клиент</span><span>{client ? client.name : (isNew ? nc.name || nc.email || '—' : '—')}</span>
              <span className="muted">Позиция</span><span>{product ? product.name : '—'}</span>
              <span className="muted">К оплате</span><span>{free ? '0 BYN' : money(total, cur)}{!free && f.promo.trim() ? ' (без учёта промокода)' : ''}</span>
              <span className="muted">В приложении</span><span>{grantLine}</span>
            </div>
            <div><button className="btn-p" type="button" disabled={busy} onClick={create}>{createLabel}</button></div>
          </div>
        </>
      )}
    </Drawer>
  );
}
