import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_CHAT_ID;

async function sendTelegramMessage(chatId, text, dryRun = false) {
  if (dryRun) {
    return { ok: true, dryRun: true, chatId, text };
  }
  if (!BOT_TOKEN || !chatId) {
    return { ok: false, reason: 'Missing TELEGRAM_BOT_TOKEN or target chatId' };
  }
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  return res.json();
}

const isSameTutorName = (a, b) => {
  if (!a || !b) return false;
  const x = String(a).toLowerCase().trim();
  const y = String(b).toLowerCase().trim();
  return x === y || x.includes(y) || y.includes(x);
};

export default async function handler(req, res) {
  try {
    const targetTutorFilter = String(req.query?.tutor || '').trim();
    const overrideChatId = String(req.query?.chatId || '').trim();
    const triggerType = String(req.query?.type || 'all').trim().toLowerCase(); // 'all' | 'feedback' | 'weekly'
    const isTestSingleTutor = targetTutorFilter.length > 0;
    const dryRun = String(req.query?.dryRun || '').toLowerCase() === 'true';

    const nowMyt = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }));
    const isSunday = nowMyt.getDay() === 0;
    const todayStr = nowMyt.toISOString().slice(0, 10);

    // 1. Fetch active tutors
    const { data: users } = await supabase
      .from('CustomUser')
      .select('id, full_name, username, telegram_chat_id, telegram_username, is_active, status');

    const userMap = new Map();
    let matchedSingleUser = null;

    (users || []).forEach((u) => {
      if (u.is_active === false || u.status === 'Inactive') return;
      if (u.id) userMap.set(u.id, u);
      if (u.full_name) userMap.set(u.full_name.toLowerCase().trim(), u);
      if (
        isTestSingleTutor &&
        !matchedSingleUser &&
        isSameTutorName(u.full_name || u.username, targetTutorFilter)
      ) {
        matchedSingleUser = u;
      }
    });

    // 2. Fetch unfinished Monthly Student Feedback assignments (excluding Done & Rescheduled)
    const { data: assignments, error: fbErr } = await supabase
      .from('WeeklyFeedbackAssignment')
      .select('*');

    if (fbErr) throw fbErr;

    const pendingByTutor = new Map();

    (assignments || []).forEach((item) => {
      const status = String(item.status || '').trim().toLowerCase();
      const isDone =
        item.is_done === true || ['completed', 'done', 'done_overdue'].includes(status);
      const isRescheduled = status === 'rescheduled';

      // Skip completed or rescheduled feedback
      if (isDone || isRescheduled) return;

      if (!isTestSingleTutor) {
        const deadlineStr = item.week_end_date ? String(item.week_end_date).slice(0, 10) : null;
        if (deadlineStr && deadlineStr > todayStr) return;
      }

      const tName = item.tutor_name || 'Tutor';
      if (isTestSingleTutor && !isSameTutorName(tName, targetTutorFilter)) return;

      const list = pendingByTutor.get(tName) || [];
      list.push(item);
      pendingByTutor.set(tName, list);
    });

    const sentLogs = [];

    // 3. Monthly Student Feedback Reminder (with class list, only to tutors who haven't finished)
    if (triggerType === 'all' || triggerType === 'feedback') {
      for (const [tutorName, items] of pendingByTutor.entries()) {
        const userObj =
          userMap.get(items[0]?.tutor_id) ||
          userMap.get(tutorName.toLowerCase().trim()) ||
          matchedSingleUser;

        const classListLines = items
          .map((i, idx) => {
            const className = i.class_name || i.class_code || 'Class';
            const courseName = i.course_name ? ` (${i.course_name})` : '';
            return `${idx + 1}. <b>${className}</b>${courseName}`;
          })
          .join('\n');

        const feedbackMsg =
          `⏰ <b>Monthly Student Feedback Reminder</b>\n\n` +
          `Hi <b>${tutorName}</b>, you still have unfinished <b>Monthly Student Feedback</b> for the following class(es):\n\n` +
          `${classListLines}\n\n` +
          `Please make sure no monthly feedback is left behind and submit before <b>11:59 PM</b>. Thank you! 🙏\n` +
          `🔗 https://algomytutorhub.vercel.app/weekly-feedback`;

        const chatTarget = overrideChatId || userObj?.telegram_chat_id;
        const sendRes = await sendTelegramMessage(chatTarget, feedbackMsg, dryRun);
        sentLogs.push({
          type: 'Monthly Feedback Reminder (With Class List)',
          tutor: tutorName,
          target: 'DM',
          chatId: chatTarget || null,
          count: items.length,
          result: sendRes,
        });
      }
    }

    // 4. Weekly Combined Reminder (Sunday / weekly check)
    if (
      !isTestSingleTutor &&
      (isSunday || triggerType === 'weekly') &&
      (triggerType === 'all' || triggerType === 'weekly')
    ) {
      const weeklyCombinedMsg =
        `📅 <b>Weekly Attendance & Monthly Feedback Reminder</b>\n\n` +
        `Hi Tutors! 👋 Please make sure this week's <b>attendance has no red marks</b> and <b>no monthly feedback is left behind</b>.\n\n` +
        `If any class has a <b>red mark and has students</b>, please reach out to the <b>CS Group</b> or <b>Team Leader</b> immediately to adjust the schedule, as red marks will <b>affect your attendance KPI</b>.\n\n` +
        `Thank you for your cooperation! 🌟`;

      if (GROUP_CHAT_ID) {
        const grpRes = await sendTelegramMessage(GROUP_CHAT_ID, weeklyCombinedMsg, dryRun);
        sentLogs.push({ type: 'Weekly Combined Reminder (Tutor Group)', result: grpRes });
      }
    }

    return res.status(200).json({
      ok: true,
      mode: isTestSingleTutor ? `single-tutor (${targetTutorFilter})` : 'full-cron',
      triggerType,
      dryRun,
      mytTime: nowMyt.toISOString(),
      isSunday,
      pendingFeedbackTutorsCount: pendingByTutor.size,
      sentLogs,
    });
  } catch (err) {
    console.error('Telegram reminder error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}