import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';

export default function PDFPreviewDialog({ open, onOpenChange, pdfUrl, title, onDownload, downloading }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-4xl w-full h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-border flex-row items-center justify-between">
          <DialogTitle className="text-base">{title}</DialogTitle>
          <Button
            size="sm"
            onClick={onDownload}
            disabled={downloading}
            className="bg-primary hover:bg-primary/90 gap-2 mr-6"
          >
            {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Download PDF
          </Button>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          {pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="w-full h-full border-0"
              title="PDF Preview"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Generating preview...
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}