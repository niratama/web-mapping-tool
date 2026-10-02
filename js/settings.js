/**
 * js/settings.js - Settings Import/Export & Environment Backup Manager
 * Allows exporting and importing of grid settings, keybindings, custom color presets,
 * custom palette items, and hotbar assignments into a single portable JSON file.
 */

const SettingsManager = {
  // Current loaded file data for staged import
  stagedSettingsData: null,

  init() {
    this.bindUI();
  },

  // 1. Gather all settings into a single exportable JSON object
  exportSettingsObject() {
    // Grid settings
    const grid = AppState.grid ? { ...AppState.grid } : {};

    // Paint & Wall settings
    const paintStyle = AppState.paintStyle ? { ...AppState.paintStyle } : {};

    // Keyboard shortcuts
    let shortcuts = {};
    if (typeof window !== 'undefined' && window.ShortcutManager && window.ShortcutManager.bindings) {
      shortcuts = { ...window.ShortcutManager.bindings };
    } else {
      try {
        const raw = localStorage.getItem('gridmap_shortcuts');
        if (raw) shortcuts = JSON.parse(raw);
      } catch (e) {}
    }

    // Custom color presets
    let customColors = { floor: [], wall: [], object: [], stroke: [], text: [], opening: [] };
    if (typeof window !== 'undefined' && window.ColorManager && window.ColorManager.customPresets) {
      customColors = JSON.parse(JSON.stringify(window.ColorManager.customPresets));
    } else {
      try {
        const raw = localStorage.getItem('gridmap_custom_colors');
        if (raw) customColors = JSON.parse(raw);
      } catch (e) {}
    }

    // Custom palette items
    let customPalette = [];
    try {
      const rawPalette = localStorage.getItem('gridmap_custom_palette');
      if (rawPalette) {
        customPalette = JSON.parse(rawPalette);
      } else if (AppState.paletteItems) {
        customPalette = [...AppState.paletteItems];
      }
    } catch (e) {}

    // Hotbar item IDs
    const hotbar = (AppState.hotbar || []).map(item => item ? item.id : null);

    // Google Drive Client ID
    let gdriveClientId = '';
    try {
      gdriveClientId = localStorage.getItem('gridmap_custom_gdrive_client_id') || '';
    } catch (e) {}

    return {
      app: 'GridMap Studio',
      type: 'settings',
      version: AppState.version || '1.2.0',
      exportedAt: new Date().toISOString(),
      settings: {
        grid,
        paintStyle,
        shortcuts,
        customColors,
        customPalette,
        hotbar,
        gdriveClientId
      }
    };
  },

  // 2. Download settings JSON file to user's computer
  downloadSettingsFile() {
    if (typeof document === 'undefined') return;

    const data = this.exportSettingsObject();
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const d = new Date();
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const filename = `gridmap_settings_${dateStr}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (window.App && App.showToast) {
      App.showToast(`設定ファイル「${filename}」を出力しました！`, 'success');
    }
  },

  // 3. Parse and validate imported settings object
  parseSettingsFile(jsonString) {
    let data;
    try {
      data = JSON.parse(jsonString);
    } catch (e) {
      throw new Error('JSONの構文解析に失敗しました。有効なJSONファイルではありません。');
    }

    if (!data || typeof data !== 'object') {
      throw new Error('設定データの形式が不正です。');
    }

    // Support both wrapper format { app: 'GridMap Studio', settings: {...} } and direct settings object
    const settings = data.settings || data;
    return {
      metadata: {
        app: data.app || 'GridMap Studio',
        version: data.version || 'unknown',
        exportedAt: data.exportedAt || null
      },
      settings
    };
  },

  // 4. Apply settings to the active application state
  applySettings(settings, options = {}) {
    if (!settings || typeof settings !== 'object') {
      throw new Error('適用可能な設定データが見つかりません。');
    }

    const opt = {
      grid: options.grid !== false,
      paintStyle: options.paintStyle !== false,
      shortcuts: options.shortcuts !== false,
      customColors: options.customColors !== false,
      customPalette: options.customPalette !== false,
      hotbar: options.hotbar !== false,
      gdriveClientId: options.gdriveClientId !== false
    };

    let appliedCount = 0;

    // A. Grid Settings
    if (opt.grid && settings.grid && typeof settings.grid === 'object') {
      AppState.grid = { ...AppState.grid, ...settings.grid };
      appliedCount++;
    }

    // B. Paint Style
    if (opt.paintStyle && settings.paintStyle && typeof settings.paintStyle === 'object') {
      AppState.paintStyle = { ...AppState.paintStyle, ...settings.paintStyle };
      appliedCount++;
    }

    // C. Keyboard Shortcuts
    if (opt.shortcuts && settings.shortcuts && typeof settings.shortcuts === 'object') {
      if (typeof window !== 'undefined' && window.ShortcutManager) {
        ShortcutManager.bindings = { ...ShortcutManager.defaultBindings, ...settings.shortcuts };
        ShortcutManager.saveBindings();
      } else {
        localStorage.setItem('gridmap_shortcuts', JSON.stringify(settings.shortcuts));
      }
      appliedCount++;
    }

    // D. Custom Colors
    if (opt.customColors && settings.customColors && typeof settings.customColors === 'object') {
      if (typeof window !== 'undefined' && window.ColorManager) {
        ColorManager.customPresets = { ...ColorManager.customPresets, ...settings.customColors };
        ColorManager.saveCustomPresets();
      } else {
        localStorage.setItem('gridmap_custom_colors', JSON.stringify(settings.customColors));
      }
      appliedCount++;
    }

    // E. Custom Palette Items
    if (opt.customPalette && Array.isArray(settings.customPalette)) {
      const existingMap = new Map((AppState.paletteItems || []).map(i => [i.id, i]));
      settings.customPalette.forEach(item => {
        if (item && item.id) {
          existingMap.set(item.id, item);
        }
      });
      AppState.paletteItems = Array.from(existingMap.values());
      AppState.saveCustomPaletteItems();

      if (typeof window !== 'undefined' && window.PaletteManager) {
        if (PaletteManager.renderTabs) PaletteManager.renderTabs();
        if (PaletteManager.renderItems) PaletteManager.renderItems();
      }
      appliedCount++;
    }

    // F. Hotbar Slots
    if (opt.hotbar && Array.isArray(settings.hotbar)) {
      settings.hotbar.slice(0, 10).forEach((itemId, idx) => {
        if (itemId) {
          const found = (AppState.paletteItems || []).find(i => i.id === itemId);
          AppState.hotbar[idx] = found || null;
        } else {
          AppState.hotbar[idx] = null;
        }
      });
      if (typeof window !== 'undefined' && window.HotbarManager && HotbarManager.render) {
        HotbarManager.render();
      }
      appliedCount++;
    }

    // G. Google Drive Client ID
    if (opt.gdriveClientId && settings.gdriveClientId) {
      if (typeof window !== 'undefined' && window.GoogleDriveManager) {
        GoogleDriveManager.setCustomClientId(settings.gdriveClientId);
      } else {
        localStorage.setItem('gridmap_custom_gdrive_client_id', settings.gdriveClientId);
      }
      appliedCount++;
    }

    // Sync views & persistence
    if (typeof window !== 'undefined') {
      if (window.CanvasManager && CanvasManager.requestRender) CanvasManager.requestRender();
      if (window.App && App.initGridSettingsModal) App.initGridSettingsModal();
      if (window.App && App.initPaintStyleControls) App.initPaintStyleControls();
    }
    AppState.saveToLocalStorage();

    return { success: true, appliedCount };
  },

  // 5. Reset all user settings to default
  resetAllSettings() {
    try {
      localStorage.removeItem('gridmap_shortcuts');
      localStorage.removeItem('gridmap_custom_colors');
      localStorage.removeItem('gridmap_custom_palette');
      localStorage.removeItem('gridmap_custom_gdrive_client_id');
    } catch (e) {
      console.warn('LocalStorage clear error:', e);
    }

    // Reset Shortcuts
    if (typeof window !== 'undefined' && window.ShortcutManager) {
      if (typeof window.ShortcutManager.resetDefaults === 'function') {
        window.ShortcutManager.resetDefaults();
      } else {
        window.ShortcutManager.bindings = JSON.parse(JSON.stringify(window.ShortcutManager.defaultBindings || {}));
        if (window.ShortcutManager.saveBindings) window.ShortcutManager.saveBindings();
      }
    }

    // Reset Colors
    if (typeof window !== 'undefined' && window.ColorManager) {
      ColorManager.customPresets = { floor: [], wall: [], object: [], stroke: [], text: [], opening: [] };
    }

    // Reset Grid
    AppState.grid = {
      visualCellSize: 40,
      subdivisions: 2,
      visualColor: '#334155',
      snapColor: '#1e293b',
      showSnap: true,
      showOnFloor: true
    };

    // Reset Paint Style
    AppState.paintStyle = {
      floorColor: '#e2e8f0',
      floorTexture: 'none',
      wallColor: '#0f172a',
      wallTexture: 'solid',
      autoWall: true
    };

    // Reset Palette & Hotbar
    AppState.initDefaultPalette();
    AppState.initDefaultHotbar();

    // Re-render
    if (typeof window !== 'undefined') {
      if (window.CanvasManager && CanvasManager.requestRender) CanvasManager.requestRender();
      if (window.PaletteManager) {
        if (PaletteManager.renderTabs) PaletteManager.renderTabs();
        if (PaletteManager.renderItems) PaletteManager.renderItems();
      }
      if (window.HotbarManager && HotbarManager.render) HotbarManager.render();
      if (window.App && App.initGridSettingsModal) App.initGridSettingsModal();
      if (window.App && App.initPaintStyleControls) App.initPaintStyleControls();
    }

    AppState.saveToLocalStorage();
  },

  // 6. Bind Modal UI Controls
  bindUI() {
    const btnOpen = document.getElementById('btn-settings-manager');
    const modal = document.getElementById('modal-settings-manager');
    const btnExport = document.getElementById('btn-export-settings');
    const btnSelectFile = document.getElementById('btn-select-settings-file');
    const inputImport = document.getElementById('input-import-settings');
    const btnApplyImport = document.getElementById('btn-apply-import-settings');
    const btnResetAll = document.getElementById('btn-reset-all-settings');
    const importPreviewBox = document.getElementById('settings-import-preview-box');
    const importMetaText = document.getElementById('settings-import-meta');

    // Checkboxes
    const chkGrid = document.getElementById('chk-import-grid');
    const chkPaint = document.getElementById('chk-import-paint');
    const chkShortcuts = document.getElementById('chk-import-shortcuts');
    const chkColors = document.getElementById('chk-import-colors');
    const chkPalette = document.getElementById('chk-import-palette');
    const chkHotbar = document.getElementById('chk-import-hotbar');

    if (btnOpen && modal) {
      btnOpen.onclick = () => {
        this.stagedSettingsData = null;
        if (importPreviewBox) importPreviewBox.style.display = 'none';
        if (btnApplyImport) btnApplyImport.disabled = true;
        if (inputImport) inputImport.value = '';
        modal.classList.add('active');
      };
    }

    if (btnExport) {
      btnExport.onclick = () => {
        this.downloadSettingsFile();
      };
    }

    if (btnSelectFile && inputImport) {
      btnSelectFile.onclick = () => {
        inputImport.click();
      };
    }

    if (inputImport) {
      inputImport.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const parsed = this.parseSettingsFile(event.target.result);
            this.stagedSettingsData = parsed.settings;

            if (importPreviewBox) {
              importPreviewBox.style.display = 'block';
            }
            if (importMetaText) {
              const meta = parsed.metadata;
              const dateStr = meta.exportedAt ? new Date(meta.exportedAt).toLocaleString() : '不明';
              importMetaText.textContent = `ファイル: ${file.name} (出力日時: ${dateStr}, バージョン: ${meta.version})`;
            }

            // Enable categories based on contents
            if (chkGrid) chkGrid.checked = !!parsed.settings.grid;
            if (chkPaint) chkPaint.checked = !!parsed.settings.paintStyle;
            if (chkShortcuts) chkShortcuts.checked = !!(parsed.settings.shortcuts && Object.keys(parsed.settings.shortcuts).length > 0);
            if (chkColors) chkColors.checked = !!(parsed.settings.customColors && Object.keys(parsed.settings.customColors).length > 0);
            if (chkPalette) chkPalette.checked = !!(parsed.settings.customPalette && parsed.settings.customPalette.length > 0);
            if (chkHotbar) chkHotbar.checked = !!(parsed.settings.hotbar && parsed.settings.hotbar.length > 0);

            if (btnApplyImport) btnApplyImport.disabled = false;

            if (window.App && App.showToast) {
              App.showToast(`「${file.name}」を読み込みました。インポートする項目を選択してください。`, 'info');
            }
          } catch (err) {
            console.error('Settings parse error:', err);
            if (window.App && App.showToast) {
              App.showToast(`設定ファイルの読み込みに失敗しました: ${err.message}`, 'error');
            }
          }
        };
        reader.readAsText(file);
      };
    }

    if (btnApplyImport) {
      btnApplyImport.onclick = () => {
        if (!this.stagedSettingsData) return;

        const options = {
          grid: chkGrid ? chkGrid.checked : true,
          paintStyle: chkPaint ? chkPaint.checked : true,
          shortcuts: chkShortcuts ? chkShortcuts.checked : true,
          customColors: chkColors ? chkColors.checked : true,
          customPalette: chkPalette ? chkPalette.checked : true,
          hotbar: chkHotbar ? chkHotbar.checked : true
        };

        try {
          const result = this.applySettings(this.stagedSettingsData, options);
          if (modal) modal.classList.remove('active');
          if (window.App && App.showToast) {
            App.showToast(`設定を復元しました！（${result.appliedCount} 項目適用）`, 'success');
          }
        } catch (err) {
          console.error('Settings apply error:', err);
          if (window.App && App.showToast) {
            App.showToast(`設定の適用に失敗しました: ${err.message}`, 'error');
          }
        }
      };
    }

    if (btnResetAll) {
      btnResetAll.onclick = () => {
        if (confirm('すべての設定（グリッド、ショートカットキー、カスタムカラー、追加パーツ等）を工場出荷時の初期値にリセットしますか？\n（現在のマップ作図データ自体は保持されます）')) {
          this.resetAllSettings();
          if (modal) modal.classList.remove('active');
          if (window.App && App.showToast) {
            App.showToast('すべての設定を初期値にリセットしました！', 'info');
          }
        }
      };
    }
  }
};

// Global export for browser & tests
if (typeof window !== 'undefined') window.SettingsManager = SettingsManager;
if (typeof global !== 'undefined') global.SettingsManager = SettingsManager;
