import React, { useState } from 'react';
import { Share2, Map as MapIcon, Box, Home, Search as SearchIcon, Image as ImageIcon, Info, MapPin, FileImage, FileSpreadsheet } from "lucide-react";

export const FloatingUI = ({
  isCanvasMode,
  setIsCanvasMode,
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
  // 2D/3D toggle
  isTopDown,
  onToggleTopDown,
}) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState(searchQuery || "");

  // Update local input if parent search query changes (e.g. from clear button)
  React.useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  const statusToggle = setShowStatus ? (
    <button
      onClick={() => setShowStatus((prev) => !prev)}
      title={showStatus ? "Status: ON" : "Status: OFF"}
      style={{
        width: 56,
        height: 30,
        borderRadius: 999,
        padding: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: showStatus ? 'flex-end' : 'flex-start',
        background: showStatus ? 'linear-gradient(90deg, #14b8a6, #06b6d4)' : 'rgba(255,255,255,0.04)',
        border: showStatus ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(255,255,255,0.06)',
        cursor: 'pointer',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ width: 20, height: 20, borderRadius: '50%', background: showStatus ? '#fff' : '#111827', boxShadow: showStatus ? '0 6px 18px rgba(20,184,166,0.18)' : '0 3px 8px rgba(0,0,0,0.6)' }} />
    </button>
  ) : null;

  const primaryControls = (
    <>
      {onRawLayout && (
        <button
          style={{ ...styles.modeBtn, background: !isCanvasMode ? 'rgba(255,255,255,0.15)' : 'transparent' }}
          onClick={onRawLayout}
          title="Raw Layout"
        >
          <FileImage size={18} color="#fff" />
        </button>
      )}
      {statusToggle}
      <button
        style={styles.modeBtn}
        onClick={() => {
          if (onFit) onFit();
        }}
        title="Home / Fit to Screen"
      >
        <Home size={18} color="#fff" />
      </button>
      {onShare && (
        <button onClick={onShare} style={styles.modeBtn} title="Share">
          <Share2 size={18} color="#fff" />
        </button>
      )}
      {typeof onToggleTopDown === 'function' && (
        <button onClick={onToggleTopDown} style={styles.modeBtn} title={isTopDown ? 'Switch to 3D' : 'Switch to 2D'}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{isTopDown ? '2D' : '3D'}</div>
        </button>
      )}
    </>
  );

  return (
    <>
      {/* ===== Desktop Layout (>= 641px) ===== */}
      <div style={styles.desktopContainer} className="floating-ui-desktop">
        {/* Icon button row: Raw Layout | Status | Home | Share | 2D/3D */}
        <div style={{ ...styles.pill, padding: '4px', gap: 4 }}>
          {primaryControls}
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
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setSearchQuery(localSearch);
                }
              }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => { if (!localSearch) setSearchOpen(false); }}
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
        {/* Icon button row centered */}
        <div style={{ ...styles.pill, padding: '4px', gap: 4, alignSelf: 'center' }}>
          {primaryControls}
        </div>

        {/* Search Bar */}
        {showSearch && (
          <div style={{ ...styles.searchPill, width: '100%', maxWidth: 340 }}>
            <SearchIcon size={16} color="rgba(255,255,255,0.5)" style={{ flexShrink: 0, marginLeft: 4 }} />
            <input
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setSearchQuery(localSearch);
                }
              }}
              placeholder="Search Plot (Press Enter)"
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
