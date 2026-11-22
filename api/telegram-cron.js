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

const isSameTutorName = (a, b) => {
  if (!a || !b) return false;
  const x = String(a).toLowerCase().trim();
  const y = String(b).toLowerCase().trim();
  return x === y || x.includes(y) || y.includes(x);
};

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const targetTutorFilter = String(req.query?.tutor || '').trim();
    const overrideChatId = String(req.query?.chatId || '').trim();
    const isTestSingleTutor = targetTutorFilter.length > 0;
    const dryRun = String(req.query?.dryRun || '').toLowerCase() === 'true';

    const nowUtc8 = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const isSunday = nowUtc8.getUTCDay() === 0;
    const todayStr = nowUtc8.toISOString().slice(0, 10);
    const tomorrowStr = new Date(nowUtc8.getTime() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const { data: users } = await supabase
      .from('CustomUser')
      .select('id, full_name, username, is_active, telegram_chat_id');

    const activeUsers = (users || []).filter(
      (u) => u.is_active !== false && (u.telegram_chat_id || overrideChatId)
    );
    const byId = new Map(activeUsers.map((u) => [String(u.id), u]));
    const byName = new Map(
      activeUsers.map((u) => [(u.full_name || '').trim().toLowerCase(), u])
    );

    let taskReminders = 0;
    let feedbackReminders = 0;
    let weeklyReminderSent = false;
    const previews = [];

    // 1. Task reminders (due today or tomorrow)
    const { data: tasks } = await supabase
      .from('TutorTask')
      .select('*')
      .not('status', 'in', '("completed","cancelled")')
      .in('deadline', [todayStr, tomorrowStr]);

    for (const task of tasks || []) {
      if (!isTestSingleTutor && task.last_reminder_date === todayStr) continue;

      const user =
        (task.assigned_tutor_id && byId.get(String(task.assigned_tutor_id))) ||
        (task.assigned_tutor_name && byName.get(task.assigned_tutor_name.trim().toLowerCase())) ||
        (isTestSingleTutor &&
          activeUsers.find((u) =>
            isSameTutorName(u.full_name || u.username, targetTutorFilter)
          ));

      if (isTestSingleTutor && !isSameTutorName(task.assigned_tutor_name, targetTutorFilter)) {
        continue;
      }

      const targetChatId = overrideChatId || user?.telegram_chat_id;
      if (!targetChatId) continue;

      const urgency =
        task.deadline === todayStr
          ? '⚠️ <b>Friendly Reminder: Due Today!</b>'
          : '⏰ <b>Heads Up: Due Tomorrow!</b>';

      const msg = [
        urgency,
        ``,
        `Hi <b>${user?.full_name || task.assigned_tutor_name || 'Tutor'}</b>, just a quick nudge on your pending task:`,
        `• <b>Task:</b> ${task.title}`,
        `• <b>Category:</b> ${task.category || 'General'}`,
        `• <b>Deadline:</b> ${task.deadline}`,
        ``,
        `Please wrap it up and mark it completed on the portal:\nhttps://algomytutorhub.vercel.app/`,
      ].join('\n');

      const ok = await sendTelegramMessage(targetChatId, msg, dryRun);
      if (ok) {
        taskReminders += 1;
        if (dryRun) previews.push({ type: 'task', chatId: targetChatId, text: msg });
        if (!dryRun && !isTestSingleTutor) {
          await supabase
            .from('TutorTask')
            .update({ last_reminder_date: todayStr })
            .eq('id', task.id);
        }
      }
    }

    // 2. Monthly Student Feedback reminders (excluding completed, done_overdue, and rescheduled)
    const { data: feedbacks } = await supabase
      .from('WeeklyFeedbackAssignment')
      .select('*')
      .not('status', 'in', '("completed","done_overdue","rescheduled")');

    const pendingFeedbacks = (feedbacks || []).filter((fb) => {
      if (fb.is_done) return false;
      if (!isTestSingleTutor && fb.last_reminder_date === todayStr) return false;
      const dueDate = fb.week_end_date ? String(fb.week_end_date).slice(0, 10) : null;
      if (!isTestSingleTutor && dueDate && ![todayStr, tomorrowStr].includes(dueDate)) {
        return false;
      }
      if (isTestSingleTutor && !isSameTutorName(fb.tutor_name, targetTutorFilter)) {
        return false;
      }
      return true;
    });

    for (const fb of pendingFeedbacks) {
      const user =
        (fb.tutor_id && byId.get(String(fb.tutor_id))) ||
        (fb.tutor_name && byName.get(fb.tutor_name.trim().toLowerCase())) ||
        (isTestSingleTutor &&
          activeUsers.find((u) =>
            isSameTutorName(u.full_name || u.username, targetTutorFilter)
          ));

      const targetChatId = overrideChatId || user?.telegram_chat_id;
      if (!targetChatId) continue;

      const dueDate = fb.week_end_date ? String(fb.week_end_date).slice(0, 10) : '-';
      const urgency =
        dueDate === todayStr
          ? '⚠️ <b>Friendly Reminder: Monthly Feedback Due Today!</b>'
          : '⏰ <b>Heads Up: Monthly Feedback Due Tomorrow!</b>';

      const msg = [
        urgency,
        ``,
        `Hi <b>${user?.full_name || fb.tutor_name || 'Tutor'}</b>, make sure no monthly feedback is left behind for this class:`,
        `• <b>Class:</b> ${fb.class_name || fb.class_code || '-'}`,
        fb.course_name ? `• <b>Course:</b> ${fb.course_name}` : null,
        `• <b>Deadline:</b> ${dueDate}`,
        ``,
        `Please complete and mark it done here:\nhttps://algomytutorhub.vercel.app/weekly-feedback`,
      ]
        .filter(Boolean)
        .join('\n');

      const ok = await sendTelegramMessage(targetChatId, msg, dryRun);
      if (ok) {
        feedbackReminders += 1;
        if (dryRun) previews.push({ type: 'feedback', chatId: targetChatId, text: msg });
        if (!dryRun && !isTestSingleTutor) {
          await supabase
            .from('WeeklyFeedbackAssignment')
            .update({ last_reminder_date: todayStr })
            .eq('id', fb.id);
        }
      }
    }

    // 3. Weekly Attendance & Monthly Feedback Reminder (Sunday / weekly check)
    const triggerWeekly =
      (!isTestSingleTutor && (isSunday || String(req.query?.weekly || '') === 'true')) ||
      (isTestSingleTutor && Boolean(overrideChatId) && String(req.query?.weekly || '') === 'true');

    if (triggerWeekly) {
      const weeklyMsg = [
        `📅 <b>Weekly Attendance & Monthly Feedback Reminder</b>`,
        ``,
        `Hi Tutors! 👋 Please make sure this week's <b>attendance has no red marks</b> and <b>no monthly feedback is left behind</b>.`,
        ``,
        `If any class has a <b>red mark and has students</b>, please reach out to the <b>CS Group</b> or <b>Team Leader</b> immediately to adjust the schedule, as red marks will <b>affect your attendance KPI</b>.`,
        ``,
        `Thank you for your cooperation! 🌟`,
      ].join('\n');

      const targetGroupChat = overrideChatId || GROUP_CHAT_ID;
      if (targetGroupChat) {
        const ok = await sendTelegramMessage(targetGroupChat, weeklyMsg, dryRun);
        if (ok) {
          weeklyReminderSent = true;
          if (dryRun) previews.push({ type: 'weekly', chatId: targetGroupChat, text: weeklyMsg });
        }
      }
    }

    return res.status(200).json({
      ok: true,
      date: todayStr,
      isSunday,
      dryRun,
      taskReminders,
      feedbackReminders,
      weeklyReminderSent,
      ...(dryRun ? { previews } : {}),
    });
  } catch (err) {
    console.error('Telegram cron error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}