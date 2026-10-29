const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Star, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// Render referral HTML with links styled in blue
function ReferralContent({ html }) {
  if (!html) return null;
  // Inject inline style for anchor tags so html2canvas captures the color
  const styled = html.replace(/<a /g, '<a style="color:#2563eb;text-decoration:underline;" ');
  return (
      <div
        className="text-sm text-gray-700 text-justify referral-html"
        style={{ lineHeight: '1.7' }}
        dangerouslySetInnerHTML={{ __html: styled }}
      />
  );
}

function InfoBlock({ label, value, children }) {
  return (
    <div>
      <p className="text-xs text-gray-700 uppercase font-semibold">{label}</p>
      {children ? children : <p className="text-xs text-gray-800 mt-0.5 text-justify">{value || '-'}</p>}
    </div>
  );
}

const POINT_COLORS = [
  { bg: '#fef2f2', border: '#fca5a5', text: '#ef4444', dot: '#ef4444' },
  { bg: '#fff7ed', border: '#fdba74', text: '#f97316', dot: '#f97316' },
  { bg: '#fefce8', border: '#fde047', text: '#eab308', dot: '#eab308' },
  { bg: '#eff6ff', border: '#93c5fd', text: '#3b82f6', dot: '#3b82f6' },
  { bg: '#f0fdf4', border: '#86efac', text: '#22c55e', dot: '#22c55e' },
];

function getColorForPoint(pointNum, maxPoint) {
  const indices = maxPoint === 5 ? [0,1,2,3,4] : maxPoint === 4 ? [0,1,2,4] : [0,2,4];
  const idx = indices[pointNum - 1] ?? pointNum - 1;
  return POINT_COLORS[idx] || POINT_COLORS[2];
}

export default function FeedbackPDFPreview({ open, onOpenChange, record, decodePerfValue }) {
  const [isDownloading, setIsDownloading] = React.useState(false);
  const previewRef = useRef(null);
  const [bgImageUrl, setBgImageUrl] = React.useState(null);

  // Fetch active referral data
  const { data: referrals = [] } = useQuery({
    queryKey: ['referrals-active'],
    queryFn: () => db.entities.Referral.filter({ is_active: true }),
    enabled: open,
  });

  // Fetch PDF background settings
  const { data: pdfSettings = [] } = useQuery({
    queryKey: ['pdf-settings-background'],
    queryFn: () => db.entities.PdfSettings.filter({ setting_key: 'background_image', is_active: true }),
    enabled: open,
  });

  React.useEffect(() => {
    if (pdfSettings && pdfSettings.length > 0) {
      setBgImageUrl(pdfSettings[0].setting_value);
    } else {
      setBgImageUrl(null);
    }
  }, [pdfSettings]);

  // Find referral matching this student name (or use first active if no match)
  const referral = referrals.find(r => 
    r.student_name?.toLowerCase() === record?.student_name?.toLowerCase()
  ) || referrals[0];

  if (!record) return null;

  // Extract all anchor links from an HTML element and return their bounding boxes + href
  const extractLinks = (containerEl, canvasWidth, canvasHeight, pdfWidth, pdfHeight) => {
    const anchors = containerEl.querySelectorAll('a[href]');
    const containerRect = containerEl.getBoundingClientRect();
    const scaleX = pdfWidth / canvasWidth;
    const scaleY = pdfHeight / canvasHeight;
    const links = [];
    anchors.forEach(a => {
      const href = a.getAttribute('href');
      if (!href || href === '#') return;
      const rect = a.getBoundingClientRect();
      const x = (rect.left - containerRect.left) * scaleX;
      const y = (rect.top - containerRect.top) * scaleY;
      const w = rect.width * scaleX;
      const h = rect.height * scaleY;
      links.push({ href, x, y, w, h });
    });
    return links;
  };

  const handleDownload = async () => {
    setIsDownloading(true);

    try {
      const pages = previewRef.current?.children;
      if (!pages || pages.length === 0) throw new Error('Preview not available');

      const pdf = new jsPDF({ unit: 'mm', format: 'a4', hotfixes: ['px_scaling'] });
      const A4_WIDTH = 210;
      const A4_HEIGHT = 297;

      for (let i = 0; i < pages.length; i++) {
        if (i > 0) pdf.addPage([A4_WIDTH, A4_HEIGHT], 'p');
        
        const page = pages[i];
        const canvas = await html2canvas(page, {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false,
          onclone: (clonedDoc) => {
            // html2canvas drops inter-word spaces when letter-spacing is 0;
            // a tiny non-zero letter-spacing on the clone restores correct spacing
            // (download only — the on-screen preview stays untouched)
            clonedDoc.body.style.letterSpacing = '0.05px';
          },
        });

        const imgData = canvas.toDataURL('image/png');
        const imgWidth = A4_WIDTH;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight, undefined, 'FAST');

        // Add clickable link annotations on top of the rendered image
        const links = extractLinks(page, canvas.width / 2, canvas.height / 2, imgWidth, imgHeight);
        links.forEach(({ href, x, y, w, h }) => {
          pdf.link(x, y, w, h, { url: href });
        });
      }

      const filename = `Feedback_${record.student_name || 'report'}.pdf`;
      pdf.save(filename);
    } catch (error) {
      console.error('PDF generation failed:', error);
      alert('Failed to generate PDF: ' + error.message);
    } finally {
      setIsDownloading(false);
    }
  };

  const stars = record.point || 0;
  const studentName = record.student_name || 'Student';

  const presDecoded = decodePerfValue ? decodePerfValue(record.presence) : null;
  const invDecoded = decodePerfValue ? decodePerfValue(record.involvement_difficulty) : null;
  const taskDecoded = decodePerfValue ? decodePerfValue(record.task_completion) : null;

  const perfItems = [
    { label: 'Presence', decoded: presDecoded, raw: record.presence },
    { label: 'Involvement & Difficulty', decoded: invDecoded, raw: record.involvement_difficulty },
    { label: 'Task Completion', decoded: taskDecoded, raw: record.task_completion },
  ].filter(p => p.decoded || p.raw);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-5xl max-h-[95vh] overflow-y-auto p-4">
        <div className="flex items-center justify-between pb-2 pr-12">
          <DialogTitle className="text-lg font-semibold">PDF Preview</DialogTitle>
          <Button 
            onClick={handleDownload} 
            size="sm" 
            className="bg-primary hover:bg-primary/90 gap-2"
            disabled={isDownloading}
          >
            {isDownloading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</>
            ) : (
              <><Download className="w-4 h-4" /> Download PDF</>
            )}
          </Button>
        </div>

        {/* PDF Preview Container - scrollable pages */}
        <div
          ref={previewRef}
          className="space-y-2 overflow-y-auto max-h-[70vh] p-2 bg-gray-100 rounded"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          {/* Page 1 */}
          <div
            className="relative bg-white text-gray-800 shadow-md mx-auto border border-gray-200"
            style={{ 
              width: '210mm', 
              minHeight: '297mm', 
              padding: '10mm',
              boxSizing: 'border-box'
            }}
          >
            {/* Background Image */}
            {bgImageUrl && (
              <img
                src={bgImageUrl}
                alt="background"
                className="absolute inset-0 w-full h-full object-cover opacity-20 pointer-events-none"
              />
            )}

            {/* Header */}
            <div className="relative z-10 pb-4 px-4 border-b border-gray-200 mb-6">
              <div className="relative">
                <img
                  src="https://lh3.googleusercontent.com/d/1oZOXv5EMDbbZRXl6MuDcUVwkRAz0AvJM"
                  alt="Algonova"
                  className="h-12 w-auto"
                />
                <h1 className="text-xl font-bold text-gray-900 text-center">Student Feedback Report</h1>
              </div>
            </div>

            <div className="relative z-10 pb-2 px-4 space-y-4">
            {/* Student & Tutor Info */}
            <div className="grid grid-cols-2 gap-4">
              <InfoBlock label="Student Name" value={studentName} />
              <InfoBlock label="Tutor Name" value={record.tutor_name} />
              <InfoBlock label="Created by" value={record.created_by_name || record.tutor_name || '-'} />
              <InfoBlock label="Class Code" value={record.class_code} />
              <InfoBlock label="Month" value={record.month ? `Month ${record.month}` : '-'} />
              {record.course_name && <InfoBlock label="Course" value={record.course_name} />}
            </div>

            {/* Module Topic (left) + Point Rating (right) — side by side */}
            <div className="grid grid-cols-2 gap-4">
              <InfoBlock label="Module Topic" value={record.module_topic} />
              <InfoBlock label="Point Rating">
                <div className="flex flex-col items-start gap-2 mt-0.5">
                  <span className="font-bold text-base text-yellow-500">{stars} / 5</span>
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => {
                      const fill = Math.min(Math.max(stars - (s - 1), 0), 1);
                      return (
                        <div key={s} className="relative w-5 h-5">
                          <Star className="w-5 h-5 text-gray-200" />
                          <div className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                            <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </InfoBlock>
            </div>

            {/* Module Info - with large gaps between each field */}
            <div className="mt-4">
              {record.key_result && (
                <div className="mb-4">
                  <InfoBlock label="Key Result" value={record.key_result} />
                </div>
              )}
              {record.new_skills && (
                <div className="mb-4">
                  <InfoBlock label="Abilities / Skills Acquired" value={record.new_skills} />
                </div>
              )}
              {record.project_link && (
                <div className="mb-4">
                  <p className="text-xs text-gray-700 uppercase font-semibold">Project Link</p>
                  <p className="text-sm text-blue-600 mt-1 break-all">{record.project_link}</p>
                </div>
              )}
            </div>

            {/* Referral Notes - Page 1 */}
            {referral && (
              <div className="relative z-10 px-4">
                <div className="rounded-xl">
                  <ReferralContent html={referral.notes} />
                  <div className="flex justify-center">
                    <a
                      href="https://wa.link/wdtoac"
                      target="_blank"
                      rel="noopener noreferrer"
                      >
                        <img
                        src="https://res.cloudinary.com/dnfam9udn/image/upload/v1782810281/click_here_for_details_jh1tn0.png"
                        alt="Referral Banner"
                        crossOrigin="anonymous"
                        style={{
                          width: "480px",
                          height: "auto",
                          borderRadius: "12px",
                          }}
                        />
                    </a>
                  </div>
                </div>
              </div>
            )}
            </div>
          </div>

          {/* Page 2 - Performance Evaluation */}
          <div
            className="relative bg-white text-gray-800 shadow-md mx-auto border border-gray-200"
            style={{ 
              width: '210mm', 
              minHeight: '297mm', 
              padding: '10mm',
              boxSizing: 'border-box'
            }}
          >
            {/* Background Image */}
            {bgImageUrl && (
              <img
                src={bgImageUrl}
                alt="background"
                className="absolute inset-0 w-full h-full object-cover opacity-20 pointer-events-none"
              />
            )}

            {/* Header */}
            <div className="relative z-10 pb-4 px-4 border-b border-gray-200 mb-6">
              <div className="relative">
                <img
                  src="https://lh3.googleusercontent.com/d/1oZOXv5EMDbbZRXl6MuDcUVwkRAz0AvJM"
                  alt="Algonova"
                  className="h-12 w-auto"
                />
                <h1 className="text-xl font-bold text-gray-900 mt-3 text-center">Student Feedback Report</h1>
              </div>
            </div>

            <div className="relative z-10 pb-6 px-4 space-y-6">
              {/* Performance Section */}
              {perfItems.length > 0 && (
                <div>
                  <p className="text-base text-gray-800 uppercase font-bold mb-4 tracking-wide text-center">Performance Evaluation</p>
                  <div className="space-y-4">
                    {perfItems.map(({ label, decoded, raw }) => {
                      if (decoded) {
                        const maxPt = decoded.aspect?.max_point || 5;
                        const color = getColorForPoint(decoded.pointNum, maxPt);
                        return (
                          <div
                            key={label}
                            style={{ 
                              backgroundColor: color.bg, 
                              borderColor: color.border, 
                              borderWidth: 2, 
                              borderStyle: 'solid',
                              boxShadow: `0 2px 8px ${color.border}20`
                            }}
                            className="rounded-2xl p-5 hover:shadow-lg transition-shadow"
                          >
                            <div className="flex items-start gap-4">
                              <div className="flex-1">
                                <div className="flex items-center justify-between gap-4 mb-2">
                                  <p className="text-sm font-bold text-gray-700 uppercase tracking-wide text-justify">{label}</p>
                                </div>
                                <p className="text-sm text-gray-800 leading-relaxed text-justify">
                                  {decoded.description
                                    ? decoded.description.replace(/\(Student Name\)/gi, studentName).replace(/\[Student Name\]/gi, studentName)
                                    : `Point ${decoded.pointNum}`}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div key={label} className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                          <p className="text-xs text-gray-400 uppercase font-semibold text-justify">{label}</p>
                          <p className="text-sm text-gray-700 mt-0.5 text-justify">{raw}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tutor Note - below Performance */}
              {record.tutor_note && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-base text-gray-800 uppercase font-bold mb-2 text-center">Tutor's Note</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap text-justify">{record.tutor_note}</p>
                </div>
              )}
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}