// Motor Position Presets Controller
import { moonAngleSvg } from './utils.js';
import { Modal } from './modal.js';

const STORAGE_KEY = 'motorPositionPresets';

const DEFAULT_MOTOR_PRESETS = [
    { angle: 0,   name: 'New Moon' },
    { angle: 90,  name: 'First Quarter' },
    { angle: 180, name: 'Full Moon' },
    { angle: 270, name: 'Last Quarter' },
];

export class MotorPresetsController {
    constructor(motorController) {
        this.motorController = motorController;
        this.presets = this._loadPresets();
        this.deleteMode = false;
        this.holdTimer = null;
        this.selectedPreset = null;
    }

    _loadPresets() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) return JSON.parse(stored);
        } catch (e) { /* ignore */ }
        return DEFAULT_MOTOR_PRESETS.map(p => ({ ...p }));
    }

    _savePresets() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.presets));
        } catch (e) { /* ignore */ }
    }

    renderPresets() {
        const container = document.getElementById('motorPresetList');
        if (!container) return;

        let html = this.presets.map((preset, index) => {
            const moonSvg = moonAngleSvg(preset.angle, 44);
            const label = preset.name || `${preset.angle}°`;
            const isDefault = index < DEFAULT_MOTOR_PRESETS.length;
            const canDelete = !isDefault || this.presets.length > 1;
            return `
                <button class="motor-preset-btn${this.selectedPreset === index ? ' selected' : ''}${this.deleteMode && canDelete ? ' delete-mode' : ''}" data-index="${index}">
                    <div class="motor-preset-moon">${moonSvg}</div>
                    <span class="motor-preset-label">${label}</span>
                    <span class="motor-preset-angle">${preset.angle}°</span>
                    ${this.deleteMode && canDelete ? `
                        <div class="motor-preset-trash">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6"/>
                            </svg>
                        </div>
                    ` : ''}
                </button>`;
        }).join('');

        if (!this.deleteMode) {
            html += `
                <button class="motor-preset-btn motor-preset-add" id="addMotorPresetBtn">
                    <div class="motor-preset-moon motor-preset-add-icon">+</div>
                    <span class="motor-preset-label">Add</span>
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
        if (this.selectedPreset === index) {
            this._showEditDialog(index);
            return;
        }
        this.selectedPreset = index;
        this.renderPresets();
        this.motorController.updateMotorPointer(preset.angle);
        document.getElementById('motorValue').textContent = preset.angle + '°';
        this.motorController.setMotorPosition(preset.angle);
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
        if (!preset) return;
        const label = preset.name || `${preset.angle}°`;
        const confirmed = await Modal.confirm(`Delete "${label}" preset?`, 'Delete Preset');
        if (confirmed) {
            this.presets.splice(index, 1);
            this._savePresets();
            if (this.presets.length === 0) this._exitDeleteMode();
            else this.renderPresets();
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

        document.getElementById('cancelMotorPresetBtn').addEventListener('click', () => dialog.remove());

        document.getElementById('saveMotorPresetBtn').addEventListener('click', () => {
            const angle = Math.min(360, Math.max(0, parseInt(angleInput.value) || 0));
            const name = nameInput.value.trim();
            this.presets.push({ angle, name: name || null });
            this._savePresets();
            this.renderPresets();
            dialog.remove();
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

        document.getElementById('cancelEditPresetBtn').addEventListener('click', () => dialog.remove());

        document.getElementById('saveEditPresetBtn').addEventListener('click', () => {
            const angle = Math.min(360, Math.max(0, parseInt(angleInput.value) || 0));
            const name = nameInput.value.trim();
            this.presets[index] = { angle, name: name || null };
            this._savePresets();
            this.renderPresets();
            dialog.remove();
        });

        dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });
    }
}
