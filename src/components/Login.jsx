import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        <div className="logo-area" style={{ justifyContent: "center", marginBottom: "1.5rem" }}>
          <span className="icon">📖</span>
          <h1 style={{ margin: 0 }}>Smart Bookmark</h1>
        </div>

        <h2 style={{ textAlign: "center", marginBottom: "1.5rem", fontFamily: "var(--font-heading)" }}>התחברות למערכת</h2>

        {isMock && (
          <div className="mock-badge-banner">
            ⚠️ פועל במצב אופליין (דמוי). ניתן להשתמש בכל אימייל וסיסמה שתבחרו, או להירשם תחילה.
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
            <label htmlFor="password">סיסמה</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>

          <button disabled={loading} type="submit" className="btn btn-primary btn-block">
            {loading ? "מתחבר..." : "התחבר"}
          </button>
        </form>

        <div className="auth-footer-text">
          עדיין אין לך חשבון? <Link to="/signup" className="auth-link">הרשם עכשיו</Link>
        </div>
      </div>
    </div>
  );
}
