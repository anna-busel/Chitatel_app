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
