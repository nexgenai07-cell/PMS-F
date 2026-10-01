// components/supervisor/SupervisorDashboard.jsx
import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import toast from "react-hot-toast";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  CartesianGrid
} from "recharts";

import {
  FolderKanban,
  Users,
  CheckCircle2,
  Activity,
  RefreshCw,
  TrendingUp,
  Award,
  UserCheck,
  Target,
  Clock,
  BarChart3,
  PieChart as PieChartIcon,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Zap,
  Timer,
  Sparkles,
  CalendarDays,
  Inbox,
  ArrowRight
} from "lucide-react";

import Topbar from "../shared/Topbar";
import {
  PriorityBadge,
  StatusBadge,
  ProgressRing
} from "../shared/UIComponents";
import { getGreeting } from "../../utils/greeting";

import projectService from "../../services/projectService";
import taskService from "../../services/taskService";
import teamService from "../../services/teamService";
import userService from "../../services/userService";

/* ─────────── Shared helpers (kept in sync with Project pages) ─────────── */
function computeTaskProgress(task) {
  // Trust the stored value first — even 0 is legitimate.
  if (task?.progress !== undefined && task?.progress !== null) {
    const raw = Number(task.progress);
    if (Number.isFinite(raw)) return raw;
  }
  // Fallback only when the backend doesn't send progress at all.
  const status = (task?.status || '').toLowerCase();
  if (status === 'done' || status === 'completed') return 100;
  if (status === 'review') return 75;
  if (status === 'in_progress' || status === 'in-progress') return 50;
  return 0;
}

// Average of all task progress values for a given project
function computeProjectProgress(projectId, allTasks) {
  const projectTasks = allTasks.filter(t => {
    const taskProjectId = t.p_id || t.p || t.project || t.project_id;
    return Number(taskProjectId) === Number(projectId);
  });
  if (projectTasks.length === 0) return 0;
  const total = projectTasks.reduce((sum, t) => sum + computeTaskProgress(t), 0);
  return Math.round(total / projectTasks.length);
}

const getStatusColor = (status) => {
  const colors = {
    active: "var(--accent-primary)",
    "in-progress": "var(--accent-primary)",
    "in_progress": "var(--accent-primary)",
    todo: "var(--text-muted)",
    pending: "var(--text-muted)",
    review: "var(--accent-amber)",
    done: "var(--accent-emerald)",
    completed: "var(--accent-emerald)",
    close: "var(--accent-emerald)",
    "on-hold": "var(--accent-amber)",
    "on_hold": "var(--accent-amber)",
    cancelled: "var(--accent-rose)",
    planning: "var(--text-muted)"
  };
  return colors[status?.toLowerCase()] || "var(--accent-primary)";
};

const getPriorityColor = (priority) => {
  const colors = {
    low: "var(--accent-emerald)",
    medium: "var(--accent-amber)",
    high: "var(--accent-rose)",
    critical: "var(--accent-secondary)"
  };
  return colors[priority?.toLowerCase()] || "var(--accent-primary)";
};

const isDone = (t) => t.status === "done" || t.status === "completed" || t.status === "close";
const isInProgress = (t) => t.status === "in-progress" || t.status === "in_progress";

const daysAgo = (n, from = new Date()) => {
  const d = new Date(from);
  d.setDate(d.getDate() - n);
  return d;
};

const computeTrend = (current, previous) => {
  if (previous === 0 && current === 0) return { dir: "flat", percent: 0 };
  if (previous === 0) return { dir: "up", percent: 100 };
  const change = Math.round(((current - previous) / previous) * 100);
  if (change === 0) return { dir: "flat", percent: 0 };
  return { dir: change > 0 ? "up" : "down", percent: Math.abs(change) };
};

const dateOf = (item) => new Date(item.created_at || item.start_date || item.updated_at || Date.now());

const buildTrendData = (allTasks, range) => {
  const now = new Date();

  if (range === "week") {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const day = daysAgo(i, now);
      const dayTasks = allTasks.filter(t => dateOf(t).toDateString() === day.toDateString());
      out.push({
        label: day.toLocaleDateString(undefined, { weekday: "short" }),
        created: dayTasks.length,
        completed: dayTasks.filter(isDone).length
      });
    }
    return out;
  }

  if (range === "year") {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const currentMonth = now.getMonth();
    const out = [];
    for (let i = 11; i >= 0; i--) {
      const idx = (currentMonth - i + 12) % 12;
      const monthTasks = allTasks.filter(t => dateOf(t).getMonth() === idx);
      out.push({
        label: months[idx],
        created: monthTasks.length,
        completed: monthTasks.filter(isDone).length
      });
    }
    return out;
  }

  const out = [];
  for (let i = 3; i >= 0; i--) {
    const end = daysAgo(i * 7, now);
    const start = daysAgo(i * 7 + 6, now);
    const weekTasks = allTasks.filter(t => {
      const d = dateOf(t);
      return d >= start && d <= end;
    });
    out.push({
      label: `Wk ${4 - i}`,
      created: weekTasks.length,
      completed: weekTasks.filter(isDone).length
    });
  }
  return out;
};

/* ─────────── Pure UI components (no logic changes) ─────────── */

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

const HeroRing = ({ value }) => {
  const R = 42;
  const C = 2 * Math.PI * R;
  const offset = C - (Math.min(Number(value) || 0, 100) / 100) * C;
  return (
    <div className="hero-ring" role="img" aria-label={`${value}% average progress`}>
      <svg viewBox="0 0 100 100" className="hero-ring-svg">
        <circle className="hero-ring-track" cx="50" cy="50" r={R} />
        <circle
          className="hero-ring-fill"
          cx="50"
          cy="50"
          r={R}
          strokeDasharray={C}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div className="hero-ring-label">
        <span className="hero-ring-value">{value}%</span>
        <span className="hero-ring-text">Progress</span>
      </div>
    </div>
  );
};

const EmptyState = ({ icon: Icon = Inbox, message }) => (
  <div className="chart-empty">
    <div className="empty-icon"><Icon size={22} /></div>
    <p>{message}</p>
  </div>
);

const CustomTooltip = ({ active, payload, label }) =>
  active && payload?.length ? (
    <div className="chart-tooltip">
      <p className="chart-tooltip-label">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="chart-tooltip-item">
          <span className="tt-dot" style={{ background: p.color || p.fill }} />
          {p.name || p.dataKey}: <b>{p.value}</b>
        </p>
      ))}
    </div>
  ) : null;

const TrendPill = ({ trend }) => {
  if (trend.dir === "flat") {
    return (
      <div className="stat-card-trend flat">
        <Minus size={14} />
        <span>Flat</span>
      </div>
    );
  }
  const Icon = trend.dir === "up" ? ArrowUpRight : ArrowDownRight;
  return (
    <div className={`stat-card-trend ${trend.dir}`}>
      <Icon size={14} />
      <span>{trend.percent}%</span>
    </div>
  );
};

/* ─────────── Styles ─────────── */
const dashboardCss = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(18px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes shimmerSweep { 100% { transform: translateX(100%); } }
  @keyframes wave {
    0%, 60%, 100% { transform: rotate(0deg); }
    10%, 30% { transform: rotate(14deg); }
    20% { transform: rotate(-8deg); }
    40% { transform: rotate(-4deg); }
    50% { transform: rotate(10deg); }
  }
  @keyframes pulseGlow {
    0%, 100% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.45); }
    50% { box-shadow: 0 0 0 6px rgba(52, 211, 153, 0); }
  }
  @keyframes floatOrb {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(14px, -12px) scale(1.06); }
  }
  @keyframes refreshSlide {
    0% { transform: translateX(-120%); }
    100% { transform: translateX(340%); }
  }
  @keyframes ringIn { from { stroke-dashoffset: 263.9; } }
  @keyframes sparkPulse {
    0%, 100% { transform: scale(1) rotate(0deg); }
    50% { transform: scale(1.18) rotate(12deg); }
  }
  @keyframes popIn {
    from { opacity: 0; transform: scale(0.94); }
    to { opacity: 1; transform: scale(1); }
  }

  .spin { animation: spin 1s linear infinite; }

  .anim {
    opacity: 0;
    animation: fadeUp 0.55s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    animation-delay: var(--d, 0ms);
  }

  .refresh-progress {
    position: fixed;
    top: 0; left: 0; right: 0;
    height: 3px;
    z-index: 999;
    overflow: hidden;
    pointer-events: none;
  }
  .refresh-progress::after {
    content: '';
    position: absolute;
    top: 0; left: 0;
    height: 100%;
    width: 38%;
    border-radius: 999px;
    background: linear-gradient(90deg, transparent, var(--accent-primary), transparent);
    animation: refreshSlide 1s ease-in-out infinite;
  }

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
  .sk-hero { height: 128px; border-radius: 18px; margin-bottom: 18px; }
  .sk-icon { width: 46px; height: 46px; border-radius: 13px; flex-shrink: 0; }
  .sk-value { width: 52px; height: 22px; margin-bottom: 8px; }
  .sk-line { height: 10px; }
  .w60 { width: 60%; }
  .sk-mini { height: 48px; border-radius: 12px; }
  .sk-chart { height: 264px; border-radius: 16px; margin-bottom: 20px; }
  .sk-bottom { height: 320px; border-radius: 16px; }

  .greeting-text { display: flex; align-items: center; gap: 8px; }
  .greeting-wave {
    display: inline-block;
    font-size: 20px;
    transform-origin: 70% 70%;
    animation: wave 2.6s ease-in-out infinite;
  }
  .refresh-btn { display: flex; align-items: center; gap: 6px; }

  .dashboard-hero {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    flex-wrap: wrap;
    padding: 26px 30px;
    border-radius: 18px;
    background: linear-gradient(120deg, var(--accent-primary), var(--accent-secondary));
    color: #fff;
    margin-bottom: 18px;
    box-shadow: 0 16px 40px -16px rgba(0, 0, 0, 0.35);
  }
  .hero-orb {
    position: absolute;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.13);
    filter: blur(2px);
    pointer-events: none;
    animation: floatOrb 9s ease-in-out infinite;
  }
  .hero-orb-1 { width: 190px; height: 190px; right: -50px; top: -70px; }
  .hero-orb-2 { width: 120px; height: 120px; right: 140px; bottom: -70px; animation-delay: -4.5s; }
  .hero-content { position: relative; z-index: 1; min-width: 0; }
  .hero-date {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    background: rgba(255, 255, 255, 0.15);
    padding: 5px 12px;
    border-radius: 999px;
    backdrop-filter: blur(4px);
  }
  .hero-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 12px 0 5px;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.3px;
  }
  .hero-spark { animation: sparkPulse 3s ease-in-out infinite; flex-shrink: 0; }
  .hero-subtitle { margin: 0; font-size: 13px; opacity: 0.9; }
  .hero-subtitle b { font-weight: 700; }
  .hero-ring { position: relative; width: 96px; height: 96px; flex-shrink: 0; z-index: 1; }
  .hero-ring-svg { width: 100%; height: 100%; display: block; }
  .hero-ring-track { fill: none; stroke: rgba(255, 255, 255, 0.25); stroke-width: 8; }
  .hero-ring-fill {
    fill: none;
    stroke: #fff;
    stroke-width: 8;
    stroke-linecap: round;
    filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.4));
    animation: ringIn 1.2s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .hero-ring-label {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .hero-ring-value { font-size: 20px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
  .hero-ring-text { font-size: 9px; text-transform: uppercase; letter-spacing: 1.2px; opacity: 0.85; margin-top: 3px; }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 14px;
  }

  .stat-card-modern {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 20px;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: 16px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.25s ease, border-color 0.25s ease;
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
    width: 150px;
    height: 150px;
    right: -45px;
    top: -45px;
    border-radius: 50%;
    background: radial-gradient(circle, var(--ic, transparent) 0%, transparent 70%);
    opacity: 0.1;
    pointer-events: none;
    transition: opacity 0.3s ease, transform 0.3s ease;
  }
  .stat-card-modern:hover {
    transform: translateY(-4px);
    border-color: var(--sc, var(--border-default));
    box-shadow: 0 14px 30px -12px var(--sc-a, rgba(0, 0, 0, 0.2));
  }
  .stat-card-modern:hover::before { opacity: 1; transform: scaleX(1); }
  .stat-card-modern:hover::after { opacity: 0.22; transform: scale(1.15); }

  .accent-purple  { --sc: #818cf8; --ic: #818cf8; --sc-a: rgba(129, 140, 248, 0.28); }
  .accent-emerald { --sc: #34d399; --ic: #34d399; --sc-a: rgba(52, 211, 153, 0.28); }
  .accent-amber   { --sc: #f59e0b; --ic: #f59e0b; --sc-a: rgba(245, 158, 11, 0.28); }
  .accent-teal    { --sc: #2dd4bf; --ic: #2dd4bf; --sc-a: rgba(45, 212, 191, 0.28); }

  .stat-card-icon {
    width: 46px;
    height: 46px;
    border-radius: 13px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .stat-card-modern:hover .stat-card-icon { transform: scale(1.1) rotate(-5deg); }

  .stat-card-icon.purple  { background: linear-gradient(135deg, rgba(129,140,248,0.18), rgba(129,140,248,0.06)); color: #818cf8; box-shadow: inset 0 0 0 1px rgba(129,140,248,0.18); }
  .stat-card-icon.emerald { background: linear-gradient(135deg, rgba(52,211,153,0.18), rgba(52,211,153,0.06)); color: #34d399; box-shadow: inset 0 0 0 1px rgba(52,211,153,0.18); }
  .stat-card-icon.amber   { background: linear-gradient(135deg, rgba(245,158,11,0.18), rgba(245,158,11,0.06)); color: #f59e0b; box-shadow: inset 0 0 0 1px rgba(245,158,11,0.18); }
  .stat-card-icon.teal    { background: linear-gradient(135deg, rgba(45,212,191,0.18), rgba(45,212,191,0.06)); color: #2dd4bf; box-shadow: inset 0 0 0 1px rgba(45,212,191,0.18); }

  .stat-card-content { flex: 1; min-width: 0; }

  .stat-card-value {
    display: block;
    font-size: 26px;
    font-weight: 800;
    color: var(--text-primary);
    line-height: 1.2;
    letter-spacing: -0.5px;
    font-variant-numeric: tabular-nums;
  }
  .stat-card-label {
    font-size: 11px;
    color: var(--text-muted);
    font-weight: 600;
    letter-spacing: 0.4px;
    text-transform: uppercase;
  }

  .stat-card-trend {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    font-weight: 700;
    padding: 4px 9px;
    border-radius: 999px;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
  .stat-card-trend.up   { background: rgba(52, 211, 153, 0.12); color: #34d399; }
  .stat-card-trend.down { background: rgba(248, 113, 113, 0.12); color: #f87171; }
  .stat-card-trend.flat { background: rgba(148, 163, 184, 0.12); color: #94a3b8; }

  .stats-grid-secondary {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 12px;
    margin-bottom: 22px;
  }
  .stat-card-mini {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
  }
  .stat-card-mini:hover {
    transform: translateY(-2px);
    border-color: var(--border-default);
    background: var(--bg-card);
    box-shadow: 0 8px 20px -12px rgba(0, 0, 0, 0.18);
  }
  .stat-mini-icon { color: var(--text-muted); flex-shrink: 0; transition: color 0.2s ease, transform 0.2s ease; }
  .stat-card-mini:hover .stat-mini-icon { color: var(--accent-primary); transform: scale(1.12); }
  .stat-mini-value {
    display: block;
    font-size: 16px;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }
  .stat-mini-label { font-size: 11px; color: var(--text-muted); }

  .charts-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 20px;
  }
  .chart-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: 16px;
    padding: 20px;
    transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.25s ease, box-shadow 0.25s ease;
  }
  .chart-card:hover {
    border-color: var(--border-default);
    transform: translateY(-2px);
    box-shadow: 0 12px 28px -14px rgba(0, 0, 0, 0.18);
  }
  .chart-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    gap: 10px;
    flex-wrap: wrap;
  }
  .chart-card-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 700;
    color: var(--text-primary);
  }
  .chart-card-title svg { color: var(--accent-primary); flex-shrink: 0; }
  .chart-card-actions {
    display: flex;
    gap: 4px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-subtle);
    padding: 3px;
    border-radius: 10px;
  }
  .time-btn {
    padding: 5px 14px;
    border: none;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    background: transparent;
    cursor: pointer;
    transition: color 0.2s ease, background 0.2s ease, transform 0.12s ease, box-shadow 0.2s ease;
  }
  .time-btn:hover { color: var(--text-primary); }
  .time-btn:active { transform: scale(0.94); }
  .time-btn.active {
    background: var(--accent-primary);
    color: #fff;
    box-shadow: 0 2px 8px -2px var(--accent-primary);
  }
  .chart-badge {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    background: var(--bg-secondary);
    border: 1px solid var(--border-subtle);
    padding: 4px 10px;
    border-radius: 999px;
    flex-shrink: 0;
  }
  .chart-container { width: 100%; height: 210px; }

  .chart-empty {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-size: 13px;
    color: var(--text-muted);
    animation: fadeIn 0.4s ease;
  }
  .empty-icon {
    width: 46px;
    height: 46px;
    border-radius: 13px;
    display: grid;
    place-items: center;
    background: var(--bg-secondary);
    border: 1px dashed var(--border-default);
    color: var(--text-muted);
  }

  .pie-chart-wrapper { display: flex; align-items: center; gap: 20px; }
  .pie-chart-container { position: relative; width: 180px; height: 180px; flex-shrink: 0; }
  .pie-center-label {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }
  .pie-center-value {
    font-size: 24px;
    font-weight: 900;
    color: var(--text-primary);
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .pie-center-text {
    font-size: 10px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.6px;
    margin-top: 2px;
  }
  .pie-legend { flex: 1; display: flex; flex-direction: column; gap: 6px; min-width: 100px; }
  .pie-legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.18s ease, transform 0.18s ease;
    border: none;
    background: transparent;
    width: 100%;
    text-align: left;
    font-family: inherit;
  }
  .pie-legend-item:hover,
  .pie-legend-item:focus-visible { background: var(--bg-secondary); transform: translateX(3px); outline: none; }
  .pie-legend-dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
  .pie-legend-name { flex: 1; font-size: 12px; color: var(--text-secondary); }
  .pie-legend-value { font-size: 12px; font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }
  .pie-legend-empty { font-size: 12px; color: var(--text-muted); padding: 8px 0; }

  .chart-tooltip {
    background: var(--bg-card);
    border: 1px solid var(--border-default);
    border-radius: 12px;
    padding: 10px 14px;
    box-shadow: 0 14px 34px -10px rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(8px);
    animation: popIn 0.18s ease-out;
  }
  .chart-tooltip-label {
    font-weight: 700;
    font-size: 13px;
    color: var(--text-primary);
    margin-bottom: 5px;
  }
  .chart-tooltip-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-secondary);
    margin: 3px 0;
    font-variant-numeric: tabular-nums;
  }
  .tt-dot { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }

  .dashboard-bottom { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

  .health-card, .activity-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: 16px;
    padding: 20px;
  }
  .health-card-header, .activity-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .health-card-title, .activity-card-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 700;
    color: var(--text-primary);
  }
  .health-card-title svg, .activity-card-title svg { color: var(--accent-primary); }

  .view-all-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    background: none;
    border: none;
    cursor: pointer;
    transition: color 0.2s ease;
  }
  .view-all-btn svg { transition: transform 0.2s ease; }
  .view-all-btn:hover { color: var(--accent-primary); }
  .view-all-btn:hover svg { transform: translateX(3px); }

  .health-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 320px;
    overflow-y: auto;
    padding-right: 4px;
    scrollbar-width: thin;
    scrollbar-color: var(--border-default) transparent;
  }
  .health-list::-webkit-scrollbar, .activity-list::-webkit-scrollbar { width: 5px; }
  .health-list::-webkit-scrollbar-thumb, .activity-list::-webkit-scrollbar-thumb {
    background: var(--border-default);
    border-radius: 999px;
  }
  .health-list::-webkit-scrollbar-track, .activity-list::-webkit-scrollbar-track { background: transparent; }

  .health-item {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 11px 14px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    cursor: pointer;
    width: 100%;
    text-align: left;
    font-family: inherit;
    color: inherit;
    transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
  }
  .health-item::before {
    content: '';
    position: absolute;
    left: 0;
    top: 20%;
    bottom: 20%;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: var(--hc, var(--accent-primary));
    opacity: 0.6;
    transition: opacity 0.2s ease, top 0.2s ease, bottom 0.2s ease;
  }
  .health-item:hover, .health-item:focus-visible {
    transform: translateY(-2px);
    border-color: var(--hc, var(--accent-primary));
    background: var(--bg-card);
    box-shadow: 0 10px 24px -12px rgba(0, 0, 0, 0.22);
    outline: none;
  }
  .health-item:hover::before, .health-item:focus-visible::before { opacity: 1; top: 12%; bottom: 12%; }

  .health-progress { position: relative; width: 44px; height: 44px; flex-shrink: 0; }
  .health-progress-text {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .health-info { flex: 1; min-width: 0; }
  .health-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .health-sub { font-size: 11px; color: var(--text-muted); margin: 2px 0 0; }
  .health-badges { display: flex; gap: 6px; flex-shrink: 0; }
  .health-empty { text-align: center; padding: 30px 0; color: var(--text-muted); font-size: 13px; }

  .activity-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--accent-emerald);
    background: rgba(52, 211, 153, 0.1);
    border: 1px solid rgba(52, 211, 153, 0.25);
    padding: 4px 10px;
    border-radius: 999px;
  }
  .live-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent-emerald);
    animation: pulseGlow 1.8s ease-in-out infinite;
  }
  .activity-list {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 320px;
    overflow-y: auto;
    padding-right: 4px;
    scrollbar-width: thin;
    scrollbar-color: var(--border-default) transparent;
  }
  .activity-list::before {
    content: '';
    position: absolute;
    left: 21px;
    top: 14px;
    bottom: 14px;
    width: 2px;
    background: var(--border-subtle);
    border-radius: 999px;
  }
  .activity-item {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 10px 14px;
    background: var(--bg-secondary);
    border-radius: 12px;
    border: 1px solid var(--border-subtle);
    transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
  }
  .activity-item:hover { background: var(--bg-card); border-color: var(--border-default); transform: translateX(3px); }
  .activity-dot {
    position: relative;
    z-index: 1;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    margin-top: 6px;
    box-shadow: 0 0 0 3px var(--bg-secondary);
    transition: box-shadow 0.2s ease;
  }
  .activity-item:hover .activity-dot { box-shadow: 0 0 0 3px var(--bg-card), 0 0 0 5px rgba(0, 0, 0, 0.06); }
  .activity-content { flex: 1; min-width: 0; }
  .activity-text {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .activity-meta { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
  .activity-status { display: inline-flex; }
  .activity-time { font-size: 11px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
  .activity-empty { text-align: center; padding: 30px 0; color: var(--text-muted); font-size: 13px; }

  @media (max-width: 1200px) {
    .stats-grid-secondary { grid-template-columns: repeat(3, 1fr); }
  }
  @media (max-width: 1024px) {
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
    .charts-row, .dashboard-bottom { grid-template-columns: 1fr; }
    .dashboard-hero { padding: 22px 24px; }
  }
  @media (max-width: 640px) {
    .stats-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
    .stats-grid-secondary { grid-template-columns: repeat(2, 1fr); gap: 10px; }
    .stat-card-modern { padding: 16px; }
    .stat-card-value { font-size: 21px; }
    .hero-title { font-size: 18px; }
    .pie-chart-wrapper { flex-direction: column; }
    .pie-chart-container { margin: 0 auto; }
    .pie-legend { width: 100%; }
    .health-badges { flex-direction: column; align-items: flex-end; }
  }

  .time-btn:focus-visible,
  .health-item:focus-visible,
  .pie-legend-item:focus-visible,
  .view-all-btn:focus-visible,
  .stat-card-mini:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
    .anim { opacity: 1; }
  }
`;

export default function SupervisorDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { onMenuClick } = useOutletContext();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [users, setUsers] = useState([]);
  const [activeIndex, setActiveIndex] = useState(null);
  const [timeRange, setTimeRange] = useState("month");
  const [projectStatsMap, setProjectStatsMap] = useState({});

  const [stats, setStats] = useState({
    totalProjects: 0,
    activeProjects: 0,
    totalTasks: 0,
    doneTasks: 0,
    completionPercent: 0,   // now = weighted avgProgress across all tasks
    totalMembers: 0,
    totalLeads: 0,
    inProgressTasks: 0,
    onTimeRate: 0,
    avgCompletionDays: 0
  });

  const [trends, setTrends] = useState({
    projects: { dir: "flat", percent: 0 },
    doneTasks: { dir: "flat", percent: 0 },
    inProgressTasks: { dir: "flat", percent: 0 },
    completionPercent: { dir: "flat", percent: 0 }
  });

  const [statusData, setStatusData] = useState([]);
  const [priorityData, setPriorityData] = useState([]);
  const [teamProductivity, setTeamProductivity] = useState([]);
  const [projectHealth, setProjectHealth] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const taskTrendData = useMemo(() => buildTrendData(tasks, timeRange), [tasks, timeRange]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      const [projectsData, tasksData, membersData, usersData] = await Promise.all([
        projectService.getProjects(),
        taskService.getTasks(),
        teamService.getTeamMembers(),
        userService.getUsers(),
      ]);

      const allProjects = projectsData?.data || projectsData || [];
      const allTasks = tasksData?.data || tasksData || [];
      const allMembers = membersData?.data || membersData || [];
      const allUsers = usersData?.data || usersData || [];

      const currentUserId = Number(user?.id || user?.u_id);
      const userName = (user?.u_name || '').toLowerCase().trim();

      const userTeamMember = allMembers.find(m =>
        (m.name || '').toLowerCase().trim() === userName
      );
      const teamMemberId = userTeamMember ? Number(userTeamMember.id) : null;

      console.log('👤 Current user:', userName, 'TeamMember ID:', teamMemberId);

      // Projects created by this user
      const createdProjects = allProjects.filter(p =>
        Number(p.created_by) === currentUserId
      );
      const createdProjectIds = createdProjects.map(p => Number(p.p_id || p.id));

      // Projects where this user is assigned to tasks
      const assignedProjectIds = new Set();
      allTasks.forEach(t => {
        const assignTo = Number(t.assign_to || t.assignedTo);
        if (assignTo === teamMemberId) {
          assignedProjectIds.add(Number(t.p_id || t.p));
        }
      });
      allTasks.forEach(t => {
        const assigneeName = (t.assign_to_name || '').toLowerCase().trim();
        if (assigneeName === userName) {
          assignedProjectIds.add(Number(t.p_id || t.p));
        }
      });

      const allProjectIds = [...new Set([...createdProjectIds, ...assignedProjectIds])];

      const userProjects = allProjects.filter(p =>
        allProjectIds.includes(Number(p.p_id || p.id))
      );
      const userTasks = allTasks.filter(t =>
        allProjectIds.includes(Number(t.p_id || t.p))
      );

      console.log('📊 Projects found:', userProjects.length);
      console.log('📊 Tasks found:', userTasks.length);

      setProjects(userProjects);
      setTasks(userTasks);
      setTeamMembers(allMembers);
      setUsers(allUsers);

      // ─── Aggregate stats from each project's /stats endpoint ───
      let totalTasks = 0;
      let doneTasks = 0;
      let inProgressTasks = 0;
      let totalOnTime = 0;
      let totalCompletedTasks = 0;
      let totalProgressWeighted = 0;   // sum of (avgProgress × taskCount)
      let totalTaskCountForAvg = 0;    // denominator for weighted average
      const statsMap = {};

      for (const project of userProjects) {
        const projectId = project.p_id || project.id;
        try {
          const statsResponse = await projectService.getProjectStats(projectId);
          const s = statsResponse?.data || {};
          statsMap[projectId] = s;

          const projectTotalTasks = s.totalTasks || 0;
          totalTasks += projectTotalTasks;
          doneTasks += s.completedTasks || 0;
          inProgressTasks += s.inProgressTasks || 0;
          totalOnTime += s.onTimeRate || 0;
          totalCompletedTasks += s.completedTasks || 0;

          // Weighted average: bigger projects pull the average more.
          totalProgressWeighted += (Number(s.avgProgress) || 0) * projectTotalTasks;
          totalTaskCountForAvg += projectTotalTasks;
        } catch (error) {
          console.error(`Error fetching stats for project ${projectId}:`, error);
        }
      }
      setProjectStatsMap(statsMap);

      const totalProjects = userProjects.length;
      const activeProjects = userProjects.filter(p =>
        p.status === "active" || p.status === "in-progress" || p.status === "in_progress"
      ).length;

      // ⭐ Completion percent = weighted average of per-project avgProgress.
      // This matches exactly what each project page shows.
      const completionPercent = totalTaskCountForAvg > 0
        ? Math.round(totalProgressWeighted / totalTaskCountForAvg)
        : (() => {
            // Fallback: compute from the raw task list when stats are unavailable.
            if (userTasks.length === 0) return 0;
            const total = userTasks.reduce((sum, t) => sum + computeTaskProgress(t), 0);
            return Math.round(total / userTasks.length);
          })();

      // On-time rate from backend stats (across completed tasks)
      const onTimeRate = totalCompletedTasks > 0
        ? Math.round((totalOnTime / totalCompletedTasks) * 100)
        : 0;

      const leads = allUsers.filter(u =>
        u.role?.toLowerCase() === 'member' || u.role?.toLowerCase() === 'lead'
      ).length;

      const completedTasksList = userTasks.filter(isDone);
      const timedCompletions = completedTasksList.filter(t => t.created_at && t.updated_at);
      const avgCompletionDays = timedCompletions.length === 0 ? 0 : (
        timedCompletions.reduce((sum, t) => {
          const diff = (new Date(t.updated_at) - new Date(t.created_at)) / (1000 * 60 * 60 * 24);
          return sum + Math.max(diff, 0);
        }, 0) / timedCompletions.length
      ).toFixed(1);

      setStats({
        totalProjects,
        activeProjects,
        totalTasks,
        doneTasks,
        completionPercent,
        totalMembers: allMembers.length,
        totalLeads: leads,
        inProgressTasks,
        onTimeRate,
        avgCompletionDays
      });

      // ─── Trends ───
      const now = new Date();
      const weekStart = daysAgo(6, now);
      const prevWeekEnd = daysAgo(7, now);
      const prevWeekStart = daysAgo(13, now);

      const inRange = (item, start, end) => {
        const d = dateOf(item);
        return d >= start && d <= end;
      };

      const projectsThisWeek = userProjects.filter(p => inRange(p, weekStart, now)).length;
      const projectsPrevWeek = userProjects.filter(p => inRange(p, prevWeekStart, prevWeekEnd)).length;

      const doneThisWeek = completedTasksList.filter(t => {
        const d = new Date(t.updated_at || t.created_at);
        return d >= weekStart && d <= now;
      }).length;
      const donePrevWeek = completedTasksList.filter(t => {
        const d = new Date(t.updated_at || t.created_at);
        return d >= prevWeekStart && d <= prevWeekEnd;
      }).length;

      const inProgThisWeek = userTasks.filter(t => isInProgress(t) && inRange(t, weekStart, now)).length;
      const inProgPrevWeek = userTasks.filter(t => isInProgress(t) && inRange(t, prevWeekStart, prevWeekEnd)).length;

      const tasksThisWeek = userTasks.filter(t => inRange(t, weekStart, now));
      const tasksPrevWeek = userTasks.filter(t => inRange(t, prevWeekStart, prevWeekEnd));
      const completionThisWeek = tasksThisWeek.length === 0
        ? 0
        : Math.round(tasksThisWeek.reduce((s, t) => s + computeTaskProgress(t), 0) / tasksThisWeek.length);
      const completionPrevWeek = tasksPrevWeek.length === 0
        ? 0
        : Math.round(tasksPrevWeek.reduce((s, t) => s + computeTaskProgress(t), 0) / tasksPrevWeek.length);

      setTrends({
        projects: computeTrend(projectsThisWeek, projectsPrevWeek),
        doneTasks: computeTrend(doneThisWeek, donePrevWeek),
        inProgressTasks: computeTrend(inProgThisWeek, inProgPrevWeek),
        completionPercent: computeTrend(completionThisWeek, completionPrevWeek)
      });

      // ─── Status Data ───
      const statusCounts = userProjects.reduce((acc, p) => {
        const status = p.status || "planning";
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});
      setStatusData(Object.entries(statusCounts).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, " ").replace(/-/g, " "),
        value,
        fill: getStatusColor(name)
      })));

      // ─── Priority Data ───
      const priorityCounts = userProjects.reduce((acc, p) => {
        const priority = p.priority || "medium";
        acc[priority] = (acc[priority] || 0) + 1;
        return acc;
      }, {});
      setPriorityData(Object.entries(priorityCounts).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
        fill: getPriorityColor(name)
      })));

      // ─── Team Productivity ───
      const productivityData = allMembers.slice(0, 8).map(member => {
        const memberId = member.id;
        const memberTasks = userTasks.filter(t =>
          t.assign_to === memberId ||
          t.assignedTo === memberId
        );
        const completed = memberTasks.filter(isDone).length;
        return {
          name: (member.name || "?").split(" ")[0],
          tasks: memberTasks.length,
          completed: completed,
          progress: memberTasks.length === 0 ? 0 : Math.round((completed / memberTasks.length) * 100)
        };
      });
      setTeamProductivity(productivityData);

      // ─── Project Health ───
      // Prefer backend avgProgress; fall back to client-side computation.
      const healthData = userProjects.slice(0, 8).map(project => {
        const projectId = project.p_id || project.id;
        const projectStats = statsMap[projectId] || {};
        const backendProgress = Number(projectStats.avgProgress);
        const progress = Number.isFinite(backendProgress) && backendProgress > 0
          ? Math.round(backendProgress)
          : computeProjectProgress(projectId, allTasks);

        const lead = allUsers.find(u =>
          Number(u.id || u.u_id) === Number(project.created_by || project.lead_id)
        );

        return {
          ...project,
          progress,
          done: projectStats.completedTasks || 0,
          total: projectStats.totalTasks || 0,
          lead: lead?.u_name || lead?.name || "Unassigned"
        };
      });
      setProjectHealth(healthData);

      // ─── Recent Activity ───
      const recent = [...userTasks]
        .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
        .slice(0, 5)
        .map(t => ({
          id: t.t_id || t.id,
          title: t.title,
          status: t.status,
          updated: t.updated_at || t.created_at,
          user: t.assignee_name || "System"
        }));
      setRecentActivity(recent);

    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
    toast.success("Dashboard refreshed");
  };

  /* ─── Skeleton loading layout ─── */
  const skeletonLayout = (
    <>
      <div className="skeleton sk-hero" />
      <div className="stats-grid">
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
      <div className="stats-grid-secondary">
        {[0, 1, 2, 3, 4].map(i => <div key={i} className="skeleton sk-mini" />)}
      </div>
      <div className="charts-row">
        <div className="skeleton sk-chart" />
        <div className="skeleton sk-chart" />
      </div>
      <div className="dashboard-bottom">
        <div className="skeleton sk-bottom" />
        <div className="skeleton sk-bottom" />
      </div>
    </>
  );

  /* ─── Main dashboard layout ─── */
  const dashboardLayout = (
    <>
      {/* ─── HERO ─── */}
      <section className="dashboard-hero anim" style={{ '--d': '0ms' }}>
        <span className="hero-orb hero-orb-1" aria-hidden="true" />
        <span className="hero-orb hero-orb-2" aria-hidden="true" />
        <div className="hero-content">
          <span className="hero-date">
            <CalendarDays size={13} />
            {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
          <h2 className="hero-title">
            <Sparkles size={18} className="hero-spark" />
            Workspace Overview
          </h2>
          <p className="hero-subtitle">
            Tracking <b>{stats.totalProjects}</b> projects · <b>{stats.totalTasks}</b> tasks · <b>{stats.totalMembers}</b> team members
          </p>
        </div>
        <HeroRing value={stats.completionPercent} />
      </section>

      {/* ─── QUICK STATS ─── */}
      <div className="stats-grid">
        <div className="stat-card-modern accent-purple anim" style={{ '--d': '60ms' }}>
          <div className="stat-card-icon purple"><FolderKanban size={20} /></div>
          <div className="stat-card-content">
            <span className="stat-card-value"><AnimatedNumber value={stats.totalProjects} /></span>
            <span className="stat-card-label">My Projects</span>
          </div>
          <TrendPill trend={trends.projects} />
        </div>

        <div className="stat-card-modern accent-emerald anim" style={{ '--d': '110ms' }}>
          <div className="stat-card-icon emerald"><CheckCircle2 size={20} /></div>
          <div className="stat-card-content">
            <span className="stat-card-value"><AnimatedNumber value={stats.doneTasks} /></span>
            <span className="stat-card-label">Tasks Completed</span>
          </div>
          <TrendPill trend={trends.doneTasks} />
        </div>

        <div className="stat-card-modern accent-amber anim" style={{ '--d': '160ms' }}>
          <div className="stat-card-icon amber"><Clock size={20} /></div>
          <div className="stat-card-content">
            <span className="stat-card-value"><AnimatedNumber value={stats.inProgressTasks} /></span>
            <span className="stat-card-label">In Progress</span>
          </div>
          <TrendPill trend={trends.inProgressTasks} />
        </div>

        <div className="stat-card-modern accent-teal anim" style={{ '--d': '210ms' }}>
          <div className="stat-card-icon teal"><Award size={20} /></div>
          <div className="stat-card-content">
            <span className="stat-card-value"><AnimatedNumber value={stats.completionPercent} suffix="%" /></span>
            <span className="stat-card-label">Avg. Progress</span>
          </div>
          <TrendPill trend={trends.completionPercent} />
        </div>
      </div>

      {/* ─── SECONDARY STATS ─── */}
      <div className="stats-grid-secondary">
        <div className="stat-card-mini anim" style={{ '--d': '250ms' }}>
          <Users size={16} className="stat-mini-icon" />
          <div>
            <span className="stat-mini-value"><AnimatedNumber value={stats.totalMembers} /></span>
            <span className="stat-mini-label">Team Members</span>
          </div>
        </div>
        <div className="stat-card-mini anim" style={{ '--d': '280ms' }}>
          <UserCheck size={16} className="stat-mini-icon" />
          <div>
            <span className="stat-mini-value"><AnimatedNumber value={stats.totalLeads} /></span>
            <span className="stat-mini-label">Leads</span>
          </div>
        </div>
        <div className="stat-card-mini anim" style={{ '--d': '310ms' }}>
          <Target size={16} className="stat-mini-icon" />
          <div>
            <span className="stat-mini-value"><AnimatedNumber value={stats.onTimeRate} suffix="%" /></span>
            <span className="stat-mini-label">On-Time Rate</span>
          </div>
        </div>
        <div className="stat-card-mini anim" style={{ '--d': '340ms' }}>
          <Activity size={16} className="stat-mini-icon" />
          <div>
            <span className="stat-mini-value"><AnimatedNumber value={stats.activeProjects} /></span>
            <span className="stat-mini-label">Active Projects</span>
          </div>
        </div>
        <div className="stat-card-mini anim" style={{ '--d': '370ms' }}>
          <Timer size={16} className="stat-mini-icon" />
          <div>
            <span className="stat-mini-value"><AnimatedNumber value={Number(stats.avgCompletionDays)} decimals={1} suffix="d" /></span>
            <span className="stat-mini-label">Avg. Completion</span>
          </div>
        </div>
      </div>

      {/* ─── CHARTS ROW 1 ─── */}
      <div className="charts-row">
        <div className="chart-card anim" style={{ '--d': '400ms' }}>
          <div className="chart-card-header">
            <h3 className="chart-card-title">
              <TrendingUp size={16} />
              Task Activity
            </h3>
            <div className="chart-card-actions">
              <button type="button" className={`time-btn ${timeRange === 'week' ? 'active' : ''}`} onClick={() => setTimeRange('week')}>Week</button>
              <button type="button" className={`time-btn ${timeRange === 'month' ? 'active' : ''}`} onClick={() => setTimeRange('month')}>Month</button>
              <button type="button" className={`time-btn ${timeRange === 'year' ? 'active' : ''}`} onClick={() => setTimeRange('year')}>Year</button>
            </div>
          </div>
          <div className="chart-container">
            {taskTrendData.every(d => d.created === 0) ? (
              <EmptyState message="No task activity in this period" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={taskTrendData} margin={{ top: 5, right: 8, left: -14, bottom: 0 }}>
                  <defs>
                    <linearGradient id="createdGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="completedGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent-emerald)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--accent-emerald)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--border-subtle)" vertical={false} opacity={0.6} />
                  <XAxis dataKey="label" fontSize={11} stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} stroke="var(--text-muted)" tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--text-muted)', strokeOpacity: 0.25, strokeDasharray: '4 4' }} />
                  <Area type="monotone" dataKey="created" name="Created" stroke="var(--accent-primary)" strokeWidth={2.5} fillOpacity={1} fill="url(#createdGradient)" animationDuration={900} animationEasing="ease-out" activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--bg-card)' }} />
                  <Area type="monotone" dataKey="completed" name="Completed" stroke="var(--accent-emerald)" strokeWidth={2.5} fillOpacity={1} fill="url(#completedGradient)" animationDuration={900} animationEasing="ease-out" activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--bg-card)' }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="chart-card anim" style={{ '--d': '450ms' }}>
          <div className="chart-card-header">
            <h3 className="chart-card-title">
              <PieChartIcon size={16} />
              Project Status
            </h3>
            <span className="chart-badge">{statusData.reduce((a, b) => a + b.value, 0)} total</span>
          </div>
          <div className="pie-chart-wrapper">
            <div className="pie-chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData.length > 0 ? statusData : [{ name: "No Data", value: 1, fill: "var(--text-muted)" }]}
                    innerRadius="50%"
                    outerRadius="80%"
                    paddingAngle={3}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    animationDuration={800}
                    animationEasing="ease-out"
                    onMouseEnter={(_, index) => setActiveIndex(index)}
                    onMouseLeave={() => setActiveIndex(null)}
                  >
                    {(statusData.length > 0 ? statusData : [{ name: "No Data", value: 1, fill: "var(--text-muted)" }]).map((entry, index) => (
                      <Cell
                        key={index}
                        fill={entry.fill}
                        style={{
                          opacity: activeIndex === null || activeIndex === index ? 1 : 0.45,
                          transform: activeIndex === index ? "scale(1.05)" : "scale(1)",
                          transformOrigin: "center",
                          transition: "all 0.3s ease"
                        }}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pie-center-label">
                <span className="pie-center-value">{statusData.reduce((a, b) => a + b.value, 0)}</span>
                <span className="pie-center-text">Projects</span>
              </div>
            </div>
            <div className="pie-legend">
              {statusData.length > 0 ? statusData.map((s, i) => {
                const total = statusData.reduce((a, b) => a + b.value, 0);
                const percent = total ? Math.round((s.value / total) * 100) : 0;
                return (
                  <button
                    type="button"
                    key={i}
                    onMouseEnter={() => setActiveIndex(i)}
                    onMouseLeave={() => setActiveIndex(null)}
                    onFocus={() => setActiveIndex(i)}
                    onBlur={() => setActiveIndex(null)}
                    className="pie-legend-item"
                  >
                    <span className="pie-legend-dot" style={{ background: s.fill }} />
                    <span className="pie-legend-name">{s.name}</span>
                    <span className="pie-legend-value">{percent}%</span>
                  </button>
                );
              }) : (
                <div className="pie-legend-empty">No data available</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── CHARTS ROW 2 ─── */}
      <div className="charts-row">
        <div className="chart-card anim" style={{ '--d': '500ms' }}>
          <div className="chart-card-header">
            <h3 className="chart-card-title">
              <Users size={16} />
              Team Productivity
            </h3>
            <span className="chart-badge">Top performers</span>
          </div>
          <div className="chart-container">
            {teamProductivity.length === 0 ? (
              <EmptyState message="No team members yet" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={teamProductivity} margin={{ top: 5, right: 8, left: -14, bottom: 0 }} barGap={4}>
                  <defs>
                    <linearGradient id="gradAssigned" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity={0.45} />
                    </linearGradient>
                    <linearGradient id="gradCompleted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent-emerald)" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="var(--accent-emerald)" stopOpacity={0.45} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--border-subtle)" vertical={false} opacity={0.6} />
                  <XAxis dataKey="name" fontSize={11} stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} stroke="var(--text-muted)" tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(128, 128, 128, 0.08)' }} />
                  <Bar dataKey="tasks" name="Assigned" fill="url(#gradAssigned)" radius={[6, 6, 0, 0]} animationDuration={800} animationEasing="ease-out" />
                  <Bar dataKey="completed" name="Completed" fill="url(#gradCompleted)" radius={[6, 6, 0, 0]} animationDuration={800} animationEasing="ease-out" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="chart-card anim" style={{ '--d': '550ms' }}>
          <div className="chart-card-header">
            <h3 className="chart-card-title">
              <BarChart3 size={16} />
              Priority Distribution
            </h3>
            <span className="chart-badge">By project</span>
          </div>
          <div className="chart-container">
            {priorityData.length === 0 ? (
              <EmptyState message="No projects yet" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={priorityData} layout="vertical" margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--border-subtle)" horizontal={false} opacity={0.6} />
                  <XAxis type="number" fontSize={11} stroke="var(--text-muted)" tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" fontSize={11} stroke="var(--text-muted)" tickLine={false} axisLine={false} width={60} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(128, 128, 128, 0.08)' }} />
                  <Bar dataKey="value" name="Projects" radius={[0, 6, 6, 0]} animationDuration={800} animationEasing="ease-out">
                    {priorityData.map((e, i) => (
                      <Cell key={i} fill={e.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ─── PROJECT HEALTH & RECENT ACTIVITY ─── */}
      <div className="dashboard-bottom">
        <div className="health-card anim" style={{ '--d': '600ms' }}>
          <div className="health-card-header">
            <h3 className="health-card-title">
              <FolderKanban size={16} />
              Project Health
            </h3>
            <button type="button" className="view-all-btn" onClick={() => navigate('/supervisor/projects')}>
              View all <ArrowRight size={13} />
            </button>
          </div>

          <div className="health-list">
            {projectHealth.length === 0 ? (
              <EmptyState message="No projects yet." />
            ) : (
              projectHealth.map((project, i) => {
                const progress = project.progress || 0;
                const hc = progress >= 70 ? "var(--accent-emerald)" : progress >= 40 ? "var(--accent-amber)" : "var(--accent-rose)";

                return (
                  <button
                    type="button"
                    key={project.p_id || project.id}
                    className="health-item anim"
                    style={{ '--hc': hc, '--d': `${600 + i * 45}ms` }}
                    onClick={() => navigate(`/supervisor/projects/${project.p_id || project.id}`)}
                  >
                    <div className="health-progress">
                      <ProgressRing progress={progress} size={44} strokeWidth={4} color={hc} />
                      <span className="health-progress-text" style={{ color: hc }}>{progress}%</span>
                    </div>

                    <div className="health-info">
                      <p className="health-name">{project.p_name || project.name}</p>
                      <p className="health-sub">
                        Lead: {project.lead || "Unassigned"} · {project.done}/{project.total} tasks
                      </p>
                    </div>

                    <div className="health-badges">
                      <PriorityBadge priority={project.priority} />
                      <StatusBadge status={project.status} />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="activity-card anim" style={{ '--d': '650ms' }}>
          <div className="activity-card-header">
            <h3 className="activity-card-title">
              <Zap size={16} />
              Recent Activity
            </h3>
            <span className="activity-badge"><span className="live-dot" />Live</span>
          </div>

          <div className="activity-list">
            {recentActivity.length === 0 ? (
              <EmptyState message="No recent activity" />
            ) : (
              recentActivity.map((item, i) => (
                <div key={item.id} className="activity-item anim" style={{ '--d': `${650 + i * 50}ms` }}>
                  <div className="activity-dot" style={{ background: getStatusColor(item.status) }} />
                  <div className="activity-content">
                    <p className="activity-text">{item.title}</p>
                    <div className="activity-meta">
                      <span className="activity-status">
                        <StatusBadge status={item.status} />
                      </span>
                      <span className="activity-time">
                        {item.updated ? new Date(item.updated).toLocaleDateString() : 'Recently'}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div>
      <Topbar
        title={
          loading ? (
            "Supervisor Dashboard"
          ) : (
            <span className="greeting-text">
              {getGreeting()}, {user?.u_name?.split(' ')[0] || 'User'}
              <span className="greeting-wave">👋</span>
            </span>
          )
        }
        onMenuClick={onMenuClick}
        actions={
          <button
            className="btn btn-secondary btn-sm refresh-btn"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        }
      />

      {refreshing && <div className="refresh-progress" aria-hidden="true" />}

      <div className="page-container supervisor-dashboard" aria-busy={loading}>
        {loading ? skeletonLayout : dashboardLayout}
      </div>

      <style>{dashboardCss}</style>
    </div>
  );
}