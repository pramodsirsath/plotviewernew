import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../../services/api";

const Signup = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [form, setForm] = useState({
    name: "",
    mobile: "",
    email: "",
    password: "",
    confirmPassword: "",
    otp: "",
    role: "builder",
    builderEmail: "",
  });

  const handleChange = (event) => {
    setForm((previous) => ({ ...previous, [event.target.name]: event.target.value }));
  };

  const sendOtp = async (event) => {
    event.preventDefault();
    setMessage("");

    if (form.password !== form.confirmPassword) {
      setMessageType("error");
      setMessage("Passwords do not match.");
      return;
    }

    if (form.role === "staff" && !form.builderEmail.trim()) {
      setMessageType("error");
      setMessage("Please enter your builder's email address.");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await API.post("/auth/send-otp", {
        name: form.name,
        mobile: form.mobile,
        email: form.email,
        password: form.password,
        role: form.role,
        builderEmail: form.role === "staff" ? form.builderEmail : "",
      });
      setMessageType("success");
      setMessage(res.data.message || "OTP sent successfully.");
      setStep(2);
    } catch (error) {
      console.error(error);
      setMessageType("error");
      setMessage(error.response?.data?.message || "Something went wrong while sending OTP.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const verifyOtp = async (event) => {
    event.preventDefault();
    setMessage("");

    try {
      setIsSubmitting(true);
      await API.post("/auth/verify-otp", {
        email: form.email,
        otp: form.otp,
      });

      setMessageType("success");
      if (form.role === "staff") {
        setMessage("Signup completed! Your builder will need to approve your request before you can log in.");
      } else {
        setMessage("Signup completed. Please sign in.");
      }
      setTimeout(() => navigate("/login"), 2000);
    } catch (error) {
      console.error(error);
      setMessageType("error");
      setMessage(error.response?.data?.message || "OTP verification failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isStaff = form.role === "staff";

  return (
    <div className="auth-shell">
      <section className="auth-hero">
        <div className="brand-mark">
          <span className="brand-badge" /> PlotViewer
        </div>
        <div className="kicker">Interactive Plot Selling</div>
        <h1 className="hero-title">Map every plot with confidence before you share it.</h1>
        <p className="hero-copy">
          Sign up once, verify your email with OTP, and unlock a cleaner workflow for layout creation, builder coordination, and customer viewing.
        </p>
        <div className="metric-row">
          <div className="metric-card">
            <div className="metric-label">Plot Mapping</div>
            <div className="metric-value">Auto Detect</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Builder Updates</div>
            <div className="metric-value">Tap Status</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Customer View</div>
            <div className="metric-value">Touch Ready</div>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="kicker">New Account</div>
        <h2 className="panel-title" style={{ marginTop: 12 }}>
          {step === 1 ? "Create your account" : "Verify your OTP"}
        </h2>
        <p className="panel-subtitle">
          {step === 1
            ? "Start with your personal details. We will send a one-time verification code to your email."
            : `We sent a verification code to ${form.email || "your email"}.`}
        </p>

        {step === 1 ? (
          <form className="auth-form" onSubmit={sendOtp}>
            {/* Role Toggle */}
            <div className="role-toggle" style={{ display: "flex", gap: 0, borderRadius: 12, overflow: "hidden", border: "1px solid var(--line)", marginBottom: 4 }}>
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, role: "builder" }))}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  transition: "all 0.25s ease",
                  background: !isStaff ? "var(--teal)" : "var(--surface-strong)",
                  color: !isStaff ? "#fff" : "var(--muted)",
                }}
              >
                🏗️ I'm a Builder
              </button>
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, role: "staff" }))}
                style={{
                  flex: 1,
                  padding: "12px 16px",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  transition: "all 0.25s ease",
                  background: isStaff ? "var(--teal)" : "var(--surface-strong)",
                  color: isStaff ? "#fff" : "var(--muted)",
                }}
              >
                👷 I'm Staff
              </button>
            </div>

            {isStaff && (
              <div className="staff-notice" style={{
                padding: "12px 14px",
                borderRadius: 12,
                background: "var(--amber-soft, rgba(245,158,11,0.12))",
                color: "var(--amber, #d97706)",
                fontSize: "0.85rem",
                fontWeight: 600,
                lineHeight: 1.5,
                marginBottom: 4,
              }}>
                ⚡ Your builder will receive a request and must approve it before you can log in.
              </div>
            )}

            <div className="form-row">
              <label className="form-label">
                Full Name
                <input className="form-input" name="name" placeholder="Your name" value={form.name} onChange={handleChange} required />
              </label>
              <label className="form-label">
                Mobile Number
                <input className="form-input" name="mobile" placeholder="10-digit mobile" value={form.mobile} onChange={handleChange} required />
              </label>
            </div>

            <label className="form-label">
              Email Address
              <input className="form-input" type="email" name="email" placeholder="name@example.com" value={form.email} onChange={handleChange} required />
            </label>

            {isStaff && (
              <label className="form-label">
                Builder's Email Address
                <input className="form-input" type="email" name="builderEmail" placeholder="builder@example.com" value={form.builderEmail} onChange={handleChange} required />
              </label>
            )}

            <div className="form-row">
              <label className="form-label">
                Password
                <input className="form-input" type="password" name="password" placeholder="Create a password" value={form.password} onChange={handleChange} required />
              </label>
              <label className="form-label">
                Confirm Password
                <input className="form-input" type="password" name="confirmPassword" placeholder="Repeat password" value={form.confirmPassword} onChange={handleChange} required />
              </label>
            </div>

            {message && (
              <div className={messageType === "error" ? "status-note status-error" : "status-note status-success"}>
                {message}
              </div>
            )}

            <div className="button-row">
              <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Sending OTP..." : "Send OTP"}
              </button>
              <Link className="btn btn-secondary" to="/login">
                I Already Have an Account
              </Link>
            </div>
          </form>
        ) : (
          <form className="auth-form" onSubmit={verifyOtp}>
            <label className="form-label">
              Enter OTP
              <input className="form-input" name="otp" placeholder="6-digit verification code" value={form.otp} onChange={handleChange} required />
            </label>

            {message && (
              <div className={messageType === "error" ? "status-note status-error" : "status-note status-success"}>
                {message}
              </div>
            )}

            <div className="button-row">
              <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Verifying..." : "Verify OTP"}
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => setStep(1)}>
                Edit Details
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
};

export default Signup;
