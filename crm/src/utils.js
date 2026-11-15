// Аватар-инициалы — как avStyle/initials в docs/crm-prototype/logic.js.
const AVC = [['#E2EAFB', '#1F3F86'], ['#DFF0E5', '#1D5A35'], ['#FDF0D8', '#7A4A0B'], ['#FBE1DA', '#8A2E1C'],
  ['#EDE4F8', '#4B2A7B'], ['#DDF1F3', '#155563'], ['#F6E1EC', '#7A2453'], ['#E9EDD8', '#47531A']];

export function avStyle(name, size) {
  const n = String(name || '');
  let h = 0;
  for (let i = 0; i < n.length; i += 1) h = (h * 31 + n.charCodeAt(i)) % 9973;
  const c = AVC[h % AVC.length];
  const st = { background: c[0], color: c[1] };
  if (size) Object.assign(st, { width: size, height: size, fontSize: Math.round(size * 0.36) });
  return st;
}

export function initials(name) {
  const p = String(name || '?').trim().split(/\s+/);
  return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase();
}

export function plural(n, one, few, many) {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}

// Статусы-«таблетки» — TONES/pill из прототипа.
export const TONES = { ok: ['#DFF0E5', '#1D5A35'], wait: ['#FDF0D8', '#7A4A0B'], warn: ['#FBE1DA', '#8A2E1C'],
  mute: ['#EEF0F4', '#3A4050'], ask: ['#E2EAFB', '#1F3F86'] };

// --- даты, деньги, месяцы — как в прототипе (logic.js: fmtD, money, mLabel) ---
const MON = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
const MONF = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONG = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const isoDay = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

/** «сегодня 14:05», «вчера», «12 ноя», «3 мар 2025». */
export function fmtD(value, withTime = false) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const t = withTime ? ` ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
  const day = isoDay(d);
  if (day === isoDay(now)) return `сегодня${t}`;
  if (day === isoDay(new Date(now.getTime() - 864e5))) return `вчера${t}`;
  return `${d.getDate()} ${MONG[d.getMonth()].slice(0, 3)}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ''}${t}`;
}

export const num = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
export const money = (n, cur) => `${num(n)} ${cur || 'BYN'}`;
export const moneyR = (n) => `${Math.round(Number(n) || 0).toLocaleString('ru-RU')} BYN`;

/** 'YYYY-M' → порядковый номер месяца (year*12 + month-1). */
export function monthIdx(key) {
  const m = /^(\d{4})-(\d{1,2})$/.exec(String(key || ''));
  return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : null;
}
export const monthKey = (idx) => `${Math.floor(idx / 12)}-${(idx % 12) + 1}`;
/** «Ноя 26» */
export const mLabel = (key) => { const i = monthIdx(key); return i === null ? '—' : `${MON[i % 12]} ${String(Math.floor(i / 12)).slice(2)}`; };
/** «ноябрь 2026» */
export const mFull = (key) => { const i = monthIdx(key); return i === null ? '—' : `${MONF[i % 12]} ${Math.floor(i / 12)}`; };
/** «30.11.2026» — последний день месяца */
export const lastDay = (key) => {
  const i = monthIdx(key);
  if (i === null) return '—';
  const y = Math.floor(i / 12);
  const m = (i % 12) + 1;
  return `${new Date(Date.UTC(y, m, 0)).getUTCDate()}.${String(m).padStart(2, '0')}.${y}`;
};

/** Стиль «таблетки» — pill() прототипа. */
export function pill(tone) {
  const x = TONES[tone] || TONES.mute;
  return {
    display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'middle',
    padding: '2px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', background: x[0], color: x[1],
  };
}

// Статусы заказа — ST прототипа (logic.js).
export const ORDER_ST = {
  confirm: ['Ждёт подтверждения', 'ask'], new: ['Не оплачен', 'wait'], overdue: ['Просрочен', 'warn'],
  partial: ['Частично', 'ask'], paid: ['Оплачен', 'ok'], free: ['Выдан · 0', 'mute'], fake: ['Ложный', 'mute'], refund: ['Возврат', 'warn'],
};
export const orderStatus = (o) => ORDER_ST[o.overdue ? 'overdue' : o.status] || [o.status, 'mute'];

/**
 * Местное время клиентки по стране/городу (как localTime в прототипе) —
 * часовой пояс по названию; не знаем — не показываем.
 */
const TZ = [
  ['Екатеринбург', 'Asia/Yekaterinburg'], ['Новосибирск', 'Asia/Novosibirsk'], ['Самара', 'Europe/Samara'],
  ['Беларусь', 'Europe/Minsk'], ['Минск', 'Europe/Minsk'], ['Россия', 'Europe/Moscow'], ['Москва', 'Europe/Moscow'],
  ['Грузия', 'Asia/Tbilisi'], ['Тбилиси', 'Asia/Tbilisi'], ['Литва', 'Europe/Vilnius'], ['Латвия', 'Europe/Riga'],
  ['Эстония', 'Europe/Tallinn'], ['Польша', 'Europe/Warsaw'], ['Германия', 'Europe/Berlin'], ['Франция', 'Europe/Paris'],
  ['Израиль', 'Asia/Jerusalem'], ['Азербайджан', 'Asia/Baku'], ['Армения', 'Asia/Yerevan'], ['Казахстан', 'Asia/Almaty'],
  ['Украина', 'Europe/Kyiv'], ['Кипр', 'Asia/Nicosia'], ['Турция', 'Europe/Istanbul'], ['Сербия', 'Europe/Belgrade'],
  ['Испания', 'Europe/Madrid'], ['Италия', 'Europe/Rome'], ['Великобритания', 'Europe/London'], ['Канада', 'America/Toronto'],
  ['США', 'America/New_York'],
];
export function localTime(city, country) {
  const hay = `${city || ''} ${country || ''}`;
  const hit = TZ.find(([name]) => hay.includes(name));
  if (!hit) return null;
  try {
    const parts = new Intl.DateTimeFormat('ru-RU', { timeZone: hit[1], hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    const h = Number(parts.slice(0, 2));
    return { text: parts, night: h >= 22 || h < 8 };
  } catch (_e) {
    return null;
  }
}
