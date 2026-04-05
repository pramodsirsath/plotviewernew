import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../../services/api";
import BuilderSelector from "./BuilderSelector";
import { resolveServerUrl } from "../../config/runtime";

const getPublicLayoutLink = (layout) => {
  if (!layout?.isPublic || !layout?.publicToken || typeof window === "undefined") {
    return "";
  }

  return new URL(`/layout/view/${layout.publicToken}`, window.location.origin).toString();
};

const copyText = async (value) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const helper = document.createElement("textarea");
  helper.value = value;
  helper.setAttribute("readonly", "");
  helper.style.position = "absolute";
  helper.style.left = "-9999px";
  document.body.appendChild(helper);
  helper.select();
  document.execCommand("copy");
  document.body.removeChild(helper);
};

const LayoutCard = ({ layout, refresh }) => {
  const navigate = useNavigate();
  const assignmentKey = (layout.assignedBuilders || [])
    .map((builder) => String(builder._id || builder))
    .sort()
    .join("-");
  const publicLayoutLink = useMemo(() => getPublicLayoutLink(layout), [layout]);
  const [shareLink, setShareLink] = useState(publicLayoutLink);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [showAssignments, setShowAssignments] = useState(false);

  useEffect(() => {
    setShareLink(publicLayoutLink);
  }, [publicLayoutLink]);

  useEffect(() => {
    if (!copyMessage) {
      return undefined;
    }

    const timer = window.setTimeout(() => setCopyMessage(""), 2200);
    return () => window.clearTimeout(timer);
  }, [copyMessage]);

  const generatePublicLink = async () => {
    try {
      setIsCreatingLink(true);
      const res = await API.post(`/layouts/${layout._id}/public`);
      const nextLink = res.data.link || getPublicLayoutLink({ ...layout, isPublic: true });
      setShareLink(nextLink);
      await copyText(nextLink);
      setCopyMessage("Customer link copied");
      refresh?.();
    } catch (error) {
      console.error(error);
      alert("Could not generate public link");
    } finally {
      setIsCreatingLink(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareLink) {
      await generatePublicLink();
      return;
    }

    try {
      await copyText(shareLink);
      setCopyMessage("Customer link copied");
    } catch (error) {
      console.error(error);
      alert("Could not copy link");
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to completely delete this layout? This action cannot be undone.")) return;
    
    try {
      await API.delete(`/layouts/${layout._id}`);
      refresh?.();
    } catch (error) {
      console.error(error);
      alert("Failed to delete layout. Please try again.");
    }
  };

  return (
    <article className="layout-card layout-card--compact">
      <div className="preview-frame layout-card__banner">
        <img
          src={resolveServerUrl(layout.imageUrl)}
          alt={layout.name}
          style={{ aspectRatio: "16 / 7", objectFit: "cover" }}
        />
      </div>

      <div className="layout-card__content">
        <div className="kicker">Mapped Layout</div>
        <h3 className="panel-title layout-card__title">{layout.name}</h3>
        <p className="panel-subtitle layout-card__subtitle">
          {layout.plots.length} plots mapped and ready for builder assignment or customer sharing.
        </p>

        <div className="layout-card__meta">
          <span className="pill pill-accent">{layout.assignedBuilders?.length || 0} builders assigned</span>
          <span className="pill">{layout.plots.length} plots</span>
          <span className={layout.isPublic ? "pill pill-warm" : "pill"}>
            {layout.isPublic ? "Public Link Active" : "Private Layout"}
          </span>
        </div>

        <div className="layout-card__builder-strip">
          <strong>Builders:</strong>
          <span className="inline-note">
            {layout.assignedBuilders?.length
              ? layout.assignedBuilders.map((builder) => builder.name).join(", ")
              : "No builders assigned yet"}
          </span>
        </div>

        {copyMessage && (
          <div className="status-note status-success" style={{ marginTop: 8 }}>
            {copyMessage}
          </div>
        )}
      </div>

      <div className="layout-card__actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" onClick={handleCopyLink} disabled={isCreatingLink}>
          {isCreatingLink ? "Preparing Link..." : shareLink ? "Copy Customer Link" : "Create Customer Link"}
        </button>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => setShowAssignments((previous) => !previous)}
        >
          {showAssignments ? "Hide Builder Panel" : "Manage Builders"}
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => navigate(`/layout/${layout._id}/edit`)}
        >
          ✏️ Edit Plots
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => navigate(`/layout/${layout._id}/3d-editor`)}
        >
          🧊 3D Editor
        </button>
        <button
          className="btn"
          style={{ backgroundColor: '#ff4d4f', color: '#fff', borderColor: '#ff4d4f', marginLeft: 'auto' }}
          type="button"
          onClick={handleDelete}
        >
          Delete Layout
        </button>
      </div>

      {showAssignments && (
        <div className="layout-card__drawer">
          <BuilderSelector
            key={`${layout._id}-${assignmentKey}`}
            layoutId={layout._id}
            assignedBuilders={layout.assignedBuilders}
            onAssigned={refresh}
          />
        </div>
      )}

      {/* Location & Direction Settings */}
      <LayoutSettings layout={layout} refresh={refresh} />
    </article>
  );
};

// ============ Location & Direction mini-panel ============
const LayoutSettings = ({ layout, refresh }) => {
  const [showSettings, setShowSettings] = useState(false);
  const navigate = useNavigate();
  const [locationUrl, setLocationUrl] = useState(layout.locationUrl || "");
  const [frontDirection, setFrontDirection] = useState(layout.frontDirection || 0);
  const [saving, setSaving] = useState(false);
  const [isDraggingCompass, setIsDraggingCompass] = useState(false);
  const compassRef = React.useRef(null);

  const saveLocation = async () => {
    try {
      setSaving(true);
      await API.put(`/layouts/${layout._id}/location`, { locationUrl });
      refresh?.();
    } catch (e) {
      alert("Failed to save location");
    } finally {
      setSaving(false);
    }
  };

  const saveDirection = async () => {
    try {
      setSaving(true);
      await API.put(`/layouts/${layout._id}/direction`, { frontDirection });
      refresh?.();
    } catch (e) {
      alert("Failed to save direction");
    } finally {
      setSaving(false);
    }
  };

  // Draggable compass: compute angle from center on pointer move
  const getAngleFromEvent = (e) => {
    if (!compassRef.current) return frontDirection;
    const rect = compassRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const angle = Math.atan2(clientX - cx, -(clientY - cy)) * (180 / Math.PI);
    return ((angle % 360) + 360) % 360;
  };

  React.useEffect(() => {
    if (!isDraggingCompass) return;
    const onMove = (e) => {
      e.preventDefault();
      setFrontDirection(Math.round(getAngleFromEvent(e)));
    };
    const onUp = () => setIsDraggingCompass(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [isDraggingCompass]);

  if (!showSettings) {
    return (
      <>
        <div className="layout-card__actions" style={{ paddingTop: 0, borderTop: 'none' }}>
          <button className="btn btn-secondary" onClick={() => setShowSettings(true)}>
            ⚙️ Location & Direction
          </button>
          <button className="btn btn-secondary" onClick={() => navigate(`/layout/${layout._id}/map-editor`)}>
            🗺️ Place on Map
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="layout-card__drawer" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <strong style={{ fontSize: '0.95rem' }}>📍 Location & Compass</strong>
          <button onClick={() => setShowSettings(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--muted)' }}>&times;</button>
        </div>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 4 }}>Google Maps Link</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="url"
              value={locationUrl}
              onChange={(e) => setLocationUrl(e.target.value)}
              placeholder="https://maps.google.com/..."
              style={{ flex: 1, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--line)', fontSize: '0.85rem' }}
            />
            <button className="btn btn-primary" onClick={saveLocation} disabled={saving} style={{ fontSize: '0.85rem', padding: '8px 14px' }}>
              {saving ? "..." : "Save"}
            </button>
          </div>
          {layout.locationUrl && (
            <a href={layout.locationUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: 'var(--teal)', display: 'inline-block', marginTop: 4 }}>
              🔗 Open on Google Maps
            </a>
          )}
        </label>

        <label style={{ display: 'block', marginBottom: 14 }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 8 }}>Front Direction (drag the needle)</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Interactive draggable compass */}
            <div
              ref={compassRef}
              style={{
                width: 80, height: 80, borderRadius: '50%',
                background: 'var(--surface-strong)', border: '2px solid var(--line)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative', flexShrink: 0,
                cursor: 'grab', userSelect: 'none', touchAction: 'none',
                boxShadow: isDraggingCompass ? '0 0 0 3px var(--teal), 0 4px 16px rgba(0,0,0,0.2)' : '0 2px 8px rgba(0,0,0,0.1)',
                transition: 'box-shadow 0.2s ease',
              }}
              onMouseDown={(e) => {
                setIsDraggingCompass(true);
                setFrontDirection(Math.round(getAngleFromEvent(e)));
              }}
              onTouchStart={(e) => {
                setIsDraggingCompass(true);
                setFrontDirection(Math.round(getAngleFromEvent(e)));
              }}
            >
              {/* Cardinal labels */}
              <span style={{ position: 'absolute', top: 4, fontSize: 9, fontWeight: 900, color: '#ef4444' }}>N</span>
              <span style={{ position: 'absolute', bottom: 4, fontSize: 8, fontWeight: 700, color: 'var(--muted)' }}>S</span>
              <span style={{ position: 'absolute', left: 6, fontSize: 8, fontWeight: 700, color: 'var(--muted)' }}>W</span>
              <span style={{ position: 'absolute', right: 6, fontSize: 8, fontWeight: 700, color: 'var(--muted)' }}>E</span>
              {/* Needle */}
              <div style={{
                width: 3, height: 28, borderRadius: 2,
                background: 'linear-gradient(to top, var(--muted) 50%, #ef4444 50%)',
                transformOrigin: 'center center',
                transform: `rotate(${frontDirection}deg)`,
                transition: isDraggingCompass ? 'none' : 'transform 0.3s ease',
                position: 'absolute',
              }} />
              {/* Center dot */}
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text)', zIndex: 1 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
              <input
                type="range"
                min="0"
                max="360"
                value={frontDirection}
                onChange={(e) => setFrontDirection(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--teal)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>{frontDirection}°</span>
                <button className="btn btn-primary" onClick={saveDirection} disabled={saving} style={{ fontSize: '0.85rem', padding: '8px 14px' }}>
                  {saving ? "..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </label>

        {/* Map Overlay Button */}
        <button
          className="btn btn-primary"
          onClick={() => navigate(`/layout/${layout._id}/map-editor`)}
          style={{ width: '100%', padding: '12px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'linear-gradient(135deg, #14b8a6, #0d9488)', borderRadius: 14 }}
        >
          🗺️ Place Layout on Map
        </button>
      </div>
    </>
  );
};

export default LayoutCard;
