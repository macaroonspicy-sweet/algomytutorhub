import React from 'react';
import { ShieldCheck } from 'lucide-react';

export default function TutorDiscipline() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-primary" />
            Tutor Discipline
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Updated weekly (every Tuesday) • Monthly Feedback &amp; Meeting Presence monitoring
          </p>
        </div>
      </div>

      <div className="bg-white border border-border rounded-2xl p-8 text-center text-sm text-muted-foreground">
        Discipline table &amp; QC Meeting Attendance module ready for Step 3 integration.
      </div>
    </div>
  );
}