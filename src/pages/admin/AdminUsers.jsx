const db = globalThis.__B44_DB__ || { 
  auth: { isAuthenticated: async () => false, me: async () => null }, 
  entities: new Proxy({}, { 
    get: () => ({ filter: async () => [], get: async () => null, create: async () => ({}), update: async () => ({}), delete: async () => ({}) }) 
  }), 
  integrations: { Core: { UploadFile: async () => ({ file_url: '' }) } } 
};

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Search, Camera, Loader2, Filter, X, Eye, EyeOff, ArrowUp, ArrowDown, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import DeleteConfirmDialog from '@/components/ui/DeleteConfirmDialog';
import { supabase } from '@/lib/supabaseClient'; // Integrasi Supabase Storage untuk foto profil

const ROLES = ['Head of Retention', 'Head of Tutor', 'QC Team', 'Feedback Team', 'Team Leader', 'Tutor'];

async function hashPassword(password) {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const RBAC_STRUCTURE = [
  {
    category: 'General',
    permissions: [
      { key: 'dashboard', label: 'Dashboard' },
      { key: 'admin_crud', label: 'Admin Management' },
      { key: 'my_qc', label: 'My QC Results' },
    ]
  },
  {
    category: 'Student Feedback',
    permissions: [
      { key: 'student_feedback', label: 'View Records' },
      { key: 'student_feedback_delete', label: 'Delete Records', nested: true },
    ]
  },
  {
    category: 'Student Performance',
    permissions: [
      { key: 'student_performance', label: 'View Records' },
      { key: 'student_performance_delete', label: 'Delete Records', nested: true },
    ]
  },
  {
    category: 'QC Tutor',
    permissions: [
      { key: 'qc_records', label: 'QC Records' },
      { key: 'qc_records_delete', label: 'Delete Records', nested: true },
      { key: 'qc_monthly', label: 'Monthly Evaluation' },
      { key: 'qc_monthly_delete', label: 'Delete', nested: true },
    ]
  },
  {
    category: 'Weekly Student Feedback',
    permissions: [
      { key: 'weekly_feedback', label: 'View & Manage Assignments' },
    ]
  },
  {
    category: 'Task Management',
    permissions: [
      { key: 'task_management', label: 'Assign & Monitor Tasks' },
      { key: 'my_tasks', label: 'My Tasks (tutor dashboard)', nested: true },
    ]
  },
  {
    category: 'Categories',
    permissions: [
      { key: 'category_courses', label: 'Courses' },
      { key: 'category_qc', label: 'QC Aspects' },
      { key: 'category_module', label: 'Module' },
      { key: 'pdf_settings', label: 'PDF Settings' },
    ]
  },
];

const DEFAULT_RBAC = { 
  dashboard: false, admin_crud: false, qc_records: false, qc_monthly: false, 
  student_feedback: false, student_feedback_delete: false, student_performance: false, 
  student_performance_delete: false, qc_records_delete: false, qc_monthly_delete: false, 
  my_qc: false, category_courses: false, category_qc: false, category_module: false, 
  pdf_settings: false, weekly_feedback: false, weekly_feedback_delete: false, 
  task_management: false, my_tasks: false, my_weekly_feedback: false 
};

const EMPTY_FORM = {
  full_name: '', username: '', phone_number: '', telegram_account: '', email: '',
  role: '', taught_courses: [], link_bo: '', password: '', confirm_password: '',
  photo_url: '', rbac: { ...DEFAULT_RBAC }
};

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterActive, setFilterActive] = useState('all');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10); // 10 data per halaman
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [sortOrder, setSortOrder] = useState('asc');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [u, c] = await Promise.all([db.entities.CustomUser.list(), db.entities.CourseCategory.list()]);
    setUsers(u || []); 
    setCourses(c || []);
  };

  const openCreate = () => { 
    setEditing(null); 
    setForm(EMPTY_FORM); 
    setPhotoFile(null); 
    setPhotoPreview(''); 
    setError(''); 
    setOpen(true); 
  };

  const openEdit = (u) => {
    setEditing(u);
    const mergedRbac = { ...DEFAULT_RBAC, ...(u.rbac || {}) };
    delete mergedRbac.qc_tutor;
    setForm({ ...EMPTY_FORM, ...u, password: '', confirm_password: '', rbac: mergedRbac });
    setPhotoPreview(u.photo_url || '');
    setPhotoFile(null);
    setError('');
    setOpen(true);
  };

  const handleDelete = (id) => { setDeleteTarget(id); };

  const confirmDelete = async () => {
    await db.entities.CustomUser.delete(deleteTarget);
    setDeleteTarget(null);
    loadData();
    toast.success('Admin deleted', { description: 'The admin account has been removed.' });
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  // Upload foto langsung ke Supabase Storage
  const uploadPhotoToSupabase = async (file) => {
    try {
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
    } catch (err) {
      console.error('Error uploading photo:', err);
      // Fallback ke mock upload jika Supabase storage belum terhubung
      const { file_url } = await db.integrations.Core.UploadFile({ file });
      return file_url || '';
    }
  };

  const handleSave = async () => {
    setError('');
    if (!form.full_name || !form.username || !form.role) { 
      setError('Full Name, Username, and Role are required'); 
      return; 
    }
    if (!editing && !form.password) { 
      setError('Password is required'); 
      return; 
    }
    if (form.password && form.password !== form.confirm_password) { 
      setError('Passwords do not match'); 
      return; 
    }

    const existingUsers = await db.entities.CustomUser.list();
    const duplicate = existingUsers.find(u => u.username?.toLowerCase() === form.username.toLowerCase() && u.id !== editing?.id);
    if (duplicate) { 
      setError(`Username "@${form.username}" sudah digunakan oleh akun lain`); 
      setSaving(false); 
      return; 
    }

    setSaving(true);
    let photoUrl = form.photo_url || '';
    if (photoFile) {
      photoUrl = await uploadPhotoToSupabase(photoFile);
    }

    const cleanRbac = { ...DEFAULT_RBAC, ...form.rbac };
    delete cleanRbac.qc_tutor;

    const data = {
      full_name: form.full_name,
      username: form.username,
      phone_number: form.phone_number,
      telegram_account: form.telegram_account,
      email: form.email,
      role: form.role,
      taught_courses: ['Tutor', 'Team Leader'].includes(form.role) ? form.taught_courses : [],
      link_bo: form.link_bo,
      photo_url: photoUrl,
      rbac: cleanRbac,
      is_active: form.is_active !== false,
    };

    if (form.password) data.password_hash = `sha256:${await hashPassword(form.password)}`;

    if (editing) {
      await db.entities.CustomUser.update(editing.id, data);
      toast.success('Admin updated', { description: `${data.full_name}'s account has been updated.` });
    } else {
      await db.entities.CustomUser.create(data);
      toast.success('Admin created', { description: `${data.full_name}'s account has been created.` });
    }

    setSaving(false);
    setOpen(false);
    loadData();
  };

  const filtered = users
    .filter(u => {
      const matchSearch = u.full_name?.toLowerCase().includes(search.toLowerCase()) || 
                          u.email?.toLowerCase().includes(search.toLowerCase()) || 
                          u.username?.toLowerCase().includes(search.toLowerCase());
      const matchRole = filterRole === 'all' || u.role === filterRole;
      const matchActive = filterActive === 'all' || (filterActive === 'active' ? u.is_active !== false : u.is_active === false);
      return matchSearch && matchRole && matchActive;
    })
    .sort((a, b) => {
      const nameA = (a.full_name || '').toLowerCase();
      const nameB = (b.full_name || '').toLowerCase();
      return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    });

  const hasFilters = filterRole !== 'all' || filterActive !== 'all';
  
  // Pagination (10 item per halaman)
  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedData = filtered.slice(startIndex, endIndex);
  
  useEffect(() => { setCurrentPage(1); }, [search, filterRole, filterActive]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">User Management</h2>
          <p className="text-muted-foreground text-sm mt-0.5">Manage all user accounts and roles</p>
        </div>
        <Button onClick={openCreate} className="bg-primary hover:bg-primary/90 gap-2">
          <Plus className="w-4 h-4" /> Add User
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email, username..." className="pl-9 bg-muted border-border" />
        </div>
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-44 bg-muted border-border">
            <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="All Roles" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">All Roles</SelectItem>
            {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterActive} onValueChange={setFilterActive}>
          <SelectTrigger className="w-36 bg-muted border-border">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterRole('all'); setFilterActive('all'); }} className="text-muted-foreground gap-1.5">
            <X className="w-3.5 h-3.5" /> Clear Filters
          </Button>
        )}
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-5 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <button
                    onClick={() => setSortOrder(s => s === 'asc' ? 'desc' : 'asc')}
                    className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                  >
                    User
                    {sortOrder === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                  </button>
                </th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role</th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Link BO / Phone</th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-right px-5 py-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginatedData.map(u => (
                <tr key={u.id} className="hover:bg-secondary/50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      {u.photo_url ? (
                        <img src={u.photo_url} className="w-9 h-9 rounded-xl object-cover" alt="" />
                      ) : (
                        <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm">
                          {u.full_name?.charAt(0)}
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-foreground">{u.full_name}</div>
                        {u.username && <div className="text-xs text-muted-foreground font-medium">@{u.username}</div>}
                        {u.telegram_account && <div className="text-xs text-muted-foreground">TG: @{u.telegram_account}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <Badge className={
                      u.role === 'Tutor' ? 'bg-accent/20 text-accent border-accent/30' :
                      u.role === 'Team Leader' ? 'bg-chart-4/20 text-chart-4 border-chart-4/30' :
                      u.role === 'Head of Retention' ? 'bg-primary/20 text-primary border-primary/30' :
                      u.role === 'Head of Tutor' ? 'bg-chart-3/20 text-chart-3 border-chart-3/30' :
                      'bg-secondary text-secondary-foreground border-border'
                    } variant="outline">{u.role}</Badge>
                  </td>
                  <td className="px-5 py-4 text-sm text-muted-foreground">{u.email || '—'}</td>
                  <td className="px-5 py-4 text-sm text-muted-foreground">
                    {u.link_bo ? (
                      <a href={u.link_bo} target="_blank" rel="noreferrer" className="text-accent hover:underline flex items-center gap-1">
                        <ExternalLink className="w-3 h-3" /> Link BO
                      </a>
                    ) : (
                      <span>{u.phone_number || '—'}</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.is_active !== false ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                      {u.is_active !== false ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(u)} className="w-8 h-8 p-0 hover:bg-primary/20 hover:text-primary">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(u.id)} className="w-8 h-8 p-0 hover:bg-destructive/20 hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {paginatedData.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">No users found</td></tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Controls per 10 Data */}
        {totalPages > 1 && (
          <div className="border-t border-border px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground">
              Showing {startIndex + 1} to {Math.min(endIndex, filtered.length)} of {filtered.length} entries
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="border-border text-xs"
              >
                First
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="border-border text-xs"
              >
                Previous
              </Button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                  .map((pageNum, idx, arr) => {
                    const prevPage = arr[idx - 1];
                    const showEllipsis = prevPage && pageNum - prevPage > 1;

                    return (
                      <React.Fragment key={pageNum}>
                        {showEllipsis && <span className="px-1 text-xs text-muted-foreground">...</span>}
                        <Button
                          variant={currentPage === pageNum ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setCurrentPage(pageNum)}
                          className={`text-xs w-8 h-8 p-0 ${currentPage === pageNum ? 'bg-primary' : 'border-border'}`}
                        >
                          {pageNum}
                        </Button>
                      </React.Fragment>
                    );
                  })}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="border-border text-xs"
              >
                Next
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="border-border text-xs"
              >
                Last
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit User' : 'Add New User'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div className="flex items-center gap-4">
              <div className="relative">
                {photoPreview ? (
                  <img src={photoPreview} className="w-16 h-16 rounded-xl object-cover" alt="" />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground">
                    <Camera className="w-6 h-6" />
                  </div>
                )}
                <label className="absolute -bottom-1.5 -right-1.5 w-6 h-6 bg-primary rounded-full flex items-center justify-center cursor-pointer">
                  <Camera className="w-3 h-3 text-white" />
                  <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                </label>
              </div>
              <div className="text-sm text-muted-foreground">Click the camera icon to upload or change profile photo</div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: 'Full Name *', key: 'full_name' },
                { label: 'Username *', key: 'username' },
                { label: 'Phone Number', key: 'phone_number' },
                { label: 'Telegram Account', key: 'telegram_account' },
                { label: 'Email', key: 'email', type: 'email' },
                { label: 'Link BO', key: 'link_bo' },
              ].map(f => (
                <div key={f.key} className="space-y-1.5">
                  <Label className="text-sm text-foreground/80">{f.label}</Label>
                  <Input
                    type={f.type || 'text'}
                    value={form[f.key] || ''}
                    onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                    className="bg-muted border-border"
                  />
                </div>
              ))}

              <div className="space-y-1.5">
                <Label className="text-sm text-foreground/80">Role *</Label>
                <Select value={form.role} onValueChange={v => setForm({ ...form, role: v })}>
                  <SelectTrigger className="bg-muted border-border"><SelectValue placeholder="Select role" /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm text-foreground/80">Status</Label>
                <Select
                  value={form.is_active === false ? 'inactive' : 'active'}
                  onValueChange={v => setForm({ ...form, is_active: v === 'active' })}
                >
                  <SelectTrigger className="bg-muted border-border"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {['Tutor', 'Team Leader'].includes(form.role) && (
              <div className="space-y-1.5">
                <Label className="text-sm text-foreground/80">Taught Courses</Label>
                <div className="grid grid-cols-2 gap-2">
                  {courses.map(c => (
                    <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(form.taught_courses || []).includes(c.name)}
                        onChange={e => {
                          const cur = form.taught_courses || [];
                          setForm({ ...form, taught_courses: e.target.checked ? [...cur, c.name] : cur.filter(x => x !== c.name) });
                        }}
                        className="accent-primary"
                      />
                      <span className="text-sm text-foreground/80">{c.name}</span>
                    </label>
                  ))}
                  {courses.length === 0 && <span className="text-sm text-muted-foreground col-span-2">No courses available. Add courses in Categories first.</span>}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm text-foreground/80">{editing ? 'New Password (leave blank to keep)' : 'Password *'}</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
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
              <div className="space-y-1.5">
                <Label className="text-sm text-foreground/80">Confirm Password</Label>
                <div className="relative">
                  <Input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={form.confirm_password}
                    onChange={e => setForm({ ...form, confirm_password: e.target.value })}
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

            {/* RBAC */}
            <div className="bg-secondary/50 rounded-xl p-4 space-y-4">
              <Label className="font-semibold text-foreground">Access Permissions (RBAC)</Label>
              <div className="space-y-4">
                {RBAC_STRUCTURE.map((cat, catIdx) => (
                  <div key={catIdx} className="space-y-2">
                    <div className="text-sm font-semibold text-primary border-b border-border pb-1">{cat.category}</div>
                    <div className="space-y-2 pl-2">
                      {cat.permissions.map(r => (
                        <label key={r.key} className={`flex items-center gap-2 cursor-pointer ${r.nested ? 'ml-4' : ''}`}>
                          <input
                            type="checkbox"
                            checked={form.rbac?.[r.key] === true}
                            onChange={e => setForm({ ...form, rbac: { ...form.rbac, [r.key]: e.target.checked } })}
                            className="accent-primary w-4 h-4"
                          />
                          <span className="text-sm text-foreground/80">{r.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {error && <div className="bg-destructive/20 text-destructive px-4 py-2 rounded-lg text-sm">{error}</div>}

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

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}
        onConfirm={confirmDelete}
        title="Delete Admin Account"
        description="Are you sure you want to delete this admin account? This action cannot be undone."
      />
    </div>
  );
}