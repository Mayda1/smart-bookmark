import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { MailIcon, LockIcon, EyeIcon, EyeOffIcon } from "./AuthIcons";

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signup, isMock } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();

    if (password !== passwordConfirm) {
      return setError("הסיסמאות אינן תואמות");
    }

    if (password.length < 6) {
      return setError("הסיסמה חייבת להכיל לפחות 6 תווים");
    }

    try {
      setError("");
      setLoading(true);
      await signup(email, password);
      navigate("/");
    } catch (err) {
      setError(err.message || "הרשמה נכשלה. אנא נסה שוב.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-card-container">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="icon">📖</span>
          <h1>Smart Bookmark</h1>
          <p>הסימנייה החכמה שמחברת בין הספר הפיזי לדיגיטלי</p>
        </div>

        <h2 className="auth-title">הרשמה למערכת</h2>

        {isMock && (
          <div className="mock-badge-banner">
            <span>⚠️</span>
            <span>פועל במצב אופליין (דמוי). המשתמש יישמר מקומית ב-LocalStorage.</span>
          </div>
        )}

        {error && (
          <div className="alert alert-error">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">כתובת אימייל</label>
            <div className="input-with-icon">
              <MailIcon />
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="user@example.com"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password">סיסמה (לפחות 6 תווים)</label>
            <div className="input-with-icon">
              <LockIcon />
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                className="has-toggle"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="••••••••"
              />
              <button
                type="button"
                className="input-toggle-btn"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "הסתר סיסמה" : "הצג סיסמה"}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password-confirm">אימות סיסמה</label>
            <div className="input-with-icon">
              <LockIcon />
              <input
                type={showPassword ? "text" : "password"}
                id="password-confirm"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button disabled={loading} type="submit" className="btn btn-primary btn-block">
            {loading ? (
              <>
                <span className="btn-spinner" />
                <span>יוצרת חשבון...</span>
              </>
            ) : (
              "הרשם עכשיו"
            )}
          </button>
        </form>

        <div className="auth-footer-text">
          כבר יש לך חשבון? <Link to="/login" className="auth-link">התחבר כאן</Link>
        </div>
      </div>
    </div>
  );
}
