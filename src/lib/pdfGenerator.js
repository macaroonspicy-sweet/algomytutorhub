const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import jsPDF from 'jspdf';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const LOGO_URL = 'https://lh3.googleusercontent.com/d/1oZOXv5EMDbbZRXl6MuDcUVwkRAz0AvJM';

async function loadImageAsDataUrl(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function drawHeader(doc, W, title, month, year, accentColor, logoDataUrl, subtitle) {
  doc.setFillColor(...accentColor);
  doc.rect(0, 0, W, 45, 'F');
  if (logoDataUrl) {
    try { doc.addImage(logoDataUrl, 'PNG', 7, 4, 40, 16); } catch (e) {}
  }
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(subtitle ? 17 : 20);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 105, subtitle ? 22 : 26, { align: 'center' });
  if (subtitle) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(subtitle, 105, 31, { align: 'center' });
  }
  const badgeW = 36, badgeH = 16;
  const badgeX = W - badgeW - 8;
  const badgeY = 45 - badgeH - 6;
  doc.setFillColor(20, 15, 40);
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 3, 3, 'F');
  doc.setTextColor(6, 182, 212);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('PERIOD', badgeX + badgeW / 2, badgeY + 5.5, { align: 'center' });
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.text(`${MONTHS[month - 1]} ${year}`, badgeX + badgeW / 2, badgeY + 12, { align: 'center' });
}

function drawFooter(doc, W, H, text, color) {
  doc.setFillColor(...color);
  doc.rect(0, H - 15, W, 15, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.text(text, W / 2, H - 5, { align: 'center' });
}

const GRADE_RGB = {
  'Excellent':         [34, 197, 94],
  'Good':              [59, 130, 246],
  'Fair':              [234, 179, 8],
  'Needs Improvement': [249, 115, 22],
  'Critical':          [239, 68, 68],
};

// ── NEW: QC Evaluation PDF (per periode) ──────────────────────────────────────
export async function generateQCEvaluationPDF(record, aspects, { returnBlob = false } = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297;
  const logoDataUrl = await loadImageAsDataUrl(LOGO_URL);

  const getScore = (asp) => {
    const e = (record.aspect_scores || {})[asp.aspect_name];
    if (e && typeof e === 'object') return e.point || 0;
    if (typeof e === 'number') return e;
    const byId = (record.aspect_scores || {})[asp.id];
    return typeof byId === 'number' ? byId : 0;
  };
  const getDesc = (asp) => {
    const e = (record.aspect_scores || {})[asp.aspect_name];
    if (e && typeof e === 'object') return e.description || '';
    return asp[`score_${getScore(asp)}_description`] || '';
  };

  doc.setFillColor(13, 15, 23);
  doc.rect(0, 0, W, H, 'F');
  drawHeader(doc, W, 'QC EVALUATION REPORT', record.period_month, record.period_year,
    [124, 58, 237], logoDataUrl, `Period ${record.period || '-'} — Evaluated by ${record.admin_qc_name || 'N/A'}`);

  // Tutor info
  doc.setFillColor(22, 25, 40);
  doc.roundedRect(15, 52, W - 30, 26, 4, 4, 'F');
  doc.setTextColor(124, 58, 237); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text('TUTOR', 25, 62);
  doc.setTextColor(255, 255, 255); doc.setFontSize(15);
  doc.text(record.tutor_name || 'N/A', 25, 72);

  // Score + grade box
  const gradeRgb = GRADE_RGB[record.final_grade] || [150, 150, 150];
  doc.setFillColor(22, 25, 40);
  doc.roundedRect(140, 52, 55, 26, 4, 4, 'F');
  doc.setFillColor(...gradeRgb); doc.roundedRect(140, 52, 55, 26, 4, 4, 'F');
  doc.globalAlpha = 0.2; doc.roundedRect(140, 52, 55, 26, 4, 4, 'F'); doc.globalAlpha = 1;
  doc.setFillColor(22, 25, 40); doc.roundedRect(140, 52, 55, 26, 4, 4, 'F');
  doc.setDrawColor(...gradeRgb); doc.roundedRect(140, 52, 55, 26, 4, 4, 'S');
  doc.setTextColor(...gradeRgb); doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text(`${Math.round(record.evaluation_score || 0)} / 100`, 167.5, 65, { align: 'center' });
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.text(record.final_grade || '', 167.5, 73, { align: 'center' });

  // Aspect scores table
  let y = 87;
  doc.setFillColor(22, 25, 40);
  doc.roundedRect(15, y, W - 30, 10, 2, 2, 'F');
  doc.setTextColor(6, 182, 212); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text('EVALUATION ASPECT', 20, y + 7);
  doc.text('WEIGHT', 135, y + 7, { align: 'center' });
  doc.text('SCORE', 162, y + 7, { align: 'center' });
  doc.text('VALUE', 185, y + 7, { align: 'center' });
  y += 12;

  const scoreColors = { 1: [239,68,68], 2: [249,115,22], 3: [234,179,8], 4: [59,130,246], 5: [34,197,94] };

  (aspects || []).forEach((asp, i) => {
    if (y > 265) {
      drawFooter(doc, W, H, 'Algonova Malaysia — Confidential QC Report', [124, 58, 237]);
      doc.addPage();
      doc.setFillColor(13, 15, 23); doc.rect(0, 0, W, H, 'F');
      y = 20;
    }
    const bg = i % 2 === 0 ? [22, 25, 40] : [18, 20, 35];
    doc.setFillColor(...bg);
    doc.roundedRect(15, y, W - 30, 10, 2, 2, 'F');
    const score = getScore(asp);
    const weighted = ((score / 5) * (asp.weight_percentage || 0)).toFixed(2);
    const sRgb = score ? scoreColors[score] : [100, 100, 120];
    doc.setTextColor(200, 200, 220); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(`${i + 1}. ${asp.aspect_name}`, 19, y + 7);
    doc.text(`${asp.weight_percentage || 0}%`, 135, y + 7, { align: 'center' });
    doc.setTextColor(...sRgb); doc.setFont('helvetica', 'bold');
    doc.text(score ? String(score) : '-', 162, y + 7, { align: 'center' });
    doc.setTextColor(6, 182, 212);
    doc.text(score ? weighted : '-', 185, y + 7, { align: 'center' });
    y += 11;
  });

  // Total
  y += 2;
  const gradeRgb2 = GRADE_RGB[record.final_grade] || [150, 150, 150];
  doc.setFillColor(...gradeRgb2); doc.roundedRect(15, y, W - 30, 11, 2, 2, 'F');
  doc.globalAlpha = 0.25; doc.roundedRect(15, y, W - 30, 11, 2, 2, 'F'); doc.globalAlpha = 1;
  doc.setFillColor(20, 20, 40); doc.roundedRect(15, y, W - 30, 11, 2, 2, 'F');
  doc.setDrawColor(...gradeRgb2); doc.roundedRect(15, y, W - 30, 11, 2, 2, 'S');
  doc.setTextColor(...gradeRgb2); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text('TOTAL SCORE', 19, y + 7.5);
  doc.text(`${Math.round(record.evaluation_score || 0)} / 100`, 185, y + 7.5, { align: 'right' });
  doc.setTextColor(200, 200, 200); doc.setFontSize(8);
  doc.text(record.final_grade || '', 160, y + 7.5, { align: 'center' });
  y += 17;

  // Aspect Descriptions Notes
  const scoredAspects = (aspects || []).filter(asp => getScore(asp) > 0);
  if (scoredAspects.length > 0 || record.notes) {
    y += 6;

    // Section header
    if (y > H - 30) {
      drawFooter(doc, W, H, 'Algonova Malaysia — Confidential QC Report', [124, 58, 237]);
      doc.addPage();
      doc.setFillColor(13, 15, 23); doc.rect(0, 0, W, H, 'F');
      y = 15;
    }
    doc.setFillColor(22, 25, 40); doc.roundedRect(15, y, W - 30, 10, 2, 2, 'F');
    doc.setTextColor(124, 58, 237); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('EVALUATION NOTES', 20, y + 7);
    y += 17;

    // Each scored aspect description
    scoredAspects.forEach((asp) => {
      const score = getScore(asp);
      const desc = getDesc(asp);
      if (!desc) return;

      const label = `${asp.aspect_name} (Score ${score}):`;
      const descLines = doc.splitTextToSize(desc, W - 55);
      const blockH = 8 + descLines.length * 5 + 4;

      if (y + blockH > H - 20) {
        drawFooter(doc, W, H, 'Algonova Malaysia — Confidential QC Report', [124, 58, 237]);
        doc.addPage();
        doc.setFillColor(13, 15, 23); doc.rect(0, 0, W, H, 'F');
        y = 15;
      }

      doc.setTextColor(6, 182, 212); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
      doc.text(label, 19, y);
      y += 5;
      doc.setTextColor(180, 180, 200); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
      doc.text(descLines, 22, y);
      y += descLines.length * 5 + 4;
    });

    // Additional manual notes at the bottom
    if (record.notes) {
      if (y + 20 > H - 20) {
        drawFooter(doc, W, H, 'Algonova Malaysia — Confidential QC Report', [124, 58, 237]);
        doc.addPage();
        doc.setFillColor(13, 15, 23); doc.rect(0, 0, W, H, 'F');
        y = 15;
      }
      y += 4;
      const noteLines = doc.splitTextToSize(record.notes, W - 55);
      const noteBlockH = 14 + noteLines.length * 5;
      doc.setFillColor(22, 25, 40); doc.roundedRect(15, y, W - 30, noteBlockH, 3, 3, 'F');
      doc.setTextColor(124, 58, 237); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
      doc.text('ADDITIONAL NOTES', 20, y + 7);
      doc.setTextColor(200, 200, 220); doc.setFont('helvetica', 'normal');
      doc.text(noteLines, 20, y + 13);
      y += noteBlockH + 4;
    }
  }

  drawFooter(doc, W, H, 'Algonova Malaysia — Confidential QC Report', [124, 58, 237]);
  const filename = `QC_Eval_${record.tutor_name}_Period${record.period}_${MONTHS[record.period_month - 1]}_${record.period_year}.pdf`;
  if (returnBlob) return doc.output('blob');
  doc.save(filename);
}

// ── NEW: QC Monthly PDF ───────────────────────────────────────────────────────
export async function generateQCMonthlyPDF(monthly, p1Record, p2Record, aspects, { returnBlob = false } = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297;
  const logoDataUrl = await loadImageAsDataUrl(LOGO_URL);

  doc.setFillColor(13, 15, 23);
  doc.rect(0, 0, W, H, 'F');
  drawHeader(doc, W, 'MONTHLY QC EVALUATION', monthly.period_month, monthly.period_year,
    [124, 58, 237], logoDataUrl, 'Monthly Evaluation Summary (Period 1 + Period 2)');

  // Tutor
  doc.setFillColor(22, 25, 40); doc.roundedRect(15, 52, W - 30, 26, 4, 4, 'F');
  doc.setTextColor(124, 58, 237); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text('TUTOR', 25, 62);
  doc.setTextColor(255, 255, 255); doc.setFontSize(15);
  doc.text(monthly.tutor_name || 'N/A', 25, 72);

  // P1 + P2 + Monthly boxes
  const boxY = 85;
  const bW = 55, bH = 28;
  [
    { label: 'PERIOD 1', score: monthly.period_1_score, grade: monthly.period_1_grade, x: 15 },
    { label: 'PERIOD 2', score: monthly.period_2_score, grade: monthly.period_2_grade, x: 78 },
    { label: 'MONTHLY SCORE', score: monthly.monthly_score, grade: monthly.monthly_final_grade, x: 141, highlight: true },
  ].forEach(({ label, score, grade, x, highlight }) => {
    const rgb = GRADE_RGB[grade] || [150, 150, 150];
    doc.setFillColor(22, 25, 40); doc.roundedRect(x, boxY, bW, bH, 4, 4, 'F');
    if (highlight) { doc.setDrawColor(...rgb); doc.roundedRect(x, boxY, bW, bH, 4, 4, 'S'); }
    doc.setTextColor(100, 100, 150); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    doc.text(label, x + bW / 2, boxY + 7, { align: 'center' });
    doc.setTextColor(...rgb); doc.setFontSize(highlight ? 18 : 16);
    doc.text(`${Math.floor(Number(score || 0))}`, x + bW / 2, boxY + 18, { align: 'center' });
    doc.setFontSize(7); doc.text(grade || '', x + bW / 2, boxY + 25, { align: 'center' });
  });

  // Formula note
  doc.setTextColor(100, 100, 140); doc.setFontSize(7.5); doc.setFont('helvetica', 'italic');
  doc.text(`Monthly Score = floor((P1: ${Math.floor(Number(monthly.period_1_score || 0))} + P2: ${Math.floor(Number(monthly.period_2_score || 0))}) / 2) = ${monthly.monthly_score}`, W / 2, 120, { align: 'center' });

  // Aspect breakdown
  let y = 127;
  doc.setFillColor(22, 25, 40); doc.roundedRect(15, y, W - 30, 10, 2, 2, 'F');
  doc.setTextColor(6, 182, 212); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text('EVALUATION ASPECT', 20, y + 7);
  doc.text('WEIGHT', 120, y + 7, { align: 'center' });
  doc.text('P1', 143, y + 7, { align: 'center' });
  doc.text('P2', 160, y + 7, { align: 'center' });
  doc.text('AVG', 177, y + 7, { align: 'center' });
  doc.text('VALUE', 193, y + 7, { align: 'right' });
  y += 12;

  const scoreColors = { 1: [239,68,68], 2: [249,115,22], 3: [234,179,8], 4: [59,130,246], 5: [34,197,94] };

  (aspects || []).forEach((asp, i) => {
    if (y > 265) {
      drawFooter(doc, W, H, 'Algonova Malaysia — Monthly QC Report', [124, 58, 237]);
      doc.addPage();
      doc.setFillColor(13, 15, 23); doc.rect(0, 0, W, H, 'F');
      y = 20;
    }
    const bg = i % 2 === 0 ? [22, 25, 40] : [18, 20, 35];
    doc.setFillColor(...bg); doc.roundedRect(15, y, W - 30, 10, 2, 2, 'F');
    const aspData = (monthly.monthly_aspect_scores || {})[asp.id] || {};
    const p1s = aspData.p1 || 0, p2s = aspData.p2 || 0;
    const avg = Math.floor((p1s + p2s) / 2);
    const weighted = ((avg / 5) * (asp.weight_percentage || 0)).toFixed(2);
    doc.setTextColor(200, 200, 220); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(`${i + 1}. ${asp.aspect_name}`, 19, y + 7);
    doc.text(`${asp.weight_percentage || 0}%`, 120, y + 7, { align: 'center' });
    const c1 = p1s ? scoreColors[p1s] : [80,80,100];
    const c2 = p2s ? scoreColors[p2s] : [80,80,100];
    const ca = avg ? scoreColors[avg] : [80,80,100];
    doc.setTextColor(...c1); doc.setFont('helvetica', 'bold');
    doc.text(p1s ? String(p1s) : '-', 143, y + 7, { align: 'center' });
    doc.setTextColor(...c2);
    doc.text(p2s ? String(p2s) : '-', 160, y + 7, { align: 'center' });
    doc.setTextColor(...ca);
    doc.text(avg ? String(avg) : '-', 177, y + 7, { align: 'center' });
    doc.setTextColor(6, 182, 212);
    doc.text(avg ? weighted : '-', 193, y + 7, { align: 'right' });
    y += 11;
  });

  // Total
  y += 2;
  const gradeRgb = GRADE_RGB[monthly.monthly_final_grade] || [150, 150, 150];
  doc.setFillColor(20, 20, 40); doc.roundedRect(15, y, W - 30, 11, 2, 2, 'F');
  doc.setDrawColor(...gradeRgb); doc.roundedRect(15, y, W - 30, 11, 2, 2, 'S');
  doc.setTextColor(...gradeRgb); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text('TOTAL MONTHLY SCORE', 19, y + 7.5);
  doc.text(`${monthly.monthly_score} / 100`, 185, y + 7.5, { align: 'right' });
  doc.setTextColor(200,200,200); doc.setFontSize(8);
  doc.text(monthly.monthly_final_grade || '', 155, y + 7.5, { align: 'center' });
  y += 17;

  // Evaluation Notes — per aspect (using avg score to pick description)
  const scoredAspects = (aspects || []).filter(asp => {
    const aspData = (monthly.monthly_aspect_scores || {})[asp.id] || {};
    const avg = Math.floor(((aspData.p1 || 0) + (aspData.p2 || 0)) / 2);
    return avg > 0 && asp[`score_${avg}_description`];
  });

  if (scoredAspects.length > 0 || monthly.monthly_notes) {
    y += 6;
    if (y > H - 30) {
      drawFooter(doc, W, H, 'Algonova Malaysia — Monthly QC Evaluation Report', [124, 58, 237]);
      doc.addPage();
      doc.setFillColor(13, 15, 23); doc.rect(0, 0, W, H, 'F');
      y = 15;
    }
    doc.setFillColor(22, 25, 40); doc.roundedRect(15, y, W - 30, 10, 2, 2, 'F');
    doc.setTextColor(124, 58, 237); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('EVALUATION NOTES', 20, y + 7);
    y += 17;

    scoredAspects.forEach((asp) => {
      const aspData = (monthly.monthly_aspect_scores || {})[asp.id] || {};
      const avg = Math.floor(((aspData.p1 || 0) + (aspData.p2 || 0)) / 2);
      const desc = asp[`score_${avg}_description`];
      if (!desc) return;

      const label = `${asp.aspect_name} (Avg Score ${avg}):`;
      const descLines = doc.splitTextToSize(desc, W - 55);
      const blockH = 8 + descLines.length * 5 + 4;

      if (y + blockH > H - 20) {
        drawFooter(doc, W, H, 'Algonova Malaysia — Monthly QC Evaluation Report', [124, 58, 237]);
        doc.addPage();
        doc.setFillColor(13, 15, 23); doc.rect(0, 0, W, H, 'F');
        y = 15;
      }

      doc.setTextColor(6, 182, 212); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
      doc.text(label, 19, y);
      y += 5;
      doc.setTextColor(180, 180, 200); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
      doc.text(descLines, 22, y);
      y += descLines.length * 5 + 4;
    });

    // Additional notes from Admin QC
    if (monthly.monthly_notes) {
      if (y + 20 > H - 20) {
        drawFooter(doc, W, H, 'Algonova Malaysia — Monthly QC Evaluation Report', [124, 58, 237]);
        doc.addPage();
        doc.setFillColor(13, 15, 23); doc.rect(0, 0, W, H, 'F');
        y = 15;
      }
      y += 4;
      const noteLines = doc.splitTextToSize(monthly.monthly_notes, W - 55);
      const noteBlockH = 14 + noteLines.length * 5;
      doc.setFillColor(22, 25, 40); doc.roundedRect(15, y, W - 30, noteBlockH, 3, 3, 'F');
      doc.setTextColor(124, 58, 237); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
      doc.text('ADDITIONAL NOTES', 20, y + 7);
      doc.setTextColor(200, 200, 220); doc.setFont('helvetica', 'normal');
      doc.text(noteLines, 20, y + 13);
    }
  }

  drawFooter(doc, W, H, 'Algonova Malaysia — Monthly QC Evaluation Report', [124, 58, 237]);
  const filename = `QC_Monthly_${monthly.tutor_name}_${MONTHS[monthly.period_month - 1]}_${monthly.period_year}.pdf`;
  if (returnBlob) return doc.output('blob');
  doc.save(filename);
}

// ── QC Monthly PDF — returns blob URL for preview ────────────────────────────
export async function previewQCMonthlyPDF(monthly, p1Record, p2Record, aspects) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297;
  const logoDataUrl = await loadImageAsDataUrl(LOGO_URL);

  doc.setFillColor(13, 15, 23);
  doc.rect(0, 0, W, H, 'F');
  drawHeader(doc, W, 'MONTHLY QC EVALUATION', monthly.period_month, monthly.period_year,
    [124, 58, 237], logoDataUrl, 'Monthly Evaluation Summary (Period 1 + Period 2)');

  doc.setFillColor(22, 25, 40); doc.roundedRect(15, 52, W - 30, 26, 4, 4, 'F');
  doc.setTextColor(124, 58, 237); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text('TUTOR', 25, 62);
  doc.setTextColor(255, 255, 255); doc.setFontSize(15);
  doc.text(monthly.tutor_name || 'N/A', 25, 72);

  const boxY = 85;
  const bW = 55, bH = 28;
  [
    { label: 'PERIOD 1', score: monthly.period_1_score, grade: monthly.period_1_grade, x: 15 },
    { label: 'PERIOD 2', score: monthly.period_2_score, grade: monthly.period_2_grade, x: 78 },
    { label: 'MONTHLY SCORE', score: monthly.monthly_score, grade: monthly.monthly_final_grade, x: 141, highlight: true },
  ].forEach(({ label, score, grade, x, highlight }) => {
    const rgb = GRADE_RGB[grade] || [150, 150, 150];
    doc.setFillColor(22, 25, 40); doc.roundedRect(x, boxY, bW, bH, 4, 4, 'F');
    if (highlight) { doc.setDrawColor(...rgb); doc.roundedRect(x, boxY, bW, bH, 4, 4, 'S'); }
    doc.setTextColor(100, 100, 150); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    doc.text(label, x + bW / 2, boxY + 7, { align: 'center' });
    doc.setTextColor(...rgb); doc.setFontSize(highlight ? 18 : 16);
    doc.text(`${Math.floor(Number(score || 0))}`, x + bW / 2, boxY + 18, { align: 'center' });
    doc.setFontSize(7); doc.text(grade || '', x + bW / 2, boxY + 25, { align: 'center' });
  });

  doc.setTextColor(100, 100, 140); doc.setFontSize(7.5); doc.setFont('helvetica', 'italic');
  doc.text(`Monthly Score = floor((P1: ${Math.floor(Number(monthly.period_1_score || 0))} + P2: ${Math.floor(Number(monthly.period_2_score || 0))}) / 2) = ${monthly.monthly_score}`, W / 2, 120, { align: 'center' });

  let y = 127;
  doc.setFillColor(22, 25, 40); doc.roundedRect(15, y, W - 30, 10, 2, 2, 'F');
  doc.setTextColor(6, 182, 212); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text('EVALUATION ASPECT', 20, y + 7);
  doc.text('WEIGHT', 120, y + 7, { align: 'center' });
  doc.text('P1', 143, y + 7, { align: 'center' });
  doc.text('P2', 160, y + 7, { align: 'center' });
  doc.text('AVG', 177, y + 7, { align: 'center' });
  doc.text('VALUE', 193, y + 7, { align: 'right' });
  y += 12;

  const scoreColors = { 1: [239,68,68], 2: [249,115,22], 3: [234,179,8], 4: [59,130,246], 5: [34,197,94] };

  (aspects || []).forEach((asp, i) => {
    if (y > 265) {
      drawFooter(doc, W, H, 'Algonova Malaysia — Monthly QC Report', [124, 58, 237]);
      doc.addPage();
      doc.setFillColor(13, 15, 23); doc.rect(0, 0, W, H, 'F');
      y = 20;
    }
    const bg = i % 2 === 0 ? [22, 25, 40] : [18, 20, 35];
    doc.setFillColor(...bg); doc.roundedRect(15, y, W - 30, 10, 2, 2, 'F');
    const aspData = (monthly.monthly_aspect_scores || {})[asp.id] || {};
    const p1s = aspData.p1 || 0, p2s = aspData.p2 || 0;
    const avg = Math.floor((p1s + p2s) / 2);
    const weighted = ((avg / 5) * (asp.weight_percentage || 0)).toFixed(2);
    doc.setTextColor(200, 200, 220); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(`${i + 1}. ${asp.aspect_name}`, 19, y + 7);
    doc.text(`${asp.weight_percentage || 0}%`, 120, y + 7, { align: 'center' });
    const c1 = p1s ? scoreColors[p1s] : [80,80,100];
    const c2 = p2s ? scoreColors[p2s] : [80,80,100];
    const ca = avg ? scoreColors[avg] : [80,80,100];
    doc.setTextColor(...c1); doc.setFont('helvetica', 'bold');
    doc.text(p1s ? String(p1s) : '-', 143, y + 7, { align: 'center' });
    doc.setTextColor(...c2);
    doc.text(p2s ? String(p2s) : '-', 160, y + 7, { align: 'center' });
    doc.setTextColor(...ca);
    doc.text(avg ? String(avg) : '-', 177, y + 7, { align: 'center' });
    doc.setTextColor(6, 182, 212);
    doc.text(avg ? weighted : '-', 193, y + 7, { align: 'right' });
    y += 11;
  });

  y += 2;
  const gradeRgb = GRADE_RGB[monthly.monthly_final_grade] || [150, 150, 150];
  doc.setFillColor(20, 20, 40); doc.roundedRect(15, y, W - 30, 11, 2, 2, 'F');
  doc.setDrawColor(...gradeRgb); doc.roundedRect(15, y, W - 30, 11, 2, 2, 'S');
  doc.setTextColor(...gradeRgb); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text('TOTAL MONTHLY SCORE', 19, y + 7.5);
  doc.text(`${monthly.monthly_score} / 100`, 185, y + 7.5, { align: 'right' });
  doc.setTextColor(200,200,200); doc.setFontSize(8);
  doc.text(monthly.monthly_final_grade || '', 155, y + 7.5, { align: 'center' });
  y += 17;

  const scoredAspects = (aspects || []).filter(asp => {
    const aspData = (monthly.monthly_aspect_scores || {})[asp.id] || {};
    const avg = Math.floor(((aspData.p1 || 0) + (aspData.p2 || 0)) / 2);
    return avg > 0 && asp[`score_${avg}_description`];
  });

  if (scoredAspects.length > 0 || monthly.monthly_notes) {
    y += 6;
    if (y > H - 30) {
      drawFooter(doc, W, H, 'Algonova Malaysia — Monthly QC Evaluation Report', [124, 58, 237]);
      doc.addPage();
      doc.setFillColor(13, 15, 23); doc.rect(0, 0, W, H, 'F');
      y = 15;
    }
    doc.setFillColor(22, 25, 40); doc.roundedRect(15, y, W - 30, 10, 2, 2, 'F');
    doc.setTextColor(124, 58, 237); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('EVALUATION NOTES', 20, y + 7);
    y += 17;

    scoredAspects.forEach((asp) => {
      const aspData = (monthly.monthly_aspect_scores || {})[asp.id] || {};
      const avg = Math.floor(((aspData.p1 || 0) + (aspData.p2 || 0)) / 2);
      const desc = asp[`score_${avg}_description`];
      if (!desc) return;
      const label = `${asp.aspect_name} (Avg Score ${avg}):`;
      const descLines = doc.splitTextToSize(desc, W - 55);
      const blockH = 8 + descLines.length * 5 + 4;
      if (y + blockH > H - 20) {
        drawFooter(doc, W, H, 'Algonova Malaysia — Monthly QC Evaluation Report', [124, 58, 237]);
        doc.addPage();
        doc.setFillColor(13, 15, 23); doc.rect(0, 0, W, H, 'F');
        y = 15;
      }
      doc.setTextColor(6, 182, 212); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
      doc.text(label, 19, y);
      y += 5;
      doc.setTextColor(180, 180, 200); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
      doc.text(descLines, 22, y);
      y += descLines.length * 5 + 4;
    });

    if (monthly.monthly_notes) {
      if (y + 20 > H - 20) {
        drawFooter(doc, W, H, 'Algonova Malaysia — Monthly QC Evaluation Report', [124, 58, 237]);
        doc.addPage();
        doc.setFillColor(13, 15, 23); doc.rect(0, 0, W, H, 'F');
        y = 15;
      }
      y += 4;
      const noteLines = doc.splitTextToSize(monthly.monthly_notes, W - 55);
      const noteBlockH = 14 + noteLines.length * 5;
      doc.setFillColor(22, 25, 40); doc.roundedRect(15, y, W - 30, noteBlockH, 3, 3, 'F');
      doc.setTextColor(124, 58, 237); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
      doc.text('ADDITIONAL NOTES', 20, y + 7);
      doc.setTextColor(200, 200, 220); doc.setFont('helvetica', 'normal');
      doc.text(noteLines, 20, y + 13);
    }
  }

  drawFooter(doc, W, H, 'Algonova Malaysia — Monthly QC Evaluation Report', [124, 58, 237]);

  const blob = doc.output('blob');
  return URL.createObjectURL(blob);
}

// ── LEGACY: kept for old records ──────────────────────────────────────────────
export async function generateQCPDF(record) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297;
  const logoDataUrl = await loadImageAsDataUrl(LOGO_URL);
  doc.setFillColor(13, 15, 23); doc.rect(0, 0, W, H, 'F');
  drawHeader(doc, W, 'QC ASSESSMENT REPORT', record.period_month, record.period_year, [124, 58, 237], logoDataUrl);
  doc.setFillColor(22, 25, 40); doc.roundedRect(15, 52, W - 30, 38, 4, 4, 'F');
  doc.setTextColor(124, 58, 237); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text('TUTOR', 25, 63);
  doc.setTextColor(255, 255, 255); doc.setFontSize(16);
  doc.text(record.tutor_name || 'N/A', 25, 74);
  doc.setTextColor(150, 150, 180); doc.setFontSize(11);
  doc.text(`Reviewed by: ${record.admin_qc_name || 'N/A'}`, 25, 84);
  const allAssessments = [...(record.qc_assessments || []), ...(record.manual_assessments || [])];
  const assessBoxH = Math.max(allAssessments.length * 12 + 22, 30);
  doc.setFillColor(22, 25, 40); doc.roundedRect(15, 100, W - 30, assessBoxH, 4, 4, 'F');
  doc.setTextColor(6, 182, 212); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text('QC ASSESSMENT POINTS', 25, 113);
  allAssessments.forEach((a, i) => {
    doc.setTextColor(6, 182, 212); doc.text('-', 22, 124 + i * 12);
    doc.setTextColor(220, 220, 240); doc.setFont('helvetica', 'normal'); doc.text(a, 28, 124 + i * 12);
  });
  if (allAssessments.length === 0) { doc.setTextColor(100,100,130); doc.text('No assessments recorded.', 25, 124); }
  if (record.notes) {
    const notesY = 110 + assessBoxH + 8;
    const noteLines = doc.splitTextToSize(record.notes, W - 50);
    const notesBoxH = 22 + noteLines.length * 6 + 6;
    doc.setFillColor(22, 25, 40); doc.roundedRect(15, notesY, W - 30, notesBoxH, 4, 4, 'F');
    doc.setTextColor(124, 58, 237); doc.setFont('helvetica', 'bold');
    doc.text('NOTES', 25, notesY + 12);
    doc.setTextColor(200, 200, 220); doc.setFont('helvetica', 'normal');
    doc.text(noteLines, 25, notesY + 22);
  }
  drawFooter(doc, W, H, 'Algonova Malaysia — Confidential QC Report', [124, 58, 237]);
  doc.save(`QC_Report_${record.tutor_name}_${MONTHS[record.period_month - 1]}_${record.period_year}.pdf`);
}

// ── LEGACY: kept for old records ──────────────────────────────────────────────
export async function generateFeedbackPDF(record) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297;
  const logoDataUrl = await loadImageAsDataUrl(LOGO_URL);
  doc.setFillColor(13, 15, 23); doc.rect(0, 0, W, H, 'F');
  drawHeader(doc, W, 'STUDENT FEEDBACK REPORT', record.period_month, record.period_year, [6, 182, 212], logoDataUrl);
  const colW = (W - 35) / 2;
  doc.setFillColor(22, 25, 40); doc.roundedRect(15, 52, colW, 38, 4, 4, 'F');
  doc.setTextColor(6, 182, 212); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text('TUTOR', 25, 63);
  doc.setTextColor(255, 255, 255); doc.setFontSize(15);
  doc.text(record.tutor_name || 'N/A', 25, 76);
  doc.setFillColor(22, 25, 40); doc.roundedRect(15 + colW + 5, 52, colW, 38, 4, 4, 'F');
  const sx = 15 + colW + 15;
  doc.setTextColor(6, 182, 212); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text('STUDENT', sx, 63);
  doc.setTextColor(255, 255, 255); doc.setFontSize(15);
  doc.text(record.student_name || 'N/A', sx, 76);
  doc.setFillColor(22, 25, 40); doc.roundedRect(15, 100, W - 30, 24, 4, 4, 'F');
  doc.setTextColor(6, 182, 212); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text('OVERALL RATING:', 25, 112);
  doc.setTextColor(255, 255, 255); doc.setFontSize(14);
  doc.text(`${record.star_rating} / 5`, 82, 112);
  const allAssessments = [...(record.feedback_assessments || []), ...(record.manual_assessments || [])];
  const assessBoxH = Math.max(allAssessments.length * 12 + 22, 30);
  doc.setFillColor(22, 25, 40); doc.roundedRect(15, 134, W - 30, assessBoxH, 4, 4, 'F');
  doc.setTextColor(124, 58, 237); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text('FEEDBACK ASSESSMENT POINTS', 25, 147);
  allAssessments.forEach((a, i) => {
    doc.setTextColor(6, 182, 212); doc.text('-', 22, 158 + i * 12);
    doc.setTextColor(220, 220, 240); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(a, 30, 158 + i * 12);
  });
  if (allAssessments.length === 0) { doc.setTextColor(100, 100, 130); doc.setFont('helvetica', 'normal'); doc.text('No feedback recorded.', 25, 158); }
  if (record.notes) {
    const notesY = 144 + assessBoxH + 8;
    const noteLines = doc.splitTextToSize(record.notes, W - 50);
    const notesBoxH = 22 + noteLines.length * 6 + 6;
    doc.setFillColor(22, 25, 40); doc.roundedRect(15, notesY, W - 30, notesBoxH, 4, 4, 'F');
    doc.setTextColor(6, 182, 212); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text('NOTES', 25, notesY + 12);
    doc.setTextColor(200, 200, 220); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(noteLines, 25, notesY + 22);
  }
  drawFooter(doc, W, H, 'Algonova Malaysia — Student Feedback Report', [6, 182, 212]);
  doc.save(`Feedback_Report_${record.tutor_name}_${record.student_name}_${MONTHS[record.period_month - 1]}_${record.period_year}.pdf`);
}

// ── NEW: Student Feedback PDF with proper multi-page support ──────────────────
const POINT_RGB = {
  1: [239, 68, 68],
  2: [249, 115, 22],
  3: [234, 179, 8],
  4: [59, 130, 246],
  5: [34, 197, 94],
};

export async function generateFeedbackPDFNew(record, perfAspects, referral) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, H = 297;
  const logoDataUrl = await loadImageAsDataUrl(LOGO_URL);
  const studentName = record.student_name || 'Student';

  // Background
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, H, 'F');

  // Header with logo
  if (logoDataUrl) {
    try { doc.addImage(logoDataUrl, 'PNG', 15, 8, 35, 14); } catch (e) {}
  }
  doc.setTextColor(124, 58, 237);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('Student Feedback Report', W / 2, 18, { align: 'center' });
  doc.setDrawColor(200, 200, 200);
  doc.line(15, 24, W - 15, 24);

  let y = 32;

  // Student & Tutor Info
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(15, y, W - 30, 28, 3, 3, 'F');
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
  y += 34;

  // Module Topic (left) + Point Rating (right) — side by side
  const stars = record.point || 0;
  const boxH = 16;
  const gap = 6;
  const halfW = (W - 30 - gap) / 2;
  // Left: Module Topic
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(15, y, halfW, boxH, 3, 3, 'F');
  doc.setTextColor(100, 100, 120);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.text('MODULE TOPIC', 20, y + 5);
  doc.setTextColor(30, 30, 40);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const modLines = doc.splitTextToSize(record.module_topic || '-', halfW - 10);
  doc.text(modLines, 20, y + 11);
  // Right: Point Rating
  doc.setFillColor(254, 240, 138);
  doc.roundedRect(15 + halfW + gap, y, halfW, boxH, 3, 3, 'F');
  doc.setTextColor(202, 138, 4);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Point Rating', 15 + halfW + gap + 5, y + 6);
  doc.setFontSize(14);
  doc.text(`${stars} / 5`, 15 + halfW + gap + halfW - 5, y + 11, { align: 'right' });
  y += boxH + 6;

  // Performance Evaluation
  const perfItems = [];
  if (record.presence && perfAspects) perfItems.push({ label: 'Presence', raw: record.presence });
  if (record.involvement_difficulty && perfAspects) perfItems.push({ label: 'Involvement & Difficulty', raw: record.involvement_difficulty });
  if (record.task_completion && perfAspects) perfItems.push({ label: 'Task Completion', raw: record.task_completion });

  if (perfItems.length > 0) {
    y += 4;
    doc.setTextColor(124, 58, 237);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Performance Evaluation', 20, y);
    y += 6;

    perfItems.forEach((item) => {
      const parts = (item.raw || '').split('::');
      const aspectKey = parts[0];
      const pointNum = parseInt(parts[1]) || 0;
      const embeddedDesc = parts.slice(2).join('::');
      const aspect = perfAspects.find(a => a.aspect_title === aspectKey || a.id === aspectKey);
      const maxPt = aspect?.max_point || 5;
      const desc = embeddedDesc || aspect?.[`point_${pointNum}_description`] || `Point ${pointNum}`;
      const rgb = POINT_RGB[pointNum] || POINT_RGB[3];

      const blockH = 18;
      if (y + blockH > H - 20) {
        doc.setDrawColor(200, 200, 200);
        doc.line(15, H - 15, W - 15, H - 15);
        doc.setTextColor(100, 100, 120);
        doc.setFontSize(8);
        doc.text('Algonova Malaysia — Student Feedback Report', W / 2, H - 7, { align: 'center' });
        doc.addPage();
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, W, H, 'F');
        if (logoDataUrl) { try { doc.addImage(logoDataUrl, 'PNG', 15, 8, 35, 14); } catch (e) {} }
        doc.setTextColor(124, 58, 237);
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('Student Feedback Report', W / 2, 18, { align: 'center' });
        doc.setDrawColor(200, 200, 200);
        doc.line(15, 24, W - 15, 24);
        y = 32;
      }

      doc.setFillColor(rgb[0], rgb[1], rgb[2]);
      doc.circle(22, y + 9, 5, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(String(pointNum), 22, y + 11, { align: 'center' });

      doc.setTextColor(50, 50, 60);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(item.label, 32, y + 7);
      doc.setTextColor(124, 58, 237);
      doc.setFontSize(8);
      doc.text(`Point ${pointNum} / ${maxPt}`, W - 20, y + 7, { align: 'right' });

      doc.setTextColor(60, 60, 70);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      const descLines = doc.splitTextToSize(desc.replace(/\(Student Name\)/gi, studentName).replace(/\[Student Name\]/gi, studentName), W - 55);
      doc.text(descLines, 32, y + 12);

      y += blockH + 4;
    });
  }

  // Tutor Note
  if (record.tutor_note) {
    y += 4;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(15, y, W - 30, 3, 2, 2, 'F');
    doc.setTextColor(124, 58, 237);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text("Tutor's Note", 20, y + 2.5);
    y += 6;
    const noteLines = doc.splitTextToSize(record.tutor_note, W - 55);
    const noteH = noteLines.length * 5 + 8;
    if (y + noteH > H - 20) {
      doc.setDrawColor(200, 200, 200);
      doc.line(15, H - 15, W - 15, H - 15);
      doc.setTextColor(100, 100, 120);
      doc.setFontSize(8);
      doc.text('Algonova Malaysia — Student Feedback Report', W / 2, H - 7, { align: 'center' });
      doc.addPage();
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, W, H, 'F');
      if (logoDataUrl) { try { doc.addImage(logoDataUrl, 'PNG', 15, 8, 35, 14); } catch (e) {} }
      doc.setTextColor(124, 58, 237);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text('Student Feedback Report', W / 2, 18, { align: 'center' });
      doc.setDrawColor(200, 200, 200);
      doc.line(15, 24, W - 15, 24);
      y = 32;
    }
    doc.setTextColor(60, 60, 70);
    doc.setFontSize(8);
    doc.text(noteLines, 20, y + 5);
    y += noteH + 6;
  }

  // Referral
  if (referral && referral.notes) {
    y += 4;
    doc.setFillColor(240, 248, 255);
    doc.roundedRect(15, y, W - 30, 3, 2, 2, 'F');
    doc.setTextColor(6, 182, 212);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Referral Notes', 20, y + 2.5);
    y += 6;
    const tmpEl = document.createElement('div');
    tmpEl.innerHTML = referral.notes;
    const plainText = tmpEl.textContent || tmpEl.innerText || '';
    const refLines = doc.splitTextToSize(plainText, W - 55);
    const refH = refLines.length * 5 + 8;
    if (y + refH > H - 20) {
      doc.setDrawColor(200, 200, 200);
      doc.line(15, H - 15, W - 15, H - 15);
      doc.setTextColor(100, 100, 120);
      doc.setFontSize(8);
      doc.text('Algonova Malaysia — Student Feedback Report', W / 2, H - 7, { align: 'center' });
      doc.addPage();
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, W, H, 'F');
      if (logoDataUrl) { try { doc.addImage(logoDataUrl, 'PNG', 15, 8, 35, 14); } catch (e) {} }
      doc.setTextColor(124, 58, 237);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text('Student Feedback Report', W / 2, 18, { align: 'center' });
      doc.setDrawColor(200, 200, 200);
      doc.line(15, 24, W - 15, 24);
      y = 32;
    }
    doc.setTextColor(60, 60, 70);
    doc.setFontSize(8);
    doc.text(refLines, 20, y + 7);
    y += refH + 4;
  }

  // Footer
  drawFooter(doc, W, H, 'Algonova Malaysia — Student Feedback Report', [124, 58, 237]);
  
  doc.save(`Feedback_${studentName}_${MONTHS[record.month - 1] || 'Month'}.pdf`);
}