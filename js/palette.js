/**
 * palette.js - Asset Palette, Group Tabs, Modal Creation & Library Import/Export
 */

const PaletteManager = {
  activeGroupId: 'basic',

  shapeMatrixSize: 8,
  // Variable size matrix for cells shape creation in modal (default 8x8, supports 4..16)
  shapeMatrix: [
    [1, 1, 0, 0, 0, 0, 0, 0],
    [1, 1, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0]
  ],

  init() {
    this.renderTabs();
    this.renderItems();
    this.initModalEvents();
    this.initPropertyEvents();
  },

  // Render Category Tabs
  renderTabs() {
    const container = document.getElementById('palette-tabs-container');
    if (!container) return;

    container.innerHTML = '';
    AppState.paletteGroups.forEach(group => {
      const btn = document.createElement('button');
      btn.className = `palette-tab ${group.id === this.activeGroupId ? 'active' : ''}`;
      btn.textContent = group.name;
      btn.onclick = () => {
        this.activeGroupId = group.id;
        this.renderTabs();
        this.renderItems();
      };
      container.appendChild(btn);
    });

    // Populate group select dropdown in modal
    const groupSelect = document.getElementById('obj-create-group');
    if (groupSelect) {
      groupSelect.innerHTML = '';
      AppState.paletteGroups.forEach(group => {
        const opt = document.createElement('option');
        opt.value = group.id;
        opt.textContent = group.name;
        if (group.id === this.activeGroupId) opt.selected = true;
        groupSelect.appendChild(opt);
      });
    }
  },

  // Render Palette Items in Active Group
  renderItems() {
    const container = document.getElementById('palette-items-container');
    if (!container) return;

    container.innerHTML = '';
    const items = AppState.paletteItems.filter(i => i.group === this.activeGroupId);

    if (items.length === 0) {
      container.innerHTML = '<div style="grid-column: 1/-1; color: var(--text-muted); font-size: 0.75rem; text-align: center; padding: 16px;">アイテムがありません</div>';
      return;
    }

    items.forEach(item => {
      const el = document.createElement('div');
      el.className = `palette-item ${AppState.activePaletteItem && AppState.activePaletteItem.id === item.id ? 'active' : ''}`;
      el.draggable = true;
      el.title = `${item.name} (ドラッグまたはクリックで配置 / 右クリックで操作メニュー)`;

      // Item Action Buttons (Edit, Copy, Delete)
      const actions = document.createElement('div');
      actions.className = 'palette-item-actions';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'palette-action-btn';
      editBtn.textContent = '✏️';
      editBtn.title = 'パーツを編集';
      editBtn.onclick = (e) => {
        e.stopPropagation();
        this.openEditModal(item);
      };

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'palette-action-btn';
      copyBtn.textContent = '📋';
      copyBtn.title = 'パーツを複製 (コピー)';
      copyBtn.onclick = (e) => {
        e.stopPropagation();
        this.duplicateItem(item);
      };

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'palette-action-btn danger';
      deleteBtn.textContent = '🗑️';
      deleteBtn.title = 'パーツを削除';
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        this.deleteItem(item);
      };

      actions.appendChild(editBtn);
      actions.appendChild(copyBtn);
      actions.appendChild(deleteBtn);
      el.appendChild(actions);

      // Item Thumbnail Preview
      const preview = document.createElement('div');
      preview.className = 'palette-item-preview';
      this.generateItemThumbnail(preview, item);

      const name = document.createElement('div');
      name.className = 'palette-item-name';
      name.textContent = item.name;

      el.appendChild(preview);
      el.appendChild(name);

      // Click to activate placement tool
      el.onclick = () => {
        if (AppState.activePaletteItem && AppState.activePaletteItem.id === item.id) {
          AppState.activePaletteItem = null;
          AppState.activePaletteRotation = 0;
          if (window.HotbarManager) {
            HotbarManager.activeSlotIndex = -1;
            HotbarManager.render();
          }
        } else {
          AppState.activePaletteItem = item;
          AppState.activePaletteRotation = 0;
          if (item.type === 'opening') {
            if (window.App) App.setTool('opening', false);
          } else {
            if (window.App) App.setTool('select', false);
          }
        }
        this.renderItems();
        if (window.CanvasManager) CanvasManager.requestRender();
      };

      // HTML5 Drag & Drop start
      el.ondragstart = (e) => {
        e.dataTransfer.setData('text/plain', JSON.stringify(item));
        AppState.activePaletteItem = item;
        AppState.activePaletteRotation = 0;
      };

      // Right Click Context Menu to Edit, Duplicate, Assign, or Delete
      el.oncontextmenu = (e) => {
        e.preventDefault();
        const action = prompt(`「${item.name}」の操作:\n1: ホットバースロットに登録 (1〜10)\n2: パーツを複製\n3: パーツを編集\n4: パーツを削除`, '1');
        if (action === '1') {
          this.showAssignSlotPrompt(item);
        } else if (action === '2') {
          this.duplicateItem(item);
        } else if (action === '3') {
          this.openEditModal(item);
        } else if (action === '4') {
          this.deleteItem(item);
        } else if (action && !isNaN(parseInt(action, 10)) && parseInt(action, 10) >= 1 && parseInt(action, 10) <= 10) {
          let slot = parseInt(action, 10);
          AppState.hotbar[slot - 1] = item;
          if (window.HotbarManager) HotbarManager.render();
          if (window.App) App.showToast(`スロット ${slot} に「${item.name}」を割り当てました`, 'success');
        }
      };

      container.appendChild(el);
    });
  },

  // Generate Thumbnail inside preview container
  generateItemThumbnail(container, item) {
    if (!container) return;
    container.innerHTML = '';
    container.style.backgroundColor = 'transparent';
    container.style.backgroundImage = 'none';
    container.style.border = 'none';

    // If item has image fill and image data, use background preview
    if (item.fillType === 'image' && item.imageData) {
      container.style.backgroundImage = `url(${item.imageData})`;
      container.style.backgroundSize = 'contain';
      container.style.backgroundRepeat = 'no-repeat';
      container.style.backgroundPosition = 'center';
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 44;
    canvas.height = 44;
    canvas.style.width = '44px';
    canvas.style.height = '44px';
    canvas.style.borderRadius = '3px';
    canvas.style.display = 'block';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Subtle dark background for contrast
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 44, 44);

    if (item.type === 'opening') {
      // Opening symbol preview (door swing arc, window pane, arch)
      const opType = item.openingType || 'door-single';
      const color = item.color || '#ca8a04';

      // Draw horizontal wall reference lines
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(4, 28);
      ctx.lineTo(10, 28);
      ctx.moveTo(34, 28);
      ctx.lineTo(40, 28);
      ctx.stroke();

      if (opType === 'door-single') {
        // Single door leaf + swing arc
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        // Leaf
        ctx.beginPath();
        ctx.moveTo(10, 28);
        ctx.lineTo(10, 10);
        ctx.stroke();
        // Swing Arc
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.arc(10, 28, 18, 0, -Math.PI / 2, true);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (opType === 'door-double') {
        // Double door leaves + swing arcs
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        // Left Leaf
        ctx.beginPath();
        ctx.moveTo(10, 28);
        ctx.lineTo(10, 18);
        ctx.stroke();
        // Right Leaf
        ctx.beginPath();
        ctx.moveTo(34, 28);
        ctx.lineTo(34, 18);
        ctx.stroke();
        // Arcs
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.arc(10, 28, 10, 0, -Math.PI / 2, true);
        ctx.moveTo(34, 28);
        ctx.arc(34, 28, 10, Math.PI, -Math.PI / 2, false);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (opType === 'window') {
        // Glass box + frame
        ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
        ctx.fillRect(8, 22, 28, 12);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(8, 22, 28, 12);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(8, 28);
        ctx.lineTo(36, 28);
        ctx.stroke();
      } else {
        // Arch / passage
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(22, 28, 12, Math.PI, 0, false);
        ctx.stroke();
      }
    } else if (item.shapeType === 'cells' && item.cells && item.cells.length > 0) {
      // Custom matrix cell shape
      const rows = item.cells.length;
      const cols = item.cells[0].length;
      const maxDim = Math.max(rows, cols);
      const cellSize = Math.floor(34 / maxDim);
      const totalW = cols * cellSize;
      const totalH = rows * cellSize;
      const offsetX = Math.round((44 - totalW) / 2);
      const offsetY = Math.round((44 - totalH) / 2);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (item.cells[r][c] === 1) {
            ctx.fillStyle = item.color || '#3b82f6';
            ctx.fillRect(offsetX + c * cellSize, offsetY + r * cellSize, cellSize, cellSize);
            ctx.strokeStyle = item.strokeColor || '#1d4ed8';
            ctx.lineWidth = 1;
            ctx.strokeRect(offsetX + c * cellSize, offsetY + r * cellSize, cellSize, cellSize);
          }
        }
      }
      if (item.text) {
        ctx.fillStyle = item.textColor || '#ffffff';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.text.substring(0, 3), 22, 22);
      }
    } else {
      // Rectangular object: preserve exact aspect ratio
      const w = item.width || 40;
      const h = item.height || 40;
      const maxDim = Math.max(w, h, 1);
      const scale = 34 / maxDim;
      let drawW = Math.max(8, Math.round(w * scale));
      let drawH = Math.max(8, Math.round(h * scale));
      if (drawW > 38) drawW = 38;
      if (drawH > 38) drawH = 38;

      const drawX = Math.round((44 - drawW) / 2);
      const drawY = Math.round((44 - drawH) / 2);

      ctx.fillStyle = item.color || '#3b82f6';
      ctx.fillRect(drawX, drawY, drawW, drawH);
      ctx.strokeStyle = item.strokeColor || '#1d4ed8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(drawX, drawY, drawW, drawH);

      if (item.text) {
        ctx.fillStyle = item.textColor || '#ffffff';
        const fontSize = Math.min(10, Math.max(8, Math.floor(Math.min(drawW, drawH) * 0.5)));
        ctx.font = `600 ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.text.substring(0, 3), 22, 22);
      }
    }

    container.appendChild(canvas);
  },

  // Assign item to hotbar slot (1-10)
  showAssignSlotPrompt(item) {
    const slotStr = prompt(`「${item.name}」を割り当てるホットバースロット番号（1〜10、または 0）を入力してください:`, '1');
    if (!slotStr) return;
    let slot = parseInt(slotStr, 10);
    if (slot === 0) slot = 10;
    if (slot >= 1 && slot <= 10) {
      AppState.hotbar[slot - 1] = item;
      if (window.HotbarManager) HotbarManager.render();
      if (window.App) App.showToast(`スロット ${slot} に「${item.name}」を割り当てました`, 'success');
    }
  },

  editingItemId: null,

  openNewObjectModal() {
    this.editingItemId = null;
    const modal = document.getElementById('modal-new-object');
    if (!modal) return;
    const headerTitle = modal.querySelector('.modal-header span');
    if (headerTitle) headerTitle.textContent = '新規オブジェクト作成';
    const btnSave = document.getElementById('btn-save-new-object');
    if (btnSave) btnSave.textContent = 'パレットに追加';

    document.getElementById('obj-create-name').value = '新規パーツ';
    const groupSelect = document.getElementById('obj-create-group');
    if (groupSelect) groupSelect.value = this.activeGroupId;
    const rRect = document.querySelector('input[name="shape-type"][value="rect"]');
    if (rRect) rRect.checked = true;
    document.getElementById('shape-rect-controls').style.display = 'block';
    document.getElementById('shape-cells-controls').style.display = 'none';
    document.getElementById('obj-create-w').value = '2';
    document.getElementById('obj-create-h').value = '2';
    const rColor = document.querySelector('input[name="fill-type"][value="color"]');
    if (rColor) rColor.checked = true;
    document.getElementById('fill-color-controls').style.display = 'block';
    document.getElementById('fill-image-controls').style.display = 'none';
    document.getElementById('obj-create-color').value = '#3b82f6';
    document.getElementById('obj-create-stroke').value = '#1d4ed8';
    document.getElementById('obj-create-text').value = '';
    document.getElementById('obj-create-textcolor').value = '#ffffff';
    document.getElementById('obj-create-fontsize').value = '13';
    this.tempImageData = null;
    this.shapeMatrixSize = 8;
    const sizeSelect = document.getElementById('shape-matrix-size');
    if (sizeSelect) sizeSelect.value = '8';
    this.shapeMatrix = Array(8).fill(0).map(() => Array(8).fill(0));
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        this.shapeMatrix[r][c] = 1;
      }
    }
    this.renderShapeMatrixGrid();
    if (window.ColorManager) ColorManager.initModalPresets();
    modal.classList.add('active');
  },

  openEditModal(item) {
    this.editingItemId = item.id;
    const modal = document.getElementById('modal-new-object');
    if (!modal) return;
    const headerTitle = modal.querySelector('.modal-header span');
    if (headerTitle) headerTitle.textContent = `パーツの編集 (${item.name})`;
    const btnSave = document.getElementById('btn-save-new-object');
    if (btnSave) btnSave.textContent = '変更を保存';

    document.getElementById('obj-create-name').value = item.name || '';
    const groupSelect = document.getElementById('obj-create-group');
    if (groupSelect) groupSelect.value = item.group || this.activeGroupId;

    const snapUnit = GridManager.getSnapUnit();
    const isCells = item.shapeType === 'cells';
    const radioRect = document.querySelector('input[name="shape-type"][value="rect"]');
    const radioCells = document.querySelector('input[name="shape-type"][value="cells"]');
    if (isCells) {
      if (radioCells) radioCells.checked = true;
      document.getElementById('shape-rect-controls').style.display = 'none';
      document.getElementById('shape-cells-controls').style.display = 'block';
      if (item.cells && item.cells.length > 0) {
        const rows = item.cells.length;
        const cols = item.cells[0].length;
        const maxDim = Math.max(rows, cols);
        this.shapeMatrixSize = maxDim;
        this.shapeMatrix = [];
        for (let r = 0; r < maxDim; r++) {
          const row = [];
          for (let c = 0; c < maxDim; c++) {
            row.push((r < rows && c < cols) ? (item.cells[r][c] || 0) : 0);
          }
          this.shapeMatrix.push(row);
        }
        const sizeSelect = document.getElementById('shape-matrix-size');
        if (sizeSelect) {
          let found = false;
          for (let i = 0; i < sizeSelect.options.length; i++) {
            if (parseInt(sizeSelect.options[i].value, 10) === maxDim) {
              sizeSelect.selectedIndex = i;
              found = true;
              break;
            }
          }
          if (!found) {
            const opt = document.createElement('option');
            opt.value = String(maxDim);
            opt.textContent = `${maxDim} × ${maxDim}`;
            opt.selected = true;
            sizeSelect.appendChild(opt);
          }
        }
      } else {
        this.shapeMatrixSize = 8;
        this.shapeMatrix = Array(8).fill(0).map(() => Array(8).fill(0));
      }
      this.renderShapeMatrixGrid();
    } else {
      if (radioRect) radioRect.checked = true;
      document.getElementById('shape-rect-controls').style.display = 'block';
      document.getElementById('shape-cells-controls').style.display = 'none';
      document.getElementById('obj-create-w').value = Math.max(1, Math.round((item.width || 40) / snapUnit));
      document.getElementById('obj-create-h').value = Math.max(1, Math.round((item.height || 40) / snapUnit));
    }

    const isImage = item.fillType === 'image';
    const radioColor = document.querySelector('input[name="fill-type"][value="color"]');
    const radioImage = document.querySelector('input[name="fill-type"][value="image"]');
    if (isImage) {
      if (radioImage) radioImage.checked = true;
      document.getElementById('fill-color-controls').style.display = 'none';
      document.getElementById('fill-image-controls').style.display = 'block';
      this.tempImageData = item.imageData || null;
      const preview = document.getElementById('image-preview');
      if (this.tempImageData && preview) {
        preview.style.backgroundImage = `url(${this.tempImageData})`;
        preview.style.display = 'block';
      }
    } else {
      if (radioColor) radioColor.checked = true;
      document.getElementById('fill-color-controls').style.display = 'block';
      document.getElementById('fill-image-controls').style.display = 'none';
      document.getElementById('obj-create-color').value = item.color || '#3b82f6';
      document.getElementById('obj-create-stroke').value = item.strokeColor || '#1d4ed8';
    }

    document.getElementById('obj-create-text').value = item.text || '';
    document.getElementById('obj-create-textcolor').value = item.textColor || '#ffffff';
    document.getElementById('obj-create-fontsize').value = item.fontSize || 12;
    if (window.ColorManager) ColorManager.initModalPresets();
    modal.classList.add('active');
  },

  duplicateItem(item) {
    const clone = JSON.parse(JSON.stringify(item));
    clone.id = 'item-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
    clone.name = item.name + ' (コピー)';
    const idx = AppState.paletteItems.findIndex(i => i.id === item.id);
    if (idx !== -1) {
      AppState.paletteItems.splice(idx + 1, 0, clone);
    } else {
      AppState.paletteItems.push(clone);
    }
    AppState.saveCustomPaletteItems();
    this.renderItems();
    if (window.App) App.showToast(`「${clone.name}」を複製しました`, 'success');
  },

  deleteItem(item) {
    if (window.confirm(`パーツ「${item.name}」をパレットから削除しますか？`)) {
      AppState.paletteItems = AppState.paletteItems.filter(i => i.id !== item.id);
      if (AppState.activePaletteItem && AppState.activePaletteItem.id === item.id) {
        AppState.activePaletteItem = null;
        AppState.activePaletteRotation = 0;
      }
      AppState.saveCustomPaletteItems();
      this.renderItems();
      if (window.CanvasManager) CanvasManager.requestRender();
      if (window.App) App.showToast(`パーツ「${item.name}」を削除しました`, 'success');
    }
  },

  // Modal Creation Events
  initModalEvents() {
    // Open New Object Modal
    const btnNew = document.getElementById('btn-new-object');
    if (btnNew) {
      btnNew.onclick = () => {
        this.openNewObjectModal();
      };
    }

    // Modal Close buttons
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.onclick = () => {
        const modalId = btn.getAttribute('data-close');
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('active');
      };
    });

    // Shape type toggle (rect vs cells)
    document.querySelectorAll('input[name="shape-type"]').forEach(radio => {
      radio.onchange = (e) => {
        const isCells = e.target.value === 'cells';
        document.getElementById('shape-rect-controls').style.display = isCells ? 'none' : 'block';
        document.getElementById('shape-cells-controls').style.display = isCells ? 'block' : 'none';
      };
    });

    // Fill type toggle (color vs image)
    document.querySelectorAll('input[name="fill-type"]').forEach(radio => {
      radio.onchange = (e) => {
        const isImage = e.target.value === 'image';
        document.getElementById('fill-color-controls').style.display = isImage ? 'none' : 'block';
        document.getElementById('fill-image-controls').style.display = isImage ? 'block' : 'none';
      };
    });

    // Image file upload handler
    const fileInput = document.getElementById('obj-create-image');
    if (fileInput) {
      fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            const preview = document.getElementById('image-preview');
            preview.style.backgroundImage = `url(${evt.target.result})`;
            preview.style.display = 'block';
            this.tempImageData = evt.target.result;
          };
          reader.readAsDataURL(file);
        }
      };
    }

    // Shape Matrix Controls: Size change, Clear, Fill
    const matrixSizeSelect = document.getElementById('shape-matrix-size');
    if (matrixSizeSelect) {
      matrixSizeSelect.onchange = (e) => {
        this.setShapeMatrixSize(parseInt(e.target.value, 10));
      };
    }

    const btnClearMatrix = document.getElementById('btn-clear-shape-matrix');
    if (btnClearMatrix) {
      btnClearMatrix.onclick = () => {
        this.clearShapeMatrix();
      };
    }

    const btnFillMatrix = document.getElementById('btn-fill-shape-matrix');
    if (btnFillMatrix) {
      btnFillMatrix.onclick = () => {
        this.fillShapeMatrix();
      };
    }

    // Save New Object Button
    const btnSave = document.getElementById('btn-save-new-object');
    if (btnSave) {
      btnSave.onclick = () => this.saveNewObjectFromModal();
    }

    // Library Export / Import buttons
    const btnExportLib = document.getElementById('btn-export-library');
    if (btnExportLib) {
      btnExportLib.onclick = () => this.exportCurrentLibrary();
    }

    const btnImportLib = document.getElementById('btn-import-library');
    const fileInputLib = document.getElementById('file-input-library');
    if (btnImportLib && fileInputLib) {
      btnImportLib.onclick = () => fileInputLib.click();
      fileInputLib.onchange = (e) => this.importLibraryFromFile(e);
    }
  },

  // Change matrix size while preserving existing drawn cells
  setShapeMatrixSize(newSize) {
    newSize = Math.max(2, Math.min(32, parseInt(newSize, 10) || 8));
    const oldMatrix = this.shapeMatrix || [];
    const oldRows = oldMatrix.length;
    const oldCols = oldRows > 0 ? oldMatrix[0].length : 0;

    const newMatrix = [];
    for (let r = 0; r < newSize; r++) {
      const row = [];
      for (let c = 0; c < newSize; c++) {
        if (r < oldRows && c < oldCols) {
          row.push(oldMatrix[r][c] || 0);
        } else {
          row.push(0);
        }
      }
      newMatrix.push(row);
    }
    this.shapeMatrixSize = newSize;
    this.shapeMatrix = newMatrix;
    const sizeSelect = document.getElementById('shape-matrix-size');
    if (sizeSelect && sizeSelect.value !== String(newSize)) {
      sizeSelect.value = String(newSize);
    }
    this.renderShapeMatrixGrid();
  },

  // Clear all cells in shape matrix
  clearShapeMatrix() {
    const size = this.shapeMatrixSize || 8;
    this.shapeMatrix = Array(size).fill(0).map(() => Array(size).fill(0));
    this.renderShapeMatrixGrid();
  },

  // Fill all cells in shape matrix
  fillShapeMatrix() {
    const size = this.shapeMatrixSize || 8;
    this.shapeMatrix = Array(size).fill(0).map(() => Array(size).fill(1));
    this.renderShapeMatrixGrid();
  },

  // Render dynamic shape matrix grid with click & drag-to-paint support
  renderShapeMatrixGrid() {
    const grid = document.getElementById('shape-matrix-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const size = this.shapeMatrixSize || 8;
    let cellSize = 22;
    let gap = 2;
    if (size <= 4) {
      cellSize = 36;
      gap = 4;
    } else if (size <= 6) {
      cellSize = 30;
      gap = 3;
    } else if (size <= 8) {
      cellSize = 24;
      gap = 3;
    } else if (size <= 10) {
      cellSize = 20;
      gap = 2;
    } else if (size <= 12) {
      cellSize = 17;
      gap = 2;
    } else {
      cellSize = 14;
      gap = 2;
    }

    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = `repeat(${size}, ${cellSize}px)`;
    grid.style.gap = `${gap}px`;
    grid.style.userSelect = 'none';

    let isDrawing = false;
    let drawValue = 1;

    const onMouseUp = () => {
      isDrawing = false;
    };
    window.removeEventListener('mouseup', this._shapeMatrixMouseUp);
    this._shapeMatrixMouseUp = onMouseUp;
    window.addEventListener('mouseup', this._shapeMatrixMouseUp);

    for (let r = 0; r < size; r++) {
      if (!this.shapeMatrix[r]) this.shapeMatrix[r] = Array(size).fill(0);
      for (let c = 0; c < size; c++) {
        const cell = document.createElement('div');
        cell.className = `shape-cell ${this.shapeMatrix[r][c] === 1 ? 'filled' : ''}`;
        cell.style.width = `${cellSize}px`;
        cell.style.height = `${cellSize}px`;
        cell.title = `(${c + 1}, ${r + 1})`;

        cell.onmousedown = (e) => {
          e.preventDefault();
          isDrawing = true;
          drawValue = (this.shapeMatrix[r][c] === 1) ? 0 : 1;
          this.shapeMatrix[r][c] = drawValue;
          if (drawValue === 1) {
            cell.classList.add('filled');
          } else {
            cell.classList.remove('filled');
          }
        };

        cell.onmouseenter = () => {
          if (isDrawing) {
            this.shapeMatrix[r][c] = drawValue;
            if (drawValue === 1) {
              cell.classList.add('filled');
            } else {
              cell.classList.remove('filled');
            }
          }
        };

        grid.appendChild(cell);
      }
    }
  },

  // Save new object or update existing from modal to palette
  saveNewObjectFromModal() {
    const name = document.getElementById('obj-create-name').value.trim() || 'カスタムパーツ';
    const group = document.getElementById('obj-create-group').value;
    const shapeType = document.querySelector('input[name="shape-type"]:checked').value;
    const fillType = document.querySelector('input[name="fill-type"]:checked').value;
    const color = document.getElementById('obj-create-color').value;
    const strokeColor = document.getElementById('obj-create-stroke').value;
    const text = document.getElementById('obj-create-text').value.trim();
    const textColor = document.getElementById('obj-create-textcolor').value;
    const fontSize = parseInt(document.getElementById('obj-create-fontsize').value, 10) || 12;

    const snapUnit = GridManager.getSnapUnit();
    let width = 40;
    let height = 40;
    let cells = null;

    if (shapeType === 'rect') {
      const gw = parseInt(document.getElementById('obj-create-w').value, 10) || 2;
      const gh = parseInt(document.getElementById('obj-create-h').value, 10) || 2;
      width = gw * snapUnit;
      height = gh * snapUnit;
    } else {
      cells = JSON.parse(JSON.stringify(this.shapeMatrix));
      const cols = (cells && cells[0]) ? cells[0].length : (this.shapeMatrixSize || 8);
      const rows = cells ? cells.length : (this.shapeMatrixSize || 8);
      width = cols * snapUnit;
      height = rows * snapUnit;
    }

    if (this.editingItemId) {
      const item = AppState.paletteItems.find(i => i.id === this.editingItemId);
      if (item) {
        Object.assign(item, {
          name, group, width, height, shapeType, cells, fillType, color, strokeColor,
          imageData: fillType === 'image' ? this.tempImageData : null,
          text, textColor, fontSize
        });
        AppState.saveCustomPaletteItems();
        AppState.pushHistory('パレットアイテム編集: ' + name);
        if (window.App) App.showToast(`パーツ「${name}」を更新しました`, 'success');
      }
      this.editingItemId = null;
    } else {
      const newItem = {
        id: 'custom-' + Date.now(),
        name,
        group,
        type: 'object',
        width,
        height,
        shapeType,
        cells,
        fillType,
        color,
        strokeColor,
        imageData: fillType === 'image' ? this.tempImageData : null,
        text,
        textColor,
        fontSize
      };
      AppState.paletteItems.push(newItem);
      AppState.saveCustomPaletteItems();
      AppState.pushHistory('パレットアイテム追加: ' + name);
      if (window.App) App.showToast(`「${name}」をパレットに追加しました`, 'success');
    }

    // Close modal and refresh
    document.getElementById('modal-new-object').classList.remove('active');
    this.renderItems();
  },

  // Export Current Palette Group as Library JSON
  exportCurrentLibrary() {
    const currentGroup = AppState.paletteGroups.find(g => g.id === this.activeGroupId);
    const items = AppState.paletteItems.filter(i => i.group === this.activeGroupId);

    const libData = {
      version: (typeof AppState !== 'undefined' && AppState.version) ? AppState.version : '1.1.0',
      type: 'gridmap-library',
      group: currentGroup,
      items
    };

    const blob = new Blob([JSON.stringify(libData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `library_${currentGroup ? currentGroup.name : 'assets'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    if (window.App) App.showToast('ライブラリを保存しました', 'success');
  },

  // Import Library from File
  importLibraryFromFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        if (data.type === 'gridmap-library' && Array.isArray(data.items)) {
          // If group exists, ensure group is added
          if (data.group && !AppState.paletteGroups.some(g => g.id === data.group.id)) {
            AppState.paletteGroups.push(data.group);
          }

          // Add items
          data.items.forEach(item => {
            // Assign unique ID to avoid collision
            item.id = 'imported-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4);
            AppState.paletteItems.push(item);
          });

          this.renderTabs();
          this.renderItems();
          AppState.pushHistory('ライブラリ読込');
          if (window.App) App.showToast(`${data.items.length} 件のパーツを読み込みました`, 'success');
        } else {
          alert('有効なライブラリファイルではありません。');
        }
      } catch (err) {
        alert('ファイルの読み込みに失敗しました: ' + err.message);
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  },

  // Update Right Properties Panel based on Selection & Active Tool
  updatePropertyPanel() {
    const titleEl = document.getElementById('properties-panel-title');
    const btnDelete = document.getElementById('btn-delete-selected');
    const paintPanel = document.getElementById('paint-style-panel');
    const eraserPanel = document.getElementById('eraser-style-panel');
    const openingPanel = document.getElementById('opening-style-panel');
    const selectContainer = document.getElementById('selection-properties-container') || document.getElementById('properties-content');

    if (!selectContainer) return;

    const hideToolPanels = () => {
      if (paintPanel) paintPanel.style.display = 'none';
      if (eraserPanel) eraserPanel.style.display = 'none';
      if (openingPanel) openingPanel.style.display = 'none';
    };

    // Priority 1: If an active drawing/placement tool is selected, ALWAYS display that tool's properties panel!
    if (AppState.currentTool === 'floor') {
      if (btnDelete) btnDelete.style.display = 'none';
      if (titleEl) titleEl.textContent = 'ツール設定 (床・壁塗り)';
      hideToolPanels();
      if (paintPanel) paintPanel.style.display = 'block';
      selectContainer.style.display = 'none';
      this.updateFloorModeButtons();
      return;
    }

    if (AppState.currentTool === 'wall') {
      if (btnDelete) btnDelete.style.display = 'none';
      if (titleEl) titleEl.textContent = 'ツール設定 (自由壁線)';
      hideToolPanels();
      if (paintPanel) paintPanel.style.display = 'block';
      selectContainer.style.display = 'none';
      return;
    }

    if (AppState.currentTool === 'opening') {
      if (btnDelete) btnDelete.style.display = 'none';
      if (titleEl) titleEl.textContent = 'ツール設定 (ドア・窓)';
      hideToolPanels();
      if (openingPanel) openingPanel.style.display = 'block';
      selectContainer.style.display = 'none';
      this.syncOpeningToolInputs();
      return;
    }

    if (AppState.currentTool === 'eraser') {
      if (btnDelete) btnDelete.style.display = 'none';
      if (titleEl) titleEl.textContent = 'ツール設定 (消しゴム)';
      hideToolPanels();
      if (eraserPanel) eraserPanel.style.display = 'block';
      selectContainer.style.display = 'none';
      return;
    }

    // Priority 2: Selection Mode
    hideToolPanels();

    const hasSelection = (AppState.selectedObjectIds.size > 0 || AppState.selectedWallKeys.size > 0 || AppState.selectedOpeningIds.size > 0);

    if (!hasSelection) {
      if (btnDelete) btnDelete.style.display = 'none';
      selectContainer.style.display = 'block';

      if (AppState.activePaletteItem) {
        // Holding a palette item ready to place
        if (titleEl) titleEl.textContent = '配置待機中 (パーツ)';
        const rot = AppState.activePaletteRotation || 0;
        selectContainer.innerHTML = `
          <div class="prop-group">
            <div class="prop-title">配置するパーツ</div>
            <div style="font-weight: 600; color: var(--text-main); margin-bottom: 6px;">
              ${AppState.activePaletteItem.name}
            </div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 10px;">
              サイズ: ${AppState.activePaletteItem.width} × ${AppState.activePaletteItem.height} px<br>
              回転角度: <strong id="prop-active-rot-badge">${rot}°</strong>
            </div>
            <button class="btn-secondary" id="prop-rotate-preview-btn" style="width: 100%;">90° 回転する (R)</button>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 10px; line-height: 1.5; padding: 6px; background: var(--bg-secondary); border-radius: 4px;">
              💡 キャンバス上をクリックするとこの角度で配置されます。Rキーを押すことでも回転できます。
            </div>
          </div>
        `;
        const rotBtn = document.getElementById('prop-rotate-preview-btn');
        if (rotBtn) {
          rotBtn.onclick = () => {
            if (window.ShortcutManager) ShortcutManager.executeAction('action_rotate');
          };
        }
        return;
      }

      // Default info when nothing is selected
      if (titleEl) titleEl.textContent = 'プロパティ (未選択)';
      selectContainer.innerHTML = `
        <div style="font-size: 0.85rem; color: var(--text-muted); line-height: 1.6; padding: 4px;">
          <div style="font-weight: 600; color: var(--text-main); margin-bottom: 8px;">🗺️ マップの概要</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 12px;">
            <div style="background: var(--bg-secondary); padding: 6px 8px; border-radius: 4px;">床: <strong>${AppState.floors.size}</strong> マス</div>
            <div style="background: var(--bg-secondary); padding: 6px 8px; border-radius: 4px;">壁: <strong>${AppState.walls.size}</strong> 本</div>
            <div style="background: var(--bg-secondary); padding: 6px 8px; border-radius: 4px;">家具: <strong>${AppState.objects.length}</strong> 個</div>
            <div style="background: var(--bg-secondary); padding: 6px 8px; border-radius: 4px;">扉/窓: <strong>${AppState.openings.length}</strong> 箇所</div>
          </div>
          <div style="font-size: 0.75rem; border-top: 1px solid var(--border-color); padding-top: 8px;">
            ※オブジェクトや壁をクリックして選択すると、ここに詳細プロパティが表示されます。<br>
            ※ツールバーの各ツール（床・壁・ドア等）を選ぶとツール設定が表示されます。
          </div>
        </div>
      `;
      return;
    }

    if (btnDelete) btnDelete.style.display = 'inline-block';
    selectContainer.style.display = 'block';
    selectContainer.innerHTML = '';

    // If an opening (door / window) is selected
    if (AppState.selectedOpeningIds.size === 1) {
      if (titleEl) titleEl.textContent = 'プロパティ (開口部)';
      const opId = Array.from(AppState.selectedOpeningIds)[0];
      const op = AppState.openings.find(o => o.id === opId);
      if (!op) return;

      selectContainer.innerHTML = `
        <div class="prop-group">
          <div class="prop-title">開口部（ドア・窓）設定</div>
          <div class="prop-row">
            <label>タイプ:</label>
            <select id="prop-op-type" class="prop-input">
              <option value="door-single" ${op.type === 'door-single' ? 'selected' : ''}>片開きドア</option>
              <option value="door-double" ${op.type === 'door-double' ? 'selected' : ''}>両開きドア</option>
              <option value="window" ${op.type === 'window' ? 'selected' : ''}>窓</option>
              <option value="arch" ${op.type === 'arch' ? 'selected' : ''}>開口部（通路）</option>
            </select>
          </div>
          <div class="prop-row">
            <label>幅 (px):</label>
            <input type="number" id="prop-op-width" class="prop-input" value="${op.width}" step="20" min="20" max="200">
          </div>
          <div class="prop-row" style="margin-bottom: 2px;">
            <label>線色:</label>
            <div class="color-picker-wrapper">
              <input type="color" id="prop-op-color" class="prop-input" value="${op.color || '#ca8a04'}">
              <button class="eyedropper-btn" id="prop-eyedropper-op" title="色をスポイト取得">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M19 11l-8-8-8.5 8.5a2.12 2.12 0 0 0 0 3l5 5a2.12 2.12 0 0 0 3 0L19 11z"/>
                  <path d="M5 21h14"/>
                </svg>
              </button>
            </div>
          </div>
          <div id="prop-op-presets" class="color-presets-row" style="padding-left: 60px;"></div>
          <div class="prop-row" style="margin-top: 6px; gap: 4px;">
            <button class="btn-secondary" id="prop-op-flip-btn" style="flex: 1;">開き向き反転 (R)</button>
            <button class="btn-secondary" id="prop-op-hinge-btn" style="flex: 1;">左右反転</button>
          </div>
          <div class="prop-row" style="margin-top: 8px;">
            <button class="btn-secondary" id="prop-op-delete-btn" style="flex: 1; color: var(--danger-color); border-color: var(--danger-color);">開口部を削除 (Del)</button>
          </div>
        </div>
      `;

      if (window.ColorManager) {
        ColorManager.renderSwatches(document.getElementById('prop-op-presets'), ColorManager.openingPresets, op.color, (c) => {
          op.color = c;
          document.getElementById('prop-op-color').value = c;
          if (window.CanvasManager) CanvasManager.requestRender();
          AppState.pushHistory('開口部色変更');
        }, { category: 'opening', targetInput: document.getElementById('prop-op-color') });
        ColorManager.attachEyedropperButton(document.getElementById('prop-eyedropper-op'), document.getElementById('prop-op-color'), (c) => {
          op.color = c;
          if (window.CanvasManager) CanvasManager.requestRender();
          AppState.pushHistory('開口部色変更');
        });
      }

      document.getElementById('prop-op-type').onchange = (e) => {
        op.type = e.target.value;
        if (window.CanvasManager) CanvasManager.requestRender();
        AppState.pushHistory('開口部タイプ変更');
      };
      document.getElementById('prop-op-width').onchange = (e) => {
        op.width = Math.max(10, parseFloat(e.target.value) || 40);
        if (window.CanvasManager) CanvasManager.requestRender();
        AppState.pushHistory('開口部幅変更');
      };
      document.getElementById('prop-op-color').onchange = (e) => {
        op.color = e.target.value;
        if (window.CanvasManager) CanvasManager.requestRender();
        AppState.pushHistory('開口部色変更');
      };
      document.getElementById('prop-op-flip-btn').onclick = () => {
        op.flipSwing = !op.flipSwing;
        if (window.CanvasManager) CanvasManager.requestRender();
        AppState.pushHistory('開口部開き向き反転');
      };
      document.getElementById('prop-op-hinge-btn').onclick = () => {
        op.flipHinge = !op.flipHinge;
        if (window.CanvasManager) CanvasManager.requestRender();
        AppState.pushHistory('ヒンジ反転');
      };
      document.getElementById('prop-op-delete-btn').onclick = () => {
        WallManager.removeOpening(op.id);
        AppState.pushHistory('開口部削除');
        this.updatePropertyPanel();
        if (window.CanvasManager) CanvasManager.requestRender();
      };
      return;
    } else if (AppState.selectedOpeningIds.size > 1) {
      if (titleEl) titleEl.textContent = `プロパティ (${AppState.selectedOpeningIds.size}箇所の開口部)`;
      selectContainer.innerHTML = `
        <div class="prop-group">
          <div class="prop-title">複数開口部選択</div>
          <div style="font-size: 0.85rem; color: var(--text-main); margin-bottom: 8px;">
            ${AppState.selectedOpeningIds.size} 個の開口部を選択中
          </div>
          <button class="btn-secondary" id="prop-op-flip-all-btn">まとめて反転 (R)</button>
          <button class="btn-secondary" id="prop-op-delete-all-btn" style="margin-top: 8px; color: var(--danger-color); border-color: var(--danger-color);">選択した開口部を一括削除</button>
        </div>
      `;
      document.getElementById('prop-op-flip-all-btn').onclick = () => {
        for (const opId of AppState.selectedOpeningIds) {
          const op = AppState.openings.find(o => o.id === opId);
          if (op) op.flipSwing = !op.flipSwing;
        }
        if (window.CanvasManager) CanvasManager.requestRender();
        AppState.pushHistory('開口部一括反転');
      };
      document.getElementById('prop-op-delete-all-btn').onclick = () => {
        for (const opId of AppState.selectedOpeningIds) {
          WallManager.removeOpening(opId);
        }
        AppState.selectedOpeningIds.clear();
        AppState.pushHistory('開口部一括削除');
        this.updatePropertyPanel();
        if (window.CanvasManager) CanvasManager.requestRender();
      };
      return;
    }

    // If an object is selected
    if (AppState.selectedObjectIds.size === 1) {
      const objId = Array.from(AppState.selectedObjectIds)[0];
      const obj = AppState.objects.find(o => o.id === objId);
      if (!obj) return;
      if (titleEl) titleEl.textContent = `プロパティ (${obj.name || 'オブジェクト'})`;

      const defaultItem = (obj.paletteItemId && AppState.paletteItems.find(p => p.id === obj.paletteItemId)) ||
        AppState.paletteItems.find(p => p.name === obj.name);
      if (!obj.paletteItemId && defaultItem) {
        obj.paletteItemId = defaultItem.id;
      }

      const snapUnit = GridManager.getSnapUnit();

      selectContainer.innerHTML = `
        <div class="prop-group">
          <div class="prop-title">オブジェクト設定</div>
          <div class="prop-row">
            <label>名前:</label>
            <input type="text" id="prop-obj-name" class="prop-input" value="${obj.name || ''}">
          </div>
          <div class="prop-row">
            <label>位置 X:</label>
            <input type="number" id="prop-obj-x" class="prop-input" value="${Math.round(obj.x)}" step="${snapUnit}">
            <label style="margin-left: 6px;">Y:</label>
            <input type="number" id="prop-obj-y" class="prop-input" value="${Math.round(obj.y)}" step="${snapUnit}">
          </div>
          <div class="prop-row">
            <label>幅:</label>
            <input type="number" id="prop-obj-w" class="prop-input" value="${obj.width}" step="${snapUnit}">
            <label style="margin-left: 6px;">高さ:</label>
            <input type="number" id="prop-obj-h" class="prop-input" value="${obj.height}" step="${snapUnit}">
          </div>
          <div class="prop-row">
            <label>回転:</label>
            <button class="btn-secondary" id="prop-rotate-btn">90° 回転 (R)</button>
          </div>
        </div>

        <div class="prop-group">
          <div class="prop-title">スタイル</div>
          <div class="prop-row" style="margin-bottom: 2px;">
            <label>塗り色:</label>
            <div class="color-picker-wrapper">
              <input type="color" id="prop-obj-color" class="prop-input" value="${obj.color || '#3b82f6'}">
              <button class="eyedropper-btn" id="prop-eyedropper-obj-color" title="塗り色をスポイト取得">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M19 11l-8-8-8.5 8.5a2.12 2.12 0 0 0 0 3l5 5a2.12 2.12 0 0 0 3 0L19 11z"/>
                  <path d="M5 21h14"/>
                </svg>
              </button>
            </div>
          </div>
          <div id="prop-obj-presets" class="color-presets-row" style="padding-left: 60px;"></div>

          <div class="prop-row" style="margin-bottom: 2px;">
            <label>枠線色:</label>
            <div class="color-picker-wrapper">
              <input type="color" id="prop-obj-stroke" class="prop-input" value="${obj.strokeColor || '#1d4ed8'}">
              <button class="eyedropper-btn" id="prop-eyedropper-obj-stroke" title="枠線色をスポイト取得">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M19 11l-8-8-8.5 8.5a2.12 2.12 0 0 0 0 3l5 5a2.12 2.12 0 0 0 3 0L19 11z"/>
                  <path d="M5 21h14"/>
                </svg>
              </button>
            </div>
          </div>
          <div id="prop-obj-stroke-presets" class="color-presets-row" style="padding-left: 60px;"></div>

          <div class="prop-row">
            <label>画像変更:</label>
            <input type="file" id="prop-obj-image" accept="image/*" class="prop-input">
          </div>
        </div>

        <div class="prop-group">
          <div class="prop-title">テキストラベル</div>
          <div class="prop-row">
            <label>テキスト:</label>
            <input type="text" id="prop-obj-text" class="prop-input" value="${obj.text || ''}">
          </div>
          <div class="prop-row" style="margin-bottom: 2px;">
            <label>文字色:</label>
            <div class="color-picker-wrapper">
              <input type="color" id="prop-obj-textcolor" class="prop-input" value="${obj.textColor || '#ffffff'}">
              <button class="eyedropper-btn" id="prop-eyedropper-obj-textcolor" title="文字色をスポイト取得">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M19 11l-8-8-8.5 8.5a2.12 2.12 0 0 0 0 3l5 5a2.12 2.12 0 0 0 3 0L19 11z"/>
                  <path d="M5 21h14"/>
                </svg>
              </button>
            </div>
            <label style="margin-left: 6px;">サイズ:</label>
            <input type="number" id="prop-obj-fontsize" class="prop-input" value="${obj.fontSize || 12}" min="8" max="48" style="width: 55px;">
          </div>
          <div id="prop-obj-textcolor-presets" class="color-presets-row" style="padding-left: 60px;"></div>
        </div>

        <div class="prop-group">
          <div class="prop-title">レイヤー & 初期化</div>
          <div class="prop-row" style="gap: 6px;">
            <button class="btn-secondary" id="prop-z-up">最前面へ</button>
            <button class="btn-secondary" id="prop-z-down">最背面へ</button>
          </div>
          <button class="btn-secondary" id="prop-reset-default-btn" style="margin-top: 8px; width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;" ${!defaultItem ? 'disabled title="対応するパレットのパーツが見つかりません"' : 'title="パレットに登録された初期設定（サイズ、色、枠線、文字等）に戻します"'}>
            <span>🔄</span><span>パレットの初期値に戻す</span>
          </button>
          <button class="btn-primary" id="prop-save-palette" style="margin-top: 8px;">このパーツをパレットに保存</button>
        </div>
      `;

      // Bind Property Controls
      document.getElementById('prop-obj-name').onchange = (e) => {
        obj.name = e.target.value;
        AppState.pushHistory('名前変更');
      };
      document.getElementById('prop-obj-x').onchange = (e) => {
        obj.x = parseFloat(e.target.value);
        if (window.CanvasManager) CanvasManager.requestRender();
      };
      document.getElementById('prop-obj-y').onchange = (e) => {
        obj.y = parseFloat(e.target.value);
        if (window.CanvasManager) CanvasManager.requestRender();
      };
      document.getElementById('prop-obj-w').onchange = (e) => {
        obj.width = Math.max(snapUnit, parseFloat(e.target.value));
        if (window.CanvasManager) CanvasManager.requestRender();
      };
      document.getElementById('prop-obj-h').onchange = (e) => {
        obj.height = Math.max(snapUnit, parseFloat(e.target.value));
        if (window.CanvasManager) CanvasManager.requestRender();
      };
      document.getElementById('prop-rotate-btn').onclick = () => {
        ObjectManager.rotateObject(obj, true);
        if (window.CanvasManager) CanvasManager.requestRender();
        AppState.pushHistory('回転');
      };
      if (window.ColorManager) {
        ColorManager.renderSwatches(document.getElementById('prop-obj-presets'), ColorManager.objectPresets, obj.color, (c) => {
          obj.fillType = 'color';
          obj.color = c;
          document.getElementById('prop-obj-color').value = c;
          if (window.CanvasManager) CanvasManager.requestRender();
          AppState.pushHistory('色変更');
        }, { category: 'object', targetInput: document.getElementById('prop-obj-color') });
        ColorManager.attachEyedropperButton(document.getElementById('prop-eyedropper-obj-color'), document.getElementById('prop-obj-color'), (c) => {
          obj.fillType = 'color';
          obj.color = c;
          if (window.CanvasManager) CanvasManager.requestRender();
          AppState.pushHistory('色変更');
        });
        ColorManager.renderSwatches(document.getElementById('prop-obj-stroke-presets'), ColorManager.strokePresets, obj.strokeColor, (c) => {
          obj.strokeColor = c;
          document.getElementById('prop-obj-stroke').value = c;
          if (window.CanvasManager) CanvasManager.requestRender();
          AppState.pushHistory('枠線色変更');
        }, { category: 'stroke', targetInput: document.getElementById('prop-obj-stroke') });
        ColorManager.attachEyedropperButton(document.getElementById('prop-eyedropper-obj-stroke'), document.getElementById('prop-obj-stroke'), (c) => {
          obj.strokeColor = c;
          if (window.CanvasManager) CanvasManager.requestRender();
          AppState.pushHistory('枠線色変更');
        });
        ColorManager.renderSwatches(document.getElementById('prop-obj-textcolor-presets'), ColorManager.textPresets, obj.textColor, (c) => {
          obj.textColor = c;
          document.getElementById('prop-obj-textcolor').value = c;
          if (window.CanvasManager) CanvasManager.requestRender();
          AppState.pushHistory('文字色変更');
        }, { category: 'text', targetInput: document.getElementById('prop-obj-textcolor') });
        ColorManager.attachEyedropperButton(document.getElementById('prop-eyedropper-obj-textcolor'), document.getElementById('prop-obj-textcolor'), (c) => {
          obj.textColor = c;
          if (window.CanvasManager) CanvasManager.requestRender();
          AppState.pushHistory('文字色変更');
        });
      }

      document.getElementById('prop-obj-color').onchange = (e) => {
        obj.fillType = 'color';
        obj.color = e.target.value;
        if (window.CanvasManager) CanvasManager.requestRender();
        AppState.pushHistory('色変更');
      };
      document.getElementById('prop-obj-stroke').onchange = (e) => {
        obj.strokeColor = e.target.value;
        if (window.CanvasManager) CanvasManager.requestRender();
        AppState.pushHistory('枠線色変更');
      };
      document.getElementById('prop-obj-text').oninput = (e) => {
        obj.text = e.target.value;
        if (window.CanvasManager) CanvasManager.requestRender();
      };
      document.getElementById('prop-obj-text').onchange = () => {
        AppState.pushHistory('テキスト変更');
      };
      document.getElementById('prop-obj-textcolor').onchange = (e) => {
        obj.textColor = e.target.value;
        if (window.CanvasManager) CanvasManager.requestRender();
      };
      document.getElementById('prop-obj-fontsize').onchange = (e) => {
        obj.fontSize = parseInt(e.target.value, 10);
        if (window.CanvasManager) CanvasManager.requestRender();
      };
      document.getElementById('prop-obj-image').onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
            obj.fillType = 'image';
            obj.imageData = evt.target.result;
            ObjectManager.loadImage(obj);
            AppState.pushHistory('画像適用');
          };
          reader.readAsDataURL(file);
        }
      };
      document.getElementById('prop-z-up').onclick = () => {
        obj.zIndex = Math.max(...AppState.objects.map(o => o.zIndex || 0)) + 1;
        if (window.CanvasManager) CanvasManager.requestRender();
        AppState.pushHistory('最前面へ');
      };
      document.getElementById('prop-z-down').onclick = () => {
        obj.zIndex = Math.min(...AppState.objects.map(o => o.zIndex || 0)) - 1;
        if (window.CanvasManager) CanvasManager.requestRender();
        AppState.pushHistory('最背面へ');
      };
      const btnReset = document.getElementById('prop-reset-default-btn');
      if (btnReset && defaultItem) {
        btnReset.onclick = () => {
          obj.width = defaultItem.width;
          obj.height = defaultItem.height;
          obj.shapeType = defaultItem.shapeType || 'rect';
          obj.cells = defaultItem.cells ? JSON.parse(JSON.stringify(defaultItem.cells)) : null;
          obj.fillType = defaultItem.fillType || 'color';
          obj.color = defaultItem.color;
          obj.strokeColor = defaultItem.strokeColor;
          obj.strokeWidth = defaultItem.strokeWidth || 1;
          obj.imageData = defaultItem.imageData || null;
          obj.text = defaultItem.text || '';
          obj.textColor = defaultItem.textColor || '#ffffff';
          obj.fontSize = defaultItem.fontSize || 12;
          if (obj.fillType === 'image') {
            ObjectManager.loadImage(obj);
          }
          AppState.pushHistory('パレット初期値に初期化: ' + obj.name);
          this.updatePropertyPanel();
          if (window.CanvasManager) CanvasManager.requestRender();
          if (window.App) App.showToast(`「${obj.name}」をパレットの初期値に戻しました`, 'success');
        };
      }
      document.getElementById('prop-save-palette').onclick = () => {
        const clonedItem = {
          id: 'custom-' + Date.now(),
          name: obj.name || 'カスタムパーツ',
          group: 'custom',
          type: 'object',
          width: obj.width,
          height: obj.height,
          shapeType: obj.shapeType,
          cells: obj.cells ? JSON.parse(JSON.stringify(obj.cells)) : null,
          fillType: obj.fillType,
          color: obj.color,
          strokeColor: obj.strokeColor,
          imageData: obj.imageData,
          text: obj.text,
          textColor: obj.textColor,
          fontSize: obj.fontSize
        };
        AppState.paletteItems.push(clonedItem);
        AppState.saveCustomPaletteItems();
        this.renderItems();
        AppState.pushHistory('パレット保存');
        if (window.App) App.showToast(`「${clonedItem.name}」をカスタムパレットに登録しました`, 'success');
      };
    } else if (AppState.selectedObjectIds.size > 1) {
      // Multiple Objects Selected
      selectContainer.innerHTML = `
        <div class="prop-group">
          <div class="prop-title">複数選択</div>
          <div style="font-size: 0.85rem; color: var(--text-main); margin-bottom: 8px;">
            ${AppState.selectedObjectIds.size} 個のオブジェクトを選択中
          </div>
          <button class="btn-secondary" id="prop-rotate-all-btn">まとめて90° 回転 (R)</button>
          <button class="btn-secondary" id="prop-reset-all-default-btn" style="margin-top: 6px; width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;">
            <span>🔄</span><span>選択パーツをパレット初期値に戻す</span>
          </button>
          <button class="btn-primary" id="prop-save-prefab" style="margin-top: 8px;">選択を複合セット(Prefab)としてパレットに保存</button>
        </div>
      `;
      document.getElementById('prop-rotate-all-btn').onclick = () => {
        for (const id of AppState.selectedObjectIds) {
          const obj = AppState.objects.find(o => o.id === id);
          if (obj) ObjectManager.rotateObject(obj, true);
        }
        if (window.CanvasManager) CanvasManager.requestRender();
        AppState.pushHistory('一括回転');
      };
      const btnResetAll = document.getElementById('prop-reset-all-default-btn');
      if (btnResetAll) {
        btnResetAll.onclick = () => {
          let count = 0;
          for (const id of AppState.selectedObjectIds) {
            const o = AppState.objects.find(item => item.id === id);
            if (!o) continue;
            const def = (o.paletteItemId && AppState.paletteItems.find(p => p.id === o.paletteItemId)) ||
              AppState.paletteItems.find(p => p.name === o.name);
            if (def) {
              o.width = def.width;
              o.height = def.height;
              o.shapeType = def.shapeType || 'rect';
              o.cells = def.cells ? JSON.parse(JSON.stringify(def.cells)) : null;
              o.fillType = def.fillType || 'color';
              o.color = def.color;
              o.strokeColor = def.strokeColor;
              o.strokeWidth = def.strokeWidth || 1;
              o.imageData = def.imageData || null;
              o.text = def.text || '';
              o.textColor = def.textColor || '#ffffff';
              o.fontSize = def.fontSize || 12;
              if (o.fillType === 'image') {
                ObjectManager.loadImage(o);
              }
              count++;
            }
          }
          if (count > 0) {
            AppState.pushHistory(`${count}個のパーツをパレット初期値に初期化`);
            this.updatePropertyPanel();
            if (window.CanvasManager) CanvasManager.requestRender();
            if (window.App) App.showToast(`${count} 個のパーツをパレットの初期値に戻しました`, 'success');
          } else {
            if (window.App) App.showToast('対応するパレットのパーツが見つかりませんでした', 'warning');
          }
        };
      }
      const btnPrefab = document.getElementById('prop-save-prefab');
      if (btnPrefab) {
        btnPrefab.onclick = () => {
          const selectedObjs = AppState.objects.filter(o => AppState.selectedObjectIds.has(o.id));
          if (selectedObjs.length === 0) return;
          const minX = Math.min(...selectedObjs.map(o => o.x));
          const minY = Math.min(...selectedObjs.map(o => o.y));
          const maxX = Math.max(...selectedObjs.map(o => o.x + o.width));
          const maxY = Math.max(...selectedObjs.map(o => o.y + o.height));
          const prefabItem = {
            id: 'prefab-' + Date.now(),
            name: `セット (${selectedObjs.length}個)`,
            group: 'custom',
            type: 'prefab',
            width: maxX - minX,
            height: maxY - minY,
            subObjects: selectedObjs.map(o => ({
              ...JSON.parse(JSON.stringify(o)),
              relX: o.x - minX,
              relY: o.y - minY
            }))
          };
          AppState.paletteItems.push(prefabItem);
          AppState.saveCustomPaletteItems();
          this.renderItems();
          if (window.App) App.showToast(`プレハブ「${prefabItem.name}」を登録しました`, 'success');
        };
      }
    }
  },

  updateFloorModeButtons() {
    const mode = (AppState.paintStyle && AppState.paintStyle.floorFillMode) || 'brush';
    const btnBrush = document.getElementById('btn-floor-mode-brush');
    const btnRect = document.getElementById('btn-floor-mode-rect');
    const btnBucket = document.getElementById('btn-floor-mode-bucket');
    if (btnBrush) btnBrush.classList.toggle('active', mode === 'brush');
    if (btnRect) btnRect.classList.toggle('active', mode === 'rect');
    if (btnBucket) btnBucket.classList.toggle('active', mode === 'bucket');
  },

  syncOpeningToolInputs() {
    const op = AppState.activePaletteItem || AppState.openingStyle || {};
    const typeSelect = document.getElementById('tool-op-type');
    const widthInput = document.getElementById('tool-op-width');
    const colorInput = document.getElementById('tool-op-color');

    if (typeSelect && (op.openingType || op.type)) typeSelect.value = op.openingType || op.type;
    if (widthInput && op.width) widthInput.value = op.width;
    if (colorInput && op.color) colorInput.value = op.color;

    const presets = document.getElementById('tool-op-presets');
    if (presets && window.ColorManager) {
      ColorManager.renderSwatches(presets, ColorManager.openingPresets, op.color || '#ca8a04', (c) => {
        if (colorInput) colorInput.value = c;
        if (AppState.openingStyle) AppState.openingStyle.color = c;
        if (AppState.activePaletteItem) AppState.activePaletteItem.color = c;
        if (window.CanvasManager) CanvasManager.requestRender();
      }, { category: 'opening', targetInput: colorInput });
      ColorManager.attachEyedropperButton(document.getElementById('tool-eyedropper-op'), colorInput, (c) => {
        if (AppState.openingStyle) AppState.openingStyle.color = c;
        if (AppState.activePaletteItem) AppState.activePaletteItem.color = c;
        if (window.CanvasManager) CanvasManager.requestRender();
      });
    }
  },

  initPropertyEvents() {
    const btnDelete = document.getElementById('btn-delete-selected');
    if (btnDelete) {
      btnDelete.onclick = () => {
        if (window.CanvasManager) CanvasManager.deleteSelected();
      };
    }

    // Floor mode buttons
    const btnBrush = document.getElementById('btn-floor-mode-brush');
    if (btnBrush) {
      btnBrush.onclick = () => {
        AppState.paintStyle.floorFillMode = 'brush';
        this.updateFloorModeButtons();
      };
    }
    const btnRect = document.getElementById('btn-floor-mode-rect');
    if (btnRect) {
      btnRect.onclick = () => {
        AppState.paintStyle.floorFillMode = 'rect';
        this.updateFloorModeButtons();
      };
    }
    const btnBucket = document.getElementById('btn-floor-mode-bucket');
    if (btnBucket) {
      btnBucket.onclick = () => {
        AppState.paintStyle.floorFillMode = 'bucket';
        this.updateFloorModeButtons();
      };
    }

    // Bulk replace all floors button
    const btnReplaceAll = document.getElementById('btn-replace-all-floors');
    if (btnReplaceAll) {
      btnReplaceAll.onclick = () => {
        if (window.CanvasManager) CanvasManager.replaceAllFloors();
      };
    }

    // Auto perimeter wall toggle
    const autoWallCheck = document.getElementById('paint-auto-perimeter-wall');
    if (autoWallCheck) {
      autoWallCheck.checked = AppState.paintStyle.autoPerimeterWall !== false;
      autoWallCheck.onchange = (e) => {
        AppState.paintStyle.autoPerimeterWall = e.target.checked;
        if (window.WallManager) WallManager.rebuildAutoWalls();
        if (window.CanvasManager) CanvasManager.requestRender();
      };
    }

    // Opening (Door / Window) Tool Events
    const toolOpType = document.getElementById('tool-op-type');
    if (toolOpType) {
      toolOpType.onchange = (e) => {
        const val = e.target.value;
        if (AppState.openingStyle) AppState.openingStyle.type = val;
        if (AppState.activePaletteItem) {
          AppState.activePaletteItem.openingType = val;
          AppState.activePaletteItem.type = val;
        }
        if (window.CanvasManager) CanvasManager.requestRender();
      };
    }

    const toolOpWidth = document.getElementById('tool-op-width');
    if (toolOpWidth) {
      toolOpWidth.onchange = (e) => {
        const val = Math.max(10, parseFloat(e.target.value) || 40);
        if (AppState.openingStyle) AppState.openingStyle.width = val;
        if (AppState.activePaletteItem) AppState.activePaletteItem.width = val;
        if (window.CanvasManager) CanvasManager.requestRender();
      };
    }

    const toolOpColor = document.getElementById('tool-op-color');
    if (toolOpColor) {
      toolOpColor.onchange = (e) => {
        const val = e.target.value;
        if (AppState.openingStyle) AppState.openingStyle.color = val;
        if (AppState.activePaletteItem) AppState.activePaletteItem.color = val;
        if (window.CanvasManager) CanvasManager.requestRender();
      };
    }

    const toolOpFlipSwing = document.getElementById('tool-op-flip-swing-btn');
    if (toolOpFlipSwing) {
      toolOpFlipSwing.onclick = () => {
        const curSwing = (AppState.activePaletteItem && typeof AppState.activePaletteItem.flipSwing !== 'undefined')
          ? AppState.activePaletteItem.flipSwing
          : (AppState.openingStyle ? AppState.openingStyle.flipSwing : false);
        const nextSwing = !curSwing;
        if (AppState.activePaletteItem) AppState.activePaletteItem.flipSwing = nextSwing;
        if (AppState.openingStyle) AppState.openingStyle.flipSwing = nextSwing;
        if (window.CanvasManager) CanvasManager.requestRender();
        if (window.App) App.showToast(nextSwing ? '開口部: 内開き (反転)' : '開口部: 外開き (標準)');
      };
    }

    const toolOpFlipHinge = document.getElementById('tool-op-flip-hinge-btn');
    if (toolOpFlipHinge) {
      toolOpFlipHinge.onclick = () => {
        const curHinge = (AppState.activePaletteItem && typeof AppState.activePaletteItem.flipHinge !== 'undefined')
          ? AppState.activePaletteItem.flipHinge
          : (AppState.openingStyle ? AppState.openingStyle.flipHinge : false);
        const nextHinge = !curHinge;
        if (AppState.activePaletteItem) AppState.activePaletteItem.flipHinge = nextHinge;
        if (AppState.openingStyle) AppState.openingStyle.flipHinge = nextHinge;
        if (window.CanvasManager) CanvasManager.requestRender();
        if (window.App) App.showToast(nextHinge ? '開口部: 右吊元 (反転)' : '開口部: 左吊元 (標準)');
      };
    }
  }
};

if (typeof window !== 'undefined') window.PaletteManager = PaletteManager;
if (typeof global !== 'undefined') global.PaletteManager = PaletteManager;
