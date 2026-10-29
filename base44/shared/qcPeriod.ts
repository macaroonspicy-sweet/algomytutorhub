const pad = (n) => String(n).padStart(2, '0');

export function dateKeyOf(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isValidDateKey(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key || ''))) return false;
  const [y, m, d] = key.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

// Period 1: 1st–16th of the month. Period 2: 17th–last day of the month.
export function qcPeriodFor(dateValue) {
  const key = dateKeyOf(dateValue);
  if (!isValidDateKey(key)) return null;
  const [year, month, day] = key.split('-').map(Number);
  const period = day <= 16 ? 1 : 2;
  return {
    class_date: key,
    period,
    period_month: month,
    period_year: year,
    period_label: period === 1 ? 'Period 1 (1–16)' : 'Period 2 (17–end of month)',
  };
}