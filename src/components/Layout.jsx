import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { useAppAuth } from '@/lib/AppAuthContext';
import {
  LayoutDashboard, Users, MessageSquare, BookOpen,
  CheckSquare, ChevronDown, ChevronRight,
  LogOut, User, Menu, GraduationCap, ClipboardList, CalendarCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import NotificationBell from '@/components/NotificationBell';

const navItems = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/', rbac: 'dashboard' },
  { key: 'admin', label: 'User List', icon: Users, path: '/admin/users', rbac: 'admin_crud' },
  { key: 'student-feedback', label: 'Student Feedback', icon: MessageSquare, path: '/student-feedback', rbac: 'student_feedback' },
  { key: 'weekly-feedback', label: 'Weekly Feedback', icon: CalendarCheck, path: '/weekly-feedback', rbac: 'weekly_feedback' },
  { key: 'tasks', label: 'Task Management', icon: ClipboardList, path: '/tasks', rbac: 'task_management' },
  {
    key: 'qc', label: 'QC Tutor', icon: CheckSquare, rbac: ['qc_records', 'qc_monthly', 'qc_submissions'],
    children: [
      { label: 'QC Records', path: '/admin/qc-tutor', rbac: 'qc_records' },
      { label: 'Monthly Evaluation', path: '/admin/qc-monthly', rbac: 'qc_monthly' },
      { label: 'QC Submissions', path: '/qc/submissions', rbac: 'qc_submissions' },
    ]
  },
  {
    key: 'categories', label: 'Categories', icon: BookOpen,
    rbac: ['category_courses', 'category_qc', 'category_module', 'pdf_settings'],
    children: [
      { label: 'Courses', path: '/categories/courses', rbac: 'category_courses' },
      { label: 'QC Aspects', path: '/categories/qc-aspects', rbac: 'category_qc' },
      { label: 'Module', path: '/categories/module', rbac: 'category_module' },
      { label: 'Student Performance', path: '/categories/student-performance', rbac: 'category_module' },
      { label: 'PDF Settings', path: '/categories/pdf-settings', rbac: 'pdf_settings' },
    ]
  },
];

function NavItem({ item, collapsed, openKey, onToggle }) {
  const location = useLocation();
  const { hasPermission } = useAppAuth();

  if (item.children) {
    const visibleChildren = item.children.filter(c => !c.rbac || hasPermission(c.rbac));
    if (visibleChildren.length === 0) return null;

    const isAnyActive = visibleChildren.some(c => location.pathname === c.path);
    // open if explicitly toggled OR if any child is currently active
    const isOpen = openKey === item.key || isAnyActive;
    return (
      <div>
        <button
          onClick={() => onToggle(item.key)}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
            isAnyActive
              ? 'bg-primary/20 text-primary'
              : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground'
          )}
        >
          <item.icon className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
          {!collapsed && (isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />)}
        </button>
        {isOpen && !collapsed && (
          <div className="ml-7 mt-1 space-y-1">
            {visibleChildren.map(child => (
              <Link
                key={child.path}
                to={child.path}
                className={cn(
                  'block px-3 py-2 rounded-lg text-sm transition-all duration-200',
                  location.pathname === child.path
                    ? 'bg-primary/20 text-primary font-medium'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground'
                )}
              >
                {child.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!hasPermission(item.rbac)) return null;

  const isActive = location.pathname === item.path;
  return (
    <Link
      to={item.path}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
        isActive
          ? 'bg-primary/20 text-primary glow-purple'
          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground'
      )}
    >
      <item.icon className="w-4 h-4 flex-shrink-0" />
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );
}

export default function Layout() {
  const { currentUser, logout, hasPermission } = useAppAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const [openNavKey, setOpenNavKey] = useState(null);
  const handleNavToggle = (key) => setOpenNavKey(prev => prev === key ? null : key);

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
        <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
          <GraduationCap className="w-5 h-5 text-primary" />
        </div>
        {!collapsed && (
          <div>
            <div className="font-bold text-foreground text-sm">Algonova Malaysia</div>
            <div className="text-xs text-muted-foreground">Management System</div>
          </div>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(item => (
          <NavItem key={item.key} item={item} collapsed={collapsed} openKey={openNavKey} onToggle={handleNavToggle} />
        ))}
        {hasPermission('my_qc') && (
          <Link
            to="/my-qc"
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
              location.pathname === '/my-qc'
                ? 'bg-primary/20 text-primary glow-purple'
                : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground'
            )}
          >
            <ClipboardList className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>My QC Results</span>}
          </Link>
        )}
      </nav>

      <div className="px-3 pb-4 space-y-1 border-t border-sidebar-border pt-4">
        <Link
          to="/profile"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground transition-all"
        >
          <User className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>My Profile</span>}
        </Link>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-all"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>

      {!collapsed && currentUser && (
        <div className="px-4 pb-4">
          <div className="bg-secondary rounded-xl p-3 flex items-center gap-3">
            {currentUser.photo_url ? (
              <img src={currentUser.photo_url} className="w-8 h-8 rounded-full object-cover" alt="" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary/30 flex items-center justify-center text-primary font-semibold text-sm">
                {currentUser.full_name?.charAt(0) || 'U'}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground truncate">{currentUser.full_name}</div>
              <div className="text-xs text-muted-foreground truncate">{currentUser.role}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className={cn(
        'hidden md:flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300 flex-shrink-0',
        collapsed ? 'w-16' : 'w-64'
      )}>
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-sidebar border-r border-sidebar-border">
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="bg-card border-b border-border px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setCollapsed(c => !c)}
            className="hidden md:flex items-center justify-center w-8 h-8 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-all"
          >
            <Menu className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg hover:bg-secondary"
          >
            <Menu className="w-4 h-4" />
          </button>
          <div className="ml-auto">
            <NotificationBell />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}