import { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import Topbar from "./Topbar";
import { useAuth } from "../../context/AuthContext";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import {
  Search,
  Pencil,
  Save,
  X,
  Lock,
  Activity,
  Eye,
  EyeOff,
  KeyRound,
  User,
  Mail,
  Shield,
  Award,
  CheckCircle2,
  Clock,
  TrendingUp,
  Settings,
  LogOut,
  AlertCircle,
  FolderKanban,
  Gem,
  ArrowUpRight,
} from "lucide-react";

// Import services
import projectService from "../../services/projectService";
import taskService from "../../services/taskService";
import userService from "../../services/userService";

export default function ProfilePage() {
  const ctx = useOutletContext?.() || {};
  const onMenuClick = ctx.onMenuClick;

  const { user } = useAuth();

  // State
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [showFullActivity, setShowFullActivity] = useState(false);

  // Real data from API
  const [stats, setStats] = useState({
    projects: 0,
    tasksCompleted: 0,
    tasksInProgress: 0,
    completionRate: 0,
  });

  const [activities, setActivities] = useState([]);
  const [recentTasks, setRecentTasks] = useState([]);

  const [form, setForm] = useState({
    name: user?.u_name || user?.name || "",
    email: user?.email || "",
  });

  const [passwords, setPasswords] = useState({
    current: "",
    new: "",
    confirm: "",
  });

  const [showPw, setShowPw] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  // Fetch real data
  useEffect(() => {
    fetchProfileData();
  }, [user]);

  const fetchProfileData = async () => {
    try {
      setLoading(true);

      const [projectsData, tasksData] = await Promise.all([
        projectService.getProjects(),
        taskService.getTasks(),
      ]);

      const projectsList = projectsData?.data || projectsData || [];
      const tasksList = tasksData?.data || tasksData || [];

      const userId = user?.id || user?.u_id;

      const userTasks = tasksList.filter(t =>
        t.assign_to === userId ||
        t.created_by === userId ||
        t.assignedTo === userId
      );

      const completedTasks = userTasks.filter(t =>
        t.status === 'done' || t.status === 'completed'
      ).length;

      const inProgressTasks = userTasks.filter(t =>
        t.status === 'in_progress' || t.status === 'in-progress' ||
        t.status === 'review' || t.status === 'in_review'
      ).length;

      const completionRate = userTasks.length > 0
        ? Math.round((completedTasks / userTasks.length) * 100)
        : 0;

      const recent = userTasks
        .sort((a, b) => new Date(b.created_at || b.updated_at) - new Date(a.created_at || a.updated_at))
        .slice(0, 5);

      const activityItems = userTasks
        .filter(t => t.created_at || t.updated_at)
        .slice(0, 10)
        .map(t => ({
          id: t.t_id || t.id,
          text: t.status === 'done' || t.status === 'completed'
            ? `Completed task: ${t.title}`
            : `Updated task: ${t.title}`,
          time: t.updated_at ? new Date(t.updated_at).toLocaleString() : 'Recently',
          type: t.status === 'done' || t.status === 'completed' ? 'task' : 'update'
        }));

      const projectActivities = projectsList
        .filter(p => p.created_by === userId)
        .slice(0, 3)
        .map(p => ({
          id: `p-${p.p_id || p.id}`,
          text: `Created project: ${p.p_name || p.name}`,
          time: p.created_at ? new Date(p.created_at).toLocaleString() : 'Recently',
          type: 'project'
        }));

      const allActivities = [...activityItems, ...projectActivities]
        .sort((a, b) => a.time.localeCompare(b.time))
        .slice(0, 8);

      setStats({
        projects: projectsList.filter(p => p.created_by === userId || p.lead_id === userId).length || 0,
        tasksCompleted: completedTasks,
        tasksInProgress: inProgressTasks,
        completionRate: completionRate,
      });

      setRecentTasks(recent);
      setActivities(allActivities.length > 0 ? allActivities : [
        { id: 1, text: "Welcome to your profile!", time: "Just now", type: "update" }
      ]);

    } catch (error) {
      console.error('Error fetching profile data:', error);
      toast.error('Failed to load profile data');

      setStats({
        projects: 0,
        tasksCompleted: 0,
        tasksInProgress: 0,
        completionRate: 0,
      });
      setActivities([
        { id: 1, text: "Welcome to your profile!", time: "Just now", type: "update" }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const userId = user?.id || user?.u_id;
      await userService.updateUser(userId, {
        username: form.name,
        role: user?.role,
      });
      toast.success("Profile updated successfully");
      setEditMode(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    }
  };

  const handlePasswordChange = async () => {
    if (!passwords.current || !passwords.new || !passwords.confirm) {
      toast.error("Please fill all fields");
      return;
    }
    if (passwords.new !== passwords.confirm) {
      toast.error("New passwords do not match");
      return;
    }
    if (passwords.new.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    try {
      toast.success("Password changed successfully");
      setPasswords({ current: "", new: "", confirm: "" });
    } catch (error) {
      console.error('Error changing password:', error);
      toast.error('Failed to change password');
    }
  };

  const filteredFields = [
    { label: "Name", value: form.name, icon: User },
    { label: "Email", value: form.email, icon: Mail },
    { label: "User ID", value: user?.id || user?.u_id, icon: Shield },
    { label: "Role", value: user?.role, icon: Award },
  ].filter(item =>
    item.label.toLowerCase().includes(search.toLowerCase()) ||
    item.value?.toString().toLowerCase().includes(search.toLowerCase())
  );

  const pwStrength = (pw) => {
    if (!pw) return null;
    if (pw.length < 6) return { label: "Weak", color: "var(--accent-rose)", width: "30%" };
    if (pw.length < 10) return { label: "Fair", color: "var(--accent-amber)", width: "60%" };
    return { label: "Strong", color: "var(--accent-emerald)", width: "100%" };
  };

  const strength = pwStrength(passwords.new);
  const displayedActivities = showFullActivity ? activities : activities.slice(0, 4);

  const initials = (user?.u_name || user?.name || "U").split(" ").map(n => n[0]).join("").toUpperCase() || "U";

  const getRoleColor = (role) => {
    const colors = {
      admin: 'var(--accent-rose)',
      manager: 'var(--accent-primary)',
      supervisor: 'var(--accent-emerald)',
      lead: 'var(--accent-amber)',
      member: 'var(--accent-emerald)'
    };
    return colors[role?.toLowerCase()] || 'var(--accent-primary)';
  };

  const roleColor = getRoleColor(user?.role);

  const getActivityIcon = (type) => {
    const icons = {
      login: <LogOut size={12} />,
      update: <Settings size={12} />,
      task: <CheckCircle2 size={12} />,
      project: <FolderKanban size={12} />
    };
    return icons[type] || <Activity size={12} />;
  };

  if (loading) {
    return (
      <div>
        <Topbar title="Profile Settings" onMenuClick={onMenuClick} />
        <div className="page-container">
          <div className="loading-wrapper">
            <div className="loading-spinner" />
            <p>Loading profile data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <Topbar title="Profile Settings" onMenuClick={onMenuClick} />

      <div className="profile-container">
        {/* ─── SEARCH BAR ─── */}
        <div className="search-bar-modern">
          <Search size={16} className="search-icon" />
          <input
            placeholder="Search profile fields..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch('')}>
              <X size={14} />
            </button>
          )}
        </div>

        {/* ─── STATS GRID ─── */}
        <div className="stats-grid-modern">
          <div className="stat-card-modern">
            <div className="stat-card-icon purple">
              <FolderKanban size={18} />
            </div>
            <div className="stat-card-content">
              <span className="stat-card-value">{stats.projects}</span>
              <span className="stat-card-label">Projects</span>
            </div>
            <div className="stat-card-trend up">
              <ArrowUpRight size={14} />
              <span>Active</span>
            </div>
          </div>

          <div className="stat-card-modern">
            <div className="stat-card-icon emerald">
              <CheckCircle2 size={18} />
            </div>
            <div className="stat-card-content">
              <span className="stat-card-value">{stats.tasksCompleted}</span>
              <span className="stat-card-label">Tasks Done</span>
            </div>
            <div className="stat-card-trend up">
              <ArrowUpRight size={14} />
              <span>{stats.completionRate}%</span>
            </div>
          </div>

          <div className="stat-card-modern">
            <div className="stat-card-icon amber">
              <Clock size={18} />
            </div>
            <div className="stat-card-content">
              <span className="stat-card-value">{stats.tasksInProgress}</span>
              <span className="stat-card-label">In Progress</span>
            </div>
            <div className="stat-card-trend">
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Active</span>
            </div>
          </div>

          <div className="stat-card-modern">
            <div className="stat-card-icon teal">
              <TrendingUp size={18} />
            </div>
            <div className="stat-card-content">
              <span className="stat-card-value">{stats.completionRate}%</span>
              <span className="stat-card-label">Completion Rate</span>
            </div>
            <div className="stat-card-trend up">
              <ArrowUpRight size={14} />
              <span>Good</span>
            </div>
          </div>
        </div>

        {/* ─── PROFILE HERO CARD ─── */}
        <motion.div
          className="profile-card-modern profile-card-hero"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div
            className="profile-hero-banner"
            style={{
              background: `linear-gradient(120deg, color-mix(in srgb, ${roleColor} 30%, transparent), color-mix(in srgb, ${roleColor} 8%, transparent) 55%, transparent)`
            }}
          />

          <div className="profile-hero-body">
            <div className="profile-avatar-wrapper">
              <div className="profile-avatar-ring" style={{ background: `linear-gradient(135deg, ${roleColor}, color-mix(in srgb, ${roleColor} 60%, transparent))` }}>
                <div className="profile-avatar">{initials}</div>
              </div>
              <div className="profile-status-dot" style={{ background: roleColor }} />
            </div>

            <div className="profile-info">
              <h2 className="profile-name">{form.name}</h2>
              <div className="profile-badges">
                <span className="profile-role" style={{ background: `color-mix(in srgb, ${roleColor} 18%, transparent)`, color: roleColor }}>
                  <Shield size={12} /> {user?.role || 'User'}
                </span>
                <span className="profile-id">
                  <Gem size={12} /> ID: {user?.id || user?.u_id}
                </span>
              </div>
              <p className="profile-email">
                <Mail size={14} /> {user?.email}
              </p>
            </div>

            <div className="profile-actions">
              {!editMode ? (
                <button className="btn-primary-modern" onClick={() => setEditMode(true)}>
                  <Pencil size={14} /> Edit Profile
                </button>
              ) : (
                <>
                  <button className="btn-primary-modern" onClick={handleSave}>
                    <Save size={14} /> Save
                  </button>
                  <button className="btn-secondary-modern" onClick={() => setEditMode(false)}>
                    <X size={14} />
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="profile-divider" />

          <div className="profile-info-grid">
            {filteredFields.map((item, i) => {
              const Icon = item.icon;
              const isEditable = item.label === "Name" || item.label === "Email";
              const isEditing = editMode && isEditable;

              return (
                <motion.div
                  key={i}
                  className="info-field"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <div className="info-field-label">
                    <Icon size={12} />
                    {item.label}
                  </div>
                  {isEditing ? (
                    <input
                      className="info-field-input"
                      value={item.label === "Name" ? form.name : form.email}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          [item.label === "Name" ? "name" : "email"]: e.target.value,
                        })
                      }
                    />
                  ) : (
                    <div className="info-field-value">{item.value || '—'}</div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* ─── PASSWORD CARD ─── */}
        <motion.div
          className="profile-card-modern"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <div className="section-header-modern">
            <div className="section-icon-modern">
              <KeyRound size={15} />
            </div>
            <div className="section-content">
              <h3 className="section-title-modern">Change Password</h3>
              <p className="section-sub-modern">Keep your account secure with a strong password</p>
            </div>
          </div>

          <div className="password-grid">
            <div className="password-field">
              <label className="password-label">Current Password</label>
              <div className="password-input-wrapper">
                <Lock size={14} className="password-input-icon" />
                <input
                  type={showPw.current ? "text" : "password"}
                  placeholder="Enter current password"
                  value={passwords.current}
                  onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                />
                <button className="password-eye" onClick={() => setShowPw(s => ({ ...s, current: !s.current }))}>
                  {showPw.current ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>

            <div className="password-field">
              <label className="password-label">New Password</label>
              <div className="password-input-wrapper">
                <Lock size={14} className="password-input-icon" />
                <input
                  type={showPw.new ? "text" : "password"}
                  placeholder="Enter new password"
                  value={passwords.new}
                  onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                />
                <button className="password-eye" onClick={() => setShowPw(s => ({ ...s, new: !s.new }))}>
                  {showPw.new ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              {strength && (
                <div className="password-strength">
                  <div className="strength-track">
                    <div className="strength-fill" style={{ width: strength.width, background: strength.color }} />
                  </div>
                  <span style={{ color: strength.color }}>{strength.label}</span>
                </div>
              )}
            </div>

            <div className="password-field password-field--full">
              <label className="password-label">Confirm Password</label>
              <div className="password-input-wrapper">
                <Lock size={14} className="password-input-icon" />
                <input
                  type={showPw.confirm ? "text" : "password"}
                  placeholder="Confirm new password"
                  value={passwords.confirm}
                  onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                />
                <button className="password-eye" onClick={() => setShowPw(s => ({ ...s, confirm: !s.confirm }))}>
                  {showPw.confirm ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              {passwords.confirm && passwords.new && (
                <p className="password-match" style={{
                  color: passwords.new === passwords.confirm ? "var(--accent-emerald)" : "var(--accent-rose)"
                }}>
                  {passwords.new === passwords.confirm ? (
                    <><CheckCircle2 size={11} /> Passwords match</>
                  ) : (
                    <><AlertCircle size={11} /> Passwords do not match</>
                  )}
                </p>
              )}
            </div>

            <button className="password-update-btn" onClick={handlePasswordChange}>
              <KeyRound size={14} /> Update Password
            </button>
          </div>
        </motion.div>

        {/* ─── ACTIVITY CARD ─── */}
        <motion.div
          className="profile-card-modern"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <div className="section-header-modern">
            <div className="section-icon-modern">
              <Activity size={15} />
            </div>
            <div className="section-content">
              <h3 className="section-title-modern">Activity History</h3>
              <p className="section-sub-modern">Your recent account activity</p>
            </div>
            <span className="activity-badge">{activities.length} events</span>
          </div>

          <div className="activity-timeline">
            {displayedActivities.map((a, index) => (
              <motion.div
                key={a.id}
                className="activity-item"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <div className="activity-dot" style={{ background: roleColor }}>
                  {getActivityIcon(a.type)}
                </div>
                <div className="activity-content">
                  <p className="activity-text">{a.text}</p>
                  <span className="activity-time">{a.time}</span>
                </div>
              </motion.div>
            ))}
          </div>

          {activities.length > 4 && (
            <button
              className="show-more-btn"
              onClick={() => setShowFullActivity(!showFullActivity)}
            >
              {showFullActivity ? 'Show Less' : `Show All (${activities.length})`}
            </button>
          )}
        </motion.div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .spin { animation: spin 1s linear infinite; }

        /* ─── PAGE LAYOUT ─── */
        .profile-page {
          min-height: 100vh;
          background: var(--bg-primary);
        }

        .profile-container {
          max-width: 950px;
          margin: 0 auto;
          padding: 20px 24px 32px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        /* ─── LOADING ─── */
        .loading-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 400px;
          gap: 12px;
          color: var(--text-muted);
        }

        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid var(--border-subtle);
          border-top-color: var(--accent-primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        /* ─── SEARCH BAR ─── */
        .search-bar-modern {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-radius: 12px;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          transition: all 0.2s ease;
        }

        .search-bar-modern:focus-within {
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 3px var(--accent-glow);
        }

        .search-icon {
          color: var(--text-muted);
          flex-shrink: 0;
        }

        .search-bar-modern input {
          flex: 1;
          border: none;
          outline: none;
          background: transparent;
          color: var(--text-primary);
          font-size: 13px;
        }

        .search-bar-modern input::placeholder {
          color: var(--text-muted);
        }

        .search-clear {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          border: none;
          border-radius: 50%;
          background: var(--bg-secondary);
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.15s;
        }

        .search-clear:hover {
          background: var(--border-default);
          color: var(--text-primary);
        }

        /* ─── STATS GRID ─── */
        .stats-grid-modern {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
        }

        .stat-card-modern {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px 18px;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 14px;
          transition: all 0.2s ease;
        }

        .stat-card-modern:hover {
          border-color: var(--border-default);
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }

        .stat-card-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .stat-card-icon.purple { background: color-mix(in srgb, var(--accent-primary) 14%, transparent); color: var(--accent-primary); }
        .stat-card-icon.emerald { background: color-mix(in srgb, var(--accent-emerald) 14%, transparent); color: var(--accent-emerald); }
        .stat-card-icon.amber { background: color-mix(in srgb, var(--accent-amber) 14%, transparent); color: var(--accent-amber); }
        .stat-card-icon.teal { background: color-mix(in srgb, var(--accent-teal) 14%, transparent); color: var(--accent-teal); }

        .stat-card-content {
          flex: 1;
        }

        .stat-card-value {
          display: block;
          font-size: 22px;
          font-weight: 800;
          color: var(--text-primary);
          line-height: 1.2;
        }

        .stat-card-label {
          font-size: 12px;
          color: var(--text-muted);
          font-weight: 500;
        }

        .stat-card-trend {
          display: flex;
          align-items: center;
          gap: 2px;
          font-size: 11px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 20px;
          flex-shrink: 0;
        }

        .stat-card-trend.up { background: color-mix(in srgb, var(--accent-emerald) 14%, transparent); color: var(--accent-emerald); }
        .stat-card-trend.down { background: color-mix(in srgb, var(--accent-rose) 14%, transparent); color: var(--accent-rose); }

        /* ─── PROFILE CARD ─── */
        .profile-card-modern {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
          padding: 24px;
          transition: all 0.2s ease;
        }

        .profile-card-modern:hover {
          border-color: var(--border-default);
        }

        /* Hero variant: banner bleeds to the card edges, body carries the padding */
        .profile-card-hero {
          padding: 0;
          overflow: hidden;
        }

        .profile-hero-banner {
          height: 84px;
          width: 100%;
          position: relative;
        }
        .profile-hero-banner::after {
          content: '';
          position: absolute;
          inset: 0;
          background-image: radial-gradient(rgba(255,255,255,0.10) 1px, transparent 1px);
          background-size: 14px 14px;
          opacity: 0.5;
        }

        .profile-hero-body {
          display: flex;
          align-items: center;
          gap: 18px;
          flex-wrap: wrap;
          padding: 0 24px 22px;
          margin-top: -32px;
        }

        .profile-card-hero .profile-divider {
          margin: 0 24px 18px;
        }
        .profile-card-hero .profile-info-grid {
          padding: 0 24px 24px;
        }

        .profile-avatar-wrapper {
          position: relative;
          flex-shrink: 0;
        }

        .profile-avatar-ring {
          width: 68px;
          height: 68px;
          border-radius: 50%;
          padding: 3px;
          box-shadow: 0 0 0 4px var(--bg-card);
        }

        .profile-avatar {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: var(--bg-card);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 21px;
          color: var(--text-primary);
        }

        .profile-status-dot {
          position: absolute;
          bottom: 3px;
          right: 3px;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          border: 2px solid var(--bg-card);
        }

        .profile-info {
          flex: 1;
          min-width: 0;
          padding-top: 30px;
        }

        .profile-name {
          font-size: 20px;
          font-weight: 800;
          color: var(--text-primary);
          margin: 0 0 4px;
        }

        .profile-badges {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-bottom: 4px;
        }

        .profile-role {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          font-weight: 600;
          padding: 2px 10px;
          border-radius: 20px;
          text-transform: capitalize;
        }

        .profile-id {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          color: var(--text-muted);
          background: var(--bg-secondary);
          padding: 2px 10px;
          border-radius: 20px;
        }

        .profile-email {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: var(--text-secondary);
          margin: 0;
        }

        .profile-actions {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
          padding-top: 30px;
        }

        .btn-primary-modern {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border: none;
          border-radius: 8px;
          background: var(--accent-primary);
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }

        .btn-primary-modern:hover {
          opacity: 0.85;
          transform: scale(0.98);
        }

        .btn-secondary-modern {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 8px 10px;
          border: 1px solid var(--border-default);
          border-radius: 8px;
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }

        .btn-secondary-modern:hover {
          border-color: var(--accent-primary);
          color: var(--accent-primary);
        }

        .profile-divider {
          height: 1px;
          background: var(--border-subtle);
        }

        .profile-info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .info-field {
          padding: 12px 14px;
          border-radius: 10px;
          background: var(--bg-secondary);
          transition: all 0.15s;
        }

        .info-field:hover {
          background: var(--bg-hover);
        }

        .info-field-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        }

        .info-field-value {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .info-field-input {
          width: 100%;
          padding: 6px 10px;
          border: 1px solid var(--border-default);
          border-radius: 6px;
          background: var(--bg-card);
          color: var(--text-primary);
          font-size: 13px;
          outline: none;
          transition: all 0.15s;
          margin-top: 2px;
          box-sizing: border-box;
        }

        .info-field-input:focus {
          border-color: var(--accent-primary);
        }

        /* ─── SECTION HEADER ─── */
        .section-header-modern {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 18px;
          flex-wrap: wrap;
        }

        .section-icon-modern {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          background: color-mix(in srgb, var(--accent-primary) 14%, transparent);
          color: var(--accent-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .section-content {
          flex: 1;
          min-width: 0;
        }

        .section-title-modern {
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0 0 2px;
        }

        .section-sub-modern {
          font-size: 12px;
          color: var(--text-muted);
          margin: 0;
        }

        .activity-badge {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          background: var(--bg-secondary);
          padding: 3px 12px;
          border-radius: 20px;
          flex-shrink: 0;
        }

        /* ─── PASSWORD ─── */
        .password-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px 16px;
        }

        .password-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .password-field--full {
          grid-column: 1 / -1;
        }

        .password-update-btn {
          grid-column: 1 / -1;
        }

        .password-label {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .password-input-wrapper {
          display: flex;
          align-items: center;
          background: var(--bg-secondary);
          border: 1px solid var(--border-default);
          border-radius: 10px;
          padding: 0 12px;
          transition: all 0.15s;
          overflow: hidden;
        }

        .password-input-wrapper:focus-within {
          border-color: var(--accent-primary);
          background: var(--bg-card);
        }

        .password-input-icon {
          color: var(--text-muted);
          flex-shrink: 0;
          margin-right: 8px;
        }

        .password-input-wrapper input {
          flex: 1;
          border: none;
          outline: none;
          background: transparent;
          padding: 10px 0;
          font-size: 13px;
          color: var(--text-primary);
        }

        .password-eye {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          padding: 0 0 0 8px;
          transition: color 0.14s;
        }

        .password-eye:hover {
          color: var(--accent-primary);
        }

        .password-strength {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 2px;
        }

        .strength-track {
          flex: 1;
          height: 4px;
          border-radius: 4px;
          background: var(--border-subtle);
          overflow: hidden;
        }

        .strength-fill {
          height: 100%;
          border-radius: 4px;
          transition: width 0.3s, background 0.3s;
        }

        .password-strength span {
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
        }

        .password-match {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          font-weight: 600;
          margin: 0;
        }

        .password-update-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 10px 20px;
          border: none;
          border-radius: 10px;
          background: var(--accent-primary);
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          margin-top: 4px;
          width: fit-content;
        }

        .password-update-btn:hover {
          opacity: 0.85;
        }

        /* ─── ACTIVITY ─── */
        .activity-timeline {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .activity-timeline::before {
          content: '';
          position: absolute;
          left: 14px;
          top: 8px;
          bottom: 8px;
          width: 1px;
          background: var(--border-subtle);
        }

        .activity-item {
          position: relative;
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }

        .activity-dot {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: #fff;
          font-size: 10px;
          margin-top: 2px;
          position: relative;
          z-index: 1;
          box-shadow: 0 0 0 4px var(--bg-card);
        }

        .activity-content {
          background: var(--bg-secondary);
          padding: 10px 14px;
          border-radius: 10px;
          flex: 1;
          min-width: 0;
        }

        .activity-text {
          margin: 0 0 2px;
          font-size: 13px;
          color: var(--text-primary);
        }

        .activity-time {
          font-size: 11px;
          color: var(--text-muted);
        }

        .show-more-btn {
          margin-top: 12px;
          width: 100%;
          padding: 8px;
          border: 1px solid var(--border-default);
          border-radius: 8px;
          background: var(--bg-secondary);
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }

        .show-more-btn:hover {
          border-color: var(--accent-primary);
          color: var(--accent-primary);
        }

        /* ─── RESPONSIVE ─── */
        @media (max-width: 1024px) {
          .stats-grid-modern {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 768px) {
          .profile-container {
            padding: 16px;
          }

          .profile-hero-body {
            flex-direction: column;
            align-items: center;
            text-align: center;
            margin-top: -40px;
          }

          .profile-actions {
            width: 100%;
            justify-content: center;
            padding-top: 8px;
          }

          .profile-info {
            text-align: center;
            padding-top: 8px;
          }

          .profile-badges {
            justify-content: center;
          }

          .profile-email {
            justify-content: center;
          }

          .profile-info-grid {
            grid-template-columns: 1fr;
          }

          .password-grid {
            grid-template-columns: 1fr;
          }

          .stats-grid-modern {
            grid-template-columns: 1fr 1fr;
          }

          .stat-card-modern {
            padding: 14px;
          }

          .stat-card-value {
            font-size: 18px;
          }

          .section-header-modern {
            flex-direction: column;
            align-items: flex-start;
          }

          .activity-badge {
            margin-left: 0;
          }
        }

        @media (max-width: 480px) {
          .profile-container {
            padding: 12px;
          }

          .profile-card-modern {
            padding: 16px;
          }

          .profile-card-hero {
            padding: 0;
          }

          .stats-grid-modern {
            grid-template-columns: 1fr;
          }

          .stat-card-modern {
            padding: 12px 14px;
          }

          .profile-avatar-ring {
            width: 56px;
            height: 56px;
          }

          .profile-avatar {
            font-size: 17px;
          }

          .profile-name {
            font-size: 17px;
          }

          .profile-actions {
            flex-wrap: wrap;
          }

          .btn-primary-modern {
            padding: 6px 14px;
            font-size: 12px;
          }

          .password-update-btn {
            padding: 8px 16px;
            font-size: 13px;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}