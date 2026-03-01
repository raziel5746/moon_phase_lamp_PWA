// Settings Controller - manages Full Mode toggle and other settings
import { Modal } from './modal.js';

export class SettingsController {
    constructor(bluetooth) {
        this.bluetooth = bluetooth;
        this.fullModeEnabled = true;  // Default to Full Mode
        this.onFullModeChange = null;  // Callback when fullMode changes
    }

    async readFullMode() {
        if (!this.bluetooth.hasCharacteristic('fullMode')) {
            console.log('[Settings] fullMode characteristic not available');
            return this.fullModeEnabled;
        }

        try {
            const value = await this.bluetooth.readCharacteristic('fullMode');
            this.fullModeEnabled = value.getUint8(0) !== 0;
            console.log('[Settings] Full Mode read:', this.fullModeEnabled ? 'ON' : 'OFF');
            this.updateUI();
            return this.fullModeEnabled;
        } catch (error) {
            console.error('[Settings] Failed to read Full Mode:', error);
            return this.fullModeEnabled;
        }
    }

    async setFullMode(enabled) {
        if (!this.bluetooth.hasCharacteristic('fullMode')) {
            Modal.warning('Not connected to lamp');
            return false;
        }

        try {
            const data = new Uint8Array([enabled ? 1 : 0]);
            await this.bluetooth.writeCharacteristic('fullMode', data);
            this.fullModeEnabled = enabled;
            console.log('[Settings] Full Mode set:', enabled ? 'ON' : 'OFF');
            this.updateUI();
            
            if (this.onFullModeChange) {
                this.onFullModeChange(enabled);
            }
            
            return true;
        } catch (error) {
            console.error('[Settings] Failed to set Full Mode:', error);
            Modal.error('Failed to update Full Mode');
            return false;
        }
    }

    async toggleFullMode() {
        return await this.setFullMode(!this.fullModeEnabled);
    }

    updateUI() {
        const toggle = document.getElementById('fullModeToggle');
        if (toggle) {
            toggle.checked = this.fullModeEnabled;
        }
    }

    setupEventListeners() {
        const toggle = document.getElementById('fullModeToggle');
        if (toggle) {
            toggle.addEventListener('change', async (e) => {
                await this.setFullMode(e.target.checked);
            });
        }
    }
}
