/** Resta/suma días a una fecha YYYY-MM-DD y devuelve YYYY-MM-DD */
export function shiftDate(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Rango de fechas para GSC: [hoy - lagDays - windowDays, hoy - lagDays - 1].
 * GSC suele tener 2-3 días de rezago en datos frescos, por eso el `lagDays`.
 */
export function lastNDays(windowDays, { lagDays = 2, today = new Date().toISOString().slice(0, 10) } = {}) {
  const endDate = shiftDate(today, -lagDays);
  const startDate = shiftDate(endDate, -(windowDays - 1));
  return { startDate, endDate };
}

/** El rango del mismo largo, inmediatamente anterior a `range`. Útil para "vs período anterior". */
export function previousPeriod(range) {
  const days = Math.round((new Date(range.endDate) - new Date(range.startDate)) / 86400000) + 1;
  const endDate = shiftDate(range.startDate, -1);
  const startDate = shiftDate(endDate, -(days - 1));
  return { startDate, endDate };
}

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "2026-08-01" -> "01 ago 2026" (mismo formato usado en meta.periodStart/periodEnd) */
export function formatDateEs(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${String(d).padStart(2, '0')} ${MONTHS_ES[m - 1]} ${y}`;
}
