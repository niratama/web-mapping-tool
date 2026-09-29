/**
 * hotbar.js - Quick Access Hotbar (Slots 1-0)
 */

const HotbarManager = {
  activeSlotIndex: -1,

  init() {
    this.render();
    this.initHotbarDnD();
  },

  // Render 10 slots
  render() {
    const container = document.getElementById('hotbar-container');
    if (!container) return;

    container.innerHTML = '';

    for (let i = 0; i < 10; i++) {
      const slotNumber = (i + 1) % 10; // 1, 2, 3, 4, 5, 6, 7, 8, 9, 0
      const item = AppState.hotbar[i];

      const slotEl = document.createElement('div');
      slotEl.className = `hotbar-slot ${this.activeSlotIndex === i ? 'active' : ''}`;
      slotEl.dataset.slotIndex = i;
      slotEl.title = item ? `[${slotNumber}] ${item.name}` : `[${slotNumber}] 空きスロット (アイテムをドラッグして登録)`;

      // Key badge (1-0)
      const keyBadge = document.createElement('span');
      keyBadge.className = 'hotbar-slot-key';
      keyBadge.textContent = slotNumber;
      slotEl.appendChild(keyBadge);

      // Thumbnail
      if (item) {
        const preview = document.createElement('div');
        preview.className = 'hotbar-slot-preview';
        PaletteManager.generateItemThumbnail(preview, item);
        slotEl.appendChild(preview);
      }

      // Slot Click -> Activate
      slotEl.onclick = () => {
        this.triggerSlot(i);
      };

      container.appendChild(slotEl);
    }
  },

  // Trigger Slot via Click or Keyboard (1-0)
  triggerSlot(index) {
    const item = AppState.hotbar[index];
    if (!item) return;

    if (this.activeSlotIndex === index && AppState.activePaletteItem === item) {
      // Toggle off
      this.activeSlotIndex = -1;
      AppState.activePaletteItem = null;
    } else {
      this.activeSlotIndex = index;
      AppState.activePaletteItem = item;
      if (item.type === 'opening') {
        if (AppState.currentTool !== 'opening') {
          if (window.App) App.setTool('opening', false);
        }
      } else {
        if (AppState.currentTool !== 'select') {
          if (window.App) App.setTool('select', false);
        }
      }
    }

    this.render();
    if (window.PaletteManager) PaletteManager.renderItems();
    if (window.CanvasManager) CanvasManager.requestRender();
  },

  // Drag & Drop to Hotbar Slots
  initHotbarDnD() {
    const container = document.getElementById('hotbar-container');
    if (!container) return;

    container.ondragover = (e) => {
      e.preventDefault();
      const targetSlot = e.target.closest('.hotbar-slot');
      if (targetSlot) {
        targetSlot.style.borderColor = '#38bdf8';
      }
    };

    container.ondragleave = (e) => {
      const targetSlot = e.target.closest('.hotbar-slot');
      if (targetSlot) {
        targetSlot.style.borderColor = '';
      }
    };

    container.ondrop = (e) => {
      e.preventDefault();
      const targetSlot = e.target.closest('.hotbar-slot');
      if (targetSlot) {
        targetSlot.style.borderColor = '';
        const slotIdx = parseInt(targetSlot.dataset.slotIndex, 10);
        try {
          const raw = e.dataTransfer.getData('text/plain');
          if (raw) {
            const item = JSON.parse(raw);
            AppState.hotbar[slotIdx] = item;
            this.render();
            if (window.App) App.showToast(`スロット ${(slotIdx + 1) % 10} に「${item.name}」を登録しました`, 'success');
          }
        } catch (err) {
          console.error(err);
        }
      }
    };
  }
};

if (typeof window !== 'undefined') window.HotbarManager = HotbarManager;
if (typeof global !== 'undefined') global.HotbarManager = HotbarManager;
