// src/components/auth/EmailVerification.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  MailCheck, ArrowLeft, Zap, RefreshCw, CheckCircle2, XCircle, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import authService from '../../services/authService';

const RESEND_COOLDOWN_SECONDS = 60;
const REDIRECT_DELAY_MS = 4000;
const EMAIL_STORAGE_KEY = 'verify_email';

export default function EmailVerification() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [resendLoading, setResendLoading] = useState(false);
  const [status, setStatus] = useState(null); // 'success' | 'error' | null
  const [statusMessage, setStatusMessage] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [userEmail, setUserEmail] = useState('');

  const verifyHandledRef = useRef(false);
  const redirectTimerRef = useRef(null);

  // -------------------------------------------------------------
  // 🆕 Load email from three sources (in order of priority):
  //   1. Navigation state (from /register)
  //   2. URL ?email=... query param
  //   3. sessionStorage (persists across page reloads / direct visits)
  // -------------------------------------------------------------
  useEffect(() => {
    const stateEmail = location.state?.email;
    const urlEmail = new URLSearchParams(window.location.search).get('email');
    const storedEmail = sessionStorage.getItem(EMAIL_STORAGE_KEY) || '';

    const email = stateEmail || urlEmail || storedEmail;

    if (email) {
      setUserEmail(email);
      // Persist so it survives reloads
      sessionStorage.setItem(EMAIL_STORAGE_KEY, email);
      console.log('📧 [VerifyEmail] Email loaded:', email);
    } else {
      console.warn('📧 [VerifyEmail] No email found in state, URL, or storage');
    }
  }, [location.state]);

  // -------------------------------------------------------------
  // Verify token if URL contains uid + token
  // -------------------------------------------------------------
  useEffect(() => {
    const uid = searchParams.get('uid');
    const token = searchParams.get('token');

    if (!uid || !token) return;
    if (verifyHandledRef.current) return;
    verifyHandledRef.current = true;

    console.log('🔐 [VerifyEmail] Verifying uid + token...');

    (async () => {
      try {
        await authService.verifyEmail(uid, token);

        // Clear persisted email — verification is done
        sessionStorage.removeItem(EMAIL_STORAGE_KEY);

        setStatus('success');
        setStatusMessage('Your email has been verified! Redirecting to login...');
        toast.success('Email verified! You can now log in.');

        redirectTimerRef.current = setTimeout(() => {
          navigate('/login', { replace: true, state: { email: userEmail } });
        }, REDIRECT_DELAY_MS);
      } catch (err) {
        console.error('🔐 [VerifyEmail] Verification failed:', err);
        const detail =
          err?.data?.detail ||
          err?.data?.non_field_errors?.[0] ||
          err?.message ||
          'The verification link is invalid or has expired.';
        setStatus('error');
        setStatusMessage(typeof detail === 'string' ? detail : 'Verification failed.');
        toast.error('Verification failed.');
      }
    })();

    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, [searchParams, navigate, userEmail]);

  // Countdown tick
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // -------------------------------------------------------------
  // 🆕 Resend handler with detailed logging
  // -------------------------------------------------------------
  const handleResend = useCallback(async () => {
    console.log('🔄 [Resend] Clicked. userEmail =', userEmail);

    if (!userEmail) {
      console.warn('🔄 [Resend] No email available');
      toast.error('Email address is required. Please log in or register first.');
      return;
    }
    if (resendLoading) {
      console.log('🔄 [Resend] Already sending, ignoring click');
      return;
    }
    if (countdown > 0) {
      console.log('🔄 [Resend] In cooldown:', countdown, 'seconds left');
      return;
    }

    setResendLoading(true);
    try {
      console.log('🔄 [Resend] Calling API with:', userEmail);
      const result = await authService.resendVerification(userEmail);
      console.log('🔄 [Resend] API success:', result);

      setCountdown(RESEND_COOLDOWN_SECONDS);
      toast.success(`Verification email sent to ${userEmail}`, { duration: 5000 });
    } catch (err) {
      console.error('🔄 [Resend] API error:', err);
      const msg =
        err?.message ||
        err?.data?.detail ||
        err?.data?.non_field_errors?.[0] ||
        'Failed to resend verification email.';
      toast.error(typeof msg === 'string' ? msg : 'Failed to resend verification email.');
    } finally {
      setResendLoading(false);
    }
  }, [userEmail, resendLoading, countdown]);

  return (
    <div className="verify-screen">
      <div className="verify-card animate-fade-in">
        <div className="brand">
          <div className="brand-mark">
            <Zap size={20} color="white" fill="white" />
          </div>
          <span className="brand-name">AEEL-PMS</span>
        </div>

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

        <h1 className="verify-title">
          {status === 'success' ? 'Email Verified!' :
           status === 'error' ? 'Verification Failed' :
           'Check Your Email'}
        </h1>

        <p className="verify-desc">
          {status === 'success' ? (
            statusMessage || 'Your email has been verified. Redirecting to login...'
          ) : status === 'error' ? (
            statusMessage || 'The verification link is invalid or expired.'
          ) : (
            <>We&apos;ve sent a verification link to <strong>{userEmail || 'your email'}</strong>. Click the link in the email to activate your account. Don&apos;t forget to check your spam folder.</>
          )}
        </p>

        {userEmail && status !== 'success' && (
          <div className="verify-email-display">📧 {userEmail}</div>
        )}

        <div className="verify-actions">
          {(status === 'error' || status === null) && (
            <button
              className="verify-btn primary"
              onClick={handleResend}
              disabled={resendLoading || countdown > 0 || !userEmail}
            >
              {resendLoading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
              {resendLoading
                ? 'Sending...'
                : countdown > 0
                  ? `Resend in ${countdown}s`
                  : 'Resend Verification Email'}
            </button>
          )}
          {status === 'success' && (
            <button
              className="verify-btn secondary"
              onClick={() => {
                if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
                navigate('/login', { replace: true });
              }}
            >
              Go to Login Now
            </button>
          )}
        </div>

        <button className="verify-btn ghost" onClick={() => navigate('/login')}>
          <ArrowLeft size={16} /> Back to Sign In
        </button>
      </div>

      <style>{`
        .verify-screen { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--bg-primary); padding: 20px; }
        .verify-card { max-width: 440px; width: 100%; text-align: center; padding: 48px 40px; background: var(--bg-card); border-radius: var(--radius-xl); border: 1px solid var(--border-subtle); animation: fadeIn 0.5s ease-out; }
        .brand { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 24px; }
        .brand-mark { width: 36px; height: 36px; background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary)); border-radius: 10px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 16px var(--accent-glow); flex-shrink: 0; }
        .brand-name { font-family: var(--font-display); font-size: 19px; font-weight: 800; letter-spacing: -0.3px; }
        .verify-icon-wrapper { display: flex; justify-content: center; margin-bottom: 20px; }
        .verify-icon { width: 80px; height: 80px; border-radius: 50%; background: rgba(99, 102, 241, 0.1); display: flex; align-items: center; justify-content: center; }
        .verify-icon.success { background: rgba(52, 211, 153, 0.1); }
        .verify-icon.error { background: rgba(248, 113, 113, 0.1); }
        .verify-title { font-size: 24px; font-weight: 800; margin: 0 0 12px; }
        .verify-desc { color: var(--text-secondary); line-height: 1.6; margin: 0 0 16px; font-size: 14px; }
        .verify-email-display { background: rgba(52, 211, 153, 0.08); border-radius: 8px; padding: 10px 14px; margin-bottom: 20px; font-size: 14px; font-weight: 500; color: #34d399; word-break: break-all; }
        .verify-actions { display: flex; justify-content: center; gap: 10px; margin-bottom: 16px; }
        .verify-btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .verify-btn.primary { background: var(--accent-primary); color: #fff; }
        .verify-btn.primary:hover:not(:disabled) { opacity: 0.85; transform: translateY(-1px); }
        .verify-btn.primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .verify-btn.secondary { background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-default); }
        .verify-btn.secondary:hover { border-color: var(--accent-primary); color: var(--accent-primary); }
        .verify-btn.ghost { background: none; color: var(--text-secondary); justify-content: center; width: 100%; }
        .verify-btn.ghost:hover { color: var(--accent-primary); }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @media (max-width: 480px) { .verify-card { padding: 32px 20px; } .verify-title { font-size: 20px; } }
      `}</style>
    </div>
  );
}