import React, { useEffect, useState } from 'react';
import { useAppAuth } from '@/lib/AppAuthContext';
import { invokeService } from '@/lib/appApi';
import { Button } from '@/components/ui/button';
import { MessageSquare, Loader2, Check, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { assignmentStatus, fmtDate, FEEDBACK_STATUS_META } from '@/lib/workflowUtils';

export default function MyWeeklyFeedbackPanel() {
  const { currentUser } = useAppAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await invokeService('weeklyFeedbackService', { action: 'list' });
      setItems((res.data?.items || []).filter((i) => i.tutor_id === currentUser.id));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (currentUser?.id) load(); }, [currentUser?.id]);

  const complete = async (item) => {
    setBusyId(item.id);
    try {
      const res = await invokeService('weeklyFeedbackService', { action: 'complete', id: item.id, status: 'completed' });
      if (res.data?.error) throw new Error(res.data.error);
      toast.success('Feedback marked as completed');
      load();
    } catch (err) {
      toast.error('Could not update', { description: err?.response?.data?.error || err.message });
    } finally {
      setBusyId('');
    }
  };

  const open = items.filter((i) => assignmentStatus(i) !== 'completed')
    .sort((a, b) => (a.week_end_date || '').localeCompare(b.week_end_date || ''));
  const overdue = items.filter((i) => assignmentStatus(i) === 'overdue');
  const completed = items.filter((i) => assignmentStatus(i) === 'completed');

  return (
    <div className="bg-card border border-border rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-chart-4" />
          <h2 className="font-semibold text-foreground">My Student Feedback</h2>
        </div>
        <div className="flex gap-3 text-xs">
          <span className="text-muted-foreground">{open.length} to do</span>
          {overdue.length > 0 && <span className="text-destructive font-medium">{overdue.length} overdue</span>}
          <span className="text-chart-3">{completed.length} done</span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No weekly feedback assigned yet. Your assigned classes will appear here.</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {[...open, ...completed.slice(0, 3)].map((item) => {
            const st = assignmentStatus(item);
            const meta = FEEDBACK_STATUS_META[st];
            return (
              <div key={item.id} className="flex items-center gap-3 bg-secondary/40 border border-border rounded-xl px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground truncate">{item.class_name || item.student_name || 'Class feedback'}</div>
                  <div className="text-[11px] text-muted-foreground">
                    Week {fmtDate(item.week_start_date)} – {fmtDate(item.week_end_date)}
                    {item.notes ? ` · ${item.notes}` : ''}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full border text-[10px] font-medium whitespace-nowrap ${meta.className}`}>
                  {st === 'overdue' && <AlertTriangle className="w-2.5 h-2.5 inline mr-1" />}{meta.label}
                </span>
                {st !== 'completed' && (
                  <Button size="sm" variant="outline" onClick={() => complete(item)} disabled={busyId === item.id} className="border-border h-7 px-2 text-xs gap-1">
                    {busyId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Done
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}