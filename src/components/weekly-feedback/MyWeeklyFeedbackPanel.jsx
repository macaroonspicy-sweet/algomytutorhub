import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAppAuth } from '@/lib/AppAuthContext';
import { MessageSquare, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { assignmentStatus, fmtDate } from '@/lib/workflowUtils';

export default function MyWeeklyFeedbackPanel() {
  const { currentUser } = useAppAuth();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');

  const loadMyAssignments = async () => {
    if (!currentUser?.id && !currentUser?.full_name) return;
    setLoading(true);

    try {
      // 1. Fetch dari tabel yang benar: WeeklyFeedbackAssignment
      const { data, error } = await supabase
        .from('WeeklyFeedbackAssignment')
        .select('*')
        .order('created_date', { ascending: false });

      if (error) throw error;

      if (data) {
        // 2. Filter tugas berdasarkan ID Tutor ATAU Nama Tutor yang sedang login
        const myData = data.filter((item) => {
          const isMyId = item.tutor_id && String(item.tutor_id) === String(currentUser.id);
          const isMyName = item.tutor_name && 
            item.tutor_name.toLowerCase().trim() === (currentUser.full_name || currentUser.name || '').toLowerCase().trim();
          
          return isMyId || isMyName;
        });

        setAssignments(myData);
      }
    } catch (err) {
      console.error('Error loading My Weekly Feedback Panel:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMyAssignments();
  }, [currentUser?.id, currentUser?.full_name]);

  const handleMarkComplete = async (item) => {
    setBusyId(item.id);
    try {
      const { error } = await supabase
        .from('WeeklyFeedbackAssignment')
        .update({
          status: 'completed',
          completed_by_name: currentUser?.full_name || currentUser?.name || 'Tutor',
          completed_at: new Date().toISOString()
        })
        .eq('id', item.id);

      if (error) throw error;

      toast.success('Feedback assignment completed');
      loadMyAssignments();
    } catch (err) {
      toast.error('Failed to update status', { description: err.message });
    } finally {
      setBusyId('');
    }
  };

  const pendingAssignments = assignments.filter((a) => assignmentStatus(a) !== 'completed');
  const completedAssignments = assignments.filter((a) => assignmentStatus(a) === 'completed');

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-chart-4" />
          <h2 className="font-semibold text-foreground">My Student Feedback</h2>
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <span><strong className="text-foreground">{pendingAssignments.length}</strong> to do</span>
          <span>•</span>
          <span className="text-emerald-500 font-medium">{completedAssignments.length} done</span>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : assignments.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No weekly feedback assigned yet. Your assigned classes will appear here.
        </div>
      ) : (
        <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
          {assignments.map((item) => {
            const st = assignmentStatus(item);
            const isDone = st === 'completed';

            return (
              <div
                key={item.id}
                className="flex items-center justify-between bg-secondary/40 border border-border/60 rounded-xl p-3 hover:bg-secondary/70 transition-colors"
              >
                <div className="space-y-0.5">
                  <div className="text-sm font-medium text-foreground flex items-center gap-2">
                    {item.class_name || item.student_name || 'Class Assignment'}
                    {isDone && (
                      <span className="text-[10px] px-2 py-0.2 rounded-full bg-emerald-500/15 text-emerald-400 font-normal">
                        Done
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {[item.course_name, item.class_code].filter(Boolean).join(' · ')}
                  </div>
                  {item.week_start_date && (
                    <div className="text-[10px] text-muted-foreground">
                      Week of {fmtDate(item.week_start_date)}
                    </div>
                  )}
                </div>

                {!isDone && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleMarkComplete(item)}
                    disabled={busyId === item.id}
                    className="h-8 px-2.5 text-xs text-chart-3 hover:bg-chart-3/15 gap-1.5 shrink-0"
                  >
                    {busyId === item.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    Mark Done
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