/** @typedef {string} ISODate  texto local "AAAA-MM-DD" */

const pad = (n) => String(n).padStart(2, '0');

function daysInMonth(year, month1) {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

function parts(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

/** Dia local de hoje, nunca o dia em UTC. */
export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "2026-11-18" -> "2026-11" */
export function monthKey(iso) {
  return iso.slice(0, 7);
}

/** Dia `day` do mês `key` ("AAAA-MM"), limitado ao último dia do mês. */
export function dateInMonth(key, day) {
  const [y, m] = key.split('-').map(Number);
  return `${key}-${pad(Math.min(day, daysInMonth(y, m)))}`;
}

/** Soma meses mantendo o dia, ou o último dia do mês quando ele não existe. */
export function addMonthsClamped(iso, months) {
  const { y, m, d } = parts(iso);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (((total % 12) + 12) % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(d, daysInMonth(ny, nm)))}`;
}

/** Dias de `fromIso` até `toIso` (to - from). */
export function daysBetween(fromIso, toIso) {
  const a = parts(fromIso);
  const b = parts(toIso);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}
