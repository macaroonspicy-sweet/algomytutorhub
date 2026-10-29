import React from 'react';
import { ClipboardCheck, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { assignmentStatus, FEEDBACK_STATUS_META } from '@/lib/workflowUtils';

function StatCard({ label, value, icon: Icon, tone }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${tone}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      </div>
    </div>
  );
}

export default function WeeklyFeedbackStats({ items }) {
  const total = items.length;
  const completed = items.filter((i) => assignmentStatus(i) === 'completed').length;
  const overdue = items.filter((i) => assignmentStatus(i) === 'overdue').length;
  const pending = items.filter((i) => assignmentStatus(i) === 'pending').length;
  const completionPct = total ? Math.round((completed / total) * 100) : 0;

  const byTutor = Object.values(items.reduce((acc, item) => {
    const key = item.tutor_id || 'unknown';
    if (!acc[key]) {
      acc[key] = { id: key, name: item.tutor_name || 'Unknown tutor', total: 0, completed: 0, pending: 0, overdue: 0 };
    }
    const status = assignmentStatus(item);
    acc[key].total += 1;
    acc[key][status] += 1;
    return acc;
  }, {})).sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Total assignments" value={total} icon={ClipboardCheck} tone="bg-primary/70" />
        <StatCard label="Completed" value={completed} icon={CheckCircle2} tone="bg-chart-3/70" />
        <StatCard label="Pending" value={pending} icon={Clock} tone="bg-chart-4/70" />
        <StatCard label="Overdue" value={overdue} icon={AlertTriangle} tone="bg-destructive/70" />
      </div>

      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-foreground text-sm">Completion by tutor</h2>
          <span className="text-sm font-bold text-chart-3">{completionPct}% overall</span>
        </div>
        {byTutor.length === 0 ? (
          <p className="text-sm text-muted-foreground">No assignments in this view yet.</p>
        ) : (
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {byTutor.map((tutor) => {
              const pct = tutor.total ? Math.round((tutor.completed / tutor.total) * 100) : 0;
              return (
                <div key={tutor.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{tutor.name}</span>
                    <span className="text-muted-foreground">
                      {tutor.completed}/{tutor.total} done · {pct}%
                      {tutor.overdue > 0 && <span className="text-destructive"> · {tutor.overdue} overdue</span>}
                    </span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-chart-3 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-border text-[11px]">
          {Object.entries(FEEDBACK_STATUS_META).map(([key, meta]) => (
            <span key={key} className={`px-2 py-0.5 rounded-full border ${meta.className}`}>{meta.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}