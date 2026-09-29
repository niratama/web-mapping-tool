/**
 * canvas.js - Canvas Interaction, Viewport Pan/Zoom, Tool Handlers & DnD
 */

const CanvasManager = {
  canvas: null,
  ctx: null,
  renderRequested: false,

  // Dragging / Interaction State
  isDragging: false,
  dragMode: null, // 'pan' | 'move-object' | 'wall-draw' | 'floor-paint' | 'rubberband'
  dragStartScreen: { x: 0, y: 0 },
  dragStartWorld: { x: 0, y: 0 },
  lastMouseScreen: { x: 0, y: 0 },
  spacePressed: false,

  // Track initial positions of selected objects when moving
  dragObjectInitialPositions: new Map(), // objId -> { x, y }

  init() {
    this.canvas = document.getElementById('mapCanvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    this.resizeCanvas();
    window.addEventListener('resize', () => {
      this.resizeCanvas();
      this.requestRender();
    });

    this.initMouseEvents();
    this.initDnDEvents();
    this.initViewportButtons();

    // Start render loop
    this.requestRender();
  },

  resizeCanvas() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  },

  // Request Animation Frame Render
  requestRender() {
    if (!this.renderRequested) {
      this.renderRequested = true;
      const raf = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : (cb) => setTimeout(cb, 16);
      raf(() => {
        this.renderRequested = false;
        if (this.ctx && this.canvas) {
          CanvasRenderer.render(this.ctx, this.canvas.width, this.canvas.height);
        }
      });
    }
  },

  // Viewport Floating Buttons
  initViewportButtons() {
    const btnIn = document.getElementById('btn-zoom-in');
    const btnOut = document.getElementById('btn-zoom-out');
    const btnFit = document.getElementById('btn-zoom-fit');
    const indicator = document.getElementById('zoom-indicator');

    if (btnIn) btnIn.onclick = () => this.zoomAroundScreenCenter(1.2);
    if (btnOut) btnOut.onclick = () => this.zoomAroundScreenCenter(1 / 1.2);
    if (btnFit) btnFit.onclick = () => this.fitToContent();
    if (indicator) {
      indicator.onclick = () => {
        AppState.viewport.zoom = 1.0;
        this.updateZoomIndicator();
        this.requestRender();
      };
    }
  },

  updateZoomIndicator() {
    const indicator = document.getElementById('zoom-indicator');
    if (indicator) {
      indicator.textContent = `${Math.round(AppState.viewport.zoom * 100)}%`;
    }
  },

  zoomAroundScreenCenter(factor) {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    this.zoomAroundPoint(cx, cy, factor);
  },

  zoomAroundPoint(screenX, screenY, factor) {
    const oldZoom = AppState.viewport.zoom;
    let newZoom = Math.max(0.15, Math.min(5.0, oldZoom * factor));

    const worldBefore = GridManager.screenToWorld(screenX, screenY);
    AppState.viewport.zoom = newZoom;
    const worldAfter = GridManager.screenToWorld(screenX, screenY);

    // Adjust pan so world point remains under screen point
    AppState.viewport.panX += (worldAfter.x - worldBefore.x) * newZoom;
    AppState.viewport.panY += (worldAfter.y - worldBefore.y) * newZoom;

    this.updateZoomIndicator();
    this.requestRender();
  },

  fitToContent() {
    const box = ExportManager.calculateBoundingBox(2);
    const padding = 40;
    const availW = this.canvas.width - padding * 2;
    const availH = this.canvas.height - padding * 2;

    const zoomX = availW / box.width;
    const zoomY = availH / box.height;
    const newZoom = Math.max(0.2, Math.min(2.0, Math.min(zoomX, zoomY)));

    AppState.viewport.zoom = newZoom;
    const centerX = box.minX + box.width / 2;
    const centerY = box.minY + box.height / 2;

    AppState.viewport.panX = this.canvas.width / 2 - centerX * newZoom;
    AppState.viewport.panY = this.canvas.height / 2 - centerY * newZoom;

    this.updateZoomIndicator();
    this.requestRender();
  },

  // Mouse / Pointer Event Listeners
  initMouseEvents() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !this.spacePressed) {
        const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (tag !== 'input' && tag !== 'textarea') {
          this.spacePressed = true;
          this.canvas.style.cursor = 'grab';
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.spacePressed = false;
        this.canvas.style.cursor = '';
      }
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      this.zoomAroundPoint(e.offsetX, e.offsetY, factor);
    }, { passive: false });

    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
  },

  onMouseDown(e) {
    if (e.button !== 0 && e.button !== 1) return; // Only left or middle click

    const screenX = e.offsetX;
    const screenY = e.offsetY;
    const world = GridManager.screenToWorld(screenX, screenY);

    this.isDragging = true;
    this.dragStartScreen = { x: screenX, y: screenY };
    this.dragStartWorld = { x: world.x, y: world.y };
    this.lastMouseScreen = { x: screenX, y: screenY };

    // 0. Eyedropper Mode (Color sampling from map)
    if (window.ColorManager && ColorManager.activeDropper) {
      const sampled = ColorManager.sampleColorAt(world.x, world.y);
      const dropper = ColorManager.activeDropper;
      ColorManager.stopEyedropper();
      if (dropper.targetInput) {
        dropper.targetInput.value = sampled;
        dropper.targetInput.dispatchEvent(new Event('change'));
      }
      if (dropper.onPick) {
        dropper.onPick(sampled);
      }
      this.isDragging = false;
      this.requestRender();
      if (window.App) App.showToast(`スポイト:「${sampled}」を取得しました`, 'success');
      return;
    }

    // 1. Pan (Middle Click, Hand Tool, or Space+Drag)
    if (e.button === 1 || AppState.currentTool === 'hand' || this.spacePressed) {
      this.dragMode = 'pan';
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    // 2. Opening Placement Mode (Dedicated Opening Tool or Active Opening Palette Item)
    if (AppState.currentTool === 'opening' || (AppState.activePaletteItem && AppState.activePaletteItem.type === 'opening')) {
      const zoom = AppState.viewport.zoom;
      const tolerance = Math.max(24, 24 / zoom);
      const wallHit = WallManager.findWallNearPoint(world.x, world.y, tolerance);
      if (wallHit) {
        const opStyle = AppState.openingStyle || {};
        const itemToPlace = (AppState.activePaletteItem && AppState.activePaletteItem.type === 'opening')
          ? AppState.activePaletteItem
          : {
              id: 'tool-op-' + Date.now(),
              name: 'ドア・窓',
              group: 'openings',
              type: 'opening',
              openingType: opStyle.type || 'door-single',
              width: opStyle.width || 40,
              color: opStyle.color || '#ca8a04',
              flipSwing: !!opStyle.flipSwing,
              flipHinge: !!opStyle.flipHinge
            };

        const newOp = WallManager.addOpening(wallHit.key, world.x, world.y, itemToPlace);
        if (newOp) {
          AppState.selectedObjectIds.clear();
          AppState.selectedWallKeys.clear();
          AppState.selectedOpeningIds.clear();
          AppState.selectedOpeningIds.add(newOp.id);
          AppState.pushHistory('開口部配置: ' + itemToPlace.name);
          if (window.PaletteManager) PaletteManager.updatePropertyPanel();
          this.requestRender();
          if (window.App) App.showToast(`「${itemToPlace.name}」を壁に配置しました`, 'success');
        }
      }
      return;
    }

    // 2b. Object Placement Mode
    if (AppState.activePaletteItem) {
      const item = AppState.activePaletteItem;
      const snapUnit = GridManager.getSnapUnit();
      const baseW = item.width || snapUnit * 2;
      const baseH = item.height || snapUnit * 2;
      const rot = AppState.activePaletteRotation || 0;
      const snapped = GridManager.snapToPlacementGrid(world.x, world.y);

      const rad = rot * Math.PI / 180;
      const cos = Math.abs(Math.cos(rad));
      const sin = Math.abs(Math.sin(rad));
      const aabbW = baseW * cos + baseH * sin;
      const aabbH = baseW * sin + baseH * cos;

      const centerX = snapped.x + aabbW / 2;
      const centerY = snapped.y + aabbH / 2;

      const obj = ObjectManager.createObject(item, centerX - baseW / 2, centerY - baseH / 2, false);
      obj.rotation = rot;
      AppState.selectedObjectIds.clear();
      AppState.selectedWallKeys.clear();
      AppState.selectedOpeningIds.clear();
      AppState.selectedObjectIds.add(obj.id);
      AppState.pushHistory('オブジェクト配置: ' + obj.name);
      PaletteManager.updatePropertyPanel();
      this.requestRender();
      return;
    }

    // 3. Floor Painting Tool
    if (AppState.currentTool === 'floor') {
      const mode = (AppState.paintStyle && AppState.paintStyle.floorFillMode) || 'brush';
      const isRect = (mode === 'rect') || e.shiftKey;
      const isBucket = (mode === 'bucket');

      if (isBucket) {
        this.floodFillFloor(world.x, world.y);
        this.isDragging = false;
        return;
      }

      const cell = GridManager.worldToCell(world.x, world.y);
      if (isRect) {
        this.dragMode = 'floor-rect';
        this.floorRectStart = { col: cell.col, row: cell.row };
        this.floorRectCurrent = { col: cell.col, row: cell.row };
        this.requestRender();
        return;
      }

      this.dragMode = 'floor-paint';
      WallManager.setFloor(cell.col, cell.row);
      this.requestRender();
      return;
    }

    // 4. Manual Wall Tool
    if (AppState.currentTool === 'wall') {
      this.dragMode = 'wall-draw';
      const snap = GridManager.snapToPlacementGrid(world.x, world.y);
      AppState.wallDrawingStart = snap;
      AppState.previewPosition = snap;
      this.requestRender();
      return;
    }

    // 5. Eraser Tool
    if (AppState.currentTool === 'eraser') {
      this.dragMode = 'eraser';
      this.eraseAt(world.x, world.y);
      return;
    }

    // 6. Select Tool
    if (AppState.currentTool === 'select') {
      // Priority 1: Check Openings (Doors & Windows on walls)
      const opHit = WallManager.findOpeningNearPoint(world.x, world.y, Math.max(20, 20 / AppState.viewport.zoom));
      if (opHit) {
        if (e.shiftKey) {
          if (AppState.selectedOpeningIds.has(opHit.id)) {
            AppState.selectedOpeningIds.delete(opHit.id);
          } else {
            AppState.selectedOpeningIds.add(opHit.id);
          }
        } else {
          AppState.selectedObjectIds.clear();
          AppState.selectedWallKeys.clear();
          AppState.selectedOpeningIds.clear();
          AppState.selectedOpeningIds.add(opHit.id);
        }
        if (window.PaletteManager) PaletteManager.updatePropertyPanel();
        this.requestRender();
        return;
      }

      // Priority 2: Check Objects
      const hitObj = ObjectManager.findObjectAt(world.x, world.y);

      if (hitObj) {
        // Hit Object
        AppState.selectedOpeningIds.clear();
        if (e.shiftKey) {
          // Toggle selection
          if (AppState.selectedObjectIds.has(hitObj.id)) {
            AppState.selectedObjectIds.delete(hitObj.id);
          } else {
            AppState.selectedObjectIds.add(hitObj.id);
          }
        } else {
          if (!AppState.selectedObjectIds.has(hitObj.id)) {
            AppState.selectedObjectIds.clear();
            AppState.selectedWallKeys.clear();
            AppState.selectedObjectIds.add(hitObj.id);
          }
        }

        this.dragMode = 'move-object';
        // Record initial positions for all selected objects
        this.dragObjectInitialPositions.clear();
        for (const id of AppState.selectedObjectIds) {
          const o = AppState.objects.find(item => item.id === id);
          if (o) {
            this.dragObjectInitialPositions.set(id, { x: o.x, y: o.y });
          }
        }

        if (window.PaletteManager) PaletteManager.updatePropertyPanel();
        this.requestRender();
      } else {
        // Did not hit object - check walls
        const wallHit = WallManager.findWallNearPoint(world.x, world.y, 8);
        if (wallHit) {
          if (!e.shiftKey) {
            AppState.selectedWallKeys.clear();
            AppState.selectedObjectIds.clear();
            AppState.selectedOpeningIds.clear();
          }
          AppState.selectedWallKeys.add(wallHit.key);
          if (window.PaletteManager) PaletteManager.updatePropertyPanel();
          this.requestRender();
        } else {
          // Empty space clicked - Start rubberband box selection
          if (!e.shiftKey) {
            AppState.selectedObjectIds.clear();
            AppState.selectedWallKeys.clear();
            AppState.selectedOpeningIds.clear();
            if (window.PaletteManager) PaletteManager.updatePropertyPanel();
          }
          this.dragMode = 'rubberband';
          AppState.selectionBox = {
            startX: screenX,
            startY: screenY,
            currentX: screenX,
            currentY: screenY
          };
          this.requestRender();
        }
      }
    }
  },

  onMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const world = GridManager.screenToWorld(screenX, screenY);

    AppState.previewPosition = world;

    if (!this.isDragging) {
      if (AppState.activePaletteItem || AppState.wallDrawingStart || AppState.currentTool === 'opening' || (window.ColorManager && ColorManager.activeDropper)) {
        this.requestRender();
      }
      return;
    }

    const dxScreen = screenX - this.lastMouseScreen.x;
    const dyScreen = screenY - this.lastMouseScreen.y;
    this.lastMouseScreen = { x: screenX, y: screenY };

    // Pan
    if (this.dragMode === 'pan') {
      AppState.viewport.panX += dxScreen;
      AppState.viewport.panY += dyScreen;
      this.requestRender();
      return;
    }

    // Floor Rect Drag
    if (this.dragMode === 'floor-rect' && this.floorRectStart) {
      const cell = GridManager.worldToCell(world.x, world.y);
      this.floorRectCurrent = { col: cell.col, row: cell.row };
      this.requestRender();
      return;
    }

    // Floor Paint Drag
    if (this.dragMode === 'floor-paint') {
      const cell = GridManager.worldToCell(world.x, world.y);
      WallManager.setFloor(cell.col, cell.row);
      this.requestRender();
      return;
    }

    // Eraser Drag
    if (this.dragMode === 'eraser') {
      this.eraseAt(world.x, world.y);
      return;
    }

    // Wall Draw Drag
    if (this.dragMode === 'wall-draw') {
      AppState.previewPosition = world;
      this.requestRender();
      return;
    }

    // Move Selected Objects
    if (this.dragMode === 'move-object') {
      const totalDxWorld = world.x - this.dragStartWorld.x;
      const totalDyWorld = world.y - this.dragStartWorld.y;

      const snapUnit = GridManager.getSnapUnit();
      const snappedDx = Math.round(totalDxWorld / snapUnit) * snapUnit;
      const snappedDy = Math.round(totalDyWorld / snapUnit) * snapUnit;

      for (const [id, initialPos] of this.dragObjectInitialPositions.entries()) {
        const obj = AppState.objects.find(o => o.id === id);
        if (obj) {
          obj.x = initialPos.x + snappedDx;
          obj.y = initialPos.y + snappedDy;
        }
      }
      PaletteManager.updatePropertyPanel();
      this.requestRender();
      return;
    }

    // Rubberband Box Selection Drag
    if (this.dragMode === 'rubberband') {
      if (AppState.selectionBox) {
        AppState.selectionBox.currentX = screenX;
        AppState.selectionBox.currentY = screenY;
        this.requestRender();
      }
    }
  },

  onMouseUp(e) {
    if (!this.isDragging) return;
    this.isDragging = false;

    if (this.canvas) this.canvas.style.cursor = '';

    // Complete Wall Draw
    if (this.dragMode === 'wall-draw' && AppState.wallDrawingStart) {
      const start = AppState.wallDrawingStart;
      const endSnap = GridManager.snapToPlacementGrid(AppState.previewPosition.x, AppState.previewPosition.y);

      if (start.x !== endSnap.x || start.y !== endSnap.y) {
        WallManager.addManualWall(start.x, start.y, endSnap.x, endSnap.y);
        AppState.pushHistory('壁作成');
      }
      AppState.wallDrawingStart = null;
    }

    // Complete Object Move
    if (this.dragMode === 'move-object') {
      AppState.pushHistory('オブジェクト移動');
    }

    // Complete Floor Rect
    if (this.dragMode === 'floor-rect' && this.floorRectStart && this.floorRectCurrent) {
      const minCol = Math.min(this.floorRectStart.col, this.floorRectCurrent.col);
      const maxCol = Math.max(this.floorRectStart.col, this.floorRectCurrent.col);
      const minRow = Math.min(this.floorRectStart.row, this.floorRectCurrent.row);
      const maxRow = Math.max(this.floorRectStart.row, this.floorRectCurrent.row);

      for (let c = minCol; c <= maxCol; c++) {
        for (let r = minRow; r <= maxRow; r++) {
          WallManager.setFloor(c, r, AppState.paintStyle.floorColor, AppState.paintStyle.floorTexture);
        }
      }
      WallManager.updatePerimeterWalls();
      AppState.pushHistory('矩形床塗り');
      this.floorRectStart = null;
      this.floorRectCurrent = null;
      this.requestRender();
    }

    // Complete Floor Paint
    if (this.dragMode === 'floor-paint') {
      AppState.pushHistory('床・壁塗りつぶし');
    }

    // Complete Rubberband Box Selection
    if (this.dragMode === 'rubberband' && AppState.selectionBox) {
      const { startX, startY, currentX, currentY } = AppState.selectionBox;
      const minScreenX = Math.min(startX, currentX);
      const maxScreenX = Math.max(startX, currentX);
      const minScreenY = Math.min(startY, currentY);
      const maxScreenY = Math.max(startY, currentY);

      const p1 = GridManager.screenToWorld(minScreenX, minScreenY);
      const p2 = GridManager.screenToWorld(maxScreenX, maxScreenY);

      const minW = Math.min(p1.x, p2.x);
      const maxW = Math.max(p1.x, p2.x);
      const minH = Math.min(p1.y, p2.y);
      const maxH = Math.max(p1.y, p2.y);

      // Select objects inside rubberband box
      for (const obj of AppState.objects) {
        const aabb = ObjectManager.getAABB(obj);
        if (aabb.maxX >= minW && aabb.minX <= maxW && aabb.maxY >= minH && aabb.minY <= maxH) {
          AppState.selectedObjectIds.add(obj.id);
        }
      }

      // Select openings inside rubberband box
      for (const op of AppState.openings) {
        if (op.x >= minW && op.x <= maxW && op.y >= minH && op.y <= maxH) {
          AppState.selectedOpeningIds.add(op.id);
        }
      }

      AppState.selectionBox = null;
      PaletteManager.updatePropertyPanel();
    }

    this.dragMode = null;
    this.requestRender();
  },

  // Erase element at world coordinate respecting AppState.eraserTarget
  eraseAt(worldX, worldY) {
    const target = AppState.eraserTarget || 'all';

    // Mode 1: Objects Only
    if (target === 'objects') {
      const hitObj = ObjectManager.findObjectAt(worldX, worldY);
      if (hitObj) {
        ObjectManager.deleteObject(hitObj.id);
        AppState.pushHistory('オブジェクト消去: ' + hitObj.name);
        if (window.PaletteManager) PaletteManager.updatePropertyPanel();
        this.requestRender();
      }
      return;
    }

    // Mode 2: Walls & Openings Only
    if (target === 'walls') {
      const op = AppState.openings.find(o => Math.hypot(o.x - worldX, o.y - worldY) < 16);
      if (op) {
        WallManager.removeOpening(op.id);
        AppState.pushHistory('開口部消去');
        this.requestRender();
        return;
      }
      const wallHit = WallManager.findWallNearPoint(worldX, worldY, 10);
      if (wallHit) {
        WallManager.removeWall(wallHit.key);
        AppState.pushHistory('壁消去');
        this.requestRender();
      }
      return;
    }

    // Mode 3: Floors Only
    if (target === 'floors') {
      const cell = GridManager.worldToCell(worldX, worldY);
      const key = WallManager.cellKey(cell.col, cell.row);
      if (AppState.floors.has(key)) {
        WallManager.removeFloor(cell.col, cell.row);
        AppState.pushHistory('床消去');
        this.requestRender();
      }
      return;
    }

    // Mode 4: All (Default order: Openings -> Objects -> Walls -> Floors)
    const op = AppState.openings.find(o => Math.hypot(o.x - worldX, o.y - worldY) < 16);
    if (op) {
      WallManager.removeOpening(op.id);
      AppState.pushHistory('開口部消去');
      this.requestRender();
      return;
    }

    const hitObj = ObjectManager.findObjectAt(worldX, worldY);
    if (hitObj) {
      ObjectManager.deleteObject(hitObj.id);
      AppState.pushHistory('オブジェクト消去: ' + hitObj.name);
      if (window.PaletteManager) PaletteManager.updatePropertyPanel();
      this.requestRender();
      return;
    }

    const wallHit = WallManager.findWallNearPoint(worldX, worldY, 10);
    if (wallHit) {
      WallManager.removeWall(wallHit.key);
      AppState.pushHistory('壁消去');
      this.requestRender();
      return;
    }

    const cell = GridManager.worldToCell(worldX, worldY);
    const key = WallManager.cellKey(cell.col, cell.row);
    if (AppState.floors.has(key)) {
      WallManager.removeFloor(cell.col, cell.row);
      AppState.pushHistory('床消去');
      this.requestRender();
    }
  },

  // Drag & Drop onto Canvas from Palette
  initDnDEvents() {
    this.canvas.ondragover = (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const world = GridManager.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      AppState.previewPosition = world;
      this.requestRender();
    };

    this.canvas.ondrop = (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const world = GridManager.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

      try {
        const raw = e.dataTransfer.getData('text/plain');
        if (raw) {
          const item = JSON.parse(raw);
          if (item.type === 'opening') {
            const wallHit = WallManager.findWallNearPoint(world.x, world.y, 20);
            if (wallHit) {
              WallManager.addOpening(wallHit.key, world.x, world.y, item);
              AppState.pushHistory('開口部配置: ' + item.name);
            }
          } else {
            const snapUnit = GridManager.getSnapUnit();
            const baseW = item.width || snapUnit * 2;
            const baseH = item.height || snapUnit * 2;
            const rot = AppState.activePaletteRotation || 0;
            const snapped = GridManager.snapToPlacementGrid(world.x, world.y);

            const rad = rot * Math.PI / 180;
            const cos = Math.abs(Math.cos(rad));
            const sin = Math.abs(Math.sin(rad));
            const aabbW = baseW * cos + baseH * sin;
            const aabbH = baseW * sin + baseH * cos;

            const centerX = snapped.x + aabbW / 2;
            const centerY = snapped.y + aabbH / 2;

            const obj = ObjectManager.createObject(item, centerX - baseW / 2, centerY - baseH / 2, false);
            obj.rotation = rot;
            AppState.selectedObjectIds.clear();
            AppState.selectedObjectIds.add(obj.id);
            AppState.pushHistory('オブジェクト配置: ' + obj.name);
            PaletteManager.updatePropertyPanel();
          }
          AppState.activePaletteItem = null;
          this.requestRender();
        }
      } catch (err) {
        console.error(err);
      }
    };
  },

  // Clipboard & Selection Operations
  copySelected() {
    if (AppState.selectedObjectIds.size === 0) return;
    const selected = AppState.objects.filter(o => AppState.selectedObjectIds.has(o.id));
    AppState.clipboard = {
      objects: JSON.parse(JSON.stringify(selected))
    };
    if (window.App) App.showToast(`${selected.length} 個のオブジェクトをコピーしました`);
  },

  pasteClipboard() {
    if (!AppState.clipboard || !AppState.clipboard.objects || AppState.clipboard.objects.length === 0) return;
    const newSelected = new Set();
    const snapUnit = GridManager.getSnapUnit();

    for (const objData of AppState.clipboard.objects) {
      const clone = ObjectManager.cloneObject(objData, snapUnit * 2, snapUnit * 2);
      newSelected.add(clone.id);
    }

    AppState.selectedObjectIds = newSelected;
    AppState.pushHistory('貼り付け');
    PaletteManager.updatePropertyPanel();
    this.requestRender();
    if (window.App) App.showToast('貼り付けました', 'success');
  },

  duplicateSelected() {
    this.copySelected();
    this.pasteClipboard();
  },

  deleteSelected() {
    let deletedCount = 0;
    // Delete objects
    for (const id of AppState.selectedObjectIds) {
      ObjectManager.deleteObject(id);
      deletedCount++;
    }
    // Delete walls
    for (const key of AppState.selectedWallKeys) {
      WallManager.removeWall(key);
      deletedCount++;
    }
    // Delete openings
    for (const opId of AppState.selectedOpeningIds) {
      WallManager.removeOpening(opId);
      deletedCount++;
    }

    AppState.selectedObjectIds.clear();
    AppState.selectedWallKeys.clear();
    AppState.selectedOpeningIds.clear();

    if (deletedCount > 0) {
      AppState.pushHistory('削除');
      PaletteManager.updatePropertyPanel();
      this.requestRender();
      if (window.App) App.showToast(`${deletedCount} 個のアイテムを削除しました`);
    }
  },

  rotateSelected() {
    let changed = false;
    if (AppState.selectedObjectIds.size > 0) {
      for (const id of AppState.selectedObjectIds) {
        const obj = AppState.objects.find(o => o.id === id);
        if (obj) {
          ObjectManager.rotateObject(obj, true);
          changed = true;
        }
      }
    }
    if (AppState.selectedOpeningIds.size > 0) {
      for (const opId of AppState.selectedOpeningIds) {
        const op = AppState.openings.find(o => o.id === opId);
        if (op) {
          op.flipSwing = !op.flipSwing;
          changed = true;
        }
      }
    }
    if (changed) {
      AppState.pushHistory('回転・反転');
      PaletteManager.updatePropertyPanel();
      this.requestRender();
    }
  },

  // 4-way BFS flood fill starting from world coordinates
  floodFillFloor(worldX, worldY) {
    const startCell = GridManager.worldToCell(worldX, worldY);
    const startKey = WallManager.cellKey(startCell.col, startCell.row);
    if (!AppState.floors.has(startKey)) {
      if (window.App) App.showToast('床が存在するマスをクリックして一括色替えを行ってください');
      return;
    }

    const startFloor = AppState.floors.get(startKey);
    const targetColor = startFloor.color;
    const targetTexture = startFloor.texture;
    const newColor = AppState.paintStyle.floorColor;
    const newTexture = AppState.paintStyle.floorTexture;

    if (targetColor === newColor && targetTexture === newTexture) return;

    // 4-way BFS flood fill
    const queue = [[startCell.col, startCell.row]];
    const visited = new Set();
    visited.add(startKey);
    let count = 0;

    while (queue.length > 0) {
      const [col, row] = queue.shift();
      WallManager.setFloor(col, row, newColor, newTexture);
      count++;

      const neighbors = [
        [col + 1, row],
        [col - 1, row],
        [col, row + 1],
        [col, row - 1]
      ];

      for (const [nc, nr] of neighbors) {
        const nKey = WallManager.cellKey(nc, nr);
        if (!visited.has(nKey) && AppState.floors.has(nKey)) {
          const nf = AppState.floors.get(nKey);
          if (nf.color === targetColor && nf.texture === targetTexture) {
            visited.add(nKey);
            queue.push([nc, nr]);
          }
        }
      }
    }

    WallManager.updatePerimeterWalls();
    AppState.pushHistory('床バケツ塗り替え');
    this.requestRender();
    if (window.App) App.showToast(`接続された ${count} マスの床色を変更しました`, 'success');
  },

  // Replace all floor cells on map with current paint style
  replaceAllFloors() {
    if (AppState.floors.size === 0) {
      if (window.App) App.showToast('変更対象の床がマップ上にありません');
      return;
    }
    const newColor = AppState.paintStyle.floorColor;
    const newTexture = AppState.paintStyle.floorTexture;
    for (const f of AppState.floors.values()) {
      f.color = newColor;
      f.texture = newTexture;
    }
    WallManager.updatePerimeterWalls();
    AppState.pushHistory('全床色一括変更');
    this.requestRender();
    if (window.App) App.showToast(`すべての床（${AppState.floors.size}マス）の色を変更しました`, 'success');
  }
};

if (typeof window !== 'undefined') window.CanvasManager = CanvasManager;
if (typeof global !== 'undefined') global.CanvasManager = CanvasManager;
