const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
// Auth: platform session matched by email, or app session (actor_id + actor_token) for custom logins.
import * as XLSX from 'npm:xlsx@0.18.5';
import { resolveActor, canReviewWeeklyFeedback, canManageWeeklyFeedback } from '../../shared/permissions.ts';
import { fetchAllEntities, norm } from '../../shared/data.ts';

const HEADERS = ['Week Start Date', 'Week End Date', 'Class Name', 'Class Code', 'Course', 'Tutor Name', 'Tutor ID', 'Notes'];

const pad = (n) => String(n).padStart(2, '0');

function ymd(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function validYmd(date) {
  const [y, m, d] = date.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

function parseDate(value) {
  if (value === null || value === undefined || value === '') return { error: 'missing' };
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { error: 'invalid date' };
    return { date: ymd(value) };
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return { error: 'invalid date' };
    return { date: `${parsed.y}-${pad(parsed.m)}-${pad(parsed.d)}` };
  }
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const date = `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    return validYmd(date) ? { date } : { error: 'invalid date' };
  }
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) {
    const date = `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    return validYmd(date) ? { date } : { error: 'invalid date (use DD/MM/YYYY)' };
  }
  return { error: 'unrecognized date format (use YYYY-MM-DD)' };
}

function headerKey(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const HEADER_ALIASES = {
  weekstartdate: 'week_start_date',
  startdate: 'week_start_date',
  weekenddate: 'week_end_date',
  enddate: 'week_end_date',
  classname: 'class_name',
  class: 'class_name',
  classcode: 'class_code',
  course: 'course_name',
  coursename: 'course_name',
  tutorname: 'tutor_name',
  tutorid: 'tutor_id',
  notes: 'notes',
};

function classKey(record) {
  return norm(record.class_code || record.class_name || '');
}

async function loadContext(base44) {
  const [students, users, assignments] = await Promise.all([
    fetchAllEntities(base44, 'Student', {}, 'student_name'),
    db.asServiceRole.entities.CustomUser.filter({}, { limit: 500 }).then((p) => p.items || []),
    fetchAllEntities(base44, 'WeeklyFeedbackAssignment', {}, '-week_start_date'),
  ]);
  const tutors = users.filter((u) => ['Tutor', 'Team Leader'].includes(u.role) && u.is_active !== false);

  const classes = new Map();
  const addClass = (name, code, course) => {
    const label = String(name || code || '').trim();
    const classCode = String(code || '').trim();
    const key = norm(classCode || label);
    if (!key) return;
    const existing = classes.get(key);
    if (existing) {
      if (!existing.course_name && course) existing.course_name = course;
      if (!existing.class_code && classCode) existing.class_code = classCode;
      return;
    }
    classes.set(key, { class_name: label, class_code: classCode, course_name: course || '' });
  };
  students.forEach((s) => addClass(s.class_code, s.class_code, s.course_name));
  assignments.forEach((a) => addClass(a.class_name || a.student_name, a.class_code, a.course_name));

  return { students, users, tutors, assignments, classes: [...classes.values()] };
}

function normalizeRows(rawRows) {
  const headerIndex = rawRows.findIndex((row) => {
    const keys = (row || []).map(headerKey);
    return keys.includes('weekstartdate') && (keys.includes('classname') || keys.includes('class'));
  });
  if (headerIndex === -1) {
    return { error: 'Header row not found. Download the template and keep its column titles.' };
  }
  const mapping = {};
  (rawRows[headerIndex] || []).forEach((cell, idx) => {
    const field = HEADER_ALIASES[headerKey(cell)];
    if (field && mapping[field] === undefined) mapping[field] = idx;
  });
  const missing = ['week_start_date', 'week_end_date', 'class_name', 'tutor_name'].filter((f) => mapping[f] === undefined);
  if (missing.length) {
    return { error: `Missing required columns: ${missing.join(', ')}` };
  }
  const rows = [];
  for (let i = headerIndex + 1; i < rawRows.length; i++) {
    const raw = rawRows[i] || [];
    const cell = (field) => (mapping[field] === undefined ? '' : raw[mapping[field]]);
    if (!String(cell('week_start_date') ?? '').trim() && !String(cell('class_name') ?? '').trim()) continue;
    rows.push({
      row: i + 1,
      weekStartRaw: cell('week_start_date'),
      weekEndRaw: cell('week_end_date'),
      className: String(cell('class_name') ?? '').trim(),
      classCode: String(cell('class_code') ?? '').trim(),
      courseName: String(cell('course_name') ?? '').trim(),
      tutorName: String(cell('tutor_name') ?? '').trim(),
      tutorId: String(cell('tutor_id') ?? '').trim(),
      notes: String(cell('notes') ?? '').trim(),
    });
  }
  return { rows };
}

async function validate(base44, rawRows) {
  const parsed = normalizeRows(rawRows);
  if (parsed.error) return { error: parsed.error, rows: [] };
  const { tutors, assignments, classes } = await loadContext(base44);

  const classesByKey = new Map(classes.map((c) => [norm(c.class_code || c.class_name), c]));
  const tutorsById = new Map(tutors.map((t) => [t.id, t]));
  const tutorsByName = new Map();
  tutors.forEach((t) => {
    const n = norm(t.full_name);
    tutorsByName.set(n, [...(tutorsByName.get(n) || []), t]);
  });

  const existing = new Set(assignments.map((a) => `${classKey(a)}|${a.tutor_id}|${a.week_key || a.week_start_date}`));
  const seenInFile = new Set();

  const results = parsed.rows.map((r) => {
    const errors = [];
    const warnings = [];
    const start = parseDate(r.weekStartRaw);
    const end = parseDate(r.weekEndRaw);
    if (start.error) errors.push(`Week start: ${start.error}`);
    if (end.error) errors.push(`Week end: ${end.error}`);
    if (start.date && end.date && end.date < start.date) errors.push('Week end is before week start');

    let className = r.className;
    let classCode = r.classCode;
    let courseName = r.courseName;

    if (!className && !classCode) {
      errors.push('Class name is required');
    } else {
      const known = classesByKey.get(norm(classCode || className))
        || (className ? classesByKey.get(norm(className)) : null);
      if (known) {
        className = known.class_name || className;
        classCode = classCode || known.class_code || '';
        courseName = courseName || known.course_name || '';
        if (r.className && norm(known.class_name) !== norm(r.className) && classCode) {
          warnings.push(`Class ${classCode} is named "${known.class_name}"`);
        }
      } else {
        warnings.push('New class — it will be added to the class list');
      }
    }

    let tutor = null;
    if (r.tutorId) {
      tutor = tutorsById.get(r.tutorId) || null;
      if (!tutor) {
        const byName = tutorsByName.get(norm(r.tutorName)) || [];
        if (byName.length === 1) {
          tutor = byName[0];
          warnings.push('Tutor ID did not match — matched by tutor name');
        } else {
          errors.push(`Tutor ID "${r.tutorId}" not found`);
        }
      } else if (r.tutorName && norm(tutor.full_name) !== norm(r.tutorName)) {
        errors.push(`Tutor ID "${r.tutorId}" belongs to "${tutor.full_name}", not "${r.tutorName}"`);
      }
    } else if (r.tutorName) {
      const matches = tutorsByName.get(norm(r.tutorName)) || [];
      if (matches.length > 1) errors.push(`Tutor name "${r.tutorName}" is ambiguous — add the Tutor ID`);
      else if (matches.length === 1) tutor = matches[0];
      else errors.push(`Tutor "${r.tutorName}" not found`);
    } else {
      errors.push('Tutor name or ID is required');
    }

    let status = 'valid';
    if (errors.length) {
      status = 'invalid';
    } else {
      const dupKey = `${norm(classCode || className)}|${tutor.id}|${start.date}`;
      if (seenInFile.has(dupKey)) {
        errors.push('Duplicate row in this file');
        status = 'duplicate';
      } else if (existing.has(dupKey)) {
        errors.push('This tutor already has feedback assigned for that class and week');
        status = 'duplicate';
      } else {
        seenInFile.add(dupKey);
      }
    }

    return {
      row: r.row,
      week_start_date: start.date || '',
      week_end_date: end.date || '',
      class_name: className,
      class_code: classCode,
      course_name: courseName,
      tutor_id: tutor?.id || '',
      tutor_name: tutor?.full_name || r.tutorName,
      notes: r.notes,
      status,
      errors,
      warnings,
    };
  });

  const summary = {
    total: results.length,
    valid: results.filter((r) => r.status === 'valid').length,
    invalid: results.filter((r) => r.status === 'invalid').length,
    duplicate: results.filter((r) => r.status === 'duplicate').length,
  };
  return { rows: results, summary };
}

async function readWorkbook(base44, fileUri) {
  const signed = await db.asServiceRole.integrations.Core.CreateFileSignedUrl({ file_uri: fileUri, expires_in: 300 });
  const url = signed?.signed_url;
  if (!url) throw new Error('Could not read the uploaded file');
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error('Could not download the uploaded file');
  const buffer = await res.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true, blankrows: false });
}

function buildTemplate(classes, tutors) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([HEADERS]);
  ws['!cols'] = [14, 14, 26, 16, 24, 26, 20, 40];
  XLSX.utils.book_append_sheet(wb, ws, 'Weekly Feedback');

  const instructions = XLSX.utils.aoa_to_sheet([
    ['Weekly Class Feedback — import instructions'],
    [''],
    ['1. Fill in one row per class, tutor and week on the "Weekly Feedback" sheet. Do not rename the headers.'],
    ['2. Dates must be YYYY-MM-DD or DD/MM/YYYY. The week end cannot be before the week start.'],
    ['3. Use a class from the Classes sheet, or type a new class name — new classes are added automatically.'],
    ['4. Tutor ID / Tutor Name: use the exact values on the Tutors sheet. When an ID is given the name must match.'],
    ['5. A tutor can only be assigned once per class per week. Existing assignments are never overwritten.'],
    ['6. Upload the filled file, review the preview, then confirm the import.'],
  ]);
  instructions['!cols'] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, instructions, 'Instructions');

  const classSheet = XLSX.utils.aoa_to_sheet([
    ['Class Name', 'Class Code', 'Course'],
    ...classes.map((c) => [c.class_name, c.class_code || '', c.course_name || '']),
  ]);
  classSheet['!cols'] = [28, 18, 26];
  XLSX.utils.book_append_sheet(wb, classSheet, 'Classes');

  const tutorSheet = XLSX.utils.aoa_to_sheet([
    ['Tutor ID', 'Tutor Name', 'Role'],
    ...tutors.map((t) => [t.id, t.full_name, t.role]),
  ]);
  tutorSheet['!cols'] = [26, 26, 16];
  XLSX.utils.book_append_sheet(wb, tutorSheet, 'Tutors');

  return XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await resolveActor(base44, body);
    if (!actor || !actor.customUser) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canReviewWeeklyFeedback(actor)) return Response.json({ error: 'Not authorized' }, { status: 403 });

    const action = body.action || 'template';

    if (action === 'template') {
      const { classes, tutors } = await loadContext(base44);
      const base64 = buildTemplate(classes, tutors);
      return Response.json({ filename: 'weekly-class-feedback-template.xlsx', base64 });
    }

    if (action === 'preview' || action === 'commit') {
      if (!canManageWeeklyFeedback(actor)) return Response.json({ error: 'Not allowed' }, { status: 403 });
      if (!body.file_uri) return Response.json({ error: 'file_uri is required' }, { status: 400 });
      const rows = await readWorkbook(base44, body.file_uri);
      const result = await validate(base44, rows);
      if (result.error) return Response.json({ error: result.error }, { status: 400 });

      if (action === 'preview') return Response.json(result);

      const validRows = result.rows.filter((r) => r.status === 'valid' && r.tutor_id);
      const records = validRows.map((r) => ({
        week_start_date: r.week_start_date,
        week_end_date: r.week_end_date,
        week_key: r.week_start_date,
        class_name: r.class_name,
        class_code: r.class_code,
        course_name: r.course_name,
        tutor_id: r.tutor_id,
        tutor_name: r.tutor_name,
        notes: r.notes || '',
        status: 'pending',
        created_by_name: actor.customUser.full_name,
      }));

      let imported = 0;
      const failed = result.rows.filter((r) => r.status !== 'valid');
      for (let i = 0; i < records.length; i += 200) {
        const chunk = records.slice(i, i + 200);
        try {
          await db.asServiceRole.entities.WeeklyFeedbackAssignment.bulkCreate(chunk);
          imported += chunk.length;
        } catch (err) {
          chunk.forEach((c) => failed.push({ ...c, row: '', status: 'invalid', errors: [err.message] }));
        }
      }

      return Response.json({
        imported,
        skipped: result.summary.duplicate,
        failed: failed.length,
        failed_rows: failed,
      });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}