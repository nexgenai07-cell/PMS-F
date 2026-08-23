// src/components/shared/StatCard.jsx
import { motion, animate } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const colorMap = {
  purple: { accent: '#6366f1', bg: 'rgba(99, 102, 241, 0.10)' },
  teal: { accent: '#14b8a6', bg: 'rgba(20, 184, 166, 0.10)' },
  amber: { accent: '#f59e0b', bg: 'rgba(245, 158, 11, 0.10)' },
  emerald: { accent: '#10b981', bg: 'rgba(16, 185, 129, 0.10)' },
  rose: { accent: '#f43f5e', bg: 'rgba(244, 63, 94, 0.10)' },
  blue: { accent: '#3b82f6', bg: 'rgba(59, 130, 246, 0.10)' },
};

/* ================= VALUE ANIMATION ================= */
function AnimatedValue({ value }) {
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    const num = parseFloat(String(value).replace(/[^0-9.]/g, ''));

    if (isNaN(num)) {
      setDisplay(value);
      return;
    }

    const ctrl = animate(0, num, {
      duration: 1.1,
      ease: [0.22, 1, 0.36, 1],
      onUpdate(v) {
        setDisplay(Math.round(v).toLocaleString());
      },
    });

    return () => ctrl.stop();
  }, [value]);

  return <span>{display}</span>;
}

/* ================= STAT CARD ================= */
export default function StatCard({
  label,
  value,
  icon: Icon,
  colorKey = 'purple',
  change,
  sub,
  index = 0,
  to,
}) {
  const navigate = useNavigate();
  const c = colorMap[colorKey] || colorMap.purple;
  const isPositive = change >= 0;

  return (
    <motion.div
      onClick={() => to && navigate(to)}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35 }}
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.97 }}
      style={{
        borderRadius: 14,
        padding: '16px 18px 14px',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        cursor: to ? 'pointer' : 'default',
        position: 'relative',
        overflow: 'hidden',
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = c.accent;
        e.currentTarget.style.boxShadow = `0 4px 16px ${c.accent}15`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-subtle)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Colored top accent bar */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        background: c.accent,
        borderRadius: '14px 14px 0 0',
      }} />

      {/* TOP ROW: Icon + Change Badge */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
        marginTop: 2,
      }}>
        <div style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: c.bg,
          border: '1px solid transparent',
        }}>
          <Icon size={16} color={c.accent} />
        </div>

        {change !== undefined && change !== 0 && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              padding: '2px 10px',
              borderRadius: 999,
              fontSize: 10.5,
              fontWeight: 700,
              background: isPositive
                ? 'rgba(16,185,129,0.10)'
                : 'rgba(244,63,94,0.10)',
              color: isPositive ? '#10b981' : '#f43f5e',
              border: `1px solid ${
                isPositive
                  ? 'rgba(16,185,129,0.20)'
                  : 'rgba(244,63,94,0.20)'
              }`,
            }}
          >
            <span style={{ fontSize: 9 }}>
              {isPositive ? '▲' : '▼'}
            </span>
            <span>{Math.abs(change)}%</span>
          </div>
        )}
      </div>

      {/* VALUE */}
      <div style={{
        fontSize: 28,
        fontWeight: 800,
        marginBottom: 1,
        color: c.accent,
        letterSpacing: '-0.5px',
        lineHeight: 1.1,
      }}>
        <AnimatedValue value={value} />
      </div>

      {/* LABEL */}
      <div style={{
        fontSize: 11.5,
        fontWeight: 500,
        color: 'var(--text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}>
        {label}
      </div>

      {/* SUB */}
      {sub && (
        <div style={{
          fontSize: 11,
          marginTop: 4,
          color: 'var(--text-muted)',
          fontWeight: 400,
        }}>
          {sub}
        </div>
      )}
    </motion.div>
  );
}