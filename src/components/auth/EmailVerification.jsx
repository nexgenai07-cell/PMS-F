// src/components/auth/EmailVerification.jsx
import { useNavigate } from 'react-router-dom';
import { MailCheck, ArrowLeft, Zap } from 'lucide-react';

export default function EmailVerification() {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', padding: 20 }}>
      <div className="animate-scale-in" style={{ maxWidth: 480, width: '100%', textAlign: 'center', padding: 48, background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <div style={{ width: 80, height: 80, background: 'rgba(108,99,255,0.12)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'pulse-glow 2s ease infinite' }}>
            <MailCheck size={36} style={{ color: 'var(--accent-primary)' }} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
          <Zap size={18} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700 }}>FlowDesk</span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>Check your inbox</h1>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 32 }}>
          We've sent a verification link to your email address. Click the link to activate your account and get started.
        </p>
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 28, fontSize: 13, color: 'var(--text-muted)' }}>
          Didn't receive it? Check your spam folder or <span style={{ color: 'var(--accent-secondary)', cursor: 'pointer' }}>resend the email</span>.
        </div>
        <button className="btn btn-ghost" onClick={() => navigate('/login')} style={{ width: '100%', justifyContent: 'center' }}>
          <ArrowLeft size={16} /> Back to Sign In
        </button>
      </div>
    </div>
  );
}