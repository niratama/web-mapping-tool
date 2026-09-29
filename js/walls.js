/**
 * walls.js - Floor Painting, Automatic Perimeter Wall Generation & Manual Wall System
 */

const WallManager = {
  // Normalize Edge so that (x1,y1)-(x2,y2) and (x2,y2)-(x1,y1) have the same unique key
  normalizeEdge(x1, y1, x2, y2) {
    if (x1 < x2 || (x1 === x2 && y1 < y2)) {
      return { x1, y1, x2, y2, key: `${x1},${y1}-${x2},${y2}` };
    } else {
      return { x1: x2, y1: y2, x2: x1, y2: y1, key: `${x2},${y2}-${x1},${y1}` };
    }
  },

  // Key generator for floor cells
  cellKey(col, row) {
    return `${col},${row}`;
  },

  // Set or update a floor cell
  setFloor(col, row, color, texture = 'none') {
    const key = this.cellKey(col, row);
    AppState.floors.set(key, {
      col,
      row,
      color: color || AppState.paintStyle.floorColor,
      texture: texture || AppState.paintStyle.floorTexture
    });
    this.rebuildAutoWalls();
  },

  // Remove a floor cell
  removeFloor(col, row) {
    const key = this.cellKey(col, row);
    AppState.floors.delete(key);
    this.rebuildAutoWalls();
  },

  // Rebuild Automatic Perimeter Walls from current Floor cells
  updatePerimeterWalls() {
    this.rebuildAutoWalls();
  },

  rebuildAutoWalls() {
    const visualSize = AppState.grid.visualCellSize;

    // 1. Remove all non-manual (auto-generated) walls
    for (const [key, wall] of AppState.walls.entries()) {
      if (!wall.isManual) {
        AppState.walls.delete(key);
      }
    }

    if (AppState.paintStyle && AppState.paintStyle.autoPerimeterWall === false) {
      return;
    }

    // 2. Count edge occurrences for all floor cells
    // An edge is a perimeter wall if exactly one adjacent cell has a floor.
    const edgeCounts = new Map(); // key -> { count, x1, y1, x2, y2 }

    for (const [key, floor] of AppState.floors.entries()) {
      const col = floor.col;
      const row = floor.row;

      const xL = col * visualSize;
      const xR = (col + 1) * visualSize;
      const yT = row * visualSize;
      const yB = (row + 1) * visualSize;

      // 4 edges of cell (col, row)
      const edges = [
        this.normalizeEdge(xL, yT, xR, yT), // Top
        this.normalizeEdge(xL, yB, xR, yB), // Bottom
        this.normalizeEdge(xL, yT, xL, yB), // Left
        this.normalizeEdge(xR, yT, xR, yB)  // Right
      ];

      for (const e of edges) {
        if (!edgeCounts.has(e.key)) {
          edgeCounts.set(e.key, { count: 1, ...e });
        } else {
          edgeCounts.get(e.key).count++;
        }
      }
    }

    // 3. Register perimeter edges (count === 1) as walls
    for (const [key, data] of edgeCounts.entries()) {
      if (data.count === 1) {
        // Only add if not already present as manual wall
        if (!AppState.walls.has(key)) {
          AppState.walls.set(key, {
            id: 'wall-auto-' + key,
            x1: data.x1,
            y1: data.y1,
            x2: data.x2,
            y2: data.y2,
            thickness: 3,
            color: AppState.paintStyle.wallColor,
            texture: AppState.paintStyle.wallTexture,
            isManual: false
          });
        }
      }
    }
  },

  // Add a manual wall between two grid points
  addManualWall(x1, y1, x2, y2, color, thickness = 3) {
    if (x1 === x2 && y1 === y2) return null; // Zero-length

    const norm = this.normalizeEdge(x1, y1, x2, y2);
    const wall = {
      id: 'wall-manual-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      x1: norm.x1,
      y1: norm.y1,
      x2: norm.x2,
      y2: norm.y2,
      thickness,
      color: color || AppState.paintStyle.wallColor,
      texture: AppState.paintStyle.wallTexture,
      isManual: true
    };

    AppState.walls.set(norm.key, wall);
    return wall;
  },

  // Remove a wall
  removeWall(key) {
    AppState.walls.delete(key);
    // Also remove any openings associated with this wall
    AppState.openings = AppState.openings.filter(o => o.wallKey !== key);
  },

  // Find wall segment closest to a world position
  findWallNearPoint(worldX, worldY, maxDist = 8) {
    let closest = null;
    let minDist = maxDist;
    for (const [key, wall] of AppState.walls.entries()) {
      const dist = this.pointToSegmentDistance(worldX, worldY, wall.x1, wall.y1, wall.x2, wall.y2);
      if (dist <= minDist) {
        minDist = dist;
        closest = { key, wall, dist };
      }
    }
    return closest;
  },

  // Distance from point (px, py) to line segment (x1, y1)-(x2, y2)
  pointToSegmentDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
      return Math.hypot(px - x1, py - y1);
    }

    // Projection scalar t on the segment
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.hypot(px - projX, py - projY);
  },

  // Calculate snapped opening position along a wall
  // Aligns precisely with visual grid cells (or snap grid)
  calculateSnappedOpeningPosition(wall, worldX, worldY, openingWidth = 40, snapToSubGrid = false) {
    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    const wallLength = Math.hypot(dx, dy);
    if (wallLength < 0.001) return null;

    const uX = dx / wallLength;
    const uY = dy / wallLength;

    // Project (worldX, worldY) onto the infinite line of the wall
    const projDist = (worldX - wall.x1) * uX + (worldY - wall.y1) * uY;

    const visualSize = (AppState.grid && AppState.grid.visualCellSize) ? AppState.grid.visualCellSize : 40;
    const snapUnit = (typeof GridManager !== 'undefined' && GridManager.getSnapUnit) ? GridManager.getSnapUnit() : 20;

    // Determine grid step:
    // If opening occupies full visual cell (or larger) and sub-grid snap is not forced, snap to visual cell
    const step = (!snapToSubGrid && openingWidth >= visualSize) ? visualSize : snapUnit;

    const isHorizontal = Math.abs(dy) < 0.001;
    const isVertical = Math.abs(dx) < 0.001;

    let targetMidDist;

    if (isHorizontal) {
      // Wall runs along X axis
      const cellIndex = Math.floor(worldX / step);
      const targetMidX = cellIndex * step + openingWidth / 2;
      targetMidDist = (targetMidX - wall.x1) * (dx >= 0 ? 1 : -1);
    } else if (isVertical) {
      // Wall runs along Y axis
      const cellIndex = Math.floor(worldY / step);
      const targetMidY = cellIndex * step + openingWidth / 2;
      targetMidDist = (targetMidY - wall.y1) * (dy >= 0 ? 1 : -1);
    } else {
      // Diagonal wall
      const cellIndex = Math.floor(projDist / step);
      targetMidDist = cellIndex * step + openingWidth / 2;
    }

    // Clamp opening within wall endpoints
    const halfW = openingWidth / 2;
    let distAlong = targetMidDist;
    if (wallLength >= openingWidth) {
      distAlong = Math.max(halfW, Math.min(wallLength - halfW, distAlong));
    } else {
      distAlong = wallLength / 2;
    }

    const midX = wall.x1 + distAlong * uX;
    const midY = wall.y1 + distAlong * uY;
    const t = distAlong / wallLength;
    const angle = Math.atan2(dy, dx);

    return { midX, midY, t, angle, wallLength };
  },

  // Add opening (door/window) to a wall with grid snap
  addOpening(wallKey, worldX, worldY, openingItem) {
    const wall = AppState.walls.get(wallKey);
    if (!wall) return null;

    const width = openingItem.width || AppState.grid.visualCellSize;
    const snapped = this.calculateSnappedOpeningPosition(wall, worldX, worldY, width);
    if (!snapped) return null;

    const opStyle = (typeof AppState !== 'undefined' && AppState.openingStyle) ? AppState.openingStyle : {};
    const flipSwing = (typeof openingItem.flipSwing !== 'undefined') ? !!openingItem.flipSwing : !!opStyle.flipSwing;
    const flipHinge = (typeof openingItem.flipHinge !== 'undefined') ? !!openingItem.flipHinge : !!opStyle.flipHinge;

    const opening = {
      id: 'open-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      wallKey,
      name: openingItem.name || '開口部',
      t: snapped.t,
      x: snapped.midX,
      y: snapped.midY,
      rotation: snapped.angle,
      type: openingItem.openingType || openingItem.type || opStyle.type || 'door-single',
      width,
      color: openingItem.color || opStyle.color || '#ca8a04',
      flipSwing,
      flipHinge
    };

    AppState.openings.push(opening);
    return opening;
  },

  // Find opening near point for selection or hit testing using oriented bounding box
  findOpeningNearPoint(worldX, worldY, maxDist = 20) {
    let closest = null;
    let minDist = Infinity;

    for (const op of AppState.openings) {
      const dx = worldX - op.x;
      const dy = worldY - op.y;
      const cos = Math.cos(-op.rotation);
      const sin = Math.sin(-op.rotation);
      const localX = dx * cos - dy * sin;
      const localY = dx * sin + dy * cos;

      const halfW = (op.width || 40) / 2;
      const marginX = Math.max(8, maxDist * 0.5);
      // Doors swing outwards, so give extra hit area in Y direction
      const extentY = (op.type === 'door-single' || op.type === 'door-double')
        ? Math.max(24, (op.width || 40) + 6)
        : Math.max(16, maxDist);

      if (Math.abs(localX) <= halfW + marginX && Math.abs(localY) <= extentY) {
        const dist = Math.hypot(localX, localY);
        if (dist < minDist) {
          minDist = dist;
          closest = op;
        }
      }
    }
    return closest;
  },

  // Remove opening by ID
  removeOpening(id) {
    AppState.openings = AppState.openings.filter(o => o.id !== id);
    AppState.selectedOpeningIds.delete(id);
  }
};

if (typeof window !== 'undefined') window.WallManager = WallManager;
if (typeof global !== 'undefined') global.WallManager = WallManager;
