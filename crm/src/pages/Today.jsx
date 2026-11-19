import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ClientDrawer from '../components/ClientDrawer';
import Soon from '../components/Soon';
import { useAuth } from '../auth/AuthContext';
import { getToday } from '../api/crm';
import { fmtD, money, orderStatus, pill } from '../utils';

/**
 * «Сегодня» (CRM-PLAN D7) — экран «Сегодня» прототипа (markup.html,
 * «СЕГОДНЯ»; T в component.js). Данные — GET /api/crm/today.
 *
 * KPI — как в плане: неоплаченные счета, оплаты без привязки к приложению,
 * входящие без ответа, заявки в каналы. Блоки: мои задачи, переводы ждут
 * подтверждения, ждут оплаты, оплатили — не связаны, заявки в каналы,
 * проверка App Store (C2, L8), последние оплаты, журнал за сутки.
 *
 * Клиентка — шторка ClientDrawer; заказ — /orders?open=<id> (карточка
 * заказа, D5). Неактивны «скоро»: отметка задачи (K), ссылка на оплату (E),
 * инструкция для входа (письма, F), одобрение заявок (бот, G).
 * Кода активации нет (L5).
 */
const WD = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
const MONG = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const dateLine = (d) => `${WD[d.getDay()]}, ${d.getDate()} ${MONG[d.getMonth()]}`;

const ROW = { padding: '13px 18px', borderBottom: '1px solid #ECEEF2', display: 'flex', flexDirection: 'column', gap: 6 };
const LINE = { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' };
const ACTS = { display: 'flex', flexWrap: 'wrap', gap: 6 };
const EMPTY = { padding: 18 };

function Card({ id, title, note, action, children }) {
  return (
    <section className="card" id={id}>
      <div className="cardh">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>{title}</h2>
          {note && <p className="small muted">{note}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ text, later }) {
  return (
    <div style={EMPTY}>
      <div className="muted">{text}</div>
      {later && <div className="small muted" style={{ marginTop: 4 }}>{later}</div>}
    </div>
  );
}

const PRI_COLOR = { high: '#8A2E1C', mid: '#7A4A0B', low: '#5B6170' };

function deadlineText(o) {
  const tail = o.reminded ? ' · напоминание отправлено' : '';
  if (o.status === 'partial') return `Осталось ${money(o.left, o.cur)}${o.deadline ? ` · до ${fmtD(o.deadline)}` : ''}${tail}`;
  if (!o.deadline) return `Срок оплаты не задан${tail}`;
  return `${o.overdue ? 'Срок был' : 'Оплатить до'} ${fmtD(o.deadline)}${tail}`;
}

export default function Today() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [clientId, setClientId] = useState(null);

  useEffect(() => { document.title = 'Сегодня · CRM Читатель'; }, []);

  const load = useCallback(async () => {
    try {
      setData(await getToday());
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openOrder = (id) => navigate(`/orders?open=${id}`);
  const openClient = (id) => { if (id) setClientId(id); };
  const closeDrawer = useCallback(() => setClientId(null), []);
  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (!data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="pagehead"><h1 className="h1">Сегодня</h1></div>
        {error
          ? <div className="auth-err" role="alert">{error} <button className="lnk" type="button" onClick={load}>Повторить</button></div>
          : <div className="muted">Загрузка…</div>}
      </div>
    );
  }

  const k = data.kpis;
  const kpis = [
    { v: k.unpaid, l: 'Неоплаченных счетов', tone: '#8A5A0B', go: () => navigate('/orders') },
    { v: k.unlinked, l: 'Оплат без привязки к приложению', tone: '#8A2E1C', go: () => scrollTo('today-unlinked') },
    { v: k.inbox, l: 'Сообщений без ответа', tone: '#2453A6', go: can('inbox') ? () => navigate('/inbox') : null },
    { v: k.tg, l: 'Заявок в каналы без оплаты', tone: '#171A21', go: () => scrollTo('today-tg') },
  ];
  const showTransfers = data.requireTransferConfirm || data.transfers.length > 0;
  const store = data.store || { products: [], unmatched: [], unmatchedCount: 0 };
  const showStore = store.products.length > 0 || store.unmatchedCount > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="pagehead">
        <h1 className="h1">Сегодня</h1>
        <p className="muted">{dateLine(new Date())} · что требует действия</p>
      </div>
      {error && <div className="auth-err" role="alert">{error} <button className="lnk" type="button" onClick={load}>Повторить</button></div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        {kpis.map((x) => (
          <button key={x.l} type="button" onClick={x.go || undefined} disabled={!x.go}
            style={{
              font: 'inherit', textAlign: 'left', cursor: x.go ? 'pointer' : 'default', background: '#FFFFFF',
              border: '1px solid #E3E6EB', borderRadius: 10, padding: '16px 18px', display: 'flex',
              flexDirection: 'column', gap: 8, color: '#171A21',
            }}>
            <span style={{ fontSize: 28, fontWeight: 700, lineHeight: 1, color: x.tone }}>{x.v}</span>
            <span className="small muted">{x.l}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: 16, alignItems: 'start' }}>
        <Card title="Мои задачи на сегодня" note="Включая просроченные"
          action={<button className="lnk small" type="button" onClick={() => navigate('/tasks')}>Все задачи →</button>}>
          {data.tasks.map((t) => (
            <div key={t.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 16px', borderBottom: '1px solid #ECEEF2' }}>
              <input type="checkbox" aria-label="Выполнено" disabled title="Скоро: задачи, блок K"
                style={{ width: 18, height: 18, accentColor: '#1D5A35', marginTop: 2 }} />
              <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontWeight: 600 }}>{t.title}</span>
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className="tag">{t.typeLabel}</span>
                  {t.clientId && <button className="lnk small" type="button" onClick={() => openClient(t.clientId)}>{t.clientName}</button>}
                  <span className="small" style={{ color: PRI_COLOR[t.priority] || '#5B6170', fontWeight: 600 }}>{t.priorityLabel}</span>
                  {t.auto && <span className="small muted">· авто: {t.auto}</span>}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <span className="small" style={{ fontWeight: 600, color: t.overdue ? '#8A2E1C' : '#171A21' }}>{fmtD(t.due, true)}</span>
                {t.overdue && <span className="small" style={{ color: '#8A2E1C' }}>просрочена</span>}
              </div>
            </div>
          ))}
          {!data.tasks.length && <Empty text="На сегодня задач нет." later="Задачи появятся с разделом «Задачи»." />}
        </Card>

        {showTransfers && (
          <Card title="Переводы на карту ждут подтверждения"
            note="Менеджер записал перевод, Анна подтверждает, что деньги пришли. После этого открывается доступ">
            {data.transfers.map((u) => (
              <div key={u.id} style={ROW}>
                <div style={LINE}>
                  <button className="lnk" type="button" onClick={() => openOrder(u.id)}>#{u.num} · {u.clientName}</button>
                  <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{u.payment ? money(u.payment.amount, u.payment.cur) : money(u.price, u.cur)}</span>
                </div>
                <div className="small muted">{u.product}</div>
                {u.payment && (
                  <div className="small">
                    {[u.payment.methodLabel, u.payment.account, fmtD(u.payment.at)].filter(Boolean).join(' · ')}
                  </div>
                )}
                <div style={ACTS}>
                  {data.canConfirm
                    ? <button className="btn-s" type="button" onClick={() => openOrder(u.id)} style={{ borderColor: '#1D5A35', color: '#1D5A35' }}>Подтвердить в заказе</button>
                    : <span style={pill('ask')}>Ждёт подтверждения Анны</span>}
                  <button className="btn-s" type="button" onClick={() => openOrder(u.id)}>Открыть заказ</button>
                </div>
              </div>
            ))}
            {!data.transfers.length && <Empty text="Неподтверждённых переводов нет." />}
          </Card>
        )}

        <Card title="Ждут оплаты" note="Сначала с ближайшим сроком оплаты"
          action={<button className="lnk small" type="button" onClick={() => navigate('/orders')}>Все заказы →</button>}>
          {data.unpaid.map((u) => {
            const [st, tone] = orderStatus(u);
            return (
              <div key={u.id} style={ROW}>
                <div style={LINE}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                    <button className="lnk" type="button" onClick={() => openOrder(u.id)}>#{u.num} · {u.clientName}</button>
                    <span style={pill(tone)}>{st}</span>
                  </div>
                  <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{money(u.price, u.cur)}</span>
                </div>
                <div className="small muted">{u.product}</div>
                <div style={{ fontSize: 13, color: u.overdue ? '#8A2E1C' : '#5B6170' }}>{deadlineText(u)}</div>
                <div style={{ ...ACTS, marginTop: 2 }}>
                  {can('orders') && <button className="btn-s" type="button" onClick={() => openOrder(u.id)}>Провести оплату</button>}
                  <Soon className="btn-s" hint="ссылка на оплату, блок E">Скопировать ссылку</Soon>
                </div>
              </div>
            );
          })}
          {!data.unpaid.length && <Empty text="Все счета оплачены." />}
        </Card>

        <Card id="today-unlinked" title="Оплатили, но не связаны с приложением" note="За 14 дней. Доступ в приложении не открылся">
          {data.unlinked.map((x) => (
            <div key={x.clientId} style={ROW}>
              <div style={LINE}>
                <button className="lnk" type="button" onClick={() => openClient(x.clientId)}>{x.clientName}</button>
                <span style={pill('warn')}>Не связана</span>
              </div>
              <div className="small muted">
                #{x.num} · {x.product}{x.clientEmail ? ` · почта при оплате ${x.clientEmail}` : ''}
              </div>
              <div style={ACTS}>
                <button className="btn-s" type="button" onClick={() => openClient(x.clientId)}>Указать почту приложения</button>
                <Soon className="btn-s" hint="письма, блок F">Отправить инструкцию для входа</Soon>
              </div>
            </div>
          ))}
          {!data.unlinked.length && <Empty text="Все свежие оплаты связаны с приложением." />}
        </Card>

        <Card id="today-tg" title="Заявки в Telegram-каналы" note="Где бот не нашёл оплату">
          {data.tg.map((r) => (
            <div key={r.id} style={ROW}>
              <div style={LINE}>
                <span style={{ fontWeight: 600 }}>{r.username}</span>
                <span className="small muted">{fmtD(r.at, true)}</span>
              </div>
              <div className="small muted">{r.channel}</div>
              {r.reason && <div className="small" style={{ color: '#7A4A0B' }}>{r.reason}</div>}
              <div style={ACTS}>
                <Soon className="btn-s" hint="бот и каналы, блок G">Одобрить</Soon>
                <Soon className="btn-s" hint="бот и каналы, блок G">Отклонить и отправить ссылку на оплату</Soon>
                {r.clientId && <button className="btn-s" type="button" onClick={() => openClient(r.clientId)}>Карточка: {r.clientName}</button>}
              </div>
            </div>
          ))}
          {!data.tg.length && <Empty text="Заявок без оплаты нет." later="Заявки появятся, когда бот клуба начнёт принимать вступления в каналы." />}
        </Card>

        {showStore && (
          <Card title="Проверить App Store" note="Без товара в App Store купленное на сайте не откроется в iOS-приложении">
            {store.products.map((p) => (
              <div key={p.productId} style={ROW}>
                <span style={{ fontWeight: 600 }}>{p.name}</span>
                {p.warnings.map((w) => <div key={`${w.kind}-${w.slug}`} className="small" style={{ color: '#7A4A0B' }}>{w.text}</div>)}
              </div>
            ))}
            {store.unmatchedCount > 0 && (
              <>
                <div style={{ ...ROW, gap: 2 }}>
                  <span style={{ fontWeight: 600 }}>Покупки в приложении без продукта CRM: {store.unmatchedCount}</span>
                  <span className="small muted">Укажите товар App Store или Google Play в карточке продукта</span>
                </div>
                {store.unmatched.map((o) => (
                  <button key={o.id} type="button" className="rowbtn" onClick={() => openOrder(o.id)}
                    style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '4px 12px', padding: '11px 18px', borderBottom: '1px solid #ECEEF2' }}>
                    <span className="cell" style={{ fontWeight: 600 }}>#{o.num} · {o.clientName}</span>
                    <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{fmtD(o.createdAt)}</span>
                    <span className="cell small muted">{o.storeProductId || o.product}</span>
                    <span style={pill('ask')}>{o.sourceLabel}</span>
                  </button>
                ))}
              </>
            )}
          </Card>
        )}

        <Card title="Последние оплаты">
          {data.recent.map((r) => (
            <button key={r.id} type="button" className="rowbtn" onClick={() => openOrder(r.id)}
              style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '4px 12px', padding: '11px 18px', borderBottom: '1px solid #ECEEF2' }}>
              <span className="cell" style={{ fontWeight: 600 }}>{r.clientName}</span>
              <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{money(r.paid || r.price, r.cur)}</span>
              <span className="cell small muted">#{r.num} · {r.product}</span>
              <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{fmtD(r.paidAt)}</span>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={pill(r.store ? 'ask' : 'mute')}>{r.sourceLabel}</span>
                <span style={pill(r.app.tone)}>{r.app.text}</span>
              </span>
            </button>
          ))}
          {!data.recent.length && <Empty text="За 30 дней оплат нет." />}
        </Card>

        {data.journal && (
          <Card title="Журнал действий за сутки">
            {data.journal.map((j) => (
              <div key={j.id} style={{ display: 'grid', gridTemplateColumns: '110px 130px minmax(0, 1fr)', gap: 12, padding: '10px 16px', borderBottom: '1px solid #ECEEF2' }}>
                <span className="small muted">{fmtD(j.at, true)}</span>
                <span className="small cell" style={{ fontWeight: 600 }}>{j.who}</span>
                <span className="small">
                  {j.text}
                  {j.entity && j.link && (
                    <>
                      {': '}
                      <button className="lnk small" type="button"
                        onClick={() => (j.link.type === 'client' ? openClient(j.link.id) : openOrder(j.link.id))}>{j.entity}</button>
                    </>
                  )}
                </span>
              </div>
            ))}
            {!data.journal.length && <Empty text="Действий за сутки нет." />}
          </Card>
        )}
      </div>

      <ClientDrawer id={clientId} onClose={closeDrawer} onChanged={load} />
    </div>
  );
}
