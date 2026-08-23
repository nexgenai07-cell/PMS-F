// src/components/supervisor/SupervisorLayout.jsx
import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../shared/Sidebar';
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Bell,
  User,
  UserCog
} from 'lucide-react';

const navItems = [
  {
    path: '/supervisor',
    label: 'Dashboard',
    icon: LayoutDashboard,
    exact: true,
    badge: null
  },
  {
    path: '/supervisor/projects',
    label: 'All Projects',
    icon: FolderKanban,
    badge: null
  },
  {
    path: '/supervisor/teams',
    label: 'Teams & Members',
    icon: Users,
    badge: null
  },
  {
    path: '/supervisor/leads',
    label: 'Leads',
    icon: UserCog,
    badge: null
  },
  {
    path: '/supervisor/notifications',
    label: 'Notifications',
    icon: Bell,
    badge: null
  },
  {
    path: '/supervisor/profile',
    label: 'Profile',
    icon: User,
    badge: null
  }
];

export default function SupervisorLayout() {
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
    <div className="supervisor-layout">
      <Sidebar
        items={navItems}
        role="supervisor"
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onToggle={toggleSidebar}
      />
      <main
        className="supervisor-main"
        style={{
          marginLeft: isMobile ? 0 : (sidebarOpen ? '260px' : '70px'),
        }}
      >
        <Outlet context={{ onMenuClick: toggleSidebar }} />
      </main>

      <style>{`
        .supervisor-layout {
          display: flex;
          min-height: 100vh;
          background: var(--bg-primary);
        }

        .supervisor-main {
          flex: 1;
          transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          min-height: 100vh;
          width: 100%;
          overflow-x: hidden;
          background: var(--bg-primary);
          position: relative;
        }

        /* Scrollbar styling — falls back to theme-aware tokens
           (the previous --border-strong variable was never defined
           in the theme, so hover state silently did nothing) */
        .supervisor-main::-webkit-scrollbar {
          width: 6px;
        }

        .supervisor-main::-webkit-scrollbar-track {
          background: transparent;
        }

        .supervisor-main::-webkit-scrollbar-thumb {
          background: var(--border-default);
          border-radius: 10px;
        }

        .supervisor-main::-webkit-scrollbar-thumb:hover {
          background: var(--border-active);
        }

        @media (max-width: 768px) {
          .supervisor-main {
            margin-left: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}