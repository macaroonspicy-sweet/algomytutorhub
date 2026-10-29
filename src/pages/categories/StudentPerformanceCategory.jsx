const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Search, Star } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

const EMPTY_FORM = {
  aspect_title: '',
  max_point: 5,
  point_1_description: '',
  point_2_description: '',
  point_3_description: '',
  point_4_description: '',
  point_5_description: '',
  is_active: true,
};

const POINT_COLORS = [
  { color: 'text-red-400', bg: 'bg-red-500/10', dot: 'bg-red-400', sublabel: 'Lowest' },
  { color: 'text-orange-400', bg: 'bg-orange-500/10', dot: 'bg-orange-400', sublabel: '' },
  { color: 'text-yellow-400', bg: 'bg-yellow-500/10', dot: 'bg-yellow-400', sublabel: '' },
  { color: 'text-blue-400', bg: 'bg-blue-500/10', dot: 'bg-blue-400', sublabel: '' },
  { color: 'text-green-400', bg: 'bg-green-500/10', dot: 'bg-green-400', sublabel: 'Highest' },
];

const getPointLabels = (maxPoint) => {
  const max = maxPoint || 5;
  // Pick colors evenly spread so first is always red and last is always green
  const indices = max === 5 ? [0,1,2,3,4] : max === 4 ? [0,1,2,4] : [0,2,4];
  return Array.from({ length: max }, (_, i) => ({
    key: `point_${i + 1}_description`,
    label: `Point ${i + 1}`,
    sublabel: i === 0 ? 'Lowest' : i === max - 1 ? 'Highest' : '',
    ...POINT_COLORS[indices[i]],
  }));
};

export default function StudentPerformanceCategoryPage() {
  const [aspects, setAspects] = useState([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const data = await db.entities.StudentPerformanceCategory.list('order_index');
    setAspects(data);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  };

  const openEdit = (aspect) => {
    setEditing(aspect);
    setForm({ ...EMPTY_FORM, ...aspect });
    setOpen(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this aspect?')) return;
    await db.entities.StudentPerformanceCategory.delete(id);
    loadData();
    toast.success('Aspect deleted');
  };

  const handleSave = async () => {
    if (!form.aspect_title) {
      toast.error('Aspect Title is required');
      return;
    }
    setSaving(true);
    if (editing) {
      await db.entities.StudentPerformanceCategory.update(editing.id, form);
      toast.success('Aspect updated');
    } else {
      await db.entities.StudentPerformanceCategory.create(form);
      toast.success('Aspect created');
    }
    setSaving(false);
    setOpen(false);
    loadData();
  };

  const filtered = aspects.filter(a =>
    !search || a.aspect_title?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Student Performance Category</h2>
          <p className="text-muted-foreground text-sm mt-0.5">Manage student performance evaluation aspects</p>
        </div>
        <Button onClick={openCreate} className="bg-primary hover:bg-primary/90 gap-2">
          <Plus className="w-4 h-4" /> Add Aspect
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search aspect..."
          className="pl-9 bg-muted border-border"
        />
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filtered.map((aspect, idx) => {
          const maxPt = aspect.max_point || 5;
          const pointLabels = getPointLabels(maxPt);
          return (
            <div key={aspect.id} className="bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/30 transition-all duration-200 hover:shadow-lg hover:shadow-primary/5">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                    {idx + 1}
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground text-base leading-tight">{aspect.aspect_title}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex items-center gap-1">
                        {Array.from({ length: maxPt }).map((_, i) => (
                          <Star key={i} className="w-2.5 h-2.5 fill-primary text-primary" />
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">Scale 1–{maxPt}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={aspect.is_active ? 'default' : 'secondary'} className="text-xs">
                    {aspect.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(aspect)} className="w-8 h-8 p-0 hover:bg-primary/20 hover:text-primary">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(aspect.id)} className="w-8 h-8 p-0 hover:bg-destructive/20 hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Points List */}
              <div className="divide-y divide-border">
                {pointLabels.map(({ key, label, sublabel, color, bg, dot }, i) => (
                  <div key={key} className={`flex items-start gap-4 px-5 py-3 ${bg}`}>
                    <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white mt-0.5 ${dot}`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`text-xs font-semibold ${color}`}>{label}</span>
                      {sublabel && <span className="text-xs text-muted-foreground ml-1">({sublabel})</span>}
                      <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">
                        {aspect[key] || <span className="italic opacity-40">No description</span>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="bg-card border border-dashed border-border rounded-2xl px-5 py-14 text-center">
            <div className="w-12 h-12 rounded-full bg-muted mx-auto flex items-center justify-center mb-3">
              <Star className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground font-medium">No aspects found</p>
            <p className="text-muted-foreground text-sm mt-1">Click "Add Aspect" to get started.</p>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Aspect' : 'Add New Aspect'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-sm text-foreground/80">Aspect Title *</Label>
              <Input
                value={form.aspect_title || ''}
                onChange={e => setForm({ ...form, aspect_title: e.target.value })}
                className="bg-muted border-border"
                placeholder="e.g. Communication Skills"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm text-foreground/80">Max Point Scale *</Label>
              <Select
                value={String(form.max_point || 5)}
                onValueChange={v => setForm({ ...form, max_point: Number(v) })}
              >
                <SelectTrigger className="bg-muted border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 Points</SelectItem>
                  <SelectItem value="4">4 Points</SelectItem>
                  <SelectItem value="5">5 Points</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-sm text-foreground/80">Point Descriptions</Label>
              {getPointLabels(form.max_point).map(({ key, label, color }) => (
                <div key={key} className="space-y-1">
                  <p className={`text-xs font-medium ${color}`}>{label}</p>
                  <Textarea
                    value={form[key] || ''}
                    onChange={e => setForm({ ...form, [key]: e.target.value })}
                    className="bg-muted border-border min-h-[60px] text-sm"
                    placeholder={`Description for ${label.toLowerCase()}`}
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <Label className="text-sm text-foreground/80">Active</Label>
              <button
                type="button"
                onClick={() => setForm({ ...form, is_active: !form.is_active })}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.is_active ? 'bg-primary' : 'bg-muted'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${form.is_active ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)} className="border-border">Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90">
                {editing ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}