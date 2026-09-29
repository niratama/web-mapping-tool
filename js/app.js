/**
 * app.js - Main Application Orchestrator & UI Event Bindings
 */

const App = {
  init() {
    // 1. Initialize Subsystems (Restore from LocalStorage)
    const restored = AppState.init();
    CanvasManager.init();
    PaletteManager.init();
    HotbarManager.init();
    ShortcutManager.init();
    ExportManager.init();
    if (window.ColorManager) ColorManager.init();

    // 2. Bind Toolbar & App Controls
    this.initToolbar();
    this.initGridSettingsModal();
    this.initPaintStyleControls();
    this.initEraserControls();

    // 3. BeforeUnload & Periodic Auto-Save
    window.addEventListener('beforeunload', () => {
      AppState.saveToLocalStorage();
    });
    // Auto-save every 2 seconds
    setInterval(() => {
      AppState.saveToLocalStorage();
    }, 2000);

    // 4. Welcome or Restored Toast
    setTimeout(() => {
      if (restored) {
        this.showToast('前回の作業データを復元しました！', 'success');
      } else {
        this.showToast('GridMap Studio が起動しました！', 'success');
      }
    }, 400);
  },

  // Set Active Tool
  setTool(toolName, clearActiveItem = true) {
    AppState.currentTool = toolName;
    if (clearActiveItem) {
      AppState.activePaletteItem = null;
      if (window.HotbarManager) {
        HotbarManager.activeSlotIndex = -1;
        HotbarManager.render();
      }
    }

    // When selecting a tool, clear object selections so tool properties take priority
    if (toolName !== 'select') {
      AppState.selectedObjectIds.clear();
      AppState.selectedWallKeys.clear();
      AppState.selectedOpeningIds.clear();
      AppState.selectedFloorKeys.clear();
    }

    // Update active button state
    document.querySelectorAll('.toolbar-group .tool-btn[data-tool]').forEach(btn => {
      if (btn.dataset.tool === toolName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    const toolbarEraserSelect = document.getElementById('toolbar-eraser-target');
    if (toolbarEraserSelect) {
      toolbarEraserSelect.style.display = (toolName === 'eraser') ? 'inline-block' : 'none';
    }

    // Switch palette to Openings tab when opening tool is selected
    if (toolName === 'opening') {
      if (window.PaletteManager) {
        PaletteManager.activeGroupId = 'openings';
        PaletteManager.renderTabs();
        PaletteManager.renderItems();
      }
      const opStyle = AppState.openingStyle || {};
      if (!AppState.activePaletteItem || AppState.activePaletteItem.type !== 'opening') {
        const found = AppState.paletteItems.find(i => i.type === 'opening');
        AppState.activePaletteItem = found ? { ...found } : {
          id: 'item-door-single',
          name: '片開きドア',
          group: 'openings',
          type: 'opening',
          openingType: opStyle.type || 'door-single',
          width: opStyle.width || 40,
          color: opStyle.color || '#ca8a04',
          flipSwing: !!opStyle.flipSwing,
          flipHinge: !!opStyle.flipHinge
        };
      }
    }

    // Update Right Properties Panel for active tool
    if (window.PaletteManager) {
      PaletteManager.updatePropertyPanel();
    }

    // Set cursor
    const canvas = document.getElementById('mapCanvas');
    if (canvas) {
      if (toolName === 'hand') {
        canvas.style.cursor = 'grab';
      } else if (toolName === 'floor' || toolName === 'wall' || toolName === 'opening') {
        canvas.style.cursor = 'crosshair';
      } else if (toolName === 'eraser') {
        canvas.style.cursor = 'cell';
      } else {
        canvas.style.cursor = 'default';
      }
    }

    if (window.PaletteManager) PaletteManager.renderItems();
    if (window.CanvasManager) CanvasManager.requestRender();
  },

  // Toolbar & Undo/Redo Bindings
  initToolbar() {
    // Tool buttons
    document.querySelectorAll('.toolbar-group .tool-btn[data-tool]').forEach(btn => {
      btn.onclick = () => {
        this.setTool(btn.dataset.tool);
      };
    });

    // Undo / Redo
    const btnUndo = document.getElementById('btn-undo');
    if (btnUndo) {
      btnUndo.onclick = () => {
        if (AppState.undo()) {
          this.showToast('元に戻しました');
        }
      };
    }

    const btnRedo = document.getElementById('btn-redo');
    if (btnRedo) {
      btnRedo.onclick = () => {
        if (AppState.redo()) {
          this.showToast('やり直しました');
        }
      };
    }

    // New Map (Clear) Button
    const btnNewMap = document.getElementById('btn-new-map');
    if (btnNewMap) {
      btnNewMap.onclick = () => {
        if (confirm('現在のマップをクリアして新規作成しますか？（未保存の変更は失われます）')) {
          AppState.clearLocalStorage();
          this.showToast('新しいマップを作成しました');
        }
      };
    }
  },

  // Grid Settings Modal
  initGridSettingsModal() {
    const btnOpen = document.getElementById('btn-grid-settings');
    const visualSizeInput = document.getElementById('grid-visual-size');
    const subdivisionsSelect = document.getElementById('grid-subdivisions');
    const visualColorInput = document.getElementById('grid-visual-color');
    const snapColorInput = document.getElementById('grid-snap-color');
    const showSnapCheck = document.getElementById('grid-show-snap');
    const showOnFloorCheck = document.getElementById('grid-show-on-floor');

    const syncModalInputs = () => {
      if (visualSizeInput) visualSizeInput.value = AppState.grid.visualCellSize;
      if (subdivisionsSelect) subdivisionsSelect.value = AppState.grid.subdivisions;
      if (visualColorInput) visualColorInput.value = AppState.grid.visualColor;
      if (snapColorInput) snapColorInput.value = AppState.grid.snapColor;
      if (showSnapCheck) showSnapCheck.checked = AppState.grid.showSnap;
      if (showOnFloorCheck) showOnFloorCheck.checked = AppState.grid.showOnFloor !== false;
    };

    if (btnOpen) {
      btnOpen.onclick = () => {
        syncModalInputs();
        document.getElementById('modal-grid-settings').classList.add('active');
      };
    }

    if (visualSizeInput) {
      visualSizeInput.value = AppState.grid.visualCellSize;
      visualSizeInput.onchange = (e) => {
        AppState.grid.visualCellSize = Math.max(10, Math.min(200, parseInt(e.target.value, 10) || 40));
        CanvasManager.requestRender();
        AppState.saveToLocalStorage();
      };
    }

    if (subdivisionsSelect) {
      subdivisionsSelect.value = AppState.grid.subdivisions;
      subdivisionsSelect.onchange = (e) => {
        AppState.grid.subdivisions = parseInt(e.target.value, 10) || 2;
        CanvasManager.requestRender();
        AppState.saveToLocalStorage();
      };
    }

    if (visualColorInput) {
      visualColorInput.value = AppState.grid.visualColor;
      visualColorInput.onchange = (e) => {
        AppState.grid.visualColor = e.target.value;
        CanvasManager.requestRender();
        AppState.saveToLocalStorage();
      };
    }

    if (snapColorInput) {
      snapColorInput.value = AppState.grid.snapColor;
      snapColorInput.onchange = (e) => {
        AppState.grid.snapColor = e.target.value;
        CanvasManager.requestRender();
        AppState.saveToLocalStorage();
      };
    }

    if (showSnapCheck) {
      showSnapCheck.checked = AppState.grid.showSnap;
      showSnapCheck.onchange = (e) => {
        AppState.grid.showSnap = e.target.checked;
        CanvasManager.requestRender();
        AppState.saveToLocalStorage();
      };
    }

    if (showOnFloorCheck) {
      showOnFloorCheck.checked = AppState.grid.showOnFloor !== false;
      showOnFloorCheck.onchange = (e) => {
        AppState.grid.showOnFloor = e.target.checked;
        CanvasManager.requestRender();
        AppState.saveToLocalStorage();
      };
    }
  },

  // Paint Style Controls (Floor color/texture, Wall color/texture)
  initPaintStyleControls() {
    const floorColor = document.getElementById('paint-floor-color');
    const floorTexture = document.getElementById('paint-floor-texture');
    const wallColor = document.getElementById('paint-wall-color');
    const wallTexture = document.getElementById('paint-wall-texture');
    const floorVal = document.getElementById('paint-floor-color-val');
    const wallVal = document.getElementById('paint-wall-color-val');

    if (floorColor) {
      floorColor.value = AppState.paintStyle.floorColor;
      if (floorVal) floorVal.textContent = AppState.paintStyle.floorColor;
      floorColor.onchange = (e) => {
        AppState.paintStyle.floorColor = e.target.value;
        if (floorVal) floorVal.textContent = e.target.value;
        const presets = document.getElementById('floor-color-presets');
        if (presets && window.ColorManager) {
          ColorManager.renderSwatches(presets, ColorManager.floorPresets, e.target.value, (c) => {
            floorColor.value = c;
            AppState.paintStyle.floorColor = c;
            if (floorVal) floorVal.textContent = c;
          }, { category: 'floor', targetInput: floorColor });
        }
      };
    }

    if (floorTexture) {
      floorTexture.value = AppState.paintStyle.floorTexture;
      floorTexture.onchange = (e) => {
        AppState.paintStyle.floorTexture = e.target.value;
      };
    }

    if (wallColor) {
      wallColor.value = AppState.paintStyle.wallColor;
      if (wallVal) wallVal.textContent = AppState.paintStyle.wallColor;
      wallColor.onchange = (e) => {
        AppState.paintStyle.wallColor = e.target.value;
        if (wallVal) wallVal.textContent = e.target.value;
        const presets = document.getElementById('wall-color-presets');
        if (presets && window.ColorManager) {
          ColorManager.renderSwatches(presets, ColorManager.wallPresets, e.target.value, (c) => {
            wallColor.value = c;
            AppState.paintStyle.wallColor = c;
            if (wallVal) wallVal.textContent = c;
          }, { category: 'wall', targetInput: wallColor });
        }
      };
    }

    if (wallTexture) {
      wallTexture.value = AppState.paintStyle.wallTexture;
      wallTexture.onchange = (e) => {
        AppState.paintStyle.wallTexture = e.target.value;
      };
    }
  },

  // Eraser Target Filter Controls (Sync toolbar & left panel)
  initEraserControls() {
    const toolbarSelect = document.getElementById('toolbar-eraser-target');
    const panelSelect = document.getElementById('eraser-target-filter');

    const updateFilter = (val) => {
      AppState.eraserTarget = val;
      if (toolbarSelect) toolbarSelect.value = val;
      if (panelSelect) panelSelect.value = val;

      const labels = {
        all: 'すべて',
        objects: 'オブジェクトのみ',
        walls: '壁・開口部のみ',
        floors: '床のみ'
      };
      this.showToast(`消しゴム対象: ${labels[val] || val}`);
    };

    if (toolbarSelect) {
      toolbarSelect.onchange = (e) => updateFilter(e.target.value);
    }
    if (panelSelect) {
      panelSelect.onchange = (e) => updateFilter(e.target.value);
    }
  },

  // Toast Notification System
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }
};

if (typeof window !== 'undefined') window.App = App;
if (typeof global !== 'undefined') global.App = App;

// Bootstrap on DOM Ready
window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
