// Presets Controller
import { DEFAULT_PRESETS } from './constants.js';

export class PresetsController {
    constructor(bluetooth, ledController) {
        this.bluetooth = bluetooth;
        this.ledController = ledController;
        this.presets = [...DEFAULT_PRESETS];
        this.selectedPreset = undefined;
        this.presetDeleteMode = false;
        this.presetHoldTimer = null;
    }

    async readCustomPresets() {
        if (!this.bluetooth.hasCharacteristic('customPresets')) {
            console.log('Custom presets characteristic not available');
            return;
        }

        try {
            const value = await this.bluetooth.readCharacteristic('customPresets');
            const count = value.getUint8(0);
            console.log('Presets count:', count);

            this.presets = [];
            let offset = 1;
            for (let i = 0; i < count; i++) {
                const r = value.getUint8(offset);
                const g = value.getUint8(offset + 1);
                const b = value.getUint8(offset + 2);
                const nameLen = value.getUint8(offset + 3);
                let name = '';
                for (let j = 0; j < nameLen; j++) {
                    name += String.fromCharCode(value.getUint8(offset + 4 + j));
                }
                this.presets.push({ r, g, b, name, isCustom: i >= 5 });
                offset += 4 + nameLen;
            }

            this.renderPresets();
            this.updateAutomationPresetDropdown();
        } catch (error) {
            console.error('Failed to read custom presets:', error);
        }
    }

    async addCustomPreset(r, g, b, name) {
        const customCount = this.presets.filter(p => p.isCustom).length;
        if (customCount >= 5) {
            alert('Maximum 5 custom presets allowed');
            return;
        }

        if (!this.bluetooth.hasCharacteristic('customPresets')) {
            this.presets.push({ r, g, b, name, isCustom: true });
            this.renderPresets();
            return;
        }

        try {
            const nameBytes = new TextEncoder().encode(name.substring(0, 15));
            const data = new Uint8Array(5 + nameBytes.length);
            data[0] = 0x01; // Add command
            data[1] = r;
            data[2] = g;
            data[3] = b;
            data[4] = nameBytes.length;
            data.set(nameBytes, 5);

            await this.bluetooth.writeCharacteristic('customPresets', data);
            console.log('Custom preset added:', name);
            
            await this.readCustomPresets();
        } catch (error) {
            console.error('Failed to add custom preset:', error);
            alert('Failed to add preset: ' + error.message);
        }
    }

    async removeCustomPreset(index) {
        if (index < 5 || index >= this.presets.length) {
            console.warn('Cannot remove: invalid index or default preset');
            return;
        }

        if (!this.bluetooth.hasCharacteristic('customPresets')) {
            this.presets.splice(index, 1);
            this.renderPresets();
            this.updateAutomationPresetDropdown();
            console.log('Custom preset removed locally:', index);
            return;
        }

        try {
            const data = new Uint8Array(2);
            data[0] = 0x02; // Remove command
            data[1] = index;

            await this.bluetooth.writeCharacteristic('customPresets', data);
            console.log('Custom preset removed:', index);
            
            await this.readCustomPresets();
        } catch (error) {
            console.error('Failed to remove custom preset:', error);
        }
    }

    renderPresets() {
        const container = document.querySelector('.preset-grid');
        if (!container || !this.presets) return;

        let html = this.presets.map((preset, index) => `
            <button class="preset-btn${this.presetDeleteMode && preset.isCustom ? ' delete-mode' : ''}" data-preset="${index}">
                <div class="preset-color" style="background: rgb(${preset.r},${preset.g},${preset.b});"></div>
                <span>${preset.name}</span>
                ${this.presetDeleteMode && preset.isCustom ? `
                    <div class="preset-trash-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6"/>
                        </svg>
                    </div>
                ` : ''}
            </button>
        `).join('');

        const customCount = this.presets.filter(p => p.isCustom).length;
        if (customCount < 5 && !this.presetDeleteMode) {
            html += `
                <button class="preset-btn add-preset-btn" id="addPresetBtn">
                    <div class="preset-color add-preset-color">+</div>
                    <span>Add Custom</span>
                </button>
            `;
        }

        container.innerHTML = html;
        this._attachPresetListeners(container);

        if (this.selectedPreset !== undefined) {
            const selectedBtn = container.querySelector(`.preset-btn[data-preset="${this.selectedPreset}"]`);
            if (selectedBtn) {
                selectedBtn.classList.add('selected');
            }
        }
    }

    _attachPresetListeners(container) {
        container.querySelectorAll('.preset-btn[data-preset]').forEach(btn => {
            const preset = parseInt(btn.dataset.preset);
            const presetData = this.presets[preset];
            
            btn.addEventListener('click', (e) => {
                if (this.presetDeleteMode && presetData.isCustom) {
                    e.preventDefault();
                    e.stopPropagation();
                    this.confirmDeletePreset(preset);
                } else if (!this.presetDeleteMode) {
                    // If clicking on already selected preset, open edit dialog
                    if (this.selectedPreset === preset) {
                        this.showEditPresetDialog(preset);
                    } else {
                        this.setColorPreset(preset);
                    }
                }
            });

            // Hold to enable delete mode (touch)
            btn.addEventListener('touchstart', () => {
                this.presetHoldTimer = setTimeout(() => {
                    this.enablePresetDeleteMode();
                }, 600);
            });
            
            btn.addEventListener('touchend', () => {
                clearTimeout(this.presetHoldTimer);
            });
            
            btn.addEventListener('touchmove', () => {
                clearTimeout(this.presetHoldTimer);
            });

            // Hold to enable delete mode (mouse)
            btn.addEventListener('mousedown', () => {
                this.presetHoldTimer = setTimeout(() => {
                    this.enablePresetDeleteMode();
                }, 600);
            });
            
            btn.addEventListener('mouseup', () => {
                clearTimeout(this.presetHoldTimer);
            });
            
            btn.addEventListener('mouseleave', () => {
                clearTimeout(this.presetHoldTimer);
            });
        });

        const addBtn = document.getElementById('addPresetBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.showAddPresetDialog());
        }
    }

    async setColorPreset(preset) {
        // Update UI immediately (optimistic update)
        this.selectedPreset = preset;
        document.querySelectorAll('.preset-btn[data-preset]').forEach(btn => {
            const btnPreset = parseInt(btn.dataset.preset);
            btn.classList.toggle('selected', btnPreset === preset);
        });
        
        // Then send to device
        await this.ledController.setColorPreset(preset);
    }

    enablePresetDeleteMode() {
        const hasCustomPresets = this.presets.some(p => p.isCustom);
        if (!hasCustomPresets) return;
        
        this.presetDeleteMode = true;
        this.renderPresets();
        
        const exitHandler = (e) => {
            const container = document.querySelector('.preset-grid');
            if (!container) {
                document.removeEventListener('click', exitHandler);
                return;
            }

            const clickedPreset = e.target.closest('.preset-btn');
            if (!container.contains(e.target) || !clickedPreset) {
                this.exitPresetDeleteMode();
                document.removeEventListener('click', exitHandler);
            }
        };
        setTimeout(() => document.addEventListener('click', exitHandler), 100);
    }

    exitPresetDeleteMode() {
        this.presetDeleteMode = false;
        this.renderPresets();
    }

    confirmDeletePreset(index) {
        const preset = this.presets[index];
        if (!preset || !preset.isCustom) return;
        
        if (confirm(`Delete "${preset.name}" preset?`)) {
            this.removeCustomPreset(index);
            const hasCustomPresets = this.presets.some(p => p.isCustom);
            if (!hasCustomPresets) {
                this.exitPresetDeleteMode();
            }
        }
    }

    updateAutomationPresetDropdown() {
        const select = document.getElementById('automationPreset');
        if (!select || !this.presets) return;

        select.innerHTML = this.presets.map((preset, index) => 
            `<option value="${index}">${preset.name}</option>`
        ).join('');
    }

    showAddPresetDialog() {
        const dialog = document.createElement('div');
        dialog.className = 'preset-dialog';
        dialog.innerHTML = `
            <div class="preset-dialog-content preset-dialog-wide">
                <h3>Add Custom Preset</h3>
                <div class="color-picker-container">
                    <div id="iroColorPicker"></div>
                </div>
                <div class="form-row">
                    <input type="text" id="newPresetName" placeholder="Color name" maxlength="15">
                </div>
                <div class="dialog-buttons">
                    <button class="btn" id="cancelPresetBtn">Cancel</button>
                    <button class="btn btn-primary" id="savePresetBtn">Save</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);

        // Initialize iro.js color picker
        const colorPicker = new iro.ColorPicker('#iroColorPicker', {
            width: 200,
            color: '#ff6600',
            borderWidth: 2,
            borderColor: '#ffffff',
            layout: [
                { component: iro.ui.Wheel },
                { component: iro.ui.Slider, options: { sliderType: 'value' } }
            ]
        });

        document.getElementById('cancelPresetBtn').addEventListener('click', () => {
            dialog.remove();
        });

        document.getElementById('savePresetBtn').addEventListener('click', () => {
            const color = colorPicker.color;
            const name = document.getElementById('newPresetName').value || 'Custom';
            
            this.addCustomPreset(color.red, color.green, color.blue, name);
            dialog.remove();
        });

        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) dialog.remove();
        });
    }

    showEditPresetDialog(presetIndex) {
        const preset = this.presets[presetIndex];
        if (!preset) return;

        const currentHex = `#${preset.r.toString(16).padStart(2, '0')}${preset.g.toString(16).padStart(2, '0')}${preset.b.toString(16).padStart(2, '0')}`;

        const dialog = document.createElement('div');
        dialog.className = 'preset-dialog';
        dialog.innerHTML = `
            <div class="preset-dialog-content preset-dialog-wide">
                <h3>Edit Preset</h3>
                <div class="color-picker-container">
                    <div id="iroColorPickerEdit"></div>
                </div>
                <div class="form-row">
                    <input type="text" id="editPresetName" value="${preset.name}" placeholder="Color name" maxlength="15">
                </div>
                <div class="dialog-buttons">
                    <button class="btn" id="cancelEditPresetBtn">Cancel</button>
                    <button class="btn btn-primary" id="saveEditPresetBtn">Save</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);

        // Initialize iro.js color picker with current color
        const colorPicker = new iro.ColorPicker('#iroColorPickerEdit', {
            width: 200,
            color: currentHex,
            borderWidth: 2,
            borderColor: '#ffffff',
            layout: [
                { component: iro.ui.Wheel },
                { component: iro.ui.Slider, options: { sliderType: 'value' } }
            ]
        });

        document.getElementById('cancelEditPresetBtn').addEventListener('click', () => {
            dialog.remove();
        });

        document.getElementById('saveEditPresetBtn').addEventListener('click', () => {
            const color = colorPicker.color;
            const name = document.getElementById('editPresetName').value || preset.name;
            
            // Close modal immediately for snappy UX
            dialog.remove();
            
            // Update preset first, then apply (sequential to avoid BLE race condition on mobile)
            this.updatePreset(presetIndex, color.red, color.green, color.blue, name)
                .then(() => this.setColorPreset(presetIndex));
        });

        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) dialog.remove();
        });
    }

    async updatePreset(index, r, g, b, name) {
        // Always update local state first
        const wasCustom = this.presets[index]?.isCustom || false;
        this.presets[index] = { r, g, b, name, isCustom: wasCustom };
        console.log('Preset updated locally:', index, { r, g, b, name });
        
        // Re-render and keep selection
        const previousSelection = this.selectedPreset;
        this.renderPresets();
        this.selectedPreset = previousSelection;
        
        // Update the selected button visually
        if (this.selectedPreset !== undefined) {
            const selectedBtn = document.querySelector(`.preset-btn[data-preset="${this.selectedPreset}"]`);
            if (selectedBtn) {
                selectedBtn.classList.add('selected');
            }
        }

        if (!this.bluetooth.hasCharacteristic('customPresets')) {
            // Not connected - local update only
            return;
        }

        try {
            // Command 0x03 = Update preset
            const nameBytes = new TextEncoder().encode(name.substring(0, 15));
            const data = new Uint8Array(6 + nameBytes.length);
            data[0] = 0x03; // Update command
            data[1] = index;
            data[2] = r;
            data[3] = g;
            data[4] = b;
            data[5] = nameBytes.length;
            data.set(nameBytes, 6);

            console.log('Sending preset update command:', data);
            await this.bluetooth.writeCharacteristic('customPresets', data);
            console.log('Preset updated on device:', name);
            
            // Re-read presets from device to confirm
            await this.readCustomPresets();
        } catch (error) {
            console.error('Failed to update preset on device:', error);
            // Local update already applied, just log the error
            console.log('Preset updated locally only');
        }
    }

    updatePresetFeedback(ledStates) {
        const firstLed = ledStates[0];
        const allSame = ledStates.every(led =>
            led.r === firstLed.r &&
            led.g === firstLed.g &&
            led.b === firstLed.b &&
            led.brightness === firstLed.brightness
        );

        document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.brightness-btn').forEach(btn => btn.classList.remove('active'));

        if (!allSame) return;

        const r = firstLed.r;
        const g = firstLed.g;
        const b = firstLed.b;
        const brightness = firstLed.brightness;

        const matches = (tr, tg, tb) => {
            return Math.abs(r - tr) < 5 && Math.abs(g - tg) < 5 && Math.abs(b - tb) < 5;
        };

        let activePreset = -1;

        if (this.presets) {
            for (let i = 0; i < this.presets.length; i++) {
                const p = this.presets[i];
                if (matches(p.r, p.g, p.b)) {
                    activePreset = i;
                    break;
                }
            }
        }

        this.selectedPreset = activePreset;
        document.querySelectorAll('.preset-btn[data-preset]').forEach(btn => {
            btn.classList.remove('selected', 'active');
        });
        if (activePreset !== -1) {
            const btn = document.querySelector(`.preset-btn[data-preset="${activePreset}"]`);
            if (btn) btn.classList.add('selected');
        }

        const brightnessBtn = document.querySelector(`.brightness-btn[data-brightness="${brightness}"]`);
        if (brightnessBtn) {
            brightnessBtn.classList.add('active');
        }
    }
}
