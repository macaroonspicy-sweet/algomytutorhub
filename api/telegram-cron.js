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
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const nowUtc8 = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const todayStr = nowUtc8.toISOString().slice(0, 10);
    const tomorrowStr = new Date(nowUtc8.getTime() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const { data: users } = await supabase
      .from('CustomUser')
      .select('id, full_name, is_active, telegram_chat_id');

    const activeUsers = (users || []).filter(
      (u) => u.is_active !== false && u.telegram_chat_id
    );
    const byId = new Map(activeUsers.map((u) => [String(u.id), u]));
    const byName = new Map(
      activeUsers.map((u) => [(u.full_name || '').trim().toLowerCase(), u])
    );

    let taskReminders = 0;
    let feedbackReminders = 0;

    const { data: tasks } = await supabase
      .from('TutorTask')
      .select('*')
      .not('status', 'in', '("completed","cancelled")')
      .in('deadline', [todayStr, tomorrowStr]);

    for (const task of tasks || []) {
      if (task.last_reminder_date === todayStr) continue;

      const user =
        (task.assigned_tutor_id && byId.get(String(task.assigned_tutor_id))) ||
        (task.assigned_tutor_name && byName.get(task.assigned_tutor_name.trim().toLowerCase()));

      if (!user) continue;

      const urgency =
        task.deadline === todayStr
          ? '⚠️ <b>Friendly Reminder: Due Today!</b>'
          : '⏰ <b>Heads Up: Due Tomorrow!</b>';

      const msg = [
        urgency,
        ``,
        `Hi <b>${user.full_name}</b>, just a quick nudge on your pending task:`,
        `• <b>Task:</b> ${task.title}`,
        `• <b>Category:</b> ${task.category || 'General'}`,
        `• <b>Deadline:</b> ${task.deadline}`,
        ``,
        `Please wrap it up and mark it completed on the portal:\nhttps://algomytutorhub.vercel.app/`,
      ].join('\n');

      const ok = await sendTelegramMessage(user.telegram_chat_id, msg);
      if (ok) {
        taskReminders += 1;
        await supabase
          .from('TutorTask')
          .update({ last_reminder_date: todayStr })
          .eq('id', task.id);
      }
    }

    const { data: feedbacks } = await supabase
      .from('WeeklyFeedbackAssignment')
      .select('*')
      .not('status', 'in', '("completed","rescheduled")')
      .in('week_end_date', [todayStr, tomorrowStr]);

    for (const fb of feedbacks || []) {
      if (fb.is_done || fb.last_reminder_date === todayStr) continue;

      const user =
        (fb.tutor_id && byId.get(String(fb.tutor_id))) ||
        (fb.tutor_name && byName.get(fb.tutor_name.trim().toLowerCase()));

      if (!user) continue;

      const dueDate = fb.week_end_date?.slice(0, 10);
      const urgency =
        dueDate === todayStr
          ? '⚠️ <b>Friendly Reminder: Monthly Feedback Due Today!</b>'
          : '⏰ <b>Heads Up: Monthly Feedback Due Tomorrow!</b>';

      const msg = [
        urgency,
        ``,
        `Hi <b>${user.full_name}</b>, your monthly student report for this class is coming up soon:`,
        `• <b>Class:</b> ${fb.class_name || fb.class_code || '-'}`,
        fb.course_name ? `• <b>Course:</b> ${fb.course_name}` : null,
        `• <b>Deadline:</b> ${dueDate}`,
        ``,
        `Please complete and mark it done here:\nhttps://algomytutorhub.vercel.app/weekly-feedback`,
      ]
        .filter(Boolean)
        .join('\n');

      const ok = await sendTelegramMessage(user.telegram_chat_id, msg);
      if (ok) {
        feedbackReminders += 1;
        await supabase
          .from('WeeklyFeedbackAssignment')
          .update({ last_reminder_date: todayStr })
          .eq('id', fb.id);
      }
    }

    return res.status(200).json({
      ok: true,
      date: todayStr,
      taskReminders,
      feedbackReminders,
    });
  } catch (err) {
    console.error('Telegram cron error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}