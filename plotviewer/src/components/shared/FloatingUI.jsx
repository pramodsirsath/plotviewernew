import React, { useState } from 'react';
import { Share2, Map as MapIcon, Box, Home, Search as SearchIcon, Image as ImageIcon, Info, MapPin, FileImage, FileSpreadsheet, Eye, EyeOff } from "lucide-react";

export const FloatingUI = ({
  isCanvasMode,
  setIsCanvasMode,
  isTopDownView,
  setIsTopDownView,
  onFit,
  onShare,
  onOpenGallery,
  onOpenInfo,
  onLocate,
  onRawLayout,
  searchQuery,
  setSearchQuery,
  onExportSheets,
  showSearch = true,
  showExtraActions = true,
  showStatus,
  setShowStatus,
}) => {
  const [searchOpen, setSearchOpen] = useState(false);

  // Determine current view mode for button highlight
  const is3DActive = isCanvasMode && !isTopDownView;
  const is2DActive = isCanvasMode && isTopDownView;

  const statusToggle = setShowStatus ? (
    <button
      style={{
        ...styles.modeBtn,
        background: showStatus ? 'rgba(255,255,255,0.15)' : 'transparent',
        position: 'relative',
      }}
      onClick={() => setShowStatus((prev) => !prev)}
      title={showStatus ? "Hide Status Colors" : "Show Status Colors"}
    >
      {showStatus ? <Eye size={18} color="#fff" /> : <EyeOff size={18} color="rgba(255,255,255,0.5)" />}
    </button>
  ) : null;

  return (
    <>
      {/* ===== Desktop Layout (>= 641px) ===== */}
      <div style={styles.desktopContainer} className="floating-ui-desktop">
        {/* Share button - top right standalone */}
        {onShare && (
          <button onClick={onShare} style={styles.circleBtn} title="Share">
            <Share2 size={18} color="#fff" />
          </button>
        )}

        {/* Icon button row: Raw Layout | 3D/2D toggle | Status | Home/Fit */}
        <div style={{ ...styles.pill, padding: '4px', gap: 4 }}>
          {/* Raw Layout button */}
          {onRawLayout && (
            <button
              style={{ ...styles.modeBtn, background: !isCanvasMode ? 'rgba(255,255,255,0.15)' : 'transparent' }}
              onClick={onRawLayout}
              title="Raw Layout"
            >
              <FileImage size={18} color="#fff" />
            </button>
          )}

          {/* 3D / 2D Toggle */}
          <button
            style={{
              ...styles.modeBtn,
              background: is3DActive ? 'rgba(255,255,255,0.15)' : (is2DActive ? 'rgba(255,255,255,0.15)' : 'transparent'),
              fontWeight: 800,
              fontSize: '0.9rem',
              minWidth: 44,
            }}
            onClick={() => {
              if (isCanvasMode && !isTopDownView) {
                setIsTopDownView(true);
              } else {
                setIsCanvasMode(true);
                setIsTopDownView(false);
              }
            }}
            title={is3DActive ? "Switch to 2D" : "Switch to 3D"}
          >
            {is3DActive ? '2D' : '3D'}
          </button>

          {/* Status Toggle */}
          {statusToggle}

          {/* Home / Fit button */}
          <button
            style={styles.modeBtn}
            onClick={() => {
              if (onFit) onFit();
            }}
            title="Home / Fit to Screen"
          >
            <Home size={18} color="#fff" />
          </button>
        </div>

        {/* Search Bar */}
        {showSearch && (
          <div
            style={{
              ...styles.searchPill,
              width: searchOpen ? 220 : 220,
              transition: 'all 0.3s ease',
            }}
          >
            <SearchIcon size={16} color="rgba(255,255,255,0.5)" style={{ flexShrink: 0, marginLeft: 4 }} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => { if (!searchQuery) setSearchOpen(false); }}
              placeholder="Search Plot"
              style={styles.searchInput}
            />
          </div>
        )}

        {/* Extra Actions: Gallery / Info / Locate */}
        {showExtraActions && (
          <div style={{ ...styles.pill, gap: 4, padding: '4px' }}>
            <button style={styles.actionBtn} onClick={onOpenGallery}>
              <ImageIcon size={16} /> <span style={styles.actionText}>Gallery</span>
            </button>
            <button style={styles.actionBtn} onClick={onOpenInfo}>
              <Info size={16} /> <span style={styles.actionText}>Info</span>
            </button>
            <button style={styles.actionBtn} onClick={onLocate}>
              <MapPin size={16} /> <span style={styles.actionText}>Locate</span>
            </button>
            {onExportSheets && (
              <button style={styles.actionBtn} onClick={onExportSheets}>
                <FileSpreadsheet size={16} /> <span style={styles.actionText}>Sheets</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* ===== Mobile Layout (< 641px) ===== */}
      <div style={styles.mobileContainer} className="floating-ui-mobile">
        {/* Share button - top right above main controls */}
        {onShare && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', paddingRight: 4 }}>
            <button onClick={onShare} style={styles.circleBtn} title="Share">
              <Share2 size={18} color="#fff" />
            </button>
          </div>
        )}

        {/* Icon button row centered */}
        <div style={{ ...styles.pill, padding: '4px', gap: 4, alignSelf: 'center' }}>
          {onRawLayout && (
            <button
              style={{ ...styles.modeBtn, background: !isCanvasMode ? 'rgba(255,255,255,0.15)' : 'transparent' }}
              onClick={onRawLayout}
              title="Raw Layout"
            >
              <FileImage size={18} color="#fff" />
            </button>
          )}

          <button
            style={{
              ...styles.modeBtn,
              background: is3DActive ? 'rgba(255,255,255,0.15)' : (is2DActive ? 'rgba(255,255,255,0.15)' : 'transparent'),
              fontWeight: 800,
              fontSize: '0.9rem',
              minWidth: 44,
            }}
            onClick={() => {
              if (isCanvasMode && !isTopDownView) {
                setIsTopDownView(true);
              } else {
                setIsCanvasMode(true);
                setIsTopDownView(false);
              }
            }}
            title={is3DActive ? "Switch to 2D" : "Switch to 3D"}
          >
            {is3DActive ? '2D' : '3D'}
          </button>

          {/* Status Toggle (mobile) */}
          {statusToggle}

          <button
            style={styles.modeBtn}
            onClick={() => { if (onFit) onFit(); }}
            title="Home / Fit to Screen"
          >
            <Home size={18} color="#fff" />
          </button>
        </div>

        {/* Search Bar */}
        {showSearch && (
          <div style={{ ...styles.searchPill, width: '100%', maxWidth: 340 }}>
            <SearchIcon size={16} color="rgba(255,255,255,0.5)" style={{ flexShrink: 0, marginLeft: 4 }} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Plot"
              style={{ ...styles.searchInput, width: '100%' }}
            />
          </div>
        )}

        {/* Extra Actions */}
        {showExtraActions && (
          <div style={{ ...styles.pill, gap: 4, padding: '4px', alignSelf: 'center' }}>
            <button style={styles.actionBtn} onClick={onOpenGallery}>
              <ImageIcon size={16} /> <span style={styles.actionText}>Gallery</span>
            </button>
            <button style={styles.actionBtn} onClick={onOpenInfo}>
              <Info size={16} /> <span style={styles.actionText}>Info</span>
            </button>
            <button style={styles.actionBtn} onClick={onLocate}>
              <MapPin size={16} /> <span style={styles.actionText}>Locate</span>
            </button>
            {onExportSheets && (
              <button style={styles.actionBtn} onClick={onExportSheets}>
                <FileSpreadsheet size={16} /> <span style={styles.actionText}>Sheets</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* CSS for responsive show/hide */}
      <style>{`
        .floating-ui-desktop { display: flex !important; }
        .floating-ui-mobile { display: none !important; }

        @media (max-width: 640px) {
          .floating-ui-desktop { display: none !important; }
          .floating-ui-mobile { display: flex !important; }
        }
      `}</style>
    </>
  );
};

const styles = {
  /* Desktop: bottom-right, column layout */
  desktopContainer: {
    position: 'absolute',
    bottom: 28,
    right: 28,
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    alignItems: 'flex-end',
    pointerEvents: 'none',
  },
  /* Mobile: bottom-center, column layout */
  mobileContainer: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    zIndex: 1000,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  pill: {
    background: 'rgba(20, 20, 20, 0.8)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 999,
    display: 'flex',
    alignItems: 'center',
    pointerEvents: 'auto',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  },
  searchPill: {
    background: 'rgba(20, 20, 20, 0.8)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 999,
    display: 'flex',
    alignItems: 'center',
    pointerEvents: 'auto',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    padding: '10px 14px',
    gap: 8,
  },
  circleBtn: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(20, 20, 20, 0.8)',
    backdropFilter: 'blur(16px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    pointerEvents: 'auto',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    transition: 'transform 0.2s ease',
  },
  searchInput: {
    background: 'transparent',
    border: 'none',
    color: '#fff',
    outline: 'none',
    width: 160,
    fontSize: '0.88rem',
    fontFamily: 'inherit',
    opacity: 0.8,
  },
  actionBtn: {
    background: 'transparent',
    border: 'none',
    color: '#ccc',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 16px',
    borderRadius: 999,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  actionText: {
    fontSize: '0.85rem',
    fontWeight: 600
  },
  modeBtn: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  }
};
