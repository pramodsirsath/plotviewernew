const fs = require('fs');
const file = 'd:/Tijori/WebProjects/plotProject/PlotViewer/plotviewer/src/utils/plotGeometry.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/if \(\s*isFiniteNumber\(plot\?\.x\)\s*&&\s*isFiniteNumber\(plot\?\.y\)\s*&&\s*isFiniteNumber\(plot\?\.width\)\s*&&\s*isFiniteNumber\(plot\?\.height\)\s*\) \{/g, 'if (plot && plot.width !== undefined && plot.height !== undefined) { const x = Number(plot.x) || 0; const y = Number(plot.y) || 0; const width = Number(plot.width) || 0; const height = Number(plot.height) || 0;');
content = content.replace(/return \{\s*x: plot\.x,\s*y: plot\.y,\s*width: plot\.width,\s*height: plot\.height,\s*\};/g, 'return { x, y, width, height };');

fs.writeFileSync(file, content);
console.log('Fixed getPlotBounds');

