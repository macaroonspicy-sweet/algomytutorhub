const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';

export default function CategoryPage({ title, subtitle, entityName, color }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [entityName]);

  const load = async () => {
    const data = await db.entities[entityName].list();
    setItems(data);
  };

  const openCreate = () => { setEditing(null); setName(''); setDescription(''); setOpen(true); };
  const openEdit = (item) => { setEditing(item); setName(item.name || ''); setDescription(item.description || ''); setOpen(true); };

  const handleDelete = async (id) => {
    if (!confirm('Delete this item?')) return;
    await db.entities[entityName].delete(id);
    load();
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const data = { name: name.trim(), description: description.trim() };
    if (editing) await db.entities[entityName].update(editing.id, data);
    else await db.entities[entityName].create(data);
    setSaving(false);
    setOpen(false);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {color && <div className={`w-3 h-8 rounded-full ${color}`} />}
          <div>
            <h2 className="text-2xl font-bold text-foreground">{title}</h2>
            {subtitle && <p className="text-muted-foreground text-sm mt-0.5">{subtitle}</p>}
          </div>
        </div>
        <Button onClick={openCreate} className="bg-primary hover:bg-primary/90 gap-2">
          <Plus className="w-4 h-4" /> Add Item
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {items.map(item => (
          <div key={item.id} className="bg-card border border-border rounded-2xl p-4 flex items-start justify-between group hover:border-primary/30 transition-all">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-foreground">{item.name}</div>
              {item.description && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</div>}
            </div>
            <div className="flex gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-all">
              <Button size="sm" variant="ghost" onClick={() => openEdit(item)} className="w-7 h-7 p-0 hover:bg-primary/20 hover:text-primary">
                <Pencil className="w-3 h-3" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => handleDelete(item.id)} className="w-7 h-7 p-0 hover:bg-destructive/20 hover:text-destructive">
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="col-span-4 bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
            No items yet. Click "Add Item" to get started.
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${title} Item` : `Add ${title} Item`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} className="bg-muted border-border" placeholder={`Enter ${title.toLowerCase()} name...`} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} className="bg-muted border-border" placeholder="Optional description..." />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setOpen(false)} className="border-border">Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90">
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