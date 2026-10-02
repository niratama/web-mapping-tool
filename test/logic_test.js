/**
 * logic_test.js - Automated unit tests for GridMap Studio core logic
 */

const assert = require('assert');

// Mock browser globals
global.window = {
  confirm: () => true,
  alert: () => {},
  _listeners: {},
  addEventListener(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  },
  removeEventListener(event, fn) {
    if (this._listeners[event]) {
      this._listeners[event] = this._listeners[event].filter(f => f !== fn);
    }
  },
  dispatchEvent(eventObj) {
    const list = this._listeners[eventObj.type] || [];
    list.forEach(fn => fn(eventObj));
  }
};
global.document = {
  getElementById: () => null,
  querySelectorAll: () => [],
  createElement: () => ({
    style: {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    appendChild: () => {},
    querySelectorAll: () => [],
    click: () => {}
  })
};
global.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = v; },
  removeItem(k) { delete this.store[k]; }
};

// Load modules in order
require('../js/state.js');
require('../js/grid.js');
require('../js/walls.js');
require('../js/objects.js');
require('../js/color.js');
require('../js/export.js');
require('../js/settings.js');
require('../js/gdrive.js');
require('../js/palette.js');
require('../js/shortcuts.js');
require('../js/canvas.js');
require('../js/app.js');

console.log('=== Running GridMap Studio Core Logic Tests ===\n');

// Test 1: Grid Calculations
{
  console.log('Test 1: Grid Coordinate & Snap Math');
  AppState.grid.visualCellSize = 40;
  AppState.grid.subdivisions = 2; // Snap unit = 20px

  assert.strictEqual(GridManager.getSnapUnit(), 20, 'Snap unit should be 20px');

  const snap1 = GridManager.snapToPlacementGrid(18, 43);
  assert.strictEqual(snap1.x, 20, '18px should snap to 20px');
  assert.strictEqual(snap1.y, 40, '43px should snap to 40px');

  const cell = GridManager.worldToCell(55, 95);
  assert.strictEqual(cell.col, 1, '55px should be col 1');
  assert.strictEqual(cell.row, 2, '95px should be row 2');

  const worldPos = GridManager.cellToWorld(2, 3);
  assert.strictEqual(worldPos.x, 80, 'Col 2 should be 80px');
  assert.strictEqual(worldPos.y, 120, 'Row 3 should be 120px');
  console.log('✔ Test 1 Passed!\n');
}

// Test 2: Floor Painting & Automatic Perimeter Wall Generation
{
  console.log('Test 2: Auto Perimeter Wall Generation on Floor Paint');
  AppState.floors.clear();
  AppState.walls.clear();

  // Single cell (0, 0)
  WallManager.setFloor(0, 0);
  assert.strictEqual(AppState.floors.size, 1, 'Floors should have 1 cell');
  assert.strictEqual(AppState.walls.size, 4, 'Single 1x1 cell must have 4 perimeter walls');

  // Add adjacent cell (1, 0) -> Form a 2x1 room
  WallManager.setFloor(1, 0);
  assert.strictEqual(AppState.floors.size, 2, 'Floors should have 2 cells');
  // Shared edge between (0,0) and (1,0) should NOT be a wall!
  // Outer perimeter of 2x1 cells has (2 + 1) * 2 = 6 edges
  assert.strictEqual(AppState.walls.size, 6, '2x1 cells should have 6 perimeter walls (shared internal edge removed)');

  // Verify internal edge is indeed absent
  const internalEdge = WallManager.normalizeEdge(40, 0, 40, 40);
  assert.strictEqual(AppState.walls.has(internalEdge.key), false, 'Internal shared edge must not be a perimeter wall');

  // Add cell (0, 1) and (1, 1) -> Form a 2x2 room
  WallManager.setFloor(0, 1);
  WallManager.setFloor(1, 1);
  assert.strictEqual(AppState.floors.size, 4, 'Floors should have 4 cells');
  // Outer perimeter of 2x2 has 2*4 = 8 edges
  assert.strictEqual(AppState.walls.size, 8, '2x2 room must have 8 outer perimeter walls');

  // Test erasing a floor cell: remove (1, 1) -> L-shaped room (3 cells)
  WallManager.removeFloor(1, 1);
  assert.strictEqual(AppState.floors.size, 3, 'Floors should have 3 cells');
  // L-shaped 3 cells has 8 perimeter edges
  assert.strictEqual(AppState.walls.size, 8, 'L-shape room must have 8 perimeter walls');

  console.log('✔ Test 2 Passed!\n');
}

// Test 3: Object Hit Testing & Transformations
{
  console.log('Test 3: Object Hit Testing & Rotation');
  AppState.objects = [];

  const rectObj = ObjectManager.createObject({
    name: 'Desk',
    width: 60,
    height: 40,
    shapeType: 'rect'
  }, 100, 100);

  // Inside test
  assert.strictEqual(ObjectManager.hitTest(rectObj, 120, 120), true, 'Point (120, 120) should hit rect');
  // Outside test
  assert.strictEqual(ObjectManager.hitTest(rectObj, 80, 120), false, 'Point (80, 120) should miss rect');
  assert.strictEqual(ObjectManager.hitTest(rectObj, 170, 120), false, 'Point (170, 120) should miss rect');

  // Rotate 90 degrees
  ObjectManager.rotateObject(rectObj, true);
  assert.strictEqual(rectObj.rotation, 90, 'Rotation should be 90 degrees');

  // Cells shape (L-shape)
  const lShapeObj = ObjectManager.createObject({
    name: 'L-Block',
    width: 40,
    height: 40,
    shapeType: 'cells',
    cells: [[1, 0], [1, 1]] // Top-right is empty!
  }, 200, 200);

  // Top-left (205, 205) should be hit
  assert.strictEqual(ObjectManager.hitTest(lShapeObj, 205, 205), true, 'Top-left cell should be hit');
  // Top-right (235, 205) should be empty/miss!
  assert.strictEqual(ObjectManager.hitTest(lShapeObj, 235, 205), false, 'Top-right cell is empty and should miss');
  // Bottom-right (235, 235) should be hit
  assert.strictEqual(ObjectManager.hitTest(lShapeObj, 235, 235), true, 'Bottom-right cell should be hit');

  console.log('✔ Test 3 Passed!\n');
}

// Test 4: Serialization & Deserialization
{
  console.log('Test 4: State Serialization & Deserialization');
  const serialized = AppState.serializeMapData();
  assert.ok(serialized.version, 'Serialized data must have version');
  assert.ok(Array.isArray(serialized.floors), 'Serialized floors must be an array');
  assert.ok(Array.isArray(serialized.walls), 'Serialized walls must be an array');
  assert.ok(Array.isArray(serialized.objects), 'Serialized objects must be an array');

  // Clear and deserialize
  AppState.floors.clear();
  AppState.walls.clear();
  AppState.objects = [];

  AppState.deserializeMapData(serialized);
  assert.strictEqual(AppState.floors.size, 3, 'Deserialized floors count must match');
  assert.strictEqual(AppState.walls.size, 8, 'Deserialized walls count must match');
  assert.strictEqual(AppState.objects.length, 2, 'Deserialized objects count must match');

  console.log('✔ Test 4 Passed!\n');
}

// Test 5: Bounding Box Calculation
{
  console.log('Test 5: Bounding Box Calculation');
  const box = ExportManager.calculateBoundingBox(2);
  assert.ok(box.width > 0, 'Bounding box width must be positive');
  assert.ok(box.height > 0, 'Bounding box height must be positive');
  assert.ok(box.minX <= 0, 'Bounding box minX with padding must encompass (0,0)');
  console.log('✔ Test 5 Passed!\n');
}

// Test 6: Eraser Target Filtering
{
  console.log('Test 6: Eraser Target Filtering (Objects Only vs Walls Only vs Floors Only)');
  AppState.floors.clear();
  AppState.walls.clear();
  AppState.objects = [];

  // Setup: 1 floor cell at (0, 0), with auto wall, and 1 object on top of it
  WallManager.setFloor(0, 0); // has 4 walls
  const obj = ObjectManager.createObject({ name: 'Chair', width: 20, height: 20 }, 10, 10);

  assert.strictEqual(AppState.objects.length, 1);
  assert.strictEqual(AppState.walls.size, 4);
  assert.strictEqual(AppState.floors.size, 1);

  // 1. Eraser mode: objects only
  AppState.eraserTarget = 'objects';
  // Erase at object location
  CanvasManager.eraseAt(obj.x + 5, obj.y + 5);
  assert.strictEqual(AppState.objects.length, 0, 'Object should be erased');
  assert.strictEqual(AppState.walls.size, 4, 'Walls must remain intact');
  assert.strictEqual(AppState.floors.size, 1, 'Floor must remain intact');

  // Re-add object
  const newObj = ObjectManager.createObject({ name: 'Chair', width: 20, height: 20 }, 20, 20);

  // 2. Eraser mode: walls only
  AppState.eraserTarget = 'walls';
  // Erase near top wall edge (20, 0)
  CanvasManager.eraseAt(20, 0);
  assert.strictEqual(AppState.objects.length, 1, 'Object must be protected and remain');
  assert.strictEqual(AppState.walls.size, 3, 'One wall segment should be erased');
  assert.strictEqual(AppState.floors.size, 1, 'Floor cell should remain');

  console.log('✔ Test 6 Passed!\n');
}

// Test 7: Reload & LocalStorage Auto-Restore Simulation
{
  console.log('Test 7: Reload & LocalStorage Persistence/Restoration');
  // 1. Setup sample map content
  AppState.floors.clear();
  AppState.walls.clear();
  AppState.objects = [];

  WallManager.setFloor(2, 2);
  WallManager.setFloor(3, 2);
  ObjectManager.createObject({ name: 'Meeting Table', width: 60, height: 40 }, 80, 80);

  assert.strictEqual(AppState.floors.size, 2);
  assert.strictEqual(AppState.objects.length, 1);
  const wallCount = AppState.walls.size;

  // 2. Save to localStorage
  AppState.saveToLocalStorage();

  // 3. Simulate browser page reload by calling AppState.init()
  // Previously, this bug wiped localStorage with empty initial state.
  const restored = AppState.init();

  assert.strictEqual(restored, true, 'AppState.init() must report restored = true');
  assert.strictEqual(AppState.floors.size, 2, 'Floors must be restored');
  assert.strictEqual(AppState.objects.length, 1, 'Objects must be restored');
  assert.strictEqual(AppState.walls.size, wallCount, 'Walls must be restored');
  assert.strictEqual(AppState.history[0].name, '復元データ', 'History must be initialized with restored data');

  console.log('✔ Test 7 Passed!\n');
}

// Test 8: Opening Grid-Cell Snap Alignment
{
  console.log('Test 8: Opening Grid-Cell Snap Alignment (40px visual cell)');
  AppState.grid.visualCellSize = 40;
  AppState.grid.subdivisions = 2; // snapUnit = 20

  const wall = { x1: 0, y1: 0, x2: 120, y2: 0 }; // 3 cells: [0, 40], [40, 80], [80, 120]

  // Click at x=15 (inside Cell 0)
  const snap1 = WallManager.calculateSnappedOpeningPosition(wall, 15, 0, 40);
  assert.strictEqual(snap1.midX, 20, 'Opening in Cell 0 must center at x=20');
  assert.strictEqual(snap1.midX - 20, 0, 'Opening start must be at x=0');
  assert.strictEqual(snap1.midX + 20, 40, 'Opening end must be at x=40');

  // Click at x=39 (near right edge of Cell 0)
  const snap2 = WallManager.calculateSnappedOpeningPosition(wall, 39, 0, 40);
  assert.strictEqual(snap2.midX, 20, 'Opening in Cell 0 must still center at x=20');

  // Click at x=45 (inside Cell 1)
  const snap3 = WallManager.calculateSnappedOpeningPosition(wall, 45, 0, 40);
  assert.strictEqual(snap3.midX, 60, 'Opening in Cell 1 must center at x=60');
  assert.strictEqual(snap3.midX - 20, 40, 'Opening start must be at x=40');
  assert.strictEqual(snap3.midX + 20, 80, 'Opening end must be at x=80');

  // Vertical wall: (80, 0) to (80, 120)
  const vWall = { x1: 80, y1: 0, x2: 80, y2: 120 };
  const snapV = WallManager.calculateSnappedOpeningPosition(vWall, 80, 50, 40);
  assert.strictEqual(snapV.midY, 60, 'Vertical opening must center at y=60');
  assert.strictEqual(snapV.midX, 80, 'Vertical opening must be at x=80');

  console.log('✔ Test 8 Passed!\n');
}

// Test 9: Opening Hit Testing & Wall Priority
{
  console.log('Test 9: Opening Selection & Closest Wall Hit-Testing');
  AppState.openings = [];
  AppState.walls.clear();

  const wallNorm = WallManager.normalizeEdge(0, 0, 80, 0);
  const wallObj = { id: 'test-w1', x1: 0, y1: 0, x2: 80, y2: 0, thickness: 3, isManual: true };
  AppState.walls.set(wallNorm.key, wallObj);

  // Add single door at cell 0 (center at 20, 0)
  const door = WallManager.addOpening(wallNorm.key, 10, 0, {
    name: '片開きドア',
    type: 'opening',
    openingType: 'door-single',
    width: 40,
    color: '#ca8a04'
  });

  assert.strictEqual(door.x, 20, 'Door must center at x=20');
  assert.strictEqual(door.y, 0, 'Door must be at y=0');

  // 1. Hit test near center of door (20, 0)
  const hitCenter = WallManager.findOpeningNearPoint(20, 0);
  assert.notStrictEqual(hitCenter, null, 'Must hit door near center');
  assert.strictEqual(hitCenter.id, door.id);

  // 2. Hit test near corner/leaf of door (38, 0) - width is 40, extends to 40
  const hitEdge = WallManager.findOpeningNearPoint(38, 0);
  assert.notStrictEqual(hitEdge, null, 'Must hit door near outer width edge');

  // 3. Hit test on door swing arc (20, -25)
  const hitSwing = WallManager.findOpeningNearPoint(20, -25);
  assert.notStrictEqual(hitSwing, null, 'Must hit door on its swing arc footprint');

  // 4. Hit test far away (100, 100) -> null
  const hitFar = WallManager.findOpeningNearPoint(100, 100);
  assert.strictEqual(hitFar, null, 'Must not hit door far away');

  // 5. Test closest wall search
  const wall2Norm = WallManager.normalizeEdge(0, 50, 80, 50);
  AppState.walls.set(wall2Norm.key, { id: 'test-w2', x1: 0, y1: 50, x2: 80, y2: 50, thickness: 3, isManual: true });

  const closest = WallManager.findWallNearPoint(40, 48, 20);
  assert.strictEqual(closest.key, wall2Norm.key, 'Must pick the closer wall w2 (dist 2) rather than w1 (dist 48)');

  console.log('✔ Test 9 Passed!\n');
}

// Test 10: Color Presets & Eyedropper Sampling
{
  console.log('Test 10: Color Presets & Eyedropper Sampling');
  assert(Array.isArray(ColorManager.floorPresets) && ColorManager.floorPresets.length > 5, 'Must have floor presets');
  assert(Array.isArray(ColorManager.wallPresets) && ColorManager.wallPresets.length > 3, 'Must have wall presets');
  assert(Array.isArray(ColorManager.objectPresets) && ColorManager.objectPresets.length > 5, 'Must have object presets');
  assert(Array.isArray(ColorManager.openingPresets) && ColorManager.openingPresets.length > 3, 'Must have opening presets');

  // Setup sample floor and object
  AppState.floors.clear();
  AppState.walls.clear();
  AppState.objects = [];
  AppState.openings = [];

  WallManager.setFloor(0, 0, '#859b72'); // Tatami green
  const sampledFloor = ColorManager.sampleColorAt(20, 20);
  assert.strictEqual(sampledFloor, '#859b72', 'Sample color from floor cell must match');

  const obj = ObjectManager.createObject({ name: 'Chest', color: '#f59e0b', width: 20, height: 20 }, 100, 100);
  const sampledObj = ColorManager.sampleColorAt(105, 105);
  assert.strictEqual(sampledObj, '#f59e0b', 'Sample color from object must match');

  console.log('✔ Test 10 Passed!\n');
}

// Test 11: Custom Color Presets Management (Add, Deduplicate, Remove)
{
  console.log('Test 11: Custom Color Presets Management');
  // Mock localStorage for test environment
  const mockStorage = {};
  global.localStorage = {
    getItem: (key) => mockStorage[key] || null,
    setItem: (key, val) => { mockStorage[key] = String(val); },
    removeItem: (key) => { delete mockStorage[key]; }
  };

  ColorManager.init();

  // Test adding a custom color
  const added = ColorManager.addCustomColor('floor', '#abcdef', 'My Light Blue');
  assert.strictEqual(added, true, 'Should successfully add custom color');
  assert(ColorManager.customPresets.floor.some(p => p.color === '#abcdef'), 'Custom color should be present in floor presets');

  // Verify persistence to localStorage
  const savedData = JSON.parse(mockStorage['gridmap_custom_colors']);
  assert(savedData.floor.some(p => p.color === '#abcdef'), 'Custom color should be saved to localStorage');

  // Duplicate add should return false
  const duplicateAdd = ColorManager.addCustomColor('floor', '#abcdef');
  assert.strictEqual(duplicateAdd, false, 'Should reject duplicate custom color');

  // Adding built-in color should return false
  const builtInAdd = ColorManager.addCustomColor('floor', '#f8fafc');
  assert.strictEqual(builtInAdd, false, 'Should reject adding built-in color');

  // Test removing custom color
  const removed = ColorManager.removeCustomColor('floor', '#abcdef');
  assert.strictEqual(removed, true, 'Should successfully remove custom color');
  assert(!ColorManager.customPresets.floor.some(p => p.color === '#abcdef'), 'Custom color should be removed');

  console.log('✔ Test 11 Passed!\n');
}

// Test 12: Rect Floor Fill, Bucket Flood Fill & Bulk Floor Replacement
{
  console.log('Test 12: Rect Floor Fill, Bucket Flood Fill & Bulk Floor Replacement');
  AppState.floors.clear();
  AppState.walls.clear();
  AppState.paintStyle.floorColor = '#e2e8f0';
  AppState.paintStyle.floorTexture = 'none';
  AppState.paintStyle.autoPerimeterWall = true;

  // 1. Simulate 3x3 Rect Floor Fill (col: 1..3, row: 1..3)
  for (let c = 1; c <= 3; c++) {
    for (let r = 1; r <= 3; r++) {
      WallManager.setFloor(c, r, '#e2e8f0', 'none');
    }
  }
  WallManager.updatePerimeterWalls();

  assert.strictEqual(AppState.floors.size, 9, 'Should have 9 floor cells');
  // 3x3 grid outer perimeter has 4 sides * 3 segments = 12 walls
  assert.strictEqual(AppState.walls.size, 12, '3x3 room should have 12 auto perimeter walls');

  // 2. Test Flood Fill (Bucket) on connected room
  AppState.paintStyle.floorColor = '#3b82f6';
  AppState.paintStyle.floorTexture = 'wood';
  // Point inside cell (2, 2): worldX = 2 * 40 + 20 = 100, worldY = 2 * 40 + 20 = 100
  CanvasManager.floodFillFloor(100, 100);

  for (let c = 1; c <= 3; c++) {
    for (let r = 1; r <= 3; r++) {
      const f = AppState.floors.get(`${c},${r}`);
      assert.strictEqual(f.color, '#3b82f6', `Cell (${c},${r}) color must be updated by bucket`);
      assert.strictEqual(f.texture, 'wood', `Cell (${c},${r}) texture must be updated by bucket`);
    }
  }

  // 3. Add an isolated floor cell with different color
  WallManager.setFloor(10, 10, '#ef4444', 'none');
  assert.strictEqual(AppState.floors.get('10,10').color, '#ef4444');

  // Flood fill on (2, 2) again with another color; cell (10, 10) should NOT be affected
  AppState.paintStyle.floorColor = '#10b981';
  CanvasManager.floodFillFloor(100, 100);
  assert.strictEqual(AppState.floors.get('2,2').color, '#10b981', 'Connected cell should change');
  assert.strictEqual(AppState.floors.get('10,10').color, '#ef4444', 'Isolated cell must remain unchanged');

  // 4. Test replaceAllFloors()
  AppState.paintStyle.floorColor = '#8b5cf6';
  AppState.paintStyle.floorTexture = 'stone';
  CanvasManager.replaceAllFloors();

  for (const f of AppState.floors.values()) {
    assert.strictEqual(f.color, '#8b5cf6', 'All floors must have new color');
    assert.strictEqual(f.texture, 'stone', 'All floors must have new texture');
  }

  console.log('✔ Test 12 Passed!\n');
}

// Test 13: Auto Perimeter Wall Toggle (Enabled vs Disabled)
{
  console.log('Test 13: Auto Perimeter Wall Toggle');
  AppState.floors.clear();
  AppState.walls.clear();

  // Disable autoPerimeterWall
  AppState.paintStyle.autoPerimeterWall = false;
  WallManager.setFloor(5, 5, '#ffffff');

  assert.strictEqual(AppState.floors.size, 1);
  assert.strictEqual(AppState.walls.size, 0, 'No walls should be created when autoPerimeterWall is false');

  // Enable autoPerimeterWall and rebuild
  AppState.paintStyle.autoPerimeterWall = true;
  WallManager.rebuildAutoWalls();

  assert.strictEqual(AppState.walls.size, 4, 'Single cell should have 4 perimeter walls when re-enabled');

  console.log('✔ Test 13 Passed!\n');
}

// Test 14: Pre-Placement Object Rotation (R Key & Preview)
{
  console.log('Test 14: Pre-Placement Object Rotation');
  const paletteItem = {
    id: 'test-table',
    name: '作業机',
    group: 'furniture',
    type: 'object',
    width: 80,
    height: 40,
    shapeType: 'rect'
  };

  AppState.activePaletteItem = paletteItem;
  AppState.activePaletteRotation = 0;

  // Press R once: 90 deg
  ShortcutManager.executeAction('action_rotate');
  assert.strictEqual(AppState.activePaletteRotation, 90, 'Rotation should be 90°');

  // Press R again: 180 deg
  ShortcutManager.executeAction('action_rotate');
  assert.strictEqual(AppState.activePaletteRotation, 180, 'Rotation should be 180°');

  // Press R two more times: 270 deg, then 0 deg
  ShortcutManager.executeAction('action_rotate');
  assert.strictEqual(AppState.activePaletteRotation, 270, 'Rotation should be 270°');
  ShortcutManager.executeAction('action_rotate');
  assert.strictEqual(AppState.activePaletteRotation, 0, 'Rotation should cycle back to 0°');

  // Rotate to 90 and place object
  AppState.activePaletteRotation = 90;
  const item = AppState.activePaletteItem;
  const baseW = item.width;
  const baseH = item.height;
  const rot = 90;
  const snapped = { x: 100, y: 100 };
  const rad = rot * Math.PI / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const aabbW = baseW * cos + baseH * sin;
  const aabbH = baseW * sin + baseH * cos;
  const centerX = snapped.x + aabbW / 2;
  const centerY = snapped.y + aabbH / 2;

  const obj = ObjectManager.createObject(item, centerX - baseW / 2, centerY - baseH / 2, false);
  obj.rotation = rot;

  assert.strictEqual(obj.rotation, 90, 'Placed object rotation should be 90°');
  const aabb = ObjectManager.getAABB(obj);
  assert.strictEqual(Math.round(aabb.minX), 100, 'Rotated placed object visual minX must match snapped cursor 100');
  assert.strictEqual(Math.round(aabb.minY), 100, 'Rotated placed object visual minY must match snapped cursor 100');
  assert.strictEqual(Math.round(aabb.width), 40, 'AABB width should be 40 (original height rotated 90°)');
  assert.strictEqual(Math.round(aabb.height), 80, 'AABB height should be 80 (original width rotated 90°)');

  console.log('✔ Test 14 Passed!\n');
}

// Test 15: Custom Palette Item Duplicate, Edit, Delete & LocalStorage Persistence
{
  console.log('Test 15: Custom Palette Item Duplicate, Edit, Delete & LocalStorage');
  const customItem = {
    id: 'custom-' + Date.now(),
    name: 'オリジナル棚',
    group: 'custom',
    type: 'object',
    width: 40,
    height: 40,
    color: '#f97316'
  };

  AppState.paletteItems.push(customItem);
  AppState.saveCustomPaletteItems();

  const savedJSON = localStorage.getItem('gridmap_custom_palette');
  assert(savedJSON, 'Custom palette must be saved to localStorage');
  const savedList = JSON.parse(savedJSON);
  assert(savedList.some(i => i.name === 'オリジナル棚'), 'Saved list should contain new item');

  // Duplicate item
  PaletteManager.duplicateItem(customItem);
  const copyItem = AppState.paletteItems.find(i => i.name === 'オリジナル棚 (コピー)');
  assert(copyItem, 'Duplicated item must exist in palette');
  assert.strictEqual(copyItem.width, 40);

  // Edit item
  customItem.name = '高級オーク棚';
  AppState.saveCustomPaletteItems();
  const updatedJSON = JSON.parse(localStorage.getItem('gridmap_custom_palette'));
  assert(updatedJSON.some(i => i.name === '高級オーク棚'), 'Edited name must persist in localStorage');

  // Delete item
  PaletteManager.deleteItem(customItem);
  assert(!AppState.paletteItems.some(i => i.id === customItem.id), 'Deleted item must be removed from paletteItems');
  const afterDeleteJSON = JSON.parse(localStorage.getItem('gridmap_custom_palette'));
  assert(!afterDeleteJSON.some(i => i.id === customItem.id), 'Deleted item must be removed from localStorage');

  console.log('✔ Test 15 Passed!\n');
}

// Test 16: Opening Tool Rotation / Flip Swing & Hinge
{
  console.log('Test 16: Opening Tool Rotation / Flip Swing & Hinge');
  App.setTool('opening');
  assert.strictEqual(AppState.currentTool, 'opening');
  assert(AppState.activePaletteItem && AppState.activePaletteItem.type === 'opening');

  // Initial swing is false
  AppState.activePaletteItem.flipSwing = false;

  // Press R (action_rotate): flips flipSwing to true (opens inward)
  ShortcutManager.executeAction('action_rotate');
  assert.strictEqual(AppState.activePaletteItem.flipSwing, true, 'flipSwing should become true on R');

  // Press R again: flips back to false (opens outward)
  ShortcutManager.executeAction('action_rotate');
  assert.strictEqual(AppState.activePaletteItem.flipSwing, false, 'flipSwing should become false on second R');

  // Place opening on a wall
  AppState.walls.clear();
  AppState.openings = [];
  const wallNorm = WallManager.normalizeEdge(0, 0, 80, 0);
  AppState.walls.set(wallNorm.key, { id: 'test-wall', x1: 0, y1: 0, x2: 80, y2: 0, thickness: 3, isManual: true });

  AppState.activePaletteItem.flipSwing = true;
  AppState.activePaletteItem.flipHinge = true;
  const placedOp = WallManager.addOpening(wallNorm.key, 40, 0, AppState.activePaletteItem);
  assert(placedOp, 'Opening should be placed on wall');
  assert.strictEqual(placedOp.flipSwing, true, 'Placed opening must inherit flipSwing');
  assert.strictEqual(placedOp.flipHinge, true, 'Placed opening must inherit flipHinge');

  // Select placed opening and rotate
  AppState.selectedOpeningIds.clear();
  AppState.selectedOpeningIds.add(placedOp.id);
  CanvasManager.rotateSelected();
  assert.strictEqual(placedOp.flipSwing, false, 'rotateSelected should toggle flipSwing on selected opening');

  console.log('✔ Test 16 Passed!\n');
}

// Test 17: Tool Selection Priority (Tool Change Clears Object Selection)
{
  console.log('Test 17: Tool Selection Priority');
  App.setTool('select');
  const dummyObj = ObjectManager.createObject({ name: '椅子', width: 20, height: 20 }, 10, 10);
  AppState.objects.push(dummyObj);
  AppState.selectedObjectIds.add(dummyObj.id);
  assert.strictEqual(AppState.selectedObjectIds.size, 1, 'Object should be selected in select tool');

  // Switch to floor tool
  App.setTool('floor');
  assert.strictEqual(AppState.currentTool, 'floor');
  assert.strictEqual(AppState.selectedObjectIds.size, 0, 'Switching to floor tool must clear object selection');

  // Switch to opening tool
  AppState.selectedObjectIds.add(dummyObj.id);
  App.setTool('opening');
  assert.strictEqual(AppState.currentTool, 'opening');
  assert.strictEqual(AppState.selectedObjectIds.size, 0, 'Switching to opening tool must clear object selection');

  console.log('✔ Test 17 Passed!\n');
}

// Test 18: Reset Placed Object Properties to Palette Default
{
  console.log('Test 18: Reset Placed Object Properties to Palette Default');
  const paletteTable = AppState.paletteItems.find(p => p.id === 'item-table') || {
    id: 'item-table',
    name: '机',
    group: 'furniture',
    type: 'object',
    width: 80,
    height: 40,
    shapeType: 'rect',
    fillType: 'color',
    color: '#854d0e',
    strokeColor: '#532e06',
    text: '机',
    textColor: '#ffffff',
    fontSize: 12
  };
  if (!AppState.paletteItems.some(p => p.id === paletteTable.id)) {
    AppState.paletteItems.push(paletteTable);
  }

  const obj = ObjectManager.createObject(paletteTable, 120, 80);
  AppState.objects.push(obj);

  assert.strictEqual(obj.paletteItemId, paletteTable.id, 'Created object must store paletteItemId');
  assert.strictEqual(obj.width, 80);
  assert.strictEqual(obj.height, 40);
  assert.strictEqual(obj.color, '#854d0e');
  assert.strictEqual(obj.text, '机');

  // User customizes object properties on map
  obj.width = 160;
  obj.height = 80;
  obj.color = '#ef4444';
  obj.strokeColor = '#991b1b';
  obj.text = '会議机';
  obj.textColor = '#000000';
  obj.fontSize = 16;

  // Reset to default
  const defaultDef = AppState.paletteItems.find(p => p.id === obj.paletteItemId) ||
    AppState.paletteItems.find(p => p.name === obj.name);
  assert(defaultDef, 'Matching palette item must be found');

  obj.width = defaultDef.width;
  obj.height = defaultDef.height;
  obj.shapeType = defaultDef.shapeType || 'rect';
  obj.cells = defaultDef.cells ? JSON.parse(JSON.stringify(defaultDef.cells)) : null;
  obj.fillType = defaultDef.fillType || 'color';
  obj.color = defaultDef.color;
  obj.strokeColor = defaultDef.strokeColor;
  obj.strokeWidth = defaultDef.strokeWidth || 1;
  obj.imageData = defaultDef.imageData || null;
  obj.text = defaultDef.text || '';
  obj.textColor = defaultDef.textColor || '#ffffff';
  obj.fontSize = defaultDef.fontSize || 12;

  // Verify properties restored
  assert.strictEqual(obj.width, 80, 'Width must be restored to default');
  assert.strictEqual(obj.height, 40, 'Height must be restored to default');
  assert.strictEqual(obj.color, '#854d0e', 'Color must be restored to default');
  assert.strictEqual(obj.strokeColor, '#532e06', 'Stroke color must be restored to default');
  assert.strictEqual(obj.text, '机', 'Text label must be restored to default');
  assert.strictEqual(obj.textColor, '#ffffff', 'Text color must be restored to default');
  assert.strictEqual(obj.fontSize, 12, 'Font size must be restored to default');
  // Position must be preserved
  assert.strictEqual(obj.x, 120, 'Position X must be preserved');
  assert.strictEqual(obj.y, 80, 'Position Y must be preserved');

  console.log('✔ Test 18 Passed!\n');
}

// Test 19: ESC Key Resets Selection & Placement Tool
{
  console.log('Test 19: ESC Key Resets Selection & Placement Tool');
  ShortcutManager.init();

  App.setTool('wall');
  AppState.selectedObjectIds.add('obj-test-1');
  AppState.selectedWallKeys.add('wall-test-1');
  AppState.selectedOpeningIds.add('open-test-1');
  AppState.activePaletteItem = { id: 'item-chair', name: '椅子' };
  AppState.activePaletteRotation = 90;

  assert.strictEqual(AppState.selectedObjectIds.size, 1);
  assert.strictEqual(AppState.selectedWallKeys.size, 1);
  assert.strictEqual(AppState.selectedOpeningIds.size, 1);
  assert(AppState.activePaletteItem !== null);
  assert.strictEqual(AppState.currentTool, 'wall');

  // Trigger Escape key
  window.dispatchEvent({ type: 'keydown', key: 'Escape', code: 'Escape', preventDefault() {} });

  assert.strictEqual(AppState.selectedObjectIds.size, 0, 'ESC must clear selectedObjectIds');
  assert.strictEqual(AppState.selectedWallKeys.size, 0, 'ESC must clear selectedWallKeys');
  assert.strictEqual(AppState.selectedOpeningIds.size, 0, 'ESC must clear selectedOpeningIds');
  assert.strictEqual(AppState.activePaletteItem, null, 'ESC must clear activePaletteItem');
  assert.strictEqual(AppState.activePaletteRotation, 0, 'ESC must reset activePaletteRotation');
  assert.strictEqual(AppState.currentTool, 'select', 'ESC must return tool to select');

  console.log('✔ Test 19 Passed!\n');
}

// Test 20: Custom 8x8 Shape Matrix & Hit Testing / Rotation
{
  console.log('Test 20: Custom 8x8 Shape Matrix & Hit Testing');
  // Create an 8x8 matrix
  const matrix8x8 = Array(8).fill(0).map(() => Array(8).fill(0));
  // Fill top-left 2x1 and bottom-right 1x1
  matrix8x8[0][0] = 1;
  matrix8x8[0][1] = 1;
  matrix8x8[7][7] = 1;

  const custom8x8Item = {
    id: 'custom-8x8-test',
    name: '8x8パーツ',
    group: 'custom',
    type: 'object',
    shapeType: 'cells',
    cells: matrix8x8,
    width: 8 * 20,  // 160px (each sub-cell is 20px)
    height: 8 * 20, // 160px
    color: '#8b5cf6',
    strokeColor: '#6d28d9'
  };

  const obj8 = ObjectManager.createObject(custom8x8Item, 0, 0);
  AppState.objects.push(obj8);

  assert.strictEqual(obj8.cells.length, 8, 'Object should have 8 rows');
  assert.strictEqual(obj8.cells[0].length, 8, 'Object should have 8 cols');

  // Hit test points
  // Sub-cell (0, 0): [0..20, 0..20] -> Center (10, 10)
  assert.strictEqual(ObjectManager.hitTest(obj8, 10, 10), true, 'Point (10, 10) inside filled subcell (0,0) must hit');
  // Sub-cell (0, 1): [20..40, 0..20] -> Center (30, 10)
  assert.strictEqual(ObjectManager.hitTest(obj8, 30, 10), true, 'Point (30, 10) inside filled subcell (0,1) must hit');
  // Sub-cell (0, 2): [40..60, 0..20] -> Empty
  assert.strictEqual(ObjectManager.hitTest(obj8, 50, 10), false, 'Point (50, 10) inside empty subcell (0,2) must not hit');
  // Sub-cell (7, 7): [140..160, 140..160] -> Center (150, 150)
  assert.strictEqual(ObjectManager.hitTest(obj8, 150, 150), true, 'Point (150, 150) inside filled subcell (7,7) must hit');
  // Sub-cell (7, 6): [120..140, 140..160] -> Empty
  assert.strictEqual(ObjectManager.hitTest(obj8, 130, 150), false, 'Point (130, 150) inside empty subcell (7,6) must not hit');

  // Rotate 8x8 object 90 degrees clockwise
  ObjectManager.rotateObject(obj8, true);
  // (row 0, col 0) -> (row 0, col 7) -> Center (150, 10)
  // (row 0, col 1) -> (row 1, col 7) -> Center (150, 30)
  // (row 7, col 7) -> (row 7, col 0) -> Center (10, 150)
  assert.strictEqual(ObjectManager.hitTest(obj8, 150, 10), true, 'Rotated (0, 7) must hit');
  assert.strictEqual(ObjectManager.hitTest(obj8, 150, 30), true, 'Rotated (1, 7) must hit');
  assert.strictEqual(ObjectManager.hitTest(obj8, 10, 150), true, 'Rotated (7, 0) must hit');
  assert.strictEqual(ObjectManager.hitTest(obj8, 10, 10), false, 'Original (0, 0) is now empty and must not hit');

  console.log('✔ Test 20 Passed!\n');
}

// Test 21: Legacy Placed Object Selection & Property Panel Rendering
{
  console.log('Test 21: Legacy Placed Object Property Panel & Palette Link');
  // Create an object without paletteItemId (as in older saves / versions)
  const legacyObj = {
    id: 'legacy-desk-1',
    paletteItemId: null, // Legacy object has null paletteItemId
    name: '机',
    x: 60,
    y: 60,
    width: 80,
    height: 40,
    rotation: 0,
    shapeType: 'rect',
    fillType: 'color',
    color: '#854d0e',
    strokeColor: '#532e06',
    text: '机',
    textColor: '#ffffff',
    fontSize: 12
  };
  AppState.objects.push(legacyObj);
  AppState.currentTool = 'select';
  AppState.selectedObjectIds.clear();
  AppState.selectedObjectIds.add(legacyObj.id);

  // Mock DOM container
  const mockContainer = { innerHTML: '', style: {}, appendChild: () => {}, querySelectorAll: () => [] };
  const origGetElementById = document.getElementById;
  document.getElementById = (id) => {
    if (id === 'selection-properties-container' || id === 'properties-content') return mockContainer;
    return { style: {}, value: '', addEventListener: () => {}, onclick: null, onchange: null, appendChild: () => {}, querySelectorAll: () => [] };
  };

  // Call updatePropertyPanel: Must execute smoothly without ReferenceError
  assert.doesNotThrow(() => {
    PaletteManager.updatePropertyPanel();
  }, 'updatePropertyPanel must not throw ReferenceError on legacy objects');

  assert(mockContainer.innerHTML.includes('prop-reset-default-btn'), 'Panel must include reset button');
  assert(mockContainer.innerHTML.includes('prop-obj-textcolor-presets'), 'Panel must include text color presets row');
  assert(mockContainer.innerHTML.includes('prop-eyedropper-obj-textcolor'), 'Panel must include text color eyedropper');
  assert.strictEqual(legacyObj.paletteItemId, 'item-table', 'Legacy object should have paletteItemId backfilled');

  // Restore getElementById
  document.getElementById = origGetElementById;
  console.log('✔ Test 21 Passed!\n');
}

// Test 22: Stroke and Text Color Presets & Custom Presets
{
  console.log('Test 22: Stroke & Text Color Presets');
  assert(Array.isArray(ColorManager.strokePresets) && ColorManager.strokePresets.length >= 6, 'strokePresets must exist');
  assert(Array.isArray(ColorManager.textPresets) && ColorManager.textPresets.length >= 6, 'textPresets must exist');

  // Add custom stroke color
  const addedStroke = ColorManager.addCustomColor('stroke', '#ff00ff', 'マゼンタ枠線');
  assert.strictEqual(addedStroke, true, 'Custom stroke color should be added');
  assert(ColorManager.customPresets.stroke.some(p => p.color === '#ff00ff'), 'Stroke custom presets must contain added color');

  // Add custom text color
  const addedText = ColorManager.addCustomColor('text', '#00ffff', 'シアン文字');
  assert.strictEqual(addedText, true, 'Custom text color should be added');
  assert(ColorManager.customPresets.text.some(p => p.color === '#00ffff'), 'Text custom presets must contain added color');

  // Remove custom colors
  ColorManager.removeCustomColor('stroke', '#ff00ff');
  assert(!ColorManager.customPresets.stroke.some(p => p.color === '#ff00ff'), 'Custom stroke color should be removed');
  ColorManager.removeCustomColor('text', '#00ffff');
  assert(!ColorManager.customPresets.text.some(p => p.color === '#00ffff'), 'Custom text color should be removed');

  console.log('✔ Test 22 Passed!\n');
}

// Test 23: Grid Show On Floor (State, Serialization, SVG Export Order)
{
  console.log('Test 23: Grid Show On Floor Settings and Rendering Order');
  
  // 1. Initial State Default
  assert.strictEqual(AppState.grid.showOnFloor, true, 'showOnFloor should default to true');

  // 2. Serialization and Deserialization
  const serialized = AppState.serializeMapData();
  assert.strictEqual(serialized.grid.showOnFloor, true, 'Serialized grid data must include showOnFloor: true');

  AppState.grid.showOnFloor = false;
  const serializedFalse = AppState.serializeMapData();
  assert.strictEqual(serializedFalse.grid.showOnFloor, false, 'Serialized grid data must reflect showOnFloor: false');

  AppState.deserializeMapData(serialized);
  assert.strictEqual(AppState.grid.showOnFloor, true, 'Deserialization must restore showOnFloor: true');

  // 3. SVG Export Rendering Order
  // Add a floor cell to test
  AppState.floors.set('0,0', { col: 0, row: 0, color: '#e2e8f0', texture: 'none' });

  // When showOnFloor is true, grid group must come after floors group
  AppState.grid.showOnFloor = true;
  const svgOnFloor = ExportManager.exportSVG(1, true, false);
  const floorsIdxTrue = svgOnFloor.indexOf('<g id="floors">');
  const gridIdxTrue = svgOnFloor.indexOf('<g id="grid"');
  assert(floorsIdxTrue !== -1, 'SVG must contain floors group');
  assert(gridIdxTrue !== -1, 'SVG must contain grid group');
  assert(gridIdxTrue > floorsIdxTrue, 'When showOnFloor is true, grid group must be rendered AFTER floors group');

  // When showOnFloor is false, grid group must come before floors group
  AppState.grid.showOnFloor = false;
  const svgUnderFloor = ExportManager.exportSVG(1, true, false);
  const floorsIdxFalse = svgUnderFloor.indexOf('<g id="floors">');
  const gridIdxFalse = svgUnderFloor.indexOf('<g id="grid"');
  assert(floorsIdxFalse !== -1, 'SVG must contain floors group');
  assert(gridIdxFalse !== -1, 'SVG must contain grid group');
  assert(gridIdxFalse < floorsIdxFalse, 'When showOnFloor is false, grid group must be rendered BEFORE floors group');

  // 4. Modal Checkbox Binding
  const mockShowOnFloorCheckbox = { checked: false, onchange: null };
  const mockBtnGrid = { onclick: null };
  const mockModal = { classList: { add: () => {} } };
  const origGetElementById = document.getElementById;
  document.getElementById = (id) => {
    if (id === 'grid-show-on-floor') return mockShowOnFloorCheckbox;
    if (id === 'btn-grid-settings') return mockBtnGrid;
    if (id === 'modal-grid-settings') return mockModal;
    return { value: '', checked: false, onchange: null, onclick: null };
  };

  App.initGridSettingsModal();
  assert.strictEqual(typeof mockShowOnFloorCheckbox.onchange, 'function', 'onchange handler must be bound to grid-show-on-floor');
  
  // Simulate checking the box
  mockShowOnFloorCheckbox.onchange({ target: { checked: true } });
  assert.strictEqual(AppState.grid.showOnFloor, true, 'Checkbox change must update AppState.grid.showOnFloor to true');

  // Simulate unchecking the box
  mockShowOnFloorCheckbox.onchange({ target: { checked: false } });
  assert.strictEqual(AppState.grid.showOnFloor, false, 'Checkbox change must update AppState.grid.showOnFloor to false');

  // Reset showOnFloor to true default
  AppState.grid.showOnFloor = true;
  document.getElementById = origGetElementById;

  console.log('✔ Test 23 Passed!\n');
}

// Test 24: Google Drive Integration & State Persistence
{
  console.log('Test 24: Google Drive Integration & State Persistence');
  assert(typeof GoogleDriveManager !== 'undefined', 'GoogleDriveManager should be defined');

  // Initial State: no custom ID
  localStorage.removeItem(GoogleDriveManager.STORAGE_KEY_CLIENT_ID);
  assert.strictEqual(GoogleDriveManager.getClientId(), '', 'Client ID should be empty on localhost by default');
  assert.strictEqual(GoogleDriveManager.isConfigured(), false, 'Should not be configured without client ID');
  assert.strictEqual(GoogleDriveManager.isAuthenticated(), false, 'Should not be authenticated initially');

  // Set Custom Client ID
  const testClientId = '123456789-abcdefg.apps.googleusercontent.com';
  GoogleDriveManager.setCustomClientId(testClientId);
  assert.strictEqual(localStorage.getItem(GoogleDriveManager.STORAGE_KEY_CLIENT_ID), testClientId);
  assert.strictEqual(GoogleDriveManager.getClientId(), testClientId);
  assert.strictEqual(GoogleDriveManager.isConfigured(), true);

  // AppState.currentDriveFile tracking
  AppState.currentDriveFile = {
    fileId: 'mock-file-123',
    name: 'test_dungeon.json',
    modifiedTime: '2026-10-03T00:00:00.000Z'
  };
  assert(AppState.currentDriveFile && AppState.currentDriveFile.fileId === 'mock-file-123');

  // Sign out resets state
  GoogleDriveManager.accessToken = 'mock_token';
  GoogleDriveManager.tokenExpiresAt = Date.now() + 3600000;
  GoogleDriveManager.currentUser = { name: 'Tester', email: 'test@example.com' };
  GoogleDriveManager.appFolderId = 'folder_123';
  GoogleDriveManager.texturesFolderId = 'textures_456';
  assert.strictEqual(GoogleDriveManager.isAuthenticated(), true);

  GoogleDriveManager.signOut();
  assert.strictEqual(GoogleDriveManager.accessToken, null);
  assert.strictEqual(GoogleDriveManager.tokenExpiresAt, 0);
  assert.strictEqual(GoogleDriveManager.currentUser, null);
  assert.strictEqual(GoogleDriveManager.appFolderId, null);
  assert.strictEqual(GoogleDriveManager.texturesFolderId, null);
  assert.strictEqual(GoogleDriveManager.isAuthenticated(), false);

  // Reset Custom Client ID
  GoogleDriveManager.setCustomClientId('');
  assert.strictEqual(GoogleDriveManager.getClientId(), '');
  assert.strictEqual(GoogleDriveManager.isConfigured(), false);

  // Clear map resets currentDriveFile
  AppState.clearLocalStorage();
  assert.strictEqual(AppState.currentDriveFile, null, 'clearLocalStorage must reset currentDriveFile');

  console.log('✔ Test 24 Passed!\n');
}

// Test 25: Settings Manager (Export, Import, Selective Apply & Factory Reset)
{
  console.log('Test 25: Settings Manager (Export, Import, Selective Apply & Factory Reset)');
  assert(typeof SettingsManager !== 'undefined', 'SettingsManager should be defined');

  // 1. Export settings verification
  const exported = SettingsManager.exportSettingsObject();
  assert.strictEqual(exported.app, 'GridMap Studio');
  assert.strictEqual(exported.type, 'settings');
  assert(exported.settings, 'Exported data must have settings object');
  assert(exported.settings.grid, 'Exported settings must include grid');
  assert(exported.settings.shortcuts, 'Exported settings must include shortcuts');
  assert(exported.settings.customColors, 'Exported settings must include customColors');
  assert(Array.isArray(exported.settings.hotbar), 'Exported settings must include hotbar');

  // 2. Parse JSON validation
  const validJson = JSON.stringify(exported);
  const parsed = SettingsManager.parseSettingsFile(validJson);
  assert.strictEqual(parsed.metadata.app, 'GridMap Studio');
  assert(parsed.settings.grid);

  assert.throws(() => {
    SettingsManager.parseSettingsFile('INVALID_JSON{{{');
  }, /JSONの構文解析に失敗しました/);

  // 3. Selective Import & Application
  const testSettings = {
    grid: {
      visualCellSize: 80,
      subdivisions: 4,
      visualColor: '#ff0000',
      snapColor: '#00ff00',
      showSnap: false,
      showOnFloor: false
    },
    paintStyle: {
      floorColor: '#123456',
      floorTexture: 'wood',
      wallColor: '#654321',
      wallTexture: 'brick',
      autoWall: false
    },
    shortcuts: {
      action_select: 'KeyX'
    },
    customColors: {
      floor: ['#111111', '#222222']
    },
    customPalette: [
      {
        id: 'test-item-settings',
        name: '設定テスト棚',
        group: 'furniture',
        type: 'object',
        width: 40,
        height: 40
      }
    ],
    hotbar: ['test-item-settings', null, null]
  };

  // Import all
  const applyRes = SettingsManager.applySettings(testSettings);
  assert.strictEqual(applyRes.success, true);
  assert.strictEqual(AppState.grid.visualCellSize, 80);
  assert.strictEqual(AppState.grid.subdivisions, 4);
  assert.strictEqual(AppState.grid.showOnFloor, false);
  assert.strictEqual(AppState.paintStyle.floorColor, '#123456');
  assert.strictEqual(AppState.paintStyle.autoWall, false);
  assert(AppState.paletteItems.some(i => i.id === 'test-item-settings'));
  assert.strictEqual(AppState.hotbar[0]?.id, 'test-item-settings');

  // Selective import (skip grid, only change paintStyle)
  const partialSettings = {
    grid: { visualCellSize: 120 },
    paintStyle: { floorColor: '#abcdef' }
  };
  SettingsManager.applySettings(partialSettings, { grid: false, paintStyle: true });
  assert.strictEqual(AppState.grid.visualCellSize, 80, 'Grid should NOT be changed when grid=false');
  assert.strictEqual(AppState.paintStyle.floorColor, '#abcdef', 'paintStyle should be updated when paintStyle=true');

  // 4. Factory Reset All Settings
  SettingsManager.resetAllSettings();
  assert.strictEqual(AppState.grid.visualCellSize, 40, 'Reset must restore default visualCellSize 40');
  assert.strictEqual(AppState.grid.subdivisions, 2, 'Reset must restore default subdivisions 2');
  assert.strictEqual(AppState.grid.showOnFloor, true, 'Reset must restore showOnFloor true');
  assert.strictEqual(AppState.paintStyle.floorColor, '#e2e8f0', 'Reset must restore default floor color');
  assert.strictEqual(AppState.paintStyle.autoWall, true, 'Reset must restore default autoWall true');
  assert.strictEqual(localStorage.getItem('gridmap_shortcuts'), null, 'Reset must clear shortcuts in localStorage');
  assert.strictEqual(localStorage.getItem('gridmap_custom_colors'), null, 'Reset must clear colors in localStorage');

  console.log('✔ Test 25 Passed!\n');
}

console.log('🎉 All Core Logic Tests Passed Successfully! 🎉');





