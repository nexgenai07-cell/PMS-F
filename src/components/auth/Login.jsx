// src/components/auth/Login.jsx
import { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Eye, EyeOff, Zap, ArrowRight, Shield, Users, BarChart3, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';

// Demo users data - use backend role names
const DEMO_USERS = {
  supervisor: {
    id: 999,
    u_id: 999,
    u_name: 'Supervisor',
    name: 'Supervisor',
    email: 'supervisor@pms.com',
    role: 'manager',
    is_demo: true
  },
  lead: {
    id: 888,
    u_id: 888,
    u_name: 'Team Lead',
    name: 'Team Lead',
    email: 'lead1@pms.com',
    role: 'member',
    is_demo: true
  }
};

const FEATURES = [
  { icon: BarChart3, color: 'var(--accent-primary)', title: 'Real-time insights', desc: 'Live dashboards for project health and milestones.' },
  { icon: Users, color: 'var(--accent-teal)', title: 'Team management', desc: 'Assign roles and track workload at a glance.' },
  { icon: Shield, color: 'var(--accent-amber)', title: 'Role-based access', desc: 'Supervisors see everything; leads see their scope.' }
];

export default function Login() {
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, setUser } = useAuth();
  const navigate = useNavigate();

  // Auto-fill email from registration state
  useEffect(() => {
    const state = location.state;
    if (state?.email) {
      setEmail(state.email);
      // Clear the state after reading it
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email || !password) {
      toast.error('Please fill in all fields');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      const user = await login(email, password);

      const firstName = user?.u_name || user?.name || 'User';
      toast.success(`Welcome back, ${firstName}!`);

      const role = user?.role || 'member';
      navigate(role === 'supervisor' || role === 'admin' || role === 'manager' ? '/supervisor' : '/lead', { replace: true });
    } catch (err) {
      let errorMessage = 'Login failed. Please try again.';

      if (err?.response?.data) {
        const errorData = err.response.data;

        if (typeof errorData === 'string') {
          errorMessage = errorData;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        } else if (errorData.detail) {
          errorMessage = errorData.detail;
        } else if (errorData.error) {
          errorMessage = typeof errorData.error === 'string' ? errorData.error : 'Login failed';
        } else if (errorData.non_field_errors) {
          errorMessage = Array.isArray(errorData.non_field_errors)
            ? errorData.non_field_errors[0]
            : String(errorData.non_field_errors);
        } else if (errorData.email) {
          errorMessage = Array.isArray(errorData.email) ? errorData.email[0] : errorData.email;
        } else if (errorData.password) {
          errorMessage = Array.isArray(errorData.password) ? errorData.password[0] : errorData.password;
        } else {
          const firstKey = Object.keys(errorData)[0];
          if (firstKey) {
            const value = errorData[firstKey];
            errorMessage = Array.isArray(value) ? value[0] : String(value);
          }
        }
      } else if (err?.message) {
        errorMessage = err.message;
      }

      if (typeof errorMessage !== 'string') {
        errorMessage = 'Login failed. Please try again.';
      }

      toast.error(errorMessage);
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  // Demo login - bypasses API and uses a local demo user
  const quickLogin = (role) => {
    const demoUser = DEMO_USERS[role];
    if (!demoUser) return;

    localStorage.setItem('pms_user', JSON.stringify(demoUser));
    localStorage.setItem('user', JSON.stringify(demoUser));
    localStorage.setItem('user_role', demoUser.role);

    setUser(demoUser);
    toast.success(`Welcome ${demoUser.u_name}! (Demo mode)`);
    navigate(role === 'supervisor' ? '/supervisor' : '/lead', { replace: true });
  };

  return (
    <div className="login-screen">
      <div className="bg-fx" aria-hidden="true">
        <div className="bg-orb bg-orb--a" />
        <div className="bg-orb bg-orb--b" />
        <div className="bg-orb bg-orb--c" />
        <svg className="bg-grid" width="100%" height="100%">
          <defs>
            <pattern id="gridPattern" width="42" height="42" patternUnits="userSpaceOnUse">
              <path d="M 42 0 L 0 0 0 42" fill="none" stroke="var(--border-subtle)" strokeWidth="1" />
            </pattern>
            <radialGradient id="gridFade" cx="30%" cy="35%" r="75%">
              <stop offset="0%" stopColor="white" stopOpacity="0.9" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </radialGradient>
            <mask id="gridMask">
              <rect width="100%" height="100%" fill="url(#gridFade)" />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="url(#gridPattern)" mask="url(#gridMask)" />
        </svg>
      </div>

      <div className="login-panel">
        <div className="login-card animate-fade-in">
          <div className="brand">
            <div className="brand-mark">
              <Zap size={20} color="white" fill="white" />
            </div>
            <span className="brand-name">AEEL-PMS</span>
          </div>

          <h1 className="headline">
            Welcome <span className="gradient-text">back</span>
          </h1>
          <p className="subhead">Sign in to your workspace and get back to building.</p>

          <form onSubmit={handleSubmit} className="form">
            <div className="input-group">
              <label>Email address</label>
              <input
                className="input"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={loading}
                autoFocus={!email}
              />
            </div>

            <div className="input-group">
              <label>Password</label>
              <div className="password-field">
                <input
                  className="input"
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPass(!showPass)}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn-primary submit-btn" disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner" />
                  Signing in...
                </>
              ) : (
                <>Sign In <ArrowRight size={17} /></>
              )}
            </button>
          </form>

          <p className="signup-line">
            Don't have an account?{' '}
            <Link to="/register" className="signup-link">
              <UserPlus size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: -2 }} />
              Sign Up
            </Link>
          </p>

          <div className="demo-block">
            <div className="demo-divider">
              <span>Quick access for demo</span>
            </div>
            <div className="demo-grid">
              <button className="demo-btn" onClick={() => quickLogin('supervisor')}>
                <Shield size={16} style={{ color: 'var(--accent-secondary)' }} />
                <span className="demo-role">Supervisor</span>
                <span className="demo-email">supervisor@pms.com</span>
              </button>
              <button className="demo-btn" onClick={() => quickLogin('lead')}>
                <Users size={16} style={{ color: 'var(--accent-teal)' }} />
                <span className="demo-role">Team Lead</span>
                <span className="demo-email">lead1@pms.com</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="side-panel">
        <div className="side-content animate-slide-right stagger-children">
          <h2 className="side-title">Everything you need to manage projects</h2>

          {FEATURES.map(({ icon: Icon, color, title, desc }) => (
            <div key={title} className="feature-card">
              <div className="feature-icon" style={{ background: `${color}1f` }}>
                <Icon size={18} style={{ color }} />
              </div>
              <div>
                <p className="feature-title">{title}</p>
                <p className="feature-desc">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        * { box-sizing: border-box; }

        .login-screen {
          height: 100vh;
          min-height: 640px;
          display: flex;
          background: var(--bg-primary);
          overflow: hidden;
          position: relative;
        }

        .bg-fx {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
          z-index: 0;
        }

        .bg-grid {
          position: absolute;
          inset: 0;
          opacity: 0.5;
        }

        .bg-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(70px);
          opacity: 0.35;
          will-change: transform;
        }

        .bg-orb--a {
          width: 480px;
          height: 480px;
          top: -140px;
          left: -100px;
          background: radial-gradient(circle, var(--accent-primary), transparent 70%);
          animation: drift1 22s ease-in-out infinite;
        }

        .bg-orb--b {
          width: 420px;
          height: 420px;
          bottom: -160px;
          left: 30%;
          background: radial-gradient(circle, var(--accent-teal), transparent 70%);
          animation: drift2 26s ease-in-out infinite;
        }

        .bg-orb--c {
          width: 360px;
          height: 360px;
          top: 20%;
          right: -80px;
          background: radial-gradient(circle, var(--accent-secondary), transparent 70%);
          animation: drift3 30s ease-in-out infinite;
        }

        @keyframes drift1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(60px, 40px) scale(1.08); }
        }
        @keyframes drift2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-50px, -30px) scale(1.1); }
        }
        @keyframes drift3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-40px, 50px) scale(0.95); }
        }

        .login-panel {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: clamp(24px, 4vh, 48px) clamp(24px, 5vw, 72px);
          overflow-y: auto;
          position: relative;
          z-index: 1;
        }

        .login-card {
          width: 100%;
          max-width: 400px;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: clamp(24px, 4vh, 40px);
        }

        .brand-mark {
          width: 38px;
          height: 38px;
          background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 16px var(--accent-glow);
          flex-shrink: 0;
        }

        .brand-name {
          font-family: var(--font-display);
          font-size: 20px;
          font-weight: 800;
          letter-spacing: -0.3px;
        }

        .headline {
          font-size: clamp(28px, 3.4vw, 34px);
          font-weight: 800;
          line-height: 1.1;
          letter-spacing: -0.8px;
          margin: 0 0 6px;
        }

        .gradient-text {
          background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .subhead {
          color: var(--text-secondary);
          font-size: 14.5px;
          margin: 0 0 24px;
        }

        .form {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .input-group label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 6px;
        }

        .input {
          width: 100%;
          padding: 11px 14px;
          border: 2px solid var(--border-default);
          border-radius: 10px;
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-size: 14px;
          transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
          outline: none;
        }

        .input:focus {
          border-color: var(--accent-primary);
          background: var(--bg-card);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
        }

        .input::placeholder {
          color: var(--text-muted);
        }

        .input:disabled {
          opacity: 0.6;
        }

        .password-field {
          position: relative;
        }

        .password-field .input {
          padding-right: 42px;
        }

        .password-toggle {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 4px;
          display: flex;
          transition: color 0.2s;
        }

        .password-toggle:hover {
          color: var(--text-primary);
        }

        .btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 10px 18px;
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-primary {
          background: var(--accent-primary);
          color: #fff;
        }

        .btn-primary:hover:not(:disabled) {
          opacity: 0.85;
          transform: translateY(-1px);
        }

        .btn-primary:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .submit-btn {
          margin-top: 4px;
          justify-content: center;
          padding: 12px 20px;
          font-size: 15px;
          gap: 8px;
        }

        .spinner {
          width: 15px;
          height: 15px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        .signup-line {
          margin-top: 16px;
          text-align: center;
          font-size: 13.5px;
          color: var(--text-secondary);
        }

        .signup-link {
          color: var(--accent-primary);
          font-weight: 600;
          text-decoration: none;
          transition: color 0.2s;
        }
        .signup-link:hover {
          color: var(--accent-secondary);
        }

        .demo-block {
          margin-top: 22px;
        }

        .demo-divider {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
        }
        .demo-divider::before,
        .demo-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: var(--border-subtle);
        }
        .demo-divider span {
          font-size: 11.5px;
          color: var(--text-muted);
          white-space: nowrap;
        }

        .demo-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .demo-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          padding: 12px 8px;
          border-radius: 10px;
          border: 1px solid var(--border-default);
          background: transparent;
          color: var(--text-primary);
          cursor: pointer;
          transition: border-color 0.2s, background 0.2s, transform 0.15s;
        }
        .demo-btn:hover {
          border-color: var(--accent-primary);
          background: var(--bg-hover);
          transform: translateY(-1px);
        }
        .demo-btn:active {
          transform: translateY(0);
        }

        .demo-role {
          font-size: 12.5px;
          font-weight: 600;
        }
        .demo-email {
          font-size: 10.5px;
          color: var(--text-muted);
        }

        .side-panel {
          width: 400px;
          background: var(--bg-secondary);
          border-left: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          padding: clamp(24px, 4vh, 48px) 40px;
          flex-shrink: 0;
          position: relative;
          z-index: 1;
        }

        @media (max-width: 900px) {
          .side-panel { display: none; }
        }

        .side-content {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .side-title {
          font-family: var(--font-display);
          font-size: 19px;
          font-weight: 700;
          margin: 0 0 4px;
          line-height: 1.3;
        }

        .feature-card {
          display: flex;
          gap: 14px;
          padding: 16px;
          background: var(--bg-card);
          border-radius: 12px;
          border: 1px solid var(--border-subtle);
        }

        .feature-icon {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .feature-title {
          font-weight: 600;
          font-size: 14px;
          margin: 0 0 3px;
          font-family: var(--font-display);
        }

        .feature-desc {
          font-size: 12.5px;
          color: var(--text-secondary);
          line-height: 1.45;
          margin: 0;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .animate-fade-in { animation: fadeIn 0.5s ease-out; }
        .animate-slide-right { animation: slideRight 0.5s ease-out; }
        .stagger-children > * { animation: fadeIn 0.5s ease-out both; }
        .stagger-children > *:nth-child(1) { animation-delay: 0.05s; }
        .stagger-children > *:nth-child(2) { animation-delay: 0.12s; }
        .stagger-children > *:nth-child(3) { animation-delay: 0.19s; }
        .stagger-children > *:nth-child(4) { animation-delay: 0.26s; }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideRight {
          from { opacity: 0; transform: translateX(16px); }
          to { opacity: 1; transform: translateX(0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-fade-in, .animate-slide-right, .stagger-children > *, .spinner, .bg-orb {
            animation: none !important;
          }
        }

        @media (max-width: 480px) {
          .login-panel {
            padding: 16px;
          }
          .demo-grid {
            grid-template-columns: 1fr;
          }
          .headline {
            font-size: 24px;
          }
          .brand-name {
            font-size: 17px;
          }
          .brand-mark {
            width: 32px;
            height: 32px;
          }
          .brand-mark svg {
            width: 16px;
            height: 16px;
          }
        }
      `}</style>
    </div>
  );
}