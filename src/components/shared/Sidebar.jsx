// src/components/shared/Sidebar.jsx
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Zap, LogOut, ChevronLeft } from 'lucide-react';

export default function Sidebar({ items, role, isOpen, onClose, onToggle }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && window.innerWidth <= 768 && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 999,
            animation: 'fadeIn 0.3s ease',
          }}
          onClick={onClose}
        />
      )}

      <nav style={{
        position: 'fixed',
        top: 0,
        left: 0,
        height: '100vh',
        width: isOpen ? '260px' : '70px',
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-subtle)',
        transition: 'width 0.3s ease',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Logo */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isOpen ? 'space-between' : 'center',
          padding: '16px',
          borderBottom: '1px solid var(--border-subtle)',
          minHeight: '64px',
        }}>
          {isOpen ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 34,
                height: 34,
                background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                borderRadius: 9,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Zap size={16} color="white" fill="white" />
              </div>
              <div>
                <p style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 900,
                  fontSize: 16,
                  lineHeight: 1,
                }}>AEEL-PMS</p>
                <p style={{
                  fontSize: 10.5,
                  color: 'var(--text-muted)',
                  marginTop: 1,
                  textTransform: 'capitalize'
                }}>{role} Portal</p>
              </div>
            </div>
          ) : (
            <div style={{
              width: 34,
              height: 34,
              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
              borderRadius: 9,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Zap size={16} color="white" fill="white" />
            </div>
          )}
          <button
            onClick={onToggle || onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: 4,
              display: isOpen ? 'flex' : 'none',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isOpen && <ChevronLeft size={18} />}
          </button>
        </div>

        {/* Navigation */}
        <div style={{
          flex: 1,
          padding: '12px 8px',
          overflowY: 'auto',
        }}>
          {isOpen && (
            <p style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.09em',
              padding: '8px 4px 6px',
            }}>
              Navigation
            </p>
          )}
          {items.map(({ path, label, icon: Icon, exact }) => (
            <NavLink
              key={path}
              to={path}
              end={exact}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                borderRadius: 10,
                color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                background: isActive ? 'var(--bg-card)' : 'transparent',
                textDecoration: 'none',
                transition: 'all 0.15s',
                marginBottom: 4,
                fontSize: 13.5,
                fontWeight: isActive ? 600 : 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              })}
              onClick={() => {
                if (window.innerWidth <= 768) {
                  onClose();
                }
              }}
              title={!isOpen ? label : ''}
            >
              <Icon size={18} style={{ flexShrink: 0 }} />
              {isOpen && <span>{label}</span>}
            </NavLink>
          ))}
        </div>

        {/* Sign out */}
        <div style={{
          padding: '12px 8px',
          borderTop: '1px solid var(--border-subtle)',
        }}>
          <button
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 12px',
              borderRadius: 10,
              color: 'var(--text-secondary)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s',
              width: '100%',
              fontSize: 13.5,
              fontWeight: 500,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#ef4444';
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-secondary)';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <LogOut size={18} style={{ flexShrink: 0 }} />
            {isOpen && <span>Sign Out</span>}
          </button>
        </div>
      </nav>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @media (max-width: 768px) {
          nav {
            transform: translateX(${isOpen ? '0' : '-100%'});
            width: 260px !important;
          }
          div[style*="marginLeft"] {
            margin-left: 0 !important;
          }
        }
      `}</style>
    </>
  );
}