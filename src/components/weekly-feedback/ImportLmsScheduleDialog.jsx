// src/components/weekly-feedback/ImportLmsScheduleDialog.jsx
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { invokeService } from '@/lib/appApi';

export default function ImportLmsScheduleDialog({ open, onOpenChange, onImportSuccess }) {
  const [rawText, setRawText] = useState('');
  const [parsedItems, setParsedItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleParse = () => {
    if (!rawText.trim()) {
      toast.error('Please paste table data from LMS first');
      return;
    }

    const lines = rawText.split('\n');
    const items = [];

    lines.forEach((line) => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;

      // Skip header row if pasted
      if (
        trimmedLine.toLowerCase().startsWith('date') ||
        trimmedLine.toLowerCase().includes("tutor's name") ||
        trimmedLine.toLowerCase().includes('class code')
      ) {
        return;
      }

      // Split by tab characters (\t) from LMS table copy-paste
      const cols = trimmedLine.split('\t').map((c) => c.trim());

      let className = '';
      let tutorName = '';
      let lessonNum = null;

      if (cols.length >= 5) {
        // LMS table structure: [0] Date, [1] Lesson, [2] Class Code, [3] Day, [4] Tutor Name
        lessonNum = parseInt(cols[1], 10);
        className = cols[2] || 'LMS Class';
        tutorName = cols[4] || 'Unassigned Tutor';
      } else {
        // Fallback RegEx parsing for unformatted lines
        const lessonMatch = trimmedLine.match(/(?:lesson|pertemuan|l)\s*(\d+)/i) || trimmedLine.match(/\b(\d+)\b/);
        lessonNum = lessonMatch ? parseInt(lessonMatch[1], 10) : null;
        className = cols[0] || 'LMS Class';
        tutorName = cols[1] || 'Tutor';
      }

      // Filter only Lesson multiples of 4 (Lesson 4, 8, 12, 16, etc.)
      if (lessonNum && !isNaN(lessonNum) && lessonNum % 4 === 0) {
        items.push({
          class_name: className,
          tutor_name: tutorName,
          lesson_number: lessonNum,
          month_period: lessonNum / 4,
          raw_line: trimmedLine,
        });
      }
    });

    if (items.length === 0) {
      toast.warning('No classes with Lesson multiples of 4 (Lesson 4, 8, 12, etc.) were found in the pasted text.');
    } else {
      toast.success(`Successfully detected ${items.length} classes matching Lesson 4 multiples!`);
    }

    setParsedItems(items);
  };

  const handleGenerateTasks = async () => {
    if (!parsedItems.length) return;
    setLoading(true);

    try {
      for (const item of parsedItems) {
        await invokeService('weeklyFeedbackService', {
          action: 'createAssignment',
          class_name: item.class_name,
          tutor_name: item.tutor_name,
          month_period: item.month_period,
          lesson_number: item.lesson_number,
        });
      }

      toast.success('All evaluation tasks for Lesson 4 multiples were created successfully!');
      onImportSuccess?.();
      onOpenChange(false);
      setRawText('');
      setParsedItems([]);
    } catch (err) {
      toast.error('Failed to save imported schedule data', { description: err?.message || 'Server error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-chart-3" />
            Import LMS Schedule (Lesson 4 Multiples)
          </DialogTitle>
          <DialogDescription>
            Paste schedule data directly from LMS (`lms.algonova.id/group/default/schedule`). The system automatically filters and extracts classes on Lesson 4, 8, 12, etc.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={8}
            placeholder="Paste your copied LMS table data here..."
            className="bg-muted border-border font-mono text-xs"
          />

          <Button onClick={handleParse} variant="outline" className="w-full border-border">
            Filter & Parse Lesson 4 Multiples
          </Button>

          {parsedItems.length > 0 && (
            <div className="space-y-2 border-t border-border pt-3">
              <div className="text-xs font-semibold text-foreground flex justify-between">
                <span>Detected Target Classes:</span>
                <span className="text-chart-3">{parsedItems.length} Classes Found</span>
              </div>
              <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                {parsedItems.map((item, idx) => (
                  <div key={idx} className="bg-secondary/40 border border-border rounded-xl p-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-medium text-foreground">{item.class_name}</div>
                      <div className="text-muted-foreground">
                        Tutor: <span className="text-foreground font-medium">{item.tutor_name}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline" className="border-chart-3/40 text-chart-3">
                        Lesson {item.lesson_number} (Month {item.month_period})
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>

              <Button onClick={handleGenerateTasks} disabled={loading} className="w-full bg-chart-3/90 hover:bg-chart-3 text-white mt-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Generate Feedback Assignments for Tutors
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}