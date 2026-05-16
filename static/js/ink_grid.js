// Resolve legacy 1-bit and new colour pixel values
function resolvePixelColour(val) {
    if (val === 1) return '#111111';    // legacy ink
    if (typeof val === 'string') return val;  // colour hex
    return null;                         // empty
}

const InkGrid = {
    isDrawing: false,
    drawMode: 'draw', // 'draw' or 'erase'
    activeGridId: null,

    // Per-grid colour state
    gridColours: {},   // { gridId: currentHexColour }
    gridErasing: {},   // { gridId: true/false }
    gridTool: {},      // { gridId: 'draw' | 'eyedropper' | 'fill' }

    DEFAULT_PALETTE: [
        '#111111', '#fdfcf0', '#888888', '#8b3030',
        '#2e7d32', '#3a7ca5', '#c4a030', '#6d5040',
        '#7a5ac4', '#1abc9c', '#e67e22', '#e91e8a',
        '#1a4a1a', '#1a3a6a', '#5a1a1a', '#d4b896'
    ],

    init() {
        this.renderGridFor('ink-grid');
        this.renderGridFor('npc-ink-grid');
        
        // Global mouseup to stop drawing
        document.addEventListener('mouseup', () => { 
            this.isDrawing = false; 
            this.activeGridId = null;
        });
    },

    // Get current draw colour for a grid (default: ink black)
    getColour(gridId) {
        return this.gridColours[gridId] || '#111111';
    },

    // Set current draw colour for a grid
    setColour(gridId, hex) {
        this.gridColours[gridId] = hex;
        this.gridErasing[gridId] = false;
        this.gridTool[gridId] = 'draw';
        // Update swatch
        const swatch = document.getElementById('colour-swatch-' + gridId);
        if (swatch) swatch.style.backgroundColor = hex;
        // Update custom input
        const custom = document.querySelector('#colour-picker-' + gridId + ' .colour-custom');
        if (custom) custom.value = hex;
        // Update active state on preset buttons
        const picker = document.getElementById('colour-picker-' + gridId);
        if (picker) {
            picker.querySelectorAll('.colour-preset-btn').forEach(btn => {
                btn.style.outline = btn.dataset.colour === hex ? '2px solid var(--text-main)' : 'none';
            });
            // Reset tool button highlights
            this.updateToolButtons(gridId);
        }
    },

    // Update visual state of eraser/eyedropper/fill buttons
    updateToolButtons(gridId) {
        const picker = document.getElementById('colour-picker-' + gridId);
        if (!picker) return;
        const eraser = picker.querySelector('.colour-eraser');
        const dropper = picker.querySelector('.colour-dropper');
        const fill = picker.querySelector('.colour-fill');
        const tool = this.gridTool[gridId] || 'draw';
        const erasing = this.gridErasing[gridId];
        if (eraser) eraser.style.outline = erasing ? '2px solid var(--text-main)' : 'none';
        if (dropper) dropper.style.outline = tool === 'eyedropper' ? '2px solid var(--text-main)' : 'none';
        if (fill) fill.style.outline = tool === 'fill' ? '2px solid var(--text-main)' : 'none';
    },

    // Initialize a colour picker for a grid
    initColourPicker(gridId) {
        const container = document.getElementById('colour-picker-' + gridId);
        if (!container) return;

        this.gridColours[gridId] = '#111111';
        this.gridErasing[gridId] = false;
        this.gridTool[gridId] = 'draw';

        let html = '<div style="display:flex; gap:3px; align-items:center; flex-wrap:wrap;">';
        // Current colour swatch
        html += `<div class="colour-swatch" id="colour-swatch-${gridId}" style="width:20px; height:20px; background:#111111; border:2px solid var(--border-color); cursor:pointer;" title="Current colour"></div>`;
        // Preset palette
        this.DEFAULT_PALETTE.forEach(hex => {
            html += `<div class="colour-preset-btn" data-colour="${hex}" style="width:14px; height:14px; background:${hex}; border:1px solid var(--border-color); cursor:pointer; flex-shrink:0;" title="${hex}"></div>`;
        });
        // Custom colour input
        html += `<input type="color" class="colour-custom" value="#111111" style="width:24px; height:20px; padding:0; border:1px solid var(--border-color); cursor:pointer;" title="Custom colour">`;
        // Eraser button
        html += `<button class="action-btn sidebar-btn colour-eraser" title="Eraser" style="background:var(--border-color); font-size:9px; padding:2px 5px !important;">✕</button>`;
        // Eyedropper button
        html += `<button class="action-btn sidebar-btn colour-dropper" title="Eyedropper — pick colour from grid" style="background:var(--border-color); font-size:11px; padding:2px 5px !important;">💧</button>`;
        // Fill button
        html += `<button class="action-btn sidebar-btn colour-fill" title="Fill — flood fill area with current colour" style="background:var(--border-color); font-size:11px; padding:2px 5px !important;">🪣</button>`;
        html += '</div>';
        container.innerHTML = html;

        // Wire up preset clicks
        container.querySelectorAll('.colour-preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setColour(gridId, btn.dataset.colour);
            });
        });

        // Wire up custom colour input
        const customInput = container.querySelector('.colour-custom');
        customInput.addEventListener('input', (e) => {
            this.setColour(gridId, e.target.value);
        });

        // Wire up eraser
        container.querySelector('.colour-eraser').addEventListener('click', () => {
            this.gridErasing[gridId] = true;
            this.gridTool[gridId] = 'draw';
            const swatch = document.getElementById('colour-swatch-' + gridId);
            if (swatch) swatch.style.backgroundColor = 'transparent';
            container.querySelectorAll('.colour-preset-btn').forEach(btn => {
                btn.style.outline = 'none';
            });
            this.updateToolButtons(gridId);
        });

        // Wire up eyedropper
        container.querySelector('.colour-dropper').addEventListener('click', () => {
            const active = this.gridTool[gridId] === 'eyedropper';
            this.gridTool[gridId] = active ? 'draw' : 'eyedropper';
            this.gridErasing[gridId] = false;
            this.updateToolButtons(gridId);
        });

        // Wire up fill
        container.querySelector('.colour-fill').addEventListener('click', () => {
            const active = this.gridTool[gridId] === 'fill';
            this.gridTool[gridId] = active ? 'draw' : 'fill';
            this.gridErasing[gridId] = false;
            this.updateToolButtons(gridId);
        });

        // Mark default colour active
        this.setColour(gridId, '#111111');
    },

    renderGridFor(elementId) {
        const gridElement = document.getElementById(elementId);
        if (!gridElement) return;
        
        gridElement.innerHTML = '';

        for (let r = 0; r < 16; r++) {
            for (let c = 0; c < 16; c++) {
                let cell = document.createElement('div');
                cell.className = 'ink-cell';
                
                cell.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    const tool = this.gridTool[elementId] || 'draw';

                    if (tool === 'eyedropper') {
                        // Pick colour from cell
                        const colour = cell.dataset.colour;
                        if (colour) {
                            this.setColour(elementId, colour);
                        }
                        return;
                    }

                    if (tool === 'fill') {
                        // Flood fill from this cell
                        const targetColour = cell.dataset.colour || null;
                        const fillColour = this.gridErasing[elementId] ? null : this.getColour(elementId);
                        if (targetColour === fillColour) return; // no-op
                        this.floodFill(elementId, r, c, targetColour, fillColour);
                        return;
                    }

                    // Normal draw/erase
                    this.isDrawing = true;
                    this.activeGridId = elementId;
                    if (this.gridErasing[elementId]) {
                        this.drawMode = 'erase';
                    } else if (cell.dataset.colour) {
                        this.drawMode = 'erase';
                    } else {
                        this.drawMode = 'draw';
                    }
                    this.applyCell(cell, elementId);
                });

                cell.addEventListener('mouseenter', () => {
                    if (this.isDrawing && this.activeGridId === elementId) {
                        this.applyCell(cell, elementId);
                    }
                });

                gridElement.appendChild(cell);
            }
        }
    },

    applyCell(cell, gridId) {
        if (this.drawMode === 'draw') {
            const colour = this.getColour(gridId);
            cell.style.backgroundColor = colour;
            cell.dataset.colour = colour;
        } else {
            cell.style.backgroundColor = '';
            delete cell.dataset.colour;
        }
    },

    // Flood fill from (startR, startC) replacing targetColour with fillColour
    floodFill(gridId, startR, startC, targetColour, fillColour) {
        const gridElement = document.getElementById(gridId);
        if (!gridElement) return;
        const cells = gridElement.querySelectorAll('.ink-cell');
        const getCell = (r, c) => cells[r * 16 + c];
        const getCellColour = (r, c) => getCell(r, c).dataset.colour || null;

        const stack = [[startR, startC]];
        const visited = new Set();

        while (stack.length > 0) {
            const [r, c] = stack.pop();
            if (r < 0 || r >= 16 || c < 0 || c >= 16) continue;
            const key = r * 16 + c;
            if (visited.has(key)) continue;
            visited.add(key);

            const cellColour = getCellColour(r, c);
            if (cellColour !== targetColour) continue;

            const cell = getCell(r, c);
            if (fillColour) {
                cell.style.backgroundColor = fillColour;
                cell.dataset.colour = fillColour;
            } else {
                cell.style.backgroundColor = '';
                delete cell.dataset.colour;
            }

            stack.push([r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]);
        }
    },

    clearGrid(elementId) {
        const gridElement = document.getElementById(elementId);
        if (!gridElement) return;
        const cells = gridElement.querySelectorAll('.ink-cell');
        cells.forEach(cell => {
            cell.style.backgroundColor = '';
            delete cell.dataset.colour;
        });
    },

    // Legacy clear for monster grid
    clear() {
        this.clearGrid('ink-grid');
    },

    // Load a sprite array into a grid for editing
    loadSpriteInto(elementId, spriteArray) {
        const gridElement = document.getElementById(elementId);
        if (!gridElement || !spriteArray) return;
        const cells = gridElement.querySelectorAll('.ink-cell');
        let idx = 0;
        for (let r = 0; r < 16; r++) {
            for (let c = 0; c < 16; c++) {
                const val = spriteArray[r] ? spriteArray[r][c] : 0;
                const colour = resolvePixelColour(val);
                if (colour) {
                    cells[idx].style.backgroundColor = colour;
                    cells[idx].dataset.colour = colour;
                } else {
                    cells[idx].style.backgroundColor = '';
                    delete cells[idx].dataset.colour;
                }
                idx++;
            }
        }
    },

    getSpriteArrayFrom(elementId) {
        const gridElement = document.getElementById(elementId);
        if (!gridElement) return Array(16).fill(null).map(() => Array(16).fill(0));
        
        let spriteArray = [];
        let cells = gridElement.querySelectorAll('.ink-cell');
        let idx = 0;
        
        for (let r = 0; r < 16; r++) {
            let row = [];
            for (let c = 0; c < 16; c++) {
                const colour = cells[idx].dataset.colour;
                row.push(colour || 0);
                idx++;
            }
            spriteArray.push(row);
        }
        return spriteArray;
    },

    // Legacy getter for monster grid
    getSpriteArray() {
        return this.getSpriteArrayFrom('ink-grid');
    },

    // Helper for texture grids (map_editor) to check tool mode before drawing
    // Returns: 'draw'|'erase' if normal, 'handled' if eyedropper/fill took action
    handleTexGridTool(gridId, cell, r, c, paintCallback, saveCallback) {
        const tool = this.gridTool[gridId] || 'draw';
        if (tool === 'eyedropper') {
            const colour = cell.dataset.colour;
            if (colour) this.setColour(gridId, colour);
            return 'handled';
        }
        if (tool === 'fill') {
            const grid = cell.parentElement;
            if (!grid) return 'handled';
            const cells = grid.children;
            const targetColour = cell.dataset.colour || null;
            const fillColour = this.gridErasing[gridId] ? null : this.getColour(gridId);
            if (targetColour === fillColour) return 'handled';
            // Flood fill
            const getCell = (r2, c2) => cells[r2 * 16 + c2];
            const getCellColour = (r2, c2) => getCell(r2, c2).dataset.colour || null;
            const stack = [[r, c]];
            const visited = new Set();
            while (stack.length > 0) {
                const [cr, cc] = stack.pop();
                if (cr < 0 || cr >= 16 || cc < 0 || cc >= 16) continue;
                const key = cr * 16 + cc;
                if (visited.has(key)) continue;
                visited.add(key);
                if (getCellColour(cr, cc) !== targetColour) continue;
                const c2 = getCell(cr, cc);
                if (fillColour) {
                    c2.style.background = fillColour;
                    c2.dataset.colour = fillColour;
                } else {
                    c2.style.background = '';
                    delete c2.dataset.colour;
                }
                stack.push([cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1]);
            }
            if (saveCallback) saveCallback();
            return 'handled';
        }
        return null; // not handled, proceed with normal draw/erase
    }
};

// Initialize grids when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    InkGrid.init();
    // Init colour pickers for DB editor grids
    InkGrid.initColourPicker('ink-grid');
    InkGrid.initColourPicker('npc-ink-grid');
});
