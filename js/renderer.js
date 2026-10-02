/**
 * renderer.js - HTML5 Canvas 2D Rendering Engine
 */

const CanvasRenderer = {
  // Main Render Cycle
  render(ctx, width, height) {
    // 1. Clear Screen
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // 2. Render Infinite Grid (under floors if showOnFloor is disabled)
    if (AppState.grid.showOnFloor === false) {
      GridManager.renderGrid(ctx, width, height);
    }

    // 3. Render Floors
    this.renderFloors(ctx);

    // 2b. Render Infinite Grid (on top of floors if showOnFloor is enabled)
    if (AppState.grid.showOnFloor !== false) {
      GridManager.renderGrid(ctx, width, height);
    }

    // 4. Render Walls & Openings
    this.renderWallsAndOpenings(ctx);

    // 5. Render Objects (sorted by zIndex)
    this.renderObjects(ctx);

    // 6. Render Selection Highlights & Handles
    this.renderSelections(ctx);

    // 7. Render Active Tool Previews (DnD ghost, wall drawing line, rubberband box)
    this.renderPreviews(ctx);
  },

  // Render All Floor Cells
  renderFloors(ctx) {
    const visualSize = AppState.grid.visualCellSize;

    for (const [key, floor] of AppState.floors.entries()) {
      const worldPos = GridManager.cellToWorld(floor.col, floor.row);
      const screenPos = GridManager.worldToScreen(worldPos.x, worldPos.y);
      const screenSize = visualSize * AppState.viewport.zoom;

      ctx.save();
      // Base Floor Color
      ctx.fillStyle = floor.color || '#e2e8f0';
      ctx.fillRect(screenPos.x, screenPos.y, screenSize, screenSize);

      // Render Procedural Floor Textures if specified
      if (floor.texture && floor.texture !== 'none') {
        this.renderFloorTexture(ctx, screenPos.x, screenPos.y, screenSize, floor.texture);
      }

      ctx.restore();
    }
  },

  // Texture Image Cache
  textureCache: new Map(),

  loadTextureImage(src) {
    if (this.textureCache.has(src)) return this.textureCache.get(src);
    if (typeof Image === 'undefined') return null;

    const img = new Image();
    img.src = src;
    this.textureCache.set(src, img);
    img.onload = () => {
      if (typeof CanvasManager !== 'undefined' && CanvasManager.requestRender) {
        CanvasManager.requestRender();
      }
    };
    return img;
  },

  // Procedural & Image Floor Texture Renderer
  renderFloorTexture(ctx, x, y, size, textureType) {
    if (!textureType || textureType === 'none') return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, size, size);
    ctx.clip(); // Clip to cell

    // 1. Check if texture is an image (DataURL, assets path, or http URL)
    if (textureType.startsWith('data:image/') || textureType.startsWith('assets/') || textureType.startsWith('http')) {
      const img = this.loadTextureImage(textureType);
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, x, y, size, size);
      }
      ctx.restore();
      return;
    }

    if (textureType === 'wood') {
      // Wood plank pattern
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.lineWidth = Math.max(1, 1 * AppState.viewport.zoom);
      const planks = 4;
      const step = size / planks;
      for (let i = 1; i < planks; i++) {
        ctx.beginPath();
        ctx.moveTo(x, y + i * step);
        ctx.lineTo(x + size, y + i * step);
        ctx.stroke();
      }
    } else if (textureType === 'tile') {
      // Tile grid pattern
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.lineWidth = Math.max(1, 1 * AppState.viewport.zoom);
      const tiles = 2;
      const step = size / tiles;
      ctx.strokeRect(x, y, size, size);
      ctx.beginPath();
      ctx.moveTo(x + step, y);
      ctx.lineTo(x + step, y + size);
      ctx.moveTo(x, y + step);
      ctx.lineTo(x + size, y + step);
      ctx.stroke();
    } else if (textureType === 'stone') {
      // Cobblestone / flagstone pattern
      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.lineWidth = Math.max(1, 1 * AppState.viewport.zoom);
      ctx.strokeRect(x + 2, y + 2, size / 2 - 4, size / 2 - 4);
      ctx.strokeRect(x + size / 2 + 2, y + size / 2 + 2, size / 2 - 4, size / 2 - 4);
    } else if (textureType === 'tatami') {
      // Tatami mat border lines
      ctx.strokeStyle = 'rgba(45, 80, 22, 0.4)';
      ctx.lineWidth = Math.max(2, 3 * AppState.viewport.zoom);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + size);
      ctx.moveTo(x + size, y);
      ctx.lineTo(x + size, y + size);
      ctx.stroke();
    } else if (textureType === 'carpet') {
      // Subtle stipple
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(x + size * 0.1, y + size * 0.1, size * 0.8, size * 0.8);
    }

    ctx.restore();
  },

  // Render Walls & Openings (Doors / Windows)
  renderWallsAndOpenings(ctx) {
    const zoom = AppState.viewport.zoom;

    // Render Walls
    for (const [key, wall] of AppState.walls.entries()) {
      const p1 = GridManager.worldToScreen(wall.x1, wall.y1);
      const p2 = GridManager.worldToScreen(wall.x2, wall.y2);

      // Check if wall has openings that require gaps
      const wallOpenings = AppState.openings.filter(o => o.wallKey === key);

      ctx.save();
      ctx.lineWidth = Math.max(2, (wall.thickness || 3) * zoom);
      ctx.strokeStyle = wall.color || '#1e293b';
      ctx.lineCap = 'round';

      if (wallOpenings.length === 0) {
        // Draw continuous wall
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      } else {
        // Draw wall segments around openings
        // Sort openings by parameter t
        wallOpenings.sort((a, b) => a.t - b.t);
        const wallLen = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);

        let currentT = 0;
        for (const op of wallOpenings) {
          const halfT = (op.width / 2) / wallLen;
          const openStartT = Math.max(0, op.t - halfT);
          const openEndT = Math.min(1, op.t + halfT);

          if (openStartT > currentT) {
            // Draw wall segment before opening
            const sX = wall.x1 + currentT * (wall.x2 - wall.x1);
            const sY = wall.y1 + currentT * (wall.y2 - wall.y1);
            const eX = wall.x1 + openStartT * (wall.x2 - wall.x1);
            const eY = wall.y1 + openStartT * (wall.y2 - wall.y1);

            const sp1 = GridManager.worldToScreen(sX, sY);
            const sp2 = GridManager.worldToScreen(eX, eY);
            ctx.beginPath();
            ctx.moveTo(sp1.x, sp1.y);
            ctx.lineTo(sp2.x, sp2.y);
            ctx.stroke();
          }
          currentT = Math.max(currentT, openEndT);
        }

        // Draw final segment after last opening
        if (currentT < 1) {
          const sX = wall.x1 + currentT * (wall.x2 - wall.x1);
          const sY = wall.y1 + currentT * (wall.y2 - wall.y1);
          const sp1 = GridManager.worldToScreen(sX, sY);
          const sp2 = GridManager.worldToScreen(wall.x2, wall.y2);
          ctx.beginPath();
          ctx.moveTo(sp1.x, sp1.y);
          ctx.lineTo(sp2.x, sp2.y);
          ctx.stroke();
        }
      }

      ctx.restore();
    }

    // Render Openings
    for (const op of AppState.openings) {
      this.renderOpeningSymbol(ctx, op);
    }
  },

  // Render Opening Symbol (Single Door, Double Door, Window, Arch)
  renderOpeningSymbol(ctx, op) {
    const center = GridManager.worldToScreen(op.x, op.y);
    const zoom = AppState.viewport.zoom;
    const width = op.width * zoom;

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(op.rotation);

    if (op.type === 'door-single') {
      // Single swing door: Jambs + Leaf + Swing Arc
      ctx.lineWidth = Math.max(1.5, 2 * zoom);
      ctx.strokeStyle = op.color || '#ca8a04';

      const hingeRight = !!op.flipHinge;
      const hingeX = hingeRight ? width / 2 : -width / 2;
      const swingY = op.flipSwing ? width : -width;

      // Door leaf (line)
      ctx.beginPath();
      ctx.moveTo(hingeX, 0);
      ctx.lineTo(hingeX, swingY);
      ctx.stroke();

      // Swing arc (quarter circle)
      ctx.beginPath();
      ctx.setLineDash([3 * zoom, 3 * zoom]);
      if (!hingeRight) {
        ctx.arc(hingeX, 0, width, 0, op.flipSwing ? Math.PI / 2 : -Math.PI / 2, !op.flipSwing);
      } else {
        ctx.arc(hingeX, 0, width, Math.PI, op.flipSwing ? Math.PI / 2 : -Math.PI / 2, op.flipSwing);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (op.type === 'door-double') {
      // Double swing door
      ctx.lineWidth = Math.max(1.5, 2 * zoom);
      ctx.strokeStyle = op.color || '#ca8a04';
      const halfW = width / 2;
      const swingY = op.flipSwing ? halfW : -halfW;

      // Left leaf & arc
      ctx.beginPath();
      ctx.moveTo(-halfW, 0);
      ctx.lineTo(-halfW, swingY);
      ctx.stroke();
      ctx.beginPath();
      ctx.setLineDash([2 * zoom, 2 * zoom]);
      ctx.arc(-halfW, 0, halfW, 0, op.flipSwing ? Math.PI / 2 : -Math.PI / 2, !op.flipSwing);
      ctx.stroke();

      // Right leaf & arc
      ctx.beginPath();
      ctx.moveTo(halfW, 0);
      ctx.lineTo(halfW, swingY);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(halfW, 0, halfW, Math.PI, op.flipSwing ? Math.PI / 2 : -Math.PI / 2, op.flipSwing);
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (op.type === 'window') {
      // Window: Glass fill + colored frame + center pane line
      ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.fillRect(-width / 2, -4 * zoom, width, 8 * zoom);

      ctx.strokeStyle = op.color || '#38bdf8';
      ctx.lineWidth = Math.max(1.5, 2 * zoom);
      ctx.strokeRect(-width / 2, -4 * zoom, width, 8 * zoom);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, 1.5 * zoom);
      ctx.beginPath();
      ctx.moveTo(-width / 2, 0);
      ctx.lineTo(width / 2, 0);
      ctx.stroke();
    } else if (op.type === 'arch') {
      // Archway / Opening: Dotted lines on both jamb ends
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = Math.max(1.5, 2 * zoom);
      ctx.setLineDash([2 * zoom, 2 * zoom]);
      ctx.beginPath();
      ctx.moveTo(-width / 2, -5 * zoom);
      ctx.lineTo(-width / 2, 5 * zoom);
      ctx.moveTo(width / 2, -5 * zoom);
      ctx.lineTo(width / 2, 5 * zoom);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  },

  // Render Map Objects
  renderObjects(ctx) {
    const zoom = AppState.viewport.zoom;
    // Sort by zIndex ascending
    const sorted = [...AppState.objects].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

    for (const obj of sorted) {
      const centerWorld = ObjectManager.getObjectCenter(obj);
      const centerScreen = GridManager.worldToScreen(centerWorld.x, centerWorld.y);
      const screenW = obj.width * zoom;
      const screenH = obj.height * zoom;

      ctx.save();
      // Apply rotation around center
      ctx.translate(centerScreen.x, centerScreen.y);
      ctx.rotate(obj.rotation * Math.PI / 180);

      const halfW = screenW / 2;
      const halfH = screenH / 2;

      // 1. Draw Fill & Stroke
      if (obj.shapeType === 'rect') {
        if (obj.fillType === 'image' && obj.imageElement && obj.imageElement.complete) {
          ctx.drawImage(obj.imageElement, -halfW, -halfH, screenW, screenH);
        } else {
          ctx.fillStyle = obj.color || '#3b82f6';
          ctx.fillRect(-halfW, -halfH, screenW, screenH);
        }

        ctx.strokeStyle = obj.strokeColor || '#1d4ed8';
        ctx.lineWidth = Math.max(1, (obj.strokeWidth || 1) * zoom);
        ctx.strokeRect(-halfW, -halfH, screenW, screenH);
      } else if (obj.shapeType === 'cells' && obj.cells) {
        // Draw connected cell blocks
        const rows = obj.cells.length;
        const cols = obj.cells[0].length;
        const cW = screenW / cols;
        const cH = screenH / rows;

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (obj.cells[r][c] === 1) {
              const cx = -halfW + c * cW;
              const cy = -halfH + r * cH;

              ctx.fillStyle = obj.color || '#8b5cf6';
              ctx.fillRect(cx, cy, cW, cH);
              ctx.strokeStyle = obj.strokeColor || '#6d28d9';
              ctx.lineWidth = Math.max(1, (obj.strokeWidth || 1) * zoom);
              ctx.strokeRect(cx, cy, cW, cH);
            }
          }
        }
      }

      // 2. Draw Text Label
      if (obj.text && obj.text.trim().length > 0) {
        ctx.save();
        ctx.font = `600 ${Math.max(8, obj.fontSize * zoom)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Text subtle shadow for readability
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillText(obj.text, 1, 1);

        ctx.fillStyle = obj.textColor || '#ffffff';
        ctx.fillText(obj.text, 0, 0);
        ctx.restore();
      }

      ctx.restore();
    }
  },

  // Render Selections & Bounding Outlines
  renderSelections(ctx) {
    const zoom = AppState.viewport.zoom;

    // Selected Objects
    for (const objId of AppState.selectedObjectIds) {
      const obj = AppState.objects.find(o => o.id === objId);
      if (!obj) continue;

      const centerWorld = ObjectManager.getObjectCenter(obj);
      const centerScreen = GridManager.worldToScreen(centerWorld.x, centerWorld.y);
      const screenW = obj.width * zoom;
      const screenH = obj.height * zoom;

      ctx.save();
      ctx.translate(centerScreen.x, centerScreen.y);
      ctx.rotate(obj.rotation * Math.PI / 180);

      // Selection bounding box
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = Math.max(1.5, 2 * zoom);
      ctx.setLineDash([4 * zoom, 4 * zoom]);
      ctx.strokeRect(-screenW / 2 - 4, -screenH / 2 - 4, screenW + 8, screenH + 8);
      ctx.setLineDash([]);

      // Corner handles
      ctx.fillStyle = '#38bdf8';
      const corners = [
        [-screenW / 2 - 4, -screenH / 2 - 4],
        [screenW / 2 + 4, -screenH / 2 - 4],
        [screenW / 2 + 4, screenH / 2 + 4],
        [-screenW / 2 - 4, screenH / 2 + 4]
      ];
      for (const [cx, cy] of corners) {
        ctx.fillRect(cx - 3, cy - 3, 6, 6);
      }

      ctx.restore();
    }

    // Selected Walls
    for (const key of AppState.selectedWallKeys) {
      const wall = AppState.walls.get(key);
      if (!wall) continue;

      const p1 = GridManager.worldToScreen(wall.x1, wall.y1);
      const p2 = GridManager.worldToScreen(wall.x2, wall.y2);

      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = Math.max(4, (wall.thickness + 4) * zoom);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.restore();
    }

    // Selected Openings (Doors & Windows)
    for (const opId of AppState.selectedOpeningIds) {
      const op = AppState.openings.find(o => o.id === opId);
      if (!op) continue;

      const center = GridManager.worldToScreen(op.x, op.y);
      const width = op.width * zoom;

      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.rotate(op.rotation);

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = Math.max(1.5, 2 * zoom);
      ctx.setLineDash([3 * zoom, 3 * zoom]);

      if (op.type === 'door-single') {
        const swingY = op.flipSwing ? width : -width;
        const minY = Math.min(0, swingY) - 4 * zoom;
        const maxY = Math.max(0, swingY) + 4 * zoom;
        ctx.strokeRect(-width / 2 - 4 * zoom, minY, width + 8 * zoom, maxY - minY);
      } else if (op.type === 'door-double') {
        const halfW = width / 2;
        const swingY = op.flipSwing ? halfW : -halfW;
        const minY = Math.min(0, swingY) - 4 * zoom;
        const maxY = Math.max(0, swingY) + 4 * zoom;
        ctx.strokeRect(-width / 2 - 4 * zoom, minY, width + 8 * zoom, maxY - minY);
      } else {
        ctx.strokeRect(-width / 2 - 4 * zoom, -8 * zoom, width + 8 * zoom, 16 * zoom);
      }
      ctx.setLineDash([]);

      // Corner accent handles
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-width / 2 - 5 * zoom, -4 * zoom, 4 * zoom, 8 * zoom);
      ctx.fillRect(width / 2 + 1 * zoom, -4 * zoom, 4 * zoom, 8 * zoom);

      ctx.restore();
    }
  },

  // Render Active Tool Previews
  renderPreviews(ctx) {
    const zoom = AppState.viewport.zoom;

    // 1. Rubberband Selection Box
    if (AppState.selectionBox) {
      const { startX, startY, currentX, currentY } = AppState.selectionBox;
      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const w = Math.abs(currentX - startX);
      const h = Math.abs(currentY - startY);

      ctx.save();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }

    // 1b. Eyedropper Color Preview Bubble & Badge
    if (window.ColorManager && ColorManager.activeDropper && AppState.previewPosition) {
      const sampled = ColorManager.sampleColorAt(AppState.previewPosition.x, AppState.previewPosition.y);
      const cur = GridManager.worldToScreen(AppState.previewPosition.x, AppState.previewPosition.y);

      ctx.save();
      // Outer bubble showing sampled color
      ctx.fillStyle = sampled;
      ctx.beginPath();
      ctx.arc(cur.x, cur.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Tooltip badge with hex code
      ctx.font = 'bold 11px sans-serif';
      const msg = `スポイト: ${sampled}`;
      const textMetrics = ctx.measureText(msg);
      const badgeW = textMetrics.width + 16;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fillRect(cur.x + 16, cur.y - 12, badgeW, 24);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cur.x + 16, cur.y - 12, badgeW, 24);
      ctx.fillStyle = '#fde047';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(msg, cur.x + 24, cur.y);
      ctx.restore();
      return;
    }

    // 2. Active Placement Tool Ghost / Preview on Cursor
    const isOpeningTool = (AppState.currentTool === 'opening');
    const isOpeningItem = (AppState.activePaletteItem && AppState.activePaletteItem.type === 'opening');

    if ((isOpeningTool || AppState.activePaletteItem) && AppState.previewPosition) {
      const snapUnit = GridManager.getSnapUnit();
      const item = (isOpeningTool && !isOpeningItem)
        ? (AppState.paletteItems.find(i => i.type === 'opening') || {
            id: 'item-door-single',
            name: '片開きドア',
            group: 'openings',
            type: 'opening',
            openingType: 'door-single',
            width: AppState.grid.visualCellSize,
            color: '#ca8a04'
          })
        : AppState.activePaletteItem;

      ctx.save();

      if (item && item.type === 'opening') {
        // Precise Wall Opening Preview with Snap
        const tolerance = Math.max(24, 24 / zoom);
        const wallHit = WallManager.findWallNearPoint(AppState.previewPosition.x, AppState.previewPosition.y, tolerance);

        if (wallHit) {
          const width = item.width || AppState.grid.visualCellSize;
          const snapped = WallManager.calculateSnappedOpeningPosition(
            wallHit.wall,
            AppState.previewPosition.x,
            AppState.previewPosition.y,
            width
          );

          if (snapped) {
            // Target wall highlight: vivid glowing line
            ctx.save();
            ctx.strokeStyle = 'rgba(234, 179, 8, 0.8)';
            ctx.lineWidth = Math.max(4, 6 * zoom);
            const wp1 = GridManager.worldToScreen(wallHit.wall.x1, wallHit.wall.y1);
            const wp2 = GridManager.worldToScreen(wallHit.wall.x2, wallHit.wall.y2);
            ctx.beginPath();
            ctx.moveTo(wp1.x, wp1.y);
            ctx.lineTo(wp2.x, wp2.y);
            ctx.stroke();
            ctx.restore();

            // Wall cutout gap preview (white break indicating wall removal)
            ctx.save();
            const openHalfW = width / 2;
            const gapStartWorld = {
              x: snapped.midX - openHalfW * Math.cos(snapped.angle),
              y: snapped.midY - openHalfW * Math.sin(snapped.angle)
            };
            const gapEndWorld = {
              x: snapped.midX + openHalfW * Math.cos(snapped.angle),
              y: snapped.midY + openHalfW * Math.sin(snapped.angle)
            };
            const gp1 = GridManager.worldToScreen(gapStartWorld.x, gapStartWorld.y);
            const gp2 = GridManager.worldToScreen(gapEndWorld.x, gapEndWorld.y);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = Math.max(5, 7 * zoom);
            ctx.beginPath();
            ctx.moveTo(gp1.x, gp1.y);
            ctx.lineTo(gp2.x, gp2.y);
            ctx.stroke();
            ctx.restore();

            // Render Ghost Opening Symbol on wall
            ctx.save();
            ctx.globalAlpha = 0.95;
            const opStyle = AppState.openingStyle || {};
            const flipSwing = (typeof item.flipSwing !== 'undefined') ? !!item.flipSwing : !!opStyle.flipSwing;
            const flipHinge = (typeof item.flipHinge !== 'undefined') ? !!item.flipHinge : !!opStyle.flipHinge;
            const ghostOpening = {
              x: snapped.midX,
              y: snapped.midY,
              rotation: snapped.angle,
              type: item.openingType || opStyle.type || 'door-single',
              width: width,
              color: item.color || opStyle.color || '#ca8a04',
              flipSwing,
              flipHinge
            };
            this.renderOpeningSymbol(ctx, ghostOpening);
            ctx.restore();

            // Snap indicator badge
            const badgeScreen = GridManager.worldToScreen(snapped.midX, snapped.midY);
            ctx.save();
            ctx.font = '11px sans-serif';
            const swingText = flipSwing ? '内' : '外';
            const hingeText = flipHinge ? '右' : '左';
            const labelText = `${item.name || '開口部'} (${width}px [${swingText}/${hingeText}])`;
            const textMetrics = ctx.measureText(labelText);
            const badgeW = textMetrics.width + 16;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            ctx.fillRect(badgeScreen.x - badgeW / 2, badgeScreen.y - 28, badgeW, 20);
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1;
            ctx.strokeRect(badgeScreen.x - badgeW / 2, badgeScreen.y - 28, badgeW, 20);
            ctx.fillStyle = '#38bdf8';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(labelText, badgeScreen.x, badgeScreen.y - 18);
            ctx.restore();
          }
        } else {
          // Floating indicator when not near wall
          const cur = GridManager.worldToScreen(AppState.previewPosition.x, AppState.previewPosition.y);
          ctx.save();
          ctx.font = '11px sans-serif';
          const msg = `壁に合わせてクリックで配置 [${item.name || '開口部'}]`;
          const textMetrics = ctx.measureText(msg);
          const badgeW = textMetrics.width + 16;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.fillRect(cur.x + 14, cur.y - 12, badgeW, 24);
          ctx.strokeStyle = '#ca8a04';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(cur.x + 14, cur.y - 12, badgeW, 24);
          ctx.fillStyle = '#fde047';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(msg, cur.x + 22, cur.y);

          // Center crosshair
          ctx.strokeStyle = '#ca8a04';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(cur.x, cur.y, 6, 0, Math.PI * 2);
          ctx.moveTo(cur.x - 9, cur.y); ctx.lineTo(cur.x + 9, cur.y);
          ctx.moveTo(cur.x, cur.y - 9); ctx.lineTo(cur.x, cur.y + 9);
          ctx.stroke();
          ctx.restore();
        }
      } else if (item) {
        // Object Preview Box with Rotation (matching placed object transforms 1:1)
        const snapped = GridManager.snapToPlacementGrid(AppState.previewPosition.x, AppState.previewPosition.y);
        const rot = AppState.activePaletteRotation || 0;
        const baseW = item.width || snapUnit * 2;
        const baseH = item.height || snapUnit * 2;

        const rad = rot * Math.PI / 180;
        const cos = Math.abs(Math.cos(rad));
        const sin = Math.abs(Math.sin(rad));
        const aabbW = baseW * cos + baseH * sin;
        const aabbH = baseW * sin + baseH * cos;

        const centerX = snapped.x + aabbW / 2;
        const centerY = snapped.y + aabbH / 2;
        const centerScreen = GridManager.worldToScreen(centerX, centerY);

        const screenW = baseW * zoom;
        const screenH = baseH * zoom;
        const halfW = screenW / 2;
        const halfH = screenH / 2;

        ctx.save();
        ctx.translate(centerScreen.x, centerScreen.y);
        ctx.rotate(rad);
        ctx.globalAlpha = 0.75;

        // Draw shape body
        if (item.shapeType === 'rect') {
          if (item.fillType === 'image' && item.imageElement && item.imageElement.complete) {
            ctx.drawImage(item.imageElement, -halfW, -halfH, screenW, screenH);
          } else {
            ctx.fillStyle = item.color || '#3b82f6';
            ctx.fillRect(-halfW, -halfH, screenW, screenH);
          }
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = Math.max(1.5, 2 * zoom);
          ctx.strokeRect(-halfW, -halfH, screenW, screenH);
        } else if (item.shapeType === 'cells' && item.cells) {
          const rows = item.cells.length;
          const cols = item.cells[0].length;
          const cW = screenW / cols;
          const cH = screenH / rows;

          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              if (item.cells[r][c] === 1) {
                const cx = -halfW + c * cW;
                const cy = -halfH + r * cH;
                ctx.fillStyle = item.color || '#8b5cf6';
                ctx.fillRect(cx, cy, cW, cH);
                ctx.strokeStyle = '#38bdf8';
                ctx.lineWidth = Math.max(1, (item.strokeWidth || 1) * zoom);
                ctx.strokeRect(cx, cy, cW, cH);
              }
            }
          }
        }

        // Draw text label - rotating with the object!
        if (item.text && item.text.trim().length > 0) {
          ctx.save();
          ctx.font = `600 ${Math.max(8, (item.fontSize || 12) * zoom)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.fillText(item.text, 1, 1);
          ctx.fillStyle = item.textColor || '#ffffff';
          ctx.fillText(item.text, 0, 0);
          ctx.restore();
        }

        ctx.restore(); // Restore context transform

        // Rotation & Placement badge (drawn in screen space above the AABB)
        const screenPos = GridManager.worldToScreen(snapped.x, snapped.y);
        ctx.save();
        ctx.font = '11px sans-serif';
        const badgeMsg = `${item.name} [R: ${rot}°]`;
        const tm = ctx.measureText(badgeMsg);
        const bw = tm.width + 12;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(screenPos.x, screenPos.y - 22, bw, 20);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1;
        ctx.strokeRect(screenPos.x, screenPos.y - 22, bw, 20);
        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeMsg, screenPos.x + 6, screenPos.y - 12);
        ctx.restore();
      }

      ctx.restore();
    }

    // 2b. Floor Rectangle Drag Preview
    if (window.CanvasManager && CanvasManager.dragMode === 'floor-rect' && CanvasManager.floorRectStart && CanvasManager.floorRectCurrent) {
      const minCol = Math.min(CanvasManager.floorRectStart.col, CanvasManager.floorRectCurrent.col);
      const maxCol = Math.max(CanvasManager.floorRectStart.col, CanvasManager.floorRectCurrent.col);
      const minRow = Math.min(CanvasManager.floorRectStart.row, CanvasManager.floorRectCurrent.row);
      const maxRow = Math.max(CanvasManager.floorRectStart.row, CanvasManager.floorRectCurrent.row);

      const visualSize = AppState.grid.visualCellSize;
      const x1 = minCol * visualSize;
      const y1 = minRow * visualSize;
      const x2 = (maxCol + 1) * visualSize;
      const y2 = (maxRow + 1) * visualSize;

      const sp1 = GridManager.worldToScreen(x1, y1);
      const sp2 = GridManager.worldToScreen(x2, y2);
      const rw = sp2.x - sp1.x;
      const rh = sp2.y - sp1.y;

      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = AppState.paintStyle.floorColor || '#e2e8f0';
      ctx.fillRect(sp1.x, sp1.y, rw, rh);

      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = AppState.paintStyle.wallColor || '#1e293b';
      ctx.lineWidth = Math.max(3, 4 * zoom);
      ctx.strokeRect(sp1.x, sp1.y, rw, rh);

      // Dimension badge
      ctx.font = '11px sans-serif';
      const label = `${maxCol - minCol + 1} × ${maxRow - minRow + 1} マス`;
      const tm = ctx.measureText(label);
      const bw = tm.width + 14;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fillRect(sp1.x + rw / 2 - bw / 2, sp1.y + rh / 2 - 12, bw, 24);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1;
      ctx.strokeRect(sp1.x + rw / 2 - bw / 2, sp1.y + rh / 2 - 12, bw, 24);
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, sp1.x + rw / 2, sp1.y + rh / 2);
      ctx.restore();
    }

    // 3. Wall Drawing In-Progress Preview Line
    if (AppState.wallDrawingStart && AppState.previewPosition) {
      const startScreen = GridManager.worldToScreen(AppState.wallDrawingStart.x, AppState.wallDrawingStart.y);
      const endSnap = GridManager.snapToPlacementGrid(AppState.previewPosition.x, AppState.previewPosition.y);
      const endScreen = GridManager.worldToScreen(endSnap.x, endSnap.y);

      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3 * zoom;
      ctx.setLineDash([4 * zoom, 4 * zoom]);
      ctx.beginPath();
      ctx.moveTo(startScreen.x, startScreen.y);
      ctx.lineTo(endScreen.x, endScreen.y);
      ctx.stroke();
      ctx.restore();
    }
  }
};

if (typeof window !== 'undefined') window.CanvasRenderer = CanvasRenderer;
if (typeof global !== 'undefined') global.CanvasRenderer = CanvasRenderer;
