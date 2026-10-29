const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, Loader2, Trash2, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { sanitizeHtml } from '@/lib/sanitize';

const EMPTY_FORM = {
  notes: '',
  is_active: false,
};

const quillModules = {
  toolbar: [
    [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
    [{ 'font': [] }],
    [{ 'size': ['small', false, 'large', 'huge'] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ 'color': [] }, { 'background': [] }],
    [{ 'script': 'sub' }, { 'script': 'super' }],
    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
    [{ 'indent': '-1' }, { 'indent': '+1' }],
    [{ 'align': [] }],
    ['blockquote', 'code-block'],
    ['link', 'image'],
    ['clean'],
  ],
};

const quillFormats = [
  'header', 'font', 'size',
  'bold', 'italic', 'underline', 'strike',
  'color', 'background',
  'script',
  'list', 'bullet',
  'indent',
  'align',
  'blockquote', 'code-block',
  'link', 'image',
];

export default function PdfSettings() {
  const [bgImageUrl, setBgImageUrl] = useState('');
  const [uploadingBg, setUploadingBg] = useState(false);
  const [bgActive, setBgActive] = useState(false);
  
  // Referral state
  const [referrals, setReferrals] = useState([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => { 
    loadPdfSettings();
    loadReferrals(); 
  }, []);

  const loadPdfSettings = async () => {
    const settings = await db.entities.PdfSettings.filter({ setting_key: 'background_image', is_active: true });
    if (settings.length > 0) {
      setBgImageUrl(settings[0].setting_value);
      setBgActive(settings[0].is_active);
    }
  };

  const loadReferrals = async () => {
    const data = await db.entities.Referral.list('-created_date');
    setReferrals(data);
  };

  const handleToggleBgActive = async () => {
    const newActive = !bgActive;
    setBgActive(newActive);
    
    // Update or create PdfSettings record
    const settings = await db.entities.PdfSettings.filter({ setting_key: 'background_image' });
    if (settings.length > 0) {
      await db.entities.PdfSettings.update(settings[0].id, { is_active: newActive, setting_value: bgImageUrl });
    } else if (bgImageUrl) {
      await db.entities.PdfSettings.create({ setting_key: 'background_image', setting_value: bgImageUrl, is_active: newActive });
    }
    
    toast.success(newActive ? 'Background activated for PDF' : 'Background deactivated');
  };

  const handleBgUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingBg(true);
    const { file_url } = await db.integrations.Core.UploadFile({ file });
    setBgImageUrl(file_url);
    
    // Save to PdfSettings entity
    const settings = await db.entities.PdfSettings.filter({ setting_key: 'background_image' });
    if (settings.length > 0) {
      await db.entities.PdfSettings.update(settings[0].id, { setting_value: file_url, is_active: bgActive });
    } else {
      await db.entities.PdfSettings.create({ setting_key: 'background_image', setting_value: file_url, is_active: true });
      setBgActive(true);
    }
    
    setUploadingBg(false);
    toast.success('Background image uploaded');
  };

  const handleRemoveBg = async () => {
    setBgImageUrl('');
    setBgActive(false);
    
    // Remove from PdfSettings entity
    const settings = await db.entities.PdfSettings.filter({ setting_key: 'background_image' });
    for (const setting of settings) {
      await db.entities.PdfSettings.delete(setting.id);
    }
    
    toast.success('Background image removed');
  };

  const openCreate = () => { setEditing(null); setForm({ notes: '', is_active: false }); setOpen(true); };
  const openEdit = (r) => { setEditing(r); setForm({ notes: r.notes || '', is_active: r.is_active || false }); setOpen(true); };

  const handleSave = async () => {
    setSaving(true);
    try {
      // If setting this referral as active, deactivate all others first
      if (form.is_active) {
        const otherActive = referrals.filter(r => r.is_active && r.id !== editing?.id);
        for (const r of otherActive) {
          await db.entities.Referral.update(r.id, { is_active: false });
        }
      }
      
      if (editing) {
        await db.entities.Referral.update(editing.id, form);
        toast.success('Referral updated');
      } else {
        await db.entities.Referral.create(form);
        toast.success('Referral created');
      }
      setSaving(false);
      setOpen(false);
      loadReferrals();
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save referral');
      setSaving(false);
    }
  };

  const handleToggleReferralActive = async (referral) => {
    const newActive = !referral.is_active;
    
    // If activating, deactivate all others first
    if (newActive) {
      const otherActive = referrals.filter(r => r.is_active);
      for (const r of otherActive) {
        await db.entities.Referral.update(r.id, { is_active: false });
      }
    }
    
    await db.entities.Referral.update(referral.id, { is_active: newActive });
    loadReferrals();
    toast.success(newActive ? 'Referral activated for PDF' : 'Referral deactivated');
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this referral?')) return;
    await db.entities.Referral.delete(id);
    loadReferrals();
    toast.success('Referral deleted');
  };

  const filtered = referrals;

  return (
    <div className="space-y-6">
      {/* PDF Background Settings */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <h2 className="text-xl font-bold text-foreground mb-4">PDF Background Settings</h2>
        <div className="space-y-4">
          <input 
            type="file" 
            accept="image/*" 
            id="bg-upload" 
            onChange={handleBgUpload} 
            className="hidden" 
            disabled={uploadingBg}
          />
          <div className="flex items-center gap-4">
            {bgImageUrl ? (
              <img src={bgImageUrl} alt="PDF background" className="w-32 h-20 object-cover rounded-lg border border-border" />
            ) : (
              <div className="w-32 h-20 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-muted-foreground">
                <Upload className="w-6 h-6" />
              </div>
            )}
            <div className="flex-1 space-y-1">
              <p className="text-sm text-foreground font-medium">
                {bgImageUrl ? 'Current Background Image' : 'No background image uploaded'}
              </p>
              <p className="text-xs text-muted-foreground">
                {bgImageUrl
                  ? bgActive
                    ? '✓ Active - appears on all PDF exports'
                    : 'Inactive - click Activate to use on PDFs'
                  : 'Upload an image to use as background for PDF exports'}
              </p>
            </div>
            <div className="flex gap-2">
              {bgImageUrl && (
                <Button 
                  variant={bgActive ? "default" : "outline"} 
                  onClick={handleToggleBgActive}
                  className={bgActive ? "bg-green-600 hover:bg-green-700" : "border-border"}
                  size="sm"
                >
                  {bgActive ? 'Active' : 'Activate'}
                </Button>
              )}
              <Button 
                variant="outline" 
                onClick={() => document.getElementById('bg-upload').click()}
                disabled={uploadingBg}
                className="border-border gap-2"
                size="sm"
              >
                {uploadingBg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {bgImageUrl ? 'Change' : 'Upload'}
              </Button>
              {bgImageUrl && (
                <Button variant="ghost" onClick={handleRemoveBg} className="text-destructive hover:bg-destructive/10" size="sm">
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Referral Management */}
      <div className="bg-card border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">Referral Management</h2>
            <p className="text-sm text-muted-foreground">Track student referrals (only active referral appears in PDF)</p>
          </div>
          <Button onClick={openCreate} className="bg-primary hover:bg-primary/90 gap-2">
            <Plus className="w-4 h-4" /> Add Referral
          </Button>
        </div>

        <div className="space-y-2">
          {filtered.map(r => (
            <div key={r.id} className={`p-4 rounded-xl border border-border ${r.is_active ? 'bg-green-900/20 border-green-700' : 'bg-secondary/50'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  {r.notes && <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(r.notes) }} className="text-foreground [&_a]:text-primary [&_a]:hover:underline [&_a]:font-medium" />}
                  {r.is_active && (
                    <div className="flex items-center gap-2 mt-2 text-green-400 text-xs">
                      <span>✓ Active - will appear on PDF exports</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  <Button 
                    size="sm" 
                    variant={r.is_active ? "default" : "outline"} 
                    onClick={() => handleToggleReferralActive(r)}
                    className={`h-8 px-3 text-xs ${r.is_active ? 'bg-green-600 hover:bg-green-700' : 'border-border hover:bg-green-600/20 hover:text-green-400'}`}
                  >
                    {r.is_active ? 'Active' : 'Activate'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(r)} className="w-8 h-8 p-0 hover:bg-primary/20 hover:text-primary">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(r.id)} className="w-8 h-8 p-0 hover:bg-destructive/20 hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-muted-foreground py-8">No referrals found</div>
          )}
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-5xl w-[90vw] max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-xl">{editing ? 'Edit Referral' : 'Add Referral'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 flex-1 overflow-y-auto">
            <div className="space-y-2">
              <Label className="text-base font-medium text-foreground">Referral Description</Label>
              <div className="rounded-lg overflow-hidden border border-border bg-background">
                <ReactQuill
                  theme="snow"
                  value={form.notes}
                  onChange={html => setForm({ ...form, notes: html })}
                  modules={quillModules}
                  formats={quillFormats}
                  placeholder="Write referral description with rich formatting..."
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is-active"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="rounded border-border text-primary focus:ring-primary"
              />
              <Label htmlFor="is-active" className="text-sm text-foreground cursor-pointer">
                Set as active (only 1 referral can be active at a time)
              </Label>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)} className="border-border">Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90 min-w-[120px]">
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editing ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}