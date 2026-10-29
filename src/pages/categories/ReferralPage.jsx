const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useState } from 'react';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

export default function ReferralPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingReferral, setEditingReferral] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const queryClient = useQueryClient();

  const { data: referrals = [], isLoading } = useQuery({
    queryKey: ['referrals'],
    queryFn: () => db.entities.Referral.list('-created_date'),
  });

  const createMutation = useMutation({
    mutationFn: (data) => db.entities.Referral.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
      setIsDialogOpen(false);
      toast.success('Referral created successfully');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => db.entities.Referral.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
      setIsDialogOpen(false);
      setEditingReferral(null);
      toast.success('Referral updated successfully');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.entities.Referral.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referrals'] });
      toast.success('Referral deleted successfully');
    },
  });

  const handleSubmit = (formData) => {
    if (editingReferral) {
      updateMutation.mutate({ id: editingReferral.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const filteredReferrals = referrals.filter((ref) =>
    ref.student_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ref.referrer_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Referral Management</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Track student referrals with rich text notes</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingReferral(null)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Referral
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingReferral ? 'Edit Referral' : 'Add New Referral'}</DialogTitle>
            </DialogHeader>
            <ReferralForm
              referral={editingReferral}
              onSubmit={handleSubmit}
              onCancel={() => {
                setIsDialogOpen(false);
                setEditingReferral(null);
              }}
              isLoading={createMutation.isPending || updateMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        <Input
          placeholder="Search by student name or referrer name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading referrals...</div>
      ) : (
        <div className="grid gap-4">
          {filteredReferrals.map((referral) => (
            <div
              key={referral.id}
              className="bg-card rounded-lg p-4 border border-border"
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{referral.student_name}</h3>
                  <p className="text-sm text-muted-foreground">Referred by: {referral.referrer_name}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setEditingReferral(referral);
                      setIsDialogOpen(true);
                    }}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this referral?')) {
                        deleteMutation.mutate(referral.id);
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {referral.notes && (
                <div className="bg-muted/50 rounded-md p-3 prose prose-sm max-w-none">
                  <div dangerouslySetInnerHTML={{ __html: referral.notes }} />
                </div>
              )}
            </div>
          ))}
          {filteredReferrals.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">No referrals found</div>
          )}
        </div>
      )}
    </div>
  );
}

function ReferralForm({ referral, onSubmit, onCancel, isLoading }) {
  const [formData, setFormData] = useState({
    student_name: referral?.student_name || '',
    referrer_name: referral?.referrer_name || '',
    notes: referral?.notes || '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const modules = {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      ['link'],
      ['clean']
    ],
  };

  const formats = [
    'header',
    'bold', 'italic', 'underline', 'strike',
    'list', 'bullet',
    'link'
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Student Name *</label>
          <Input
            value={formData.student_name}
            onChange={(e) => setFormData({ ...formData, student_name: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Referrer Name *</label>
          <Input
            value={formData.referrer_name}
            onChange={(e) => setFormData({ ...formData, referrer_name: e.target.value })}
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Notes (supports formatting and links)
        </label>
        <ReactQuill
          theme="snow"
          value={formData.notes}
          onChange={(value) => setFormData({ ...formData, notes: value })}
          modules={modules}
          formats={formats}
          className="bg-transparent"
          placeholder="Write notes here... You can add links, bold text, lists, etc."
        />
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving...' : referral ? 'Update' : 'Create'}
        </Button>
      </div>
    </form>
  );
}