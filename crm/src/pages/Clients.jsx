import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DataTable from '../components/DataTable';
import Soon from '../components/Soon';
import ClientDrawer from '../components/ClientDrawer';
import { useToast } from '../components/Toast';
import { bulkTags, exportClients, listClients } from '../api/crm';
import { avStyle, fmtD, initials, lastDay, mLabel, moneyR, pill, plural } from '../utils';

/**
 * «Клиенты» (CRM-PLAN D1) — экран «Клиентки» прототипа (markup.html,
 * CL в component.js): поиск, чипы сегментов с количеством, «Колонки»,
 * сортировка и страницы на сервере, массовый выбор.
 *
 * Неактивны «скоро»: «+ Сегмент» и «Рассылка» (блок J), «+ Задача» и
 * «В план продаж» (блок K). Сохранённых сегментов пока нет (J2).
 */
const PAGE = 15;

const segLabels = (cur) => [
  ['all', 'Вся база'],
  ['club', 'В клубе сейчас'],
  ['ending', cur ? `Доступ до ${lastDay(cur).slice(0, 5)}` : 'Доступ до конца месяца'],
  ['noclub', 'Без доступа к клубу'],
  ['content', 'Разборы без клуба'],
  ['unlinked', 'Не связаны с приложением'],
  ['noorders', 'Без оплат'],
  ['long', 'Длительные абонементы'],
  ['tier2', 'Тариф 2'],
];

const COLUMNS = [
  {
    key: 'name', label: 'Клиент', width: 'minmax(200px,1.3fr)', min: 200, sortable: true,
    render: (r) => (
      <span style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
        <span className="av" style={avStyle(r.name, 28)}>{initials(r.name)}</span>
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <span className="cell" style={{ fontWeight: 600 }}>{r.name || '—'}</span>
          <span className="cell small muted">{r.city || ''}</span>
        </span>
      </span>
    ),
  },
  { key: 'email', label: 'Почта', width: 'minmax(160px,1fr)', min: 160, render: (r) => r.email || '—' },
  {
    key: 'app', label: 'Приложение', width: 'minmax(150px,1fr)', min: 150, hideable: true,
    render: (r) => <span style={pill(r.linked ? 'ok' : 'mute')}>{r.linked ? (r.appEmail || 'связана') : 'не связана'}</span>,
  },
  { key: 'phone', label: 'Телефон', width: '140px', min: 140, hideable: true, render: (r) => r.phone || '—' },
  { key: 'tg', label: 'Telegram', width: '120px', min: 120, hideable: true, render: (r) => r.telegram || '—' },
  { key: 'city', label: 'Город', width: 'minmax(130px,1fr)', min: 130, hideable: true, hidden: true, render: (r) => r.city || '—' },
  {
    key: 'until', label: 'Клуб по', width: '86px', min: 86, hideable: true, sortable: true, defaultDir: 'desc',
    render: (r) => <span style={{ fontWeight: 500, color: r.untilActive ? 'var(--text)' : 'var(--muted-2)' }}>{r.until ? mLabel(r.until) : '—'}</span>,
  },
  {
    key: 'ltv', label: 'Сумма покупок', width: '110px', min: 110, hideable: true, hidden: true, sortable: true, defaultDir: 'desc',
    render: (r) => (r.ltv ? moneyR(r.ltv) : '—'),
  },
  {
    key: 'last', label: 'Посл. оплата', width: '110px', min: 110, hideable: true, sortable: true, defaultDir: 'desc',
    render: (r) => <span className="muted">{r.lastPaidAt ? fmtD(r.lastPaidAt) : '—'}</span>,
  },
];

export default function Clients() {
  const toast = useToast();
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [seg, setSeg] = useState('all');
  const [sort, setSort] = useState({ key: 'last', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState(false);
  const reqId = useRef(0);

  useEffect(() => { document.title = 'Клиенты · CRM Читатель'; }, []);

  // Поиск — с паузой 300 мс после ввода.
  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const d = await listClients({ q, seg, sort, page, limit: PAGE });
      if (id !== reqId.current) return;
      setData(d);
      setError('');
    } catch (err) {
      if (id !== reqId.current) return;
      setError(err.message);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [q, seg, sort, page]);

  useEffect(() => { load(); }, [load]);

  const closeDrawer = useCallback(() => setOpenId(null), []);
  const pickSeg = (k) => { setSeg(k); setPage(1); };
  const onSort = (s) => { setSort(s); setPage(1); };

  const doExport = async (ids) => {
    setBusy(true);
    try {
      await exportClients({ q, seg, sort, ids });
      const n = ids ? ids.length : (data ? data.total : 0);
      toast(ids
        ? `Выгружено в Excel: ${n} ${plural(n, 'строка', 'строки', 'строк')}.`
        : `Выгружено в Excel: ${n} ${plural(n, 'строка', 'строки', 'строк')} по текущему фильтру.`);
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const tagPromo = async (ids, clear) => {
    setBusy(true);
    try {
      const r = await bulkTags(ids, { add: 'Акция' });
      clear();
      load();
      toast(`Тег «Акция» добавлен: ${r.changed}.`, {
        undo: r.changed ? async () => { await bulkTags(r.ids, { remove: 'Акция' }); load(); } : undefined,
      });
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  };

  const chips = useMemo(() => segLabels(data && data.currentMonth), [data]);
  const counts = (data && data.counts) || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="pagehead-row">
        <div className="pagehead">
          <h1 className="h1">Клиенты</h1>
          <p className="muted">Найдено {data ? data.total : '…'} · после импорта здесь будет вся база ГетКурса</p>
        </div>
        <div className="row-actions">
          <Soon hint="сохранённые сегменты появятся с рассылками (блок J)">+ Сегмент</Soon>
          <button className="btn" type="button" disabled={busy} onClick={() => doExport(null)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>
            Выгрузить в Excel
          </button>
        </div>
      </div>

      <div className="chips" role="tablist" aria-label="Сегменты">
        {chips.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={seg === k} className={`chip${seg === k ? ' on' : ''}`} onClick={() => pickSeg(k)}>
            {label}{counts[k] !== undefined ? ` · ${counts[k]}` : ''}
          </button>
        ))}
      </div>

      {error && <div className="auth-err" role="alert">{error} <button className="lnk" type="button" onClick={load}>Повторить</button></div>}

      <DataTable
        columns={COLUMNS}
        rows={data ? data.items : []}
        rowKey="id"
        pageSize={PAGE}
        storageKey="clients"
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        sort={sort}
        onSort={onSort}
        remote={{ total: data ? data.total : 0, page, onPage: setPage }}
        loading={loading}
        onRowClick={(r) => setOpenId(r.id)}
        empty="Никого не нашли. Проверьте написание или снимите фильтр."
        toolbar={(
          <div style={{ flex: '1 1 320px', maxWidth: 520 }}>
            <input className="inp" type="search" aria-label="Поиск по клиенткам" placeholder="Имя, почта ГК или приложения, телефон, @ник, тег"
              value={qInput} onChange={(e) => setQInput(e.target.value)} />
          </div>
        )}
        bulkActions={(ids, clear) => (
          <>
            <Soon className="btn-s" hint="план продаж — блок K">В план продаж</Soon>
            <Soon className="btn-s" hint="задачи — блок K">+ Задача</Soon>
            <Soon className="btn-s" hint="рассылки — блок J">Рассылка</Soon>
            <button className="btn-s" type="button" disabled={busy} onClick={() => tagPromo(ids, clear)}>Тег «Акция»</button>
            <button className="btn-s" type="button" disabled={busy} onClick={() => doExport(ids)}>Выгрузить</button>
          </>
        )}
      />

      <ClientDrawer id={openId} onClose={closeDrawer} onChanged={load} />
    </div>
  );
}
