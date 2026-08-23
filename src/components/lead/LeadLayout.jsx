// src/components/lead/LeadLayout.jsx
import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../shared/Sidebar';
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Bell,
  User,
  Sparkles,
  TrendingUp,
  Award
} from 'lucide-react';

const navItems = [
  {
    path: '/lead',
    label: 'Dashboard',
    icon: LayoutDashboard,
    exact: true,
    badge: null
  },
  {
    path: '/lead/projects',
    label: 'My Projects',
    icon: FolderKanban,
    badge: null
  },
  {
    path: '/lead/team-members',
    label: 'Team Members',
    icon: Users,
    badge: null
  },
  {
    path: '/lead/notifications',
    label: 'Notifications',
    icon: Bell,
    badge: '3'
  },
  {
    path: '/lead/profile',
    label: 'Profile',
    icon: User,
    badge: null
  }
];

export default function LeadLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      setSidebarOpen(!mobile);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [location.pathname, isMobile]);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="lead-layout">
      <Sidebar
        items={navItems}
        role="lead"
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onToggle={toggleSidebar}
      />
      <main
        className="lead-main"
        style={{
          marginLeft: isMobile ? 0 : (sidebarOpen ? '260px' : '70px'),
        }}
      >
        <Outlet context={{ onMenuClick: toggleSidebar }} />
      </main>

      <style>{`
        .lead-layout {
          display: flex;
          min-height: 100vh;
          background: var(--bg-primary);
        }

        .lead-main {
          flex: 1;
          transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          min-height: 100vh;
          width: 100%;
          overflow-x: hidden;
          background: var(--bg-primary);
          position: relative;
        }

        /* Scrollbar styling — uses theme-aware tokens
           (--border-strong was never defined in the theme, so the
           hover state silently did nothing) */
        .lead-main::-webkit-scrollbar {
          width: 6px;
        }

        .lead-main::-webkit-scrollbar-track {
          background: transparent;
        }

        .lead-main::-webkit-scrollbar-thumb {
          background: var(--border-default);
          border-radius: 10px;
        }

        .lead-main::-webkit-scrollbar-thumb:hover {
          background: var(--border-active);
        }

        @media (max-width: 768px) {
          .lead-main {
            margin-left: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}