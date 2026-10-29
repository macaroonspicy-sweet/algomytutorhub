import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppAuth } from '@/lib/AppAuthContext';

export default function UnauthorizedPage() {
  const navigate = useNavigate();
  const { logout } = useAppAuth();

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <div className="text-center space-y-4 p-8">
        <div className="w-16 h-16 rounded-2xl bg-destructive/20 flex items-center justify-center mx-auto">
          <ShieldOff className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Access Denied</h2>
        <p className="text-muted-foreground text-sm max-w-xs">
          You don't have permission to access this page. Contact your administrator.
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <Button variant="outline" onClick={() => navigate(-1)} className="border-border">Go Back</Button>
          <Button variant="destructive" onClick={() => { logout(); navigate('/login'); }}>Logout</Button>
        </div>
      </div>
    </div>
  );
}