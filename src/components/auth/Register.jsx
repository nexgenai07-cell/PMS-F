// src/components/auth/Register.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Eye, EyeOff, Zap, ArrowRight, Shield, Users, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const ROLE_OPTIONS = [
  {
    value: 'manager',
    label: 'Supervisor',
    icon: Shield,
    description: 'Oversee multiple projects and teams'
  },
  {
    value: 'member',
    label: 'Team Lead',
    icon: Users,
    description: 'Manage projects and team members'
  }
];

const STRENGTH_MAP = {
  0: { label: 'Very Weak', color: '#ef4444', feedback: 'Add more characters and variety' },
  1: { label: 'Weak', color: '#f59e0b', feedback: 'Mix uppercase, lowercase, numbers, and symbols' },
  2: { label: 'Fair', color: '#f59e0b', feedback: 'Add numbers and special characters' },
  3: { label: 'Good', color: '#10b981', feedback: 'Almost there, add special characters' },
  4: { label: 'Strong', color: '#10b981', feedback: 'Great password!' },
  5: { label: 'Very Strong', color: '#10b981', feedback: 'Excellent password security!' }
};

const REQUIREMENTS = [
  { test: (p) => p.length >= 8, label: 'Min 8 characters' },
  { test: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p), label: 'Uppercase & lowercase' },
  { test: (p) => /\d/.test(p), label: 'Number' },
  { test: (p) => /[^a-zA-Z0-9]/.test(p), label: 'Special character' }
];

function scorePassword(password) {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  return Math.min(score, 5);
}

export default function Register() {
  const [formData, setFormData] = useState({
    u_name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'member'
  });
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const { register } = useAuth();
  const navigate = useNavigate();

  const strengthScore = scorePassword(formData.password);
  const strength = STRENGTH_MAP[strengthScore];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.u_name.trim()) {
      newErrors.u_name = 'Username is required';
    } else if (formData.u_name.length < 3) {
      newErrors.u_name = 'Username must be at least 3 characters';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!emailRegex.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    if (!formData.role) {
      newErrors.role = 'Please select a role';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please fix the errors before submitting');
      return;
    }

    setLoading(true);
    try {
      const registrationData = {
        u_name: formData.u_name,
        email: formData.email,
        password: formData.password,
        role: formData.role
      };

      await register(registrationData);
      toast.success('Registration successful! Please login.');
      
      // ✅ FIX: Pass email to login page via state
      navigate('/login', { 
        state: { email: formData.email }
      });
    } catch (err) {
      let errorMessage = 'Registration failed. Please try again.';

      if (err?.response?.data) {
        const errorData = err.response.data;

        if (typeof errorData === 'string') {
          errorMessage = errorData;
        } else if (errorData.detail) {
          errorMessage = errorData.detail;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        } else if (errorData.error) {
          if (typeof errorData.error === 'string') {
            errorMessage = errorData.error;
          } else if (typeof errorData.error === 'object') {
            const firstKey = Object.keys(errorData.error)[0];
            if (firstKey) {
              const value = errorData.error[firstKey];
              errorMessage = Array.isArray(value) ? value[0] : String(value);
            }
          }
        } else if (errorData.email) {
          errorMessage = Array.isArray(errorData.email) ? errorData.email[0] : errorData.email;
        } else if (errorData.u_name) {
          errorMessage = Array.isArray(errorData.u_name) ? errorData.u_name[0] : errorData.u_name;
        } else if (errorData.password) {
          errorMessage = Array.isArray(errorData.password) ? errorData.password[0] : errorData.password;
        } else if (errorData.role) {
          errorMessage = Array.isArray(errorData.role) ? errorData.role[0] : errorData.role;
        } else if (errorData.non_field_errors) {
          errorMessage = Array.isArray(errorData.non_field_errors) ? errorData.non_field_errors[0] : errorData.non_field_errors;
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

      const finalMessage = typeof errorMessage === 'string' ? errorMessage : 'Registration failed. Please try again.';
      toast.error(finalMessage);

      const lower = finalMessage.toLowerCase();
      if (lower.includes('email')) {
        setErrors(prev => ({ ...prev, email: finalMessage }));
      } else if (lower.includes('username') || lower.includes('u_name')) {
        setErrors(prev => ({ ...prev, u_name: finalMessage }));
      } else if (lower.includes('password')) {
        setErrors(prev => ({ ...prev, password: finalMessage }));
      } else if (lower.includes('role')) {
        setErrors(prev => ({ ...prev, role: finalMessage }));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-screen">
      <div className="bg-fx" aria-hidden="true">
        <div className="bg-orb bg-orb--a" />
        <div className="bg-orb bg-orb--b" />
        <div className="bg-orb bg-orb--c" />
        <svg className="bg-grid" width="100%" height="100%">
          <defs>
            <pattern id="regGridPattern" width="42" height="42" patternUnits="userSpaceOnUse">
              <path d="M 42 0 L 0 0 0 42" fill="none" stroke="var(--border-subtle)" strokeWidth="1" />
            </pattern>
            <radialGradient id="regGridFade" cx="30%" cy="35%" r="75%">
              <stop offset="0%" stopColor="white" stopOpacity="0.9" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </radialGradient>
            <mask id="regGridMask">
              <rect width="100%" height="100%" fill="url(#regGridFade)" />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="url(#regGridPattern)" mask="url(#regGridMask)" />
        </svg>
      </div>

      <div className="register-panel">
        <div className="register-card animate-fade-in">
          <div className="brand">
            <div className="brand-mark">
              <Zap size={20} color="white" fill="white" />
            </div>
            <span className="brand-name">AEEL-PMS</span>
          </div>

          <h1 className="headline">
            Create your <span className="gradient-text">account</span>
          </h1>
          <p className="subhead">Choose your role and get started with AEEL-PMS.</p>

          <form onSubmit={handleSubmit} className="form">
            <div className="input-group">
              <label>Username *</label>
              <input
                className={`input ${errors.u_name ? 'input-error' : ''}`}
                type="text"
                name="u_name"
                placeholder="johndoe"
                value={formData.u_name}
                onChange={handleChange}
                disabled={loading}
                autoFocus
              />
              {errors.u_name && <span className="input-error-text">{errors.u_name}</span>}
            </div>

            <div className="input-group">
              <label>Email address *</label>
              <input
                className={`input ${errors.email ? 'input-error' : ''}`}
                type="email"
                name="email"
                placeholder="your@email.com"
                value={formData.email}
                onChange={handleChange}
                disabled={loading}
              />
              {errors.email && <span className="input-error-text">{errors.email}</span>}
            </div>

            <div className="input-group">
              <label>Select your role *</label>
              <div className="role-grid">
                {ROLE_OPTIONS.map((role) => {
                  const Icon = role.icon;
                  const isSelected = formData.role === role.value;
                  return (
                    <button
                      key={role.value}
                      type="button"
                      className={`role-card ${isSelected ? 'role-card--active' : ''}`}
                      onClick={() => setFormData(prev => ({ ...prev, role: role.value }))}
                    >
                      <Icon size={20} className="role-icon" />
                      <div className="role-label">{role.label}</div>
                      <div className="role-desc">{role.description}</div>
                    </button>
                  );
                })}
              </div>
              {errors.role && <span className="input-error-text">{errors.role}</span>}
            </div>

            <div className="input-group">
              <label>Password *</label>
              <div className="password-field">
                <input
                  className={`input ${errors.password ? 'input-error' : ''}`}
                  type={showPass ? 'text' : 'password'}
                  name="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
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
              {errors.password && <span className="input-error-text">{errors.password}</span>}

              {formData.password && (
                <div className="strength">
                  <div className="strength-bars">
                    {[1, 2, 3, 4, 5].map((level) => (
                      <div
                        key={level}
                        className="strength-bar"
                        style={{ background: level <= strengthScore ? strength.color : 'var(--border-subtle)' }}
                      />
                    ))}
                    <span className="strength-label" style={{ color: strength.color }}>{strength.label}</span>
                  </div>
                  <span className="strength-feedback">{strength.feedback}</span>
                </div>
              )}
            </div>

            <div className="input-group">
              <label>Confirm Password *</label>
              <div className="password-field">
                <input
                  className={`input ${errors.confirmPassword ? 'input-error' : ''}`}
                  type={showConfirmPass ? 'text' : 'password'}
                  name="confirmPassword"
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  disabled={loading}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowConfirmPass(!showConfirmPass)}
                  aria-label={showConfirmPass ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.confirmPassword && <span className="input-error-text">{errors.confirmPassword}</span>}
            </div>

            <div className="requirements">
              {REQUIREMENTS.map(({ test, label }) => (
                <div className="requirement" key={label}>
                  <CheckCircle size={12} color={test(formData.password) ? '#10b981' : 'var(--text-muted)'} />
                  <span>{label}</span>
                </div>
              ))}
            </div>

            <button type="submit" className="btn btn-primary submit-btn" disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner" />
                  Creating account...
                </>
              ) : (
                <>Create Account <ArrowRight size={17} /></>
              )}
            </button>
          </form>

          <p className="signin-line">
            Already have an account?{' '}
            <button type="button" className="signin-link" onClick={() => navigate('/login')}>
              Sign in
            </button>
          </p>
        </div>
      </div>

      <div className="side-panel">
        <div className="side-content animate-slide-right stagger-children">
          <h2 className="side-title">Choose your role</h2>

          {ROLE_OPTIONS.map((role) => {
            const Icon = role.icon;
            const isSelected = formData.role === role.value;
            return (
              <div key={role.value} className={`side-role ${isSelected ? 'side-role--active' : ''}`}>
                <div className="side-role-icon">
                  <Icon size={18} />
                </div>
                <div>
                  <p className="side-role-label">{role.label}</p>
                  <p className="side-role-desc">{role.description}</p>
                </div>
              </div>
            );
          })}

          <div className="stats-card">
            <div className="stat">
              <p className="stat-num" style={{ color: 'var(--accent-primary)' }}>100+</p>
              <p className="stat-label">Active Projects</p>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <p className="stat-num" style={{ color: 'var(--accent-teal)' }}>50+</p>
              <p className="stat-label">Team Members</p>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <p className="stat-num" style={{ color: 'var(--accent-amber)' }}>95%</p>
              <p className="stat-label">Satisfaction</p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        * { box-sizing: border-box; }

        .register-screen {
          min-height: 100vh;
          display: flex;
          background: var(--bg-primary);
          position: relative;
          overflow: hidden;
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
          opacity: 0.32;
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

        .register-panel {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: clamp(24px, 4vh, 44px) clamp(24px, 5vw, 64px);
          position: relative;
          z-index: 1;
        }

        .register-card {
          width: 100%;
          max-width: 440px;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 20px;
        }

        .brand-mark {
          width: 36px;
          height: 36px;
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
          font-size: 19px;
          font-weight: 800;
          letter-spacing: -0.3px;
        }

        .headline {
          font-size: clamp(24px, 3vw, 28px);
          font-weight: 800;
          line-height: 1.15;
          letter-spacing: -0.6px;
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
          font-size: 14px;
          margin: 0 0 20px;
        }

        .form {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .input-group label {
          display: block;
          font-size: 12.5px;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 5px;
        }

        .input {
          width: 100%;
          padding: 10px 14px;
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

        .input-error {
          border-color: #ef4444 !important;
        }
        .input-error:focus {
          border-color: #ef4444 !important;
          box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1) !important;
        }
        .input-error-text {
          color: #ef4444;
          font-size: 11.5px;
          margin-top: 4px;
          display: block;
        }

        .role-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 4px;
        }

        .role-card {
          padding: 12px 10px;
          border-radius: 12px;
          border: 2px solid var(--border-default);
          background: var(--bg-secondary);
          cursor: pointer;
          transition: border-color 0.2s, background 0.2s, transform 0.15s;
          text-align: center;
          color: var(--text-primary);
        }
        .role-card:hover {
          transform: translateY(-1px);
        }
        .role-card--active {
          border-color: var(--accent-primary);
          background: rgba(99,102,241,0.08);
        }

        .role-icon {
          display: block;
          margin: 0 auto 5px;
          color: var(--text-muted);
        }
        .role-card--active .role-icon {
          color: var(--accent-primary);
        }

        .role-label {
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 3px;
        }
        .role-card--active .role-label {
          font-weight: 700;
          color: var(--accent-primary);
        }

        .role-desc {
          font-size: 10.5px;
          color: var(--text-muted);
          line-height: 1.3;
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

        .strength {
          margin-top: 6px;
        }
        .strength-bars {
          display: flex;
          align-items: center;
          gap: 4px;
          margin-bottom: 4px;
        }
        .strength-bar {
          height: 3px;
          flex: 1;
          border-radius: 2px;
          transition: background 0.3s;
        }
        .strength-label {
          font-size: 10.5px;
          font-weight: 600;
          white-space: nowrap;
          margin-left: 4px;
        }
        .strength-feedback {
          font-size: 10.5px;
          color: var(--text-muted);
        }

        .requirements {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 5px;
          font-size: 11px;
          color: var(--text-muted);
        }
        .requirement {
          display: flex;
          align-items: center;
          gap: 5px;
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
          margin-top: 2px;
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

        .signin-line {
          margin-top: 16px;
          text-align: center;
          font-size: 13.5px;
          color: var(--text-secondary);
        }
        .signin-link {
          background: none;
          border: none;
          color: var(--accent-primary);
          font-weight: 600;
          cursor: pointer;
          padding: 0;
          font-size: 13.5px;
          transition: color 0.2s;
        }
        .signin-link:hover {
          color: var(--accent-secondary);
        }

        .side-panel {
          width: 380px;
          background: var(--bg-secondary);
          border-left: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          padding: clamp(24px, 4vh, 44px) 32px;
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
          gap: 14px;
        }

        .side-title {
          font-family: var(--font-display);
          font-size: 18px;
          font-weight: 700;
          margin: 0 0 2px;
        }

        .side-role {
          display: flex;
          gap: 12px;
          padding: 14px;
          background: var(--bg-card);
          border-radius: 12px;
          border: 2px solid var(--border-subtle);
          opacity: 0.7;
          transition: all 0.3s;
        }
        .side-role--active {
          border-color: var(--accent-primary);
          opacity: 1;
        }

        .side-role-icon {
          width: 36px;
          height: 36px;
          background: var(--bg-secondary);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: var(--text-muted);
          transition: all 0.3s;
        }
        .side-role--active .side-role-icon {
          background: rgba(99,102,241,0.15);
          color: var(--accent-primary);
        }

        .side-role-label {
          font-weight: 600;
          margin: 0 0 2px;
          font-family: var(--font-display);
          font-size: 13.5px;
          color: var(--text-primary);
        }
        .side-role--active .side-role-label {
          color: var(--accent-primary);
        }

        .side-role-desc {
          font-size: 11.5px;
          color: var(--text-secondary);
          line-height: 1.4;
          margin: 0;
        }

        .stats-card {
          margin-top: 2px;
          padding: 14px 12px;
          background: var(--bg-card);
          border-radius: 12px;
          border: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: space-around;
        }
        .stat {
          text-align: center;
        }
        .stat-num {
          font-size: 17px;
          font-weight: 800;
          margin: 0;
        }
        .stat-label {
          font-size: 9.5px;
          color: var(--text-muted);
          margin: 0;
        }
        .stat-divider {
          width: 1px;
          height: 22px;
          background: var(--border-subtle);
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
          .register-panel {
            padding: 16px;
          }
          .role-desc { display: none; }
          .role-grid {
            grid-template-columns: 1fr 1fr;
          }
          .requirements {
            grid-template-columns: 1fr;
          }
          .headline {
            font-size: 22px;
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