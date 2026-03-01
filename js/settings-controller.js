// Settings Controller - manages Full Mode toggle and other settings
import { Modal } from './modal.js';

export class SettingsController {
    constructor(bluetooth) {
        this.bluetooth = bluetooth;
        this.fullModeEnabled = false;  // Default OFF until read from device
        this.onFullModeChange = null;  // Callback when fullMode changes
        this.authController = null;   // Set by app.js
        this.securityEnabled = true;  // Default to security ON
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
            if (this.onFullModeChange) {
                this.onFullModeChange(this.fullModeEnabled);
            }
            return this.fullModeEnabled;
        } catch (error) {
            console.error('[Settings] Failed to read Full Mode:', error);
            return this.fullModeEnabled;
        }
    }

    async setFullMode(enabled) {
        this.fullModeEnabled = enabled;
        this.updateUI();
        if (this.onFullModeChange) {
            this.onFullModeChange(enabled);
        }

        if (!this.bluetooth.hasCharacteristic('fullMode')) {
            return false;
        }

        try {
            const data = new Uint8Array([enabled ? 1 : 0]);
            await this.bluetooth.writeCharacteristic('fullMode', data);
            console.log('[Settings] Full Mode set:', enabled ? 'ON' : 'OFF');
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

    async readSecurityEnabled() {
        if (!this.authController) return this.securityEnabled;
        try {
            this.securityEnabled = await this.authController.readSecurityEnabled();
            this.updateSecurityUI();
            return this.securityEnabled;
        } catch (error) {
            console.error('[Settings] Failed to read security state:', error);
            return this.securityEnabled;
        }
    }

    async setSecurityEnabled(enabled) {
        if (!this.authController) return false;
        const ok = await this.authController.setSecurityEnabled(enabled);
        if (ok) {
            this.securityEnabled = enabled;
            this.updateSecurityUI();
        }
        return ok;
    }

    updateUI() {
        const toggle = document.getElementById('fullModeToggle');
        if (toggle) {
            toggle.checked = this.fullModeEnabled;
        }
        this.updateSecurityUI();
    }

    updateSecurityUI() {
        // Security toggle is in the settings modal (ui.js) — nothing to update here
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
