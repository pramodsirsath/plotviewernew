import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Image as ImageIcon,
  Info,
  Map,
  Navigation,
  Search,
  Share2,
  Home,
} from "lucide-react";
import API from "../../services/api";
import { resolveServerUrl } from "../../config/runtime";
import FastLayoutViewer from "../shared/FastLayoutViewer";
import MapReadOnlyView from "../shared/MapReadOnlyView";
import useGlobalLayoutTheme from "../shared/useGlobalLayoutTheme";
import {
  getPlotAreaSqM,
  getPlotDimensionSummary,
} from "../../utils/plotGeometry";
import { getLayoutStatusStyle } from "../../theme/layoutMapTheme";
import "./FastCustomerLayoutPage.css";

const formatMetricValue = (value, unit = "") => {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return String(value);
  }

  const formatted = Math.abs(parsed - Math.round(parsed)) < 0.01
    ? String(Math.round(parsed))
    : parsed.toFixed(Math.abs(parsed) >= 10 ? 1 : 2).replace(/0+$/, "").replace(/\.$/, "");

  return unit ? `${formatted} ${unit}` : formatted;
};

const getPlotSearchText = (plot) => [
  plot?.plotNo,
  plot?._id,
  plot?.id,
  plot?.name,
  plot?.meshName,
  plot?.modelMeshName,
].filter(Boolean).map((value) => String(value).toLowerCase());

const getLoadConfig = ({ mode, id, token }) => {
  if (mode === "public") {
    return {
      layoutUrl: `/layouts/public/${token}`,
      galleryUrl: `/layouts/public/${token}/gallery`,
    };
  }

  return {
    layoutUrl: `/layout/${id}`,
    galleryUrl: `/layout/${id}/gallery`,
  };
};

export default function FastCustomerLayoutPage({ mode = "private" }) {
  const navigate = useNavigate();
  const params = useParams();
  const { theme } = useGlobalLayoutTheme();
  const id = params.id;
  const token = params.token;
  const [reloadKey, setReloadKey] = React.useState(0);
  const [layout, setLayout] = React.useState(null);
  const [image, setImage] = React.useState(null);
  const [loadState, setLoadState] = React.useState("loading");
  const [loadMessage, setLoadMessage] = React.useState("");
  const [sceneReady, setSceneReady] = React.useState(false);
  const [selectedPlot, setSelectedPlot] = React.useState(null);
  const [showStatus, setShowStatus] = React.useState(false);
  const [isTopDown, setIsTopDown] = React.useState(false);
  const [fitSignal, setFitSignal] = React.useState(0);
  const [northSignal, setNorthSignal] = React.useState(0);
  const [cameraAzimuth, setCameraAzimuth] = React.useState(0);
  const [searchValue, setSearchValue] = React.useState("");
  const [shareMessage, setShareMessage] = React.useState("");
  const [showGallery, setShowGallery] = React.useState(false);
  const [galleryImages, setGalleryImages] = React.useState([]);
  const [galleryLoading, setGalleryLoading] = React.useState(false);
  const [showInfo, setShowInfo] = React.useState(false);
  const [showMap, setShowMap] = React.useState(false);

  const loadConfig = React.useMemo(
    () => getLoadConfig({ mode, id, token }),
    [id, mode, token]
  );

  React.useEffect(() => {
    document.body.classList.add("fast-layout-active");
    return () => {
      document.body.classList.remove("fast-layout-active");
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const nextImage = new window.Image();

    const load = async () => {
      setLoadState("loading");
      setLoadMessage("");
      setSceneReady(false);
      setSelectedPlot(null);
      setLayout(null);
      setImage(null);

      try {
        const response = await API.get(loadConfig.layoutUrl, {
          params: { _ts: Date.now() },
        });

        if (cancelled) return;
        setLayout(response.data);

        nextImage.onload = () => {
          if (cancelled) return;
          setImage(nextImage);
          setLoadState("ready");
        };

        nextImage.onerror = () => {
          if (cancelled) return;
          setLoadState("error");
          setLoadMessage("The assigned layout image could not be loaded.");
        };

        nextImage.src = resolveServerUrl(response.data.imageUrl);
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        setLoadState(error.response?.status === 404 ? "not-found" : "error");
        setLoadMessage(error.response?.data?.message || "Could not load this layout.");
      }
    };

    load();

    return () => {
      cancelled = true;
      nextImage.onload = null;
      nextImage.onerror = null;
    };
  }, [loadConfig.layoutUrl, reloadKey]);

  React.useEffect(() => {
    if (!showGallery || !layout) return;

    let cancelled = false;
    const loadGallery = async () => {
      setGalleryLoading(true);
      try {
        const response = await API.get(loadConfig.galleryUrl);
        if (!cancelled) {
          setGalleryImages(response.data || []);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setGalleryImages([]);
        }
      } finally {
        if (!cancelled) {
          setGalleryLoading(false);
        }
      }
    };

    loadGallery();

    return () => {
      cancelled = true;
    };
  }, [loadConfig.galleryUrl, layout, showGallery]);

  const inventoryPlots = React.useMemo(
    () => (layout?.plots || []).filter((plot) => plot.isPlot !== false),
    [layout]
  );

  const counts = React.useMemo(() => {
    const nextCounts = { Available: 0, Reserved: 0, Sold: 0 };
    inventoryPlots.forEach((plot) => {
      nextCounts[plot.status] = (nextCounts[plot.status] || 0) + 1;
    });
    return nextCounts;
  }, [inventoryPlots]);

  const handleFit = React.useCallback(() => {
    setSelectedPlot(null);
    setFitSignal((value) => value + 1);
  }, []);

  const handleSearchSubmit = React.useCallback((event) => {
    event.preventDefault();
    const query = searchValue.trim().toLowerCase();
    if (!query || !layout?.plots?.length) return;

    const match = layout.plots.find((plot) => (
      getPlotSearchText(plot).some((text) => text === query || text.includes(query))
    ));

    if (match && match.isPlot !== false) {
      setSelectedPlot(match);
    }
  }, [layout, searchValue]);

  const handleShare = React.useCallback(async () => {
    let shareUrl = window.location.href;
    if (layout?.publicToken) {
      shareUrl = `${window.location.origin}/layout/view/${layout.publicToken}`;
    }

    const shareData = {
      title: layout?.name || "Plot Layout",
      text: `Check out the layout: ${layout?.name || "Plot Layout"}`,
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setShareMessage("Link copied");
        window.setTimeout(() => setShareMessage(""), 1200);
      }
    } catch (error) {
      if (error?.name === "AbortError") return;

      try {
        await navigator.clipboard.writeText(shareUrl);
        setShareMessage("Link copied");
        window.setTimeout(() => setShareMessage(""), 1200);
      } catch {
        console.error(error);
      }
    }
  }, [layout]);

  const selectedArea = selectedPlot
    ? formatMetricValue(getPlotAreaSqM(selectedPlot, layout?.meta?.pixelToFt || 1), "m2")
    : null;
  const selectedDimensions = selectedPlot
    ? getPlotDimensionSummary(selectedPlot, layout?.meta?.pixelToFt || 1)
    : null;
  const selectedStatusStyle = selectedPlot
    ? getLayoutStatusStyle(selectedPlot.status)
    : null;
  const canRenderViewer = loadState === "ready" && layout && image;

  // Display name — use layout name or fallback
  const displayName = layout?.name || "NAKSHATRA";

  if (!canRenderViewer) {
    const isLoading = loadState === "loading";
    const title = isLoading
      ? "Opening layout"
      : loadState === "not-found"
        ? "Layout not found"
        : "Could not open layout";

    return (
      <div className="fast-layout-page fast-layout-page--state">
        <div className="fast-layout-state">
          <div className="fast-layout-state__title">{title}</div>
          <div className="fast-layout-state__copy">
            {isLoading ? "Loading the layout, image, and plot data." : loadMessage}
          </div>
          {!isLoading ? (
            <div className="fast-layout-state__actions">
              <button type="button" className="fast-layout-pill-button" onClick={() => navigate(-1)}>
                Back
              </button>
              <button type="button" className="fast-layout-pill-button is-primary" onClick={() => setReloadKey((value) => value + 1)}>
                Try Again
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="fast-layout-page">
      {/* ===== HEADER ===== */}
      <header className="nk-header">
        <div className="nk-header__brand">
          {/* Logo Icon */}
          <div className="nk-header__logo">
            <svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 3L4 9V21H20V9L12 3ZM12 7.7L17.3 11.7V18.3H6.7V11.7L12 7.7Z" fill="currentColor" />
              <path d="M12 11.5L9.5 13.5V16.5H14.5V13.5L12 11.5Z" fill="currentColor" />
            </svg>
          </div>
          {/* Brand Title */}
          <h1 className="nk-header__title">{displayName.toUpperCase()}</h1>
        </div>
        {/* Status Badge */}
        <div className="nk-header__badge">
          <div className="nk-header__diamond" />
        </div>
      </header>

      {/* ===== MAP / VIEWER AREA ===== */}
      <div className="nk-viewer-full">
        <FastLayoutViewer
          layout={layout}
          image={image}
          theme={theme}
          selectedPlot={selectedPlot}
          showStatus={showStatus}
          isTopDown={isTopDown}
          fitSignal={fitSignal}
          northSignal={northSignal}
          onPlotSelect={setSelectedPlot}
          onCameraAzimuth={setCameraAzimuth}
          onReady={() => setSceneReady(true)}
          onError={(error) => {
            setSceneReady(true);
            setLoadState("error");
            setLoadMessage(error?.message || "The 3D scene could not be prepared.");
          }}
        />

        {/* Loading indicator */}
        {!sceneReady ? (
          <div className="nk-loading">
            <div className="nk-loading__bar" />
            <span>Preparing viewer</span>
          </div>
        ) : null}

        {/* Floating Compass */}
        <button
          type="button"
          className="nk-compass"
          onClick={() => setNorthSignal((value) => value + 1)}
          title="Face north"
        >
          <div className="nk-compass__inner">
            <span className="nk-compass__n">N</span>
            <svg
              className="nk-compass__needle"
              fill="none"
              viewBox="0 0 24 24"
              style={{
                transform: `rotate(${(layout.frontDirection || 0) - cameraAzimuth - 45}deg)`,
              }}
            >
              <path d="M12 2L15 12L12 10L9 12L12 2Z" fill="white" />
              <path d="M12 22L9 12L12 14L15 12L12 22Z" fill="gray" />
            </svg>
          </div>
        </button>

        {/* Toast message */}
        {shareMessage ? (
          <div className="nk-toast">{shareMessage}</div>
        ) : null}

        {/* Selected plot panel */}
        {selectedPlot ? (
          <div className="nk-plot-panel">
            <button type="button" className="nk-plot-panel__close" onClick={() => setSelectedPlot(null)}>
              ✕
            </button>
            <div className="nk-plot-panel__title">Plot {selectedPlot.plotNo || "-"}</div>
            <div className="nk-plot-panel__meta">
              <span>{selectedArea}</span>
              {selectedDimensions ? <span>{selectedDimensions}</span> : null}
            </div>
            <div
              className="nk-status-chip"
              style={{ color: selectedStatusStyle?.solid }}
            >
              {selectedPlot.status || "Available"}
            </div>
          </div>
        ) : null}
      </div>

      {/* ===== FLOATING CONTROLS ===== */}
      <div className="nk-floating-controls">
        {/* Share Button (Above controls, right-aligned) */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
          <button
            type="button"
            className="nk-share-btn"
            onClick={handleShare}
            title="Share"
          >
            <Share2 size={22} />
          </button>
        </div>

        {/* Toggle Row + Quick Action Circles */}
        <div className="nk-controls__toggle-row">
          {/* Status Toggle */}
          <div className="nk-status-pill">
            <span className="nk-status-pill__label">Status</span>
            <label className="nk-toggle">
              <input
                type="checkbox"
                checked={showStatus}
                onChange={() => setShowStatus((value) => !value)}
              />
              <div className="nk-toggle__track" />
            </label>
          </div>

          {/* Quick Action Circles */}
          <div className="nk-quick-actions">
            {/* Map / Raw Layout */}
            <button
              type="button"
              className="nk-circle-btn"
              onClick={() => setShowMap(true)}
              title="Map"
            >
              <Map size={22} />
            </button>
            {/* 2D / 3D toggle */}
            <button
              type="button"
              className={`nk-circle-btn nk-circle-btn--text ${isTopDown ? "is-active" : ""}`}
              onClick={() => setIsTopDown((value) => !value)}
              title="Toggle 2D/3D"
            >
              {isTopDown ? "3D" : "2D"}
            </button>
            {/* Home / Fit */}
            <button
              type="button"
              className="nk-circle-btn"
              onClick={handleFit}
              title="Fit layout"
            >
              <Home size={22} />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <form className="nk-search" onSubmit={handleSearchSubmit}>
          <div className="nk-search__icon">
            <Search size={20} />
          </div>
          <input
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Search Plot"
            inputMode="search"
          />
        </form>

        {/* Bottom Action Buttons */}
        <div className="nk-bottom-actions">
          {/* Gallery */}
          <button type="button" className="nk-action-btn" onClick={() => setShowGallery(true)}>
            <ImageIcon size={20} />
            <span className="nk-action-btn__label">Gallery</span>
          </button>
          {/* Info */}
          <button type="button" className="nk-action-btn" onClick={() => setShowInfo(true)}>
            <Info size={20} />
            <span className="nk-action-btn__label">Info</span>
          </button>
          {/* Locate */}
          <button type="button" className="nk-action-btn" onClick={() => setShowMap(true)}>
            <Navigation size={20} style={{ transform: "rotate(45deg)" }} />
            <span className="nk-action-btn__label">Locate</span>
          </button>
        </div>
      </div>

      {/* ===== GALLERY MODAL ===== */}
      {showGallery ? (
        <div className="nk-modal" onClick={() => setShowGallery(false)}>
          <div className="nk-modal__panel" onClick={(event) => event.stopPropagation()}>
            <div className="nk-modal__header">
              <h2>Gallery</h2>
              <button type="button" onClick={() => setShowGallery(false)}>✕</button>
            </div>
            {galleryLoading ? (
              <div className="nk-empty">Loading images...</div>
            ) : galleryImages.length ? (
              <div className="nk-gallery-grid">
                {galleryImages.map((item, index) => (
                  <img
                    key={`${item}-${index}`}
                    src={resolveServerUrl(item)}
                    alt={`Gallery ${index + 1}`}
                    loading="lazy"
                  />
                ))}
              </div>
            ) : (
              <div className="nk-empty">No images yet.</div>
            )}
          </div>
        </div>
      ) : null}

      {/* ===== INFO MODAL ===== */}
      {showInfo ? (
        <div className="nk-modal" onClick={() => setShowInfo(false)}>
          <div className="nk-modal__panel nk-modal__panel--narrow" onClick={(event) => event.stopPropagation()}>
            <div className="nk-modal__header">
              <h2>Layout Info</h2>
              <button type="button" onClick={() => setShowInfo(false)}>✕</button>
            </div>
            <div className="nk-info-list">
              <div><span>Name</span><strong>{layout.name || "-"}</strong></div>
              <div><span>Total Plots</span><strong>{inventoryPlots.length}</strong></div>
              <div><span>Available</span><strong>{counts.Available}</strong></div>
              <div><span>Reserved</span><strong>{counts.Reserved}</strong></div>
              <div><span>Sold</span><strong>{counts.Sold}</strong></div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ===== MAP MODAL ===== */}
      {showMap ? (
        <MapReadOnlyView layout={layout} onClose={() => setShowMap(false)} />
      ) : null}
    </div>
  );
}
