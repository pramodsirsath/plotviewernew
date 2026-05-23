
  import React, { useState } from 'react';
  import {
    Share2,
    Home,
    Search as SearchIcon,
    Image as ImageIcon,
    Info,
    MapPin,
    FileImage,
    FileSpreadsheet
  } from "lucide-react";

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
    isTopDown,
    onToggleTopDown,
  }) => {

    const [localSearch, setLocalSearch] = useState(searchQuery || "");

    const statusToggle = setShowStatus ? (
      <button
        onClick={() => setShowStatus((prev) => !prev)}
        style={{
          width: 50,
          height: 26,
          borderRadius: 999,
          padding: 3,
          display: 'flex',
          alignItems: 'center',
          justifyContent: showStatus ? 'flex-end' : 'flex-start',
          background: showStatus ? '#14b8a6' : 'rgba(255,255,255,0.1)',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        <div style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#fff'
        }} />
      </button>
    ) : null;

    const primaryControls = (
      <>
        {onRawLayout && (
          <button style={styles.modeBtn} onClick={onRawLayout}>
            <FileImage size={16} />
          </button>
        )}

        {statusToggle && (
          <div style={styles.statusWrap}>
            <span style={{ fontSize: 12 }}>Status</span>
            {statusToggle}
          </div>
        )}

        <button style={styles.modeBtn} onClick={onFit}>
          <Home size={16} />
        </button>

        {onShare && (
          <button style={styles.modeBtn} onClick={onShare}>
            <Share2 size={16} />
          </button>
        )}

        {onToggleTopDown && (
          <button style={styles.modeBtn} onClick={onToggleTopDown}>
            <span style={{ fontSize: 12 }}>
              {isTopDown ? '3D' : '2D'}
            </span>
          </button>
        )}
      </>
    );


  const isMobile = window.innerWidth <= 640;

  return (
    <>
      {/* ✅ Show ONLY ONE layout */}
      {isMobile ? (
        // ================= MOBILE =================
        <div style={styles.mobileContainer}>

          {/* Row 1 */}
          <div style={styles.mobileRow}>
            <button style={styles.modeBtn} onClick={onFit}>
              <Home size={16} />
            </button>

            {onShare && (
              <button style={styles.modeBtn} onClick={onShare}>
                <Share2 size={16} />
              </button>
            )}

            {onToggleTopDown && (
              <button style={styles.modeBtn} onClick={onToggleTopDown}>
                {isTopDown ? '3D' : '2D'}
              </button>
            )}
          </div>

          {/* Row 2 */}
          <div style={styles.mobileRow}>
            {onRawLayout && (
              <button style={styles.modeBtn} onClick={onRawLayout}>
                <FileImage size={16} />
              </button>
            )}

            {statusToggle}
          </div>

          {/* Search */}
          {showSearch && (
            <div style={styles.searchPillMobile}>
              <SearchIcon size={14} />
              <input
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder="Search Plot"
                style={styles.searchInput}
              />
            </div>
          )}

          {/* Bottom actions */}
          {showExtraActions && (
            <div style={styles.mobileRow}>
              <button style={styles.actionBtn} onClick={onOpenGallery}>
                Gallery
              </button>
              <button style={styles.actionBtn} onClick={onOpenInfo}>
                Info
              </button>
              <button style={styles.actionBtn} onClick={onLocate}>
                Locate
              </button>
            </div>
          )}
        </div>

      ) : (
        // ================= DESKTOP =================
        <div style={styles.desktopContainer}>

          <div style={styles.pill}>
            {primaryControls}
          </div>

          {showSearch && (
            <div style={styles.searchPill}>
              <SearchIcon size={14} />
              <input
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder="Search Plot"
                style={styles.searchInput}
              />
            </div>
          )}

          {showExtraActions && (
            <div style={styles.pill}>
              <button style={styles.actionBtn} onClick={onOpenGallery}>
                Gallery
              </button>
              <button style={styles.actionBtn} onClick={onOpenInfo}>
                Info
              </button>
              <button style={styles.actionBtn} onClick={onLocate}>
                Locate
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );


  };

  const styles = {
    desktopContainer: {
      position: 'absolute',
      bottom: 20,
      right: 20,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    },

    mobileContainer: {
      position: 'absolute',
      bottom: 12,
      left: 10,
      right: 10,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      alignItems: 'center',
    },

    mobileRow: {
      display: 'flex',
      gap: 6,
      flexWrap: 'wrap',
      justifyContent: 'center',
      background: 'rgba(20,20,20,0.85)',
      padding: 6,
      borderRadius: 999,
    },

    pill: {
      display: 'flex',
      gap: 6,
      padding: 6,
      borderRadius: 999,
      background: 'rgba(20,20,20,0.85)',
    },

    searchPill: {
      display: 'flex',
      gap: 6,
      padding: 10,
      borderRadius: 999,
      background: 'rgba(20,20,20,0.85)',
    },

    searchPillMobile: {
      display: 'flex',
      gap: 6,
      padding: 10,
      width: '100%',
      borderRadius: 999,
      background: 'rgba(20,20,20,0.85)',
    },

    searchInput: {
      background: 'transparent',
      border: 'none',
      color: '#fff',
      outline: 'none',
      width: '100%',
    },

    modeBtn: {
      width: 36,
      height: 36,
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.1)',
      border: 'none',
      color: '#fff',
      cursor: 'pointer',
    },

    actionBtn: {
      background: 'transparent',
      border: 'none',
      color: '#ccc',
      padding: '6px 10px',
      cursor: 'pointer',
    },

    statusWrap: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      color: '#fff'
    }
  };

