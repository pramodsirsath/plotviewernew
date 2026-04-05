import React, { useEffect, useState } from "react";
import API from "../../services/api";

const VisitedCustomerList = ({ layoutId, layoutName }) => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [sheetUrl, setSheetUrl] = useState("");

  useEffect(() => {
    if (layoutId) fetchCustomers();
  }, [layoutId]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const res = await API.get(`/builder/visited-customers/${layoutId}`);
      setCustomers(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCSVExport = async () => {
    try {
      const res = await API.get(`/builder/visited-customers/${layoutId}/export-csv`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = `visited_customers_${layoutId}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert("Failed to export CSV");
    }
  };

  const handleSheetsExport = async () => {
    try {
      setExporting(true);
      const res = await API.post(`/builder/visited-customers/${layoutId}/export-sheets`);
      setSheetUrl(res.data.url || "");
      if (res.data.url) {
        window.open(res.data.url, "_blank");
      }
    } catch (err) {
      alert(err.response?.data?.message || "Failed to export to Google Sheets");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>Loading customers...</div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h3 style={styles.title}>👥 Visited Customers</h3>
          <p style={styles.subtitle}>{customers.length} customers recorded for {layoutName}</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-secondary" onClick={handleCSVExport} disabled={customers.length === 0}>
            📥 Export CSV
          </button>
          <button className="btn btn-primary" onClick={handleSheetsExport} disabled={exporting || customers.length === 0}>
            {exporting ? "Creating..." : "📊 Google Sheets"}
          </button>
        </div>
      </div>

      {sheetUrl && (
        <a href={sheetUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", padding: "10px 14px", borderRadius: 12, background: "rgba(34,197,94,0.12)", color: "#16a34a", fontSize: "0.85rem", fontWeight: 700, marginBottom: 12 }}>
          ✅ Google Sheet created — Click to open
        </a>
      )}

      {customers.length === 0 ? (
        <p style={{ color: "var(--muted)", textAlign: "center", padding: "32px 0" }}>
          No customer visits recorded yet. Staff or builders can add customer data.
        </p>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Phone</th>
                <th style={styles.th}>Email</th>
                <th style={styles.th}>Requirements</th>
                <th style={styles.th}>Added By</th>
                <th style={styles.th}>Date</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c._id} style={styles.tr}>
                  <td style={styles.td}><strong>{c.customerName}</strong></td>
                  <td style={styles.td}>{c.customerPhone || "-"}</td>
                  <td style={styles.td}>{c.customerEmail || "-"}</td>
                  <td style={styles.td}>{c.requirements || "-"}</td>
                  <td style={styles.td}>{c.staffId?.name || "Builder"}</td>
                  <td style={styles.td}>{new Date(c.createdAt).toLocaleDateString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    background: "var(--surface)",
    borderRadius: 20,
    padding: "24px",
    border: "1px solid var(--line)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 16,
  },
  title: {
    margin: 0,
    fontFamily: "'Outfit','Inter',sans-serif",
    fontWeight: 800,
    fontSize: "1.15rem",
    color: "var(--text)",
  },
  subtitle: {
    color: "var(--muted)",
    fontSize: "0.85rem",
    marginTop: 4,
  },
  tableWrap: {
    overflowX: "auto",
    borderRadius: 14,
    border: "1px solid var(--line)",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.85rem",
  },
  th: {
    textAlign: "left",
    padding: "10px 14px",
    background: "var(--surface-strong)",
    fontWeight: 700,
    color: "var(--text)",
    borderBottom: "1px solid var(--line)",
    whiteSpace: "nowrap",
  },
  tr: {
    transition: "background 0.15s",
  },
  td: {
    padding: "10px 14px",
    borderBottom: "1px solid var(--line)",
    color: "var(--text)",
    maxWidth: 200,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
};

export default VisitedCustomerList;
