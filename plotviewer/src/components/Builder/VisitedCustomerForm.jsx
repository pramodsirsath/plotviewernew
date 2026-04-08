import React, { useState, useEffect } from "react";
import API from "../../services/api";

const VisitedCustomerForm = ({ layouts, onSaved }) => {
  const [form, setForm] = useState({
    layoutId: "",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    customerAddress: "",
    requirements: "",
  });

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isMobile, setIsMobile] = useState(window.innerWidth < 600);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 600);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.layoutId || !form.customerName.trim()) {
      setMessage("Please select a layout and enter the customer name.");
      return;
    }

    try {
      setSaving(true);
      await API.post("/builder/visited-customer", form);

      setMessage("✅ Customer data saved successfully!");
      setForm({
        layoutId: form.layoutId,
        customerName: "",
        customerEmail: "",
        customerPhone: "",
        customerAddress: "",
        requirements: "",
      });

      onSaved?.();
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setMessage(err.response?.data?.message || "Failed to save customer data");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={styles.card}>
      <h3 style={styles.title}>📋 Add Visited Customer</h3>
      <p style={styles.subtitle}>
        Fill in the details of the customer who visited the site.
      </p>

      <form onSubmit={handleSubmit} style={styles.form}>
        <select
          name="layoutId"
          value={form.layoutId}
          onChange={handleChange}
          required
          style={styles.input}
        >
          <option value="">Select Layout</option>
          {(layouts || []).map((l) => (
            <option key={l._id} value={l._id}>
              {l.name}
            </option>
          ))}
        </select>

        {/* ROW 1 */}
        <div
          style={{
            ...styles.row,
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          }}
        >
          <input
            name="customerName"
            placeholder="Customer Name *"
            value={form.customerName}
            onChange={handleChange}
            required
            style={styles.input}
          />

          <input
            name="customerPhone"
            placeholder="Phone Number"
            value={form.customerPhone}
            onChange={handleChange}
            style={styles.input}
          />
        </div>

        {/* ROW 2 */}
        <div
          style={{
            ...styles.row,
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          }}
        >
          <input
            name="customerEmail"
            placeholder="Email Address"
            value={form.customerEmail}
            onChange={handleChange}
            style={styles.input}
          />

          <input
            name="customerAddress"
            placeholder="Address"
            value={form.customerAddress}
            onChange={handleChange}
            style={styles.input}
          />
        </div>

        <textarea
          name="requirements"
          placeholder="Customer Requirements (budget, plot size preference, etc.)"
          value={form.requirements}
          onChange={handleChange}
          style={{ ...styles.input, minHeight: 90, resize: "vertical" }}
        />

        {message && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              background: message.startsWith("✅")
                ? "rgba(34,197,94,0.12)"
                : "rgba(220,38,38,0.12)",
              color: message.startsWith("✅") ? "#16a34a" : "#dc2626",
              fontSize: "0.85rem",
              fontWeight: 600,
            }}
          >
            {message}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="btn btn-primary"
          style={styles.button}
        >
          {saving ? "Saving..." : "Save Customer Data"}
        </button>
      </form>
    </div>
  );
};

const styles = {
  card: {
    background: "var(--surface)",
    borderRadius: 20,
    padding: "24px",
    border: "1px solid var(--line)",
    maxWidth: "720px",
    margin: "0 auto",
    overflow: "hidden", // 🔥 prevents overflow
  },

  title: {
    margin: 0,
    fontWeight: 800,
    fontSize: "1.2rem",
    color: "var(--text)",
  },

  subtitle: {
    color: "var(--muted)",
    fontSize: "0.9rem",
    marginTop: 6,
    marginBottom: 18,
  },

  form: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },

  row: {
    display: "grid",
    gap: 14,
    width: "100%", // 🔥 ensures no overflow
  },

  input: {
    width: "100%", // 🔥 FIX MAIN ISSUE
    boxSizing: "border-box", // 🔥 prevents breaking
    padding: "12px 16px",
    borderRadius: 12,
    border: "1px solid var(--line)",
    fontSize: "0.95rem",
    background: "var(--surface-strong)",
    color: "var(--text)",
    outline: "none",
  },

  button: {
    alignSelf: "flex-end",
    marginTop: 10,
    padding: "10px 18px",
    borderRadius: 10,
    fontWeight: 600,
  },
};

export default VisitedCustomerForm;