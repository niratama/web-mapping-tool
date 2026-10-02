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
    if (window.SettingsManager) SettingsManager.init();
    if (window.ColorManager) ColorManager.init();

    // 2. Bind Toolbar & App Controls
    this.initToolbar();
    this.initGridSettingsModal();
    this.initPaintStyleControls();
    this.initEraserControls();
    this.initGoogleDriveControls();

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

  // Google Drive Cloud Manager Controls
  initGoogleDriveControls() {
    const btnOpenManager = document.getElementById('btn-gdrive-manager');
    const modalManager = document.getElementById('modal-gdrive-manager');
    const btnOpenSettings = document.getElementById('btn-open-gdrive-settings');
    const modalSettings = document.getElementById('modal-gdrive-settings');

    const btnLogin = document.getElementById('btn-gdrive-login');
    const btnLogout = document.getElementById('btn-gdrive-logout');
    const userNameEl = document.getElementById('gdrive-user-name');
    const statusIndicatorEl = document.getElementById('gdrive-status-indicator');
    const statusBox = document.getElementById('gdrive-status-box');

    // Tabs
    const tabBtns = document.querySelectorAll('#gdrive-modal-tabs .tab-btn[data-gtab]');
    const tabContents = {
      maps: document.getElementById('gtab-content-maps'),
      save: document.getElementById('gtab-content-save'),
      textures: document.getElementById('gtab-content-textures')
    };

    // Tab 1: Map List Elements
    const mapListContainer = document.getElementById('gdrive-map-list');
    const btnRefreshMaps = document.getElementById('btn-refresh-gdrive-maps');

    // Tab 2: Save Elements
    const currentFileInfoEl = document.getElementById('gdrive-current-file-info');
    const currentFileLabel = document.getElementById('gdrive-current-file-label');
    const inputFilename = document.getElementById('input-gdrive-filename');
    const btnSaveNew = document.getElementById('btn-gdrive-save-new');
    const btnSaveOverwrite = document.getElementById('btn-gdrive-save-overwrite');

    // Tab 3: Textures Elements
    const textureListContainer = document.getElementById('gdrive-texture-list');
    const btnRefreshTextures = document.getElementById('btn-refresh-gdrive-textures');
    const inputUploadTexture = document.getElementById('input-gdrive-upload-texture');
    const btnUploadSamples = document.getElementById('btn-gdrive-upload-samples');

    // Settings Modal Elements
    const inputClientId = document.getElementById('input-gdrive-client-id');
    const btnSaveClientId = document.getElementById('btn-save-gdrive-client-id');
    const btnResetClientId = document.getElementById('btn-reset-gdrive-client-id');

    const escapeHtml = (str) => {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    const showGdriveStatus = (msg, type = 'info') => {
      if (!statusBox) return;
      if (!msg) {
        statusBox.style.display = 'none';
        return;
      }
      statusBox.style.display = 'block';
      statusBox.textContent = msg;
      if (type === 'error') {
        statusBox.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
        statusBox.style.color = '#ef4444';
        statusBox.style.border = '1px solid #ef4444';
      } else if (type === 'success') {
        statusBox.style.backgroundColor = 'rgba(34, 197, 94, 0.15)';
        statusBox.style.color = '#22c55e';
        statusBox.style.border = '1px solid #22c55e';
      } else {
        statusBox.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
        statusBox.style.color = '#3b82f6';
        statusBox.style.border = '1px solid #3b82f6';
      }
    };

    const updateAuthUI = () => {
      if (typeof GoogleDriveManager === 'undefined') return;
      const isAuth = GoogleDriveManager.isAuthenticated();
      if (statusIndicatorEl) {
        statusIndicatorEl.className = `status-indicator ${isAuth ? 'online' : 'offline'}`;
      }
      if (userNameEl) {
        if (isAuth) {
          const user = GoogleDriveManager.currentUser;
          userNameEl.textContent = user?.name || user?.email || 'Google Drive 接続中';
        } else {
          userNameEl.textContent = '未接続';
        }
      }
      if (btnLogin) btnLogin.style.display = isAuth ? 'none' : 'inline-block';
      if (btnLogout) btnLogout.style.display = isAuth ? 'inline-block' : 'none';
      updateSaveTabUI();
    };

    const updateSaveTabUI = () => {
      const cur = AppState.currentDriveFile;
      if (cur && cur.name) {
        if (currentFileInfoEl) currentFileInfoEl.style.display = 'block';
        if (currentFileLabel) {
          const timeStr = cur.modifiedTime ? new Date(cur.modifiedTime).toLocaleTimeString() : '';
          currentFileLabel.textContent = `${cur.name}${timeStr ? ` (更新: ${timeStr})` : ''}`;
        }
        if (btnSaveOverwrite) btnSaveOverwrite.style.display = 'inline-block';
        if (inputFilename && (!inputFilename.value || inputFilename.value === 'my_map')) {
          inputFilename.value = cur.name.replace(/\.json$/i, '');
        }
      } else {
        if (currentFileInfoEl) currentFileInfoEl.style.display = 'none';
        if (btnSaveOverwrite) btnSaveOverwrite.style.display = 'none';
      }
    };

    const switchTab = (tabName) => {
      tabBtns.forEach(btn => {
        if (btn.dataset.gtab === tabName) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
      Object.keys(tabContents).forEach(key => {
        if (tabContents[key]) {
          tabContents[key].style.display = (key === tabName) ? 'block' : 'none';
        }
      });
      showGdriveStatus('');

      if (typeof GoogleDriveManager !== 'undefined' && GoogleDriveManager.isAuthenticated()) {
        if (tabName === 'maps') {
          renderMapList();
        } else if (tabName === 'save') {
          updateSaveTabUI();
        } else if (tabName === 'textures') {
          renderTextureList();
        }
      }
    };

    tabBtns.forEach(btn => {
      btn.onclick = () => switchTab(btn.dataset.gtab);
    });

    const renderMapList = async () => {
      if (!mapListContainer || typeof GoogleDriveManager === 'undefined') return;
      if (!GoogleDriveManager.isAuthenticated()) {
        mapListContainer.innerHTML = '<div class="gdrive-empty-msg">ログインすると、Google Drive 上の保存済みマップがここに表示されます。</div>';
        return;
      }

      mapListContainer.innerHTML = '<div class="gdrive-empty-msg">Google Drive からマップ一覧を読み込み中...</div>';
      showGdriveStatus('マップ一覧を取得しています...');

      try {
        const files = await GoogleDriveManager.listMapFiles();
        showGdriveStatus('');
        if (!files || files.length === 0) {
          mapListContainer.innerHTML = '<div class="gdrive-empty-msg">保存されたマップはありません。「マップを保存」タブから現在のマップを保存できます。</div>';
          return;
        }

        mapListContainer.innerHTML = '';
        files.forEach(file => {
          const item = document.createElement('div');
          item.className = 'gdrive-file-item';

          const isCurrent = AppState.currentDriveFile && AppState.currentDriveFile.fileId === file.id;
          const modTimeStr = file.modifiedTime ? new Date(file.modifiedTime).toLocaleString() : '不明';
          const sizeKb = file.size ? `${(file.size / 1024).toFixed(1)} KB` : '';

          item.innerHTML = `
            <div style="flex: 1; min-width: 0;">
              <div class="gdrive-file-name">
                <span>🗺️</span>
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(file.name)}</span>
                ${isCurrent ? '<span style="font-size: 0.7rem; background: var(--accent-color); color: #fff; padding: 1px 6px; border-radius: 10px; margin-left: 6px;">編集中</span>' : ''}
              </div>
              <div class="gdrive-file-meta">
                更新: ${modTimeStr} ${sizeKb ? `• ${sizeKb}` : ''}
              </div>
            </div>
            <div class="gdrive-file-actions">
              <button class="btn-primary btn-load-file" data-id="${file.id}" style="padding: 3px 8px; font-size: 0.75rem;">開く</button>
              <button class="btn-secondary btn-delete-file" data-id="${file.id}" style="padding: 3px 8px; font-size: 0.75rem; color: #ef4444;" title="削除">🗑️</button>
            </div>
          `;

          // Load file handler
          item.querySelector('.btn-load-file').onclick = async () => {
            if (!confirm(`マップ「${file.name}」を読み込みますか？\n（未保存の編集内容は破棄されます）`)) return;
            try {
              showGdriveStatus(`「${file.name}」をダウンロード中...`);
              const loaded = await GoogleDriveManager.loadMap(file.id);
              AppState.deserializeMapData(loaded.data);
              AppState.currentDriveFile = {
                fileId: loaded.fileId,
                name: loaded.name,
                modifiedTime: loaded.modifiedTime
              };
              CanvasManager.requestRender();
              AppState.saveToLocalStorage();
              modalManager.classList.remove('active');
              this.showToast(`「${loaded.name}」を Google Drive から読み込みました！`, 'success');
            } catch (err) {
              console.error('Load map failed:', err);
              showGdriveStatus(`読み込みエラー: ${err.message}`, 'error');
              this.showToast(`マップの読み込みに失敗しました: ${err.message}`, 'error');
            }
          };

          // Delete file handler
          item.querySelector('.btn-delete-file').onclick = async () => {
            if (!confirm(`本当に「${file.name}」を Google Drive から削除しますか？`)) return;
            try {
              showGdriveStatus(`「${file.name}」を削除中...`);
              await GoogleDriveManager.deleteFile(file.id);
              if (AppState.currentDriveFile?.fileId === file.id) {
                AppState.currentDriveFile = null;
                AppState.saveToLocalStorage();
              }
              this.showToast(`「${file.name}」を削除しました`);
              renderMapList();
            } catch (err) {
              console.error('Delete map failed:', err);
              showGdriveStatus(`削除エラー: ${err.message}`, 'error');
              this.showToast(`削除に失敗しました: ${err.message}`, 'error');
            }
          };

          mapListContainer.appendChild(item);
        });
      } catch (err) {
        console.error('List maps failed:', err);
        showGdriveStatus(`マップ一覧の取得に失敗しました: ${err.message}`, 'error');
        mapListContainer.innerHTML = `<div class="gdrive-empty-msg" style="color: #ef4444;">一覧の取得に失敗しました。<br>${escapeHtml(err.message)}</div>`;
      }
    };

    const renderTextureList = async () => {
      if (!textureListContainer || typeof GoogleDriveManager === 'undefined') return;
      if (!GoogleDriveManager.isAuthenticated()) {
        textureListContainer.innerHTML = '<div class="gdrive-empty-msg">ログインすると、Google Drive 上のテクスチャ画像がここに一覧表示されます。</div>';
        return;
      }

      textureListContainer.innerHTML = '<div class="gdrive-empty-msg">テクスチャ画像を取得中...</div>';
      showGdriveStatus('テクスチャ画像一覧を取得しています...');

      try {
        const files = await GoogleDriveManager.listTextureFiles();
        showGdriveStatus('');
        if (!files || files.length === 0) {
          textureListContainer.innerHTML = '<div class="gdrive-empty-msg" style="grid-column: 1 / -1;">テクスチャ画像はまだありません。「＋ 画像を追加」から PNG や JPG をアップロードできます。</div>';
          return;
        }

        textureListContainer.innerHTML = '';
        files.forEach(file => {
          const card = document.createElement('div');
          card.className = 'gdrive-texture-card';

          const thumbSrc = file.thumbnailLink || '';
          card.innerHTML = `
            ${thumbSrc ? `<img src="${thumbSrc}" class="gdrive-texture-thumb" alt="${escapeHtml(file.name)}">` : '<div class="gdrive-texture-thumb" style="display:flex;align-items:center;justify-content:center;font-size:1.4rem;">🖼️</div>'}
            <div class="gdrive-texture-title" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
            <div style="display: flex; gap: 4px; width: 100%; margin-top: 4px;">
              <button class="btn-secondary btn-apply-floor" style="flex: 1; padding: 2px 0; font-size: 0.68rem;" title="床テクスチャに設定">床</button>
              <button class="btn-secondary btn-apply-wall" style="flex: 1; padding: 2px 0; font-size: 0.68rem;" title="壁テクスチャに設定">壁</button>
              <button class="btn-secondary btn-del-tex" style="padding: 2px 4px; font-size: 0.68rem; color: #ef4444;" title="削除">🗑️</button>
            </div>
          `;

          // Apply to floor
          card.querySelector('.btn-apply-floor').onclick = async (e) => {
            e.stopPropagation();
            try {
              showGdriveStatus(`「${file.name}」を読み込み中...`);
              const dataUrl = await GoogleDriveManager.loadTextureAsDataUrl(file.id);
              AppState.paintStyle.floorTexture = dataUrl;
              const floorTexInput = document.getElementById('paint-floor-texture');
              if (floorTexInput) floorTexInput.value = dataUrl;
              CanvasManager.requestRender();
              AppState.saveToLocalStorage();
              showGdriveStatus('');
              this.showToast(`床テクスチャに「${file.name}」を適用しました！`, 'success');
            } catch (err) {
              console.error('Apply floor texture failed:', err);
              showGdriveStatus(`適用エラー: ${err.message}`, 'error');
              this.showToast(`テクスチャ適用に失敗しました: ${err.message}`, 'error');
            }
          };

          // Apply to wall
          card.querySelector('.btn-apply-wall').onclick = async (e) => {
            e.stopPropagation();
            try {
              showGdriveStatus(`「${file.name}」を読み込み中...`);
              const dataUrl = await GoogleDriveManager.loadTextureAsDataUrl(file.id);
              AppState.paintStyle.wallTexture = dataUrl;
              const wallTexInput = document.getElementById('paint-wall-texture');
              if (wallTexInput) wallTexInput.value = dataUrl;
              CanvasManager.requestRender();
              AppState.saveToLocalStorage();
              showGdriveStatus('');
              this.showToast(`壁テクスチャに「${file.name}」を適用しました！`, 'success');
            } catch (err) {
              console.error('Apply wall texture failed:', err);
              showGdriveStatus(`適用エラー: ${err.message}`, 'error');
              this.showToast(`テクスチャ適用に失敗しました: ${err.message}`, 'error');
            }
          };

          // Delete texture
          card.querySelector('.btn-del-tex').onclick = async (e) => {
            e.stopPropagation();
            if (!confirm(`テクスチャ画像「${file.name}」を削除しますか？`)) return;
            try {
              showGdriveStatus(`「${file.name}」を削除中...`);
              await GoogleDriveManager.deleteFile(file.id);
              this.showToast(`テクスチャ「${file.name}」を削除しました`);
              renderTextureList();
            } catch (err) {
              console.error('Delete texture failed:', err);
              showGdriveStatus(`削除エラー: ${err.message}`, 'error');
              this.showToast(`削除に失敗しました: ${err.message}`, 'error');
            }
          };

          textureListContainer.appendChild(card);
        });
      } catch (err) {
        console.error('List textures failed:', err);
        showGdriveStatus(`テクスチャ一覧の取得に失敗しました: ${err.message}`, 'error');
        textureListContainer.innerHTML = `<div class="gdrive-empty-msg" style="grid-column: 1 / -1; color: #ef4444;">一覧の取得に失敗しました。<br>${escapeHtml(err.message)}</div>`;
      }
    };

    if (inputUploadTexture) {
      inputUploadTexture.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          showGdriveStatus(`「${file.name}」をアップロード中...`);
          await GoogleDriveManager.uploadTextureFile(file.name, file);
          inputUploadTexture.value = '';
          showGdriveStatus('');
          this.showToast(`テクスチャ「${file.name}」をアップロードしました！`, 'success');
          renderTextureList();
        } catch (err) {
          console.error('Upload texture failed:', err);
          showGdriveStatus(`アップロードエラー: ${err.message}`, 'error');
          this.showToast(`アップロードに失敗しました: ${err.message}`, 'error');
        }
      };
    }

    if (btnUploadSamples) {
      btnUploadSamples.onclick = async () => {
        if (!GoogleDriveManager.isAuthenticated()) {
          this.showToast('サンプル登録の前に Google でログインしてください', 'warning');
          return;
        }

        const samples = [
          { name: 'wood_floor.jpg', path: 'assets/textures/wood_floor.jpg' },
          { name: 'stone_pavement.jpg', path: 'assets/textures/stone_pavement.jpg' },
          { name: 'marble_tile.jpg', path: 'assets/textures/marble_tile.jpg' },
          { name: 'dungeon_flagstone.jpg', path: 'assets/textures/dungeon_flagstone.jpg' },
          { name: 'tatami_mat.jpg', path: 'assets/textures/tatami_mat.jpg' },
          { name: 'persian_rug.jpg', path: 'assets/textures/persian_rug.jpg' },
          { name: 'magic_circle.jpg', path: 'assets/textures/magic_circle.jpg' },
          { name: 'ornate_chest.jpg', path: 'assets/textures/ornate_chest.jpg' },
          { name: 'stone_altar.jpg', path: 'assets/textures/stone_altar.jpg' }
        ];

        btnUploadSamples.disabled = true;
        showGdriveStatus('高品質サンプルテクスチャを Google Drive に一括登録中...');
        let uploadedCount = 0;

        try {
          for (const s of samples) {
            try {
              const res = await fetch(s.path);
              if (!res.ok) continue;
              const blob = await res.blob();
              await GoogleDriveManager.uploadTextureFile(s.name, blob);
              uploadedCount++;
            } catch (itemErr) {
              console.warn(`Failed to upload ${s.name}:`, itemErr);
            }
          }
          showGdriveStatus('');
          this.showToast(`サンプルテクスチャ ${uploadedCount} 件を Google Drive に登録しました！`, 'success');
          renderTextureList();
        } catch (err) {
          console.error('Upload samples failed:', err);
          showGdriveStatus(`サンプル登録エラー: ${err.message}`, 'error');
          this.showToast(`サンプル登録に失敗しました: ${err.message}`, 'error');
        } finally {
          btnUploadSamples.disabled = false;
        }
      };
    }

    // Save Handlers
    if (btnSaveNew) {
      btnSaveNew.onclick = async () => {
        if (!GoogleDriveManager.isAuthenticated()) {
          this.showToast('保存する前に Google でログインしてください', 'warning');
          return;
        }
        const fileName = (inputFilename?.value || '').trim() || 'my_map';
        try {
          showGdriveStatus(`「${fileName}」を Google Drive に保存中...`);
          btnSaveNew.disabled = true;
          const mapData = AppState.serializeMapData();
          const saved = await GoogleDriveManager.saveMap(fileName, mapData);
          AppState.currentDriveFile = {
            fileId: saved.id,
            name: saved.name,
            modifiedTime: saved.modifiedTime
          };
          AppState.saveToLocalStorage();
          showGdriveStatus('');
          this.showToast(`「${saved.name}」を Google Drive に新規保存しました！`, 'success');
          updateSaveTabUI();
        } catch (err) {
          console.error('Save new map failed:', err);
          showGdriveStatus(`保存エラー: ${err.message}`, 'error');
          this.showToast(`保存に失敗しました: ${err.message}`, 'error');
        } finally {
          btnSaveNew.disabled = false;
        }
      };
    }

    if (btnSaveOverwrite) {
      btnSaveOverwrite.onclick = async () => {
        if (!GoogleDriveManager.isAuthenticated()) {
          this.showToast('保存する前に Google でログインしてください', 'warning');
          return;
        }
        if (!AppState.currentDriveFile?.fileId) {
          this.showToast('対象のクラウドファイルが見つかりません。新規ファイルとして保存してください。', 'warning');
          return;
        }
        const fileName = (inputFilename?.value || '').trim() || AppState.currentDriveFile.name;
        if (!confirm(`「${AppState.currentDriveFile.name}」に上書き保存しますか？`)) return;

        try {
          showGdriveStatus(`「${fileName}」に上書き保存中...`);
          btnSaveOverwrite.disabled = true;
          const mapData = AppState.serializeMapData();
          const saved = await GoogleDriveManager.saveMap(fileName, mapData, AppState.currentDriveFile.fileId);
          AppState.currentDriveFile.name = saved.name;
          AppState.currentDriveFile.modifiedTime = saved.modifiedTime;
          AppState.saveToLocalStorage();
          showGdriveStatus('');
          this.showToast(`「${saved.name}」に上書き保存しました！`, 'success');
          updateSaveTabUI();
        } catch (err) {
          console.error('Overwrite map failed:', err);
          showGdriveStatus(`上書き保存エラー: ${err.message}`, 'error');
          this.showToast(`上書き保存に失敗しました: ${err.message}`, 'error');
        } finally {
          btnSaveOverwrite.disabled = false;
        }
      };
    }

    // Login / Logout Handlers
    if (btnLogin) {
      btnLogin.onclick = async () => {
        try {
          showGdriveStatus('Google アカウントで認証中...');
          btnLogin.disabled = true;
          await GoogleDriveManager.authenticate();
          updateAuthUI();
          showGdriveStatus('');
          this.showToast('Google Drive に接続しました！', 'success');
          renderMapList();
        } catch (err) {
          console.error('Google login failed:', err);
          if (err.message === 'CONFIG_REQUIRED') {
            showGdriveStatus('OAuth Client ID が未設定です。設定モーダルで入力してください。', 'error');
            if (modalSettings) {
              if (inputClientId) inputClientId.value = GoogleDriveManager.getClientId() || '';
              modalSettings.classList.add('active');
            }
          } else if (err.message === 'SDK_LOAD_FAILED') {
            showGdriveStatus('Google SDK の読み込みに失敗しました。ネットワークや広告ブロックをご確認ください。', 'error');
          } else {
            showGdriveStatus(`認証エラー: ${err.message}`, 'error');
          }
        } finally {
          btnLogin.disabled = false;
        }
      };
    }

    if (btnLogout) {
      btnLogout.onclick = () => {
        GoogleDriveManager.signOut();
        updateAuthUI();
        renderMapList();
        showGdriveStatus('');
        this.showToast('Google Drive からログアウトしました');
      };
    }

    if (btnRefreshMaps) {
      btnRefreshMaps.onclick = () => renderMapList();
    }
    if (btnRefreshTextures) {
      btnRefreshTextures.onclick = () => renderTextureList();
    }

    // Settings Modal Handlers
    if (btnOpenSettings && modalSettings) {
      btnOpenSettings.onclick = () => {
        if (inputClientId) inputClientId.value = GoogleDriveManager.getClientId() || '';
        modalSettings.classList.add('active');
      };
    }

    if (btnSaveClientId) {
      btnSaveClientId.onclick = () => {
        const val = inputClientId ? inputClientId.value.trim() : '';
        GoogleDriveManager.setCustomClientId(val);
        if (modalSettings) modalSettings.classList.remove('active');
        this.showToast(val ? 'Google Client ID を保存しました！' : 'Client ID を削除しました');
        updateAuthUI();
      };
    }

    if (btnResetClientId) {
      btnResetClientId.onclick = () => {
        if (inputClientId) inputClientId.value = '';
        GoogleDriveManager.setCustomClientId('');
        this.showToast('Client ID 設定をリセットしました');
        updateAuthUI();
      };
    }

    // Open Manager Modal Button
    if (btnOpenManager && modalManager) {
      btnOpenManager.onclick = () => {
        updateAuthUI();
        modalManager.classList.add('active');
        if (typeof GoogleDriveManager !== 'undefined' && GoogleDriveManager.isAuthenticated()) {
          const activeTabBtn = document.querySelector('#gdrive-modal-tabs .tab-btn.active');
          const tabName = activeTabBtn ? activeTabBtn.dataset.gtab : 'maps';
          if (tabName === 'maps') renderMapList();
          else if (tabName === 'textures') renderTextureList();
          else if (tabName === 'save') updateSaveTabUI();
        }
      };
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
