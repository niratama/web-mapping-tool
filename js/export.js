/**
 * export.js - PNG / SVG Image Export & JSON Save / Load
 */

const ExportManager = {
  init() {
    this.initExportModalEvents();
    this.initFileLoadEvents();
  },

  // Calculate World Bounding Box of all content on map
  calculateBoundingBox(paddingCells = 2) {
    const visualSize = AppState.grid.visualCellSize;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    let hasContent = false;

    // 1. Check Floors
    for (const [key, floor] of AppState.floors.entries()) {
      hasContent = true;
      const x = floor.col * visualSize;
      const y = floor.row * visualSize;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + visualSize);
      maxY = Math.max(maxY, y + visualSize);
    }

    // 2. Check Walls
    for (const [key, wall] of AppState.walls.entries()) {
      hasContent = true;
      minX = Math.min(minX, wall.x1, wall.x2);
      minY = Math.min(minY, wall.y1, wall.y2);
      maxX = Math.max(maxX, wall.x1, wall.x2);
      maxY = Math.max(maxY, wall.y1, wall.y2);
    }

    // 3. Check Objects
    for (const obj of AppState.objects) {
      hasContent = true;
      const aabb = ObjectManager.getAABB(obj);
      minX = Math.min(minX, aabb.minX);
      minY = Math.min(minY, aabb.minY);
      maxX = Math.max(maxX, aabb.maxX);
      maxY = Math.max(maxY, aabb.maxY);
    }

    // If empty map, provide default area
    if (!hasContent) {
      minX = 0;
      minY = 0;
      maxX = visualSize * 10;
      maxY = visualSize * 10;
    }

    // Add padding
    const pad = paddingCells * visualSize;
    minX = Math.floor((minX - pad) / visualSize) * visualSize;
    minY = Math.floor((minY - pad) / visualSize) * visualSize;
    maxX = Math.ceil((maxX + pad) / visualSize) * visualSize;
    maxY = Math.ceil((maxY + pad) / visualSize) * visualSize;

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY
    };
  },

  // Export as PNG image
  exportPNG(paddingCells = 2, includeGrid = true, transparentBg = false) {
    const box = this.calculateBoundingBox(paddingCells);
    const canvas = document.createElement('canvas');
    canvas.width = box.width;
    canvas.height = box.height;
    const ctx = canvas.getContext('2d');

    // 1. Background
    if (!transparentBg) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Offset transformation so (minX, minY) becomes (0, 0)
    ctx.save();
    ctx.translate(-box.minX, -box.minY);

    const visualSize = AppState.grid.visualCellSize;
    const snapUnit = GridManager.getSnapUnit();

    const drawGridLines = () => {
      // Snap Grid
      if (AppState.grid.showSnap && AppState.grid.subdivisions > 1) {
        ctx.beginPath();
        ctx.lineWidth = 1;
        ctx.strokeStyle = AppState.grid.snapColor;
        ctx.setLineDash([2, 3]);
        for (let x = box.minX; x <= box.maxX; x += snapUnit) {
          ctx.moveTo(x, box.minY);
          ctx.lineTo(x, box.maxY);
        }
        for (let y = box.minY; y <= box.maxY; y += snapUnit) {
          ctx.moveTo(box.minX, y);
          ctx.lineTo(box.maxX, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Visual Grid
      ctx.beginPath();
      ctx.lineWidth = 1;
      ctx.strokeStyle = AppState.grid.visualColor;
      for (let x = box.minX; x <= box.maxX; x += visualSize) {
        ctx.moveTo(x, box.minY);
        ctx.lineTo(x, box.maxY);
      }
      for (let y = box.minY; y <= box.maxY; y += visualSize) {
        ctx.moveTo(box.minX, y);
        ctx.lineTo(box.maxX, y);
      }
      ctx.stroke();
    };

    // 2. Optional Grid (under floors if showOnFloor is disabled)
    if (includeGrid && AppState.grid.showOnFloor === false) {
      drawGridLines();
    }

    // 3. Floors
    for (const [key, floor] of AppState.floors.entries()) {
      const x = floor.col * visualSize;
      const y = floor.row * visualSize;
      ctx.fillStyle = floor.color || '#e2e8f0';
      ctx.fillRect(x, y, visualSize, visualSize);
      if (floor.texture && floor.texture !== 'none') {
        CanvasRenderer.renderFloorTexture(ctx, x, y, visualSize, floor.texture);
      }
    }

    // 2b. Optional Grid (on top of floors if showOnFloor is enabled)
    if (includeGrid && AppState.grid.showOnFloor !== false) {
      drawGridLines();
    }

    // 4. Walls
    for (const [key, wall] of AppState.walls.entries()) {
      ctx.save();
      ctx.lineWidth = wall.thickness || 3;
      ctx.strokeStyle = wall.color || '#1e293b';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(wall.x1, wall.y1);
      ctx.lineTo(wall.x2, wall.y2);
      ctx.stroke();
      ctx.restore();
    }

    // 5. Openings
    for (const op of AppState.openings) {
      ctx.save();
      ctx.translate(op.x, op.y);
      ctx.rotate(op.rotation);
      ctx.strokeStyle = op.color || '#ca8a04';
      ctx.lineWidth = 2;
      const w = op.width;
      if (op.type === 'door-single') {
        ctx.beginPath();
        ctx.moveTo(-w / 2, 0);
        ctx.lineTo(-w / 2, -w);
        ctx.stroke();
        ctx.beginPath();
        ctx.setLineDash([3, 3]);
        ctx.arc(-w / 2, 0, w, 0, -Math.PI / 2, true);
        ctx.stroke();
      } else if (op.type === 'window') {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.3)';
        ctx.fillRect(-w / 2, -3, w, 6);
        ctx.beginPath();
        ctx.moveTo(-w / 2, -2);
        ctx.lineTo(w / 2, -2);
        ctx.moveTo(-w / 2, 2);
        ctx.lineTo(w / 2, 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 6. Objects
    const sorted = [...AppState.objects].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    for (const obj of sorted) {
      const center = ObjectManager.getObjectCenter(obj);
      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.rotate(obj.rotation * Math.PI / 180);

      const halfW = obj.width / 2;
      const halfH = obj.height / 2;

      if (obj.shapeType === 'rect') {
        if (obj.fillType === 'image' && obj.imageElement) {
          ctx.drawImage(obj.imageElement, -halfW, -halfH, obj.width, obj.height);
        } else {
          ctx.fillStyle = obj.color || '#3b82f6';
          ctx.fillRect(-halfW, -halfH, obj.width, obj.height);
        }
        ctx.strokeStyle = obj.strokeColor || '#1d4ed8';
        ctx.lineWidth = obj.strokeWidth || 1;
        ctx.strokeRect(-halfW, -halfH, obj.width, obj.height);
      } else if (obj.shapeType === 'cells' && obj.cells) {
        const rows = obj.cells.length;
        const cols = obj.cells[0].length;
        const cW = obj.width / cols;
        const cH = obj.height / rows;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (obj.cells[r][c] === 1) {
              const cx = -halfW + c * cW;
              const cy = -halfH + r * cH;
              ctx.fillStyle = obj.color || '#8b5cf6';
              ctx.fillRect(cx, cy, cW, cH);
              ctx.strokeStyle = obj.strokeColor || '#6d28d9';
              ctx.lineWidth = obj.strokeWidth || 1;
              ctx.strokeRect(cx, cy, cW, cH);
            }
          }
        }
      }

      if (obj.text && obj.text.trim().length > 0) {
        ctx.font = `600 ${obj.fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = obj.textColor || '#ffffff';
        ctx.fillText(obj.text, 0, 0);
      }

      ctx.restore();
    }

    ctx.restore();

    // Download
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `map_${Date.now()}.png`;
      if (typeof a.click === 'function') a.click();
      URL.revokeObjectURL(url);
      if (window.App) App.showToast('PNG画像をエクスポートしました', 'success');
    });
  },

  // Export as SVG vector format
  exportSVG(paddingCells = 2, includeGrid = true, transparentBg = false) {
    const box = this.calculateBoundingBox(paddingCells);
    const visualSize = AppState.grid.visualCellSize;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.minX} ${box.minY} ${box.width} ${box.height}" width="${box.width}" height="${box.height}">\n`;
    svg += `<style>text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }</style>\n`;

    // Background
    if (!transparentBg) {
      svg += `<rect x="${box.minX}" y="${box.minY}" width="${box.width}" height="${box.height}" fill="#0f172a" />\n`;
    }

    const renderSvgGrid = () => {
      let gridSvg = `<g id="grid" stroke="${AppState.grid.visualColor}" stroke-width="1">\n`;
      for (let x = box.minX; x <= box.maxX; x += visualSize) {
        gridSvg += `<line x1="${x}" y1="${box.minY}" x2="${x}" y2="${box.maxY}" />\n`;
      }
      for (let y = box.minY; y <= box.maxY; y += visualSize) {
        gridSvg += `<line x1="${box.minX}" y1="${y}" x2="${box.maxX}" y2="${y}" />\n`;
      }
      gridSvg += `</g>\n`;
      return gridSvg;
    };

    // Grid lines (under floors if showOnFloor is disabled)
    if (includeGrid && AppState.grid.showOnFloor === false) {
      svg += renderSvgGrid();
    }

    // Floors
    svg += `<g id="floors">\n`;
    for (const [key, floor] of AppState.floors.entries()) {
      const x = floor.col * visualSize;
      const y = floor.row * visualSize;
      svg += `<rect x="${x}" y="${y}" width="${visualSize}" height="${visualSize}" fill="${floor.color || '#e2e8f0'}" />\n`;
    }
    svg += `</g>\n`;

    // Grid lines (on top of floors if showOnFloor is enabled)
    if (includeGrid && AppState.grid.showOnFloor !== false) {
      svg += renderSvgGrid();
    }

    // Objects
    svg += `<g id="objects">\n`;
    const sorted = [...AppState.objects].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    for (const obj of sorted) {
      const center = ObjectManager.getObjectCenter(obj);
      svg += `<g transform="translate(${center.x}, ${center.y}) rotate(${obj.rotation})">\n`;
      const halfW = obj.width / 2;
      const halfH = obj.height / 2;

      if (obj.shapeType === 'rect') {
        if (obj.fillType === 'image' && obj.imageData) {
          svg += `<image href="${obj.imageData}" x="${-halfW}" y="${-halfH}" width="${obj.width}" height="${obj.height}" />\n`;
        } else {
          svg += `<rect x="${-halfW}" y="${-halfH}" width="${obj.width}" height="${obj.height}" fill="${obj.color}" stroke="${obj.strokeColor}" stroke-width="${obj.strokeWidth || 1}" />\n`;
        }
      } else if (obj.shapeType === 'cells' && obj.cells) {
        const rows = obj.cells.length;
        const cols = obj.cells[0].length;
        const cW = obj.width / cols;
        const cH = obj.height / rows;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (obj.cells[r][c] === 1) {
              svg += `<rect x="${-halfW + c * cW}" y="${-halfH + r * cH}" width="${cW}" height="${cH}" fill="${obj.color}" stroke="${obj.strokeColor}" stroke-width="${obj.strokeWidth || 1}" />\n`;
            }
          }
        }
      }

      if (obj.text && obj.text.trim().length > 0) {
        svg += `<text x="0" y="0" dominant-baseline="middle" text-anchor="middle" fill="${obj.textColor}" font-size="${obj.fontSize}" font-weight="600">${obj.text}</text>\n`;
      }
      svg += `</g>\n`;
    }
    svg += `</g>\n`;

    // Walls
    svg += `<g id="walls">\n`;
    for (const [key, wall] of AppState.walls.entries()) {
      svg += `<line x1="${wall.x1}" y1="${wall.y1}" x2="${wall.x2}" y2="${wall.y2}" stroke="${wall.color || '#1e293b'}" stroke-width="${wall.thickness || 3}" stroke-linecap="round" />\n`;
    }
    svg += `</g>\n`;

    // Openings
    svg += `<g id="openings">\n`;
    for (const op of AppState.openings) {
      svg += `<g transform="translate(${op.x}, ${op.y}) rotate(${op.rotation * 180 / Math.PI})">\n`;
      const w = op.width;
      if (op.type === 'door-single') {
        svg += `<line x1="${-w / 2}" y1="0" x2="${-w / 2}" y2="${-w}" stroke="${op.color || '#ca8a04'}" stroke-width="2" />\n`;
        svg += `<path d="M ${-w / 2} 0 A ${w} ${w} 0 0 0 ${w / 2} 0" fill="none" stroke="${op.color || '#ca8a04'}" stroke-width="2" stroke-dasharray="3,3" />\n`;
      } else if (op.type === 'window') {
        svg += `<rect x="${-w / 2}" y="-3" width="${w}" height="6" fill="rgba(56, 189, 248, 0.3)" />\n`;
        svg += `<line x1="${-w / 2}" y1="-2" x2="${w / 2}" y2="-2" stroke="#38bdf8" stroke-width="1.5" />\n`;
        svg += `<line x1="${-w / 2}" y1="2" x2="${w / 2}" y2="2" stroke="#38bdf8" stroke-width="1.5" />\n`;
      }
      svg += `</g>\n`;
    }
    svg += `</g>\n`;

    svg += `</svg>`;

    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `map_${Date.now()}.svg`;
    if (typeof a.click === 'function') a.click();
    URL.revokeObjectURL(url);
    if (window.App) App.showToast('SVG画像をエクスポートしました', 'success');
    return svg;
  },

  // Save Map as JSON File
  saveMapJSON() {
    const data = AppState.serializeMapData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `map_${new Date().toISOString().slice(0, 10)}.json`;
    if (typeof a.click === 'function') a.click();
    URL.revokeObjectURL(url);
    if (window.App) App.showToast('マップデータをJSONとして保存しました', 'success');
  },

  // Load Map from JSON File
  loadMapFromFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        AppState.deserializeMapData(data);
        AppState.pushHistory('ファイル読み込み');
        if (window.App) App.showToast('マップデータを読み込みました', 'success');
      } catch (err) {
        alert('ファイルの読み込みに失敗しました: ' + err.message);
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  },

  initExportModalEvents() {
    const btnOpen = document.getElementById('btn-export-image');
    if (btnOpen) {
      btnOpen.onclick = () => {
        document.getElementById('modal-export-image').classList.add('active');
      };
    }

    const btnDoExport = document.getElementById('btn-do-export');
    if (btnDoExport) {
      btnDoExport.onclick = () => {
        const format = document.getElementById('export-format').value;
        const padding = parseInt(document.getElementById('export-padding').value, 10) || 2;
        const includeGrid = document.getElementById('export-include-grid').checked;
        const transparent = document.getElementById('export-transparent-bg').checked;

        document.getElementById('modal-export-image').classList.remove('active');

        if (format === 'png') {
          this.exportPNG(padding, includeGrid, transparent);
        } else {
          this.exportSVG(padding, includeGrid, transparent);
        }
      };
    }
  },

  initFileLoadEvents() {
    const btnSave = document.getElementById('btn-save-json');
    if (btnSave) {
      btnSave.onclick = () => this.saveMapJSON();
    }

    const btnLoad = document.getElementById('btn-load-json');
    const fileInput = document.getElementById('file-input-map');
    if (btnLoad && fileInput) {
      btnLoad.onclick = () => fileInput.click();
      fileInput.onchange = (e) => this.loadMapFromFile(e);
    }
  }
};

if (typeof window !== 'undefined') window.ExportManager = ExportManager;
if (typeof global !== 'undefined') global.ExportManager = ExportManager;
