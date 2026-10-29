const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { jsPDF } from 'npm:jspdf@4.2.1';

const POINT_RGB = {
  1: [239, 68, 68],
  2: [249, 115, 22],
  3: [234, 179, 8],
  4: [59, 130, 246],
  5: [34, 197, 94],
};

function drawHeader(doc, pageNum = 1) {
  const W = 210;
  doc.setTextColor(124, 58, 237);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('Student Feedback Report', W / 2, 18, { align: 'center' });
  doc.setDrawColor(200, 200, 200);
  doc.line(15, 24, W - 15, 24);
}

function drawFooter(doc) {
  const W = 210, H = 297;
  doc.setFillColor(124, 58, 237);
  doc.rect(0, H - 15, W, 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text('Algonova Malaysia — Student Feedback Report', W / 2, H - 7, { align: 'center' });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await db.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { recordId } = await req.json();
    if (!recordId) {
      return Response.json({ error: 'Missing recordId' }, { status: 400 });
    }

    const record = await db.entities.FeedbackRecord.get(recordId);
    if (!record) {
      return Response.json({ error: 'Record not found' }, { status: 404 });
    }

    const perfAspects = await db.entities.StudentPerformanceCategory.filter({ is_active: true });
    const referrals = await db.entities.Referral.filter({ is_active: true });
    const referral = referrals.find(r => 
      r.student_name?.toLowerCase() === record.student_name?.toLowerCase()
    ) || referrals[0];
    
    // Get PDF settings (background image)
    const pdfSettings = await db.entities.PdfSettings.filter({ setting_key: 'background_image', is_active: true });
    const bgImageUrl = pdfSettings.length > 0 ? pdfSettings[0].setting_value : null;
    
    // Download background image if URL exists
    let bgImageData = null;
    if (bgImageUrl) {
      try {
        const response = await fetch(bgImageUrl);
        const arrayBuffer = await response.arrayBuffer();
        bgImageData = new Uint8Array(arrayBuffer);
      } catch (e) {
        console.error('Failed to load background image:', e);
      }
    }

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, H = 297;
    const studentName = record.student_name || 'Student';

    // Helper function to draw header
    const drawHeader = (pageNum) => {
      // Draw background image if available
      if (bgImageData) {
        try {
          doc.addImage(bgImageData, 'JPEG', 0, 0, W, H);
        } catch (e) {
          // Fallback to white background if image fails
          doc.setFillColor(255, 255, 255);
          doc.rect(0, 0, W, H, 'F');
        }
      } else {
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, W, H, 'F');
      }
      
      doc.setTextColor(124, 58, 237);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text('Student Feedback Report', W / 2, 18, { align: 'center' });
      doc.setDrawColor(200, 200, 200);
      doc.line(15, 24, W - 15, 24);
    };

    // Helper function to draw footer
    const drawFooter = () => {
      doc.setFillColor(124, 58, 237);
      doc.rect(0, H - 15, W, 15, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.text('Algonova Malaysia — Student Feedback Report', W / 2, H - 7, { align: 'center' });
    };

    // PAGE 1: Header, Info, Rating, Module
    drawHeader(1, 1);
    let y = 32;

    // Student & Tutor Info Box
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(15, y, W - 30, 38, 3, 3, 'F');
    doc.setTextColor(124, 58, 237);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('TUTOR', 25, y + 8);
    doc.setTextColor(30, 30, 40);
    doc.setFontSize(13);
    doc.text(record.tutor_name || 'N/A', 25, y + 18);
    doc.setTextColor(124, 58, 237);
    doc.text('STUDENT', 105, y + 8);
    doc.setTextColor(30, 30, 40);
    doc.text(studentName, 105, y + 18);
    doc.setTextColor(124, 58, 237);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('CREATED BY', 25, y + 24);
    doc.setTextColor(30, 30, 40);
    doc.setFontSize(11);
    const createdByName = record.created_by_name || record.tutor_name || 'N/A';
    const createdByLines = doc.splitTextToSize(createdByName, 80);
    doc.text(createdByLines, 25, y + 33);
    y += 44;

    // Rating Box - "Point Rating" label centered at top, "X / 5" and stars below it
    const stars = record.point || 0;
    doc.setFillColor(249, 250, 251);
    doc.roundedRect(15, y, W - 30, 24, 3, 3, 'F');
    doc.setTextColor(100, 100, 116);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Point Rating', W / 2, y + 5, { align: 'center' });
    
    // Draw "X / 5" text centered below the label
    const ratingText = `${stars} / 5`;
    doc.setFontSize(11);
    doc.setTextColor(234, 179, 8);
    doc.setFont('helvetica', 'bold');
    const textWidth = doc.getTextWidth(ratingText);
    const textX = (W - textWidth) / 2;
    doc.text(ratingText, textX, y + 11);
    
    // Draw 5 filled circles for stars centered below the text
    const starRadius = 1.8;
    const starSpacing = 3.5;
    const starsTotalWidth = 5 * starSpacing;
    const startX = (W - starsTotalWidth) / 2;
    const starY = y + 16;
    
    doc.setFillColor(234, 179, 8);
    for (let i = 0; i < 5; i++) {
      const cx = startX + (i * starSpacing) + (starSpacing / 2);
      doc.circle(cx, starY, starRadius, 'F');
    }
    y += 26;

    // Module Info - with large gaps between each field
    const moduleGap = 12;
    if (record.module_topic) {
      y += moduleGap;
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(15, y, W - 30, 3, 2, 2, 'F');
      doc.setTextColor(100, 100, 120);
      doc.setFontSize(7);
      doc.text(`Module: ${record.module_topic}`, 20, y + 2.5);
      y += 8;
    }
    if (record.key_result) {
      y += moduleGap;
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(15, y, W - 30, 3, 2, 2, 'F');
      doc.setTextColor(100, 100, 120);
      doc.setFontSize(7);
      doc.text(`Key Result: ${record.key_result}`, 20, y + 2.5);
      y += 8;
    }
    if (record.new_skills) {
      y += moduleGap;
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(15, y, W - 30, 3, 2, 2, 'F');
      doc.setTextColor(100, 100, 120);
      doc.setFontSize(7);
      doc.text(`Abilities / Skills: ${record.new_skills}`, 20, y + 2.5);
      y += 8;
    }
    if (record.project_link) {
      y += moduleGap;
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(15, y, W - 30, 3, 2, 2, 'F');
      doc.setTextColor(100, 100, 120);
      doc.setFontSize(7);
      doc.text(`Project Link:`, 20, y + 2.5);
      y += 6;
      const linkLines = doc.splitTextToSize(record.project_link, W - 55);
      doc.setTextColor(37, 99, 235);
      doc.setFontSize(7);
      doc.text(linkLines, 20, y + 2.5);
      y += (linkLines.length * 5) + 4;
    }

    drawFooter();

    // PAGE 2: Performance Evaluation
    doc.addPage();
    drawHeader(2, 2);
    y = 32;

    const perfItems = [];
    if (record.presence) perfItems.push({ label: 'Presence', raw: record.presence });
    if (record.involvement_difficulty) perfItems.push({ label: 'Involvement & Difficulty', raw: record.involvement_difficulty });
    if (record.task_completion) perfItems.push({ label: 'Task Completion', raw: record.task_completion });

    if (perfItems.length > 0) {
      doc.setTextColor(124, 58, 237);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Performance Evaluation', 20, y);
      y += 8;

      perfItems.forEach((item) => {
        const parts = (item.raw || '').split('::');
        const aspectKey = parts[0];
        const pointNum = parseInt(parts[1]) || 0;
        const embeddedDesc = parts.slice(2).join('::');
        const aspect = perfAspects.find(a => a.aspect_title === aspectKey || a.id === aspectKey);
        const maxPt = aspect?.max_point || 5;
        const desc = embeddedDesc || aspect?.[`point_${pointNum}_description`] || `Point ${pointNum}`;
        const rgb = POINT_RGB[pointNum] || POINT_RGB[3];

        const blockH = 20;
        if (y + blockH > H - 25) {
          drawFooter();
          doc.addPage();
          drawHeader(2);
          y = 32;
        }

        // Colored box for each performance item
        doc.setFillColor(rgb[0], rgb[1], rgb[2]);
        doc.roundedRect(15, y, W - 30, blockH, 4, 4, 'F');
        
        // Point circle badge
        doc.setFillColor(255, 255, 255);
        doc.circle(22, y + 10, 6, 'F');
        doc.setFillColor(rgb[0], rgb[1], rgb[2]);
        doc.circle(22, y + 10, 5, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(String(pointNum), 22, y + 12, { align: 'center' });

        // Label and point info
        doc.setTextColor(50, 50, 60);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(item.label, 32, y + 8);
        doc.setTextColor(124, 58, 237);
        doc.setFontSize(8);
        doc.text(`Point ${pointNum} / ${maxPt}`, W - 20, y + 8, { align: 'right' });

        // Description
        doc.setTextColor(60, 60, 70);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        const descLines = doc.splitTextToSize(desc.replace(/\(Student Name\)/gi, studentName).replace(/\[Student Name\]/gi, studentName), W - 55);
        doc.text(descLines, 32, y + 13);

        y += blockH + 6;
      });
    }

    drawFooter();

    // PAGE 3: Tutor Note & Referral
    doc.addPage();
    drawHeader(3, 3);
    y = 32;

    // Tutor Note
    if (record.tutor_note) {
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(15, y, W - 30, 4, 2, 2, 'F');
      doc.setTextColor(124, 58, 237);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text("Tutor's Note", 20, y + 2.5);
      y += 8;
      const noteLines = doc.splitTextToSize(record.tutor_note, W - 55);
      const noteH = noteLines.length * 5 + 10;
      if (y + noteH > H - 25) {
        drawFooter();
        doc.addPage();
        drawHeader(3);
        y = 32;
      }
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(15, y, W - 30, noteH, 4, 4, 'F');
      doc.setTextColor(60, 60, 70);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(noteLines, 20, y + 7);
      y += noteH + 8;
    }

    // Referral Notes
    if (referral && referral.notes) {
      doc.setFillColor(240, 248, 255);
      doc.roundedRect(15, y, W - 30, 4, 2, 2, 'F');
      doc.setTextColor(6, 182, 212);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('Referral Notes', 20, y + 2.5);
      y += 8;
      const plainText = referral.notes.replace(/<[^>]*>/g, '');
      const refLines = doc.splitTextToSize(plainText, W - 55);
      const refH = refLines.length * 5 + 10;
      if (y + refH > H - 25) {
        drawFooter();
        doc.addPage();
        drawHeader(3);
        y = 32;
      }
      doc.setFillColor(240, 248, 255);
      doc.roundedRect(15, y, W - 30, refH, 4, 4, 'F');
      doc.setTextColor(60, 60, 70);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(refLines, 20, y + 7);
      y += refH + 8;
    }

    drawFooter();

    const pdfArrayBuffer = doc.output('arraybuffer');
    const bytes = new Uint8Array(pdfArrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const pdfBase64 = btoa(binary);
    
    return Response.json({ 
      pdf: pdfBase64,
      filename: `Feedback_${record.student_name || 'report'}.pdf`
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});