import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../../services/api";

const Login = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [rememberMe, setRememberMe] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");

  // Auto-fill from remembered credentials
  useEffect(() => {
    const savedEmail = localStorage.getItem("rememberedEmail");
    const savedPassword = localStorage.getItem("rememberedPassword");
    if (savedEmail && savedPassword) {
      setForm({ email: savedEmail, password: savedPassword });
      setRememberMe(true);
    }
  }, []);

  const handleChange = (event) => {
    setForm((previous) => ({ ...previous, [event.target.name]: event.target.value }));
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setMessage("");

    try {
      setIsSubmitting(true);
      const res = await API.post("/auth/login", form);

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("role", res.data.user.role);

      // Remember Me
      if (rememberMe) {
        localStorage.setItem("rememberedEmail", form.email);
        localStorage.setItem("rememberedPassword", form.password);
      } else {
        localStorage.removeItem("rememberedEmail");
        localStorage.removeItem("rememberedPassword");
      }

      const role = res.data.user.role;
      setMessageType("success");
      setMessage("Login successful. Redirecting...");

      if (role === "admin") {
        navigate("/admin-dashboard");
      } else {
        navigate("/builder-dashboard");
      }
    } catch (error) {
      console.error(error);
      setMessageType("error");
      setMessage(error.response?.data?.message || "Login failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-hero">
        <div className="brand-mark">
          <span className="brand-badge" /> PlotViewer
        </div>
        <div className="kicker">Builder + Admin Workspace</div>
        <h1 className="hero-title">Step into the live plot control room.</h1>
        <p className="hero-copy">
          Review layouts, assign builders, rotate plans on mobile, and keep every plot status synced from one clean workspace.
        </p>
        <div className="feature-list">
          <div className="feature-item">
            <div className="feature-icon">A</div>
            <div>
              <strong>Admin ready</strong>
              <div className="inline-note">Create layouts, map plots, and publish customer-ready views.</div>
            </div>
          </div>
          <div className="feature-item">
            <div className="feature-icon">B</div>
            <div>
              <strong>Builder friendly</strong>
              <div className="inline-note">Tap a plot, rotate with touch, and update status in seconds.</div>
            </div>
          </div>
          <div className="feature-item">
            <div className="feature-icon">C</div>
            <div>
              <strong>Customer clear</strong>
              <div className="inline-note">Interactive layouts stay clean until a plot is selected.</div>
            </div>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="kicker">Welcome Back</div>
        <h2 className="panel-title" style={{ marginTop: 12 }}>Sign in to continue</h2>
        <p className="panel-subtitle">Use your registered email and password to open your workspace.</p>

        <form className="auth-form" onSubmit={handleLogin}>
          <label className="form-label">
            Email Address
            <input className="form-input" name="email" type="email" placeholder="name@example.com" value={form.email} onChange={handleChange} required />
          </label>

          <label className="form-label">
            Password
            <input className="form-input" type="password" name="password" placeholder="Enter your password" value={form.password} onChange={handleChange} required />
          </label>

          <label className="remember-me-label" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.9rem", color: "var(--muted)", marginTop: 4 }}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: "var(--teal)", cursor: "pointer" }}
            />
            Remember me
          </label>

          {message && (
            <div className={messageType === "error" ? "status-note status-error" : "status-note status-success"}>
              {message}
            </div>
          )}

          <div className="button-row">
            <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Signing In..." : "Sign In"}
            </button>
            <Link className="btn btn-secondary" to="/">
              Create Account
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
};

export default Login;
