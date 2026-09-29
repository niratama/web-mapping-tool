/**
 * grid.js - Grid Coordinate Math & Grid Renderer
 */

const GridManager = {
  // Get placement snap unit
  getSnapUnit() {
    return AppState.grid.visualCellSize / AppState.grid.subdivisions;
  },

  // Coordinate Conversion: Screen to World
  screenToWorld(screenX, screenY) {
    const { panX, panY, zoom } = AppState.viewport;
    return {
      x: (screenX - panX) / zoom,
      y: (screenY - panY) / zoom
    };
  },

  // Coordinate Conversion: World to Screen
  worldToScreen(worldX, worldY) {
    const { panX, panY, zoom } = AppState.viewport;
    return {
      x: worldX * zoom + panX,
      y: worldY * zoom + panY
    };
  },

  // Snap point to placement grid
  snapToPlacementGrid(worldX, worldY) {
    const unit = this.getSnapUnit();
    return {
      x: Math.round(worldX / unit) * unit,
      y: Math.round(worldY / unit) * unit
    };
  },

  // Snap point to visual grid intersection
  snapToVisualGrid(worldX, worldY) {
    const size = AppState.grid.visualCellSize;
    return {
      x: Math.round(worldX / size) * size,
      y: Math.round(worldY / size) * size
    };
  },

  // Convert World Position to Visual Grid Cell (col, row)
  worldToCell(worldX, worldY) {
    const size = AppState.grid.visualCellSize;
    return {
      col: Math.floor(worldX / size),
      row: Math.floor(worldY / size)
    };
  },

  // Convert Visual Grid Cell (col, row) to World Position (top-left)
  cellToWorld(col, row) {
    const size = AppState.grid.visualCellSize;
    return {
      x: col * size,
      y: row * size
    };
  },

  // Render Infinite Grid onto Canvas
  renderGrid(ctx, canvasWidth, canvasHeight) {
    const { panX, panY, zoom } = AppState.viewport;
    const visualSize = AppState.grid.visualCellSize;
    const snapUnit = this.getSnapUnit();

    // Calculate visible world bounding box
    const topLeft = this.screenToWorld(0, 0);
    const bottomRight = this.screenToWorld(canvasWidth, canvasHeight);

    // Padding to ensure grid extends beyond canvas edges
    const startX = Math.floor(topLeft.x / visualSize) * visualSize - visualSize;
    const endX = Math.ceil(bottomRight.x / visualSize) * visualSize + visualSize;
    const startY = Math.floor(topLeft.y / visualSize) * visualSize - visualSize;
    const endY = Math.ceil(bottomRight.y / visualSize) * visualSize + visualSize;

    ctx.save();

    // 1. Draw Subdivisions (Placement Snap Grid) if enabled and zoom is sufficient
    if (AppState.grid.showSnap && AppState.grid.subdivisions > 1 && zoom > 0.4) {
      ctx.beginPath();
      ctx.lineWidth = 1;
      ctx.strokeStyle = AppState.grid.snapColor;
      ctx.setLineDash([2, 3]);

      // Vertical snap lines
      for (let x = startX; x <= endX; x += snapUnit) {
        // Skip lines that coincide with visual grid lines
        if (Math.abs(x % visualSize) > 0.001 && Math.abs(x % visualSize - visualSize) > 0.001) {
          const s1 = this.worldToScreen(x, startY);
          const s2 = this.worldToScreen(x, endY);
          ctx.moveTo(s1.x, s1.y);
          ctx.lineTo(s2.x, s2.y);
        }
      }

      // Horizontal snap lines
      for (let y = startY; y <= endY; y += snapUnit) {
        if (Math.abs(y % visualSize) > 0.001 && Math.abs(y % visualSize - visualSize) > 0.001) {
          const s1 = this.worldToScreen(startX, y);
          const s2 = this.worldToScreen(endX, y);
          ctx.moveTo(s1.x, s1.y);
          ctx.lineTo(s2.x, s2.y);
        }
      }

      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 2. Draw Main Visual Grid Lines
    ctx.beginPath();
    ctx.lineWidth = 1;
    ctx.strokeStyle = AppState.grid.visualColor;

    // Vertical visual lines
    for (let x = startX; x <= endX; x += visualSize) {
      const s1 = this.worldToScreen(x, startY);
      const s2 = this.worldToScreen(x, endY);
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
    }

    // Horizontal visual lines
    for (let y = startY; y <= endY; y += visualSize) {
      const s1 = this.worldToScreen(startX, y);
      const s2 = this.worldToScreen(endX, y);
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
    }

    ctx.stroke();

    // 3. Draw World Origin (0,0) Marker
    const origin = this.worldToScreen(0, 0);
    ctx.beginPath();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.arc(origin.x, origin.y, 6, 0, Math.PI * 2);
    ctx.moveTo(origin.x - 12, origin.y);
    ctx.lineTo(origin.x + 12, origin.y);
    ctx.moveTo(origin.x, origin.y - 12);
    ctx.lineTo(origin.x, origin.y + 12);
    ctx.stroke();

    ctx.restore();
  }
};

if (typeof window !== 'undefined') window.GridManager = GridManager;
if (typeof global !== 'undefined') global.GridManager = GridManager;
