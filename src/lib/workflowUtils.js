export const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function toKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function todayKey() {
  return toKey(new Date());
}

export function weekBounds(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: toKey(monday), end: toKey(sunday) };
}

export function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(String(value).slice(0, 10) + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function assignmentStatus(assignment) {
  if (assignment.status === 'completed') return 'completed';
  if (assignment.week_end_date && String(assignment.week_end_date).slice(0, 10) < todayKey()) return 'overdue';
  return 'pending';
}

export const FEEDBACK_STATUS_META = {
  pending: { label: 'Pending', className: 'bg-chart-4/15 text-chart-4 border-chart-4/30' },
  completed: { label: 'Completed', className: 'bg-chart-3/15 text-chart-3 border-chart-3/30' },
  overdue: { label: 'Overdue', className: 'bg-destructive/15 text-destructive border-destructive/30' },
};

export const TASK_STATUS_META = {
  pending: { label: 'Pending', className: 'bg-chart-4/15 text-chart-4 border-chart-4/30' },
  in_progress: { label: 'In Progress', className: 'bg-primary/15 text-primary border-primary/30' },
  completed: { label: 'Completed', className: 'bg-chart-3/15 text-chart-3 border-chart-3/30' },
  need_assistance: { label: 'Need Assistance', className: 'bg-destructive/15 text-destructive border-destructive/30' },
  cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground border-border' },
};

export const PRIORITY_META = {
  Low: 'bg-muted text-muted-foreground border-border',
  Medium: 'bg-accent/15 text-accent border-accent/30',
  High: 'bg-chart-4/15 text-chart-4 border-chart-4/30',
  Urgent: 'bg-destructive/15 text-destructive border-destructive/30',
};

export const TASK_CATEGORIES = ['Student Feedback', 'QC Submission', 'Administration', 'Class Preparation', 'Training', 'Student Follow-up', 'Other'];
export const TASK_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

// Period 1: 1st–16th of the month. Period 2: 17th–last day of the month.
export function qcPeriodFromDate(value) {
  const key = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const d = new Date(`${key}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDate();
  const period = day <= 16 ? 1 : 2;
  return {
    class_date: key,
    period,
    period_month: d.getMonth() + 1,
    period_year: d.getFullYear(),
    period_label: period === 1 ? 'Period 1 (1–16)' : 'Period 2 (17–end of month)',
  };
}

export function periodLabel(period) {
  if (Number(period) === 1) return 'Period 1 (1–16)';
  if (Number(period) === 2) return 'Period 2 (17–end)';
  return '—';
}

export function isTaskOverdue(task) {
  if (!task || ['completed', 'cancelled'].includes(task.status)) return false;
  return !!task.deadline && String(task.deadline).slice(0, 10) < todayKey();
}

export function daysUntil(value) {
  if (!value) return null;
  const target = new Date(String(value).slice(0, 10) + 'T00:00:00');
  const now = new Date(todayKey() + 'T00:00:00');
  return Math.round((target - now) / 86400000);
}