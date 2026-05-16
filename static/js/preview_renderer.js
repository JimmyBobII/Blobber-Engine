const PreviewRenderer = {
    canvas: null,
    ctx: null,
    active: false,       // interactive mode
    playerX: 10,
    playerY: 10,
    playerDir: 0,        // 0=N, 1=E, 2=S, 3=W
    doorState: {},        // "x,y" -> true if toggled in preview
    _keyHandler: null,
    _refreshTimer: null,

    init(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
    },

    isOpen() {
        const body = document.getElementById('preview-body');
        return body && body.classList.contains('open');
    },

    // Called by MapEditor whenever grid changes
    refresh() {
        if (!this.isOpen()) return;
        if (!this.canvas) return;
        this.render();
        this.updatePosLabel();
    },

    // Debounced refresh for rapid painting
    scheduleRefresh() {
        if (this._refreshTimer) clearTimeout(this._refreshTimer);
        this._refreshTimer = setTimeout(() => {
            this._refreshTimer = null;
            this.refresh();
        }, 50);
    },

    teleportTo(x, y) {
        this.playerX = x;
        this.playerY = y;
        this.playerDir = 0; // face north
        this.doorState = {};
        this.refresh();
    },

    updatePosLabel() {
        const el = document.getElementById('preview-pos');
        if (!el) return;
        const dirs = ['N', 'E', 'S', 'W'];
        el.textContent = `Pos: ${this.playerX}, ${this.playerY} ${dirs[this.playerDir]}`;
    },

    enterInteractive() {
        this.active = true;
        document.getElementById('preview-enter-btn').textContent = 'Exit Preview';
        document.getElementById('preview-enter-btn').style.background = 'var(--accent-blue, #3a7ca5)';
        // Disable map grid
        const grid = document.getElementById('map-grid');
        if (grid) { grid.style.opacity = '0.7'; grid.style.pointerEvents = 'none'; }

        this._keyHandler = (e) => this.handleKeyDown(e);
        window.addEventListener('keydown', this._keyHandler);
        this.canvas.focus();
    },

    exitInteractive() {
        this.active = false;
        document.getElementById('preview-enter-btn').textContent = 'Enter Preview';
        document.getElementById('preview-enter-btn').style.background = 'var(--accent-green, #4a8c5c)';
        // Re-enable map grid
        const grid = document.getElementById('map-grid');
        if (grid) { grid.style.opacity = ''; grid.style.pointerEvents = ''; }

        if (this._keyHandler) {
            window.removeEventListener('keydown', this._keyHandler);
            this._keyHandler = null;
        }
    },

    handleKeyDown(e) {
        const key = e.key.toLowerCase();
        if (key === 'escape') { this.exitInteractive(); return; }

        let moved = false;
        if (key === 'w' || key === 'arrowup') { this.moveForward(); moved = true; }
        else if (key === 's' || key === 'arrowdown') { this.moveBack(); moved = true; }
        else if (key === 'q' || key === 'arrowleft') { this.turnLeft(); moved = true; }
        else if (key === 'e' || key === 'arrowright') { this.turnRight(); moved = true; }
        else if (key === 'a') { this.strafeLeft(); moved = true; }
        else if (key === 'd') { this.strafeRight(); moved = true; }
        else if (key === ' ' || key === 'space') { this.interact(); moved = true; }

        if (moved) {
            e.preventDefault();
            e.stopPropagation();
            this.refresh();
        }
    },

    _getGrid() {
        try { return MapEditor.getFloor().grid; } catch(e) { return null; }
    },

    _tileAt(grid, x, y) {
        if (x < 0 || x >= 20 || y < 0 || y >= 20) return 1;
        let tile = grid[y][x];
        // Check door state overlay
        let key = `${x},${y}`;
        if (this.doorState[key]) {
            if (tile === 2) return 3;  // closed -> open
            if (tile === 3) return 2;  // open -> closed
        }
        return tile;
    },

    _isWall(tile) { return [1, 2, 9, 10, 13].includes(tile); },

    _canWalk(tile) { return [0, 3, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15].includes(tile); },

    moveForward() {
        const grid = this._getGrid();
        if (!grid) return;
        let nx = this.playerX, ny = this.playerY;
        if (this.playerDir === 0) ny--; else if (this.playerDir === 1) nx++;
        else if (this.playerDir === 2) ny++; else if (this.playerDir === 3) nx--;
        if (nx >= 0 && nx < 20 && ny >= 0 && ny < 20 && this._canWalk(this._tileAt(grid, nx, ny))) {
            this.playerX = nx; this.playerY = ny;
        }
    },

    moveBack() {
        const grid = this._getGrid();
        if (!grid) return;
        let nx = this.playerX, ny = this.playerY;
        if (this.playerDir === 0) ny++; else if (this.playerDir === 1) nx--;
        else if (this.playerDir === 2) ny--; else if (this.playerDir === 3) nx++;
        if (nx >= 0 && nx < 20 && ny >= 0 && ny < 20 && this._canWalk(this._tileAt(grid, nx, ny))) {
            this.playerX = nx; this.playerY = ny;
        }
    },

    turnLeft() { this.playerDir = (this.playerDir + 3) % 4; },
    turnRight() { this.playerDir = (this.playerDir + 1) % 4; },
strafeLeft() {
        const grid = this._getGrid();
        if (!grid) return;
        let nx = this.playerX, ny = this.playerY;
        if (this.playerDir === 0) nx--; else if (this.playerDir === 1) ny--;
        else if (this.playerDir === 2) nx++; else if (this.playerDir === 3) ny++;
        if (nx >= 0 && nx < 20 && ny >= 0 && ny < 20 && this._canWalk(this._tileAt(grid, nx, ny))) {
            this.playerX = nx; this.playerY = ny;
        }
    },

    strafeRight() {
        const grid = this._getGrid();
        if (!grid) return;
        let nx = this.playerX, ny = this.playerY;
        if (this.playerDir === 0) nx++; else if (this.playerDir === 1) ny++;
        else if (this.playerDir === 2) nx--; else if (this.playerDir === 3) ny--;
        if (nx >= 0 && nx < 20 && ny >= 0 && ny < 20 && this._canWalk(this._tileAt(grid, nx, ny))) {
            this.playerX = nx; this.playerY = ny;
        }
    },

    interact() {
        const grid = this._getGrid();
        if (!grid) return;
        let tx = this.playerX, ty = this.playerY;
        if (this.playerDir === 0) ty--; else if (this.playerDir === 1) tx++;
        else if (this.playerDir === 2) ty++; else if (this.playerDir === 3) tx--;
        if (tx < 0 || tx >= 20 || ty < 0 || ty >= 20) return;
        let tile = grid[ty][tx];
        let key = `${tx},${ty}`;
        // Toggle door in local state
        if (tile === 2 || tile === 3 || tile === 10) {
            this.doorState[key] = !this.doorState[key];
        }
    },

    // ------ SURFACE TEXTURE (adapted from game_template.html drawSurfaceTexture) ------
    drawSurfaceTexture(W, H, HALF) {
        const ctx = this.ctx;
        let seed = (this.playerX * 7 + this.playerY * 13 + this.playerDir * 3) % 100;
        let vpX = W / 2, vpY = HALF;

        // Get floor/ceiling textures from current area
        let floorTex = null, ceilTex = null;
        try {
            floorTex = MapEditor.getArea().floorTexture || null;
            ceilTex = MapEditor.getArea().ceilingTexture || null;
        } catch(e) {}

        ctx.strokeStyle = "#1a1612";
        ctx.lineWidth = 1;

        // --- FLOOR ---
        if (!floorTex) {
            // --- FLOOR STONEWORK (procedural) ---
            let floorRows = 8;
            let floorYs = [];
            for (let i = 0; i <= floorRows; i++) {
                let t = i / floorRows;
                let y = HALF + t * t * (HALF - 5);
                let wobble = ((seed + i * 17) % 5) - 2;
                floorYs.push(y + wobble * 0.5);
            }
            ctx.globalAlpha = 0.16;
            for (let i = 1; i < floorYs.length; i++) {
                ctx.beginPath(); ctx.moveTo(0, floorYs[i]); ctx.lineTo(W, floorYs[i]); ctx.stroke();
            }
            let stonesPerRow = 5;
            for (let row = 0; row < floorRows; row++) {
                let yTop = floorYs[row], yBot = floorYs[row + 1];
                if (yBot - yTop < 3) continue;
                ctx.globalAlpha = 0.07 + (row / floorRows) * 0.11;
                let offset = (row % 2 === 0) ? 0 : 0.5;
                for (let s = 1; s < stonesPerRow; s++) {
                    let frac = (s / stonesPerRow) + offset / stonesPerRow;
                    if (frac >= 1) frac -= 1;
                    if (frac <= 0.01 || frac >= 0.99) continue;
                    let jitter = ((seed + row * 31 + s * 47) % 9 - 4) * 0.015;
                    frac += jitter;
                    let topScale = (yTop - vpY) / HALF;
                    let topX = vpX + (frac - 0.5) * W * Math.max(0.2, topScale);
                    let botScale = (yBot - vpY) / HALF;
                    let botX = vpX + (frac - 0.5) * W * Math.max(0.2, botScale);
                    ctx.beginPath(); ctx.moveTo(topX, yTop); ctx.lineTo(botX, yBot); ctx.stroke();
                }
            }
            // Floor cracks
            ctx.globalAlpha = 0.05;
            for (let i = 0; i < 5; i++) {
                let x = ((seed + i * 97) * 53) % W;
                let yStart = HALF + 50 + ((seed + i * 31) % 120);
                let len = 12 + ((seed + i * 43) % 25);
                if (yStart + len > HALF * 2 - 5) continue;
                ctx.beginPath(); ctx.moveTo(x, yStart);
                ctx.lineTo(x + ((seed + i * 7) % 7) - 3, yStart + len * 0.4);
                ctx.lineTo(x + ((seed + i * 13) % 9) - 4, yStart + len);
                ctx.stroke();
            }
            // Floor dust
            ctx.fillStyle = "#1a1612"; ctx.globalAlpha = 0.04;
            for (let i = 0; i < 20; i++) {
                let px = ((seed + i * 73) * 37) % W;
                let py = HALF + 20 + ((seed + i * 51) * 29) % (HALF - 30);
                ctx.fillRect(px, py, 1, 1);
            }
        }

        // --- CEILING ---
        if (!ceilTex) {
            // --- CEILING STONEWORK (procedural) ---
            let ceilRows = 6;
            let ceilYs = [];
            for (let i = 0; i <= ceilRows; i++) {
                let t = i / ceilRows;
                ceilYs.push(HALF - t * t * (HALF - 5) + ((seed + i * 23) % 5 - 2) * 0.4);
            }
            ctx.globalAlpha = 0.11;
            for (let i = 1; i < ceilYs.length; i++) {
                ctx.beginPath(); ctx.moveTo(0, ceilYs[i]); ctx.lineTo(W, ceilYs[i]); ctx.stroke();
            }
            let ceilStones = 4;
            for (let row = 0; row < ceilRows; row++) {
                let yBot = ceilYs[row], yTop = ceilYs[row + 1];
                if (Math.abs(yBot - yTop) < 3) continue;
                ctx.globalAlpha = 0.05 + (row / ceilRows) * 0.08;
                let offset = (row % 2 === 0) ? 0 : 0.5;
                for (let s = 1; s < ceilStones; s++) {
                    let frac = (s / ceilStones) + offset / ceilStones;
                    if (frac >= 1) frac -= 1;
                    if (frac <= 0.01 || frac >= 0.99) continue;
                    let jitter = ((seed + row * 37 + s * 53) % 7 - 3) * 0.015;
                    frac += jitter;
                    let botDist = Math.abs(yBot - vpY) / HALF;
                    let botX = vpX + (frac - 0.5) * W * Math.max(0.2, botDist);
                    let topDist = Math.abs(yTop - vpY) / HALF;
                    let topX = vpX + (frac - 0.5) * W * Math.max(0.2, topDist);
                    ctx.beginPath(); ctx.moveTo(botX, yBot); ctx.lineTo(topX, yTop); ctx.stroke();
                }
            }
            // Ceiling cracks
            ctx.globalAlpha = 0.04;
            for (let i = 0; i < 3; i++) {
                let x = ((seed + i * 67) * 41) % W;
                let yStart = 15 + ((seed + i * 29) % 70);
                let len = 10 + ((seed + i * 19) % 20);
                if (yStart + len > HALF - 15) continue;
                ctx.beginPath(); ctx.moveTo(x, yStart);
                ctx.lineTo(x + ((seed + i * 11) % 7) - 3, yStart + len * 0.5);
                ctx.lineTo(x + ((seed + i * 17) % 5) - 2, yStart + len);
                ctx.stroke();
            }
        }

        ctx.globalAlpha = 1.0;
    },

    // ------ FLOOR/CEILING TEXTURE PERSPECTIVE RENDERING ------
    // ------ SPRITE DRAW HELPERS (adapted from game_template.html) ------
    drawSpriteInRect(sprite, bx, by, bw, bh) {
        if (!sprite) return;
        let size = Math.min(bw, bh) * 0.8;
        let pxSize = size / 16;
        if (pxSize < 0.5) return;
        let oX = bx + (bw - size) / 2, oY = by + (bh - size) / 2;
        for (let r = 0; r < 16; r++) {
            for (let c = 0; c < 16; c++) {
                const pixColour = resolvePixelColour(sprite[r] ? sprite[r][c] : 0);
                if (pixColour) {
                    this.ctx.fillStyle = pixColour;
                    this.ctx.fillRect(oX + c * pxSize, oY + r * pxSize, pxSize, pxSize);
                }
            }
        }
    },

    drawChestSprite(bx, by, bw, bh) {
        const ctx = this.ctx;
        let cx = bx + bw / 2, cy = by + bh * 0.95;
        let cW = bw * 0.8, cH = bh * 0.6;
        let cX = cx - cW / 2, cY = cy - cH;
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = "#fdfcf0"; ctx.fillRect(cX, cY, cW, cH);
        ctx.strokeStyle = "#111"; ctx.lineWidth = 2; ctx.strokeRect(cX, cY, cW, cH);
        ctx.beginPath(); ctx.moveTo(cX, cY + cH * 0.3); ctx.lineTo(cX + cW, cY + cH * 0.3); ctx.stroke();
        let claspSize = Math.max(2, cH * 0.1);
        ctx.fillStyle = "#111"; ctx.fillRect(cx - claspSize, cY + cH * 0.3 - claspSize, claspSize * 2, claspSize * 2);
    },

    drawItem(bx, by, bw, bh) {
        const ctx = this.ctx;
        let cx = bx + bw / 2, cy = by + bh * 0.55;
        let r = Math.min(bw, bh) * 0.2;
        ctx.strokeStyle = "#111"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.5); ctx.lineTo(cx, cy + r * 0.5); ctx.stroke();
    },

    drawStairsUp(bx, by, bw, bh) {
        const ctx = this.ctx;
        let cx = bx + bw / 2, cy = by + bh * 0.5; let w = bw * 0.75, h = bh * 0.2;
        ctx.fillStyle = "#111"; ctx.strokeStyle = "#fdfcf0"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx - w/2 * 1.2, cy - h/2); ctx.lineTo(cx + w/2 * 1.2, cy - h/2);
        ctx.lineTo(cx + w/2, cy + h/2); ctx.lineTo(cx - w/2, cy + h/2); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx - w/2.1, cy); ctx.lineTo(cx + w/2.1, cy); ctx.stroke();
    },

    drawStairsDown(bx, by, bw, bh) {
        const ctx = this.ctx;
        let cx = bx + bw / 2, cy = by + bh * 0.9; let w = bw * 0.75, h = bh * 0.2;
        ctx.fillStyle = "#111"; ctx.strokeStyle = "#fdfcf0"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx - w/2, cy - h/2); ctx.lineTo(cx + w/2, cy - h/2);
        ctx.lineTo(cx + w/2 * 1.2, cy + h/2); ctx.lineTo(cx - w/2 * 1.2, cy + h/2); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx - w/2.1, cy); ctx.lineTo(cx + w/2.1, cy); ctx.stroke();
    },

    drawWin(bx, by, bw, bh) {
        const ctx = this.ctx;
        let cx = bx + bw / 2, cy = by + bh * 0.5, r = bw * 0.2;
        ctx.strokeStyle = "#111"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
        ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2); ctx.stroke();
    },

    drawLoreScroll(bx, by, bw, bh) {
        const ctx = this.ctx;
        let cx = bx + bw / 2, cy = by + bh * 0.5;
        let sw = bw * 0.5, sh = bh * 0.7;
        let sx = cx - sw / 2, sy = cy - sh / 2;
        ctx.fillStyle = "#fdfcf0"; ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeStyle = "#111"; ctx.lineWidth = 2; ctx.strokeRect(sx, sy, sw, sh);
        let rollR = sw * 0.12;
        ctx.fillStyle = "#e8dcc8";
        ctx.beginPath(); ctx.arc(sx + sw / 2, sy, rollR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(sx + sw / 2, sy + sh, rollR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "#8a7040"; ctx.lineWidth = 1;
        for (let i = 1; i <= 3; i++) {
            let ly = sy + sh * (i / 4);
            ctx.beginPath(); ctx.moveTo(sx + sw * 0.15, ly); ctx.lineTo(sx + sw * 0.85, ly); ctx.stroke();
        }
    },

    drawTrapPit(bx, by, bw, bh) {
        const ctx = this.ctx;
        let cx = bx + bw / 2, cy = by + bh * 0.6;
        let rx = bw * 0.35, ry = bh * 0.2;
        ctx.fillStyle = "#1a1008";
        ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#111"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = "#5a4a30"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(cx, cy - ry * 0.15, rx * 0.85, ry * 0.6, 0, Math.PI, Math.PI * 2); ctx.stroke();
    },

    drawTrapSpikes(bx, by, bw, bh) {
        const ctx = this.ctx;
        let baseY = by + bh * 0.75, spikeH = bh * 0.4;
        let count = 5, gap = bw * 0.7 / count, startX = bx + bw * 0.15;
        ctx.fillStyle = "#888"; ctx.strokeStyle = "#111"; ctx.lineWidth = 1.5;
        for (let i = 0; i < count; i++) {
            let sx = startX + i * gap + gap / 2;
            ctx.beginPath(); ctx.moveTo(sx - gap * 0.3, baseY); ctx.lineTo(sx, baseY - spikeH);
            ctx.lineTo(sx + gap * 0.3, baseY); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        ctx.strokeStyle = "#555"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(startX, baseY); ctx.lineTo(startX + count * gap, baseY); ctx.stroke();
    },

    drawTrapDarts(bx, by, bw, bh) {
        const ctx = this.ctx;
        let cx = bx + bw / 2, cy = by + bh * 0.5;
        ctx.strokeStyle = "#111"; ctx.lineWidth = 2;
        for (let i = -1; i <= 1; i++) {
            let dy = cy + i * bh * 0.15;
            let sx = cx - bw * 0.25, ex = cx + bw * 0.25;
            ctx.beginPath(); ctx.moveTo(sx, dy); ctx.lineTo(ex, dy); ctx.stroke();
            ctx.fillStyle = "#888";
            ctx.beginPath(); ctx.moveTo(ex, dy); ctx.lineTo(ex - bw * 0.06, dy - bh * 0.04);
            ctx.lineTo(ex - bw * 0.06, dy + bh * 0.04); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = "#8b3030"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(sx, dy); ctx.lineTo(sx - bw * 0.04, dy - bh * 0.03);
            ctx.moveTo(sx, dy); ctx.lineTo(sx - bw * 0.04, dy + bh * 0.03); ctx.stroke();
            ctx.strokeStyle = "#111"; ctx.lineWidth = 2;
        }
    },

    // ------ MAIN RENDER (DDA raycaster adapted from game_template.html) ------
    render() {
        const grid = this._getGrid();
        if (!grid || !this.ctx) return;

        const W = this.canvas.width, H = this.canvas.height;
        const HALF = H / 2;
        const ctx = this.ctx;

        // Background
        ctx.fillStyle = "#fdfcf0";
        ctx.fillRect(0, 0, W, H);

        // Ceiling gradient
        let ceilGrad = ctx.createLinearGradient(0, 0, 0, HALF);
        ceilGrad.addColorStop(0, "rgba(26, 22, 18, 0.0)");
        ceilGrad.addColorStop(1, "rgba(26, 22, 18, 0.06)");
        ctx.fillStyle = ceilGrad; ctx.fillRect(0, 0, W, HALF);

        // Floor gradient
        let floorGrad = ctx.createLinearGradient(0, HALF, 0, H);
        floorGrad.addColorStop(0, "rgba(26, 22, 18, 0.06)");
        floorGrad.addColorStop(1, "rgba(26, 22, 18, 0.0)");
        ctx.fillStyle = floorGrad; ctx.fillRect(0, HALF, W, HALF);

        this.drawSurfaceTexture(W, H, HALF);

        // --- 1. DDA RAYCASTER ---
        const dirAngles = [Math.PI * 1.5, 0, Math.PI * 0.5, Math.PI];
        let playerAngle = dirAngles[this.playerDir];
        let px = this.playerX + 0.5, py = this.playerY + 0.5;
        let FOV = Math.PI / 3;
        let NUM_COLS = W;
        let colWidth = W / NUM_COLS;

        let spriteSet = new Set();
        let sprites = [];
        let wallSlices = [];
        let wallOverlays = {};

        for (let col = 0; col < NUM_COLS; col++) {
            let rayAngle = playerAngle - FOV / 2 + ((col + 0.5) / NUM_COLS) * FOV;
            let sinA = Math.sin(rayAngle), cosA = Math.cos(rayAngle);
            let mapX = Math.floor(px), mapY = Math.floor(py);
            let deltaDistX = Math.abs(1 / cosA) || 1e10;
            let deltaDistY = Math.abs(1 / sinA) || 1e10;
            let stepX, stepY, sideDistX, sideDistY;

            if (cosA > 0) { stepX = 1; sideDistX = (mapX + 1 - px) * deltaDistX; }
            else { stepX = -1; sideDistX = (px - mapX) * deltaDistX; }
            if (sinA > 0) { stepY = 1; sideDistY = (mapY + 1 - py) * deltaDistY; }
            else { stepY = -1; sideDistY = (py - mapY) * deltaDistY; }

            let hit = false, side = 0, hitTile = 1;

            for (let step = 0; step < 20; step++) {
                if (sideDistX < sideDistY) { sideDistX += deltaDistX; mapX += stepX; side = 0; }
                else { sideDistY += deltaDistY; mapY += stepY; side = 1; }

                if (mapX < 0 || mapX >= 20 || mapY < 0 || mapY >= 20) { hitTile = 1; hit = true; break; }

                let tile = this._tileAt(grid, mapX, mapY);

                if (!hit && [4, 5, 6, 7, 8, 11, 12, 14, 15].includes(tile)) {
                    let sprKey = `${mapX},${mapY}`;
                    if (!spriteSet.has(sprKey)) { spriteSet.add(sprKey); sprites.push({ tile, mx: mapX, my: mapY }); }
                }

                if (this._isWall(tile)) { hitTile = tile; hit = true; break; }
            }

            let dist;
            if (side === 0) dist = (mapX - px + (1 - stepX) / 2) / cosA;
            else dist = (mapY - py + (1 - stepY) / 2) / sinA;
            dist = Math.abs(dist);
            if (dist < 0.01) dist = 0.01;

            let corrDist = dist * Math.cos(rayAngle - playerAngle);
            if (corrDist < 0.01) corrDist = 0.01;

            let wallX;
            if (side === 0) wallX = py + dist * sinA;
            else wallX = px + dist * cosA;
            wallX -= Math.floor(wallX);

            wallSlices.push({ col, dist: corrDist, rawDist: dist, tile: hitTile, side, mapX, mapY, wallX });

            if ([2, 9, 10].includes(hitTile)) {
                let oKey = `${mapX},${mapY}`;
                if (!wallOverlays[oKey]) { wallOverlays[oKey] = { tile: hitTile, minCol: col, maxCol: col, dist: corrDist, side }; }
                else { wallOverlays[oKey].minCol = Math.min(wallOverlays[oKey].minCol, col); wallOverlays[oKey].maxCol = Math.max(wallOverlays[oKey].maxCol, col); }
            }
        }

        // --- 2. FLOOR/CEILING TEXTURE RENDERING (per-column floor casting) ---
        let floorTex = null, ceilTex = null;
        try {
            floorTex = MapEditor.getArea().floorTexture || null;
            ceilTex = MapEditor.getArea().ceilingTexture || null;
        } catch(e) {}

        if (floorTex || ceilTex) {
            for (let c = 0; c < wallSlices.length; c++) {
                let s = wallSlices[c];
                let x = c * colWidth;
                let wh = (H / s.dist);
                let wt = HALF - wh / 2;
                let wb = HALF + wh / 2;

                let screenDist = (NUM_COLS / 2) / Math.tan(FOV / 2);
                let rayAngle = playerAngle + Math.atan((col + 0.5 - NUM_COLS / 2) / screenDist);
                let cosRA = Math.cos(rayAngle - playerAngle);

                // Floor: scan from wb down to H
                if (floorTex) {
                    for (let y = Math.max(Math.floor(wb), HALF); y < H; y++) {
                        // Reverse project: at screen row y, what's the world distance?
                        let rowDist = HALF / (y - HALF);
                        let worldDist = rowDist / cosRA;

                        let worldX = px + Math.cos(rayAngle) * worldDist;
                        let worldY = py + Math.sin(rayAngle) * worldDist;

                        // Texture coordinates: fractional part maps to 16x16 texture
                        let texX = Math.floor((worldX % 1 + 1) % 1 * 16);
                        let texY = Math.floor((worldY % 1 + 1) % 1 * 16);
                        if (texX > 15) texX = 15;
                        if (texY > 15) texY = 15;

                        const pixColour = resolvePixelColour(floorTex[texY] ? floorTex[texY][texX] : 0);
                        if (pixColour) {
                            let fadeFactor = 1.0;
                            ctx.globalAlpha = fadeFactor;
                            ctx.fillStyle = pixColour;
                            ctx.fillRect(x, y, colWidth + 0.5, 1);
                        }
                    }
                }

                // Ceiling: scan from wt up to 0
                if (ceilTex) {
                    for (let y = Math.min(Math.floor(wt), HALF) - 1; y >= 0; y--) {
                        let rowDist = HALF / (HALF - y);
                        let worldDist = rowDist / cosRA;

                        let worldX = px + Math.cos(rayAngle) * worldDist;
                        let worldY = py + Math.sin(rayAngle) * worldDist;

                        let texX = Math.floor((worldX % 1 + 1) % 1 * 16);
                        let texY = Math.floor((worldY % 1 + 1) % 1 * 16);
                        if (texX > 15) texX = 15;
                        if (texY > 15) texY = 15;

                        const pixColour = resolvePixelColour(ceilTex[texY] ? ceilTex[texY][texX] : 0);
                        if (pixColour) {
                            let fadeFactor = 1.0;
                            ctx.globalAlpha = fadeFactor;
                            ctx.fillStyle = pixColour;
                            ctx.fillRect(x, y, colWidth + 0.5, 1);
                        }
                    }
                }
            }
            ctx.globalAlpha = 1.0;
        }

        // --- 3. DRAW WALL COLUMNS ---
        let wallTex = null;
        try { wallTex = MapEditor.getArea().wallTexture || null; } catch(e) {}

        for (let c = 0; c < wallSlices.length; c++) {
            let s = wallSlices[c];
            let prevS = c > 0 ? wallSlices[c - 1] : null;
            let x = c * colWidth;
            let wh = (H / s.dist);
            let wt = HALF - wh / 2;
            let wb = HALF + wh / 2;
            let fadeAlpha = Math.max(0.02, Math.min(1.0, 2.5 / s.dist));
            let shadeAlpha = s.side === 1 ? fadeAlpha * 0.4 : fadeAlpha;

            // CHANGE THIS NUMBER TO EXPERIMENT (0.1 to 0.9)
            const GHOST_OPACITY = 0.3; 

            // Wall base - skip parchment fill for textured walls
            if (!(wallTex && (s.tile === 1 || s.tile === 9 || s.tile === 13))) {
                ctx.globalAlpha = (s.tile === 13) ? GHOST_OPACITY : 1.0;
                ctx.fillStyle = "#fdfcf0";
                ctx.fillRect(x - 0.5, wt, colWidth + 1.5, wh);
            }

            // Textured wall
            if (wallTex && (s.tile === 1 || s.tile === 9 || s.tile === 13)) {
                let texCol = Math.floor(s.wallX * 16);
                if (texCol >= 16) texCol = 15;
                let rowH = wh / 16;
                for (let tr = 0; tr < 16; tr++) {
                    const pixVal = wallTex[tr] ? wallTex[tr][texCol] : 0;
                    const pixColour = resolvePixelColour(pixVal);
                    ctx.globalAlpha = (s.tile === 13) ? GHOST_OPACITY : 1.0;
                    ctx.fillStyle = pixColour || '#fdfcf0';
                    ctx.fillRect(x - 0.5, wt + tr * rowH, colWidth + 1.5, rowH + 0.5);
                }
                // Distance fade only — subtle darkening at range
                let dimAmount = 1 - fadeAlpha;
                if (s.side === 1) dimAmount += 0.08;
                if (dimAmount > 0.02) {
                    ctx.globalAlpha = Math.min((s.tile === 13) ? GHOST_OPACITY * 0.7 : 0.7, dimAmount);
                    ctx.fillStyle = "#1a1612";
                    ctx.fillRect(x - 0.5, wt, colWidth + 1.5, wh);
                }
            }
            // Procedural brickwork
            else if (s.tile === 1 || s.tile === 9 || s.tile === 13) {
                ctx.globalAlpha = (s.tile === 13) ? shadeAlpha * GHOST_OPACITY : shadeAlpha;
                ctx.fillStyle = "#111";
                let numRows = 4, bricksPerRow = 2;
                for (let row = 1; row < numRows; row++) {
                    let y = wt + wh * (row / numRows);
                    ctx.fillRect(x - 0.5, y - 0.5, colWidth + 1.5, 1.5);
                }
                for (let row = 0; row < numRows; row++) {
                    let offset = (row % 2 === 0) ? 0 : 0.5;
                    let currBrick = Math.floor(s.wallX * bricksPerRow + offset);
                    let prevBrick = prevS ? Math.floor(prevS.wallX * bricksPerRow + offset) : currBrick;
                    let isTileBoundary = prevS && (prevS.mapX !== s.mapX || prevS.mapY !== s.mapY);
                    if (!isTileBoundary && currBrick !== prevBrick) {
                        let yT = wt + wh * (row / numRows), yB = wt + wh * ((row + 1) / numRows);
                        ctx.fillRect(x - 1, yT, 2, yB - yT);
                    }
                }
            }
            // Wall seams
            if (prevS && (prevS.mapX !== s.mapX || prevS.mapY !== s.mapY)) {
                ctx.globalAlpha = fadeAlpha; ctx.fillStyle = "#111";
                ctx.fillRect(x - 1, wt, 2, wh);
            }
            // Top & bottom boundaries
            ctx.globalAlpha = fadeAlpha; ctx.fillStyle = "#111";
            ctx.fillRect(x - 0.5, wt - 1, colWidth + 1.5, 2);
            ctx.fillRect(x - 0.5, wb - 1, colWidth + 1.5, 2);

            if (prevS) {
                let prevWh = (H / prevS.dist);
                let prevWt = HALF - prevWh / 2, prevWb = HALF + prevWh / 2;
                if (Math.abs(wt - prevWt) > 0.5) {
                    let yMin = Math.min(wt, prevWt), yMax = Math.max(wt, prevWt);
                    ctx.fillRect(x - 1, yMin - 1, 2, yMax - yMin + 2);
                }
                if (Math.abs(wb - prevWb) > 0.5) {
                    let yMin = Math.min(wb, prevWb), yMax = Math.max(wb, prevWb);
                    ctx.fillRect(x - 1, yMin - 1, 2, yMax - yMin + 2);
                }
            }
        }

        // --- 3. DOOR / OVERLAY RENDERING ---
        for (let oKey in wallOverlays) {
            let ov = wallOverlays[oKey];
            let minC = ov.minCol, maxC = ov.maxCol;
            let midCol = Math.floor((minC + maxC) / 2);
            let sMid = wallSlices[midCol];
            let dist = sMid ? sMid.dist : ov.dist;
            let fadeAlpha = Math.max(0.02, Math.min(1.0, 2.5 / dist));

            ctx.globalAlpha = fadeAlpha;
            ctx.strokeStyle = "#111"; ctx.fillStyle = "#111"; ctx.lineWidth = 2;

            // Border trace
            ctx.beginPath();
            for (let c = minC; c <= maxC; c++) {
                let sl = wallSlices[c];
                let wh2 = Math.min(H, H / sl.dist), wt2 = HALF - wh2 / 2;
                let xx = c * colWidth;
                if (c === minC) ctx.moveTo(xx, wt2); else ctx.lineTo(xx, wt2);
                ctx.lineTo(xx + colWidth, wt2);
            }
            for (let c = maxC; c >= minC; c--) {
                let sl = wallSlices[c];
                let wh2 = Math.min(H, H / sl.dist), wb2 = HALF + wh2 / 2;
                let xx = c * colWidth;
                ctx.lineTo(xx + colWidth, wb2); ctx.lineTo(xx, wb2);
            }
            ctx.closePath(); ctx.stroke();

            let oX = minC * colWidth, oW = (maxC - minC + 1) * colWidth;
            let midX = oX + oW / 2;
            let midTop = HALF - Math.min(H, H / dist) / 2;
            let midBot = HALF + Math.min(H, H / dist) / 2;

            if (ov.tile === 2 || ov.tile === 10) {
                ctx.beginPath(); ctx.moveTo(oX, HALF); ctx.lineTo(oX + oW, HALF); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(midX, midTop); ctx.lineTo(midX, midBot); ctx.stroke();
                let avgH = Math.min(H, H / dist);
                if (ov.tile === 2) {
                    ctx.beginPath(); ctx.arc(midX + oW * 0.2, HALF, Math.max(2, avgH * 0.04), 0, Math.PI * 2); ctx.fill();
                } else if (ov.tile === 10) {
                    let khR = Math.max(3, avgH * 0.06);
                    ctx.beginPath(); ctx.arc(midX, HALF - khR * 0.5, khR, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.moveTo(midX - khR * 0.5, HALF); ctx.lineTo(midX + khR * 0.5, HALF);
                    ctx.lineTo(midX, HALF + khR * 1.5); ctx.closePath(); ctx.fill();
                }
            }

            // Breakable wall overlays
            if (ov.tile === 9) {
                let bwData = null;
                try { bwData = MapEditor.getFloor().placements.breakwalls[oKey]; } catch(e) {}
                let subtype = bwData ? bwData.subtype : 'cracked';
                let avgH = Math.min(H, H / dist);

                if (subtype === 'sealed') {
                    ctx.strokeStyle = "#7a5ac4"; ctx.lineWidth = Math.max(2, avgH * 0.015);
                    ctx.globalAlpha = fadeAlpha * 0.9;
                    let glR = Math.max(4, avgH * 0.1);
                    ctx.beginPath(); ctx.arc(midX, HALF, glR, 0, Math.PI * 2); ctx.stroke();
                    ctx.beginPath(); ctx.arc(midX, HALF, glR * 0.5, 0, Math.PI * 2); ctx.stroke();
                    for (let a = 0; a < 4; a++) {
                        let angle = a * Math.PI / 2 + Math.PI / 4;
                        ctx.beginPath();
                        ctx.moveTo(midX + Math.cos(angle) * glR * 0.6, HALF + Math.sin(angle) * glR * 0.6);
                        ctx.lineTo(midX + Math.cos(angle) * glR * 1.4, HALF + Math.sin(angle) * glR * 1.4);
                        ctx.stroke();
                    }
                } else {
                    ctx.strokeStyle = "#111"; ctx.lineWidth = Math.max(1.5, avgH * 0.012);
                    ctx.globalAlpha = fadeAlpha * 0.8;
                    ctx.beginPath();
                    ctx.moveTo(midX - oW * 0.3, midTop + avgH * 0.2);
                    ctx.lineTo(midX - oW * 0.05, HALF - avgH * 0.05);
                    ctx.lineTo(midX + oW * 0.1, HALF + avgH * 0.05);
                    ctx.lineTo(midX + oW * 0.3, midBot - avgH * 0.15);
                    ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(midX - oW * 0.05, HALF - avgH * 0.05);
                    ctx.lineTo(midX + oW * 0.25, HALF - avgH * 0.15); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(midX + oW * 0.1, HALF + avgH * 0.05);
                    ctx.lineTo(midX - oW * 0.15, HALF + avgH * 0.2); ctx.stroke();
                }
            }
        }

        // --- 4. ENTITY SPRITES ---
        sprites.sort((a, b) => {
            let da = (a.mx + 0.5 - px) ** 2 + (a.my + 0.5 - py) ** 2;
            let db = (b.mx + 0.5 - px) ** 2 + (b.my + 0.5 - py) ** 2;
            return db - da;
        });

        ctx.globalAlpha = 1.0;
        let dbData = null;
        try { dbData = MapEditor.dbData; } catch(e) {}
        let placements = null;
        try { placements = MapEditor.getFloor().placements; } catch(e) {}

        for (let sp of sprites) {
            let spX = sp.mx + 0.5 - px, spY = sp.my + 0.5 - py;
            let cosP = Math.cos(playerAngle), sinP = Math.sin(playerAngle);
            let depth = spX * cosP + spY * sinP;
            let lateral = -spX * sinP + spY * cosP;
            if (depth <= 0.1) continue;

            let screenX = (W / 2) + (lateral / depth) * (W / (2 * Math.tan(FOV / 2)));
            let fullHeight = Math.min(H * 0.95, H / depth);

            let scale = 0.6;
            if ([5, 11].includes(sp.tile)) scale = 0.65;
            if ([6, 7].includes(sp.tile)) scale = 0.85;
            if (sp.tile === 8) scale = 0.45;
            if (sp.tile === 4) scale = 0.35;
            if (sp.tile === 12) scale = 0.45;
            if (sp.tile === 14) scale = 0.4;
            if (sp.tile === 15) scale = 0.4;

            let spriteWidth = fullHeight * scale, spriteHeight = fullHeight * scale;
            let wallBot = HALF + Math.min(H, H / depth) / 2;
            let drawX = screenX - spriteWidth / 2, drawY = wallBot - spriteHeight;
            if (drawX + spriteWidth < 0 || drawX > W) continue;

            if (sp.tile === 5 && dbData && placements) {
                let key = `${sp.mx},${sp.my}`;
                let monId = placements.monsters[key];
                let mon = monId && dbData.monsters ? dbData.monsters.find(m => m.id === monId) : null;
                let sprite = mon ? mon.sprite : null;
                if (sprite) this.drawSpriteInRect(sprite, drawX, drawY, spriteWidth, spriteHeight);
            } else if (sp.tile === 11 && dbData && placements) {
                let key = `${sp.mx},${sp.my}`;
                let npcId = placements.npcs[key];
                let npc = npcId && dbData.npcs ? dbData.npcs.find(n => n.id === npcId) : null;
                let sprite = npc ? npc.sprite : null;
                if (sprite) this.drawSpriteInRect(sprite, drawX, drawY, spriteWidth, spriteHeight);
            } else if (sp.tile === 8) { this.drawChestSprite(drawX, drawY, spriteWidth, spriteHeight);
            } else if (sp.tile === 4) { this.drawItem(drawX, drawY, spriteWidth, spriteHeight);
            } else if (sp.tile === 6) { this.drawStairsUp(drawX, drawY, spriteWidth, spriteHeight);
            } else if (sp.tile === 7) { this.drawStairsDown(drawX, drawY, spriteWidth, spriteHeight);
            } else if (sp.tile === 12) { this.drawWin(drawX, drawY, spriteWidth, spriteHeight);
            } else if (sp.tile === 14) { this.drawLoreScroll(drawX, drawY, spriteWidth, spriteHeight);
            } else if (sp.tile === 15) {
                let trapKey = `${sp.mx},${sp.my}`;
                let trapData = placements ? placements.traps[trapKey] : null;
                let subtype = trapData ? trapData.subtype : 'pit';
                if (subtype === 'spikes') this.drawTrapSpikes(drawX, drawY, spriteWidth, spriteHeight);
                else if (subtype === 'darts') this.drawTrapDarts(drawX, drawY, spriteWidth, spriteHeight);
                else this.drawTrapPit(drawX, drawY, spriteWidth, spriteHeight);
            }
        }

        ctx.globalAlpha = 1.0;
    }
};
