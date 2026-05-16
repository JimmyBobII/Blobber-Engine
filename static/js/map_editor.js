const MapEditor = {
    mapData: { areas: [] }, 
    dbData: { items: [], monsters: [] },
    currentTool: 0,
    currentArea: 0,
    currentFloor: 0,
    isDrawing: false,
    lineMode: false,
    lineStart: null,
    rectMode: false,
    rectStart: null,
    undoStack: [],
    redoStack: [],
    MAX_UNDO: 30,
    MAX_TOTAL_FLOORS: 40,

    tools: [
        { id: 0, name: "Floor / Eraser", color: "#ddd", tip: "Paint walkable floor tiles, or erase existing tiles back to floor" },
        { id: 1, name: "Wall", color: "#222", tip: "Solid wall — blocks movement and line of sight" },
        { id: 2, name: "Door", color: "#3a7ca5", tip: "Door — players press E to open/close" },
        { id: 4, name: "Item", color: "#fbc02d", tip: "Place an item pickup — select which item from the dropdown" },
        { id: 5, name: "Monster", color: "#8b0000", tip: "Place a monster encounter — select which monster from the dropdown" },
        { id: 6, name: "Stairs Up", color: "#9c27b0", tip: "Stairs leading up — connects to stairs down on the floor above (or exits to town on floor 1)" },
        { id: 7, name: "Stairs Down", color: "#673ab7", tip: "Stairs leading down — connects to stairs up on the floor below" },
        { id: 8, name: "Chest", color: "#ff9800", tip: "Treasure chest — can contain an item and/or gold" },
        { id: 9, name: "Breakable Wall", color: "#6d5040", tip: "Wall that can be broken with a specific weapon — pick Cracked or Sealed and choose which weapon breaks it" },
        { id: 10, name: "Locked Door", color: "#006064", tip: "Locked door — requires a specific key item to open" },
        { id: 11, name: "NPC", color: "#2e7d32", tip: "Place an NPC — select which NPC from the dropdown" },
        { id: 12, name: "Win Trigger", color: "#ffd700", tip: "Walking here triggers the victory screen — enter victory text below" },
        { id: 13, name: "Illusion Wall", color: "#9e8e7e", tip: "Looks like a wall but players can walk through — brickwork is subtly wrong as a visual clue" },
        { id: 14, name: "Lore Scroll", color: "#d4a574", tip: "A readable scroll — player steps on it, reads the message, then it vanishes" },
        { id: 15, name: "Trap", color: "#a04040", tip: "Trap tile — deals damage when stepped on. Pick a type and set damage." }
    ],

    // Helper: get current area object
    getArea() { return this.mapData.areas[this.currentArea]; },
    // Helper: get current floor's array from current area
    getFloors() { return this.getArea().floors; },
    // Helper: get current floor object
    getFloor() { return this.getFloors()[this.currentFloor]; },
    // Helper: total floors across all areas
    getTotalFloors() { return this.mapData.areas.reduce((sum, a) => sum + a.floors.length, 0); },

    async init() {
        this.mapData = await API.loadMap();
        this.dbData = await API.loadDb();
        
        // Migration: if we somehow got a flat array, wrap it
        if (Array.isArray(this.mapData)) {
            this.mapData = {
                areas: [{ id: "default", name: "The Dungeon", unlockItem: "", floors: this.mapData }]
            };
        }
        if (!this.mapData.areas || this.mapData.areas.length === 0) {
            this.mapData = {
                areas: [{ id: "default", name: "The Dungeon", unlockItem: "", floors: [this.getEmptyFloor()] }]
            };
        }

        // Ensure all floors have placement keys
        this.mapData.areas.forEach(area => {
            if (!area.unlockItem) area.unlockItem = "";
            area.floors.forEach(floor => {
                if (!floor.placements) floor.placements = {};
                if (!floor.placements.chests) floor.placements.chests = {};
                if (!floor.placements.doors) floor.placements.doors = {};
                if (!floor.placements.npcs) floor.placements.npcs = {};
                if (!floor.placements.wins) floor.placements.wins = {};
                if (!floor.placements.lore) floor.placements.lore = {};
                if (!floor.placements.traps) floor.placements.traps = {};
                if (!floor.placements.breakwalls) floor.placements.breakwalls = {};
            });
        });

        this.currentArea = 0;
        this.currentFloor = 0;

        this.renderToolbar();
        this.renderAreaControls();
        this.renderFloorControls();
        this.renderGrid();
        this.setupControls();
        this.initWallTextureGrid();
        this.initFloorTextureGrid();
        this.initCeilingTextureGrid();
        this.initWorldMap();

        document.addEventListener('mouseup', () => { this.isDrawing = false; });

        // Grid coordinate tooltip
        (function setupGridTooltip() {
            const tooltip = document.createElement('div');
            tooltip.id = 'grid-coord-tooltip';
            tooltip.style.cssText = [
                'position:fixed',
                'background:rgba(0,0,0,0.75)',
                'color:#fff',
                'padding:3px 7px',
                'border-radius:4px',
                'font-size:11px',
                'font-family:monospace',
                'pointer-events:none',
                'z-index:9999',
                'display:none',
                'white-space:nowrap'
            ].join(';');
            document.body.appendChild(tooltip);

            let hoverTimer = null;

            document.getElementById('map-grid').addEventListener('mouseover', (e) => {
                const tile = e.target.closest('.tile');
                if (!tile) return;
                clearTimeout(hoverTimer);
                tooltip.style.display = 'none';
                hoverTimer = setTimeout(() => {
                    tooltip.textContent = `x: ${tile.dataset.x},  y: ${tile.dataset.y}`;
                    tooltip.style.display = 'block';
                }, 600);
            });

            document.getElementById('map-grid').addEventListener('mousemove', (e) => {
                tooltip.style.left = (e.clientX + 14) + 'px';
                tooltip.style.top  = (e.clientY - 28) + 'px';
            });

            document.getElementById('map-grid').addEventListener('mouseout', (e) => {
                const tile = e.target.closest('.tile');
                if (!tile) return;
                clearTimeout(hoverTimer);
                tooltip.style.display = 'none';
            });
        })();

        // Live Preview init
        const previewCanvas = document.getElementById('preview-canvas');
        if (previewCanvas) {
            PreviewRenderer.init(previewCanvas);
            document.getElementById('preview-enter-btn').addEventListener('click', () => {
                if (PreviewRenderer.active) PreviewRenderer.exitInteractive();
                else PreviewRenderer.enterInteractive();
            });
            // Refresh preview when panel is opened
            document.getElementById('preview-toggle').addEventListener('click', () => {
                setTimeout(() => PreviewRenderer.refresh(), 50);
            });
        }
    },

    getEmptyFloor() {
        return {
            grid: Array(20).fill(null).map(() => Array(20).fill(0)),
            placements: { items: {}, monsters: {}, chests: {}, doors: {}, npcs: {}, wins: {}, lore: {}, traps: {}, breakwalls: {} }
        };
    },

    renderAreaControls() {
        const areaSelect = document.getElementById('area-select');
        const unlockSelect = document.getElementById('area-unlock-item');
        if (!areaSelect) return;

        areaSelect.innerHTML = '';
        this.mapData.areas.forEach((area, index) => {
            areaSelect.innerHTML += `<option value="${index}">${area.name} (${area.floors.length} floor${area.floors.length !== 1 ? 's' : ''})</option>`;
        });
        areaSelect.value = this.currentArea;

        areaSelect.onchange = (e) => {
            this.currentArea = parseInt(e.target.value);
            this.currentFloor = 0;
            this.renderFloorControls();
            this.renderGrid();
            this.updateAreaUnlockDropdown();
            this.loadWallTextureGrid();
            this.updateWallTexPreview();
            this.loadFloorTextureGrid();
            this.updateFloorTexPreview();
            this.loadCeilingTextureGrid();
            this.updateCeilingTexPreview();
            this.updateContextBar();
        };

        // Populate unlock item dropdown with key items
        unlockSelect.innerHTML = '<option value="">None (Always Open)</option>';
        if (this.dbData && this.dbData.items) {
            this.dbData.items.filter(i => i.type === 'key').forEach(item => {
                unlockSelect.innerHTML += `<option value="${item.id}">${item.name}</option>`;
            });
        }
        this.updateAreaUnlockDropdown();

        unlockSelect.onchange = (e) => {
            this.getArea().unlockItem = e.target.value;
        };

        // Area buttons
        document.getElementById('add-area-btn').onclick = () => {
            const name = prompt("Area name:");
            if (!name || !name.trim()) return;
            const id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
            // Check for duplicate ID
            if (this.mapData.areas.some(a => a.id === id)) return alert("An area with a similar name already exists.");
            this.mapData.areas.push({ id, name: name.trim(), unlockItem: "", floors: [this.getEmptyFloor()] });
            this.currentArea = this.mapData.areas.length - 1;
            this.currentFloor = 0;
            this.renderAreaControls();
            this.renderFloorControls();
            this.renderGrid();
            this.loadWallTextureGrid();
            this.updateWallTexPreview();
            this.loadFloorTextureGrid();
            this.updateFloorTexPreview();
            this.loadCeilingTextureGrid();
            this.updateCeilingTexPreview();
            this.wmPopulateRegionDropdown();
            this.wmRender();
            UI.showStatus('map-status-msg', `Added area: ${name.trim()}`);
        };

        document.getElementById('rename-area-btn').onclick = () => {
            const area = this.getArea();
            const name = prompt("New area name:", area.name);
            if (!name || !name.trim()) return;
            area.name = name.trim();
            area.id = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
            this.renderAreaControls();
            this.loadWallTextureGrid();
            this.updateWallTexPreview();
            this.loadFloorTextureGrid();
            this.updateFloorTexPreview();
            this.loadCeilingTextureGrid();
            this.updateCeilingTexPreview();
            this.wmPopulateRegionDropdown();
            this.wmRender();
            UI.showStatus('map-status-msg', `Renamed area to: ${name.trim()}`);
        };

        document.getElementById('del-area-btn').onclick = () => {
            if (this.mapData.areas.length <= 1) return alert("You must have at least one area!");
            if (!confirm(`Delete area "${this.getArea().name}" and all its floors? This cannot be undone.`)) return;
            const deletedId = this.getArea().id;
            this.mapData.areas.splice(this.currentArea, 1);
            this.currentArea = Math.max(0, this.currentArea - 1);
            this.currentFloor = 0;
            // Clean up world map regions referencing deleted area
            if (this.mapData.worldMap && this.mapData.worldMap.regions) {
                this.mapData.worldMap.regions.forEach(row => {
                    for (let c = 0; c < row.length; c++) {
                        if (row[c] === deletedId) row[c] = null;
                    }
                });
            }
            this.renderAreaControls();
            this.renderFloorControls();
            this.renderGrid();
            this.loadWallTextureGrid();
            this.updateWallTexPreview();
            this.loadFloorTextureGrid();
            this.updateFloorTexPreview();
            this.loadCeilingTextureGrid();
            this.updateCeilingTexPreview();
            this.wmPopulateRegionDropdown();
            this.wmRender();
        };
    },

    updateAreaUnlockDropdown() {
        const unlockSelect = document.getElementById('area-unlock-item');
        if (unlockSelect) {
            unlockSelect.value = this.getArea().unlockItem || "";
        }
    },

    // --- Wall Texture Grid ---
    wallTexDrawing: false,
    wallTexMode: 'draw', // 'draw' or 'erase'

    initWallTextureGrid() {
        const grid = document.getElementById('wall-tex-grid');
        if (!grid) return;
        grid.innerHTML = '';

        // Init colour picker for wall texture
        InkGrid.initColourPicker('wall-tex-grid');

        for (let r = 0; r < 16; r++) {
            for (let c = 0; c < 16; c++) {
                const cell = document.createElement('div');
                cell.style.cssText = 'border:0.5px solid #ddd; cursor:crosshair;';
                cell.dataset.r = r;
                cell.dataset.c = c;

                cell.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    const result = InkGrid.handleTexGridTool('wall-tex-grid', cell, r, c, null, () => { this.saveWallTextureFromGrid(); this.updateWallTexPreview(); });
                    if (result === 'handled') return;
                    this.wallTexDrawing = true;
                    if (InkGrid.gridErasing['wall-tex-grid']) {
                        this.wallTexMode = 'erase';
                    } else if (cell.dataset.colour) {
                        this.wallTexMode = 'erase';
                    } else {
                        this.wallTexMode = 'draw';
                    }
                    this.paintWallTexCell(cell);
                });
                cell.addEventListener('mouseenter', () => {
                    if (this.wallTexDrawing) this.paintWallTexCell(cell);
                });
                grid.appendChild(cell);
            }
        }

        document.addEventListener('mouseup', () => { this.wallTexDrawing = false; });

        document.getElementById('clear-wall-tex-btn').onclick = () => {
            this.getArea().wallTexture = null;
            this.loadWallTextureGrid();
            this.updateWallTexPreview();
        };

        this.loadWallTextureGrid();
        this.updateWallTexPreview();
    },

    paintWallTexCell(cell) {
        if (this.wallTexMode === 'draw') {
            const colour = InkGrid.getColour('wall-tex-grid');
            cell.style.background = colour;
            cell.dataset.colour = colour;
        } else {
            cell.style.background = '';
            delete cell.dataset.colour;
        }
        this.saveWallTextureFromGrid();
        this.updateWallTexPreview();
    },

    loadWallTextureGrid() {
        const grid = document.getElementById('wall-tex-grid');
        if (!grid) return;
        const tex = this.getArea().wallTexture;
        const cells = grid.children;
        for (let r = 0; r < 16; r++) {
            for (let c = 0; c < 16; c++) {
                const cell = cells[r * 16 + c];
                const val = tex && tex[r] ? tex[r][c] : 0;
                const colour = resolvePixelColour(val);
                if (colour) {
                    cell.style.background = colour;
                    cell.dataset.colour = colour;
                } else {
                    cell.style.background = '';
                    delete cell.dataset.colour;
                }
            }
        }
    },

    saveWallTextureFromGrid() {
        const grid = document.getElementById('wall-tex-grid');
        if (!grid) return;
        const cells = grid.children;
        let tex = [];
        let hasAny = false;
        for (let r = 0; r < 16; r++) {
            let row = [];
            for (let c = 0; c < 16; c++) {
                const colour = cells[r * 16 + c].dataset.colour;
                row.push(colour || 0);
                if (colour) hasAny = true;
            }
            tex.push(row);
        }
        this.getArea().wallTexture = hasAny ? tex : null;
    },

    updateWallTexPreview() {
        const preview = document.getElementById('wall-tex-preview');
        if (!preview) return;
        const tex = this.getArea().wallTexture;
        const W = preview.offsetWidth || 56;
        const H = preview.offsetHeight || 90;
        const canvas = preview.querySelector('canvas') || document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        if (!preview.querySelector('canvas')) {
            preview.innerHTML = '';
            preview.appendChild(canvas);
        }
        const pCtx = canvas.getContext('2d');
        pCtx.fillStyle = '#fdfcf0';
        pCtx.fillRect(0, 0, W, H);

        if (tex) {
            const pw = W / 16;
            const ph = H / 16;
            for (let r = 0; r < 16; r++) {
                for (let c = 0; c < 16; c++) {
                    const val = tex[r] ? tex[r][c] : 0;
                    const colour = resolvePixelColour(val);
                    if (colour) {
                        pCtx.fillStyle = colour;
                        pCtx.fillRect(c * pw, r * ph, pw, ph);
                    }
                }
            }
        } else {
            pCtx.fillStyle = '#111';
            pCtx.globalAlpha = 0.5;
            const numRows = 4;
            for (let row = 1; row < numRows; row++) {
                let y = H * (row / numRows);
                pCtx.fillRect(0, y - 0.5, W, 1.5);
            }
            for (let row = 0; row < numRows; row++) {
                let offset = row % 2 === 0 ? 0 : 0.5;
                let xPos = (0.5 + offset) * (W / 2);
                let yT = H * (row / numRows);
                let yB = H * ((row + 1) / numRows);
                if (xPos < W) pCtx.fillRect(xPos - 0.5, yT, 1.5, yB - yT);
            }
            pCtx.globalAlpha = 1.0;
        }
    },

    // --- Floor Texture Grid ---
    floorTexDrawing: false,
    floorTexMode: 'draw',

    initFloorTextureGrid() {
        const grid = document.getElementById('floor-tex-grid');
        if (!grid) return;
        grid.innerHTML = '';

        InkGrid.initColourPicker('floor-tex-grid');

        for (let r = 0; r < 16; r++) {
            for (let c = 0; c < 16; c++) {
                const cell = document.createElement('div');
                cell.style.cssText = 'border:0.5px solid #ddd; cursor:crosshair;';
                cell.dataset.r = r;
                cell.dataset.c = c;

                cell.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    const result = InkGrid.handleTexGridTool('floor-tex-grid', cell, r, c, null, () => { this.saveFloorTextureFromGrid(); this.updateFloorTexPreview(); });
                    if (result === 'handled') return;
                    this.floorTexDrawing = true;
                    if (InkGrid.gridErasing['floor-tex-grid']) {
                        this.floorTexMode = 'erase';
                    } else if (cell.dataset.colour) {
                        this.floorTexMode = 'erase';
                    } else {
                        this.floorTexMode = 'draw';
                    }
                    this.paintFloorTexCell(cell);
                });
                cell.addEventListener('mouseenter', () => {
                    if (this.floorTexDrawing) this.paintFloorTexCell(cell);
                });
                grid.appendChild(cell);
            }
        }

        document.addEventListener('mouseup', () => { this.floorTexDrawing = false; });

        document.getElementById('clear-floor-tex-btn').onclick = () => {
            this.getArea().floorTexture = null;
            this.loadFloorTextureGrid();
            this.updateFloorTexPreview();
        };

        this.loadFloorTextureGrid();
        this.updateFloorTexPreview();
    },

    paintFloorTexCell(cell) {
        if (this.floorTexMode === 'draw') {
            const colour = InkGrid.getColour('floor-tex-grid');
            cell.style.background = colour;
            cell.dataset.colour = colour;
        } else {
            cell.style.background = '';
            delete cell.dataset.colour;
        }
        this.saveFloorTextureFromGrid();
        this.updateFloorTexPreview();
    },

    loadFloorTextureGrid() {
        const grid = document.getElementById('floor-tex-grid');
        if (!grid) return;
        const tex = this.getArea().floorTexture;
        const cells = grid.children;
        for (let r = 0; r < 16; r++) {
            for (let c = 0; c < 16; c++) {
                const cell = cells[r * 16 + c];
                const val = tex && tex[r] ? tex[r][c] : 0;
                const colour = resolvePixelColour(val);
                if (colour) {
                    cell.style.background = colour;
                    cell.dataset.colour = colour;
                } else {
                    cell.style.background = '';
                    delete cell.dataset.colour;
                }
            }
        }
    },

    saveFloorTextureFromGrid() {
        const grid = document.getElementById('floor-tex-grid');
        if (!grid) return;
        const cells = grid.children;
        let tex = [];
        let hasAny = false;
        for (let r = 0; r < 16; r++) {
            let row = [];
            for (let c = 0; c < 16; c++) {
                const colour = cells[r * 16 + c].dataset.colour;
                row.push(colour || 0);
                if (colour) hasAny = true;
            }
            tex.push(row);
        }
        this.getArea().floorTexture = hasAny ? tex : null;
    },

    updateFloorTexPreview() {
        const preview = document.getElementById('floor-tex-preview');
        if (!preview) return;
        const tex = this.getArea().floorTexture;
        const W = preview.offsetWidth || 128;
        const H = preview.offsetHeight || 128;
        const canvas = preview.querySelector('canvas') || document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        if (!preview.querySelector('canvas')) { preview.innerHTML = ''; preview.appendChild(canvas); }
        const pCtx = canvas.getContext('2d');
        pCtx.fillStyle = '#fdfcf0';
        pCtx.fillRect(0, 0, W, H);
        if (tex) {
            const pw = W / 16, ph = H / 16;
            for (let r = 0; r < 16; r++) {
                for (let c = 0; c < 16; c++) {
                    const colour = resolvePixelColour(tex[r] ? tex[r][c] : 0);
                    if (colour) { pCtx.fillStyle = colour; pCtx.fillRect(c * pw, r * ph, pw, ph); }
                }
            }
        }
    },

    // --- Ceiling Texture Grid ---
    ceilTexDrawing: false,
    ceilTexMode: 'draw',

    initCeilingTextureGrid() {
        const grid = document.getElementById('ceil-tex-grid');
        if (!grid) return;
        grid.innerHTML = '';

        InkGrid.initColourPicker('ceil-tex-grid');

        for (let r = 0; r < 16; r++) {
            for (let c = 0; c < 16; c++) {
                const cell = document.createElement('div');
                cell.style.cssText = 'border:0.5px solid #ddd; cursor:crosshair;';
                cell.dataset.r = r;
                cell.dataset.c = c;

                cell.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    const result = InkGrid.handleTexGridTool('ceil-tex-grid', cell, r, c, null, () => { this.saveCeilingTextureFromGrid(); this.updateCeilingTexPreview(); });
                    if (result === 'handled') return;
                    this.ceilTexDrawing = true;
                    if (InkGrid.gridErasing['ceil-tex-grid']) {
                        this.ceilTexMode = 'erase';
                    } else if (cell.dataset.colour) {
                        this.ceilTexMode = 'erase';
                    } else {
                        this.ceilTexMode = 'draw';
                    }
                    this.paintCeilTexCell(cell);
                });
                cell.addEventListener('mouseenter', () => {
                    if (this.ceilTexDrawing) this.paintCeilTexCell(cell);
                });
                grid.appendChild(cell);
            }
        }

        document.addEventListener('mouseup', () => { this.ceilTexDrawing = false; });

        document.getElementById('clear-ceil-tex-btn').onclick = () => {
            this.getArea().ceilingTexture = null;
            this.loadCeilingTextureGrid();
            this.updateCeilingTexPreview();
        };

        this.loadCeilingTextureGrid();
        this.updateCeilingTexPreview();
    },

    paintCeilTexCell(cell) {
        if (this.ceilTexMode === 'draw') {
            const colour = InkGrid.getColour('ceil-tex-grid');
            cell.style.background = colour;
            cell.dataset.colour = colour;
        } else {
            cell.style.background = '';
            delete cell.dataset.colour;
        }
        this.saveCeilingTextureFromGrid();
        this.updateCeilingTexPreview();
    },

    loadCeilingTextureGrid() {
        const grid = document.getElementById('ceil-tex-grid');
        if (!grid) return;
        const tex = this.getArea().ceilingTexture;
        const cells = grid.children;
        for (let r = 0; r < 16; r++) {
            for (let c = 0; c < 16; c++) {
                const cell = cells[r * 16 + c];
                const val = tex && tex[r] ? tex[r][c] : 0;
                const colour = resolvePixelColour(val);
                if (colour) {
                    cell.style.background = colour;
                    cell.dataset.colour = colour;
                } else {
                    cell.style.background = '';
                    delete cell.dataset.colour;
                }
            }
        }
    },

    saveCeilingTextureFromGrid() {
        const grid = document.getElementById('ceil-tex-grid');
        if (!grid) return;
        const cells = grid.children;
        let tex = [];
        let hasAny = false;
        for (let r = 0; r < 16; r++) {
            let row = [];
            for (let c = 0; c < 16; c++) {
                const colour = cells[r * 16 + c].dataset.colour;
                row.push(colour || 0);
                if (colour) hasAny = true;
            }
            tex.push(row);
        }
        this.getArea().ceilingTexture = hasAny ? tex : null;
    },

    updateCeilingTexPreview() {
        const preview = document.getElementById('ceil-tex-preview');
        if (!preview) return;
        const tex = this.getArea().ceilingTexture;
        const W = preview.offsetWidth || 128;
        const H = preview.offsetHeight || 128;
        const canvas = preview.querySelector('canvas') || document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        if (!preview.querySelector('canvas')) { preview.innerHTML = ''; preview.appendChild(canvas); }
        const pCtx = canvas.getContext('2d');
        pCtx.fillStyle = '#fdfcf0';
        pCtx.fillRect(0, 0, W, H);
        if (tex) {
            const pw = W / 16, ph = H / 16;
            for (let r = 0; r < 16; r++) {
                for (let c = 0; c < 16; c++) {
                    const colour = resolvePixelColour(tex[r] ? tex[r][c] : 0);
                    if (colour) { pCtx.fillStyle = colour; pCtx.fillRect(c * pw, r * ph, pw, ph); }
                }
            }
        }
    },

    // --- World Map Editor ---
    wmMode: 'draw', // 'draw' or 'region'
    wmDrawing: false,
    wmRegionColors: ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'],

    initWorldMap() {
        if (!this.mapData.worldMap) {
            this.mapData.worldMap = { pixels: null, regions: null };
        }

        // Init colour picker for world map
        InkGrid.initColourPicker('wm-canvas');

        const canvas = document.getElementById('wm-canvas');
        const ctx = canvas.getContext('2d');

        // Mode buttons
        document.getElementById('wm-mode-draw').onclick = () => this.setWmMode('draw');
        document.getElementById('wm-mode-region').onclick = () => this.setWmMode('region');

        // Canvas mouse events
        canvas.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.wmDrawing = true;
            const pos = this.wmCanvasToGrid(e, canvas);
            if (this.wmMode === 'draw') {
                const px = this.getWmPixels();
                const existing = px[pos.r][pos.c];
                // If eraser active or pixel has colour, erase; otherwise draw
                if (InkGrid.gridErasing['wm-canvas']) {
                    this.wmDrawMode = 'erase';
                } else if (existing && existing !== 0) {
                    this.wmDrawMode = 'erase';
                } else {
                    this.wmDrawMode = 'draw';
                }
                this.wmPaintPixel(pos.r, pos.c);
            } else {
                this.wmPaintRegion(pos.r, pos.c);
            }
        });
        canvas.addEventListener('mousemove', (e) => {
            if (!this.wmDrawing) return;
            const pos = this.wmCanvasToGrid(e, canvas);
            if (this.wmMode === 'draw') {
                this.wmPaintPixel(pos.r, pos.c);
            } else {
                this.wmPaintRegion(pos.r, pos.c);
            }
        });
        document.addEventListener('mouseup', () => { this.wmDrawing = false; });

        // Clear buttons
        document.getElementById('wm-clear-draw').onclick = () => {
            this.mapData.worldMap.pixels = null;
            this.wmRender();
        };
        document.getElementById('wm-clear-regions').onclick = () => {
            this.mapData.worldMap.regions = null;
            this.wmRender();
        };

        this.wmPopulateRegionDropdown();
        this.wmRender();
    },

    setWmMode(mode) {
        this.wmMode = mode;
        document.getElementById('wm-mode-draw').style.background = mode === 'draw' ? 'var(--accent-blue)' : 'var(--border-color)';
        document.getElementById('wm-mode-region').style.background = mode === 'region' ? 'var(--accent-blue)' : 'var(--border-color)';
        document.getElementById('wm-region-controls').style.display = mode === 'region' ? 'block' : 'none';
        const wmPicker = document.getElementById('colour-picker-wm-canvas');
        if (wmPicker) wmPicker.style.display = mode === 'draw' ? '' : 'none';
        document.getElementById('wm-canvas').style.cursor = mode === 'draw' ? 'crosshair' : 'pointer';
    },

    wmCanvasToGrid(e, canvas) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const cellSize = canvas.width / 20;
        return { r: Math.min(19, Math.max(0, Math.floor(y / cellSize))), c: Math.min(19, Math.max(0, Math.floor(x / cellSize))) };
    },

    getWmPixels() {
        if (!this.mapData.worldMap.pixels) {
            this.mapData.worldMap.pixels = Array(20).fill(null).map(() => Array(20).fill(0));
        }
        return this.mapData.worldMap.pixels;
    },

    getWmRegions() {
        if (!this.mapData.worldMap.regions) {
            this.mapData.worldMap.regions = Array(20).fill(null).map(() => Array(20).fill(null));
        }
        return this.mapData.worldMap.regions;
    },

    wmPaintPixel(r, c) {
        const px = this.getWmPixels();
        if (this.wmDrawMode === 'draw') {
            px[r][c] = InkGrid.getColour('wm-canvas');
        } else {
            px[r][c] = 0;
        }
        this.wmRender();
    },

    wmPaintRegion(r, c) {
        const regions = this.getWmRegions();
        const sel = document.getElementById('wm-region-area');
        const areaId = sel.value;
        if (!areaId) {
            regions[r][c] = null; // Eraser
        } else {
            regions[r][c] = areaId;
        }
        this.wmRender();
    },

    wmPopulateRegionDropdown() {
        const sel = document.getElementById('wm-region-area');
        if (!sel) return;
        sel.innerHTML = '<option value="">Eraser (Remove Region)</option>';
        this.mapData.areas.forEach((area, i) => {
            const color = this.wmRegionColors[i % this.wmRegionColors.length];
            sel.innerHTML += `<option value="${area.id}" style="color:${color}; font-weight:bold;">${area.name}</option>`;
        });

        // Legend
        const legend = document.getElementById('wm-legend');
        if (legend) {
            legend.innerHTML = '';
            this.mapData.areas.forEach((area, i) => {
                const color = this.wmRegionColors[i % this.wmRegionColors.length];
                legend.innerHTML += `<div style="display:flex; align-items:center; gap:6px; margin-bottom:3px;"><span style="display:inline-block; width:14px; height:14px; background:${color}; opacity:0.5; border:1px solid #999;"></span> ${area.name}</div>`;
            });
        }
    },

    wmGetAreaColorIndex(areaId) {
        const idx = this.mapData.areas.findIndex(a => a.id === areaId);
        return idx >= 0 ? idx : 0;
    },

    wmRender() {
        const canvas = document.getElementById('wm-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const S = canvas.width;
        const cell = S / 20;

        // Background
        ctx.fillStyle = '#fdfcf0';
        ctx.fillRect(0, 0, S, S);

        // Draw pixels
        const px = this.mapData.worldMap ? this.mapData.worldMap.pixels : null;
        if (px) {
            for (let r = 0; r < 20; r++) {
                for (let c = 0; c < 20; c++) {
                    const val = px[r] ? px[r][c] : 0;
                    const colour = resolvePixelColour(val);
                    if (colour) {
                        ctx.fillStyle = colour;
                        ctx.fillRect(c * cell, r * cell, cell, cell);
                    }
                }
            }
        }

        // Draw region overlay
        const regions = this.mapData.worldMap ? this.mapData.worldMap.regions : null;
        if (regions) {
            ctx.globalAlpha = 0.35;
            for (let r = 0; r < 20; r++) {
                for (let c = 0; c < 20; c++) {
                    if (regions[r] && regions[r][c]) {
                        const colorIdx = this.wmGetAreaColorIndex(regions[r][c]);
                        ctx.fillStyle = this.wmRegionColors[colorIdx % this.wmRegionColors.length];
                        ctx.fillRect(c * cell, r * cell, cell, cell);
                    }
                }
            }
            ctx.globalAlpha = 1.0;
        }

        // Grid lines
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= 20; i++) {
            ctx.beginPath(); ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, S); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, i * cell); ctx.lineTo(S, i * cell); ctx.stroke();
        }
    },

    renderToolbar() {
        const palette = document.getElementById('tile-palette');
        if (!palette) return;
        palette.innerHTML = '';

        this.tools.forEach(tool => {
            const swatch = document.createElement('div');
            swatch.className = `tile-swatch${this.currentTool === tool.id ? ' active' : ''}`;
            swatch.title = tool.tip;

            const dot = document.createElement('span');
            dot.className = 'swatch-dot';
            dot.style.backgroundColor = tool.color;
            swatch.appendChild(dot);

            const label = document.createElement('span');
            label.textContent = tool.name;
            swatch.appendChild(label);

            swatch.onclick = () => this.selectTool(tool.id);
            palette.appendChild(swatch);
        });

        // Line/Rect buttons are already in the HTML, just wire them up
        const lineBtn = document.getElementById('map-line-btn');
        const rectBtn = document.getElementById('map-rect-btn');

        if (lineBtn) {
            lineBtn.onclick = () => {
                this.lineMode = !this.lineMode;
                this.lineStart = null;
                if (this.lineMode && this.rectMode) {
                    this.rectMode = false;
                    this.rectStart = null;
                    rectBtn.classList.remove('active');
                    rectBtn.innerText = 'Rect: OFF';
                }
                lineBtn.classList.toggle('active', this.lineMode);
                lineBtn.innerText = this.lineMode ? 'Line: ON' : 'Line: OFF';
                UI.showStatus('map-status-msg', this.lineMode ? 'Line mode ON: click start then end.' : 'Line mode OFF.');
            };
        }

        if (rectBtn) {
            rectBtn.onclick = () => {
                this.rectMode = !this.rectMode;
                this.rectStart = null;
                if (this.rectMode && this.lineMode) {
                    this.lineMode = false;
                    this.lineStart = null;
                    lineBtn.classList.remove('active');
                    lineBtn.innerText = 'Line: OFF';
                }
                rectBtn.classList.toggle('active', this.rectMode);
                rectBtn.innerText = this.rectMode ? 'Rect: ON' : 'Rect: OFF';
                UI.showStatus('map-status-msg', this.rectMode ? 'Rect mode ON: click first corner, then opposite corner.' : 'Rect mode OFF.');
            };
        }

        this.updateContextBar();
    },

    renderFloorControls() {
        const floorSelect = document.getElementById('floor-select');
        if(!floorSelect) return;
        
        const floors = this.getFloors();
        floorSelect.innerHTML = '';
        floors.forEach((_, index) => {
            floorSelect.innerHTML += `<option value="${index}">Floor ${index + 1}</option>`;
        });
        floorSelect.value = this.currentFloor;
        
        floorSelect.onchange = (e) => {
            this.currentFloor = parseInt(e.target.value);
            this.renderGrid();
            this.updateContextBar();
        };
    },

    selectTool(toolId) {
        this.currentTool = toolId;
        // Update palette swatches
        const swatches = document.querySelectorAll('#tile-palette .tile-swatch');
        swatches.forEach((swatch, index) => {
            if (index < this.tools.length) {
                if (this.tools[index].id === toolId) swatch.classList.add('active');
                else swatch.classList.remove('active');
            }
        });

        const subSelector = document.getElementById('map-sub-selector');
        const goldInput = document.getElementById('map-gold-input');
        const winText = document.getElementById('map-win-text');
        const configHint = document.getElementById('tile-config-hint');
        
        subSelector.innerHTML = '';
        subSelector.style.display = 'none';
        if (goldInput) { goldInput.style.display = 'none'; goldInput.placeholder = 'Gold Amount'; }
        if (winText) { winText.style.display = 'none'; winText.placeholder = 'Victory text...'; }
        const bwType = document.getElementById('map-bw-type');
        if (bwType) bwType.style.display = 'none';
        if (configHint) configHint.style.display = 'none';

        if (toolId === 4) {
            subSelector.style.display = 'block';
            if (this.dbData.items.length === 0) subSelector.innerHTML = "<option value=''>No items in DB!</option>";
            else this.dbData.items.forEach(i => subSelector.innerHTML += `<option value="${i.id}">${i.name}</option>`);
        } else if (toolId === 5) {
            subSelector.style.display = 'block';
            if (this.dbData.monsters.length === 0) subSelector.innerHTML = "<option value=''>No monsters in DB!</option>";
            else this.dbData.monsters.forEach(m => subSelector.innerHTML += `<option value="${m.id}">${m.name}</option>`);
        } else if (toolId === 8) { 
            subSelector.style.display = 'block';
            if (goldInput) goldInput.style.display = 'block';
            subSelector.innerHTML = "<option value=''>No Item (Gold Only)</option>";
            this.dbData.items.forEach(i => subSelector.innerHTML += `<option value="${i.id}">${i.name}</option>`);
        } else if (toolId === 9) {
            subSelector.style.display = 'block';
            const weapons = this.dbData.items.filter(i => i.type === 'weapon');
            if (weapons.length === 0) subSelector.innerHTML = "<option value=''>No Weapons in DB!</option>";
            else weapons.forEach(w => subSelector.innerHTML += `<option value="${w.id}">${w.name}</option>`);
            if (bwType) bwType.style.display = 'block';
        } else if (toolId === 10) { 
            subSelector.style.display = 'block';
            const keys = this.dbData.items.filter(i => i.type === 'key');
            if (keys.length === 0) subSelector.innerHTML = "<option value=''>No Key Items in DB!</option>";
            else keys.forEach(k => subSelector.innerHTML += `<option value="${k.id}">${k.name}</option>`);
        } else if (toolId === 11) {
            subSelector.style.display = 'block';
            const npcs = this.dbData.npcs || [];
            if (npcs.length === 0) subSelector.innerHTML = "<option value=''>No NPCs in DB!</option>";
            else npcs.forEach(n => subSelector.innerHTML += `<option value="${n.id}">${n.name}</option>`);
        } else if (toolId === 12) {
            if (winText) winText.style.display = 'block';
        } else if (toolId === 14) {
            if (winText) { winText.style.display = 'block'; winText.placeholder = 'Scroll text...'; }
        } else if (toolId === 15) {
            subSelector.style.display = 'block';
            subSelector.innerHTML = '<option value="pit">Pit</option><option value="spikes">Spikes</option><option value="darts">Darts</option>';
            if (goldInput) { goldInput.style.display = 'block'; goldInput.placeholder = 'Damage'; goldInput.value = ''; }
        } else {
            // No config needed for this tile
            if (configHint) configHint.style.display = 'block';
        }

        this.updateContextBar();
    },

    updateContextBar() {
        const area = this.getArea();
        const areaName = document.getElementById('context-area-name');
        const floorName = document.getElementById('context-floor-name');
        const tileName = document.getElementById('context-tile-name');
        if (areaName) areaName.textContent = area ? area.name : '—';
        if (floorName) floorName.textContent = `${this.currentFloor + 1}`;
        const tool = this.tools.find(t => t.id === this.currentTool);
        if (tileName) tileName.textContent = tool ? `${tool.name} (${tool.id})` : '—';
    },

    snapshotFloor() {
        const floor = this.getFloor();
        return {
            floorIndex: this.currentFloor,
            grid: JSON.parse(JSON.stringify(floor.grid)),
            placements: JSON.parse(JSON.stringify(floor.placements))
        };
    },

    pushUndo() {
        this.undoStack.push(this.snapshotFloor());
        if (this.undoStack.length > this.MAX_UNDO) this.undoStack.shift();
        this.redoStack = [];
    },

    undo() {
        if (this.undoStack.length === 0) {
            UI.showStatus('map-status-msg', 'Nothing to undo.');
            return;
        }
        // Save current state to redo before restoring
        this.redoStack.push(this.snapshotFloor());
        const snapshot = this.undoStack.pop();
        // Switch to the floor that was edited if needed
        this.currentFloor = snapshot.floorIndex;
        this.getFloor().grid = snapshot.grid;
        this.getFloor().placements = snapshot.placements;
        this.renderFloorControls();
        this.renderGrid();
        UI.showStatus('map-status-msg', `Undo. (${this.undoStack.length} left)`);
    },

    redo() {
        if (this.redoStack.length === 0) {
            UI.showStatus('map-status-msg', 'Nothing to redo.');
            return;
        }
        this.undoStack.push(this.snapshotFloor());
        const snapshot = this.redoStack.pop();
        this.currentFloor = snapshot.floorIndex;
        this.getFloor().grid = snapshot.grid;
        this.getFloor().placements = snapshot.placements;
        this.renderFloorControls();
        this.renderGrid();
        UI.showStatus('map-status-msg', `Redo. (${this.redoStack.length} left)`);
    },

    renderGrid() {
        const gridElement = document.getElementById('map-grid');
        gridElement.innerHTML = '';
        const currentFloorData = this.getFloor();

        for (let y = 0; y < currentFloorData.grid.length; y++) {
            for (let x = 0; x < currentFloorData.grid[y].length; x++) {
                let tile = document.createElement('div');
                let tileVal = currentFloorData.grid[y][x];
                tile.className = `tile tile-${tileVal}`;
                tile.dataset.x = x;
                tile.dataset.y = y;
                
                if (tileVal === 6) tile.style.backgroundColor = "#9c27b0";
                if (tileVal === 7) tile.style.backgroundColor = "#673ab7";
                if (tileVal === 8) tile.style.backgroundColor = "#ff9800";
                if (tileVal === 9) tile.style.backgroundColor = "#6d5040";
                if (tileVal === 10) tile.style.backgroundColor = "#006064";
                if (tileVal === 11) tile.style.backgroundColor = "#2e7d32";
                if (tileVal === 12) tile.style.backgroundColor = "#ffd700";
                if (tileVal === 13) tile.style.backgroundColor = "#9e8e7e";
                if (tileVal === 14) tile.style.backgroundColor = "#d4a574";
                if (tileVal === 15) tile.style.backgroundColor = "#a04040";
                
                let key = `${x},${y}`;
                if (tileVal === 4 && currentFloorData.placements.items[key]) tile.title = currentFloorData.placements.items[key];
                if (tileVal === 5 && currentFloorData.placements.monsters[key]) tile.title = currentFloorData.placements.monsters[key];
                if (tileVal === 10 && currentFloorData.placements.doors[key]) tile.title = `Locked: ${currentFloorData.placements.doors[key]}`;
                if (tileVal === 8 && currentFloorData.placements.chests[key]) {
                    let c = currentFloorData.placements.chests[key];
                    tile.title = `Chest: ${c.item || 'No Item'} | ${c.gold}G`;
                }
                if (tileVal === 11 && currentFloorData.placements.npcs[key]) {
                    tile.title = `NPC: ${currentFloorData.placements.npcs[key]}`;
                }
                if (tileVal === 12 && currentFloorData.placements.wins[key]) {
                    tile.title = `Win: "${currentFloorData.placements.wins[key]}"`;
                }
                if (tileVal === 13) {
                    tile.title = "Illusionary Wall (walkable)";
                }
                if (tileVal === 9 && currentFloorData.placements.breakwalls[key]) {
                    let bw = currentFloorData.placements.breakwalls[key];
                    tile.title = `Breakable (${bw.subtype}): needs ${bw.weaponId}`;
                }
                if (tileVal === 14 && currentFloorData.placements.lore[key]) {
                    tile.title = `Scroll: "${currentFloorData.placements.lore[key].text}"`;
                }
                if (tileVal === 15 && currentFloorData.placements.traps[key]) {
                    let t = currentFloorData.placements.traps[key];
                    tile.title = `Trap: ${t.subtype} (${t.damage} dmg)`;
                }

                tile.addEventListener('mousedown', (e) => {
    		e.preventDefault();

    		if (this.rectMode) {
        	    this.handleRectClick(x, y);
        	    return;
    		}

    		if (this.lineMode) {
        	this.handleLineClick(x, y);
        	return;
    		}

    		this.pushUndo();
    		this.isDrawing = true;
    		this.paintTile(x, y, tile);
});

tile.addEventListener('mouseenter', () => {
    if (!this.lineMode && this.isDrawing) this.paintTile(x, y, tile);
});

tile.addEventListener('contextmenu', (e) => {
    if (typeof PreviewRenderer !== 'undefined' && PreviewRenderer.isOpen() && !PreviewRenderer.active) {
        e.preventDefault();
        PreviewRenderer.teleportTo(x, y);
    }
});

                gridElement.appendChild(tile);
            }
        }
        // Refresh live preview
        if (typeof PreviewRenderer !== 'undefined') PreviewRenderer.scheduleRefresh();
    },

    paintTile(x, y, tileElement) {
        let floor = this.getFloor();
        let key = `${x},${y}`;
        const subSelector = document.getElementById('map-sub-selector');
        const goldInput = document.getElementById('map-gold-input');

        delete floor.placements.items[key];
        delete floor.placements.monsters[key];
        delete floor.placements.chests[key];
        delete floor.placements.doors[key];
        delete floor.placements.npcs[key];
        delete floor.placements.wins[key];
        delete floor.placements.lore[key];
        delete floor.placements.traps[key];
        delete floor.placements.breakwalls[key];

        if (this.currentTool === 4 && subSelector.value) floor.placements.items[key] = subSelector.value;
        else if (this.currentTool === 5 && subSelector.value) floor.placements.monsters[key] = subSelector.value;
        else if (this.currentTool === 8) floor.placements.chests[key] = { item: subSelector.value, gold: parseInt(goldInput.value) || 0 };
        else if (this.currentTool === 9 && subSelector.value) {
            let st = (document.getElementById('map-bw-type').value || 'cracked');
            floor.placements.breakwalls[key] = { subtype: st, weaponId: subSelector.value };
        }
        else if (this.currentTool === 10 && subSelector.value) floor.placements.doors[key] = subSelector.value;
        else if (this.currentTool === 11 && subSelector.value) floor.placements.npcs[key] = subSelector.value;
        else if (this.currentTool === 12) floor.placements.wins[key] = document.getElementById('map-win-text').value || "You win!";
        else if (this.currentTool === 14) floor.placements.lore[key] = { text: document.getElementById('map-win-text').value || "You find a note...", persist: false };
        else if (this.currentTool === 15) floor.placements.traps[key] = { subtype: subSelector.value || 'pit', damage: parseInt(goldInput.value) || 5 };

        floor.grid[y][x] = this.currentTool;

        if ([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].includes(this.currentTool)) { 
            this.renderGrid(); 
        } else { 
            tileElement.className = `tile tile-${this.currentTool}`; 
            tileElement.style.backgroundColor = ""; 
            tileElement.title = "";
            if (typeof PreviewRenderer !== 'undefined') PreviewRenderer.scheduleRefresh();
        }
    },
handleLineClick(x, y) {
    // First click: set start
    if (!this.lineStart) {
        this.lineStart = { x, y };
        UI.showStatus('map-status-msg', `Line start set at (${x},${y}). Now click the end tile.`);
        return;
    }

    // Second click: draw line
    const start = this.lineStart;
    this.lineStart = null;

    this.pushUndo();
    const points = this.getLinePoints(start.x, start.y, x, y);
    points.forEach(p => this.applyToolAt(p.x, p.y));

    this.renderGrid();
    UI.showStatus('map-status-msg', `Drew line (${start.x},${start.y}) → (${x},${y}).`);
},

handleRectClick(x, y) {
    if (!this.rectStart) {
        this.rectStart = { x, y };
        UI.showStatus('map-status-msg', `Rect corner 1 set at (${x},${y}). Now click the opposite corner.`);
        return;
    }

    const s = this.rectStart;
    this.rectStart = null;

    this.pushUndo();
    const minX = Math.min(s.x, x), maxX = Math.max(s.x, x);
    const minY = Math.min(s.y, y), maxY = Math.max(s.y, y);

    for (let ry = minY; ry <= maxY; ry++) {
        for (let rx = minX; rx <= maxX; rx++) {
            // Only paint the border, not the interior
            if (rx === minX || rx === maxX || ry === minY || ry === maxY) {
                this.applyToolAt(rx, ry);
            }
        }
    }

    this.renderGrid();
    UI.showStatus('map-status-msg', `Drew rect (${s.x},${s.y}) → (${x},${y}).`);
},

getLinePoints(x0, y0, x1, y1) {
    // Bresenham line (simple + reliable)
    const points = [];
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;

    while (true) {
        points.push({ x: x0, y: y0 });
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return points;
},

applyToolAt(x, y) {
    // Paint logic without needing the tile DOM element
    let floor = this.getFloor();
    let key = `${x},${y}`;
    const subSelector = document.getElementById('map-sub-selector');
    const goldInput = document.getElementById('map-gold-input');

    delete floor.placements.items[key];
    delete floor.placements.monsters[key];
    delete floor.placements.chests[key];
    delete floor.placements.doors[key];
    delete floor.placements.npcs[key];
    delete floor.placements.wins[key];
    delete floor.placements.lore[key];
    delete floor.placements.traps[key];
    delete floor.placements.breakwalls[key];

    if (this.currentTool === 4 && subSelector.value) floor.placements.items[key] = subSelector.value;
    else if (this.currentTool === 5 && subSelector.value) floor.placements.monsters[key] = subSelector.value;
    else if (this.currentTool === 8) floor.placements.chests[key] = { item: subSelector.value, gold: parseInt(goldInput.value) || 0 };
    else if (this.currentTool === 9 && subSelector.value) {
        let st = (document.getElementById('map-bw-type').value || 'cracked');
        floor.placements.breakwalls[key] = { subtype: st, weaponId: subSelector.value };
    }
    else if (this.currentTool === 10 && subSelector.value) floor.placements.doors[key] = subSelector.value;
    else if (this.currentTool === 11 && subSelector.value) floor.placements.npcs[key] = subSelector.value;
    else if (this.currentTool === 12) floor.placements.wins[key] = document.getElementById('map-win-text').value || "You win!";
    else if (this.currentTool === 14) floor.placements.lore[key] = { text: document.getElementById('map-win-text').value || "You find a note...", persist: false };
    else if (this.currentTool === 15) floor.placements.traps[key] = { subtype: subSelector.value || 'pit', damage: parseInt(goldInput.value) || 5 };

    floor.grid[y][x] = this.currentTool;
},
    setupControls() {
        // Undo/Redo keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Only handle when map editor tab is active
            if (!document.getElementById('view-map').classList.contains('active')) return;
            // P toggles live preview interactive mode
            if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey && typeof PreviewRenderer !== 'undefined') {
                if (PreviewRenderer.isOpen()) {
                    if (PreviewRenderer.active) PreviewRenderer.exitInteractive();
                    else PreviewRenderer.enterInteractive();
                }
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.undo();
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                this.redo();
            }
        });

        document.getElementById('save-map-btn').addEventListener('click', async () => {
            const result = await API.saveMap(this.mapData);
            UI.showStatus('map-status-msg', result.message, result.status !== 'success');
        });

        document.getElementById('export-game-btn').addEventListener('click', async () => {
            await API.saveMap(this.mapData);
            const result = await API.exportGame();
            UI.showStatus('map-status-msg', result.message, result.status !== 'success');
        });
document.getElementById('test-play-btn').addEventListener('click', async () => {
    await API.saveMap(this.mapData);

    try {
        const resp = await fetch('/playtest');
        if (!resp.ok) {
            UI.showStatus('map-status-msg', 'Playtest failed: server error.', true);
            return;
        }
        const html = await resp.text();
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        UI.showStatus('map-status-msg', 'Opened Test Play in a new tab.');
    } catch (e) {
        UI.showStatus('map-status-msg', 'Playtest error: ' + e.message, true);
    }
});

        const addBtn = document.getElementById('add-floor-btn');
        if(addBtn) {
            addBtn.addEventListener('click', () => {
                if(this.getTotalFloors() >= this.MAX_TOTAL_FLOORS) return alert(`Maximum of ${this.MAX_TOTAL_FLOORS} total floors reached!`);
                document.getElementById('floor-template-modal').style.display = 'flex';
            });
        }
        
        const delBtn = document.getElementById('del-floor-btn');
        if(delBtn) {
            delBtn.addEventListener('click', () => {
                const floors = this.getFloors();
                if(floors.length <= 1) return alert("You must have at least one floor per area!");
                if(confirm("Delete this floor completely? This cannot be undone.")) {
                    floors.splice(this.currentFloor, 1);
                    this.currentFloor = Math.max(0, this.currentFloor - 1);
                    this.renderAreaControls();
                    this.renderFloorControls();
                    this.renderGrid();
                }
            });
        }
    },

    closeTemplateModal() {
        document.getElementById('floor-template-modal').style.display = 'none';
    },

    addFloorWithTemplate(type) {
        this.closeTemplateModal();
        const grid = this.generateGrid(type);
        const floors = this.getFloors();
        floors.push({
            grid,
            placements: { items: {}, monsters: {}, chests: {}, doors: {}, npcs: {}, wins: {}, lore: {}, traps: {}, breakwalls: {} }
        });
        this.currentFloor = floors.length - 1;
        this.renderAreaControls();
        this.renderFloorControls();
        this.renderGrid();

        const labels = { empty: 'Empty', border: 'Border Walls', maze: 'Maze' };
        UI.showStatus('map-status-msg', `Added Floor ${this.currentFloor + 1} (${labels[type]}) to ${this.getArea().name}.`);
    },

    generateGrid(type) {
        const S = 20;
        // Empty — all floor
        if (type === 'empty') {
            return Array(S).fill(null).map(() => Array(S).fill(0));
        }
        // Border Walls — walls on edges, floor inside
        if (type === 'border') {
            return Array(S).fill(null).map((_, y) =>
                Array(S).fill(null).map((_, x) =>
                    (x === 0 || x === S - 1 || y === 0 || y === S - 1) ? 1 : 0
                )
            );
        }
        // Maze — recursive backtracker
        if (type === 'maze') {
            return this.generateMaze(S);
        }
        return Array(S).fill(null).map(() => Array(S).fill(0));
    },

    generateMaze(size) {
        // Start with all walls
        const grid = Array(size).fill(null).map(() => Array(size).fill(1));

        // Maze cells are on odd coordinates (1,3,5,...,19)
        // This gives us a 10x10 logical maze within the 20x20 grid
        const cellsW = Math.floor(size / 2);
        const cellsH = Math.floor(size / 2);
        const visited = Array(cellsH).fill(null).map(() => Array(cellsW).fill(false));

        const toGrid = (cx, cy) => [cx * 2 + 1, cy * 2 + 1];
        const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];

        const shuffle = (arr) => {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        };

        const carve = (cx, cy) => {
            visited[cy][cx] = true;
            const [gx, gy] = toGrid(cx, cy);
            grid[gy][gx] = 0;

            for (const [dx, dy] of shuffle([...dirs])) {
                const nx = cx + dx, ny = cy + dy;
                if (nx < 0 || nx >= cellsW || ny < 0 || ny >= cellsH) continue;
                if (visited[ny][nx]) continue;

                // Carve the wall between current cell and neighbour
                const wallX = gx + dx;
                const wallY = gy + dy;
                grid[wallY][wallX] = 0;

                carve(nx, ny);
            }
        };

        // Start from a random cell
        const startCX = Math.floor(Math.random() * cellsW);
        const startCY = Math.floor(Math.random() * cellsH);
        carve(startCX, startCY);

        return grid;
    }
};

document.addEventListener('DOMContentLoaded', () => { MapEditor.init(); });