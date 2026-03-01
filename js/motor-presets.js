// Motor Position Presets Controller
import { moonAngleSvg } from './utils.js';
import { Modal } from './modal.js';

const DEFAULT_MOTOR_PRESETS = [
    { id: 0, angle: 0,   name: 'New Moon',       isDefault: true },
    { id: 1, angle: 90,  name: 'First Quarter',  isDefault: true },
    { id: 2, angle: 180, name: 'Full Moon',       isDefault: true },
    { id: 3, angle: 270, name: 'Last Quarter',    isDefault: true },
];

export class MotorPresetsController {
    constructor(bluetooth, motorController) {
        this.bluetooth = bluetooth;
        this.motorController = motorController;
        this.presets = DEFAULT_MOTOR_PRESETS.map(p => ({ ...p }));
        this.deleteMode = false;
        this.holdTimer = null;
    }

    async readMotorPresets() {
        if (!this.bluetooth.hasCharacteristic('motorPresets')) {
            console.log('Motor presets characteristic not available');
            return;
        }

        try {
            const value = await this.bluetooth.readCharacteristic('motorPresets');
            const count = value.getUint8(0);
            console.log('Motor presets count:', count);

            this.presets = [];
            let offset = 1;
            for (let i = 0; i < count; i++) {
                const id = value.getUint8(offset);
                const angle = (value.getUint8(offset + 1) << 8) | value.getUint8(offset + 2);
                const nameLen = value.getUint8(offset + 3);
                let name = '';
                for (let j = 0; j < nameLen; j++) {
                    name += String.fromCharCode(value.getUint8(offset + 4 + j));
                }
                this.presets.push({ id, angle, name, isDefault: i < 4 });
                offset += 4 + nameLen;
            }

            this.renderPresets();
        } catch (error) {
            console.error('Failed to read motor presets:', error);
        }
    }

    renderPresets() {
        const container = document.getElementById('motorPresetList');
        if (!container) return;

        let html = this.presets.map((preset, index) => {
            const moonSvg = moonAngleSvg(preset.angle, 44);
            const label = preset.name || `${preset.angle}°`;
            const canDelete = !preset.isDefault;
            return `
                <button class="motor-preset-btn${this.deleteMode && canDelete ? ' delete-mode' : ''}" data-index="${index}">
                    <div class="motor-preset-moon">${moonSvg}</div>
                    <span class="motor-preset-label">${label}</span>
                    <span class="motor-preset-angle">${preset.angle}°</span>
                    ${this.deleteMode && !preset.isDefault ? `
                        <div class="motor-preset-trash">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6"/>
                            </svg>
                        </div>
                    ` : ''}
                </button>`;
        }).join('');

        const customCount = this.presets.filter(p => !p.isDefault).length;
        if (customCount < 8 && !this.deleteMode) {
            html += `
                <button class="motor-preset-btn motor-preset-add" id="addMotorPresetBtn">
                    <div class="motor-preset-moon">+</div>
                    <span class="motor-preset-label">Add Custom</span>
                    <span class="motor-preset-angle">&nbsp;</span>
                </button>`;
        }

        container.innerHTML = html;
        this._attachListeners(container);
    }

    _attachListeners(container) {
        container.querySelectorAll('.motor-preset-btn[data-index]').forEach(btn => {
            const index = parseInt(btn.dataset.index);

            btn.addEventListener('click', (e) => {
                if (this.deleteMode) {
                    e.preventDefault();
                    e.stopPropagation();
                    this._confirmDelete(index);
                } else {
                    this._applyPreset(index);
                }
            });

            const startHold = () => {
                this.holdTimer = setTimeout(() => this._enterDeleteMode(), 600);
            };
            const cancelHold = () => clearTimeout(this.holdTimer);

            btn.addEventListener('mousedown', startHold);
            btn.addEventListener('mouseup', cancelHold);
            btn.addEventListener('mouseleave', cancelHold);
            btn.addEventListener('touchstart', startHold, { passive: true });
            btn.addEventListener('touchend', cancelHold);
            btn.addEventListener('touchmove', cancelHold, { passive: true });
        });

        const addBtn = document.getElementById('addMotorPresetBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this._showAddDialog());
        }
    }

    _applyPreset(index) {
        const preset = this.presets[index];
        if (!preset) return;
        const currentAngle = parseInt(document.getElementById('motorValue')?.textContent) || 0;
        const norm = ((currentAngle % 360) + 360) % 360;
        const presetNorm = ((preset.angle % 360) + 360) % 360;
        if (presetNorm === norm) {
            this._showEditDialog(index);
            return;
        }
        this.motorController.updateMotorPointer(preset.angle);
        document.getElementById('motorValue').textContent = preset.angle + '°';
        this.motorController.setMotorPosition(preset.angle);
    }

    setActiveAngle(angle) {
        const container = document.getElementById('motorPresetList');
        if (!container) return;
        const norm = ((angle % 360) + 360) % 360;
        container.querySelectorAll('.motor-preset-btn[data-index]').forEach(btn => {
            const preset = this.presets[parseInt(btn.dataset.index)];
            if (!preset) return;
            const presetNorm = ((preset.angle % 360) + 360) % 360;
            btn.classList.toggle('selected', presetNorm === norm);
        });
    }

    _enterDeleteMode() {
        this.deleteMode = true;
        this.renderPresets();
        const exitHandler = (e) => {
            const container = document.getElementById('motorPresetList');
            if (!container) { document.removeEventListener('click', exitHandler); return; }
            if (!container.contains(e.target) || !e.target.closest('.motor-preset-btn')) {
                this._exitDeleteMode();
                document.removeEventListener('click', exitHandler);
            }
        };
        setTimeout(() => document.addEventListener('click', exitHandler), 100);
    }

    _exitDeleteMode() {
        this.deleteMode = false;
        this.renderPresets();
    }

    async _confirmDelete(index) {
        const preset = this.presets[index];
        if (!preset || preset.isDefault) return;
        const label = preset.name || `${preset.angle}°`;
        const confirmed = await Modal.confirm(`Delete "${label}" preset?`, 'Delete Preset');
        if (confirmed) {
            if (this.bluetooth.hasCharacteristic('motorPresets')) {
                try {
                    const data = new Uint8Array(2);
                    data[0] = 0x02; // Remove command
                    data[1] = preset.id; // Stable ID
                    await this.bluetooth.writeCharacteristic('motorPresets', data);
                    console.log('Motor preset removed, id:', preset.id);
                    await this.readMotorPresets();
                } catch (error) {
                    console.error('Failed to remove motor preset:', error);
                }
            } else {
                this.presets.splice(index, 1);
                this.renderPresets();
            }
            if (!this.presets.some(p => !p.isDefault)) this._exitDeleteMode();
        }
    }

    _showAddDialog() {
        const currentAngle = parseInt(document.getElementById('motorValue')?.textContent) || 0;

        const dialog = document.createElement('div');
        dialog.className = 'preset-dialog';
        dialog.innerHTML = `
            <div class="preset-dialog-content">
                <h3>Add Position Preset</h3>
                <div class="motor-preset-preview" id="presetPreviewSvg">
                    ${moonAngleSvg(currentAngle, 80)}
                </div>
                <div class="form-row">
                    <label>Angle</label>
                    <input type="number" id="newPresetAngle" min="0" max="360" value="${currentAngle}" class="motor-preset-angle-input">
                </div>
                <div class="form-row">
                    <label>Name</label>
                    <div style="position:relative;flex:1;min-width:0;">
                        <input type="text" id="newPresetName" placeholder="Optional" maxlength="15" style="width:100%;box-sizing:border-box;padding-right:44px;">
                        <span id="newPresetNameCount" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:0.75em;color:var(--text-secondary);pointer-events:none;">0/15</span>
                    </div>
                </div>
                <div class="dialog-buttons">
                    <button class="btn btn-secondary" id="cancelMotorPresetBtn">Cancel</button>
                    <button class="btn btn-primary" id="saveMotorPresetBtn">Save</button>
                </div>
            </div>`;
        document.body.appendChild(dialog);

        const angleInput = document.getElementById('newPresetAngle');
        const preview = document.getElementById('presetPreviewSvg');

        const nameInput = document.getElementById('newPresetName');
        const nameCount = document.getElementById('newPresetNameCount');
        nameInput.addEventListener('input', () => { nameCount.textContent = `${nameInput.value.length}/15`; });

        angleInput.addEventListener('input', () => {
            const a = Math.min(360, Math.max(0, parseInt(angleInput.value) || 0));
            preview.innerHTML = moonAngleSvg(a, 80);
        });

        this._setupMoonDragInteraction(preview, angleInput);

        document.getElementById('cancelMotorPresetBtn').addEventListener('click', () => dialog.remove());

        document.getElementById('saveMotorPresetBtn').addEventListener('click', async () => {
            const angle = Math.min(360, Math.max(0, parseInt(angleInput.value) || 0));
            const name = nameInput.value.trim() || `${angle}°`;
            dialog.remove();

            if (this.bluetooth.hasCharacteristic('motorPresets')) {
                try {
                    const nameBytes = new TextEncoder().encode(name.substring(0, 15));
                    const data = new Uint8Array(4 + nameBytes.length);
                    data[0] = 0x01; // Add command
                    data[1] = (angle >> 8) & 0xFF;
                    data[2] = angle & 0xFF;
                    data[3] = nameBytes.length;
                    data.set(nameBytes, 4);
                    await this.bluetooth.writeCharacteristic('motorPresets', data);
                    console.log('Motor preset added:', name);
                    await this.readMotorPresets();
                } catch (error) {
                    console.error('Failed to add motor preset:', error);
                    Modal.error('Failed to add preset: ' + error.message);
                }
            } else {
                this.presets.push({ id: Date.now() & 0xFF, angle, name, isDefault: false });
                this.renderPresets();
            }
        });

        dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });
    }

    _showEditDialog(index) {
        const preset = this.presets[index];
        if (!preset) return;

        const dialog = document.createElement('div');
        dialog.className = 'preset-dialog';
        dialog.innerHTML = `
            <div class="preset-dialog-content">
                <h3>Edit Position Preset</h3>
                <div class="motor-preset-preview" id="editPreviewSvg">
                    ${moonAngleSvg(preset.angle, 80)}
                </div>
                <div class="form-row">
                    <label>Angle</label>
                    <input type="number" id="editPresetAngle" min="0" max="360" value="${preset.angle}" class="motor-preset-angle-input">
                </div>
                <div class="form-row">
                    <label>Name</label>
                    <div style="position:relative;flex:1;min-width:0;">
                        <input type="text" id="editPresetName" placeholder="Optional" maxlength="15" value="${preset.name || ''}" style="width:100%;box-sizing:border-box;padding-right:44px;">
                        <span id="editPresetNameCount" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:0.75em;color:var(--text-secondary);pointer-events:none;">${(preset.name || '').length}/15</span>
                    </div>
                </div>
                <div class="dialog-buttons">
                    <button class="btn btn-secondary" id="cancelEditPresetBtn">Cancel</button>
                    <button class="btn btn-primary" id="saveEditPresetBtn">Save</button>
                </div>
            </div>`;
        document.body.appendChild(dialog);

        const angleInput = document.getElementById('editPresetAngle');
        const preview = document.getElementById('editPreviewSvg');
        const nameInput = document.getElementById('editPresetName');
        const nameCount = document.getElementById('editPresetNameCount');
        nameInput.addEventListener('input', () => { nameCount.textContent = `${nameInput.value.length}/15`; });

        angleInput.addEventListener('input', () => {
            const a = Math.min(360, Math.max(0, parseInt(angleInput.value) || 0));
            preview.innerHTML = moonAngleSvg(a, 80);
        });

        this._setupMoonDragInteraction(preview, angleInput);

        document.getElementById('cancelEditPresetBtn').addEventListener('click', () => dialog.remove());

        document.getElementById('saveEditPresetBtn').addEventListener('click', async () => {
            const angle = Math.min(360, Math.max(0, parseInt(angleInput.value) || 0));
            const name = nameInput.value.trim() || `${angle}°`;
            dialog.remove();

            if (this.bluetooth.hasCharacteristic('motorPresets')) {
                try {
                    const nameBytes = new TextEncoder().encode(name.substring(0, 15));
                    const data = new Uint8Array(5 + nameBytes.length);
                    data[0] = 0x03; // Update command
                    data[1] = preset.id; // Stable ID
                    data[2] = (angle >> 8) & 0xFF;
                    data[3] = angle & 0xFF;
                    data[4] = nameBytes.length;
                    data.set(nameBytes, 5);
                    await this.bluetooth.writeCharacteristic('motorPresets', data);
                    console.log('Motor preset updated:', name);
                    await this.readMotorPresets();
                } catch (error) {
                    console.error('Failed to update motor preset:', error);
                }
            } else {
                this.presets[index] = { ...preset, angle, name };
                this.renderPresets();
            }
        });

        dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });
    }

    _setupMoonDragInteraction(previewEl, angleInput) {
        previewEl.style.cursor = 'ew-resize';
        previewEl.style.touchAction = 'none';
        previewEl.style.userSelect = 'none';
        const disableChildPointers = () => {
            const svg = previewEl.querySelector('svg');
            if (svg) svg.style.pointerEvents = 'none';
        };
        disableChildPointers();

        let isDragging = false;
        let lastX = 0;

        const getAngle = () => ((parseInt(angleInput.value) || 0) + 360) % 360;

        const setAngle = (a) => {
            const clamped = ((Math.round(a) % 360) + 360) % 360;
            angleInput.value = clamped;
            previewEl.innerHTML = moonAngleSvg(clamped, 80);
            disableChildPointers();
        };

        const onStart = (e) => {
            isDragging = true;
            lastX = e.touches ? e.touches[0].clientX : e.clientX;
            e.preventDefault();
        };

        const onMove = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const deltaX = clientX - lastX;
            lastX = clientX;
            setAngle(getAngle() - deltaX);
        };

        const onEnd = () => { isDragging = false; };

        previewEl.addEventListener('mousedown', onStart);
        previewEl.addEventListener('touchstart', onStart, { passive: false });
        document.addEventListener('mousemove', onMove);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchend', onEnd);
    }
}
