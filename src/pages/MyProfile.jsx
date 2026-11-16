import React, { useEffect, useState } from 'react';
import { useAppAuth } from '@/lib/AppAuthContext';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Camera, Loader2, Save, Lock, Eye, EyeOff, Send,
  CheckCircle2, ExternalLink, RefreshCw, Unlink
} from 'lucide-react';
import { toast } from 'sonner';

export default function MyProfile() {
  const { currentUser, refreshUser } = useAppAuth();
  const [form, setForm] = useState({
    full_name: currentUser?.full_name || '',
    phone_number: currentUser?.phone_number || '',
    telegram_account: currentUser?.telegram_username || currentUser?.telegram_account || '',
    email: currentUser?.email || '',
  });
  const [tgStatus, setTgStatus] = useState({
    chat_id: currentUser?.telegram_chat_id || '',
    username: currentUser?.telegram_username || currentUser?.telegram_account || '',
    connected_at: currentUser?.telegram_connected_at || null,
  });
  const [checkingTg, setCheckingTg] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(currentUser?.photo_url || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const botUsername = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '').replace(/^@/, '');

  const fetchLatestTelegramStatus = async (silent = false) => {
    if (!currentUser?.id) return;
    if (!silent) setCheckingTg(true);
    try {
      const { data, error } = await supabase
        .from('CustomUser')
        .select('telegram_chat_id, telegram_username, telegram_account, telegram_connected_at')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setTgStatus({
          chat_id: data.telegram_chat_id || '',
          username: data.telegram_username || data.telegram_account || '',
          connected_at: data.telegram_connected_at || null,
        });
        if (data.telegram_username || data.telegram_account) {
          setForm((prev) => ({
            ...prev,
            telegram_account: (data.telegram_username || data.telegram_account || '').replace(/^@/, ''),
          }));
        }
        if (!silent) {
          if (data.telegram_chat_id) {
            toast.success('Connected to Telegram!');
            await refreshUser?.();
          } else {
            toast.info('Not connected yet. Please press Start in the Telegram bot.');
          }
        }
      }
    } catch (err) {
      if (!silent) toast.error('Could not check Telegram status', { description: err.message });
    } finally {
      if (!silent) setCheckingTg(false);
    }
  };

  useEffect(() => {
    if (currentUser?.id) {
      fetchLatestTelegramStatus(true);
    }
  }, [currentUser?.id]);

  // Automatically check connection status when tutor returns from Telegram tab
  useEffect(() => {
    const onFocus = () => {
      if (!tgStatus.chat_id && currentUser?.id) {
        fetchLatestTelegramStatus(true);
      }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [tgStatus.chat_id, currentUser?.id]);

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const uploadPhotoToSupabase = async (file) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `profiles/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('tutor-photos')
      .upload(filePath, file, { upsert: true });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from('tutor-photos')
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  };

  const handleConnectTelegram = async () => {
    const cleanUsername = form.telegram_account.trim().replace(/^@/, '');
    if (!cleanUsername) {
      toast.error('Please enter your Telegram username first (e.g. putrinadia)');
      return;
    }
    if (!botUsername) {
      toast.error('Bot username is not configured yet');
      return;
    }

    try {
      await supabase
        .from('CustomUser')
        .update({
          telegram_account: cleanUsername,
          telegram_username: `@${cleanUsername}`,
        })
        .eq('id', currentUser.id);

      const deepLink = `https://t.me/${botUsername}?start=${currentUser.id}`;
      window.open(deepLink, '_blank', 'noopener,noreferrer');
      toast.info('Opening Telegram... Please click "Start" in the bot chat.');
    } catch (err) {
      toast.error('Could not save Telegram username', { description: err.message });
    }
  };

  const handleDisconnectTelegram = async () => {
    setCheckingTg(true);
    try {
      const { error } = await supabase
        .from('CustomUser')
        .update({
          telegram_chat_id: null,
          telegram_connected_at: null,
        })
        .eq('id', currentUser.id);

      if (error) throw error;
      setTgStatus((prev) => ({ ...prev, chat_id: '', connected_at: null }));
      await refreshUser?.();
      toast.success('Disconnected from Telegram');
    } catch (err) {
      toast.error('Failed to disconnect', { description: err.message });
    } finally {
      setCheckingTg(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      let photoUrl = currentUser?.photo_url || '';
      if (photoFile) {
        photoUrl = await uploadPhotoToSupabase(photoFile);
      }

      const cleanTg = form.telegram_account.trim().replace(/^@/, '');
      const updateData = {
        full_name: form.full_name,
        phone_number: form.phone_number,
        telegram_account: cleanTg,
        telegram_username: cleanTg ? `@${cleanTg}` : null,
        email: form.email,
        photo_url: photoUrl,
      };

      if (newPassword) {
        if (newPassword !== confirmPassword) {
          setMessage('Passwords do not match');
          setSaving(false);
          return;
        }
        const msgBuffer = new TextEncoder().encode(newPassword);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashHex = Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        updateData.password_hash = `sha256:${hashHex}`;
      }

      const { error } = await supabase
        .from('CustomUser')
        .update(updateData)
        .eq('id', currentUser.id);

      if (error) throw error;

      await refreshUser?.();
      setMessage('Profile updated successfully!');
      toast.success('Profile updated');
    } catch (err) {
      setMessage(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const isConnected = Boolean(tgStatus.chat_id);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">My Profile</h1>
        <p className="text-muted-foreground mt-1">Manage your account information & Telegram notifications</p>
      </div>

      <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
        <div className="flex items-center gap-5">
          <div className="relative">
            {photoPreview ? (
              <img src={photoPreview} className="w-20 h-20 rounded-2xl object-cover" alt="Profile" />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-primary/20 flex items-center justify-center text-primary text-2xl font-bold">
                {currentUser?.full_name?.charAt(0) || 'U'}
              </div>
            )}
            <label className="absolute -bottom-2 -right-2 w-7 h-7 bg-primary rounded-full flex items-center justify-center cursor-pointer hover:bg-primary/80 transition-all">
              <Camera className="w-3.5 h-3.5 text-white" />
              <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
            </label>
          </div>
          <div>
            <div className="font-semibold text-foreground">{currentUser?.full_name}</div>
            <div className="text-sm text-muted-foreground">{currentUser?.role}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-2">
            <Label className="text-foreground/80">Full Name</Label>
            <Input
              type="text"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="bg-muted border-border"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-foreground/80">Phone Number</Label>
            <Input
              type="tel"
              value={form.phone_number}
              onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
              className="bg-muted border-border"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label className="text-foreground/80">Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="bg-muted border-border"
            />
          </div>
        </div>

        {/* Telegram Push Notification Connection */}
        <div className="border-t border-border pt-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Send className="w-4 h-4 text-primary" />
              <span className="font-semibold text-foreground">Telegram Push Notifications</span>
            </div>
            {isConnected ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">
                <CheckCircle2 className="w-3.5 h-3.5" /> Connected to Telegram
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-600 border border-amber-500/30">
                Not Connected
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Enter your Telegram username, click <b>Connect Telegram</b>, and press <b>Start</b> in the bot chat to receive instant task updates and friendly deadline reminders.
          </p>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">@</span>
              <Input
                type="text"
                placeholder="username_telegram"
                value={form.telegram_account.replace(/^@/, '')}
                onChange={(e) => setForm({ ...form, telegram_account: e.target.value })}
                className="bg-muted border-border pl-7"
              />
            </div>

            <Button
              type="button"
              onClick={handleConnectTelegram}
              className="bg-sky-600 hover:bg-sky-700 text-white gap-1.5"
            >
              <ExternalLink className="w-4 h-4" />
              {isConnected ? 'Re-open Bot' : 'Connect Telegram'}
            </Button>

            {!isConnected ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => fetchLatestTelegramStatus(false)}
                disabled={checkingTg}
                className="border-border gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checkingTg ? 'animate-spin' : ''}`} />
                Check Status
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                onClick={handleDisconnectTelegram}
                disabled={checkingTg}
                className="text-muted-foreground hover:text-destructive gap-1.5"
                title="Disconnect Telegram"
              >
                <Unlink className="w-3.5 h-3.5" />
                Disconnect
              </Button>
            )}
          </div>
        </div>

        <div className="border-t border-border pt-5">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium text-foreground">Change Password</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-foreground/80">New Password</Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Leave blank to keep current"
                  className="bg-muted border-border pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground/80">Confirm Password</Label>
              <div className="relative">
                <Input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="bg-muted border-border pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {message && (
          <div className={`px-4 py-3 rounded-lg text-sm ${message.includes('success') ? 'bg-chart-3/20 text-chart-3' : 'bg-destructive/20 text-destructive'}`}>
            {message}
          </div>
        )}

        <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}