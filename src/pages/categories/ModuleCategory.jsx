const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Search, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const MONTHS = Array.from({ length: 10 }, (_, i) => i + 1);

const EMPTY_FORM = {
  course_category_id: '',
  course_name: '',
  month: '',
  current_lesson: '',
  lesson_number: '',
  module_topic: '',
  key_result: '',
  new_skills: '',
};

export default function ModuleCategoryPage() {
  const [modules, setModules] = useState([]);
  const [courses, setCourses] = useState([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [mods, crs] = await Promise.all([
      db.entities.ModuleCategory.list('order_index'),
      db.entities.CourseCategory.list(),
    ]);
    // Sort: items with order_index first, then by created_date
    const sorted = [...mods].sort((a, b) => {
      if (a.order_index != null && b.order_index != null) return a.order_index - b.order_index;
      if (a.order_index != null) return -1;
      if (b.order_index != null) return 1;
      return 0;
    });
    setModules(sorted);
    setCourses(crs);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  };

  const openEdit = (mod) => {
    setEditing(mod);
    setForm({ ...EMPTY_FORM, ...mod });
    setOpen(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this module?')) return;
    await db.entities.ModuleCategory.delete(id);
    loadData();
    toast.success('Module deleted');
  };

  const handleSave = async () => {
    if (!form.course_category_id) {
      toast.error('Course is required');
      return;
    }
    setSaving(true);
    const selectedCourse = courses.find(c => c.id === form.course_category_id);
    const data = {
      ...form,
      course_name: selectedCourse?.name || '',
      month: form.month ? Number(form.month) : null,
      current_lesson: form.current_lesson ? Number(form.current_lesson) : null,
      lesson_number: form.lesson_number ? Number(form.lesson_number) : null,
    };
    if (editing) {
      await db.entities.ModuleCategory.update(editing.id, data);
      toast.success('Module updated');
    } else {
      await db.entities.ModuleCategory.create(data);
      toast.success('Module created');
    }
    setSaving(false);
    setOpen(false);
    loadData();
  };

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    const items = Array.from(filtered);
    const [reordered] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reordered);

    // Rebuild full modules list
    const filteredIds = new Set(filtered.map(m => m.id));
    const nonFiltered = modules.filter(m => !filteredIds.has(m.id));
    setModules([...items, ...nonFiltered]);

    // Save new order_index to database
    await Promise.all(
      items.map((mod, idx) =>
        db.entities.ModuleCategory.update(mod.id, { order_index: idx })
      )
    );
  };

  const filtered = modules.filter(m =>
    !search ||
    m.module_topic?.toLowerCase().includes(search.toLowerCase()) ||
    m.course_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Module Category</h2>
          <p className="text-muted-foreground text-sm mt-0.5">Manage course modules and lessons</p>
        </div>
        <Button onClick={openCreate} className="bg-primary hover:bg-primary/90 gap-2">
          <Plus className="w-4 h-4" /> Add Module
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by topic or course..."
          className="pl-9 bg-muted border-border"
        />
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-4 w-8"></th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Course</th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Month</th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lesson #</th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Current Lesson</th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Module Topic</th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Key Result</th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">New Skills</th>
                <th className="text-right px-5 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="modules-table">
                {(provided) => (
                  <tbody
                    className="divide-y divide-border"
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                  >
                    {filtered.map((mod, index) => (
                      <Draggable key={mod.id} draggableId={mod.id} index={index}>
                        {(provided, snapshot) => (
                          <tr
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`transition-colors ${snapshot.isDragging ? 'bg-secondary opacity-90' : 'hover:bg-secondary/50'}`}
                          >
                            <td className="px-3 py-4">
                              <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors">
                                <GripVertical className="w-4 h-4" />
                              </div>
                            </td>
                            <td className="px-5 py-4 text-sm font-medium text-foreground">{mod.course_name || '—'}</td>
                            <td className="px-5 py-4 text-sm text-muted-foreground">{mod.month ?? '—'}</td>
                            <td className="px-5 py-4 text-sm text-muted-foreground">{mod.lesson_number ?? '—'}</td>
                            <td className="px-5 py-4 text-sm text-muted-foreground">{mod.current_lesson ?? '—'}</td>
                            <td className="px-5 py-4 text-sm text-foreground max-w-[200px] truncate">{mod.module_topic}</td>
                            <td className="px-5 py-4 text-sm text-muted-foreground max-w-[180px] truncate">{mod.key_result || '—'}</td>
                            <td className="px-5 py-4 text-sm text-muted-foreground max-w-[180px] truncate">{mod.new_skills || '—'}</td>
                            <td className="px-5 py-4">
                              <div className="flex items-center justify-end gap-2">
                                <Button size="sm" variant="ghost" onClick={() => openEdit(mod)} className="w-8 h-8 p-0 hover:bg-primary/20 hover:text-primary">
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => handleDelete(mod.id)} className="w-8 h-8 p-0 hover:bg-destructive/20 hover:text-destructive">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-5 py-10 text-center text-muted-foreground">
                          No modules found. Click "Add Module" to get started.
                        </td>
                      </tr>
                    )}
                  </tbody>
                )}
              </Droppable>
            </DragDropContext>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Module' : 'Add New Module'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-sm text-foreground/80">Course Name *</Label>
              <Select
                value={form.course_category_id}
                onValueChange={v => setForm({ ...form, course_category_id: v })}
              >
                <SelectTrigger className="bg-muted border-border">
                  <SelectValue placeholder="Select a course" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {courses.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                  {courses.length === 0 && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No courses available</div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm text-foreground/80">Month</Label>
                <Select
                  value={form.month ? String(form.month) : ''}
                  onValueChange={v => setForm({ ...form, month: v })}
                >
                  <SelectTrigger className="bg-muted border-border">
                    <SelectValue placeholder="Select month" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {MONTHS.map(n => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-foreground/80">Lesson Number</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={form.lesson_number || ''}
                  onChange={e => {
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    setForm({ ...form, lesson_number: val });
                  }}
                  className="bg-muted border-border"
                  placeholder="e.g. 1"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-foreground/80">Current Lesson</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={form.current_lesson || ''}
                  onChange={e => {
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    setForm({ ...form, current_lesson: val });
                  }}
                  className="bg-muted border-border"
                  placeholder="e.g. 1"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm text-foreground/80">Module Topic</Label>
              <Input
                value={form.module_topic || ''}
                onChange={e => setForm({ ...form, module_topic: e.target.value })}
                className="bg-muted border-border"
                placeholder="Enter module topic"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm text-foreground/80">Key Result</Label>
              <Textarea
                value={form.key_result || ''}
                onChange={e => setForm({ ...form, key_result: e.target.value })}
                className="bg-muted border-border min-h-[80px]"
                placeholder="Enter key result"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm text-foreground/80">New Skills</Label>
              <Textarea
                value={form.new_skills || ''}
                onChange={e => setForm({ ...form, new_skills: e.target.value })}
                className="bg-muted border-border min-h-[80px]"
                placeholder="Enter new skills"
              />
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