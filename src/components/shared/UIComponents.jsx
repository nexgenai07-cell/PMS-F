// src/components/shared/UIComponents.jsx
import { priorityConfig, statusConfig } from '../../data/mockData';
import { AlertCircle, ArrowUp, Minus, ArrowDown } from 'lucide-react';

export function PriorityBadge({ priority }) {
  const cfg = priorityConfig[priority] || priorityConfig.low;
  const icons = { critical: AlertCircle, high: ArrowUp, medium: Minus, low: ArrowDown };
  const Icon = icons[priority] || Minus;
  return (
    <span className={`badge ${cfg.badge}`} style={{ gap: 4 }}>
      <Icon size={11} />
      {cfg.label}
    </span>
  );
}

export function StatusBadge({ status }) {
  // Normalize status to lowercase
  const normalizedStatus = String(status || '').toLowerCase().trim();
  
  // Get config or use fallback
  const cfg = statusConfig[normalizedStatus] || { 
    label: status || 'Unknown', 
    color: '#94a3b8', 
    badge: 'badge-gray' 
  };
  
  return (
    <span className={`badge ${cfg.badge}`}>
      <span style={{ 
        width: 6, 
        height: 6, 
        borderRadius: '50%', 
        background: cfg.color, 
        display: 'inline-block',
        flexShrink: 0 
      }} />
      {cfg.label}
    </span>
  );
}

export function Avatar({ name, color, size = 'md', style: extraStyle }) {
  const initials = name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
  return (
    <div
      className={`avatar avatar-${size}`}
      style={{ background: `${color}25`, color, border: `1px solid ${color}40`, ...extraStyle }}
      title={name}
    >
      {initials}
    </div>
  );
}

export function AvatarGroup({ members, max = 4 }) {
  const shown = members.slice(0, max);
  const rest = members.length - max;
  const colors = ['#6c63ff', '#2dd4bf', '#f43f5e', '#fbbf24', '#10b981', '#f97316', '#ec4899', '#a78bfa'];
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {shown.map((m, i) => (
        <div key={m.id || i} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: shown.length - i }}>
          <Avatar name={m.name} color={m.avatar_color || colors[i % colors.length]} size="sm" style={{ border: '2px solid var(--bg-card)' }} />
        </div>
      ))}
      {rest > 0 && (
        <div className="avatar avatar-sm" style={{ marginLeft: -8, background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '2px solid var(--bg-card)', fontSize: 10 }}>
          +{rest}
        </div>
      )}
    </div>
  );
}

export function ProgressRing({ progress, size = 60, strokeWidth = 5, color = 'var(--accent-primary)' }) {
  const r = (size - strokeWidth * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (progress / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-hover)" strokeWidth={strokeWidth} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)' }} />
    </svg>
  );
}

export function EmptyState({ icon: Icon, title, desc, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <div style={{ width: 64, height: 64, background: 'var(--bg-hover)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: 'var(--text-muted)' }}>
        <Icon size={28} />
      </div>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, marginBottom: 8 }}>{title}</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 320, margin: '0 auto 24px' }}>{desc}</p>
      {action}
    </div>
  );
}

export function Modal({ isOpen, onClose, title, children, size = '' }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${size}`} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700 }}>{title}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Select({ value, onChange, options, style }) {
  return (
    <select
      className="input"
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ appearance: 'none', cursor: 'pointer', ...style }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value} style={{ background: 'var(--bg-card)' }}>{o.label}</option>
      ))}
    </select>
  );
}