import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import API from "../../services/api";
import VisitedCustomerForm from "./VisitedCustomerForm";
import VisitedCustomerList from "./VisitedCustomerList";

const BuilderDashboard = () => {
  const [layouts, setLayouts] = useState([]);
  const [staffRequests, setStaffRequests] = useState([]);
  const [myStaff, setMyStaff] = useState([]);
  const [activeSection, setActiveSection] = useState("layouts"); // layouts, customers, staff
  const [selectedLayoutId, setSelectedLayoutId] = useState("");

  useEffect(() => {
    fetchLayouts();
    fetchStaffRequests();
    fetchMyStaff();
  }, []);

  const fetchLayouts = async () => {
    try {
      const res = await API.get("/builder/getLayouts");
      setLayouts(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchStaffRequests = async () => {
    try {
      const res = await API.get("/builder/staff-requests");
      setStaffRequests(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchMyStaff = async () => {
    try {
      const res = await API.get("/builder/my-staff");
      setMyStaff(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleApprove = async (staffId) => {
    try {
      await API.post(`/builder/approve-staff/${staffId}`);
      fetchStaffRequests();
      fetchMyStaff();
    } catch (err) {
      alert(err.response?.data?.message || "Failed to approve");
    }
  };

  const handleReject = async (staffId) => {
    if (!window.confirm("Reject this staff request?")) return;
    try {
      await API.post(`/builder/reject-staff/${staffId}`);
      fetchStaffRequests();
    } catch (err) {
      alert("Failed to reject");
    }
  };

  const stats = useMemo(() => {
    const totalPlots = layouts.reduce((sum, layout) => sum + layout.plots.length, 0);
    const soldPlots = layouts.reduce(
      (sum, layout) => sum + layout.plots.filter((plot) => plot.status === "Sold").length,
      0
    );
    return { assignedLayouts: layouts.length, totalPlots, soldPlots, staffCount: myStaff.length };
  }, [layouts, myStaff]);

  const role = localStorage.getItem("role");

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <div className="kicker">Builder Dashboard</div>
          <h1 className="page-title">Your workspace for layouts, customers, and team.</h1>
          <p className="page-subtitle">
            Manage layouts, track visited customers, and coordinate with your staff members.
          </p>
        </div>
      </div>

      <div className="metric-row">
        <div className="metric-card">
          <div className="metric-label">Assigned Layouts</div>
          <div className="metric-value">{stats.assignedLayouts}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Total Plots</div>
          <div className="metric-value">{stats.totalPlots}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Sold Plots</div>
          <div className="metric-value">{stats.soldPlots}</div>
        </div>
        {role === "builder" && (
          <div className="metric-card">
            <div className="metric-label">Staff Members</div>
            <div className="metric-value">{stats.staffCount}</div>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: 0, borderRadius: 16, overflow: 'hidden', border: '1px solid var(--line)', marginBottom: 24, marginTop: 8 }}>
        {["layouts", "customers", ...(role === "builder" ? ["staff"] : [])].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveSection(tab)}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.9rem',
              transition: 'all 0.25s ease',
              background: activeSection === tab ? 'var(--teal)' : 'var(--surface)',
              color: activeSection === tab ? '#fff' : 'var(--muted)',
              textTransform: 'capitalize',
            }}
          >
            {tab === "layouts" ? "📐 Layouts" : tab === "customers" ? "👥 Customers" : "👷 Staff"}
          </button>
        ))}
      </div>

      {/* Staff Requests Banner */}
      {role === "builder" && staffRequests.length > 0 && (
        <div style={{ padding: '16px 20px', borderRadius: 16, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', marginBottom: 20 }}>
          <strong style={{ color: '#d97706', fontSize: '0.95rem' }}>⚡ {staffRequests.length} staff request(s) pending</strong>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {staffRequests.map((staff) => (
              <div key={staff._id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)' }}>{staff.name}</span>
                <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{staff.email}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" onClick={() => handleApprove(staff._id)} style={{ padding: '6px 14px', fontSize: '0.85rem' }}>
                    ✅ Approve
                  </button>
                  <button className="btn btn-secondary" onClick={() => handleReject(staff._id)} style={{ padding: '6px 14px', fontSize: '0.85rem' }}>
                    ❌ Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === LAYOUTS TAB === */}
      {activeSection === "layouts" && (
        <>
          {layouts.length === 0 ? (
            <div className="empty-card">
              <h3 className="panel-title">Nothing assigned yet</h3>
              <p className="panel-subtitle">Once an admin assigns a layout to you, it will appear here ready for status updates.</p>
            </div>
          ) : (
            <div className="dashboard-grid">
              {layouts.map((layout) => (
                <article key={layout._id} className="layout-card">
                  <div className="layout-card__top">
                    <div>
                      <div className="kicker">Assigned Layout</div>
                      <h3 className="panel-title" style={{ marginTop: 10 }}>{layout.name}</h3>
                      <p className="panel-subtitle">{layout.plots.length} plots available for review.</p>
                    </div>
                    <div className="layout-card__meta">
                      <span className="pill pill-accent">Tap to edit status</span>
                      <span className="pill">Mobile rotation ready</span>
                    </div>
                  </div>

                  <div className="layout-card__footer">
                    <div className="inline-note">Keep the map clean until you select a plot.</div>
                    <Link className="btn btn-primary" to={`/builder/layout/${layout._id}`}>
                      Open Layout
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {/* === CUSTOMERS TAB === */}
      {activeSection === "customers" && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <VisitedCustomerForm layouts={layouts} onSaved={() => {}} />

          {layouts.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text)' }}>View customers for:</span>
                <select
                  value={selectedLayoutId}
                  onChange={(e) => setSelectedLayoutId(e.target.value)}
                  style={{ padding: '8px 14px', borderRadius: 12, border: '1px solid var(--line)', fontSize: '0.9rem', background: 'var(--surface)' }}
                >
                  <option value="">Select layout...</option>
                  {layouts.map((l) => (
                    <option key={l._id} value={l._id}>{l.name}</option>
                  ))}
                </select>
              </div>

              {selectedLayoutId && (
                <VisitedCustomerList
                  key={selectedLayoutId}
                  layoutId={selectedLayoutId}
                  layoutName={layouts.find((l) => l._id === selectedLayoutId)?.name || ""}
                />
              )}
            </>
          )}
        </div>
      )}

      {/* === STAFF TAB === */}
      {activeSection === "staff" && role === "builder" && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {myStaff.length === 0 && staffRequests.length === 0 ? (
            <div className="empty-card">
              <h3 className="panel-title">No staff members yet</h3>
              <p className="panel-subtitle">When staff sign up with your email, they'll appear here for approval.</p>
            </div>
          ) : (
            <>
              <h3 style={{ fontFamily: "'Outfit','Inter',sans-serif", fontWeight: 800, color: 'var(--text)', margin: 0 }}>
                Your Staff ({myStaff.length})
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                {myStaff.map((staff) => (
                  <div key={staff._id} style={{
                    padding: '16px 20px', borderRadius: 16, border: '1px solid var(--line)',
                    background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 4,
                  }}>
                    <strong style={{ fontSize: '0.95rem', color: 'var(--text)' }}>{staff.name}</strong>
                    <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{staff.email}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>📱 {staff.mobile || "N/A"}</span>
                    <span className="pill pill-accent" style={{ marginTop: 4, alignSelf: 'flex-start' }}>Active</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default BuilderDashboard;
