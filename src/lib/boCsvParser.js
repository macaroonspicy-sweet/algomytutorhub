export function getWeekLabel(day) {
  if (day >= 1 && day <= 7) return 'Week 1 (1–7)';
  if (day >= 8 && day <= 14) return 'Week 2 (8–14)';
  if (day >= 15 && day <= 21) return 'Week 3 (15–21)';
  return 'Week 4 (22–End)';
}

export function getWeekBoundsFromDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dayOfWeek = dt.getDay();
  const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const mon = new Date(y, m - 1, d + diffToMon);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);

  const fmt = (dateObj) => {
    const yy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };

  return { start: fmt(mon), end: fmt(sun) };
}

export function getNextMondayISO(baseDate = new Date()) {
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  const day = d.getDay();
  const daysUntilNextMon = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + daysUntilNextMon);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function parseBoDateTime(raw) {
  const str = String(raw || '').trim();
  const match = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}:\d{2}))?/);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  const time = match[4] || '00:00';
  const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return {
    isoDate,
    time,
    day,
    month,
    year,
    weekLabel: getWeekLabel(day),
  };
}

// Parser CSV native yang mendukung tanda kutip, multi-baris dalam sel, serta delimiter koma / titik koma / tab
function parseDelimitedText(text) {
  const cleanText = text.replace(/^\uFEFF/, '');
  const firstLine = cleanText.split(/\r?\n/)[0] || '';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;

  let delimiter = ',';
  if (tabCount > commaCount && tabCount > semiCount) delimiter = '\t';
  else if (semiCount > commaCount) delimiter = ';';

  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const ch = cleanText[i];
    const next = cleanText[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = '';
    } else if ((ch === '\n' || (ch === '\r' && next === '\n')) && !inQuotes) {
      if (ch === '\r') i++;
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += ch;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

export async function parseBoScheduleFile(file) {
  const fileName = (file.name || '').toLowerCase();
  let rows2D = [];

  if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', raw: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    rows2D = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  } else {
    const text = await file.text();
    rows2D = parseDelimitedText(text);
  }

  if (!rows2D || rows2D.length < 2) {
    throw new Error('File kosong atau format tidak sesuai.');
  }

  const headers = rows2D[0].map((h) => String(h || '').trim().toLowerCase());

  const idxTime = headers.findIndex((h) => h.includes('time of next lesson'));
  const nextLessonIndices = headers
    .map((h, idx) => (h === 'next lesson' ? idx : -1))
    .filter((idx) => idx !== -1);

  const idxLessonNum = nextLessonIndices[0] ?? 1;
  const idxLessonTitle = nextLessonIndices[1] ?? 2;
  const idxGroupId = headers.findIndex((h) => h === 'group id');
  const idxGroupTitle = headers.findIndex((h) => h === 'group title');
  const idxStatus = headers.findIndex((h) => h.includes('lesson status'));
  const idxStudents = headers.findIndex((h) => h === 'students');
  const idxAttended = headers.findIndex((h) => h.includes('students that attended'));
  const idxTeacher = headers.findIndex((h) => h.includes('lesson teacher'));
  const idxGroupType = headers.findIndex((h) => h.includes('group type'));
  const idxCourse = headers.findIndex((h) => h === 'course');
  const idxFormat = headers.findIndex((h) => h === 'format');
  const idxBranch = headers.findIndex((h) => h === 'branch');

  if (idxTime === -1 || idxGroupTitle === -1) {
    throw new Error('Header kolom BO LMS tidak ditemukan. Pastikan file berasal dari Schedule BO.');
  }

  const parsedRecords = [];
  const seenKeys = new Set();

  for (let i = 1; i < rows2D.length; i++) {
    const row = rows2D[i];
    if (!row || row.every((cell) => String(cell || '').trim() === '')) continue;

    const rawDateTime = String(row[idxTime] || '').trim();
    const dt = parseBoDateTime(rawDateTime);
    if (!dt) continue;

    const lessonNum = parseInt(String(row[idxLessonNum] || '0').replace(/\D/g, ''), 10) || 0;
    const lessonTitle = String(row[idxLessonTitle] || '').replace(/\s+/g, ' ').trim();
    const groupId = String(row[idxGroupId] || '').trim();
    const groupTitle = String(row[idxGroupTitle] || '').trim();

    const statusRaw = String(row[idxStatus] || '0').trim();
    const attendancePct = parseInt(statusRaw.replace(/[^\d]/g, ''), 10) || 0;

    const studentsRaw = String(row[idxStudents] || '0').trim();
    const studentsMatch = studentsRaw.match(/^(\d+)/);
    const studentsCount = studentsMatch ? parseInt(studentsMatch[1], 10) : 0;

    const studentsAttended = parseInt(String(row[idxAttended] || '0').replace(/\D/g, ''), 10) || 0;
    const lessonTeacher = String(row[idxTeacher] || '').trim();
    const groupType = String(row[idxGroupType] || '').trim();
    const course = String(row[idxCourse] || '').replace(/\s+/g, ' ').trim();
    const format = String(row[idxFormat] || '').trim();
    const branch = String(row[idxBranch] || '').trim();

    const isTestGroup = groupTitle.toLowerCase().includes('test');
    const isConducted = !isTestGroup && attendancePct > 0 && studentsAttended >= 1;

    const uniqueKey = `${groupId || groupTitle}_${dt.isoDate}_${dt.time}_${lessonNum}`;
    if (seenKeys.has(uniqueKey)) continue;
    seenKeys.add(uniqueKey);

    parsedRecords.push({
      unique_key: uniqueKey,
      lesson_datetime: rawDateTime,
      lesson_date: dt.isoDate,
      lesson_time: dt.time,
      lesson_month: dt.month,
      lesson_year: dt.year,
      week_label: dt.weekLabel,
      lesson_number: lessonNum,
      lesson_title: lessonTitle,
      group_id: groupId,
      group_title: groupTitle,
      attendance_pct: attendancePct,
      students_count: studentsCount,
      students_raw: studentsRaw,
      students_attended: studentsAttended,
      lesson_teacher: lessonTeacher,
      group_type: groupType,
      course,
      format,
      branch,
      is_test_group: isTestGroup,
      is_conducted: isConducted,
    });
  }

  return parsedRecords;
}