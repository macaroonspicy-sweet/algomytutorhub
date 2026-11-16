import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function sendTelegramMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return false;
  const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
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
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type, items = [] } = req.body || {};
    if (!items.length) {
      return res.status(200).json({ sent: 0 });
    }

    const { data: users, error } = await supabase
      .from('CustomUser')
      .select('id, full_name, is_active, telegram_chat_id');

    if (error) throw error;

    const activeUsers = (users || []).filter(
      (u) => u.is_active !== false && u.telegram_chat_id
    );

    const byId = new Map(activeUsers.map((u) => [String(u.id), u]));
    const byName = new Map(
      activeUsers.map((u) => [(u.full_name || '').trim().toLowerCase(), u])
    );

    let sent = 0;

    if (type === 'task_assigned') {
      for (const task of items) {
        const targetUser =
          (task.assigned_tutor_id && byId.get(String(task.assigned_tutor_id))) ||
          (task.assigned_tutor_name && byName.get(task.assigned_tutor_name.trim().toLowerCase()));

        if (!targetUser) continue;

        const msg = [
          `📋 <b>New Task Assigned!</b>`,
          ``,
          `Hi <b>${targetUser.full_name}</b>, a new task has been assigned to you:`,
          `• <b>Task:</b> ${task.title}`,
          `• <b>Category:</b> ${task.category || 'General'}`,
          `• <b>Priority:</b> ${task.priority || 'Medium'}`,
          `• <b>Deadline:</b> ${task.deadline || 'No specific deadline'}`,
          task.description ? `• <b>Details:</b> ${task.description}` : null,
          ``,
          `👉 View & update your progress here:\nhttps://algomytutorhub.vercel.app/`,
        ]
          .filter(Boolean)
          .join('\n');

        const ok = await sendTelegramMessage(targetUser.telegram_chat_id, msg);
        if (ok) sent += 1;
      }
    } else if (type === 'monthly_feedback_assigned') {
      for (const item of items) {
        const targetUser =
          (item.tutor_id && byId.get(String(item.tutor_id))) ||
          (item.tutor_name && byName.get(item.tutor_name.trim().toLowerCase()));

        if (!targetUser) continue;

        const periodText =
          item.week_start_date && item.week_end_date
            ? `${item.week_start_date.slice(0, 10)} to ${item.week_end_date.slice(0, 10)}`
            : item.week_end_date?.slice(0, 10) || '-';

        const msg = [
          `📝 <b>New Monthly Student Feedback!</b>`,
          ``,
          `Hi <b>${targetUser.full_name}</b>, you have a new monthly report scheduled for your class:`,
          `• <b>Class:</b> ${item.class_name || item.class_code || '-'}`,
          item.course_name ? `• <b>Course:</b> ${item.course_name}` : null,
          item.month ? `• <b>Period:</b> ${item.month}` : null,
          `• <b>Due Window:</b> ${periodText}`,
          item.notes ? `• <b>Notes:</b> ${item.notes}` : null,
          ``,
          `👉 Submit your feedback here:\nhttps://algomytutorhub.vercel.app/weekly-feedback`,
        ]
          .filter(Boolean)
          .join('\n');

        const ok = await sendTelegramMessage(targetUser.telegram_chat_id, msg);
        if (ok) sent += 1;
      }
    }

    return res.status(200).json({ ok: true, sent });
  } catch (err) {
    console.error('Telegram notify error:', err);
    return res.status(200).json({ ok: false, error: err.message });
  }
}