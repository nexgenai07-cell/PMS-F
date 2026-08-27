// src/components/auth/EmailVerification.jsx
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MailCheck, ArrowLeft, Zap, RefreshCw, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { sendVerificationEmail, verifyToken } from '../../services/emailService';

export default function EmailVerification() {
  const navigate = useNavigate();
  const location = useLocation();
  const [resendLoading, setResendLoading] = useState(false);
  const [status, setStatus] = useState(null); // 'success' | 'error' | null
  const [countdown, setCountdown] = useState(0);
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');

  // Get email from location state
  useEffect(() => {
    const email = location.state?.email || localStorage.getItem('verification_email') || '';
    const name = location.state?.name || localStorage.getItem('verification_name') || '';
    setUserEmail(email);
    setUserName(name);
    if (email) localStorage.setItem('verification_email', email);
    if (name) localStorage.setItem('verification_name', name);
  }, [location]);

  // Check for token in URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    if (token) {
      const result = verifyToken(token);
      if (result.valid) {
        setStatus('success');
        toast.success('Email verified successfully! You can now login.');
        setTimeout(() => {
          navigate('/login', { 
            state: { email: result.email, verified: true }
          });
        }, 3000);
      } else {
        setStatus('error');
        toast.error(result.error || 'Invalid verification token');
      }
    }
  }, [location, navigate]);

  // Countdown for resend
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Handle resend
  const handleResend = async () => {
    if (!userEmail) {
      toast.error('Email address is required');
      return;
    }

    setResendLoading(true);
    try {
      const verificationLink = `${window.location.origin}/verify-email?token=${btoa(encodeURIComponent(`${userEmail}|${Date.now()}|${Math.random().toString(36).substring(2, 15)}`))}`;
      const result = await sendVerificationEmail(userEmail, userName, verificationLink);
      
      if (result.success) {
        setCountdown(60);
        setStatus('success');
        toast.success('Verification email sent successfully!');
      } else {
        setStatus('error');
        toast.error(result.message || 'Failed to send verification email');
      }
    } catch (error) {
      setStatus('error');
      toast.error('Failed to send verification email.');
    } finally {
      setResendLoading(false);
    }
  };

  // Auto-send on mount
  useEffect(() => {
    if (userEmail && !status && !location.search.includes('token')) {
      handleResend();
    }
  }, [userEmail]);

  return (
    <div className="verify-screen">
      <div className="verify-card animate-fade-in">
        {/* Brand */}
        <div className="brand">
          <div className="brand-mark">
            <Zap size={20} color="white" fill="white" />
          </div>
          <span className="brand-name">AEEL-PMS</span>
        </div>

        {/* Icon */}
        <div className="verify-icon-wrapper">
          {status === 'success' ? (
            <div className="verify-icon success">
              <CheckCircle2 size={40} color="#34d399" />
            </div>
          ) : status === 'error' ? (
            <div className="verify-icon error">
              <XCircle size={40} color="#f87171" />
            </div>
          ) : (
            <div className="verify-icon">
              <MailCheck size={40} style={{ color: 'var(--accent-primary)' }} />
            </div>
          )}
        </div>

        {/* Title */}
        <h1 className="verify-title">
          {status === 'success' ? 'Email Verified!' :
           status === 'error' ? 'Verification Failed' :
           'Check Your Email'}
        </h1>

        {/* Description */}
        <p className="verify-desc">
          {status === 'success' ? (
            'Your email has been verified successfully! Redirecting to login...'
          ) : status === 'error' ? (
            'The verification link is invalid or expired. Please request a new one.'
          ) : (
            `We've sent a verification link to <strong>${userEmail}</strong>. Click the link to activate your account.`
          )}
        </p>

        {/* Email display */}
        {userEmail && status !== 'success' && (
          <div className="verify-email-display">
            📧 {userEmail}
          </div>
        )}

        {/* Actions */}
        <div className="verify-actions">
          {status === 'error' && (
            <button
              className="verify-btn primary"
              onClick={handleResend}
              disabled={resendLoading}
            >
              {resendLoading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
              Resend Verification Email
            </button>
          )}
          {status === 'success' && (
            <button
              className="verify-btn secondary"
              onClick={() => navigate('/login')}
            >
              Go to Login
            </button>
          )}
        </div>

        {/* Back button */}
        <button 
          className="verify-btn ghost" 
          onClick={() => navigate('/login')}
        >
          <ArrowLeft size={16} /> Back to Sign In
        </button>
      </div>

      <style>{`
        .verify-screen {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-primary);
          padding: 20px;
        }

        .verify-card {
          max-width: 440px;
          width: 100%;
          text-align: center;
          padding: 48px 40px;
          background: var(--bg-card);
          border-radius: var(--radius-xl);
          border: 1px solid var(--border-subtle);
          animation: fadeIn 0.5s ease-out;
        }

        .brand {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin-bottom: 24px;
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

        .verify-icon-wrapper {
          display: flex;
          justify-content: center;
          margin-bottom: 20px;
        }

        .verify-icon {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: rgba(99, 102, 241, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .verify-icon.success {
          background: rgba(52, 211, 153, 0.1);
        }

        .verify-icon.error {
          background: rgba(248, 113, 113, 0.1);
        }

        .verify-title {
          font-size: 24px;
          font-weight: 800;
          margin: 0 0 12px;
        }

        .verify-desc {
          color: var(--text-secondary);
          line-height: 1.6;
          margin: 0 0 16px;
          font-size: 14px;
        }

        .verify-email-display {
          background: rgba(52, 211, 153, 0.08);
          border-radius: 8px;
          padding: 10px 14px;
          margin-bottom: 20px;
          font-size: 14px;
          font-weight: 500;
          color: #34d399;
          word-break: break-all;
        }

        .verify-actions {
          display: flex;
          justify-content: center;
          gap: 10px;
          margin-bottom: 16px;
        }

        .verify-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .verify-btn.primary {
          background: var(--accent-primary);
          color: #fff;
        }

        .verify-btn.primary:hover:not(:disabled) {
          opacity: 0.85;
          transform: translateY(-1px);
        }

        .verify-btn.secondary {
          background: var(--bg-secondary);
          color: var(--text-primary);
          border: 1px solid var(--border-default);
        }

        .verify-btn.secondary:hover {
          border-color: var(--accent-primary);
          color: var(--accent-primary);
        }

        .verify-btn.ghost {
          background: none;
          color: var(--text-secondary);
          justify-content: center;
          width: 100%;
        }

        .verify-btn.ghost:hover {
          color: var(--accent-primary);
        }

        .verify-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 480px) {
          .verify-card {
            padding: 32px 20px;
          }
          .verify-title {
            font-size: 20px;
          }
        }
      `}</style>
    </div>
  );
}