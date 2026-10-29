const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Send, Loader2, Link as LinkIcon, Paperclip, Users } from 'lucide-react';
import { toast } from 'sonner';

import { generateQCEvaluationPDF } from '@/lib/pdfGenerator';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CC_ROLES = ['Head of Tutor', 'QC Team'];

export default function TelegramSendDialog({ open, onOpenChange, record, botToken, onSendingChange, telegramAccount, displayName, initialMessage, pdfBlobGenerator }) {
  const [text, setText] = useState('');
  const [buttons, setButtons] = useState([]);
  const [sending, setSending] = useState(false);
  const [attachPdf, setAttachPdf] = useState(true);
  const [ccRecipients, setCcRecipients] = useState([]);
  const [ccSupervisors, setCcSupervisors] = useState(true);

  useEffect(() => {
    if (!open) return;
    if (initialMessage !== undefined) {
      setText(initialMessage);
    } else if (record) {
      setText(`📊 *QC Evaluation Report - ${record.tutor_name}*\n\nPeriod ${record.period || '?'} — ${MONTHS[(record.period_month || 1) - 1]} ${record.period_year}\nAdmin QC: ${record.admin_qc_name}\n\n📈 Total Score: *${record.evaluation_score !== undefined ? Number(record.evaluation_score).toFixed(1) : 'N/A'}/100*\n🏆 Grade: *${record.final_grade || 'N/A'}*\n\n📝 _${record.auto_generated_notes || record.notes || 'No notes.'}_`);
    }
    setButtons([]);
    setCcSupervisors(true);
    // Fetch CC recipients (Head of Tutor & QC Team with telegram account)
    db.entities.CustomUser.filter({ role: { $in: CC_ROLES }, is_active: true })
      .then(users => setCcRecipients(users.filter(u => u.telegram_account && u.telegram_account.trim())))
      .catch(() => setCcRecipients([]));
  }, [open, record, initialMessage]);

  useEffect(() => {
    if (onSendingChange) onSendingChange(sending);
  }, [sending, onSendingChange]);

  const addButton = () => setButtons(b => [...b, { text: '', url: '' }]);
  const updateButton = (i, field, val) => setButtons(b => b.map((btn, idx) => idx === i ? { ...btn, [field]: val } : btn));
  const removeButton = (i) => setButtons(b => b.filter((_, idx) => idx !== i));

  // Fetch getUpdates once and cache it — avoids repeated API calls & inconsistent results
  const fetchCachedUpdates = async () => {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates`);
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.result)) {
      throw new Error(data.description || 'Invalid bot token');
    }
    return data.result;
  };

  // Resolve a telegram account (username or numeric id) to a chat id using cached updates
  const resolveChatId = (account, updates) => {
    const chatId = account.trim();
    if (/^\d+$/.test(chatId)) return chatId;
    const username = chatId.replace(/^@/, '').toLowerCase();
    const match = updates.find(u => {
      const uname = (u.message?.from?.username || u.message?.chat?.username || '').toLowerCase();
      const cid = String(u.message?.chat?.id || '');
      return uname === username || cid === chatId;
    });
    if (!match || !match.message?.chat?.id) return null;
    return String(match.message.chat.id);
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Send to a single resolved chat id. Clones the blob per attempt so it
  // can be reused across recipients. Retries on rate-limit (429) and falls
  // back to plain text if Markdown parsing fails (so the document still
  // gets delivered even when the caption has invalid Markdown).
  const sendToChat = async (targetId, messageText, pdfBlob, filename, replyMarkup, rows) => {
    const caption = pdfBlob ? (messageText.length > 1024 ? messageText.slice(0, 1019) + '...' : messageText) : messageText;

    const buildRequest = (useMarkdown) => {
      if (pdfBlob) {
        const blobClone = pdfBlob.slice(0, pdfBlob.size, pdfBlob.type);
        const formData = new FormData();
        formData.append('chat_id', targetId);
        formData.append('document', blobClone, filename);
        formData.append('caption', caption);
        if (useMarkdown) formData.append('parse_mode', 'Markdown');
        if (replyMarkup) formData.append('reply_markup', replyMarkup);
        return { url: `https://api.telegram.org/bot${botToken}/sendDocument`, opts: { method: 'POST', body: formData } };
      }
      const payload = { chat_id: targetId, text: messageText };
      if (useMarkdown) payload.parse_mode = 'Markdown';
      if (replyMarkup) payload.reply_markup = { inline_keyboard: rows };
      return {
        url: `https://api.telegram.org/bot${botToken}/sendMessage`,
        opts: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      };
    };

    const attempt = async (useMarkdown) => {
      const { url, opts } = buildRequest(useMarkdown);
      let res = await fetch(url, opts);
      if (res.status === 429) {
        const retryAfter = (await res.json().catch(() => ({}))).parameters?.retry_after || 1;
        await sleep((retryAfter * 1000) + 500);
        const retry = buildRequest(useMarkdown);
        res = await fetch(retry.url, retry.opts);
      }
      return res.json().catch(() => ({ ok: false }));
    };

    // First attempt with Markdown; if it fails (e.g. 400 bad Markdown), retry as plain text
    let data = await attempt(true);
    if (!data.ok) data = await attempt(false);
    return data.ok;
  };

  const handleSend = async () => {
    const tgAccount = telegramAccount || record?.tutor_telegram;
    const name = displayName || record?.tutor_name;
    if (!tgAccount) { toast.error('Tutor has no Telegram account saved.'); return; }
    if (!botToken) {
      toast.error('No Telegram Bot Token', { description: 'Please set your Telegram Bot Token in My Profile before sending.' });
      return;
    }
    if (!text.trim()) { toast.error('Message cannot be empty.'); return; }
    for (const btn of buttons) {
      if (!btn.text.trim() || !btn.url.trim()) {
        toast.error('Incomplete button', { description: 'Each button needs both label and URL.' });
        return;
      }
    }

    setSending(true);
    try {
      // Fetch getUpdates ONCE and reuse for all chat-id resolutions
      let cachedUpdates = [];
      try { cachedUpdates = await fetchCachedUpdates(); } catch (e) {
        // If getUpdates fails but accounts are numeric IDs, we can still send
      }

      // Resolve tutor chat id
      const tutorId = resolveChatId(tgAccount, cachedUpdates);
      if (tutorId === null) {
        toast.error('Tutor has never started the bot', { description: `Please ask tutor @${tgAccount.replace(/^@/, '')} to press the Start button on your bot first.` });
        setSending(false);
        return;
      }

      const rows = [];
      if (buttons.length > 0) {
        for (let i = 0; i < buttons.length; i += 2) {
          rows.push(buttons.slice(i, i + 2).map(btn => ({ text: btn.text, url: btn.url })));
        }
      }
      const replyMarkup = rows.length > 0 ? JSON.stringify({ inline_keyboard: rows }) : undefined;

      // Prepare PDF once (cloned per recipient at send time)
      let pdfBlob = null, filename = null;
      if (attachPdf) {
        if (pdfBlobGenerator) {
          ({ blob: pdfBlob, filename } = await pdfBlobGenerator());
        } else {
          const aspects = await db.entities.QCEvaluationAspect.list('order_index');
          pdfBlob = await generateQCEvaluationPDF(record, aspects, { returnBlob: true });
          filename = `QC_Eval_${record.tutor_name || 'report'}_Period${record.period || ''}.pdf`;
        }
      }

      // Send to tutor
      const tutorOk = await sendToChat(tutorId, text, pdfBlob, filename, replyMarkup, rows);
      if (!tutorOk) {
        toast.error('Failed to send to tutor', { description: 'Telegram API error — tutor not notified.' });
        setSending(false);
        return;
      }

      // Send CC to Head of Tutor & QC Team
      const activeCc = ccSupervisors ? ccRecipients : [];
      let ccSuccess = 0;
      const unresolved = []; // chat id could not be resolved (user never /start-ed the bot)
      const sendFailed = []; // Telegram rejected the send
      if (activeCc.length > 0) {
        const ccHeader = `📋 *REPORT COPY — sent to ${name}*\n\n`;
        const ccMessage = ccHeader + text;
        for (const ccUser of activeCc) {
          try {
            const ccId = resolveChatId(ccUser.telegram_account, cachedUpdates);
            if (ccId === null) { unresolved.push(ccUser.full_name); continue; }
            // Small delay to avoid hitting Telegram rate limits
            await sleep(600);
            const ok = await sendToChat(ccId, ccMessage, pdfBlob, filename, undefined, []);
            ok ? ccSuccess++ : sendFailed.push(ccUser.full_name);
          } catch { sendFailed.push(ccUser.full_name); }
        }
      }

      if (activeCc.length > 0) {
        const parts = [`CC sent to ${ccSuccess}`];
        if (unresolved.length > 0) parts.push(`${unresolved.length} haven't started the bot: ${unresolved.join(', ')}`);
        if (sendFailed.length > 0) parts.push(`${sendFailed.length} failed to send: ${sendFailed.join(', ')}`);
        if (unresolved.length > 0 || sendFailed.length > 0) {
          toast.warning('Report sent to tutor', { description: parts.join(' • ') });
        } else {
          toast.success('Report sent to tutor', { description: `CC to ${ccSuccess} supervisor(s).` });
        }
      } else {
        toast.success(attachPdf ? 'PDF sent to Telegram!' : 'Message sent to Telegram!');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to send', { description: err.message });
    }
    setSending(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-4 h-4 text-accent" /> Send to Telegram
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2.5">
            To: <span className="text-foreground font-medium">{displayName || record?.tutor_name}</span> ({telegramAccount || record?.tutor_telegram})
          </div>

          {ccRecipients.length > 0 && (
            <label className="flex items-start gap-2 text-xs cursor-pointer select-none bg-accent/10 border border-accent/30 rounded-lg p-2.5">
              <input
                type="checkbox"
                checked={ccSupervisors}
                onChange={e => setCcSupervisors(e.target.checked)}
                className="accent-accent w-3.5 h-3.5 mt-0.5"
              />
              <div>
                <span className="text-foreground font-medium flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-accent" /> CC to Head of Tutor & QC Team
                </span>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {ccRecipients.length} recipient(s): {ccRecipients.map(u => u.full_name).join(', ')}
                </p>
              </div>
            </label>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Message Template</Label>
            <Textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={8}
              className="bg-background text-sm font-mono"
              placeholder="Type your message... supports *Markdown*"
            />
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">Supports Markdown: *bold*, _italic_, [link](url)</p>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={attachPdf}
                  onChange={e => setAttachPdf(e.target.checked)}
                  className="accent-accent w-3.5 h-3.5"
                />
                <Paperclip className="w-3.5 h-3.5 text-accent" /> Attach PDF
              </label>
            </div>
            {attachPdf && (
              <p className="text-[10px] text-muted-foreground/70 italic">PDF akan dikirim sebagai dokumen dengan teks ini sebagai caption (maks 1024 karakter).</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1.5"><LinkIcon className="w-3.5 h-3.5" /> Inline Buttons</Label>
              <Button size="sm" variant="outline" onClick={addButton} className="h-7 text-xs gap-1 border-border">
                <Plus className="w-3 h-3" /> Add Button
              </Button>
            </div>
            {buttons.length === 0 && (
              <p className="text-[10px] text-muted-foreground/60 italic">No buttons added. Message will be sent as plain text.</p>
            )}
            {buttons.map((btn, i) => (
              <div key={i} className="flex items-center gap-2 bg-muted/40 rounded-lg p-2">
                <Input
                  value={btn.text}
                  onChange={e => updateButton(i, 'text', e.target.value)}
                  placeholder="Button label"
                  className="bg-background text-xs h-8 flex-1"
                />
                <Input
                  value={btn.url}
                  onChange={e => updateButton(i, 'url', e.target.value)}
                  placeholder="https://..."
                  className="bg-background text-xs h-8 flex-[2]"
                />
                <Button size="icon" variant="ghost" onClick={() => removeButton(i)} className="w-7 h-7 hover:bg-destructive/20 hover:text-destructive shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>Cancel</Button>
          <Button onClick={handleSend} disabled={sending} className="bg-accent hover:bg-accent/90 gap-2">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send Message
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}