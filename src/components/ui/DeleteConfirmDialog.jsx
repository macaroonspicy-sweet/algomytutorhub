import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Trash2, AlertTriangle } from 'lucide-react';

export default function DeleteConfirmDialog({ open, onOpenChange, onConfirm, title, description }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-sm p-0 overflow-hidden">
        <div className="flex flex-col items-center text-center px-6 pt-8 pb-6 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-destructive/15 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-destructive" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold text-foreground">{title || 'Delete Record'}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {description || 'Are you sure you want to delete this record? This action cannot be undone.'}
            </p>
          </div>
          <div className="flex w-full gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1 border-border"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground gap-2"
              onClick={() => { onConfirm(); onOpenChange(false); }}
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}