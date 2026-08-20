import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
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
        <div className="logo-area" style={{ justifyContent: "center", marginBottom: "1.5rem" }}>
          <span className="icon">📖</span>
          <h1 style={{ margin: 0 }}>Smart Bookmark</h1>
        </div>

        <h2 style={{ textAlign: "center", marginBottom: "1.5rem", fontFamily: "var(--font-heading)" }}>הרשמה למערכת</h2>

        {isMock && (
          <div className="mock-badge-banner">
            ⚠️ פועל במצב אופליין (דמוי). המשתמש יישמר מקומית ב-LocalStorage.
          </div>
        )}

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">כתובת אימייל</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="user@example.com"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">סיסמה (לפחות 6 תווים)</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password-confirm">אימות סיסמה</label>
            <input
              type="password"
              id="password-confirm"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>

          <button disabled={loading} type="submit" className="btn btn-primary btn-block">
            {loading ? "יוצר חשבון..." : "הרשם עכשיו"}
          </button>
        </form>

        <div className="auth-footer-text">
          כבר יש לך חשבון? <Link to="/login" className="auth-link">התחבר כאן</Link>
        </div>
      </div>
    </div>
  );
}
