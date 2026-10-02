/**
 * objects.js - Map Object Model, Hit Testing & Transformations
 */

const ObjectManager = {
  // Create a new map object from palette definition or parameters
  createObject(paletteItem, worldX, worldY, snap = true) {
    const snapUnit = GridManager.getSnapUnit();
    // Snap top-left to placement grid if requested
    const targetX = snap ? GridManager.snapToPlacementGrid(worldX, worldY).x : worldX;
    const targetY = snap ? GridManager.snapToPlacementGrid(worldX, worldY).y : worldY;

    const obj = {
      id: 'obj-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      paletteItemId: paletteItem.id || null,
      name: paletteItem.name || 'オブジェクト',
      x: targetX,
      y: targetY,
      width: paletteItem.width || (snapUnit * 2),
      height: paletteItem.height || (snapUnit * 2),
      rotation: 0, // In degrees: 0, 90, 180, 270
      shapeType: paletteItem.shapeType || 'rect', // 'rect' | 'cells'
      cells: paletteItem.cells ? JSON.parse(JSON.stringify(paletteItem.cells)) : null,
      fillType: paletteItem.fillType || 'color',
      color: paletteItem.color || '#3b82f6',
      strokeColor: paletteItem.strokeColor || '#1d4ed8',
      strokeWidth: paletteItem.strokeWidth || 1,
      imageData: paletteItem.imageData || null,
      imageElement: null, // Cached Image() for rendering
      text: paletteItem.text || '',
      textColor: paletteItem.textColor || '#ffffff',
      fontSize: paletteItem.fontSize || 12,
      zIndex: AppState.objects.length + 1
    };

    // Preload image if applicable (reuse loaded element if available)
    if (obj.fillType === 'image' && obj.imageData) {
      if (paletteItem.imageElement && paletteItem.imageElement.complete) {
        obj.imageElement = paletteItem.imageElement;
      }
      this.loadImage(obj);
    }

    AppState.objects.push(obj);
    return obj;
  },

  // Cache Image element for rendering
  loadImage(obj) {
    if (!obj.imageData || typeof Image === 'undefined') return;
    const img = new Image();
    img.src = obj.imageData;
    img.onload = () => {
      obj.imageElement = img;
      if (typeof window !== 'undefined' && window.CanvasManager) CanvasManager.requestRender();
    };
    if (img.complete) {
      obj.imageElement = img;
    }
  },

  // Preload images for all palette items that have image fill
  preloadPaletteImages() {
    if (typeof Image === 'undefined' || !AppState || !AppState.paletteItems) return;
    for (const item of AppState.paletteItems) {
      if (item.fillType === 'image' && item.imageData && !item.imageElement) {
        const img = new Image();
        img.src = item.imageData;
        img.onload = () => {
          item.imageElement = img;
          if (typeof window !== 'undefined' && window.CanvasManager) CanvasManager.requestRender();
        };
        if (img.complete) {
          item.imageElement = img;
        }
        item.imageElement = img;
      }
    }
  },

  // Get Object Center in World Coordinates
  getObjectCenter(obj) {
    return {
      x: obj.x + obj.width / 2,
      y: obj.y + obj.height / 2
    };
  },

  // Hit Test: Check if world point (px, py) is inside object
  hitTest(obj, px, py) {
    const center = this.getObjectCenter(obj);

    // Inverse rotate point around object center to align with local AABB
    const rad = -obj.rotation * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const dx = px - center.x;
    const dy = py - center.y;

    const localX = cos * dx - sin * dy + obj.width / 2;
    const localY = sin * dx + cos * dy + obj.height / 2;

    // Check bounds of local box [0, width] x [0, height]
    if (localX < 0 || localX > obj.width || localY < 0 || localY > obj.height) {
      return false;
    }

    // If shape is 'rect', it's a hit!
    if (obj.shapeType !== 'cells' || !obj.cells || obj.cells.length === 0) {
      return true;
    }

    // For 'cells' shape, test specific sub-cell
    const rows = obj.cells.length;
    const cols = obj.cells[0].length;
    const cellW = obj.width / cols;
    const cellH = obj.height / rows;

    const colIndex = Math.floor(localX / cellW);
    const rowIndex = Math.floor(localY / cellH);

    if (rowIndex >= 0 && rowIndex < rows && colIndex >= 0 && colIndex < cols) {
      return obj.cells[rowIndex][colIndex] === 1;
    }

    return false;
  },

  // Find topmost object at world point
  findObjectAt(worldX, worldY) {
    // Search in reverse order (topmost first)
    const sorted = [...AppState.objects].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));
    for (const obj of sorted) {
      if (this.hitTest(obj, worldX, worldY)) {
        return obj;
      }
    }
    return null;
  },

  // Get axis-aligned bounding box (AABB) of object after rotation
  getAABB(obj) {
    const center = this.getObjectCenter(obj);
    const rad = obj.rotation * Math.PI / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));

    const halfW = (obj.width * cos + obj.height * sin) / 2;
    const halfH = (obj.width * sin + obj.height * cos) / 2;

    return {
      minX: center.x - halfW,
      minY: center.y - halfH,
      maxX: center.x + halfW,
      maxY: center.y + halfH,
      width: halfW * 2,
      height: halfH * 2
    };
  },

  // Rotate object by 90 degrees
  rotateObject(obj, clockwise = true) {
    const delta = clockwise ? 90 : -90;
    obj.rotation = (obj.rotation + delta + 360) % 360;

    // When rotating 90 or 270, ensure snap alignment
    const snapUnit = GridManager.getSnapUnit();
    const snapped = GridManager.snapToPlacementGrid(obj.x, obj.y);
    obj.x = snapped.x;
    obj.y = snapped.y;
  },

  // Clone an object with offset
  cloneObject(obj, offsetX = 20, offsetY = 20) {
    const copy = JSON.parse(JSON.stringify(obj));
    copy.id = 'obj-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
    copy.x += offsetX;
    copy.y += offsetY;
    copy.zIndex = AppState.objects.length + 1;
    if (copy.fillType === 'image' && copy.imageData) {
      this.loadImage(copy);
    }
    AppState.objects.push(copy);
    return copy;
  },

  // Move object by delta (dx, dy) and snap to placement grid
  moveObject(obj, targetX, targetY) {
    const snapped = GridManager.snapToPlacementGrid(targetX, targetY);
    obj.x = snapped.x;
    obj.y = snapped.y;
  },

  // Delete object
  deleteObject(objId) {
    AppState.objects = AppState.objects.filter(o => o.id !== objId);
    AppState.selectedObjectIds.delete(objId);
  },

  // Normalize zIndex values sequentially (1, 2, 3...)
  normalizeZIndices() {
    const sorted = [...AppState.objects].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    sorted.forEach((obj, idx) => {
      obj.zIndex = idx + 1;
    });
  },

  // Bring object to front (highest zIndex)
  bringToFront(obj) {
    if (!obj || AppState.objects.length <= 1) return;
    this.normalizeZIndices();
    const maxZ = AppState.objects.reduce((max, o) => Math.max(max, o.zIndex || 0), 0);
    obj.zIndex = maxZ + 1;
    this.normalizeZIndices();
  },

  // Send object to back (lowest zIndex)
  sendToBack(obj) {
    if (!obj || AppState.objects.length <= 1) return;
    this.normalizeZIndices();
    obj.zIndex = 0;
    this.normalizeZIndices();
  },

  // Bring object one step forward
  bringForward(obj) {
    if (!obj || AppState.objects.length <= 1) return;
    this.normalizeZIndices();
    const sorted = [...AppState.objects].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    const idx = sorted.findIndex(o => o.id === obj.id);
    if (idx !== -1 && idx < sorted.length - 1) {
      const nextObj = sorted[idx + 1];
      const temp = obj.zIndex;
      obj.zIndex = nextObj.zIndex;
      nextObj.zIndex = temp;
    }
  },

  // Send object one step backward
  sendBackward(obj) {
    if (!obj || AppState.objects.length <= 1) return;
    this.normalizeZIndices();
    const sorted = [...AppState.objects].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    const idx = sorted.findIndex(o => o.id === obj.id);
    if (idx > 0) {
      const prevObj = sorted[idx - 1];
      const temp = obj.zIndex;
      obj.zIndex = prevObj.zIndex;
      prevObj.zIndex = temp;
    }
  }
};

if (typeof window !== 'undefined') window.ObjectManager = ObjectManager;
if (typeof global !== 'undefined') global.ObjectManager = ObjectManager;
