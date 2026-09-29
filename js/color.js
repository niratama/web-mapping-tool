/**
 * color.js - Preset Color Palettes & Eyedropper (Color Picker) System
 */

const ColorManager = {
  floorPresets: [
    { color: '#f8fafc', name: '白タイル' },
    { color: '#e2e8f0', name: '標準床（薄灰）' },
    { color: '#e2d5c3', name: 'ナチュラル木目' },
    { color: '#d4a373', name: 'オーク木目' },
    { color: '#8b5e3c', name: 'ダーク木目' },
    { color: '#859b72', name: '和室タタミ' },
    { color: '#94a3b8', name: '石畳グレー' },
    { color: '#475569', name: '濃石畳' },
    { color: '#be123c', name: 'カーペット赤' },
    { color: '#1d4ed8', name: 'カーペット青' },
    { color: '#1e293b', name: 'ダンジョン闇' }
  ],

  wallPresets: [
    { color: '#1e293b', name: '標準壁（スレート）' },
    { color: '#0f172a', name: 'チャコール黒壁' },
    { color: '#475569', name: '石壁グレー' },
    { color: '#78350f', name: '木壁ブラウン' },
    { color: '#991b1b', name: 'レンガ調レッド' },
    { color: '#e2e8f0', name: '白漆喰壁' }
  ],

  objectPresets: [
    { color: '#3b82f6', name: 'ブルー' },
    { color: '#10b981', name: 'グリーン' },
    { color: '#ef4444', name: 'レッド' },
    { color: '#f59e0b', name: 'ゴールド/黄' },
    { color: '#8b5cf6', name: 'パープル' },
    { color: '#b45309', name: '木製ブラウン' },
    { color: '#78350f', name: '濃木製' },
    { color: '#475569', name: 'スレート灰' },
    { color: '#1e293b', name: 'ブラック' },
    { color: '#ffffff', name: 'ホワイト' }
  ],

  openingPresets: [
    { color: '#ca8a04', name: '木製ドア（黄土）' },
    { color: '#38bdf8', name: '窓（スカイブルー）' },
    { color: '#94a3b8', name: '通路（グレー）' },
    { color: '#1e293b', name: 'アイアン（黒）' },
    { color: '#dc2626', name: 'アクセント赤' },
    { color: '#16a34a', name: 'アクセント緑' }
  ],

  strokePresets: [
    { color: '#1d4ed8', name: '濃青' },
    { color: '#0f172a', name: 'ブラック' },
    { color: '#1e293b', name: 'スレート黒' },
    { color: '#475569', name: 'スレート灰' },
    { color: '#94a3b8', name: 'ライトグレー' },
    { color: '#ffffff', name: 'ホワイト' },
    { color: '#b91c1c', name: '濃赤' },
    { color: '#15803d', name: '濃緑' },
    { color: '#b45309', name: '濃茶' },
    { color: '#6d28d9', name: '濃紫' },
    { color: '#ca8a04', name: '黄土' }
  ],

  textPresets: [
    { color: '#ffffff', name: '白' },
    { color: '#000000', name: '黒' },
    { color: '#1e293b', name: '濃墨' },
    { color: '#64748b', name: 'スレート灰' },
    { color: '#94a3b8', name: '薄灰' },
    { color: '#f59e0b', name: 'ゴールド/黄' },
    { color: '#ef4444', name: 'レッド' },
    { color: '#3b82f6', name: 'ブルー' },
    { color: '#10b981', name: 'グリーン' },
    { color: '#ca8a04', name: 'アンバー' }
  ],

  gridPresets: [
    { color: '#334155', name: '標準スレート' },
    { color: '#475569', name: '濃スレート' },
    { color: '#1e293b', name: 'ダーク' },
    { color: '#0f172a', name: '黒' },
    { color: '#64748b', name: 'グレー' },
    { color: '#94a3b8', name: 'ライトグレー' },
    { color: '#38bdf8', name: 'スカイブルー' },
    { color: '#ffffff', name: 'ホワイト' }
  ],

  // User-added custom presets (persisted in localStorage)
  customPresets: {
    floor: [],
    wall: [],
    object: [],
    opening: [],
    stroke: [],
    text: [],
    grid: []
  },

  // Active Eyedropper state
  activeDropper: null, // { targetInput, onPick, btnEl }

  init() {
    this.loadCustomPresets();
    this.initPaintPanelPresets();
    this.initModalPresets();
  },

  loadCustomPresets() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('gridmap_custom_colors');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            this.customPresets = parsed;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load custom color presets:', e);
    }
    if (!this.customPresets) {
      this.customPresets = { floor: [], wall: [], object: [], opening: [], stroke: [], text: [], grid: [] };
    }
    ['floor', 'wall', 'object', 'opening', 'stroke', 'text', 'grid'].forEach(cat => {
      if (!Array.isArray(this.customPresets[cat])) {
        this.customPresets[cat] = [];
      }
    });
  },

  saveCustomPresets() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('gridmap_custom_colors', JSON.stringify(this.customPresets));
      }
    } catch (e) {
      console.warn('Failed to save custom color presets:', e);
    }
  },

  addCustomColor(category, color, name = 'カスタム色') {
    if (!color || typeof color !== 'string') return false;
    const hex = color.trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/i.test(hex) && !/^#[0-9a-f]{3}$/i.test(hex)) return false;

    const cat = category || 'floor';
    if (!this.customPresets[cat]) this.customPresets[cat] = [];

    const builtIn = this[`${cat}Presets`] || [];
    const inBuiltIn = builtIn.some(p => p.color.toLowerCase() === hex);
    const inCustom = this.customPresets[cat].some(p => p.color.toLowerCase() === hex);

    if (inBuiltIn || inCustom) {
      return false; // Already present
    }

    this.customPresets[cat].push({ color: hex, name: name, custom: true });
    this.saveCustomPresets();
    return true;
  },

  removeCustomColor(category, color) {
    const cat = category || 'floor';
    if (!this.customPresets[cat]) return false;
    const hex = (color || '').trim().toLowerCase();
    const prevLen = this.customPresets[cat].length;
    this.customPresets[cat] = this.customPresets[cat].filter(p => p.color.toLowerCase() !== hex);
    if (this.customPresets[cat].length !== prevLen) {
      this.saveCustomPresets();
      return true;
    }
    return false;
  },

  // Setup swatches & eyedroppers in Floor/Wall Paint Style panel
  initPaintPanelPresets() {
    // 1. Floor Color
    const floorColorInput = document.getElementById('paint-floor-color');
    const floorPresetsContainer = document.getElementById('floor-color-presets');
    const floorEyedropperBtn = document.getElementById('btn-eyedropper-floor');

    if (floorPresetsContainer && floorColorInput) {
      this.renderSwatches(floorPresetsContainer, this.floorPresets, floorColorInput.value, (c) => {
        floorColorInput.value = c;
        AppState.paintStyle.floorColor = c;
        const valLabel = document.getElementById('paint-floor-color-val');
        if (valLabel) valLabel.textContent = c;
        if (window.CanvasManager) CanvasManager.requestRender();
      }, { category: 'floor', targetInput: floorColorInput });
    }

    if (floorEyedropperBtn && floorColorInput) {
      this.attachEyedropperButton(floorEyedropperBtn, floorColorInput, (c) => {
        AppState.paintStyle.floorColor = c;
        const valLabel = document.getElementById('paint-floor-color-val');
        if (valLabel) valLabel.textContent = c;
        if (floorPresetsContainer) {
          this.renderSwatches(floorPresetsContainer, this.floorPresets, c, (col) => {
            floorColorInput.value = col;
            AppState.paintStyle.floorColor = col;
            if (valLabel) valLabel.textContent = col;
          }, { category: 'floor', targetInput: floorColorInput });
        }
      });
    }

    // 2. Wall Color
    const wallColorInput = document.getElementById('paint-wall-color');
    const wallPresetsContainer = document.getElementById('wall-color-presets');
    const wallEyedropperBtn = document.getElementById('btn-eyedropper-wall');

    if (wallPresetsContainer && wallColorInput) {
      this.renderSwatches(wallPresetsContainer, this.wallPresets, wallColorInput.value, (c) => {
        wallColorInput.value = c;
        AppState.paintStyle.wallColor = c;
        const valLabel = document.getElementById('paint-wall-color-val');
        if (valLabel) valLabel.textContent = c;
        if (window.CanvasManager) CanvasManager.requestRender();
      }, { category: 'wall', targetInput: wallColorInput });
    }

    if (wallEyedropperBtn && wallColorInput) {
      this.attachEyedropperButton(wallEyedropperBtn, wallColorInput, (c) => {
        AppState.paintStyle.wallColor = c;
        const valLabel = document.getElementById('paint-wall-color-val');
        if (valLabel) valLabel.textContent = c;
        if (wallPresetsContainer) {
          this.renderSwatches(wallPresetsContainer, this.wallPresets, c, (col) => {
            wallColorInput.value = col;
            AppState.paintStyle.wallColor = col;
            if (valLabel) valLabel.textContent = col;
          }, { category: 'wall', targetInput: wallColorInput });
        }
      });
    }
  },

  // Setup swatches in modals (New Object & Grid Settings)
  initModalPresets() {
    // 1. Modal New Object: Color
    const objColorInput = document.getElementById('obj-create-color');
    const objColorPresets = document.getElementById('obj-create-color-presets');
    const objColorDropper = document.getElementById('btn-eyedropper-obj-create-color');
    if (objColorPresets && objColorInput) {
      this.renderSwatches(objColorPresets, this.objectPresets, objColorInput.value, (c) => {
        objColorInput.value = c;
      }, { category: 'object', targetInput: objColorInput });
    }
    if (objColorDropper && objColorInput) {
      this.attachEyedropperButton(objColorDropper, objColorInput, (c) => {
        objColorInput.value = c;
        if (objColorPresets) {
          this.renderSwatches(objColorPresets, this.objectPresets, c, (col) => {
            objColorInput.value = col;
          }, { category: 'object', targetInput: objColorInput });
        }
      });
    }

    // 2. Modal New Object: Stroke
    const objStrokeInput = document.getElementById('obj-create-stroke');
    const objStrokePresets = document.getElementById('obj-create-stroke-presets');
    const objStrokeDropper = document.getElementById('btn-eyedropper-obj-create-stroke');
    if (objStrokePresets && objStrokeInput) {
      this.renderSwatches(objStrokePresets, this.strokePresets, objStrokeInput.value, (c) => {
        objStrokeInput.value = c;
      }, { category: 'stroke', targetInput: objStrokeInput });
    }
    if (objStrokeDropper && objStrokeInput) {
      this.attachEyedropperButton(objStrokeDropper, objStrokeInput, (c) => {
        objStrokeInput.value = c;
        if (objStrokePresets) {
          this.renderSwatches(objStrokePresets, this.strokePresets, c, (col) => {
            objStrokeInput.value = col;
          }, { category: 'stroke', targetInput: objStrokeInput });
        }
      });
    }

    // 3. Modal New Object: Text Color
    const objTextcolorInput = document.getElementById('obj-create-textcolor');
    const objTextcolorPresets = document.getElementById('obj-create-textcolor-presets');
    const objTextcolorDropper = document.getElementById('btn-eyedropper-obj-create-textcolor');
    if (objTextcolorPresets && objTextcolorInput) {
      this.renderSwatches(objTextcolorPresets, this.textPresets, objTextcolorInput.value, (c) => {
        objTextcolorInput.value = c;
      }, { category: 'text', targetInput: objTextcolorInput });
    }
    if (objTextcolorDropper && objTextcolorInput) {
      this.attachEyedropperButton(objTextcolorDropper, objTextcolorInput, (c) => {
        objTextcolorInput.value = c;
        if (objTextcolorPresets) {
          this.renderSwatches(objTextcolorPresets, this.textPresets, c, (col) => {
            objTextcolorInput.value = col;
          }, { category: 'text', targetInput: objTextcolorInput });
        }
      });
    }

    // 4. Modal Grid Settings: Visual Grid Color
    const gridVisualInput = document.getElementById('grid-visual-color');
    const gridVisualPresets = document.getElementById('grid-visual-presets');
    if (gridVisualPresets && gridVisualInput) {
      this.renderSwatches(gridVisualPresets, this.gridPresets, gridVisualInput.value, (c) => {
        gridVisualInput.value = c;
        AppState.grid.visualColor = c;
        if (window.CanvasManager) CanvasManager.requestRender();
      }, { category: 'grid', targetInput: gridVisualInput });
    }

    // 5. Modal Grid Settings: Snap Grid Color
    const gridSnapInput = document.getElementById('grid-snap-color');
    const gridSnapPresets = document.getElementById('grid-snap-presets');
    if (gridSnapPresets && gridSnapInput) {
      this.renderSwatches(gridSnapPresets, this.gridPresets, gridSnapInput.value, (c) => {
        gridSnapInput.value = c;
        AppState.grid.snapColor = c;
        if (window.CanvasManager) CanvasManager.requestRender();
      }, { category: 'grid', targetInput: gridSnapInput });
    }
  },

  // Render a row of clickable preset color swatches
  renderSwatches(container, presets, currentColor, onSelect, options = {}) {
    if (!container) return;
    container.innerHTML = '';
    container.className = 'color-presets-row';

    // Infer category
    let category = options.category;
    if (!category) {
      if (presets === this.floorPresets || (container.id && container.id.includes('floor'))) category = 'floor';
      else if (presets === this.wallPresets || (container.id && container.id.includes('wall'))) category = 'wall';
      else if (presets === this.openingPresets || (container.id && (container.id.includes('op') || container.id.includes('opening')))) category = 'opening';
      else if (presets === this.strokePresets || (container.id && container.id.includes('stroke'))) category = 'stroke';
      else if (presets === this.textPresets || (container.id && (container.id.includes('text') || container.id.includes('font')))) category = 'text';
      else if (presets === this.gridPresets || (container.id && container.id.includes('grid'))) category = 'grid';
      else category = 'object';
    }

    // Infer or use targetInput
    let targetInput = options.targetInput;
    if (!targetInput && typeof document !== 'undefined') {
      if (container.id === 'floor-color-presets') targetInput = document.getElementById('paint-floor-color');
      else if (container.id === 'wall-color-presets') targetInput = document.getElementById('paint-wall-color');
      else if (container.id === 'obj-create-color-presets') targetInput = document.getElementById('obj-create-color');
      else if (container.id === 'obj-create-stroke-presets') targetInput = document.getElementById('obj-create-stroke');
      else if (container.id === 'obj-create-textcolor-presets') targetInput = document.getElementById('obj-create-textcolor');
      else if (container.id === 'prop-op-presets') targetInput = document.getElementById('prop-op-color');
      else if (container.id === 'prop-obj-presets') targetInput = document.getElementById('prop-obj-color');
      else if (container.id === 'prop-obj-stroke-presets') targetInput = document.getElementById('prop-obj-stroke');
      else if (container.id === 'prop-obj-textcolor-presets') targetInput = document.getElementById('prop-obj-textcolor');
      else if (container.id === 'grid-visual-presets') targetInput = document.getElementById('grid-visual-color');
      else if (container.id === 'grid-snap-presets') targetInput = document.getElementById('grid-snap-color');
    }

    const normalizedCurrent = (currentColor || '').toLowerCase();
    const builtInList = Array.isArray(presets) ? presets : (this[`${category}Presets`] || []);
    const customList = (this.customPresets && this.customPresets[category]) || [];

    // 1. Render Built-in Presets
    builtInList.forEach(p => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isMatch = p.color.toLowerCase() === normalizedCurrent;
      btn.className = 'color-swatch-btn' + (isMatch ? ' active' : '');
      btn.style.backgroundColor = p.color;
      btn.title = `${p.name} (${p.color.toUpperCase()})`;

      btn.onclick = (e) => {
        e.preventDefault();
        container.querySelectorAll('.color-swatch-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        onSelect(p.color);
      };

      container.appendChild(btn);
    });

    // 2. Render Divider & Custom Presets
    if (customList.length > 0) {
      const divider = document.createElement('div');
      divider.className = 'color-presets-divider';
      divider.title = 'ユーザー追加カラー';
      container.appendChild(divider);

      customList.forEach(p => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isMatch = p.color.toLowerCase() === normalizedCurrent;
        btn.className = 'color-swatch-btn custom' + (isMatch ? ' active' : '');
        btn.style.backgroundColor = p.color;
        btn.title = `カスタム色 (${p.color.toUpperCase()}) - 右クリックで削除`;

        btn.onclick = (e) => {
          e.preventDefault();
          container.querySelectorAll('.color-swatch-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          onSelect(p.color);
        };

        btn.oncontextmenu = (e) => {
          e.preventDefault();
          const shouldDelete = typeof window !== 'undefined' && window.confirm
            ? window.confirm(`カスタム色 ${p.color.toUpperCase()} をパレットから削除しますか？`)
            : true;
          if (shouldDelete) {
            ColorManager.removeCustomColor(category, p.color);
            if (typeof App !== 'undefined' && App.showToast) {
              App.showToast(`カスタム色 ${p.color.toUpperCase()} を削除しました`);
            }
            ColorManager.renderSwatches(container, presets, currentColor, onSelect, { category, targetInput });
          }
        };

        container.appendChild(btn);
      });
    }

    // 3. Render "+" Add Custom Color Button
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'color-add-btn';
    addBtn.innerHTML = '+';
    addBtn.title = '現在の色をパレットに追加 (＋)';

    addBtn.onclick = (e) => {
      e.preventDefault();
      const valToAdd = targetInput ? targetInput.value : (currentColor || '#ffffff');
      const added = ColorManager.addCustomColor(category, valToAdd);
      if (added) {
        if (typeof App !== 'undefined' && App.showToast) {
          App.showToast(`カラー ${valToAdd.toUpperCase()} をパレットに追加しました（右クリックで削除可能）`);
        }
        ColorManager.renderSwatches(container, presets, valToAdd, onSelect, { category, targetInput });
      } else {
        if (typeof App !== 'undefined' && App.showToast) {
          App.showToast(`色 ${valToAdd.toUpperCase()} は既にパレットに存在します`);
        }
      }
    };

    container.appendChild(addBtn);
  },

  // Attach Eyedropper activation to a button
  attachEyedropperButton(btnEl, inputEl, onPick) {
    if (!btnEl) return;
    btnEl.onclick = (e) => {
      e.preventDefault();
      if (this.activeDropper && this.activeDropper.btnEl === btnEl) {
        this.stopEyedropper();
      } else {
        this.startEyedropper(inputEl, onPick, btnEl);
      }
    };
  },

  // Activate canvas eyedropper sampling mode
  startEyedropper(targetInput, onPick, btnEl) {
    this.stopEyedropper();

    this.activeDropper = { targetInput, onPick, btnEl };
    if (btnEl) btnEl.classList.add('active');

    const canvas = document.getElementById('mapCanvas');
    if (canvas) {
      canvas.style.cursor = 'crosshair';
    }

    if (window.App) {
      App.showToast('スポイト有効: マップ上の床・壁・オブジェクトをクリックして色を取得 (Escで終了)');
    }
  },

  // Deactivate eyedropper mode
  stopEyedropper() {
    if (this.activeDropper && this.activeDropper.btnEl) {
      this.activeDropper.btnEl.classList.remove('active');
    }
    this.activeDropper = null;

    const canvas = document.getElementById('mapCanvas');
    if (canvas && window.App) {
      App.setTool(AppState.currentTool, false);
    }
  },

  // Sample color at a specific world coordinate
  sampleColorAt(worldX, worldY) {
    // 1. Check Objects (topmost first)
    const hitObj = (typeof ObjectManager !== 'undefined' && ObjectManager.findObjectAt)
      ? ObjectManager.findObjectAt(worldX, worldY)
      : null;
    if (hitObj) {
      return hitObj.color || '#3b82f6';
    }

    // 2. Check Openings (Doors / Windows)
    const hitOp = WallManager.findOpeningNearPoint(worldX, worldY, 18);
    if (hitOp) {
      return hitOp.color || '#ca8a04';
    }

    // 3. Check Walls
    const hitWall = WallManager.findWallNearPoint(worldX, worldY, 12);
    if (hitWall) {
      return hitWall.wall.color || '#1e293b';
    }

    // 4. Check Floor Cells
    const cell = GridManager.worldToCell(worldX, worldY);
    const key = WallManager.cellKey(cell.col, cell.row);
    if (AppState.floors.has(key)) {
      const f = AppState.floors.get(key);
      return f.color || AppState.paintStyle.floorColor;
    }

    // 5. Default Canvas Background color
    return '#0f172a';
  }
};

if (typeof window !== 'undefined') window.ColorManager = ColorManager;
if (typeof global !== 'undefined') global.ColorManager = ColorManager;
