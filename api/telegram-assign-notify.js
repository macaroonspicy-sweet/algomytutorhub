import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROUP_CHAT_ID = process.env.TELEGRAM_GROUP_CHAT_ID;

async function sendTelegramMessage(chatId, text) {
  if (!BOT_TOKEN || !chatId) return false;
  const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  return resp.ok;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const {
      kind, // 'monthly_feedback' | 'task'
      tutorId,
      tutorName,
      className,
      courseName,
      taskTitle,
      dueDate,
      notes,
    } = req.body || {};

    const { data: users } = await supabase
      .from('CustomUser')
      .select('id, full_name, telegram_chat_id, telegram_username');

    const matchedUser = (users || []).find(
      (u) =>
        (tutorId && String(u.id) === String(tutorId)) ||
        (tutorName &&
          String(u.full_name || '').trim().toLowerCase() === String(tutorName).trim().toLowerCase())
    );

    const displayTutor = tutorName || matchedUser?.full_name || 'Tutor';
    const mention = matchedUser?.telegram_username
      ? `@${String(matchedUser.telegram_username).replace(/^@/, '')}`
      : `<b>${displayTutor}</b>`;

    const message =
      kind === 'task'
        ? [
            `📌 <b>New Task Assigned</b>`,
            ``,
            `Hi ${mention}, a new task has been assigned to you:`,
            `• <b>Task:</b> ${taskTitle || 'Assigned Task'}`,
            dueDate ? `• <b>Deadline:</b> ${dueDate}` : null,
            notes ? `• <b>Notes:</b> ${notes}` : null,
            ``,
            `Please check your dashboard and complete it on time. Thank you! 🙏`,
            `https://algomytutorhub.vercel.app/`,
          ]
            .filter(Boolean)
            .join('\n')
        : [
            `📝 <b>New Monthly Student Feedback Assigned</b>`,
            ``,
            `Hi ${mention}, a new Monthly Student Feedback assignment has been added:`,
            `• <b>Class:</b> ${className || 'Class'}`,
            courseName ? `• <b>Course:</b> ${courseName}` : null,
            dueDate ? `• <b>Deadline:</b> ${dueDate}` : null,
            ``,
            `Please make sure no monthly feedback is left behind and complete it on time. Thank you! 🙏`,
            `https://algomytutorhub.vercel.app/weekly-feedback`,
          ]
            .filter(Boolean)
            .join('\n');

    if (matchedUser?.telegram_chat_id) {
      await sendTelegramMessage(matchedUser.telegram_chat_id, message);
    }
    if (GROUP_CHAT_ID) {
      await sendTelegramMessage(GROUP_CHAT_ID, message);
    }

    return res.status(200).json({ ok: true, notifiedTutor: displayTutor });
  } catch (err) {
    console.error('Assign notification error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}