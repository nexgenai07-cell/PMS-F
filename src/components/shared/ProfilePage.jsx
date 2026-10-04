import { useState, useEffect, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import Topbar from "./Topbar";
import { useAuth } from "../../context/AuthContext";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
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
  ChevronDown,
  Loader2,
  Send,
} from "lucide-react";

// Import services
import projectService from "../../services/projectService";
import taskService from "../../services/taskService";
import userService from "../../services/userService";
import authService from "../../services/authService";

/* ─────────── Pure UI component (no logic changes) ─────────── */
const AnimatedNumber = ({ value, duration = 900, decimals = 0, suffix = "" }) => {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = Number(value) || 0;
    const start = performance.now();
    let raf;
    const step = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + (to - from) * eased;
      setDisplay(current.toFixed(decimals));
      if (t < 1) {
        raf = requestAnimationFrame(step);
      } else {
        fromRef.current = to;
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, decimals]);

  return <>{display}{suffix}</>;
};

const EASE = [0.22, 1, 0.36, 1];

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

  // ⬇️ NEW: disables the button while the confirmation email is being sent
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

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

  /**
   * ⬇️ REPLACED: now sends a confirmation email instead of changing
   * the password immediately. The change only happens when the user
   * clicks the link in that email.
   */
  const handlePasswordChange = async () => {
    if (!passwords.current || !passwords.new || !passwords.confirm) {
      toast.error("Please fill all fields");
      return;
    }
    if (passwords.new !== passwords.confirm) {
      toast.error("New passwords do not match");
      return;
    }
    if (passwords.new.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (passwords.current === passwords.new) {
      toast.error("New password must be different from the current one");
      return;
    }

    setPasswordSubmitting(true);
    try {
      await authService.requestPasswordChange({
        current: passwords.current,
        newPassword: passwords.new,
      });

      toast.success(
        "Confirmation link sent — check your email to finish changing your password.",
        { duration: 6000 }
      );

      setPasswords({ current: "", new: "", confirm: "" });
      setShowPw({ current: false, new: false, confirm: false });
    } catch (error) {
      console.error('Error requesting password change:', error);

      // authService.handleError returns { message, code, status }
      const detail =
        error?.message ||
        error?.data?.error?.detail ||
        error?.data?.detail ||
        "Failed to request password change";

      toast.error(typeof detail === "string" ? detail : "Failed to request password change");
    } finally {
      setPasswordSubmitting(false);
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
      project: <FolderKanban size={12} />,
    };
    return icons[type] || <Activity size={12} />;
  };

  /* ─── Skeleton loading layout ─── */
  const skeletonLayout = (
    <>
      <div className="skeleton sk-search" />
      <div className="stats-grid-modern">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="stat-card-modern">
            <div className="skeleton sk-icon" />
            <div className="stat-card-content">
              <div className="skeleton sk-value" />
              <div className="skeleton sk-line w60" />
            </div>
          </div>
        ))}
      </div>
      <div className="skeleton sk-profile" />
      <div className="skeleton sk-section" />
      <div className="skeleton sk-section" />
    </>
  );

  return (
    <div className="profile-page">
      <Topbar title="Profile Settings" onMenuClick={onMenuClick} />

      <div className="profile-container" aria-busy={loading}>
        {loading ? (
          skeletonLayout
        ) : (
          <>
            {/* ─── SEARCH BAR ─── */}
            <motion.div
              className="search-bar-modern"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: EASE }}
            >
              <Search size={16} className="search-icon" />
              <input
                placeholder="Search profile fields..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <AnimatePresence>
                {search && (
                  <motion.button
                    className="search-clear"
                    onClick={() => setSearch('')}
                    aria-label="Clear search"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    whileTap={{ scale: 0.85 }}
                  >
                    <X size={14} />
                  </motion.button>
                )}
              </AnimatePresence>
            </motion.div>

            {/* ─── STATS GRID ─── */}
            <div className="stats-grid-modern">
              {[
                { cls: "purple", icon: <FolderKanban size={18} />, value: <AnimatedNumber value={stats.projects} />, label: "Projects", trend: "up", trendText: "Active" },
                { cls: "emerald", icon: <CheckCircle2 size={18} />, value: <AnimatedNumber value={stats.tasksCompleted} />, label: "Tasks Done", trend: "up", trendText: `${stats.completionRate}%` },
                { cls: "amber", icon: <Clock size={18} />, value: <AnimatedNumber value={stats.tasksInProgress} />, label: "In Progress", trend: "muted", trendText: "Active" },
                { cls: "teal", icon: <TrendingUp size={18} />, value: <AnimatedNumber value={stats.completionRate} suffix="%" />, label: "Completion Rate", trend: "up", trendText: "Good" },
              ].map((s, i) => (
                <motion.div
                  key={s.label}
                  className={`stat-card-modern accent-${s.cls}`}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 + i * 0.06, duration: 0.5, ease: EASE }}
                >
                  <div className={`stat-card-icon ${s.cls}`}>{s.icon}</div>
                  <div className="stat-card-content">
                    <span className="stat-card-value">{s.value}</span>
                    <span className="stat-card-label">{s.label}</span>
                  </div>
                  <div className={`stat-card-trend ${s.trend}`}>
                    {s.trend === "up" && <ArrowUpRight size={14} />}
                    <span>{s.trendText}</span>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* ─── PROFILE HERO CARD ─── */}
            <motion.div
              className="profile-card-modern profile-card-hero"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: EASE, delay: 0.15 }}
            >
              <div
                className="profile-hero-banner"
                style={{
                  background: `linear-gradient(120deg, color-mix(in srgb, ${roleColor} 30%, transparent), color-mix(in srgb, ${roleColor} 8%, transparent) 55%, transparent)`
                }}
              >
                <span className="banner-orb" aria-hidden="true" />
              </div>

              <div className="profile-hero-body">
                <motion.div
                  className="profile-avatar-wrapper"
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3, type: "spring", stiffness: 260, damping: 18 }}
                >
                  <div className="profile-avatar-ring" style={{ background: `linear-gradient(135deg, ${roleColor}, color-mix(in srgb, ${roleColor} 60%, transparent))` }}>
                    <div className="profile-avatar">{initials}</div>
                  </div>
                  <div className="profile-status-dot" style={{ background: roleColor, '--dot-c': roleColor }} />
                </motion.div>

                <div className="profile-info">
                  <h2 className="profile-name" title={form.name}>{form.name}</h2>
                  <div className="profile-badges">
                    <span className="profile-role" style={{ background: `color-mix(in srgb, ${roleColor} 18%, transparent)`, color: roleColor }}>
                      <Shield size={12} /> {user?.role || 'User'}
                    </span>
                    <span className="profile-id">
                      <Gem size={12} /> ID: {user?.id || user?.u_id}
                    </span>
                  </div>
                  <p className="profile-email" title={user?.email}>
                    <Mail size={14} /> {user?.email}
                  </p>
                </div>

                <div className="profile-actions">
                  <AnimatePresence mode="wait" initial={false}>
                    {!editMode ? (
                      <motion.button
                        key="edit"
                        className="btn-primary-modern"
                        onClick={() => setEditMode(true)}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.18 }}
                        whileTap={{ scale: 0.96 }}
                      >
                        <Pencil size={14} /> Edit Profile
                      </motion.button>
                    ) : (
                      <motion.div
                        key="save-group"
                        className="profile-actions-group"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.18 }}
                      >
                        <motion.button
                          className="btn-primary-modern"
                          onClick={handleSave}
                          whileTap={{ scale: 0.96 }}
                        >
                          <Save size={14} /> Save
                        </motion.button>
                        <motion.button
                          className="btn-secondary-modern"
                          onClick={() => setEditMode(false)}
                          aria-label="Cancel editing"
                          whileTap={{ scale: 0.94 }}
                        >
                          <X size={14} />
                        </motion.button>
                      </motion.div>
                    )}
                  </AnimatePresence>
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
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06, duration: 0.4, ease: EASE }}
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
                        <div className="info-field-value" title={String(item.value ?? '')}>
                          {item.value || '—'}
                        </div>
                      )}
                    </motion.div>
                  );
                })}

                {filteredFields.length === 0 && (
                  <div className="info-empty">
                    <Search size={18} />
                    <span>No fields match "{search}"</span>
                  </div>
                )}
              </div>
            </motion.div>

            {/* ─── PASSWORD CARD ─── */}
            <motion.div
              className="profile-card-modern"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: EASE, delay: 0.25 }}
            >
              <div className="section-header-modern">
                <div className="section-icon-modern">
                  <KeyRound size={15} />
                </div>
                <div className="section-content">
                  <h3 className="section-title-modern">Change Password</h3>
                  <p className="section-sub-modern">
                    We'll email you a confirmation link before any change is applied
                  </p>
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
                      autoComplete="current-password"
                      value={passwords.current}
                      onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                    />
                    <button
                      className="password-eye"
                      onClick={() => setShowPw(s => ({ ...s, current: !s.current }))}
                      aria-label={showPw.current ? "Hide current password" : "Show current password"}
                    >
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
                      autoComplete="new-password"
                      value={passwords.new}
                      onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                    />
                    <button
                      className="password-eye"
                      onClick={() => setShowPw(s => ({ ...s, new: !s.new }))}
                      aria-label={showPw.new ? "Hide new password" : "Show new password"}
                    >
                      {showPw.new ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  <AnimatePresence>
                    {strength && (
                      <motion.div
                        className="password-strength"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                      >
                        <div className="strength-track">
                          <div className="strength-fill" style={{ width: strength.width, background: strength.color }} />
                        </div>
                        <span className="strength-label" style={{ color: strength.color }}>{strength.label}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="password-field password-field--full">
                  <label className="password-label">Confirm Password</label>
                  <div className="password-input-wrapper">
                    <Lock size={14} className="password-input-icon" />
                    <input
                      type={showPw.confirm ? "text" : "password"}
                      placeholder="Confirm new password"
                      autoComplete="new-password"
                      value={passwords.confirm}
                      onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                    />
                    <button
                      className="password-eye"
                      onClick={() => setShowPw(s => ({ ...s, confirm: !s.confirm }))}
                      aria-label={showPw.confirm ? "Hide confirm password" : "Show confirm password"}
                    >
                      {showPw.confirm ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  <AnimatePresence>
                    {passwords.confirm && passwords.new && (
                      <motion.p
                        className="password-match"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        style={{
                          color: passwords.new === passwords.confirm ? "var(--accent-emerald)" : "var(--accent-rose)"
                        }}
                      >
                        {passwords.new === passwords.confirm ? (
                          <><CheckCircle2 size={11} /> Passwords match</>
                        ) : (
                          <><AlertCircle size={11} /> Passwords do not match</>
                        )}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>

                <motion.button
                  className="password-update-btn"
                  onClick={handlePasswordChange}
                  disabled={passwordSubmitting}
                  whileHover={{ y: passwordSubmitting ? 0 : -1 }}
                  whileTap={{ scale: passwordSubmitting ? 1 : 0.98 }}
                  style={{
                    opacity: passwordSubmitting ? 0.7 : 1,
                    cursor: passwordSubmitting ? "not-allowed" : "pointer",
                  }}
                >
                  {passwordSubmitting ? (
                    <>
                      <Loader2 size={14} className="spin" /> Sending link…
                    </>
                  ) : (
                    <>
                      <Send size={14} /> Send Confirmation Link
                    </>
                  )}
                </motion.button>
              </div>
            </motion.div>

            {/* ─── ACTIVITY CARD ─── */}
            <motion.div
              className="profile-card-modern"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: EASE, delay: 0.35 }}
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
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.06, duration: 0.4, ease: EASE }}
                  >
                    <div className="activity-dot" style={{ background: roleColor }}>
                      {getActivityIcon(a.type)}
                    </div>
                    <div className="activity-content">
                      <p className="activity-text" title={a.text}>{a.text}</p>
                      <span className="activity-time">{a.time}</span>
                    </div>
                  </motion.div>
                ))}
              </div>

              {activities.length > 4 && (
                <motion.button
                  className="show-more-btn"
                  onClick={() => setShowFullActivity(!showFullActivity)}
                  whileTap={{ scale: 0.98 }}
                >
                  {showFullActivity ? 'Show Less' : `Show All (${activities.length})`}
                  <ChevronDown size={14} className={`chev ${showFullActivity ? 'rot' : ''}`} />
                </motion.button>
              )}
            </motion.div>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmerSweep { 100% { transform: translateX(100%); } }
        @keyframes dotPulse {
          0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--dot-c, transparent) 50%, transparent); }
          70% { box-shadow: 0 0 0 7px color-mix(in srgb, var(--dot-c, transparent) 0%, transparent); }
        }
        @keyframes floatOrb {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(16px, 10px) scale(1.1); }
        }
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }

        .spin { animation: spin 1s linear infinite; }

        /* ─── PAGE LAYOUT ─── */
        .profile-page { min-height: 100vh; background: var(--bg-primary); }

        .profile-container {
          max-width: 950px;
          margin: 0 auto;
          padding: 20px 24px 32px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        /* ─── SKELETON ─── */
        .skeleton {
          position: relative;
          overflow: hidden;
          background: var(--bg-secondary);
          border-radius: 8px;
        }
        .skeleton::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, var(--bg-card), transparent);
          transform: translateX(-100%);
          animation: shimmerSweep 1.5s infinite;
        }
        .sk-search { height: 44px; border-radius: 12px; }
        .sk-icon { width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0; }
        .sk-value { width: 48px; height: 20px; margin-bottom: 8px; }
        .sk-line { height: 10px; }
        .w60 { width: 60%; }
        .sk-profile { height: 330px; border-radius: 16px; }
        .sk-section { height: 240px; border-radius: 16px; }

        /* ─── SEARCH BAR ─── */
        .search-bar-modern {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-radius: 12px;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }
        .search-bar-modern:focus-within {
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 3px var(--accent-glow);
        }
        .search-icon { color: var(--text-muted); flex-shrink: 0; transition: color 0.2s ease; }
        .search-bar-modern:focus-within .search-icon { color: var(--accent-primary); }
        .search-bar-modern input {
          flex: 1;
          border: none;
          outline: none;
          background: transparent;
          color: var(--text-primary);
          font-size: 13px;
        }
        .search-bar-modern input::placeholder { color: var(--text-muted); }
        .search-bar-modern input:focus-visible { outline: none; }

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
          transition: background 0.15s, color 0.15s;
        }
        .search-clear:hover { background: var(--border-default); color: var(--text-primary); }

        /* ─── STATS GRID ─── */
        .stats-grid-modern {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 12px;
        }

        .stat-card-modern {
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          min-width: 0;
          transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1),
                      box-shadow 0.25s ease,
                      border-color 0.25s ease;
        }
        .stat-card-modern::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: var(--sc, var(--accent-primary));
          opacity: 0;
          transform: scaleX(0);
          transform-origin: left;
          transition: transform 0.35s ease, opacity 0.35s ease;
        }
        .stat-card-modern::after {
          content: '';
          position: absolute;
          width: 110px;
          height: 110px;
          right: -35px;
          top: -35px;
          border-radius: 50%;
          background: radial-gradient(circle, var(--ic, transparent) 0%, transparent 70%);
          opacity: 0.08;
          pointer-events: none;
          transition: opacity 0.3s ease, transform 0.3s ease;
        }
        .stat-card-modern:hover {
          transform: translateY(-4px);
          border-color: color-mix(in srgb, var(--sc, var(--accent-primary)) 55%, transparent);
          box-shadow: 0 14px 30px -14px color-mix(in srgb, var(--sc, var(--accent-primary)) 30%, transparent);
        }
        .stat-card-modern:hover::before { opacity: 1; transform: scaleX(1); }
        .stat-card-modern:hover::after { opacity: 0.18; transform: scale(1.15); }

        .accent-purple  { --sc: var(--accent-primary); --ic: var(--accent-primary); }
        .accent-emerald { --sc: var(--accent-emerald); --ic: var(--accent-emerald); }
        .accent-amber   { --sc: var(--accent-amber);   --ic: var(--accent-amber); }
        .accent-teal    { --sc: var(--accent-teal);    --ic: var(--accent-teal); }

        .stat-card-icon {
          width: 34px;
          height: 34px;
          border-radius: 9px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: color-mix(in srgb, var(--ic, var(--accent-primary)) 14%, transparent);
          color: var(--ic, var(--accent-primary));
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ic, var(--accent-primary)) 18%, transparent);
          transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .stat-card-modern:hover .stat-card-icon { transform: scale(1.1) rotate(-5deg); }

        .stat-card-content { flex: 1 1 auto; min-width: 0; }

        .stat-card-value {
          display: block;
          font-size: 19px;
          font-weight: 800;
          color: var(--text-primary);
          line-height: 1.15;
          letter-spacing: -0.4px;
          font-variant-numeric: tabular-nums;
        }
        .stat-card-label {
          display: block;
          font-size: 10px;
          color: var(--text-muted);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.35px;
          line-height: 1.25;
          overflow-wrap: anywhere;
          word-break: break-word;
          margin-top: 1px;
        }
        .stat-card-trend {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 2px;
          font-size: 10px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 20px;
          flex-shrink: 0;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
          margin-left: auto;
          align-self: center;
        }
        .stat-card-trend.up {
          background: color-mix(in srgb, var(--accent-emerald) 14%, transparent);
          color: var(--accent-emerald);
        }
        .stat-card-trend.down {
          background: color-mix(in srgb, var(--accent-rose) 14%, transparent);
          color: var(--accent-rose);
        }
        .stat-card-trend.muted {
          background: var(--bg-secondary);
          color: var(--text-muted);
          font-weight: 600;
        }

        /* ─── PROFILE CARD ─── */
        .profile-card-modern {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
          padding: 24px;
          transition: border-color 0.25s ease, box-shadow 0.25s ease;
          min-width: 0;
          overflow: hidden;
        }
        .profile-card-modern:hover {
          border-color: var(--border-default);
          box-shadow: 0 12px 28px -16px rgba(0, 0, 0, 0.18);
        }
        .profile-card-hero { padding: 0; overflow: hidden; }

        .profile-hero-banner {
          height: 84px;
          width: 100%;
          position: relative;
          overflow: hidden;
        }
        .profile-hero-banner::after {
          content: '';
          position: absolute;
          inset: 0;
          background-image: radial-gradient(rgba(255,255,255,0.10) 1px, transparent 1px);
          background-size: 14px 14px;
          opacity: 0.5;
        }
        .banner-orb {
          position: absolute;
          width: 180px;
          height: 180px;
          right: 30px;
          top: -80px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.16);
          filter: blur(28px);
          pointer-events: none;
          animation: floatOrb 10s ease-in-out infinite;
        }

        .profile-hero-body {
          display: flex;
          align-items: center;
          gap: 18px;
          flex-wrap: wrap;
          padding: 0 24px 22px;
          margin-top: -32px;
          min-width: 0;
        }

        .profile-card-hero .profile-divider { margin: 0 24px 18px; }
        .profile-card-hero .profile-info-grid { padding: 0 24px 24px; }

        .profile-avatar-wrapper {
          position: relative;
          flex-shrink: 0;
          display: inline-block;
        }
        .profile-avatar-ring {
          width: 68px;
          height: 68px;
          border-radius: 50%;
          padding: 3px;
          box-shadow: 0 0 0 4px var(--bg-card);
          transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease;
        }
        .profile-avatar-wrapper:hover .profile-avatar-ring {
          transform: scale(1.06) rotate(3deg);
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
          animation: dotPulse 2.4s ease-in-out infinite;
        }

        .profile-info {
          flex: 1;
          min-width: 0;
          max-width: 100%;
          overflow: hidden;
          padding-top: 30px;
        }
        .profile-name {
          font-size: 20px;
          font-weight: 800;
          color: var(--text-primary);
          margin: 0 0 4px;
          overflow-wrap: anywhere;
          word-break: break-word;
          max-width: 100%;
          letter-spacing: -0.3px;
        }
        .profile-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }
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
          font-variant-numeric: tabular-nums;
        }
        .profile-email {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: var(--text-secondary);
          margin: 0;
          overflow-wrap: anywhere;
          word-break: break-word;
          max-width: 100%;
        }

        .profile-actions { display: flex; gap: 8px; flex-shrink: 0; padding-top: 30px; }
        .profile-actions-group { display: flex; gap: 8px; }

        .btn-primary-modern {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border: none;
          border-radius: 8px;
          background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 4px 14px -6px var(--accent-primary);
          transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
        }
        .btn-primary-modern:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 22px -8px var(--accent-primary);
          filter: brightness(1.05);
        }
        .btn-primary-modern:active { transform: scale(0.97); }

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
          transition: border-color 0.15s, color 0.15s, transform 0.15s;
        }
        .btn-secondary-modern:hover { border-color: var(--accent-primary); color: var(--accent-primary); }
        .btn-secondary-modern:active { transform: scale(0.94); }

        .profile-divider { height: 1px; background: var(--border-subtle); }

        .profile-info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          min-width: 0;
        }

        .info-field {
          padding: 12px 14px;
          border-radius: 10px;
          background: var(--bg-secondary);
          transition: transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
          min-width: 0;
          overflow: hidden;
        }
        .info-field:hover {
          background: var(--bg-hover);
          transform: translateY(-2px);
          box-shadow: 0 8px 16px -10px rgba(0, 0, 0, 0.2);
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
          transition: color 0.2s ease;
        }
        .info-field-label svg { transition: transform 0.2s ease; }
        .info-field:hover .info-field-label { color: var(--accent-primary); }
        .info-field:hover .info-field-label svg { transform: scale(1.2); }

        .info-field-value {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
          overflow-wrap: anywhere;
          word-break: break-word;
          max-width: 100%;
          min-width: 0;
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
          transition: border-color 0.15s, box-shadow 0.15s;
          margin-top: 2px;
          box-sizing: border-box;
        }
        .info-field-input:focus {
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 3px var(--accent-glow);
        }
        .info-field-input:focus-visible { outline: none; }

        .info-empty {
          grid-column: 1 / -1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 26px;
          border: 1px dashed var(--border-default);
          border-radius: 12px;
          color: var(--text-muted);
          font-size: 13px;
          animation: popIn 0.3s ease-out;
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
        .section-content { flex: 1; min-width: 0; }
        .section-title-modern {
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0 0 2px;
        }
        .section-sub-modern { font-size: 12px; color: var(--text-muted); margin: 0; }

        .activity-badge {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          padding: 3px 12px;
          border-radius: 20px;
          flex-shrink: 0;
          font-variant-numeric: tabular-nums;
        }

        /* ─── PASSWORD ─── */
        .password-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px 16px;
        }
        .password-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
        .password-field--full { grid-column: 1 / -1; }
        .password-update-btn { grid-column: 1 / -1; }
        .password-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }

        .password-input-wrapper {
          display: flex;
          align-items: center;
          background: var(--bg-secondary);
          border: 1px solid var(--border-default);
          border-radius: 10px;
          padding: 0 12px;
          transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
          overflow: hidden;
          min-width: 0;
        }
        .password-input-wrapper:focus-within {
          border-color: var(--accent-primary);
          background: var(--bg-card);
          box-shadow: 0 0 0 3px var(--accent-glow);
        }
        .password-input-icon { color: var(--text-muted); flex-shrink: 0; margin-right: 8px; }
        .password-input-wrapper input {
          flex: 1;
          border: none;
          outline: none;
          background: transparent;
          padding: 10px 0;
          font-size: 13px;
          color: var(--text-primary);
          min-width: 0;
        }
        .password-input-wrapper input:focus-visible { outline: none; }

        .password-eye {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          padding: 4px;
          margin-left: 4px;
          border-radius: 6px;
          transition: color 0.15s, transform 0.15s, background 0.15s;
        }
        .password-eye:hover {
          color: var(--accent-primary);
          transform: scale(1.12);
          background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
        }

        .password-strength {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 4px;
        }
        .strength-track {
          flex: 1;
          height: 5px;
          border-radius: 4px;
          background: var(--border-subtle);
          overflow: hidden;
        }
        .strength-fill {
          height: 100%;
          border-radius: 4px;
          position: relative;
          overflow: hidden;
          transition: width 0.4s cubic-bezier(0.22, 1, 0.36, 1), background 0.3s ease;
        }
        .strength-fill::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
          transform: translateX(-100%);
          animation: shimmerSweep 1.6s infinite;
        }
        .strength-label {
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
          animation: popIn 0.25s ease-out;
        }

        .password-match {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          font-weight: 600;
          margin: 4px 0 0;
        }

        .password-update-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 10px 20px;
          border: none;
          border-radius: 10px;
          background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
          color: #fff;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 4px 14px -6px var(--accent-primary);
          transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
          margin-top: 4px;
          width: fit-content;
        }
        .password-update-btn:hover:not(:disabled) {
          box-shadow: 0 8px 22px -8px var(--accent-primary);
          filter: brightness(1.05);
        }
        .password-update-btn:active:not(:disabled) { transform: scale(0.98); }
        .password-update-btn:disabled { cursor: not-allowed; }

        /* ─── ACTIVITY ─── */
        .activity-timeline {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-width: 0;
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
          min-width: 0;
          max-width: 100%;
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
          transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .activity-item:hover .activity-dot { transform: scale(1.12); }

        .activity-content {
          background: var(--bg-secondary);
          border: 1px solid transparent;
          padding: 10px 14px;
          border-radius: 10px;
          flex: 1;
          min-width: 0;
          max-width: 100%;
          overflow: hidden;
          transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
        }
        .activity-item:hover .activity-content {
          background: var(--bg-card);
          border-color: var(--border-subtle);
          transform: translateX(3px);
          box-shadow: 0 6px 14px -10px rgba(0, 0, 0, 0.18);
        }

        .activity-text {
          margin: 0 0 2px;
          font-size: 13px;
          color: var(--text-primary);
          overflow-wrap: anywhere;
          word-break: break-word;
          max-width: 100%;
          min-width: 0;
          font-weight: 500;
        }
        .activity-time {
          font-size: 11px;
          color: var(--text-muted);
          overflow-wrap: anywhere;
          word-break: break-word;
          font-variant-numeric: tabular-nums;
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
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: border-color 0.15s, color 0.15s, background 0.15s;
        }
        .show-more-btn:hover {
          border-color: var(--accent-primary);
          color: var(--accent-primary);
          background: color-mix(in srgb, var(--accent-primary) 6%, transparent);
        }
        .show-more-btn .chev { transition: transform 0.25s ease; }
        .show-more-btn .chev.rot { transform: rotate(180deg); }

        /* ─── RESPONSIVE ─── */
        @media (max-width: 1024px) {
          .stats-grid-modern { grid-template-columns: repeat(2, 1fr); }
        }

        @media (max-width: 768px) {
          .profile-container { padding: 16px; }
          .profile-hero-body {
            flex-direction: column;
            align-items: center;
            text-align: center;
            margin-top: -40px;
          }
          .profile-actions { width: 100%; justify-content: center; padding-top: 8px; }
          .profile-info { text-align: center; padding-top: 8px; }
          .profile-badges { justify-content: center; }
          .profile-email { justify-content: center; }
          .profile-info-grid { grid-template-columns: 1fr; }
          .password-grid { grid-template-columns: 1fr; }
          .stats-grid-modern { grid-template-columns: 1fr 1fr; }
          .stat-card-modern { padding: 14px; }
          .stat-card-value { font-size: 18px; }
          .section-header-modern { flex-direction: column; align-items: flex-start; }
          .activity-badge { margin-left: 0; }
          .sk-profile { height: 380px; }
        }

        @media (max-width: 480px) {
          .profile-container { padding: 12px; }
          .profile-card-modern { padding: 16px; }
          .profile-card-hero { padding: 0; }
          .stats-grid-modern { grid-template-columns: 1fr; }
          .stat-card-modern { padding: 12px 14px; }
          .profile-avatar-ring { width: 56px; height: 56px; }
          .profile-avatar { font-size: 17px; }
          .profile-name { font-size: 17px; }
          .profile-actions { flex-wrap: wrap; }
          .btn-primary-modern { padding: 6px 14px; font-size: 12px; }
          .password-update-btn { padding: 8px 16px; font-size: 13px; width: 100%; }
        }

        /* ─── ACCESSIBILITY ─── */
        .search-clear:focus-visible,
        .password-eye:focus-visible,
        .btn-primary-modern:focus-visible,
        .btn-secondary-modern:focus-visible,
        .show-more-btn:focus-visible,
        .password-update-btn:focus-visible {
          outline: 2px solid var(--accent-primary);
          outline-offset: 2px;
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  );
}