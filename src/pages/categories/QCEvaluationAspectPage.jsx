import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';

const EMPTY_FORM = {
  aspect_name: '',
  weight_percentage: 0,
  order_index: 0,
  score_1_description: '',
  score_2_description: '',
  score_3_description: '',
  score_4_description: '',
  score_5_description: ''
};

export default function QCEvaluationAspectPage() {
  const [aspects, setAspects] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  // Fetch data dari Supabase diurutkan berdasarkan order_index ASC
  const loadData = async () => {
    setLoadingData(true);
    try {
      const { data, error } = await supabase
        .from('QCEvaluationAspect')
        .select('*')
        .order('order_index', { ascending: true });

      if (error) throw error;

      // Fallback sorting di client-side untuk memastikan urutan 1, 2, 3...
      const sortedData = (data || []).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
      setAspects(sortedData);
    } catch (err) {
      console.error('Error loading QC aspects:', err.message);
    } finally {
      setLoadingData(false);
    }
  };

  const totalWeight = aspects.reduce((sum, a) => sum + (Number(a.weight_percentage) || 0), 0);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, order_index: aspects.length + 1 });
    setOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({ ...EMPTY_FORM, ...item });
    setOpen(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this evaluation aspect?')) return;
    try {
      const { error } = await supabase
        .from('QCEvaluationAspect')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadData();
    } catch (err) {
      console.error('Error deleting aspect:', err.message);
    }
  };

  const handleSave = async () => {
    if (!form.aspect_name.trim()) return;
    setSaving(true);
    
    const payload = {
      aspect_name: form.aspect_name.trim(),
      weight_percentage: Number(form.weight_percentage) || 0,
      order_index: Number(form.order_index) || 0,
      score_1_description: form.score_1_description || '',
      score_2_description: form.score_2_description || '',
      score_3_description: form.score_3_description || '',
      score_4_description: form.score_4_description || '',
      score_5_description: form.score_5_description || '',
    };

    try {
      if (editing) {
        const { error } = await supabase
          .from('QCEvaluationAspect')
          .update(payload)
          .eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('QCEvaluationAspect')
          .insert([payload]);
        if (error) throw error;
      }

      setOpen(false);
      loadData();
    } catch (err) {
      console.error('Error saving aspect:', err.message);
    } finally {
      setSaving(false);
    }
  };

  const SCORE_COLORS = ['', 'text-red-400', 'text-orange-400', 'text-yellow-400', 'text-blue-400', 'text-green-400'];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-3 h-8 rounded-full bg-primary" />
          <div>
            <h2 className="text-2xl font-bold text-foreground">QC Evaluation Aspects</h2>
            <p className="text-muted-foreground text-sm mt-0.5">Manage evaluation criteria, weights, and score descriptions</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Perbaikan Syntax Error pada Math.abs(totalWeight - 100) */}
          <div className={`text-sm px-3 py-1.5 rounded-lg font-medium ${Math.abs(totalWeight - 100) < 0.5 ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
            Total Weight: {totalWeight.toFixed(1)}%
          </div>
          <Button onClick={openCreate} className="bg-primary hover:bg-primary/90 gap-2">
            <Plus className="w-4 h-4" /> Add Aspect
          </Button>
        </div>
      </div>

      {loadingData ? (
        <div className="flex justify-center items-center py-12 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Loading aspects...
        </div>
      ) : (
        <div className="space-y-2">
          {aspects.map((asp) => (
            <div key={asp.id || asp.aspect_name} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between group hover:border-primary/30 transition-all">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                  #{asp.order_index}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-foreground">{asp.aspect_name}</div>
                  <div className="flex gap-3 mt-0.5">
                    {[1, 2, 3, 4, 5].map(s => (
                      <span key={s} className={`text-xs ${asp[`score_${s}_description`] ? SCORE_COLORS[s] : 'text-muted-foreground/30'}`}>
                        S{s} {asp[`score_${s}_description`] ? '✓' : '—'}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right shrink-0 mr-4">
                  <div className="text-primary font-bold text-lg">{asp.weight_percentage}%</div>
                  <div className="text-xs text-muted-foreground">weight</div>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                <Button size="sm" variant="ghost" onClick={() => openEdit(asp)} className="w-7 h-7 p-0 hover:bg-primary/20 hover:text-primary">
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleDelete(asp.id)} className="w-7 h-7 p-0 hover:bg-destructive/20 hover:text-destructive">
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}

          {aspects.length === 0 && (
            <div className="bg-card border border-border rounded-xl p-10 text-center text-muted-foreground">
              No evaluation aspects yet. Click "Add Aspect" to get started.
            </div>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Evaluation Aspect' : 'Add Evaluation Aspect'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Aspect Name *</Label>
                <Input 
                  value={form.aspect_name} 
                  onChange={e => setForm(f => ({ ...f, aspect_name: e.target.value }))} 
                  className="bg-muted border-border" 
                  placeholder="e.g., Warming Up / Ice Breaking" 
                />
              </div>
              <div className="space-y-1.5">
                <Label>Weight (%)</Label>
                <Input 
                  type="number" 
                  value={form.weight_percentage} 
                  onChange={e => setForm(f => ({ ...f, weight_percentage: e.target.value }))} 
                  className="bg-muted border-border" 
                  placeholder="e.g., 4" 
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Order Index</Label>
              <Input 
                type="number" 
                value={form.order_index} 
                onChange={e => setForm(f => ({ ...f, order_index: e.target.value }))} 
                className="bg-muted border-border" 
                placeholder="e.g., 1" 
              />
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-semibold text-foreground">Score Descriptions (read-only when scoring)</Label>
              {[1, 2, 3, 4, 5].map(score => (
                <div key={score} className="space-y-1">
                  <Label className={`text-xs font-medium ${SCORE_COLORS[score]}`}>
                    Score {score} {score === 1 ? '(Lowest)' : score === 5 ? '(Highest)' : ''}
                  </Label>
                  <textarea
                    value={form[`score_${score}_description`] || ''}
                    onChange={e => setForm(f => ({ ...f, [`score_${score}_description`]: e.target.value }))}
                    className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground resize-none h-16 focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder={`Description for score ${score}...`}
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3 pt-2">
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