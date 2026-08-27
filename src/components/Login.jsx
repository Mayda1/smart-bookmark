import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import { MailIcon, LockIcon, EyeIcon, EyeOffIcon } from "./AuthIcons";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, isMock } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setError("");
      setLoading(true);
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err.message || "ההתחברות נכשלה. אנא נסה שוב.");
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

        <h2 className="auth-title">התחברות למערכת</h2>

        {isMock && (
          <div className="mock-badge-banner">
            <span>⚠️</span>
            <span>פועל במצב אופליין (דמוי). ניתן להשתמש בכל אימייל וסיסמה שתבחרו, או להירשם תחילה.</span>
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
            <label htmlFor="password">סיסמה</label>
            <div className="input-with-icon">
              <LockIcon />
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                className="has-toggle"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
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

          <button disabled={loading} type="submit" className="btn btn-primary btn-block">
            {loading ? (
              <>
                <span className="btn-spinner" />
                <span>מתחברת...</span>
              </>
            ) : (
              "התחבר"
            )}
          </button>
        </form>

        <div className="auth-footer-text">
          עדיין אין לך חשבון? <Link to="/signup" className="auth-link">הרשם עכשיו</Link>
        </div>
      </div>
    </div>
  );
}
