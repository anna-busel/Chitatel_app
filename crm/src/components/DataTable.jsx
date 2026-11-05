import { useCallback, useMemo, useRef, useState } from 'react';
import useOutside from './useOutside';

/**
 * Общая таблица CRM (CRM-PLAN A7) — разметка и поведение таблиц прототипа
 * (Клиенты/Заказы в markup.html, heads()/pager() в component.js):
 * сортировка по заголовку, пагинация, выбор колонок («Колонки»), выбор строк
 * с панелью массовых действий.
 *
 * columns: [{
 *   key, label,
 *   width: '160px' | 'minmax(160px,1fr)'   — дорожка CSS grid,
 *   min: 160                                — минимальная ширина в px (для горизонтального скролла),
 *   sortable, defaultDir: 'asc'|'desc',
 *   sortValue: (row) => число|строка        — по умолчанию row[key],
 *   render: (row) => узел                   — по умолчанию row[key],
 *   hideable: true                          — можно скрыть в «Колонках»,
 *   hidden: true                            — скрыта по умолчанию,
 * }]
 *
 * Данные целиком (сортировка и страницы на клиенте) — передать rows.
 * Данные со страницами с сервера — передать remote = { total, page, onPage }
 * и sort/onSort; rows тогда — уже нужная страница.
 */
const SEL_W = 44;
const GAP = 12;

function cmp(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a instanceof Date || b instanceof Date) return new Date(a) - new Date(b);
  return String(a).localeCompare(String(b), 'ru', { numeric: true });
}

function pageList(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pages - 1, page + 1);
  if (from > 2) out.push('…a');
  for (let i = from; i <= to; i += 1) out.push(i);
  if (to < pages - 1) out.push('…b');
  out.push(pages);
  return out;
}

function loadCols(storageKey) {
  if (!storageKey) return null;
  try { return JSON.parse(window.localStorage.getItem(`crm.cols.${storageKey}`) || 'null'); } catch (_e) { return null; }
}

export default function DataTable({
  columns,
  rows,
  rowKey = 'id',
  pageSize = 15,
  selectable = false,
  selected: selectedProp,
  onSelectedChange,
  bulkActions,
  onRowClick,
  toolbar,
  empty = 'Ничего не нашли.',
  sort: sortProp,
  onSort,
  remote,
  storageKey,
  loading = false,
}) {
  const keyOf = useCallback(
    (row) => String(typeof rowKey === 'function' ? rowKey(row) : row[rowKey]),
    [rowKey],
  );

  // --- колонки
  const [hidden, setHidden] = useState(() => {
    const saved = loadCols(storageKey);
    if (saved) return saved;
    const h = {};
    columns.forEach((c) => { if (c.hidden) h[c.key] = true; });
    return h;
  });
  const toggleCol = (key) => {
    setHidden((h) => {
      const next = { ...h, [key]: !h[key] };
      if (storageKey) {
        try { window.localStorage.setItem(`crm.cols.${storageKey}`, JSON.stringify(next)); } catch (_e) { /* нет места */ }
      }
      return next;
    });
  };
  const hideable = columns.filter((c) => c.hideable);
  const visible = columns.filter((c) => !(c.hideable && hidden[c.key]));
  const [colsOpen, setColsOpen] = useState(false);
  const colsRef = useRef(null);
  const closeCols = useCallback(() => setColsOpen(false), []);
  useOutside(colsRef, colsOpen, closeCols);

  // --- сортировка
  const [sortState, setSortState] = useState(null);
  const sort = sortProp !== undefined ? sortProp : sortState;
  const setSort = onSort || setSortState;
  const clickSort = (col) => {
    const on = sort && sort.key === col.key;
    setSort({ key: col.key, dir: on ? (sort.dir === 'asc' ? 'desc' : 'asc') : (col.defaultDir || 'asc') });
    if (!remote) setPageState(1);
  };

  const sorted = useMemo(() => {
    if (remote || !sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const val = col.sortValue || ((r) => r[col.key]);
    const dir = sort.dir === 'desc' ? -1 : 1;
    return rows.slice().sort((a, b) => cmp(val(a), val(b)) * dir);
  }, [rows, sort, columns, remote]);

  // --- страницы
  const [pageState, setPageState] = useState(1);
  const total = remote ? remote.total : sorted.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(remote ? remote.page : pageState, pages);
  const goPage = (p) => (remote ? remote.onPage(p) : setPageState(p));
  const pageRows = remote ? rows : sorted.slice((page - 1) * pageSize, page * pageSize);
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);

  // --- выбор строк
  const [selState, setSelState] = useState([]);
  const selected = selectedProp !== undefined ? selectedProp : selState;
  const setSelected = onSelectedChange || setSelState;
  const selSet = useMemo(() => new Set(selected.map(String)), [selected]);
  const toggleRow = (id) => {
    setSelected(selSet.has(id) ? selected.filter((x) => String(x) !== id) : selected.concat(id));
  };
  const pageIds = pageRows.map(keyOf);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selSet.has(id));
  const toggleAll = () => {
    if (allOnPage) setSelected(selected.filter((x) => !pageIds.includes(String(x))));
    else setSelected(selected.concat(pageIds.filter((id) => !selSet.has(id))));
  };
  const clearSel = () => setSelected([]);

  // --- сетка (как CL.outer/CL.inner в прототипе)
  const template = visible.map((c) => c.width || 'minmax(120px,1fr)').join(' ');
  const minW = (selectable ? SEL_W : 16) + visible.reduce((t, c) => t + (c.min || 120), 0)
    + (visible.length - 1) * GAP + 16;
  const outer = {
    display: 'grid',
    gridTemplateColumns: selectable ? `${SEL_W}px minmax(0,1fr)` : 'minmax(0,1fr)',
    alignItems: 'center',
    minWidth: minW,
  };
  const inner = {
    display: 'grid',
    gridTemplateColumns: template,
    gap: GAP,
    alignItems: 'center',
    paddingLeft: selectable ? 0 : 16,
  };

  const cellOf = (col, row) => (col.render ? col.render(row) : (row[col.key] ?? '—'));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {(toolbar || hideable.length > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {toolbar}
          {hideable.length > 0 && (
            <div style={{ position: 'relative' }} ref={colsRef}>
              <button className="btn" type="button" aria-expanded={colsOpen} onClick={() => setColsOpen((v) => !v)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16" /></svg>
                Колонки
              </button>
              {colsOpen && (
                <div className="menu" style={{ left: 0, right: 'auto', minWidth: 240 }}>
                  {hideable.map((c) => (
                    <label key={c.key} className="colopt">
                      <input type="checkbox" checked={!hidden[c.key]} onChange={() => toggleCol(c.key)} />
                      <span>{c.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {selectable && selected.length > 0 && (
        <div className="bulkbar">
          <span className="bulkbar-text">Выбрано: {selected.length}</span>
          {bulkActions && bulkActions(selected.map(String), clearSel)}
          <button className="lnk bulkbar-clear" type="button" onClick={clearSel}>Снять выделение</button>
        </div>
      )}

      <section className="card" style={{ overflow: 'hidden' }}>
        <div className="tbl" aria-busy={loading}>
          <div className="thead" style={outer} role="row">
            {selectable && (
              <label className="cb">
                <input type="checkbox" aria-label="Выбрать все на странице" checked={allOnPage} onChange={toggleAll} />
              </label>
            )}
            <div style={{ ...inner, paddingRight: 16 }}>
              {visible.map((c) => {
                if (!c.sortable) return <span key={c.key}>{c.label}</span>;
                const on = sort && sort.key === c.key;
                return (
                  <button key={c.key} type="button" className={`th-sort${on ? ' on' : ''}`} onClick={() => clickSort(c)}
                    aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    {c.label} {on ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
                  </button>
                );
              })}
            </div>
          </div>

          {pageRows.map((row) => {
            const id = keyOf(row);
            const cells = visible.map((c) => <span key={c.key} className="cell">{cellOf(c, row)}</span>);
            return (
              <div key={id} className="trow" style={outer}>
                {selectable && (
                  <label className="cb">
                    <input type="checkbox" aria-label="Выбрать" checked={selSet.has(id)} onChange={() => toggleRow(id)} />
                  </label>
                )}
                {onRowClick ? (
                  <button type="button" className="rowbtn" style={inner} onClick={() => onRowClick(row)}>{cells}</button>
                ) : (
                  <div style={{ ...inner, padding: '11px 16px 11px 0', paddingLeft: inner.paddingLeft }}>{cells}</div>
                )}
              </div>
            );
          })}

          {!pageRows.length && (
            <div className="muted tbl-empty">{loading ? 'Загрузка…' : empty}</div>
          )}
        </div>

        <div className="pager">
          <span className="small muted">
            {from}–{to} из {total}
          </span>
          <div className="pager-btns">
            <button className="ibtn" type="button" aria-label="Предыдущая страница" disabled={page <= 1}
              onClick={() => goPage(page - 1)} style={{ width: 32, height: 32 }}>‹</button>
            {pageList(page, pages).map((p) => (typeof p === 'number' ? (
              <button key={p} type="button" className={`pg${p === page ? ' on' : ''}`} aria-current={p === page ? 'page' : undefined}
                onClick={() => goPage(p)}>{p}</button>
            ) : <span key={p} className="pg-gap">…</span>))}
            <button className="ibtn" type="button" aria-label="Следующая страница" disabled={page >= pages}
              onClick={() => goPage(page + 1)} style={{ width: 32, height: 32 }}>›</button>
          </div>
        </div>
      </section>
    </div>
  );
}
