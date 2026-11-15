/**
 * Выгрузка «в Excel» (CRM-PLAN D1, D4).
 *
 * Пакета для .xlsx в server/ нет, новых зависимостей не ставим (16.11.2026),
 * поэтому выгрузка — CSV: UTF-8 с BOM и разделитель «;» — так файл
 * открывается в Excel двойным щелчком с кириллицей и колонками.
 *
 * Значения, начинающиеся с = + - @ (формулы), экранируются апострофом —
 * защита от CSV-инъекций при открытии в Excel.
 */
const BOM = '﻿';
const SEP = ';';

function cell(v) {
  if (v === null || v === undefined) {return '';}
  let s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) {s = `'${s}`;}
  if (/[";\n\r]/.test(s)) {s = `"${s.replace(/"/g, '""')}"`;}
  return s;
}

/** columns: [[заголовок, (row) => значение]] → строка CSV с BOM. */
function toCsv(columns, rows) {
  const lines = [columns.map(([h]) => cell(h)).join(SEP)];
  rows.forEach((r) => lines.push(columns.map(([, get]) => cell(get(r))).join(SEP)));
  return BOM + lines.join('\r\n') + '\r\n';
}

function sendCsv(res, filename, columns, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(toCsv(columns, rows));
}

module.exports = { toCsv, sendCsv, cell };
