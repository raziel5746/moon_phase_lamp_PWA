// Automations Controller
import { getLocalToUtcTime, getUtcToLocalTime, formatTime, brightnessToUI, brightnessToFirmware } from './utils.js';

export class AutomationsController {
    constructor(bluetooth, presetsController) {
        this.bluetooth = bluetooth;
        this.presetsController = presetsController;
        this.automations = [];
    }

    async readAutomations() {
        if (!this.bluetooth.hasCharacteristic('automations')) {
            console.log('Automations characteristic not available');
            return;
        }

        try {
            const value = await this.bluetooth.readCharacteristic('automations');
            const count = value.getUint8(0);
            console.log('Automations count:', count);

            this.automations = [];
            for (let i = 0; i < count; i++) {
                const offset = 1 + i * 8;
                const utcHour = value.getUint8(offset + 1);
                const utcMinute = value.getUint8(offset + 2);
                const { hour, minute } = getUtcToLocalTime(utcHour, utcMinute);
                const enabledByte = value.getUint8(offset);
                this.automations.push({
                    enabled: (enabledByte & 0x01) !== 0,
                    fullLamp: ((enabledByte >> 1) & 0x01) !== 0,
                    hour,
                    minute,
                    hourUtc: utcHour,
                    minuteUtc: utcMinute,
                    presetId: value.getUint8(offset + 3),
                    brightness: value.getUint8(offset + 4),
                    r: value.getUint8(offset + 5),
                    g: value.getUint8(offset + 6),
                    b: value.getUint8(offset + 7)
                });
            }

            this.renderAutomations();
        } catch (error) {
            console.error('Failed to read automations:', error);
        }
    }

    async addAutomation(hour, minute, presetId, brightness, r = 0, g = 0, b = 0, fullLamp = false) {
        if (!this.bluetooth.hasCharacteristic('automations')) {
            console.warn('Automations characteristic not available');
            return;
        }

        try {
            const data = new Uint8Array(9);
            data[0] = 0x01; // Add command
            const utc = getLocalToUtcTime(hour, minute);
            data[1] = utc.hour;
            data[2] = utc.minute;
            data[3] = presetId;
            data[4] = brightness;
            data[5] = r;
            data[6] = g;
            data[7] = b;
            data[8] = fullLamp ? 1 : 0;

            await this.bluetooth.writeCharacteristic('automations', data);
            console.log('Automation added:', hour + ':' + minute);
            
            await this.readAutomations();
        } catch (error) {
            console.error('Failed to add automation:', error);
        }
    }

    async removeAutomation(index) {
        if (!this.bluetooth.hasCharacteristic('automations')) {
            console.warn('Automations characteristic not available');
            return;
        }

        const btn = document.querySelector(`.automation-item:nth-child(${index + 1}) .btn-icon`);
        if (btn) {
            btn.classList.add('loading');
            btn.disabled = true;
        }

        try {
            const data = new Uint8Array(2);
            data[0] = 0x02; // Remove command
            data[1] = index;

            await this.bluetooth.writeCharacteristic('automations', data);
            console.log('Automation removed:', index);
            
            await this.readAutomations();
        } catch (error) {
            console.error('Failed to remove automation:', error);
            if (btn) {
                btn.classList.remove('loading');
                btn.disabled = false;
            }
        }
    }

    async toggleAutomation(index, enabled) {
        if (!this.bluetooth.hasCharacteristic('automations')) {
            console.warn('Automations characteristic not available');
            return;
        }

        try {
            const data = new Uint8Array(3);
            data[0] = 0x04; // Enable/disable command
            data[1] = index;
            data[2] = enabled ? 1 : 0;

            await this.bluetooth.writeCharacteristic('automations', data);
            console.log('Automation', index, enabled ? 'enabled' : 'disabled');
            
            await this.readAutomations();
        } catch (error) {
            console.error('Failed to toggle automation:', error);
        }
    }

    async updateAutomation(index, hour, minute, presetId, brightness, fullLamp = false) {
        if (!this.bluetooth.hasCharacteristic('automations')) {
            console.warn('Automations characteristic not available');
            return;
        }

        try {
            const data = new Uint8Array(10);
            data[0] = 0x03; // Update command
            data[1] = index;
            const utc = getLocalToUtcTime(hour, minute);
            data[2] = utc.hour;
            data[3] = utc.minute;
            data[4] = presetId;
            data[5] = brightness;
            data[6] = 0;
            data[7] = 0;
            data[8] = 0;
            data[9] = fullLamp ? 1 : 0;

            await this.bluetooth.writeCharacteristic('automations', data);
            console.log('Automation updated:', index);
            
            await this.readAutomations();
        } catch (error) {
            console.error('Failed to update automation:', error);
        }
    }

    renderAutomations() {
        const container = document.getElementById('automationsList');
        if (!container) return;

        if (!this.automations || this.automations.length === 0) {
            container.innerHTML = '<p class="info-text">No automations set. Add one to schedule LED changes.</p>';
            return;
        }

        const presets = this.presetsController.presets;
        const presetNames = ['Warm White', 'Sunset', 'Ocean Blue', 'Pink Dream', 'Forest Green'];
        
        const sortedAutomations = this.automations
            .map((auto, index) => ({ auto, index }))
            .sort((a, b) => (a.auto.hour * 60 + a.auto.minute) - (b.auto.hour * 60 + b.auto.minute));
        
        container.innerHTML = sortedAutomations.map(({ auto, index }) => {
            const timeStr = formatTime(auto.hour, auto.minute);
            const presetName = presets && presets[auto.presetId] 
                ? presets[auto.presetId].name 
                : (auto.presetId < presetNames.length ? presetNames[auto.presetId] : 'Custom');
            
            return `
                <div class="automation-item ${auto.enabled ? '' : 'disabled'}" onclick="window.moonLamp.showEditAutomationDialog(${index})">
                    <div class="automation-info">
                        <span class="automation-time">${timeStr}</span>
                        <span class="automation-preset">${presetName} @ ${brightnessToUI(auto.brightness)}%${auto.fullLamp ? ' · Full' : ' · Phase'}</span>
                    </div>
                    <div class="automation-actions" onclick="event.stopPropagation()">
                        <label class="toggle-label small">
                            <input type="checkbox" ${auto.enabled ? 'checked' : ''} 
                                   onchange="window.moonLamp.toggleAutomation(${index}, this.checked)">
                        </label>
                        <button class="btn-icon delete-btn" onclick="window.moonLamp.removeAutomation(${index})">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6"/>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    showAddAutomationDialog() {
        const presets = this.presetsController.presets;
        const dialog = document.createElement('div');
        dialog.className = 'preset-dialog';
        dialog.innerHTML = `
            <div class="preset-dialog-content">
                <h3>Add Schedule</h3>
                <div class="form-row">
                    <label>Time:</label>
                    <input type="time" id="addAutomationTime" value="07:00">
                </div>
                <div class="form-row" style="position:relative;">
                    <label>Preset:</label>
                    <div class="preset-form-swatch" id="addPresetSwatch"></div>
                    <div class="preset-custom-select">
                        <div class="preset-select-trigger" id="addPresetTrigger">
                            <span class="trigger-name"></span>
                            <svg class="trigger-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
                        </div>
                        <div class="preset-select-dropdown" id="addPresetDropdown">
                            ${presets.map((p, i) => `
                                <div class="preset-select-option" data-index="${i}">
                                    <div class="option-swatch" style="background:rgb(${p.r},${p.g},${p.b})"></div>
                                    <span>${p.name}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <input type="hidden" id="addAutomationPreset" value="0">
                </div>
                <div class="form-row brightness-row">
                    <label>Brightness:</label>
                    <div class="automation-brightness-btns">
                        <button type="button" class="brightness-select-btn" data-brightness="0">0%</button>
                        <button type="button" class="brightness-select-btn" data-brightness="25">25%</button>
                        <button type="button" class="brightness-select-btn" data-brightness="50">50%</button>
                        <button type="button" class="brightness-select-btn active" data-brightness="75">75%</button>
                        <button type="button" class="brightness-select-btn" data-brightness="100">100%</button>
                    </div>
                    <div class="brightness-slider-container" style="width:100%;margin-top:8px;">
                        <div class="brightness-slider" id="autoAddBrightnessSlider">
                            <div class="brightness-slider-fill" id="autoAddBrightnessSliderFill"></div>
                            <span class="brightness-slider-value" id="autoAddBrightnessSliderValue">75%</span>
                        </div>
                    </div>
                    <input type="hidden" id="addAutomationBrightness" value="75">
                </div>
                <div class="form-row">
                    <label class="toggle-label automation-full-lamp-label">
                        <input type="checkbox" id="addFullLampToggle">
                        <span>Full Lamp</span>
                    </label>
                    <span class="setting-description">When off, lamp uses Phase Mode (LEDs follow motor position)</span>
                </div>
                <div class="dialog-buttons">
                    <button class="btn" id="cancelAddBtn">Cancel</button>
                    <button class="btn btn-primary" id="confirmAddBtn">Add</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);

        this._setupAutomationBrightnessSlider(
            dialog,
            'autoAddBrightnessSlider', 'autoAddBrightnessSliderFill', 'autoAddBrightnessSliderValue',
            'addAutomationBrightness', 75
        );
        this._setupPresetCustomSelect(dialog, presets, 'addPresetSwatch', 'addPresetTrigger', 'addPresetDropdown', 'addAutomationPreset', 0);

        document.getElementById('cancelAddBtn').addEventListener('click', () => {
            dialog.remove();
        });

        document.getElementById('confirmAddBtn').addEventListener('click', async () => {
            const time = document.getElementById('addAutomationTime').value;
            const preset = parseInt(document.getElementById('addAutomationPreset').value);
            const brightnessPercent = parseInt(document.getElementById('addAutomationBrightness').value);
            const brightness = brightnessToFirmware(brightnessPercent);
            
            if (time) {
                const [hour, minute] = time.split(':').map(Number);
                const fullLamp = document.getElementById('addFullLampToggle').checked;
                await this.addAutomation(hour, minute, preset, brightness, 0, 0, 0, fullLamp);
                dialog.remove();
            }
        });

        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) dialog.remove();
        });
    }

    showEditAutomationDialog(index) {
        const auto = this.automations[index];
        if (!auto) return;

        const presets = this.presetsController.presets;
        const timeStr = formatTime(auto.hour, auto.minute);
        const brightnessPercent = brightnessToUI(auto.brightness);
        
        const dialog = document.createElement('div');
        dialog.className = 'preset-dialog';
        dialog.innerHTML = `
            <div class="preset-dialog-content">
                <h3>Edit Schedule</h3>
                <div class="form-row">
                    <label>Time:</label>
                    <input type="time" id="editAutomationTime" value="${timeStr}">
                </div>
                <div class="form-row" style="position:relative;">
                    <label>Preset:</label>
                    <div class="preset-form-swatch" id="editPresetSwatch"></div>
                    <div class="preset-custom-select">
                        <div class="preset-select-trigger" id="editPresetTrigger">
                            <span class="trigger-name"></span>
                            <svg class="trigger-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
                        </div>
                        <div class="preset-select-dropdown" id="editPresetDropdown">
                            ${presets.map((p, i) => `
                                <div class="preset-select-option" data-index="${i}">
                                    <div class="option-swatch" style="background:rgb(${p.r},${p.g},${p.b})"></div>
                                    <span>${p.name}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <input type="hidden" id="editAutomationPreset" value="${auto.presetId}">
                </div>
                <div class="form-row brightness-row">
                    <label>Brightness:</label>
                    <div class="automation-brightness-btns">
                        <button type="button" class="brightness-select-btn ${brightnessPercent === 0 ? 'active' : ''}" data-brightness="0">0%</button>
                        <button type="button" class="brightness-select-btn ${brightnessPercent === 25 ? 'active' : ''}" data-brightness="25">25%</button>
                        <button type="button" class="brightness-select-btn ${brightnessPercent === 50 ? 'active' : ''}" data-brightness="50">50%</button>
                        <button type="button" class="brightness-select-btn ${brightnessPercent === 75 ? 'active' : ''}" data-brightness="75">75%</button>
                        <button type="button" class="brightness-select-btn ${brightnessPercent === 100 ? 'active' : ''}" data-brightness="100">100%</button>
                    </div>
                    <div class="brightness-slider-container" style="width:100%;margin-top:8px;">
                        <div class="brightness-slider" id="autoEditBrightnessSlider">
                            <div class="brightness-slider-fill" id="autoEditBrightnessSliderFill"></div>
                            <span class="brightness-slider-value" id="autoEditBrightnessSliderValue">${brightnessPercent}%</span>
                        </div>
                    </div>
                    <input type="hidden" id="editAutomationBrightness" value="${brightnessPercent}">
                </div>
                <div class="form-row">
                    <label class="toggle-label automation-full-lamp-label">
                        <input type="checkbox" id="editFullLampToggle" ${auto.fullLamp ? 'checked' : ''}>
                        <span>Full Lamp</span>
                    </label>
                    <span class="setting-description">When off, lamp uses Phase Mode (LEDs follow motor position)</span>
                </div>
                <div class="dialog-buttons">
                    <button class="btn" id="cancelEditBtn">Cancel</button>
                    <button class="btn btn-primary" id="saveEditBtn">Save</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);

        this._setupAutomationBrightnessSlider(
            dialog,
            'autoEditBrightnessSlider', 'autoEditBrightnessSliderFill', 'autoEditBrightnessSliderValue',
            'editAutomationBrightness', brightnessPercent
        );
        this._setupPresetCustomSelect(dialog, presets, 'editPresetSwatch', 'editPresetTrigger', 'editPresetDropdown', 'editAutomationPreset', auto.presetId ?? 0);

        document.getElementById('cancelEditBtn').addEventListener('click', () => {
            dialog.remove();
        });

        document.getElementById('saveEditBtn').addEventListener('click', async () => {
            const time = document.getElementById('editAutomationTime').value;
            const preset = parseInt(document.getElementById('editAutomationPreset').value);
            const brightnessPercent = parseInt(document.getElementById('editAutomationBrightness').value);
            const brightness = brightnessToFirmware(brightnessPercent);
            
            if (time) {
                const [hour, minute] = time.split(':').map(Number);
                const fullLamp = document.getElementById('editFullLampToggle').checked;
                await this.updateAutomation(index, hour, minute, preset, brightness, fullLamp);
                dialog.remove();
            }
        });

        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) dialog.remove();
        });
    }

    _setupPresetCustomSelect(dialog, presets, swatchId, triggerId, dropdownId, hiddenId, initialIndex) {
        const swatch = document.getElementById(swatchId);
        const trigger = document.getElementById(triggerId);
        const dropdown = document.getElementById(dropdownId);
        const hidden = document.getElementById(hiddenId);

        const selectPreset = (idx) => {
            const p = presets[idx];
            const rgb = `rgb(${p.r},${p.g},${p.b})`;
            swatch.style.background = rgb;
            trigger.querySelector('.trigger-name').textContent = p.name;
            hidden.value = idx;
            dropdown.querySelectorAll('.preset-select-option').forEach(o =>
                o.classList.toggle('selected', parseInt(o.dataset.index) === idx));
        };

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const opening = !dropdown.classList.contains('open');
            dropdown.classList.toggle('open', opening);
            trigger.classList.toggle('open', opening);
        });

        dropdown.querySelectorAll('.preset-select-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                selectPreset(parseInt(opt.dataset.index));
                dropdown.classList.remove('open');
                trigger.classList.remove('open');
            });
        });

        dialog.addEventListener('click', (e) => {
            if (!e.target.closest('.preset-custom-select')) {
                dropdown.classList.remove('open');
                trigger.classList.remove('open');
            }
        });

        selectPreset(Math.max(0, Math.min(initialIndex, presets.length - 1)));
    }

    _setupAutomationBrightnessSlider(dialog, sliderId, fillId, valueId, hiddenInputId, initialValue) {
        const slider = document.getElementById(sliderId);
        const fill = document.getElementById(fillId);
        const valueEl = document.getElementById(valueId);
        const hiddenInput = document.getElementById(hiddenInputId);

        const positionLabel = (percent) => {
            const sliderWidth = slider.getBoundingClientRect().width;
            if (!sliderWidth) return;
            const labelWidth = valueEl.getBoundingClientRect().width || 44;
            const fillEdge = (percent / 100) * sliderWidth;
            const idealLeft = fillEdge - labelWidth - 32;
            const clamped = Math.max(4, Math.min(idealLeft, sliderWidth - labelWidth - 4));
            valueEl.style.left = clamped + 'px';
            valueEl.style.transform = 'translateY(-50%)';
        };

        const updateSlider = (percent) => {
            percent = Math.max(0, Math.min(100, Math.round(percent)));
            fill.style.width = percent + '%';
            valueEl.textContent = percent + '%';
            hiddenInput.value = percent;
            positionLabel(percent);
            dialog.querySelectorAll('.brightness-select-btn').forEach(btn => {
                btn.classList.toggle('active', parseInt(btn.dataset.brightness) === percent);
            });
        };

        requestAnimationFrame(() => updateSlider(initialValue));

        dialog.querySelectorAll('.brightness-select-btn').forEach(btn => {
            btn.addEventListener('click', () => updateSlider(parseInt(btn.dataset.brightness)));
        });

        let isDragging = false;
        const calcPercent = (e) => {
            const rect = slider.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            return ((clientX - rect.left) / rect.width) * 100;
        };

        slider.addEventListener('mousedown', (e) => { isDragging = true; updateSlider(calcPercent(e)); e.preventDefault(); });
        slider.addEventListener('touchstart', (e) => { isDragging = true; updateSlider(calcPercent(e)); e.preventDefault(); }, { passive: false });
        document.addEventListener('mousemove', (e) => { if (isDragging) updateSlider(calcPercent(e)); });
        document.addEventListener('touchmove', (e) => { if (isDragging) { updateSlider(calcPercent(e)); e.preventDefault(); } }, { passive: false });
        document.addEventListener('mouseup', () => { isDragging = false; });
        document.addEventListener('touchend', () => { isDragging = false; });
    }
}
