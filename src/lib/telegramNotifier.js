export async function triggerTelegramNotification(type, items) {
  if (!Array.isArray(items) || items.length === 0) return;
  try {
    await fetch('/api/telegram-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, items }),
    });
  } catch (err) {
    // Non-blocking: Telegram network errors will not block main database operations
    console.warn('Telegram notification skipped:', err);
  }
}