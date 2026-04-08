const fs = require('fs');
const files = [
  'd:/Tijori/WebProjects/plotProject/PlotViewer/plotviewer/src/components/Customer/CustomerLayout.jsx',
  'd:/Tijori/WebProjects/plotProject/PlotViewer/plotviewer/src/components/Customer/PublicLayoutView.jsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(
    /<div style={{ position: 'absolute', top: 'calc\(66px \+ env\(safe-area-inset-top\)\)', left: 'calc\(16px \+ env\(safe-area-inset-left\)\)', zIndex: 20 }}>\s*<CompassIndicator rotation={cameraAzimuth} frontDirection={layout\?\.frontDirection \|\| 0} size={44} onClick={handleNavigateNorth} \/>/g,
    `<div style={{ position: 'absolute', top: 'calc(66px + env(safe-area-inset-top))', left: 'calc(16px + env(safe-area-inset-left))', zIndex: 20, pointerEvents: 'auto' }}>\n        <CompassIndicator rotation={cameraAzimuth} frontDirection={layout?.frontDirection || 0} size={44} onClick={(e) => { e.stopPropagation(); handleNavigateNorth(); }} />`
  );
  
  // also fix public plotColor rendering:
  if (file.includes('PublicLayoutView')) {
    // import blendHexColors and LAYOUT_STATUS_COLORS
    content = content.replace(
      /\} from "\.\.\/\.\.\/theme\/layoutMapTheme";/,
      `, blendHexColors, LAYOUT_STATUS_COLORS } from "../../theme/layoutMapTheme";`
    );
    
    content = content.replace(
      /const plotColor = LAYOUT_VIEW_COLORS\.plot;/,
      `const plotColor = React.useMemo(() => {\n    if (isSelected) return LAYOUT_VIEW_COLORS.selectedPlot;\n    const statusColor = LAYOUT_STATUS_COLORS[plot.status] || LAYOUT_VIEW_COLORS.plot;\n\n    if (statusRevealProgress <= 0) return LAYOUT_VIEW_COLORS.plot;\n    if (statusRevealProgress >= 1) return statusColor;\n\n    return blendHexColors(LAYOUT_VIEW_COLORS.plot, statusColor, statusRevealProgress);\n  }, [isSelected, plot.status, showStatus, statusRevealProgress]);`
    );
  }
  
  fs.writeFileSync(file, content);
}
console.log('Fixed');
