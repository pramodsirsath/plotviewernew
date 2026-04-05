import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../../services/api";
import LayoutCard from "../../components/Admin/LayoutCard";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [layouts, setLayouts] = useState([]);

  useEffect(() => {
    const loadLayouts = async () => {
      try {
        const res = await API.get("/layouts/admin");
        setLayouts(res.data);
      } catch (error) {
        console.error(error);
      }
    };

    loadLayouts();
  }, []);

  const fetchLayouts = async () => {
    try {
      const res = await API.get("/layouts/admin");
      setLayouts(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const stats = useMemo(() => {
    const totalPlots = layouts.reduce((sum, layout) => sum + layout.plots.length, 0);
    const publicLayouts = layouts.filter((layout) => layout.isPublic).length;
    const assignedLayouts = layouts.filter((layout) => (layout.assignedBuilders || []).length > 0).length;

    return { totalLayouts: layouts.length, totalPlots, publicLayouts, assignedLayouts };
  }, [layouts]);

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <div className="kicker">Admin Dashboard</div>
          <h1 className="page-title">Build, assign, and publish layouts with more clarity.</h1>
          <p className="page-subtitle">
            Manage your uploaded plans, track how many plots are mapped, and keep builder assignments ready before you share layouts with customers.
          </p>
        </div>
        <div className="dashboard-actions">
          <button className="btn btn-primary" onClick={() => navigate("/uploadimage")}>
            Create New Layout
          </button>
        </div>
      </div>

      <div className="metric-row">
        <div className="metric-card">
          <div className="metric-label">Layouts</div>
          <div className="metric-value">{stats.totalLayouts}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Mapped Plots</div>
          <div className="metric-value">{stats.totalPlots}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Assigned Layouts</div>
          <div className="metric-value">{stats.assignedLayouts}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Shared Publicly</div>
          <div className="metric-value">{stats.publicLayouts}</div>
        </div>
      </div>

      {layouts.length === 0 ? (
        <div className="empty-card">
          <h3 className="panel-title">No layouts yet</h3>
          <p className="panel-subtitle">Upload your first image, let the analyzer map the plots, and start assigning builders.</p>
        </div>
      ) : (
        <div className="dashboard-masonry">
          {layouts.map((layout) => (
            <LayoutCard key={layout._id} layout={layout} refresh={fetchLayouts} />
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
