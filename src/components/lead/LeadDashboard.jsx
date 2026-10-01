// components/lead/LeadDashboard.jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  FolderKanban,
  CheckCircle2,
  Users,
  Clock,
  ArrowRight,
  RefreshCw,
  TrendingUp,
  Award,
  Target,
  Zap,
  Calendar,
  CalendarDays,
  BarChart3,
  PieChart as PieChartIcon,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  MoreHorizontal,
  AlertCircle,
  Inbox
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
  Legend,
  AreaChart,
  Area
} from 'recharts';
import Topbar from '../shared/Topbar';
import { getGreeting } from '../../utils/greeting';
import {
  PriorityBadge,
  StatusBadge,
  ProgressRing,
  AvatarGroup
} from '../shared/UIComponents';
import projectService from '../../services/projectService';
import taskService from '../../services/taskService';
import teamService from '../../services/teamService';
import toast from 'react-hot-toast';

/* ─────────── Pure UI components (no logic changes) ─────────── */

// Smooth count-up animation — purely visual
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
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
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

// Self-contained animated ring for the hero
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
        <span className="hero-ring-text">Progress</span>   {/* ← was "Done" */}
      </div>
    </div>
  );
};

const EmptyState = ({ icon: Icon = Inbox }) => (
  <div className="card-empty">
    <div className="empty-icon"><Icon size={22} /></div>
  </div>
);

// Moved to module scope (was re-created every render — smoother tooltips, same output)
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
    0%, 100% { box-shadow: 0 0 0 0 rgba(248, 113, 113, 0.45); }
    50% { box-shadow: 0 0 0 6px rgba(248, 113, 113, 0); }
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
  @keyframes urgentPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.55; }
  }

  .spin { animation: spin 1s linear infinite; }

  /* ── Entrance animation utility ── */
  .anim {
    opacity: 0;
    animation: fadeUp 0.55s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    animation-delay: var(--d, 0ms);
  }

  /* ── Top progress bar (during refresh) ── */
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

  /* ── Skeleton loading ── */
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
  .sk-full { height: 280px; border-radius: 16px; margin-bottom: 20px; }
  .sk-full:last-child { margin-bottom: 0; }

  /* ── Greeting ── */
  .greeting-text { display: flex; align-items: center; gap: 8px; }
  .greeting-wave {
    display: inline-block;
    font-size: 20px;
    transform-origin: 70% 70%;
    animation: wave 2.6s ease-in-out infinite;
  }
  .refresh-btn { display: flex; align-items: center; gap: 6px; }

  /* ── HERO ── */
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

  /* ── STATS GRID ── */
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
  .stat-card-trend.muted { background: var(--bg-secondary); color: var(--text-muted); font-weight: 600; }

  /* ── SECONDARY STATS ── */
  .stats-grid-secondary {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
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

  /* ── CHARTS ── */
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

  /* ── MY PROJECTS ── */
  .projects-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: 16px;
    padding: 20px;
    margin-bottom: 20px;
    transition: border-color 0.25s ease, box-shadow 0.25s ease;
  }
  .projects-card:hover { border-color: var(--border-default); box-shadow: 0 12px 28px -14px rgba(0, 0, 0, 0.15); }
  .projects-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .projects-card-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 700;
    color: var(--text-primary);
  }
  .projects-card-title svg { color: var(--accent-primary); }

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

  .projects-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  .project-item {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    cursor: pointer;
    transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
  }
  .project-item::before {
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
  .project-item:hover, .project-item:focus-visible {
    transform: translateY(-3px);
    border-color: var(--hc, var(--accent-primary));
    background: var(--bg-card);
    box-shadow: 0 12px 26px -12px rgba(0, 0, 0, 0.22);
    outline: none;
  }
  .project-item:hover::before, .project-item:focus-visible::before { opacity: 1; top: 12%; bottom: 12%; }

  .project-progress { position: relative; width: 44px; height: 44px; flex-shrink: 0; }
  .project-progress-text {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .project-info { flex: 1; min-width: 0; }
  .project-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .project-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
    flex-wrap: wrap;
  }
  .project-task-count {
    font-size: 11px;
    color: var(--text-muted);
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    padding: 1px 8px;
    border-radius: 999px;
    font-variant-numeric: tabular-nums;
  }

  .card-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    text-align: center;
    padding: 30px 0;
    color: var(--text-muted);
    animation: fadeIn 0.4s ease;
  }
  .empty-icon {
    width: 48px;
    height: 48px;
    border-radius: 14px;
    display: grid;
    place-items: center;
    background: var(--bg-secondary);
    border: 1px dashed var(--border-default);
    color: var(--text-muted);
  }
  .projects-empty p, .deadlines-empty p { font-size: 13px; margin: 0 0 2px; font-weight: 600; color: var(--text-secondary); }
  .projects-empty span, .deadlines-empty span { font-size: 12px; color: var(--text-muted); }

  /* ── DEADLINES ── */
  .deadlines-card {
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: 16px;
    padding: 20px;
    transition: border-color 0.25s ease, box-shadow 0.25s ease;
  }
  .deadlines-card:hover { border-color: var(--border-default); box-shadow: 0 12px 28px -14px rgba(0, 0, 0, 0.15); }
  .deadlines-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  .deadlines-card-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 700;
    color: var(--text-primary);
  }
  .deadlines-card-title svg { color: var(--accent-primary); }
  .deadlines-badge {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    background: var(--bg-secondary);
    border: 1px solid var(--border-subtle);
    padding: 4px 10px;
    border-radius: 999px;
    font-variant-numeric: tabular-nums;
  }

  .deadlines-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .deadline-item {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 14px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    cursor: pointer;
    flex-wrap: wrap;
    transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
  }
  .deadline-item::before {
    content: '';
    position: absolute;
    left: 0;
    top: 20%;
    bottom: 20%;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: var(--accent-primary);
    opacity: 0.45;
    transition: opacity 0.2s ease, top 0.2s ease, bottom 0.2s ease;
  }
  .deadline-item:hover {
    transform: translateY(-2px) translateX(2px);
    border-color: var(--accent-primary);
    background: var(--bg-card);
    box-shadow: 0 10px 24px -12px rgba(0, 0, 0, 0.2);
  }
  .deadline-item:hover::before, .deadline-item:focus-visible::before { opacity: 1; top: 12%; bottom: 12%; }
  .deadline-item:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }

  .deadline-item.overdue {
    border-color: rgba(248, 113, 113, 0.3);
    background: rgba(248, 113, 113, 0.05);
  }
  .deadline-item.urgent {
    border-color: rgba(245, 158, 11, 0.3);
    background: rgba(245, 158, 11, 0.05);
  }
  .deadline-item.overdue::before { background: #f87171; opacity: 1; }
  .deadline-item.urgent::before { background: #f59e0b; opacity: 1; }
  .deadline-item.overdue:hover { border-color: #f87171; box-shadow: 0 10px 24px -12px rgba(248, 113, 113, 0.35); }
  .deadline-item.urgent:hover { border-color: #f59e0b; box-shadow: 0 10px 24px -12px rgba(245, 158, 11, 0.35); }

  .deadline-info { flex: 1; min-width: 140px; }
  .deadline-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .deadline-project {
    font-size: 11px;
    color: var(--text-muted);
    margin-top: 2px;
  }
  .deadline-badges { display: flex; gap: 6px; flex-shrink: 0; }
  .deadline-days {
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
    padding: 3px 10px;
    border-radius: 999px;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    font-variant-numeric: tabular-nums;
    transition: transform 0.2s ease;
  }
  .deadline-item:hover .deadline-days { transform: scale(1.05); }
  .deadline-item.overdue .deadline-days {
    background: rgba(248, 113, 113, 0.1);
    border-color: rgba(248, 113, 113, 0.25);
    animation: urgentPulse 2s ease-in-out infinite;
  }
  .deadline-item.urgent .deadline-days {
    background: rgba(245, 158, 11, 0.1);
    border-color: rgba(245, 158, 11, 0.25);
  }

  /* ── RESPONSIVE ── */
  @media (max-width: 1200px) {
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
    .stats-grid-secondary { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 992px) {
    .charts-row { grid-template-columns: 1fr; }
  }
  @media (max-width: 768px) {
    .stats-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
    .stats-grid-secondary { grid-template-columns: 1fr 1fr; gap: 10px; }
    .projects-grid { grid-template-columns: 1fr; }
    .chart-card { padding: 16px; }
    .chart-container { height: 180px; }
    .dashboard-hero { padding: 22px 24px; }
    .deadline-item { flex-direction: column; align-items: flex-start; }
    .deadline-badges { width: 100%; }
    .deadline-days { margin-top: 4px; }
  }
  @media (max-width: 640px) {
    .hero-title { font-size: 18px; }
  }
  @media (max-width: 480px) {
    .stats-grid { grid-template-columns: 1fr; }
    .stats-grid-secondary { grid-template-columns: 1fr; }
    .stat-card-modern { padding: 16px; }
    .stat-card-value { font-size: 21px; }
    .chart-card-header { flex-direction: column; align-items: flex-start; gap: 8px; }
    .page-container.lead-dashboard { padding: 10px; }
    .project-item { padding: 12px; }
    .deadline-item { padding: 10px 12px; }
  }

  /* ── ACCESSIBILITY ── */
  .view-all-btn:focus-visible,
  .project-item:focus-visible,
  .stat-card-mini:focus-visible,
  .deadline-item:focus-visible {
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

export default function LeadDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const context = useOutletContext();
  const onMenuClick = context?.onMenuClick || (() => console.log('Menu click'));

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [activeIndex, setActiveIndex] = useState(null);
  const [projectStatsMap, setProjectStatsMap] = useState({});
  const [stats, setStats] = useState({
  totalProjects: 0,
  totalTasks: 0,
  completedTasks: 0,
  inProgressTasks: 0,
  teamMembers: 0,
  onTimeRate: 0,
  completionRate: 0,
  avgProgress: 0,    // ← NEW
});

  // Fetch data
  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      const [projectsData, tasksData, membersData] = await Promise.all([
        projectService.getProjects(),
        taskService.getTasks(),
        teamService.getTeamMembers(),
      ]);

      const allProjects = projectsData?.data || projectsData || [];
      const tasksList = tasksData?.data || tasksData || [];
      const membersList = membersData?.data || membersData || [];

      // ✅ Get current user
      const userId = Number(user?.id || user?.u_id);
      const userName = (user?.u_name || '').toLowerCase().trim();
      
      // ✅ Find TeamMember that matches this user
      const userTeamMember = membersList.find(m => {
        const memberName = (m.name || '').toLowerCase().trim();
        return memberName === userName;
      });
      const teamMemberId = userTeamMember ? Number(userTeamMember.id) : null;
      
      // ✅ Find projects created by this user
      const createdProjects = allProjects.filter(p => 
        Number(p.created_by) === userId
      );
      const createdProjectIds = createdProjects.map(p => Number(p.p_id || p.id));
      
      // ✅ Find projects where this user is assigned to tasks
      const assignedProjectIds = new Set();
      tasksList.forEach(t => {
        const assignTo = Number(t.assign_to || t.assignedTo);
        if (assignTo === teamMemberId) {
          assignedProjectIds.add(Number(t.p_id || t.p));
        }
      });
      
      // ✅ Also check by name (fallback)
      tasksList.forEach(t => {
        const assigneeName = (t.assign_to_name || '').toLowerCase().trim();
        if (assigneeName === userName) {
          assignedProjectIds.add(Number(t.p_id || t.p));
        }
      });
      
      // ✅ Combine all project IDs
      const allProjectIds = [...new Set([...createdProjectIds, ...assignedProjectIds])];
      
      // ✅ Filter projects for this user
      const userProjects = allProjects.filter(p => 
        allProjectIds.includes(Number(p.p_id || p.id))
      );
      
      // ✅ Filter tasks for this user's projects
      const userTasks = tasksList.filter(t => 
        allProjectIds.includes(Number(t.p_id || t.p))
      );

      console.log('📊 Lead Dashboard - User:', user?.u_name, 'TeamMember ID:', teamMemberId);
      console.log('📊 Lead Dashboard - Projects found:', userProjects.length);
      console.log('📊 Lead Dashboard - Tasks found:', userTasks.length);
      
      setProjects(userProjects);
      setTasks(userTasks);
      setTeamMembers(membersList);

      let totalTasks = 0;
let completedTasks = 0;
let inProgressTasks = 0;
let totalProgressWeighted = 0;   // sum of (avgProgress × taskCount)
let totalTaskCountForAvg = 0;    // denominator for the weighted average
const statsMap = {};

for (const project of userProjects) {
  const projectId = Number(project.p_id || project.id);
  try {
    const statsResponse = await projectService.getProjectStats(projectId);
    const stats = statsResponse?.data || {};
    statsMap[projectId] = stats;

    const projectTotalTasks = stats.totalTasks || 0;
    totalTasks += projectTotalTasks;
    completedTasks += stats.completedTasks || 0;
    inProgressTasks += stats.inProgressTasks || 0;

    // Weighted sum: bigger projects pull the average more,
    // exactly like the backend does per-project.
    totalProgressWeighted += (Number(stats.avgProgress) || 0) * projectTotalTasks;
    totalTaskCountForAvg += projectTotalTasks;
  } catch (error) {
    console.error(`Error fetching stats for project ${projectId}:`, error);
  }
}

      setProjectStatsMap(statsMap);

      // ✅ Get unique team members from tasks
      const memberIds = new Set();
      userTasks.forEach(t => {
        if (t.assign_to) memberIds.add(Number(t.assign_to));
      });
      const uniqueMembers = membersList.filter(m => 
        memberIds.has(Number(m.id))
      );

      const avgProgress = totalTaskCountForAvg > 0
  ? Math.round(totalProgressWeighted / totalTaskCountForAvg)
  : 0;

// Keep completionRate around too — it's still used to show
// "X% of tasks are fully done" in the trend badge.
const completionRate = totalTasks > 0
  ? Math.round((completedTasks / totalTasks) * 100)
  : 0;
      
      // Calculate on-time rate
      const completedTasksList = userTasks.filter(t => 
        t.status === 'done' || t.status === 'completed'
      );
      const onTime = completedTasksList.filter(t => 
        t.due_date && new Date(t.due_date) >= new Date(t.start_date || t.created_at)
      ).length;
      const onTimeRate = completedTasksList.length === 0 ? 0 : Math.round((onTime / completedTasksList.length) * 100);

      console.log('📊 Lead Dashboard Stats:', {
        totalProjects: userProjects.length,
        totalTasks,
        completedTasks,
        inProgressTasks,
        completionRate,
        onTimeRate
      });

      setStats({
  totalProjects: userProjects.length,
  totalTasks,
  completedTasks,
  inProgressTasks,
  teamMembers: uniqueMembers.length,
  onTimeRate,
  completionRate,
  avgProgress,       // ← NEW
});

    } catch (error) {
      console.error('❌ Failed to fetch dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
    toast.success('Dashboard refreshed');
  };

  const getProjectProgress = (projectId) => {
  const s = projectStatsMap[projectId];
  // Prefer the true per-task average; fall back to completion rate.
  const avg = Number(s?.avgProgress);
  if (Number.isFinite(avg)) return Math.round(avg);
  return Math.round(Number(s?.completionRate) || 0);
};

  const getProjectMembers = (projectId) => {
    const projectTasks = tasks.filter(t => Number(t.p_id || t.p) === Number(projectId));
    const memberIds = new Set();
    projectTasks.forEach(t => {
      if (t.assign_to) memberIds.add(Number(t.assign_to));
    });
    return teamMembers.filter(m => memberIds.has(Number(m.id))).slice(0, 4);
  };

  // Chart data - only from user's tasks
  const taskStatusData = [
    { 
      name: 'To Do', 
      value: tasks.filter(t => t.status === 'todo' || t.status === 'pending').length, 
      fill: '#94a3b8' 
    },
    { 
      name: 'In Progress', 
      value: tasks.filter(t => t.status === 'in_progress' || t.status === 'in-progress').length, 
      fill: '#818cf8' 
    },
    { 
      name: 'Review', 
      value: tasks.filter(t => t.status === 'review').length, 
      fill: '#f59e0b' 
    },
    { 
      name: 'Done', 
      value: tasks.filter(t => t.status === 'done' || t.status === 'completed').length, 
      fill: '#34d399' 
    }
  ];

  // Task trend data (simplified for lead)
  const taskTrendData = [
    { month: 'Week 1', tasks: tasks.length > 0 ? Math.round(tasks.length * 0.2) : 0 },
    { month: 'Week 2', tasks: tasks.length > 0 ? Math.round(tasks.length * 0.35) : 0 },
    { month: 'Week 3', tasks: tasks.length > 0 ? Math.round(tasks.length * 0.45) : 0 },
    { month: 'Week 4', tasks: tasks.length > 0 ? Math.round(tasks.length * 0.6) : 0 }
  ];

  // Upcoming deadlines - only from user's tasks
  const upcoming = tasks
    .filter(t => t.status !== 'done' && t.status !== 'completed' && (t.due_date || t.deadline))
    .sort((a, b) => {
      const dateA = new Date(a.due_date || a.deadline);
      const dateB = new Date(b.due_date || b.deadline);
      return dateA - dateB;
    })
    .slice(0, 5);

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
        {[0, 1, 2, 3].map(i => <div key={i} className="skeleton sk-mini" />)}
      </div>
      <div className="charts-row">
        <div className="skeleton sk-chart" />
        <div className="skeleton sk-chart" />
      </div>
      <div className="skeleton sk-full" />
      <div className="skeleton sk-full" />
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
            Team Overview
          </h2>
          <p className="hero-subtitle">
            Managing <b>{stats.totalProjects}</b> projects · <b>{stats.totalTasks}</b> tasks · <b>{stats.teamMembers}</b> team members
          </p>
        </div>
        <HeroRing value={stats.avgProgress} />
      </section>

      {/* ─── QUICK STATS ─── */}
      <div className="stats-grid">
        <div className="stat-card-modern accent-purple anim" style={{ '--d': '60ms' }}>
          <div className="stat-card-icon purple"><FolderKanban size={20} /></div>
          <div className="stat-card-content">
            <span className="stat-card-value"><AnimatedNumber value={stats.totalProjects} /></span>
            <span className="stat-card-label">My Projects</span>
          </div>
          <div className="stat-card-trend up">
            <ArrowUpRight size={14} />
            <span>{stats.totalProjects > 0 ? 'Active' : '0'}</span>
          </div>
        </div>

        <div className="stat-card-modern accent-emerald anim" style={{ '--d': '110ms' }}>
          <div className="stat-card-icon emerald"><CheckCircle2 size={20} /></div>
          <div className="stat-card-content">
            <span className="stat-card-value"><AnimatedNumber value={stats.completedTasks} /></span>
            <span className="stat-card-label">Tasks Completed</span>
          </div>
          <div className="stat-card-trend up">
            <ArrowUpRight size={14} />
            <span>{stats.completionRate}%</span>
          </div>
        </div>

        <div className="stat-card-modern accent-amber anim" style={{ '--d': '160ms' }}>
          <div className="stat-card-icon amber"><Clock size={20} /></div>
          <div className="stat-card-content">
            <span className="stat-card-value"><AnimatedNumber value={stats.inProgressTasks} /></span>
            <span className="stat-card-label">In Progress</span>
          </div>
          <div className="stat-card-trend muted">
            <span>Active</span>
          </div>
        </div>

        <div className="stat-card-modern accent-teal anim" style={{ '--d': '210ms' }}>
          <div className="stat-card-icon teal"><Award size={20} /></div>
          <div className="stat-card-content">
            <span className="stat-card-value"><AnimatedNumber value={stats.onTimeRate} suffix="%" /></span>
            <span className="stat-card-label">On-Time Rate</span>
          </div>
          <div className="stat-card-trend up">
            <ArrowUpRight size={14} />
            <span>Good</span>
          </div>
        </div>
      </div>

      {/* ─── SECONDARY STATS ─── */}
      <div className="stats-grid-secondary">
        <div className="stat-card-mini anim" style={{ '--d': '250ms' }}>
          <Users size={16} className="stat-mini-icon" />
          <div>
            <span className="stat-mini-value"><AnimatedNumber value={stats.teamMembers} /></span>
            <span className="stat-mini-label">Team Members</span>
          </div>
        </div>
        <div className="stat-card-mini anim" style={{ '--d': '280ms' }}>
          <Target size={16} className="stat-mini-icon" />
          <div>
            <span className="stat-mini-value"><AnimatedNumber value={stats.totalTasks} /></span>
            <span className="stat-mini-label">Total Tasks</span>
          </div>
        </div>
        <div className="stat-card-mini anim" style={{ '--d': '310ms' }}>
  <TrendingUp size={16} className="stat-mini-icon" />
  <div>
    <span className="stat-mini-value"><AnimatedNumber value={stats.avgProgress} suffix="%" /></span>
    <span className="stat-mini-label">Average Progress</span>
  </div>
</div>
        <div className="stat-card-mini anim" style={{ '--d': '340ms' }}>
          <Calendar size={16} className="stat-mini-icon" />
          <div>
            <span className="stat-mini-value"><AnimatedNumber value={upcoming.length} /></span>
            <span className="stat-mini-label">Upcoming Deadlines</span>
          </div>
        </div>
      </div>

      {/* ─── CHARTS ROW ─── */}
      <div className="charts-row">
        {/* Task Overview */}
        <div className="chart-card anim" style={{ '--d': '380ms' }}>
          <div className="chart-card-header">
            <h3 className="chart-card-title">
              <BarChart3 size={16} />
              Task Overview
            </h3>
            <span className="chart-badge">
              {taskStatusData.reduce((a, b) => a + b.value, 0)} total
            </span>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={taskStatusData} barSize={36} margin={{ top: 5, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="var(--border-subtle)" vertical={false} opacity={0.6} />
                <XAxis dataKey="name" fontSize={11} stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                <YAxis fontSize={11} stroke="var(--text-muted)" tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(128, 128, 128, 0.08)' }} />
                <Bar dataKey="value" radius={[8, 8, 3, 3]} animationDuration={800} animationEasing="ease-out">
                  {taskStatusData.map((e, i) => (
                    <Cell key={i} fill={e.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Task Trend */}
        <div className="chart-card anim" style={{ '--d': '430ms' }}>
          <div className="chart-card-header">
            <h3 className="chart-card-title">
              <TrendingUp size={16} />
              Task Activity
            </h3>
            <span className="chart-badge">This month</span>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={taskTrendData} margin={{ top: 5, right: 8, left: -14, bottom: 0 }}>
                <defs>
                  <linearGradient id="taskGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="var(--border-subtle)" vertical={false} opacity={0.6} />
                <XAxis dataKey="month" fontSize={11} stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                <YAxis fontSize={11} stroke="var(--text-muted)" tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--text-muted)', strokeOpacity: 0.25, strokeDasharray: '4 4' }} />
                <Area
                  type="monotone"
                  dataKey="tasks"
                  stroke="#818cf8"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#taskGradient)"
                  animationDuration={900}
                  animationEasing="ease-out"
                  activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--bg-card)' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ─── MY PROJECTS ─── */}
      <div className="projects-card anim" style={{ '--d': '480ms' }}>
        <div className="projects-card-header">
          <h3 className="projects-card-title">
            <FolderKanban size={16} />
            My Projects
          </h3>
          <button
            className="view-all-btn"
            onClick={() => navigate('/lead/projects')}
          >
            View all <ArrowRight size={13} />
          </button>
        </div>

        <div className="projects-grid">
          {projects.slice(0, 4).map((p, i) => {
            const projectId = Number(p.p_id || p.id);
            const progress = getProjectProgress(projectId);
            const members = getProjectMembers(projectId);
            const hc = progress >= 70 ? '#34d399' : progress >= 40 ? '#f59e0b' : '#f87171';

            return (
              <div
                key={projectId}
                className="project-item anim"
                style={{ '--hc': hc, '--d': `${500 + i * 50}ms` }}
                onClick={() => navigate(`/lead/projects/${projectId}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/lead/projects/${projectId}`); }}
              >
                <div className="project-progress">
                  <ProgressRing progress={progress} size={44} strokeWidth={4} color={hc} />
                  <span className="project-progress-text" style={{ color: hc }}>{progress}%</span>
                </div>

                <div className="project-info">
                  <p className="project-name">{p.p_name || p.name}</p>
                  <div className="project-meta">
                    <StatusBadge status={p.status} />
                    <span className="project-task-count">
                      {tasks.filter(t => Number(t.p_id || t.p) === projectId).length} tasks
                    </span>
                  </div>
                </div>

                <AvatarGroup members={members} max={3} />
              </div>
            );
          })}

          {projects.length === 0 && (
            <div className="card-empty projects-empty">
              <div className="empty-icon"><FolderKanban size={22} /></div>
              <p>No projects assigned to you yet.</p>
              <span>Projects will appear here once assigned.</span>
            </div>
          )}
        </div>
      </div>

      {/* ─── UPCOMING DEADLINES ─── */}
      <div className="deadlines-card anim" style={{ '--d': '540ms' }}>
        <div className="deadlines-card-header">
          <h3 className="deadlines-card-title">
            <Calendar size={16} />
            Upcoming Deadlines
          </h3>
          <span className="deadlines-badge">{upcoming.length} tasks</span>
        </div>

        {upcoming.length === 0 ? (
          <div className="card-empty deadlines-empty">
            <div className="empty-icon"><CheckCircle2 size={22} style={{ color: '#34d399' }} /></div>
            <p>No upcoming deadlines</p>
            <span>You're all caught up! 🎉</span>
          </div>
        ) : (
          <div className="deadlines-list">
            {upcoming.map((task, i) => {
              const taskId = task.t_id || task.id;
              const project = projects.find(p => Number(p.p_id || p.id) === Number(task.p_id || task.p));
              const dueDate = new Date(task.due_date || task.deadline);
              const today = new Date();
              const daysLeft = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
              const isOverdue = daysLeft < 0;
              const isUrgent = daysLeft >= 0 && daysLeft <= 3;

              return (
                <div
                  key={taskId}
                  className={`deadline-item anim ${isOverdue ? 'overdue' : ''} ${isUrgent ? 'urgent' : ''}`}
                  style={{ '--d': `${560 + i * 50}ms` }}
                  onClick={() => project && navigate(`/lead/projects/${project.p_id || project.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' && project) navigate(`/lead/projects/${project.p_id || project.id}`); }}
                >
                  <div className="deadline-info">
                    <p className="deadline-title">{task.title}</p>
                    <p className="deadline-project">
                      {project?.p_name || project?.name || 'Unknown Project'}
                    </p>
                  </div>

                  <div className="deadline-badges">
                    <PriorityBadge priority={task.priority} />
                    <StatusBadge status={task.status} />
                  </div>

                  <span className="deadline-days" style={{
                    color: isOverdue ? '#f87171' : isUrgent ? '#f59e0b' : 'var(--text-secondary)'
                  }}>
                    {isOverdue
                      ? `${Math.abs(daysLeft)}d overdue`
                      : daysLeft === 0
                      ? 'Due today'
                      : `${daysLeft}d left`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div>
      <Topbar
        title={
          loading ? (
            "Dashboard"
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

      <div className="page-container lead-dashboard" aria-busy={loading}>
        {loading ? skeletonLayout : dashboardLayout}
      </div>

      <style>{dashboardCss}</style>
    </div>
  );
}