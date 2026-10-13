// components/shared/Topbar.jsx
import { useState, useRef, useEffect, useMemo, useCallback, useId } from 'react';
import { Bell, Sun, Moon, Menu, ChevronDown, User, LogOut, Shield } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import api, { endpoints } from '../../utils/api';

// Static lookup tables 
const AVATAR_COLORS = ['#6366f1', '#2dd4bf', '#f43f5e', '#f59e0b', '#10b981'];

const ROLE_COLORS = {
  admin: '#f43f5e',
  manager: '#6366f1',
  supervisor: '#2dd4bf',
  lead: '#f59e0b',
  member: '#10b981',
};

// Backend stores "manager"; UI shows "Supervisor" (matches portal).
const ROLE_LABELS = {
  admin: 'Admin',
  manager: 'Supervisor',
  supervisor: 'Supervisor',
  lead: 'Lead',
  member: 'Member',
};

const ROLE_BASE_PATH = {
  supervisor: 'supervisor',
  manager: 'supervisor',
  lead: 'lead',
  member: 'lead',
};

const getRoleColor = (role) => ROLE_COLORS[role?.toLowerCase()] || '#6366f1';
const getBasePath = (role) => ROLE_BASE_PATH[role?.toLowerCase()] || 'dashboard';

const getRoleLabel = (role) =>
  ROLE_LABELS[role?.toLowerCase()] || (role ? role.charAt(0).toUpperCase() + role.slice(1) : 'User');

// Converts a 6-digit hex color to an rgba() string at the given alpha.
const withAlpha = (hex, alpha) => {
  if (typeof hex !== 'string' || !/^#([0-9a-f]{6})$/i.test(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/* ─────────── localStorage helpers (per-user) ─────────── */
// Same keys the notifications pages use, so badge stays in sync when the
// user reads/deletes notifications on the notification page.
const readKeyFor    = (userId) => `read_notifications_${userId ?? 'anon'}`;
const deletedKeyFor = (userId) => `deleted_notifications_${userId ?? 'anon'}`;

const readLocalSet = (key) => {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); }
  catch { return new Set(); }
};

export default function Topbar({ title, actions, onMenuClick, searchBar, actionButtons }) {
  const { unreadCount: authUnreadCount, user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileRef = useRef(null);
  const profileBtnRef = useRef(null);
  const firstMenuItemRef = useRef(null);
  const menuId = useId();

  const [unreadCount, setUnreadCount] = useState(authUnreadCount || 0);

  const userName = user?.u_name || user?.name || 'User';
  const userRole = user?.role || 'User';
  const userRoleLabel = getRoleLabel(userRole);
  const userId = user?.id || user?.u_id;

  const initials = useMemo(() => {
    const parts = userName?.split(' ').filter(Boolean) || [];
    const letters = parts.map((n) => n[0]).join('').toUpperCase();
    return letters || 'U';
  }, [userName]);

  const avatarColor =
    user?.avatar_color || AVATAR_COLORS[(userId || 0) % AVATAR_COLORS.length];
  const roleColor = useMemo(() => getRoleColor(userRole), [userRole]);

  // ---------------------------------------------------------------------
  // Fetch unread count from the API + fallback to local activity list.
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    let cancelled = false;

    const computeLocalUnread = () => {
      try {
        const readSet    = readLocalSet(readKeyFor(userId));
        const deletedSet = readLocalSet(deletedKeyFor(userId));

        // Pull the same activity stream the notification page renders.
        // Cache it in sessionStorage so we don't spam the network every 30s.
        const CACHE_KEY = `activities_cache_${userId}`;
        const CACHE_TTL = 25 * 1000; // 25s < poll interval

        let activities = null;
        try {
          const raw = sessionStorage.getItem(CACHE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Date.now() - parsed.ts < CACHE_TTL) {
              activities = parsed.data;
            }
          }
        } catch { /* ignore */ }

        return { activities, readSet, deletedSet, CACHE_KEY };
      } catch {
        return { activities: null, readSet: new Set(), deletedSet: new Set(), CACHE_KEY: null };
      }
    };

    const fetchUnread = async () => {
      // 1) Try backend endpoint
      try {
        const { data } = await api.get(endpoints.notifications.unreadCount);
        const count =
          data?.count ?? data?.unread_count ?? data?.unreadCount ?? data?.data?.count ?? 0;
        const n = Number(count);
        if (!cancelled && Number.isFinite(n) && n > 0) {
          setUnreadCount(n);
          return;
        }
      } catch (err) {
        console.debug('Backend unread fetch failed, falling back to local:', err?.message);
      }

      // 2) Fallback: compute from the local activity feed
      try {
        const { readSet, deletedSet, CACHE_KEY } = computeLocalUnread();

        // Use the cached activity list if still fresh; otherwise fetch it.
        const CACHE_TTL = 25 * 1000;
        let activities = null;
        if (CACHE_KEY) {
          try {
            const raw = sessionStorage.getItem(CACHE_KEY);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Date.now() - parsed.ts < CACHE_TTL) activities = parsed.data;
            }
          } catch { /* ignore */ }
        }

        if (!activities) {
          // Use the notificationService to regenerate. Lazy import so we
          // don't pull it into the initial bundle.
          const { default: notificationService } = await import('../../services/notificationService');
          const res = await notificationService.getNotifications(userId, userRole);
          activities = res?.data || [];
          if (CACHE_KEY) {
            try {
              sessionStorage.setItem(
                CACHE_KEY,
                JSON.stringify({ ts: Date.now(), data: activities })
              );
            } catch { /* quota exceeded — ignore */ }
          }
        }

        const unread = (activities || []).filter((n) => {
          const id = n.n_id || n.id;
          if (!id) return false;
          if (deletedSet.has(id)) return false;
          if (readSet.has(id)) return false;
          return !n.is_read;
        }).length;

        if (!cancelled) setUnreadCount(unread);
      } catch (err) {
        console.debug('Local unread compute failed:', err?.message);
        if (!cancelled) setUnreadCount(0);
      }
    };

    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);

    // Also listen for storage events so if the user reads a notification
    // on the notification page in another tab, the badge updates instantly.
    const onStorage = (e) => {
      if (!e.key) return;
      if (e.key === readKeyFor(userId) || e.key === deletedKeyFor(userId)) {
        fetchUnread();
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('storage', onStorage);
    };
  }, [user?.id, userId, userRole]);

  // Prefer the AuthContext value when it's higher (in case it ever fetches).
  useEffect(() => {
    if (typeof authUnreadCount === 'number' && authUnreadCount > unreadCount) {
      setUnreadCount(authUnreadCount);
    }
  }, [authUnreadCount]);

  const closeMenu = useCallback(() => {
    setShowProfileMenu(false);
    profileBtnRef.current?.focus();
  }, []);

  const handleNotificationClick = () => {
    const role = userRole.toLowerCase();
    if (role === 'supervisor' || role === 'manager') navigate('/supervisor/notifications');
    else if (role === 'lead' || role === 'member') navigate('/lead/notifications');
    else navigate('/notifications');
  };

  const handleProfileAction = (action) => {
    setShowProfileMenu(false);
    const basePath = getBasePath(userRole);

    if (action === 'profile') {
      navigate(`/${basePath}/profile`);
    } else if (action === 'logout') {
      logout?.();
      navigate('/login');
    }
  };

  // Close on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!showProfileMenu) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closeMenu();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showProfileMenu, closeMenu]);

  // Focus first menu item when opened
  useEffect(() => {
    if (showProfileMenu) {
      firstMenuItemRef.current?.focus();
    }
  }, [showProfileMenu]);

  const handleMenuClick = () => {
    onMenuClick?.();
  };

  // Cap the display at 99+
  const displayCount = unreadCount > 99 ? '99+' : String(unreadCount);
  const hasUnread = unreadCount > 0;

  return (
    <header className="tb-root">
      {/* LEFT */}
      <div className="tb-left">
        <button
          className="tb-icon-btn tb-menu-btn"
          onClick={handleMenuClick}
          aria-label="Toggle sidebar menu"
        >
          <Menu size={18} />
        </button>
        <h1 className="tb-title">{title || 'Dashboard'}</h1>
      </div>

      {/* RIGHT */}
      <div className="tb-right">
        {actions && <div className="tb-actions">{actions}</div>}
        {actionButtons && <div className="tb-actions">{actionButtons}</div>}
        {searchBar && <div className="tb-actions tb-searchbar">{searchBar}</div>}

        <div className="tb-actions tb-core-actions">
          <button
            className="tb-icon-btn"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-pressed={theme === 'dark'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* ─── NOTIFICATIONS with numbered red badge ─── */}
          <button
            className="tb-icon-btn tb-notif"
            onClick={handleNotificationClick}
            aria-label={
              hasUnread
                ? `Notifications, ${unreadCount} unread`
                : 'Notifications'
            }
          >
            <Bell size={16} />

            <AnimatePresence>
              {hasUnread && (
                <motion.span
                  key="badge"
                  className="tb-badge"
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.4, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                  aria-hidden="true"
                >
                  {displayCount}
                </motion.span>
              )}
            </AnimatePresence>

            {/* pulsing ring (only when unread) */}
            {hasUnread && <span className="tb-notif-pulse" aria-hidden="true" />}
          </button>

          {/* PROFILE DROPDOWN */}
          <div ref={profileRef} className="tb-profile-wrap">
            <button
              ref={profileBtnRef}
              className={`tb-profile-btn ${showProfileMenu ? 'active' : ''}`}
              onClick={() => setShowProfileMenu((v) => !v)}
              aria-label={`Profile menu for ${userName}`}
              aria-haspopup="menu"
              aria-expanded={showProfileMenu}
              aria-controls={menuId}
            >
              <div
                className="tb-avatar"
                style={{ background: withAlpha(avatarColor, 0.15), color: avatarColor }}
              >
                {initials}
              </div>
              <div className="tb-profile-text">
                <span className="tb-name">{userName?.split(' ')[0] || 'User'}</span>
                <span className="tb-role" style={{ color: roleColor }}>
                  {userRoleLabel}
                </span>
              </div>
              <ChevronDown
                size={14}
                className={`tb-chevron ${showProfileMenu ? 'rotated' : ''}`}
                aria-hidden="true"
                style={{ color: 'var(--text-muted)' }}
              />
            </button>

            <AnimatePresence>
              {showProfileMenu && (
                <>
                  <motion.div
                    className="tb-menu-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onClick={closeMenu}
                    aria-hidden="true"
                  />
                  <motion.div
                    id={menuId}
                    role="menu"
                    aria-label="Profile"
                    className="tb-menu"
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                  >
                    <div className="tb-menu-header">
                      <div
                        className="tb-menu-avatar"
                        style={{ background: withAlpha(avatarColor, 0.15), color: avatarColor }}
                      >
                        {initials}
                      </div>
                      <div className="tb-menu-user">
                        <span className="tb-menu-name">{userName}</span>
                        <span className="tb-menu-role" style={{ color: roleColor }}>
                          <Shield size={10} aria-hidden="true" /> {userRoleLabel}
                        </span>
                      </div>
                    </div>

                    <div className="tb-menu-divider" />

                    <button
                      ref={firstMenuItemRef}
                      role="menuitem"
                      className="tb-menu-item"
                      onClick={() => handleProfileAction('profile')}
                    >
                      <User size={14} aria-hidden="true" />
                      <span>My Profile</span>
                    </button>

                    <div className="tb-menu-divider" />

                    <button
                      role="menuitem"
                      className="tb-menu-item tb-menu-logout"
                      onClick={() => handleProfileAction('logout')}
                    >
                      <LogOut size={14} aria-hidden="true" />
                      <span>Logout</span>
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <style>{`
        .tb-root {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px 10px;
          padding: 8px 16px;
          padding-left: max(16px, env(safe-area-inset-left));
          padding-right: max(16px, env(safe-area-inset-right));
          min-height: 52px;
          border-bottom: 1px solid var(--border-subtle);
          background: var(--bg-secondary);
          position: sticky;
          top: 0;
          z-index: 100;
          width: 100%;
          box-sizing: border-box;
          overflow: visible;
        }

        .tb-left {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1 1 auto;
          min-width: 0;
        }

        .tb-title {
          font-size: 15px;
          font-weight: 800;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
          min-width: 0;
        }

        @media (min-width: 1024px) { .tb-title { font-size: 16px; } }
        @media (min-width: 1600px) { .tb-root { padding-left: 28px; padding-right: 28px; } }
        @media (max-width: 768px)  { .tb-title { font-size: 14px; max-width: 200px; } }
        @media (max-width: 540px)  { .tb-title { font-size: 13px; max-width: 46vw; } }
        @media (max-width: 480px)  { .tb-title { font-size: 12.5px; max-width: 42vw; } }
        @media (max-width: 400px)  { .tb-title { font-size: 12px; max-width: 36vw; } }
        @media (max-width: 340px)  { .tb-title { font-size: 11.5px; max-width: 30vw; } }

        .tb-right {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 6px;
          flex: 1 1 auto;
          min-width: 0;
          max-width: 100%;
        }

        .tb-actions {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
          min-width: 0;
        }

        .tb-core-actions {
          flex-wrap: nowrap;
          flex-shrink: 0;
        }

        .tb-searchbar {
          min-width: 0;
          flex: 1 1 160px;
        }

        .tb-actions button {
          min-width: 0;
        }

        .tb-icon-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-card);
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          transition: all 0.14s;
          padding: 0;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }

        .tb-icon-btn:hover {
          border-color: var(--accent-primary);
          color: var(--accent-primary);
        }

        .tb-icon-btn:focus-visible,
        .tb-profile-btn:focus-visible,
        .tb-menu-item:focus-visible {
          outline: 2px solid var(--accent-primary);
          outline-offset: 2px;
        }

        /* ─── NOTIFICATIONS ─── */
        .tb-notif { position: relative; }

        /* ─── Numbered red badge ─── */
        .tb-badge {
          position: absolute;
          top: -5px;
          right: -5px;
          min-width: 17px;
          height: 17px;
          padding: 0 5px;
          border-radius: 9px;
          background: #f43f5e;
          color: #fff;
          font-size: 10px;
          font-weight: 800;
          line-height: 17px;
          text-align: center;
          border: 2px solid var(--bg-secondary);
          box-shadow: 0 2px 6px rgba(244, 63, 94, 0.4);
          pointer-events: none;
          font-variant-numeric: tabular-nums;
          z-index: 2;
          box-sizing: border-box;
        }

        /* ─── Subtle pulse ring when unread ─── */
        .tb-notif-pulse {
          position: absolute;
          inset: -2px;
          border-radius: 10px;
          border: 2px solid #f43f5e;
          opacity: 0.55;
          pointer-events: none;
          animation: tbPulse 1.8s ease-out infinite;
          z-index: 1;
        }
        @keyframes tbPulse {
          0%   { transform: scale(1);   opacity: 0.6; }
          70%  { transform: scale(1.4); opacity: 0;   }
          100% { transform: scale(1.4); opacity: 0;   }
        }

        /* Respect reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .tb-notif-pulse { animation: none; opacity: 0; }
        }

        /* Legacy dot class kept for backward-compat (unused). */
        .tb-dot {
          position: absolute;
          top: 5px;
          right: 5px;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #f43f5e;
          border: 1.5px solid var(--bg-secondary);
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.6; }
        }
        .pulse { animation: pulse 1.5s infinite; }

        .tb-profile-wrap {
          position: relative;
          flex-shrink: 0;
        }

        .tb-profile-btn {
          display: flex;
          align-items: center;
          gap: 7px;
          height: 34px;
          padding: 0 8px 0 4px;
          border-radius: 10px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-card);
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }

        .tb-profile-btn:hover {
          border-color: var(--accent-primary);
          background: var(--bg-secondary);
        }

        .tb-profile-btn.active {
          border-color: var(--accent-primary);
          background: var(--bg-secondary);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-primary) 20%, transparent);
        }

        .tb-avatar {
          width: 26px;
          height: 26px;
          border-radius: 7px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 800;
          flex-shrink: 0;
        }

        .tb-profile-text {
          display: flex;
          flex-direction: column;
          line-height: 1.2;
        }

        .tb-name { font-size: 12px; font-weight: 700; color: var(--text-primary); }
        .tb-role { font-size: 10px; font-weight: 600; }

        .tb-chevron {
          transition: transform 0.2s ease;
          flex-shrink: 0;
        }
        .tb-chevron.rotated { transform: rotate(180deg); }

        .tb-menu-backdrop { display: none; }

        .tb-menu {
          position: absolute;
          right: 0;
          top: calc(100% + 8px);
          width: max-content;
          min-width: 220px;
          max-width: min(280px, calc(100vw - 24px));
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: 12px;
          box-shadow: 0 12px 40px rgba(0,0,0,0.2);
          overflow: hidden;
          z-index: 200;
        }

        .tb-menu-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          background: var(--bg-secondary);
        }

        .tb-menu-avatar {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          font-weight: 800;
          flex-shrink: 0;
        }

        .tb-menu-user {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }

        .tb-menu-name {
          font-size: 13px;
          font-weight: 700;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tb-menu-role {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          font-weight: 600;
        }

        .tb-menu-divider {
          height: 1px;
          background: var(--border-subtle);
          margin: 0;
        }

        .tb-menu-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 10px 16px;
          font-size: 13px;
          font-family: inherit;
          text-align: left;
          cursor: pointer;
          color: var(--text-primary);
          background: none;
          border: none;
          transition: all 0.12s;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }

        .tb-menu-item:hover {
          background: var(--bg-secondary);
          color: var(--accent-primary);
        }

        .tb-menu-item svg {
          flex-shrink: 0;
          color: var(--text-muted);
        }

        .tb-menu-item:hover svg {
          color: var(--accent-primary);
        }

        .tb-menu-logout { color: #f43f5e; }
        .tb-menu-logout svg { color: #f43f5e; }
        .tb-menu-logout:hover {
          background: rgba(239,68,68,0.08);
          color: #f43f5e;
        }
        .tb-menu-logout:hover svg { color: #f43f5e; }

        @media (max-width: 768px) {
          .tb-root { padding-top: 6px; padding-bottom: 6px; }
        }

        @media (max-width: 540px) {
          .tb-root { padding: 6px 10px; gap: 6px 8px; }
          .tb-root { padding-left: max(10px, env(safe-area-inset-left)); padding-right: max(10px, env(safe-area-inset-right)); }
          .tb-right { gap: 4px; }
          .tb-actions { gap: 4px; }
          .tb-profile-text { display: none; }
          .tb-profile-btn { padding: 0 6px; gap: 4px; }
          .tb-icon-btn { width: 30px; height: 30px; }
          .tb-badge { top: -4px; right: -4px; min-width: 16px; height: 16px; line-height: 16px; font-size: 9.5px; }
        }

        @media (max-width: 480px) {
          .tb-menu-backdrop {
            display: block;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.35);
            z-index: 190;
          }
          .tb-menu {
            position: fixed;
            left: 8px;
            right: 8px;
            top: auto;
            bottom: max(8px, env(safe-area-inset-bottom));
            width: auto;
            max-width: none;
            min-width: 0;
            z-index: 200;
          }
          .tb-menu-item {
            padding-top: 13px;
            padding-bottom: 13px;
            font-size: 14px;
          }
        }

        @media (max-width: 400px) {
          .tb-root { padding: 6px 8px; gap: 4px 6px; }
          .tb-root { padding-left: max(8px, env(safe-area-inset-left)); padding-right: max(8px, env(safe-area-inset-right)); }
          .tb-icon-btn { width: 28px; height: 28px; border-radius: 7px; }
          .tb-profile-btn { height: 30px; padding: 0 4px; }
          .tb-avatar { width: 22px; height: 22px; font-size: 9px; border-radius: 6px; }
        }

        @media (max-width: 340px) {
          .tb-icon-btn { width: 26px; height: 26px; }
          .tb-profile-btn { height: 28px; }
        }

        @media (hover: none) and (pointer: coarse) {
          .tb-icon-btn { width: 40px; height: 40px; }
          .tb-profile-btn { height: 40px; }
          .tb-menu-item {
            padding-top: 13px;
            padding-bottom: 13px;
          }
        }

        .tb-menu-btn { display: none !important; }
        @media (max-width: 768px) {
          .tb-menu-btn { display: flex !important; }
        }
      `}</style>
    </header>
  );
}