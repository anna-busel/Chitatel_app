import { useCallback, useEffect, useRef, useState } from 'react';
import DataTable from '../components/DataTable';
import Soon from '../components/Soon';
import ClientDrawer from '../components/ClientDrawer';
import { useToast } from '../components/Toast';
import { useAuth } from '../auth/AuthContext';
import { exportOrders, listOrders } from '../api/crm';
import { fmtD, money, moneyR, orderStatus, pill, plural } from '../utils';

/**
 * «Заказы» (CRM-PLAN D4) — экран «Заказы» прототипа (markup.html, OR в
 * component.js). Вкладки — как в плане: Все, Не оплачены, Ждут
 * подтверждения, Оплачены, Без оплаты, Ложные, Возвраты.
 *
 * Клик по строке пока открывает карточку клиентки (карточка заказа — D5).
 * Неактивны «скоро»: «+ Новый заказ» (D6), «Напомнить об оплате» (письма, F).
 */
const PAGE = 15;

const TABS = [
  ['all', 'Все'], ['unpaid', 'Не оплачены'], ['confirm', 'Ждут подтверждения'], ['paid', 'Оплачены'],
  ['free', 'Без оплаты'], ['fake', 'Ложные'], ['refund', 'Возвраты'],
];
const SOURCES = [
  ['all', 'Все способы оплаты'], ['bepaid', 'bePaid'], ['lava', 'lava.top'], ['transfer', 'Перевод на карту'],
  ['balance', 'Баланс'], ['app_store', 'App Store'], ['google_play', 'Google Play'], ['free', 'Без оплаты'],
  ['admin', 'Из админки'], ['import', 'Импорт'],
];
const PERIODS = [['all', 'За всё время'], ['today', 'Сегодня'], ['week', '7 дней'], ['month', '30 дней']];
const PERIOD_DAYS = { today: 0, week: 6, month: 30 };

const dayStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromFor = (period) => (period in PERIOD_DAYS ? dayStr(new Date(Date.now() - PERIOD_DAYS[period] * 864e5)) : undefined);

const COLUMNS = [
  {
    key: 'date', label: 'Заказ', width: '104px', min: 104, sortable: true, defaultDir: 'desc',
    render: (o) => (
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontWeight: 600 }}>#{o.num}</span>
        <span className="cell small muted">{fmtD(o.createdAt)}</span>
      </span>
    ),
  },
  { key: 'client', label: 'Клиент', width: 'minmax(130px,1fr)', min: 130, sortable: true, render: (o) => <span style={{ fontWeight: 600 }}>{o.clientName}</span> },
  {
    key: 'product', label: 'Позиция', width: 'minmax(170px,1.4fr)', min: 170,
    render: (o) => (
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span className="cell">{o.product}</span>
        {o.productUnmatched && <span className="cell small" style={{ color: '#7A4A0B' }}>продукт не сопоставлен</span>}
        {o.note && <span className="cell small muted">{o.note}</span>}
      </span>
    ),
  },
  {
    key: 'amount', label: 'Сумма', width: '96px', min: 96, sortable: true, defaultDir: 'desc',
    render: (o) => <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{money(o.price, o.cur)}</span>,
  },
  {
    key: 'status', label: 'Статус', width: '118px', min: 118, sortable: true,
    render: (o) => { const [t, tone] = orderStatus(o); return <span style={pill(tone)}>{t}</span>; },
  },
  { key: 'src', label: 'Оплата', width: '120px', min: 120, render: (o) => <span style={pill(o.store ? 'ask' : 'mute')}>{o.sourceLabel}</span> },
  { key: 'mgr', label: 'Менеджер', width: '84px', min: 84, render: (o) => <span className="muted">{o.managerName || '—'}</span> },
  { key: 'app', label: 'Приложение', width: '150px', min: 150, render: (o) => <span style={pill(o.app.tone)}>{o.app.text}</span> },
];

export default function Orders() {
  const toast = useToast();
  const { can } = useAuth();
  const [tab, setTab] = useState('all');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [source, setSource] = useState('all');
  const [manager, setManager] = useState('all');
  const [period, setPeriod] = useState('all');
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [clientId, setClientId] = useState(null);
  const [busy, setBusy] = useState(false);
  const reqId = useRef(0);

  useEffect(() => { document.title = 'Заказы · CRM Читатель'; }, []);
  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const filters = { status: tab, source, manager, from: fromFor(period), q, sort };

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const d = await listOrders({ status: tab, source, manager, from: fromFor(period), q, sort, page, limit: PAGE });
      if (id !== reqId.current) return;
      setData(d);
      setError('');
    } catch (err) {
      if (id !== reqId.current) return;
      setError(err.message);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [tab, source, manager, period, q, sort, page]);

  useEffect(() => { load(); }, [load]);

  const set = (fn) => (v) => { fn(v); setPage(1); };
  const reset = () => { setTab('all'); setQInput(''); setQ(''); setSource('all'); setManager('all'); setPeriod('all'); setPage(1); };
  const closeDrawer = useCallback(() => setClientId(null), []);

  const doExport = async (ids) => {
    setBusy(true);
    try {
      await exportOrders({ ...filters, ids });
      const n = ids ? ids.length : (data ? data.total : 0);
      toast(`Выгружено в Excel: ${n} ${plural(n, 'заказ', 'заказа', 'заказов')}${ids ? '' : ' по текущему фильтру'}.`);
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const total = data ? data.total : 0;
  const tabs = (data && data.tabs) || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="pagehead-row">
        <div className="pagehead">
          <h1 className="h1">Заказы</h1>
          <p className="muted">
            {data ? `${total} ${plural(total, 'заказ', 'заказа', 'заказов')} · получено ${moneyR(data.receivedByn)} в пересчёте` : '…'}
          </p>
        </div>
        <div className="row-actions">
          <button className="btn" type="button" disabled={busy} onClick={() => doExport(null)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>
            Выгрузить в Excel
          </button>
          {can('orders') && <Soon className="btn-p" hint="новый заказ — задача D6">+ Новый заказ</Soon>}
        </div>
      </div>

      <div className="chips" role="tablist" aria-label="Статус заказа">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`chip${tab === k ? ' on' : ''}`} onClick={() => set(setTab)(k)}>
            {label}{tabs[k] !== undefined ? ` · ${tabs[k]}` : ''}
          </button>
        ))}
      </div>

      <div className="filters">
        <div style={{ flex: '1 1 260px', maxWidth: 380 }}>
          <input className="inp" type="search" aria-label="Поиск по заказам" placeholder="Номер, клиентка, почта, позиция, тег"
            value={qInput} onChange={(e) => setQInput(e.target.value)} />
        </div>
        <div style={{ flex: '0 1 200px' }}>
          <select className="inp" aria-label="Способ оплаты" value={source} onChange={(e) => set(setSource)(e.target.value)}>
            {SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div style={{ flex: '0 1 190px' }}>
          <select className="inp" aria-label="Менеджер" value={manager} onChange={(e) => set(setManager)(e.target.value)}>
            <option value="all">Все менеджеры</option>
            {((data && data.managers) || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            <option value="none">Без менеджера (сайт)</option>
          </select>
        </div>
        <div style={{ flex: '0 1 160px' }}>
          <select className="inp" aria-label="Период" value={period} onChange={(e) => set(setPeriod)(e.target.value)}>
            {PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <button className="lnk small" type="button" onClick={reset}>Сбросить</button>
      </div>

      {error && <div className="auth-err" role="alert">{error} <button className="lnk" type="button" onClick={load}>Повторить</button></div>}

      <DataTable
        columns={COLUMNS}
        rows={data ? data.items : []}
        rowKey="id"
        pageSize={PAGE}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        sort={sort}
        onSort={set(setSort)}
        remote={{ total, page, onPage: setPage }}
        loading={loading}
        onRowClick={(o) => setClientId(o.clientId)}
        empty="По этим условиям заказов нет."
        bulkActions={(ids) => (
          <>
            <Soon className="btn-s" hint="напоминания — с письмами (блок F)">Напомнить об оплате</Soon>
            <button className="btn-s" type="button" disabled={busy} onClick={() => doExport(ids)}>Выгрузить</button>
          </>
        )}
      />

      <ClientDrawer id={clientId} onClose={closeDrawer} onChanged={load} />
    </div>
  );
}
