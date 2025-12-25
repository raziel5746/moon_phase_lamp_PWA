// LED Ring Controller
import { rgbToHex, brightnessToFirmware } from './utils.js';

export class LEDController {
    constructor(bluetooth) {
        this.bluetooth = bluetooth;
        this.ledStates = Array(8).fill({ r: 255, g: 220, b: 150, brightness: 75 });
        this.selectedLeds = new Set();
        this.ledElements = [];
    }

    createLEDRing() {
        const ring = document.getElementById('ledRing');
        this.ledElements = [];

        for (let i = 0; i < 8; i++) {
            const led = document.createElement('div');
            led.className = 'led';
            led.dataset.index = i;
            led.addEventListener('click', () => this.selectLED(i));
            ring.appendChild(led);
            this.ledElements.push(led);
        }

        this.updateLEDLayout();
        window.addEventListener('resize', () => this.updateLEDLayout());
    }

    updateLEDLayout() {
        const ring = document.getElementById('ledRing');
        if (!ring || !this.ledElements.length) return;

        const width = ring.clientWidth;
        const height = ring.clientHeight;

        if (width === 0 || height === 0) return;

        const diameter = Math.min(width, height);
        const centerX = width / 2;
        const centerY = height / 2;
        const ledSize = this.ledElements[0].offsetWidth || 20;
        const radius = (diameter / 2) - (ledSize / 2) - 4;

        this.ledElements.forEach((led, i) => {
            const angle = (i * 45 - 90) * Math.PI / 180;
            const x = centerX + radius * Math.cos(angle) - ledSize / 2;
            const y = centerY + radius * Math.sin(angle) - ledSize / 2;
            led.style.left = `${x}px`;
            led.style.top = `${y}px`;
        });
    }

    selectLED(index) {
        const selectMultipleToggle = document.getElementById('selectMultipleToggle');

        if (selectMultipleToggle.checked) {
            if (this.selectedLeds.has(index)) {
                this.selectedLeds.delete(index);
            } else {
                this.selectedLeds.add(index);
            }
        } else {
            this.selectedLeds.clear();
            this.selectedLeds.add(index);
        }

        this.updateSelectionUI();

        // Update picker values from the last selected LED's state
        if (this.selectedLeds.size > 0) {
            const lastSelected = Array.from(this.selectedLeds)[this.selectedLeds.size - 1];
            const state = this.ledStates[lastSelected];
            const hex = rgbToHex(state.r, state.g, state.b);
            document.getElementById('colorPicker').value = hex;
            document.getElementById('customBrightness').value = state.brightness;
            document.getElementById('customBrightnessValue').textContent = state.brightness + '%';
        }
    }

    selectAll() {
        if (this.selectedLeds.size === 8) {
            this.selectedLeds.clear();
        } else {
            this.selectedLeds = new Set([0, 1, 2, 3, 4, 5, 6, 7]);
        }
        this.updateSelectionUI();
    }

    updateSelectionUI() {
        const selectAllBtn = document.getElementById('selectAllBtn');
        const selectedLedCount = document.getElementById('selectedLedCount');
        const applyCustomBtn = document.getElementById('applyCustomBtn');
        const count = this.selectedLeds.size;

        if (count === 0) {
            selectedLedCount.textContent = '0 LEDs';
            applyCustomBtn.textContent = 'Select LEDs first';
            applyCustomBtn.disabled = true;
        } else if (count === 8) {
            selectedLedCount.textContent = 'ALL LEDs';
            applyCustomBtn.textContent = 'Apply to ALL';
            applyCustomBtn.disabled = false;
        } else if (count === 1) {
            const ledNum = Array.from(this.selectedLeds)[0];
            selectedLedCount.textContent = `LED ${ledNum}`;
            applyCustomBtn.textContent = `Apply to LED ${ledNum}`;
            applyCustomBtn.disabled = false;
        } else {
            selectedLedCount.textContent = `${count} LEDs`;
            applyCustomBtn.textContent = `Apply to ${count} LEDs`;
            applyCustomBtn.disabled = false;
        }

        selectAllBtn.classList.toggle('active', count === 8);

        document.querySelectorAll('.led').forEach((led, i) => {
            led.classList.toggle('selected', this.selectedLeds.has(i));
        });
    }

    updateLEDRing() {
        document.querySelectorAll('.led').forEach((led, i) => {
            const state = this.ledStates[i];
            const brightness = state.brightness / 100;
            const r = Math.round(state.r * brightness);
            const g = Math.round(state.g * brightness);
            const b = Math.round(state.b * brightness);
            led.style.background = `rgb(${r}, ${g}, ${b})`;
            led.style.boxShadow = `0 0 ${10 + brightness * 10}px rgba(${r}, ${g}, ${b}, 0.8)`;
        });
    }

    handleLEDStateUpdate(dataView) {
        if (dataView.byteLength < 32) {
            console.warn('LED state data incomplete, expected 32 bytes, got', dataView.byteLength);
            return;
        }

        for (let i = 0; i < 8; i++) {
            const offset = i * 4;
            const rawBrightness = dataView.getUint8(offset + 3);
            const uiBrightness = Math.round(rawBrightness * 100 / 255);

            this.ledStates[i] = {
                r: dataView.getUint8(offset),
                g: dataView.getUint8(offset + 1),
                b: dataView.getUint8(offset + 2),
                brightness: uiBrightness
            };
        }
        this.updateLEDRing();
    }

    async setIndividualLED(index, hexColor, brightness) {
        if (!this.bluetooth.hasCharacteristic('ledCustom')) {
            alert('Not connected to lamp');
            return;
        }

        try {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hexColor);
            const rgb = result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : { r: 255, g: 220, b: 150 };

            const mappedBrightness = brightnessToFirmware(brightness);
            const data = new Uint8Array([index, rgb.r, rgb.g, rgb.b, mappedBrightness]);
            await this.bluetooth.writeCharacteristic('ledCustom', data);
            console.log(`LED ${index} set:`, rgb, mappedBrightness);

            this.ledStates[index] = { ...rgb, brightness };
            this.updateLEDRing();
        } catch (error) {
            console.error('Failed to set LED:', error);
            alert('Failed to set LED');
        }
    }

    async applyToSelected() {
        if (this.selectedLeds.size === 0) {
            alert('Select at least one LED first');
            return;
        }

        const color = document.getElementById('colorPicker').value;
        const brightness = parseInt(document.getElementById('customBrightness').value);

        console.log(`Applying color ${color} at ${brightness}% to LEDs:`, Array.from(this.selectedLeds));

        for (const ledIndex of this.selectedLeds) {
            await this.setIndividualLED(ledIndex, color, brightness);
        }

        console.log('All LEDs updated successfully');
    }

    async setColorPreset(preset) {
        if (!this.bluetooth.hasCharacteristic('colorPreset')) {
            alert('Not connected to lamp');
            return;
        }

        try {
            const data = new Uint8Array([preset]);
            await this.bluetooth.writeCharacteristic('colorPreset', data);
            console.log('Color preset set:', preset);
            return true;
        } catch (error) {
            console.error('Failed to set color preset:', error);
            alert('Failed to set color preset');
            return false;
        }
    }

    async setBrightness(brightness) {
        if (!this.bluetooth.hasCharacteristic('brightness')) {
            alert('Not connected to lamp');
            return;
        }

        try {
            const data = new Uint8Array([brightness]);
            await this.bluetooth.writeCharacteristic('brightness', data);
            console.log('Brightness set:', brightness);
        } catch (error) {
            console.error('Failed to set brightness:', error);
            alert('Failed to set brightness');
        }
    }

    async readLEDState() {
        try {
            const value = await this.bluetooth.readCharacteristic('ledState');
            this.handleLEDStateUpdate(value);
        } catch (error) {
            console.error('Failed to read LED state:', error);
        }
    }
}
