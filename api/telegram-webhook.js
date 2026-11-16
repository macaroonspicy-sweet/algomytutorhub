import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function sendTelegramMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true, message: 'Telegram webhook active' });
  }

  try {
    const update = req.body || {};
    const msg = update.message;
    if (!msg || !msg.text) {
      return res.status(200).json({ ok: true });
    }

    const chatId = String(msg.chat.id);
    const text = msg.text.trim();
    const tgUsername = msg.from?.username ? `@${msg.from.username}` : null;

    if (text.startsWith('/start')) {
      const parts = text.split(/\s+/);
      const userId = parts[1]?.trim();

      if (!userId) {
        await sendTelegramMessage(
          chatId,
          '👋 Hey there! To link your Telegram with <b>Algonova Tutor Hub</b>, please open your <b>My Profile</b> page on the web portal and click the <b>Connect Telegram</b> button.'
        );
        return res.status(200).json({ ok: true });
      }

      const { data: user, error: findErr } = await supabase
        .from('CustomUser')
        .select('id, full_name, role, is_active, telegram_username, telegram_account')
        .eq('id', userId)
        .maybeSingle();

      if (findErr || !user) {
        await sendTelegramMessage(
          chatId,
          '⚠️ Oops! We could not find your account in Algonova Tutor Hub. Please go back to <b>My Profile</b> on the portal and click <b>Connect Telegram</b> again.'
        );
        return res.status(200).json({ ok: true });
      }

      const cleanUsername = tgUsername || user.telegram_username || user.telegram_account || null;

      await supabase
        .from('CustomUser')
        .update({
          telegram_chat_id: chatId,
          telegram_username: cleanUsername,
          telegram_account: cleanUsername ? cleanUsername.replace(/^@/, '') : user.telegram_account,
          telegram_connected_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      await sendTelegramMessage(
        chatId,
        `✅ <b>Connected to Algonova Tutor Hub!</b>\n\nHi <b>${user.full_name}</b>! Your Telegram (${cleanUsername || 'account'}) is now linked.\n\nYou'll receive friendly updates right here whenever you have a new <b>Task</b> or <b>Monthly Student Feedback</b> assignment, plus a gentle reminder before any deadline. Happy teaching! 🚀`
      );
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(200).json({ ok: true });
  }
}