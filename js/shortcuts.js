/**
 * shortcuts.js - Keyboard Shortcuts & Customization System
 */

const ShortcutManager = {
  // Default Keybindings (Key code based)
  defaultBindings: {
    tool_select: { name: '選択ツール', key: 'v', code: 'KeyV' },
    tool_floor: { name: '床・壁塗りつぶし', key: 'f', code: 'KeyF' },
    tool_wall: { name: '交点壁ツール', key: 'w', code: 'KeyW' },
    tool_opening: { name: 'ドア・窓ツール', key: 'd', code: 'KeyD' },
    tool_eraser: { name: '消しゴム', key: 'e', code: 'KeyE' },
    tool_hand: { name: '手のひらツール', key: 'h', code: 'KeyH' },
    action_rotate: { name: '選択物の90°回転', key: 'r', code: 'KeyR' },
    action_delete: { name: '選択物の削除', key: 'Delete', code: 'Delete' },
    action_grid_toggle: { name: 'グリッド表示切替', key: 'g', code: 'KeyG' }
  },

  bindings: {},
  listeningActionKey: null,

  init() {
    this.loadBindings();
    this.initGlobalKeyListener();
    this.initModalEvents();
  },

  // Load from LocalStorage or default
  loadBindings() {
    try {
      const raw = localStorage.getItem('gridmap_shortcuts');
      if (raw) {
        this.bindings = Object.assign({}, this.defaultBindings, JSON.parse(raw));
      } else {
        this.bindings = JSON.parse(JSON.stringify(this.defaultBindings));
      }
    } catch (e) {
      this.bindings = JSON.parse(JSON.stringify(this.defaultBindings));
    }
  },

  saveBindings() {
    localStorage.setItem('gridmap_shortcuts', JSON.stringify(this.bindings));
  },

  // Global Keydown Listener
  initGlobalKeyListener() {
    window.addEventListener('keydown', (e) => {
      // Ignore if user is currently typing in an input or textarea
      const tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        return;
      }

      // If waiting for custom shortcut rebind
      if (this.listeningActionKey) {
        e.preventDefault();
        e.stopPropagation();
        this.rebindKey(this.listeningActionKey, e.key, e.code);
        return;
      }

      // Escape to cancel/reset selection, placement tool, modals, and eyedropper
      if (e.key === 'Escape') {
        let acted = false;

        // 1. Cancel eyedropper
        if (window.ColorManager && ColorManager.activeDropper) {
          ColorManager.stopEyedropper();
          acted = true;
        }

        // 2. Close any open modal
        document.querySelectorAll('.modal.active, .modal-overlay.active').forEach(m => {
          m.classList.remove('active');
          acted = true;
        });

        // 3. Clear active palette item / placement preview
        if (AppState.activePaletteItem) {
          AppState.activePaletteItem = null;
          AppState.activePaletteRotation = 0;
          if (window.HotbarManager) {
            HotbarManager.activeSlotIndex = -1;
            HotbarManager.render();
          }
          if (window.PaletteManager) PaletteManager.renderItems();
          acted = true;
        }

        // 4. Clear selections
        const hadSelection = (AppState.selectedObjectIds.size > 0 || AppState.selectedWallKeys.size > 0 ||
          AppState.selectedOpeningIds.size > 0 || AppState.selectedFloorKeys.size > 0);
        if (hadSelection) {
          AppState.selectedObjectIds.clear();
          AppState.selectedWallKeys.clear();
          AppState.selectedOpeningIds.clear();
          AppState.selectedFloorKeys.clear();
          acted = true;
        }

        // 5. If drawing tool is active, return to select tool
        if (AppState.currentTool !== 'select') {
          if (window.App) App.setTool('select', true);
          acted = true;
        }

        if (acted) {
          if (window.PaletteManager) PaletteManager.updatePropertyPanel();
          if (window.CanvasManager) CanvasManager.requestRender();
          if (window.App) App.showToast('選択・配置待機を解除しました');
        }
        return;
      }

      const ctrlOrCmd = e.ctrlKey || e.metaKey;

      // 1. System Shortcuts with Ctrl / Meta
      if (ctrlOrCmd) {
        if (e.code === 'KeyZ') {
          e.preventDefault();
          if (e.shiftKey) {
            AppState.redo();
          } else {
            AppState.undo();
          }
          return;
        } else if (e.code === 'KeyY') {
          e.preventDefault();
          AppState.redo();
          return;
        } else if (e.code === 'KeyC') {
          // Copy selected
          e.preventDefault();
          if (window.CanvasManager) CanvasManager.copySelected();
          return;
        } else if (e.code === 'KeyV') {
          // Paste
          e.preventDefault();
          if (window.CanvasManager) CanvasManager.pasteClipboard();
          return;
        } else if (e.code === 'KeyD') {
          // Duplicate
          e.preventDefault();
          if (window.CanvasManager) CanvasManager.duplicateSelected();
          return;
        } else if (e.code === 'KeyS') {
          // Quick JSON save
          e.preventDefault();
          if (window.ExportManager) ExportManager.saveMapJSON();
          return;
        }
      }

      // 2. Number Keys (1-9, 0) for Hotbar Quick Slots
      if (!ctrlOrCmd && !e.altKey && !e.shiftKey) {
        if (e.code.startsWith('Digit')) {
          const digit = parseInt(e.code.replace('Digit', ''), 10);
          const slotIndex = digit === 0 ? 9 : digit - 1;
          if (window.HotbarManager) {
            e.preventDefault();
            HotbarManager.triggerSlot(slotIndex);
            return;
          }
        }
      }

      // 3. User Customizable Shortcuts
      for (const [action, binding] of Object.entries(this.bindings)) {
        if (e.code === binding.code || e.key.toLowerCase() === binding.key.toLowerCase()) {
          e.preventDefault();
          this.executeAction(action);
          return;
        }
      }

      // Question mark (?) or Shift+/ to toggle Help Cheat Sheet Modal
      if ((e.key === '?' || (e.key === '/' && e.shiftKey)) && !ctrlOrCmd && !e.altKey) {
        e.preventDefault();
        this.toggleHelpModal();
        return;
      }

      // Standard Backspace/Delete fallback
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        if (window.CanvasManager) CanvasManager.deleteSelected();
      }
    });
  },

  // Execute Bound Action
  executeAction(action) {
    if (action === 'tool_select') {
      if (window.App) App.setTool('select');
    } else if (action === 'tool_floor') {
      if (window.App) App.setTool('floor');
    } else if (action === 'tool_wall') {
      if (window.App) App.setTool('wall');
    } else if (action === 'tool_opening') {
      if (window.App) App.setTool('opening');
    } else if (action === 'tool_eraser') {
      if (window.App) App.setTool('eraser');
    } else if (action === 'tool_hand') {
      if (window.App) App.setTool('hand');
    } else if (action === 'action_rotate') {
      const isOpeningMode = (AppState.currentTool === 'opening') ||
        (AppState.activePaletteItem && AppState.activePaletteItem.type === 'opening');

      if (isOpeningMode) {
        const item = AppState.activePaletteItem;
        const curSwing = (item && typeof item.flipSwing !== 'undefined')
          ? item.flipSwing
          : (AppState.openingStyle ? AppState.openingStyle.flipSwing : false);
        const nextSwing = !curSwing;
        if (item) item.flipSwing = nextSwing;
        if (AppState.openingStyle) AppState.openingStyle.flipSwing = nextSwing;
        if (window.App) App.showToast(nextSwing ? '開口部: 内開き (反転)' : '開口部: 外開き (標準)');
        if (window.PaletteManager) PaletteManager.updatePropertyPanel();
        if (window.CanvasManager) CanvasManager.requestRender();
      } else if (AppState.activePaletteItem) {
        AppState.activePaletteRotation = ((AppState.activePaletteRotation || 0) + 90) % 360;
        if (window.App) App.showToast(`配置前回転: ${AppState.activePaletteRotation}° (Rキー)`);
        if (window.PaletteManager) PaletteManager.updatePropertyPanel();
        if (window.CanvasManager) CanvasManager.requestRender();
      } else if (window.CanvasManager) {
        CanvasManager.rotateSelected();
      }
    } else if (action === 'action_delete') {
      if (window.CanvasManager) CanvasManager.deleteSelected();
    } else if (action === 'action_grid_toggle') {
      AppState.grid.showSnap = !AppState.grid.showSnap;
      if (window.CanvasManager) CanvasManager.requestRender();
      if (window.App) App.showToast(AppState.grid.showSnap ? 'グリッド補助線: 表示' : 'グリッド補助線: 非表示');
    }
  },

  // Render Shortcuts List in Modal
  renderModalList() {
    const container = document.getElementById('shortcuts-list');
    if (!container) return;

    container.innerHTML = '';
    for (const [action, binding] of Object.entries(this.bindings)) {
      const row = document.createElement('div');
      row.className = 'prop-row';
      row.style.justifyContent = 'space-between';

      const label = document.createElement('span');
      label.style.fontSize = '0.85rem';
      label.textContent = binding.name;

      const keyBtn = document.createElement('button');
      keyBtn.className = 'btn-secondary';
      keyBtn.style.minWidth = '80px';
      keyBtn.style.textTransform = 'uppercase';
      keyBtn.textContent = binding.key;

      keyBtn.onclick = () => {
        keyBtn.textContent = 'キーを押して…';
        keyBtn.style.borderColor = '#38bdf8';
        this.listeningActionKey = action;
      };

      row.appendChild(label);
      row.appendChild(keyBtn);
      container.appendChild(row);
    }
  },

  rebindKey(action, keyName, keyCode) {
    if (this.bindings[action]) {
      this.bindings[action].key = keyName.length === 1 ? keyName.toUpperCase() : keyName;
      this.bindings[action].code = keyCode;
      this.saveBindings();
    }
    this.listeningActionKey = null;
    this.renderModalList();
    if (window.App) App.showToast('ショートカットキーを更新しました', 'success');
  },

  initModalEvents() {
    const btnOpen = document.getElementById('btn-shortcuts');
    if (btnOpen) {
      btnOpen.onclick = () => {
        document.getElementById('modal-shortcuts').classList.add('active');
        this.renderModalList();
      };
    }

    const btnReset = document.getElementById('btn-reset-shortcuts');
    if (btnReset) {
      btnReset.onclick = () => {
        this.resetDefaults();
        if (window.App) App.showToast('ショートカットを初期値に戻しました');
      };
    }

    const btnHelp = document.getElementById('btn-help-shortcuts');
    if (btnHelp) {
      btnHelp.onclick = () => {
        this.toggleHelpModal();
      };
    }
  },

  // Toggle Help Cheat Sheet Modal
  toggleHelpModal() {
    const modal = document.getElementById('modal-help-shortcuts');
    if (!modal) return;
    if (modal.classList.contains('active')) {
      modal.classList.remove('active');
    } else {
      modal.classList.add('active');
    }
  },

  resetDefaults() {
    this.bindings = JSON.parse(JSON.stringify(this.defaultBindings));
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('gridmap_shortcuts');
      }
    } catch (e) {}
    if (typeof document !== 'undefined' && document.getElementById('shortcuts-list')) {
      this.renderModalList();
    }
  }
};

if (typeof window !== 'undefined') window.ShortcutManager = ShortcutManager;
if (typeof global !== 'undefined') global.ShortcutManager = ShortcutManager;
