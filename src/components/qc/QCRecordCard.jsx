import React from 'react';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, Download, Send, Loader2, TrendingUp } from 'lucide-react';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const GRADE_COLORS = {
  'Excellent': 'text-green-400 bg-green-400/20',
  'Good': 'text-blue-400 bg-blue-400/20',
  'Fair': 'text-yellow-400 bg-yellow-400/20',
  'Needs Improvement': 'text-orange-400 bg-orange-400/20',
  'Critical': 'text-red-400 bg-red-400/20'
};

export default function QCRecordCard({ record, onEdit, onDelete, onDownloadPDF, onSendTelegram, sendingTg, canDelete }) {
  const gradeClass = GRADE_COLORS[record.final_grade] || 'text-muted-foreground bg-muted';
  const hasNewFormat = record.evaluation_score !== undefined && record.evaluation_score !== null;

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {record.tutor_photo ? (
            <img src={record.tutor_photo} className="w-10 h-10 rounded-xl object-cover" alt="" />
          ) : (
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
              {record.tutor_name?.charAt(0)}
            </div>
          )}
          <div>
            <div className="font-semibold text-foreground">{record.tutor_name}</div>
            <div className="text-xs text-muted-foreground">
              {record.period ? `Period ${record.period} — ` : ''}{MONTHS[(record.period_month || 1) - 1]} {record.period_year}
            </div>
            {record.record_date && (
              <div className="text-xs text-muted-foreground/60">
                {new Date(record.record_date).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' })}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => onEdit(record)} className="w-7 h-7 p-0 hover:bg-primary/20 hover:text-primary">
            <Pencil className="w-3 h-3" />
          </Button>
          {canDelete && (
            <Button size="sm" variant="ghost" onClick={() => onDelete(record.id)} className="w-7 h-7 p-0 hover:bg-destructive/20 hover:text-destructive">
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {hasNewFormat ? (
          <>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
              <span className="text-xl font-bold text-foreground">{Math.round(record.evaluation_score)}</span>
              <span className="text-xs text-muted-foreground">/ 100</span>
            </div>
            {record.final_grade && (
              <span className={`text-xs px-2.5 py-1 rounded-lg font-semibold ${gradeClass}`}>
                {record.final_grade}
              </span>
            )}
          </>
        ) : (
          <span className="text-xs text-muted-foreground italic">Legacy record — no score calculated</span>
        )}
      </div>

      {record.auto_generated_notes && (
        <p className="text-xs text-muted-foreground line-clamp-2 italic">{record.auto_generated_notes}</p>
      )}

      <div className="text-xs text-muted-foreground">
        QC: <span className="text-foreground">{record.admin_qc_name}</span>
      </div>

      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={() => onDownloadPDF(record)} className="flex-1 gap-1.5 border-border text-xs h-8">
          <Download className="w-3 h-3" /> PDF
        </Button>
        <Button size="sm" variant="outline" onClick={() => onSendTelegram(record)} disabled={sendingTg} className="flex-1 gap-1.5 border-accent/30 text-accent hover:bg-accent/10 text-xs h-8">
          {sendingTg ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
          Telegram
        </Button>
      </div>
    </div>
  );
}