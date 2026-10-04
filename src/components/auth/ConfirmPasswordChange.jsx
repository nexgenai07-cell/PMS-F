// src/components/auth/ConfirmPasswordChange.jsx
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { CheckCircle2, AlertCircle, Loader2, KeyRound } from "lucide-react";
import { motion } from "framer-motion";
import authService from "../../services/authService";

export default function ConfirmPasswordChange() {
  const [params]   = useSearchParams();
  const navigate   = useNavigate();

  const uid      = params.get("uid")   || "";
  const token    = params.get("token") || "";
  const encodedP = params.get("p")     || "";

  const [status, setStatus]   = useState("loading"); // loading | success | error
  const [message, setMessage] = useState("");

  // Decode the base64 password back to a plain string.
  // We don't display it — we just need to POST it with the token.
  const decodePassword = (enc) => {
    try {
      const json = atob(enc.replace(/-/g, "+").replace(/_/g, "/"));
      const obj  = JSON.parse(json);
      return obj?.p || "";
    } catch {
      return "";
    }
  };

  useEffect(() => {
    if (!uid || !token || !encodedP) {
      setStatus("error");
      setMessage("This confirmation link is missing required parameters.");
      return;
    }

    const newPassword = decodePassword(encodedP);
    if (!newPassword) {
      setStatus("error");
      setMessage("This confirmation link is malformed.");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await authService.confirmPasswordChange({
          uid,
          token,
          newPassword,
        });
        if (cancelled) return;
        setStatus("success");
        setMessage(
          res?.data?.message ||
          res?.message ||
          "Password changed successfully. You can now log in with your new password."
        );
      } catch (err) {
        if (cancelled) return;
        const detail =
          err?.error?.detail ||
          err?.detail ||
          err?.message ||
          "Failed to confirm password change.";
        setStatus("error");
        setMessage(typeof detail === "string" ? detail : "Failed to confirm password change.");
      }
    })();

    return () => { cancelled = true; };
  }, [uid, token, encodedP]);

  return (
    <div className="confirm-pw-page">
      <motion.div
        className="confirm-pw-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="confirm-pw-icon-wrap">
          {status === "loading" && <Loader2 size={28} className="spin confirm-pw-spin" />}
          {status === "success" && <CheckCircle2 size={28} color="#34d399" />}
          {status === "error"   && <AlertCircle  size={28} color="#f87171" />}
        </div>

        <h1 className="confirm-pw-title">
          {status === "loading" && "Confirming your password change…"}
          {status === "success" && "Password changed"}
          {status === "error"   && "Could not confirm"}
        </h1>

        <p className="confirm-pw-message">{message}</p>

        {status !== "loading" && (
          <div className="confirm-pw-actions">
            <Link className="btn-primary-modern" to="/login">
              Go to Login
            </Link>
          </div>
        )}
      </motion.div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }

        .confirm-pw-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-primary);
          padding: 24px;
        }
        .confirm-pw-card {
          width: 100%;
          max-width: 460px;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
          padding: 32px 28px;
          text-align: center;
          box-shadow: 0 12px 40px -20px rgba(0, 0, 0, 0.25);
        }
        .confirm-pw-icon-wrap {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 60px; height: 60px;
          border-radius: 50%;
          background: var(--bg-secondary);
          margin-bottom: 16px;
        }
        .confirm-pw-title {
          font-size: 20px;
          font-weight: 800;
          color: var(--text-primary);
          margin: 0 0 8px;
          letter-spacing: -0.3px;
        }
        .confirm-pw-message {
          font-size: 13.5px;
          color: var(--text-secondary);
          line-height: 1.6;
          margin: 0 0 20px;
        }
        .confirm-pw-actions {
          display: flex;
          justify-content: center;
          gap: 10px;
        }
        .btn-primary-modern {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 9px 18px;
          border: none;
          border-radius: 9px;
          background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          text-decoration: none;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}