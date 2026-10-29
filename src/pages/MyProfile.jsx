const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useState } from 'react';

import { useAppAuth } from '@/lib/AppAuthContext';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Camera, Loader2, Save, Lock, Eye, EyeOff, Send } from 'lucide-react';

export default function MyProfile() {
  const { currentUser, refreshUser } = useAppAuth();
  const [form, setForm] = useState({
    full_name: currentUser?.full_name || '',
    phone_number: currentUser?.phone_number || '',
    telegram_account: currentUser?.telegram_account || '',
    telegram_bot_token: currentUser?.telegram_bot_token || '',
    email: currentUser?.email || '',
  });
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showTgToken, setShowTgToken] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(currentUser?.photo_url || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    let photoUrl = currentUser?.photo_url || '';
    if (photoFile) {
      const { file_url } = await db.integrations.Core.UploadFile({ file: photoFile });
      photoUrl = file_url;
    }
    const updateData = { ...form, photo_url: photoUrl };
    if (newPassword) {
      if (newPassword !== confirmPassword) {
        setMessage('Passwords do not match');
        setSaving(false);
        return;
      }
      updateData.password_hash = newPassword;
    }
    await db.entities.CustomUser.update(currentUser.id, updateData);
    await refreshUser();
    setMessage('Profile updated successfully!');
    setSaving(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">My Profile</h1>
        <p className="text-muted-foreground mt-1">Manage your account information</p>
      </div>

      <div className="bg-card border border-border rounded-2xl p-6 space-y-6">
        {/* Photo */}
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
          {[
            { label: 'Full Name', key: 'full_name', type: 'text' },
            { label: 'Phone Number', key: 'phone_number', type: 'tel' },
            { label: 'Telegram Account', key: 'telegram_account', type: 'text' },
            { label: 'Email', key: 'email', type: 'email' },
          ].map(f => (
            <div key={f.key} className="space-y-2">
              <Label className="text-foreground/80">{f.label}</Label>
              <Input
                type={f.type}
                value={form[f.key]}
                onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                className="bg-muted border-border"
              />
            </div>
          ))}
        </div>

        {currentUser?.role !== 'Tutor' && (
          <div className="border-t border-border pt-5">
            <div className="flex items-center gap-2 mb-2">
              <Send className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium text-foreground">Telegram Bot Token</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">Used to send QC results to tutors via Telegram. Get yours from @BotFather on Telegram. Configure once and it will be used automatically whenever you press the Telegram button.</p>
            <div className="space-y-2">
              <Label className="text-foreground/80">Bot Token</Label>
              <div className="relative">
                <Input
                  type={showTgToken ? 'text' : 'password'}
                  value={form.telegram_bot_token}
                  onChange={e => setForm({ ...form, telegram_bot_token: e.target.value })}
                  placeholder="e.g. 123456789:ABC-DEF1234ghIkl-zyx57W2v1u123ew11..."
                  className="bg-muted border-border pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowTgToken(!showTgToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showTgToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        )}

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
                  onChange={e => setNewPassword(e.target.value)}
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
                  onChange={e => setConfirmPassword(e.target.value)}
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