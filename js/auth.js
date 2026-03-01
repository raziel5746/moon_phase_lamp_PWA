// Auth Controller — handles color sequence pairing and token-based authentication

const AUTH_CMD_TOKEN = 0x01;
const AUTH_CMD_SEQUENCE = 0x02;
const AUTH_CMD_PAIR = 0x03;
const AUTH_CMD_SET_ENABLE = 0x04;

const AUTH_RESP_NOT_AUTH = 0x00;
const AUTH_RESP_AUTH_OK = 0x01;
const AUTH_RESP_PAIRED = 0x02;
const AUTH_RESP_PAIRING_START = 0x03;
const AUTH_RESP_WRONG_SEQ = 0x10;
const AUTH_RESP_LOCKED_OUT = 0x11;

const AUTH_COLORS = [
    { name: 'Red',    hex: '#FF0000', rgb: [255, 0, 0] },
    { name: 'Green',  hex: '#00FF00', rgb: [0, 255, 0] },
    { name: 'Blue',   hex: '#0000FF', rgb: [0, 0, 255] },
    { name: 'Yellow', hex: '#FFFF00', rgb: [255, 255, 0] },
    { name: 'Purple', hex: '#8000FF', rgb: [128, 0, 255] },
    { name: 'White',  hex: '#FFFFFF', rgb: [255, 255, 255] }
];

const SEQUENCE_LENGTH = 5;
const TOKEN_KEY = 'moonlamp_auth_token';

export class AuthController {
    constructor(bluetooth) {
        this.bluetooth = bluetooth;
        this.selectedColors = [];
        this.overlay = null;
        this._resolveAuth = null;
        this._rejectAuth = null;
        this.securityEnabled = true;

        // Listen for auth notifications
        this.bluetooth.onAuthUpdate = (dataView) => this._handleAuthNotify(dataView);
    }

    /**
     * Main entry point — called after BLE connect, before reading state.
     * Returns true if authenticated, false if failed/cancelled.
     */
    async authenticate() {
        if (!this.bluetooth.hasCharacteristic('auth')) {
            console.log('[Auth] No auth characteristic — skipping auth');
            return true;
        }

        try {
            // Read auth status
            const status = await this.bluetooth.readCharacteristic('auth');
            const authStatus = status.getUint8(0);
            const secEnabled = status.getUint8(1);
            this.securityEnabled = secEnabled !== 0;

            console.log(`[Auth] Status: auth=${authStatus}, security=${secEnabled}`);

            // Already authenticated (security disabled or somehow already auth'd)
            if (authStatus === 0x01) {
                console.log('[Auth] Already authenticated');
                return true;
            }

            // Security enabled, need to authenticate
            if (!this.securityEnabled) {
                console.log('[Auth] Security disabled — proceeding');
                return true;
            }

            // Try stored token first
            const token = this._getStoredToken();
            if (token) {
                console.log('[Auth] Trying stored token...');
                const tokenResult = await this._tryToken(token);
                if (tokenResult) {
                    console.log('[Auth] Token accepted');
                    return true;
                }
                console.log('[Auth] Token rejected — clearing');
                this._clearStoredToken();
            }

            // No valid token — need to pair
            console.log('[Auth] Starting pairing flow...');
            return await this._startPairing();
        } catch (error) {
            console.error('[Auth] Authentication error:', error);
            return false;
        }
    }

    /**
     * Try authenticating with a stored token.
     * Returns a Promise that resolves to true/false.
     */
    _tryToken(token) {
        return new Promise((resolve) => {
            const data = new Uint8Array(1 + token.length);
            data[0] = AUTH_CMD_TOKEN;
            data.set(token, 1);

            // Set up one-shot listener for response
            const origHandler = this.bluetooth.onAuthUpdate;
            this.bluetooth.onAuthUpdate = (dataView) => {
                this.bluetooth.onAuthUpdate = origHandler;
                const resp = dataView.getUint8(0);
                resolve(resp === AUTH_RESP_AUTH_OK);
            };

            this.bluetooth.writeCharacteristic('auth', data).catch(() => {
                this.bluetooth.onAuthUpdate = origHandler;
                resolve(false);
            });
        });
    }

    /**
     * Start the visual pairing flow.
     */
    async _startPairing() {
        return new Promise(async (resolve, reject) => {
            this._resolveAuth = resolve;
            this._rejectAuth = reject;

            // Request pairing mode (ESP32 starts flashing)
            const data = new Uint8Array([AUTH_CMD_PAIR]);
            await this.bluetooth.writeCharacteristic('auth', data);

            // Show pairing overlay
            this._showPairingOverlay();
        });
    }

    /**
     * Handle auth notifications from ESP32.
     */
    _handleAuthNotify(dataView) {
        const resp = dataView.getUint8(0);
        console.log(`[Auth] Notify: 0x${resp.toString(16)}`);

        switch (resp) {
            case AUTH_RESP_PAIRING_START:
                console.log('[Auth] Pairing mode started — lamp is flashing');
                break;

            case AUTH_RESP_PAIRED: {
                // Success — extract token
                const token = new Uint8Array(16);
                for (let i = 0; i < 16; i++) {
                    token[i] = dataView.getUint8(1 + i);
                }
                this._storeToken(token);
                this._hidePairingOverlay();
                if (this._resolveAuth) {
                    this._resolveAuth(true);
                    this._resolveAuth = null;
                }
                break;
            }

            case AUTH_RESP_WRONG_SEQ: {
                const attemptsLeft = dataView.getUint8(1);
                this._showStatus(`Wrong sequence — ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} left`, 'error');
                this._resetSelection();
                break;
            }

            case AUTH_RESP_LOCKED_OUT:
                this._showStatus('Too many wrong attempts — locked for 60 seconds', 'error');
                this._setInputEnabled(false);
                setTimeout(() => {
                    this._setInputEnabled(true);
                    this._showStatus('Watch your Moon Lamp and tap the colors in order', 'info');
                }, 60000);
                break;

            case AUTH_RESP_AUTH_OK:
                this._hidePairingOverlay();
                if (this._resolveAuth) {
                    this._resolveAuth(true);
                    this._resolveAuth = null;
                }
                break;

            case AUTH_RESP_NOT_AUTH:
                // Token invalid notification during pairing — ignore
                break;
        }
    }

    // --- Pairing Overlay UI ---

    _showPairingOverlay() {
        if (this.overlay) return;
        this.selectedColors = [];

        const overlay = document.createElement('div');
        overlay.className = 'auth-overlay';
        overlay.innerHTML = `
            <div class="auth-container">
                <div class="auth-header">
                    <div class="auth-icon">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.5">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                    </div>
                    <h2 class="auth-title">Pairing Required</h2>
                </div>
                <p class="auth-instruction" id="authStatus">Watch your Moon Lamp and tap the colors in order</p>
                <div class="auth-slots" id="authSlots">
                    ${Array(SEQUENCE_LENGTH).fill('<div class="auth-slot empty"></div>').join('')}
                </div>
                <div class="auth-colors" id="authColors">
                    ${AUTH_COLORS.map((c, i) => `
                        <button class="auth-color-btn" data-index="${i}" style="background: ${c.hex};" title="${c.name}">
                            <span class="auth-color-label">${c.name}</span>
                        </button>
                    `).join('')}
                </div>
                <div class="auth-actions">
                    <button class="auth-undo-btn" id="authUndo" disabled>Undo</button>
                </div>
            </div>
        `;

        // Event listeners
        overlay.querySelectorAll('.auth-color-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const index = parseInt(btn.dataset.index);
                this._selectColor(index);
            });
        });

        overlay.querySelector('#authUndo').addEventListener('click', () => {
            this._undoLastColor();
        });

        document.body.appendChild(overlay);
        this.overlay = overlay;

        // Trigger entrance animation
        requestAnimationFrame(() => overlay.classList.add('visible'));
    }

    _hidePairingOverlay() {
        if (!this.overlay) return;
        this.overlay.classList.remove('visible');
        setTimeout(() => {
            this.overlay.remove();
            this.overlay = null;
        }, 300);
    }

    _selectColor(index) {
        if (this.selectedColors.length >= SEQUENCE_LENGTH) return;

        this.selectedColors.push(index);
        this._updateSlots();

        // Auto-submit when 5 colors selected
        if (this.selectedColors.length === SEQUENCE_LENGTH) {
            this._submitSequence();
        }
    }

    _undoLastColor() {
        if (this.selectedColors.length === 0) return;
        this.selectedColors.pop();
        this._updateSlots();
    }

    _resetSelection() {
        this.selectedColors = [];
        this._updateSlots();
    }

    _updateSlots() {
        if (!this.overlay) return;
        const slots = this.overlay.querySelectorAll('.auth-slot');
        slots.forEach((slot, i) => {
            if (i < this.selectedColors.length) {
                const colorIdx = this.selectedColors[i];
                slot.style.background = AUTH_COLORS[colorIdx].hex;
                slot.classList.remove('empty');
            } else {
                slot.style.background = '';
                slot.classList.add('empty');
            }
        });

        const undoBtn = this.overlay.querySelector('#authUndo');
        if (undoBtn) {
            undoBtn.disabled = this.selectedColors.length === 0;
        }
    }

    async _submitSequence() {
        const data = new Uint8Array(1 + SEQUENCE_LENGTH);
        data[0] = AUTH_CMD_SEQUENCE;
        for (let i = 0; i < SEQUENCE_LENGTH; i++) {
            data[1 + i] = this.selectedColors[i];
        }

        this._showStatus('Verifying...', 'info');
        this._setInputEnabled(false);

        try {
            await this.bluetooth.writeCharacteristic('auth', data);
            // Response comes via notification — re-enable input after a timeout
            // in case notification doesn't arrive
            setTimeout(() => this._setInputEnabled(true), 3000);
        } catch (error) {
            console.error('[Auth] Failed to submit sequence:', error);
            this._showStatus('Connection error — try again', 'error');
            this._resetSelection();
            this._setInputEnabled(true);
        }
    }

    _showStatus(message, type) {
        if (!this.overlay) return;
        const el = this.overlay.querySelector('#authStatus');
        if (el) {
            el.textContent = message;
            el.className = `auth-instruction auth-status-${type}`;
        }
    }

    _setInputEnabled(enabled) {
        if (!this.overlay) return;
        this.overlay.querySelectorAll('.auth-color-btn').forEach(btn => {
            btn.disabled = !enabled;
        });
        const undoBtn = this.overlay.querySelector('#authUndo');
        if (undoBtn) undoBtn.disabled = !enabled || this.selectedColors.length === 0;
    }

    // --- Security Settings ---

    async readSecurityEnabled() {
        if (!this.bluetooth.hasCharacteristic('auth')) return true;
        try {
            const status = await this.bluetooth.readCharacteristic('auth');
            this.securityEnabled = status.getUint8(1) !== 0;
            return this.securityEnabled;
        } catch (e) {
            console.error('[Auth] Failed to read security state:', e);
            return this.securityEnabled;
        }
    }

    async setSecurityEnabled(enabled) {
        if (!this.bluetooth.hasCharacteristic('auth')) return false;
        try {
            const data = new Uint8Array([AUTH_CMD_SET_ENABLE, enabled ? 1 : 0]);
            await this.bluetooth.writeCharacteristic('auth', data);
            this.securityEnabled = enabled;
            console.log(`[Auth] Security ${enabled ? 'enabled' : 'disabled'}`);
            return true;
        } catch (e) {
            console.error('[Auth] Failed to set security:', e);
            return false;
        }
    }

    // --- Token Storage ---

    _getStoredToken() {
        try {
            const hex = localStorage.getItem(TOKEN_KEY);
            if (!hex || hex.length !== 32) return null;
            const token = new Uint8Array(16);
            for (let i = 0; i < 16; i++) {
                token[i] = parseInt(hex.substr(i * 2, 2), 16);
            }
            return token;
        } catch (e) {
            return null;
        }
    }

    _storeToken(token) {
        try {
            const hex = Array.from(token).map(b => b.toString(16).padStart(2, '0')).join('');
            localStorage.setItem(TOKEN_KEY, hex);
            console.log('[Auth] Token stored');
        } catch (e) {
            console.error('[Auth] Failed to store token:', e);
        }
    }

    _clearStoredToken() {
        try {
            localStorage.removeItem(TOKEN_KEY);
        } catch (e) {}
    }
}
