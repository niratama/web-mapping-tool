/**
 * state.js - Central State Management & Undo/Redo System
 */

const AppState = {
  // Grid Configuration
  grid: {
    visualCellSize: 40,  // Base visual grid size in px
    subdivisions: 2,     // Subdivisions for placement grid (default 1:2 -> 20px)
    showSnap: true,
    showOnFloor: true,   // Display grid lines on top of floors
    visualColor: '#334155',
    snapColor: '#1e293b'
  },

  // Map Data
  floors: new Map(), // key: `${col},${row}` -> { col, row, color, texture, textureData }
  walls: new Map(),  // key: `${x1},${y1}-${x2},${y2}` -> { id, x1, y1, x2, y2, thickness, color, texture, isManual }
  openings: [],      // [{ id, wallKey, x, y, type, width, rotation }]
  objects: [],       // [{ id, name, x, y, width, height, rotation, shapeType, cells, fillType, color, strokeColor, imageData, text, textColor, fontSize, zIndex }]

  // Viewport
  viewport: {
    panX: 0,
    panY: 0,
    zoom: 1.0
  },

  // Tools & Selection State
  currentTool: 'select', // 'select' | 'floor' | 'wall' | 'eraser' | 'hand'
  selectedObjectIds: new Set(),
  selectedWallKeys: new Set(),
  selectedFloorKeys: new Set(),
  selectedOpeningIds: new Set(),
  selectionBox: null, // { startX, startY, currentX, currentY } for rubberband

  // Active Placement Preview
  activePaletteItem: null,
  activePaletteRotation: 0, // 0, 90, 180, 270 degrees
  previewPosition: null, // { x, y } in world coordinates

  // Painting settings
  paintStyle: {
    floorColor: '#e2e8f0',
    floorTexture: 'none',
    floorFillMode: 'brush', // 'brush' | 'rect' | 'bucket'
    autoPerimeterWall: true,
    wallColor: '#1e293b',
    wallTexture: 'none'
  },

  // Opening (Door / Window) Tool Settings
  openingStyle: {
    type: 'door-single',
    width: 40,
    color: '#ca8a04',
    flipSwing: false,
    flipHinge: false
  },

  // Eraser target filter: 'all' | 'objects' | 'walls' | 'floors'
  eraserTarget: 'all',

  // Asset Library & Palette
  paletteGroups: [
    { id: 'basic', name: '基本パーツ' },
    { id: 'furniture', name: '家具・備品' },
    { id: 'openings', name: 'ドア・窓' },
    { id: 'dungeon', name: 'ダンジョン' },
    { id: 'custom', name: 'カスタム' }
  ],
  paletteItems: [],

  // Hotbar (Quick Slots 1-0)
  hotbar: Array(10).fill(null),

  // Clipboard for Copy / Paste
  clipboard: null,

  // History for Undo/Redo
  history: [],
  historyIndex: -1,
  maxHistory: 50,
  isPerformingHistoryAction: false,

  // Initialize Default State
  init() {
    this.initDefaultPalette();
    this.initDefaultHotbar();
    this.centerViewport();

    // 1. First restore from LocalStorage if available
    const hasRestored = this.loadFromLocalStorage();

    // 2. Set initial history without overwriting localStorage with empty state
    const initialSnapshot = JSON.stringify(this.serializeMapData());
    this.history = [{ name: hasRestored ? '復元データ' : '初期状態', snapshot: initialSnapshot }];
    this.historyIndex = 0;

    return hasRestored;
  },

  // Helper to center viewport
  centerViewport() {
    const canvas = document.getElementById('mapCanvas');
    if (canvas) {
      this.viewport.panX = canvas.width / 2;
      this.viewport.panY = canvas.height / 2;
    }
  },

  // Initialize Predefined Palette Items
  initDefaultPalette() {
    this.paletteItems = [
      // Basic shapes
      {
        id: 'item-rect-1x1',
        name: 'ブロック 1x1',
        group: 'basic',
        type: 'object',
        width: 20,
        height: 20,
        shapeType: 'rect',
        fillType: 'color',
        color: '#3b82f6',
        strokeColor: '#1d4ed8',
        text: '',
        textColor: '#ffffff',
        fontSize: 12
      },
      {
        id: 'item-rect-2x2',
        name: 'ブロック 2x2',
        group: 'basic',
        type: 'object',
        width: 40,
        height: 40,
        shapeType: 'rect',
        fillType: 'color',
        color: '#60a5fa',
        strokeColor: '#2563eb',
        text: '',
        textColor: '#ffffff',
        fontSize: 12
      },
      {
        id: 'item-l-shape',
        name: 'L字ブロック',
        group: 'basic',
        type: 'object',
        width: 40,
        height: 40,
        shapeType: 'cells',
        cells: [[1, 0], [1, 1]],
        fillType: 'color',
        color: '#8b5cf6',
        strokeColor: '#6d28d9',
        text: '',
        textColor: '#ffffff',
        fontSize: 12
      },

      // Furniture
      {
        id: 'item-desk',
        name: 'デスク',
        group: 'furniture',
        type: 'object',
        width: 60,
        height: 40,
        shapeType: 'rect',
        fillType: 'color',
        color: '#b45309',
        strokeColor: '#78350f',
        text: '机',
        textColor: '#fef3c7',
        fontSize: 13
      },
      {
        id: 'item-chair',
        name: 'オフィスチェア',
        group: 'furniture',
        type: 'object',
        width: 20,
        height: 20,
        shapeType: 'rect',
        fillType: 'color',
        color: '#475569',
        strokeColor: '#1e293b',
        text: '椅',
        textColor: '#ffffff',
        fontSize: 10
      },
      {
        id: 'item-conference',
        name: '大型会議テーブル',
        group: 'furniture',
        type: 'object',
        width: 120,
        height: 60,
        shapeType: 'rect',
        fillType: 'color',
        color: '#92400e',
        strokeColor: '#78350f',
        text: '会議机',
        textColor: '#fef3c7',
        fontSize: 14
      },
      {
        id: 'item-bed',
        name: 'ベッド',
        group: 'furniture',
        type: 'object',
        width: 40,
        height: 60,
        shapeType: 'rect',
        fillType: 'color',
        color: '#0284c7',
        strokeColor: '#0369a1',
        text: 'ベッド',
        textColor: '#ffffff',
        fontSize: 11
      },

      // Openings (Doors & Windows)
      {
        id: 'item-door-single',
        name: '片開きドア',
        group: 'openings',
        type: 'opening',
        openingType: 'door-single',
        width: 40, // 1 visual cell width
        color: '#ca8a04'
      },
      {
        id: 'item-door-double',
        name: '両開きドア',
        group: 'openings',
        type: 'opening',
        openingType: 'door-double',
        width: 40,
        color: '#ca8a04'
      },
      {
        id: 'item-window',
        name: '窓',
        group: 'openings',
        type: 'opening',
        openingType: 'window',
        width: 40,
        color: '#38bdf8'
      },
      {
        id: 'item-arch',
        name: '開口部（通路）',
        group: 'openings',
        type: 'opening',
        openingType: 'arch',
        width: 40,
        color: '#94a3b8'
      },

      // Dungeon items
      {
        id: 'item-chest',
        name: '宝箱',
        group: 'dungeon',
        type: 'object',
        width: 20,
        height: 20,
        shapeType: 'rect',
        fillType: 'color',
        color: '#eab308',
        strokeColor: '#a16207',
        text: '宝',
        textColor: '#000000',
        fontSize: 12
      },
      {
        id: 'item-pillar',
        name: '石柱',
        group: 'dungeon',
        type: 'object',
        width: 20,
        height: 20,
        shapeType: 'rect',
        fillType: 'color',
        color: '#64748b',
        strokeColor: '#334155',
        text: '柱',
        textColor: '#ffffff',
        fontSize: 11
      }
    ];

    this.loadCustomPaletteItems();
  },

  saveCustomPaletteItems() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('gridmap_custom_palette', JSON.stringify(this.paletteItems));
      }
    } catch (e) {
      console.warn('Failed to save custom palette:', e);
    }
  },

  loadCustomPaletteItems() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('gridmap_custom_palette');
        if (raw) {
          const items = JSON.parse(raw);
          if (Array.isArray(items) && items.length > 0) {
            this.paletteItems = items;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load custom palette:', e);
    }
  },

  // Initialize Default Hotbar Slots
  initDefaultHotbar() {
    this.hotbar[0] = this.paletteItems.find(i => i.id === 'item-rect-1x1');
    this.hotbar[1] = this.paletteItems.find(i => i.id === 'item-rect-2x2');
    this.hotbar[2] = this.paletteItems.find(i => i.id === 'item-desk');
    this.hotbar[3] = this.paletteItems.find(i => i.id === 'item-chair');
    this.hotbar[4] = this.paletteItems.find(i => i.id === 'item-door-single');
    this.hotbar[5] = this.paletteItems.find(i => i.id === 'item-window');
    this.hotbar[6] = this.paletteItems.find(i => i.id === 'item-chest');
  },

  // Serialization for Snapshot & Saving
  serializeMapData() {
    return {
      version: '1.0.0',
      timestamp: Date.now(),
      grid: { ...this.grid },
      floors: Array.from(this.floors.entries()),
      walls: Array.from(this.walls.entries()),
      openings: [...this.openings],
      objects: [...this.objects],
      paletteGroups: [...this.paletteGroups],
      paletteItems: [...this.paletteItems]
    };
  },

  // Deserialization
  deserializeMapData(data) {
    if (!data) return;

    if (data.grid) this.grid = { ...this.grid, ...data.grid };

    if (data.floors) {
      this.floors = new Map(data.floors);
    } else {
      this.floors.clear();
    }

    if (data.walls) {
      this.walls = new Map(data.walls);
    } else {
      this.walls.clear();
    }

    this.openings = Array.isArray(data.openings) ? data.openings : [];
    this.objects = Array.isArray(data.objects) ? data.objects : [];

    // Re-cache images for restored objects
    if (window.ObjectManager) {
      this.objects.forEach(obj => {
        if (obj.fillType === 'image' && obj.imageData) {
          ObjectManager.loadImage(obj);
        }
      });
    }

    if (data.paletteGroups && Array.isArray(data.paletteGroups)) {
      this.paletteGroups = data.paletteGroups;
    }
    if (data.paletteItems && Array.isArray(data.paletteItems)) {
      this.paletteItems = data.paletteItems;
    }

    this.selectedObjectIds.clear();
    this.selectedWallKeys.clear();
    this.selectedFloorKeys.clear();
    this.selectedOpeningIds.clear();

    if (window.PaletteManager) {
      if (PaletteManager.renderTabs) PaletteManager.renderTabs();
      if (PaletteManager.renderItems) PaletteManager.renderItems();
    }
    if (window.HotbarManager && HotbarManager.render) HotbarManager.render();
    if (window.CanvasManager && CanvasManager.requestRender) CanvasManager.requestRender();
  },

  // Undo / Redo History Management
  pushHistory(actionName = '操作') {
    if (this.isPerformingHistoryAction) return;

    // Truncate redo states
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    // Save snapshot
    const snapshot = JSON.stringify(this.serializeMapData());
    this.history.push({ name: actionName, snapshot });

    if (this.history.length > this.maxHistory) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }

    this.saveToLocalStorage();
  },

  undo() {
    if (this.historyIndex > 0) {
      this.isPerformingHistoryAction = true;
      this.historyIndex--;
      const state = JSON.parse(this.history[this.historyIndex].snapshot);
      this.deserializeMapData(state);
      this.isPerformingHistoryAction = false;
      this.saveToLocalStorage();
      return true;
    }
    return false;
  },

  redo() {
    if (this.historyIndex < this.history.length - 1) {
      this.isPerformingHistoryAction = true;
      this.historyIndex++;
      const state = JSON.parse(this.history[this.historyIndex].snapshot);
      this.deserializeMapData(state);
      this.isPerformingHistoryAction = false;
      this.saveToLocalStorage();
      return true;
    }
    return false;
  },

  canUndo() {
    return this.historyIndex > 0;
  },

  canRedo() {
    return this.historyIndex < this.history.length - 1;
  },

  // LocalStorage Auto-backup
  saveToLocalStorage() {
    try {
      const data = this.serializeMapData();
      localStorage.setItem('gridmap_autosave', JSON.stringify(data));
    } catch (e) {
      console.warn('LocalStorage save failed (quota exceeded or disabled):', e);
    }
  },

  loadFromLocalStorage() {
    try {
      const raw = localStorage.getItem('gridmap_autosave');
      if (raw) {
        const data = JSON.parse(raw);
        // Only consider restored if there is actual content or customized grid
        if (data && ((data.floors && data.floors.length > 0) || (data.walls && data.walls.length > 0) || (data.objects && data.objects.length > 0))) {
          this.deserializeMapData(data);
          return true;
        }
      }
    } catch (e) {
      console.warn('LocalStorage load failed:', e);
    }
    return false;
  },

  // Clear map data and reset LocalStorage
  clearLocalStorage() {
    try {
      localStorage.removeItem('gridmap_autosave');
    } catch (e) {}
    this.floors.clear();
    this.walls.clear();
    this.openings = [];
    this.objects = [];
    this.selectedObjectIds.clear();
    this.selectedWallKeys.clear();
    this.selectedFloorKeys.clear();
    this.selectedOpeningIds.clear();
    this.pushHistory('クリア');
    if (window.CanvasManager) CanvasManager.requestRender();
  }
};

if (typeof window !== 'undefined') window.AppState = AppState;
if (typeof global !== 'undefined') global.AppState = AppState;
