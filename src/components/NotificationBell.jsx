const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React, { useState, useEffect, useRef } from 'react';

import { useAppAuth } from '@/lib/AppAuthContext';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotificationBell() {
  const { currentUser } = useAppAuth();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const loadNotifications = async () => {
    if (!currentUser?.id) return;
    const notifs = await db.entities.Notification.filter({ recipient_id: currentUser.id }, '-created_date', 30);
    setNotifications(notifs);
  };

  useEffect(() => {
    loadNotifications();
    // Poll every 30 seconds
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [currentUser?.id]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!currentUser?.id) return;
    const unsub = db.entities.Notification.subscribe((event) => {
      if (event.data?.recipient_id === currentUser.id) {
        loadNotifications();
      }
    });
    return unsub;
  }, [currentUser?.id]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.is_read);
    await Promise.all(unread.map(n => db.entities.Notification.update(n.id, { is_read: true })));
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const markRead = async (notif) => {
    if (notif.is_read) return;
    await db.entities.Notification.update(notif.id, { is_read: true });
    setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  };

  const TYPE_ICON = {
    qc_created: '📊',
    feedback_created: '📝',
    task_assigned: '📋',
    task_updated: '✏️',
    task_status: '✅',
    weekly_feedback: '🎓',
  };

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(o => !o)}
        className="relative w-9 h-9 text-muted-foreground hover:text-foreground"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-11 w-80 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="font-semibold text-sm text-foreground">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-border">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No notifications yet</div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => markRead(n)}
                  className={`px-4 py-3 cursor-pointer hover:bg-secondary/50 transition-colors ${!n.is_read ? 'bg-primary/5 border-l-2 border-l-primary' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-base mt-0.5">{TYPE_ICON[n.type] || '🔔'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-foreground leading-tight">{n.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{n.message}</div>
                      <div className="text-[10px] text-muted-foreground/60 mt-1">{formatTime(n.created_date)}</div>
                    </div>
                    {!n.is_read && <div className="w-2 h-2 bg-primary rounded-full mt-1 flex-shrink-0" />}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}