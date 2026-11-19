import React from 'react';
import { Award } from 'lucide-react';

export default function TutorMetric() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2.5">
            <Award className="w-6 h-6 text-primary" />
            Tutor Metric
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Quality updated monthly • Attendance &amp; Discipline updated weekly (every Tuesday)
          </p>
        </div>
      </div>

      <div className="bg-white border border-border rounded-2xl p-8 text-center text-sm text-muted-foreground">
        Tutor Metric table &amp; analytics module ready for Step 4 integration.
      </div>
    </div>
  );
}