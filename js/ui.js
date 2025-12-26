// UI Controller
export class UIController {
    constructor(bluetooth) {
        this.bluetooth = bluetooth;
        this.currentDeviceName = null;
    }

    updateConnectionStatus(state) {
        const statusDot = document.getElementById('statusDot');
        const appTitle = document.querySelector('.app-title');

        statusDot.classList.remove('connected', 'connecting');

        switch (state) {
            case 'connected':
                statusDot.classList.add('connected');
                appTitle.classList.add('clickable');
                break;
            case 'connecting':
                statusDot.classList.add('connecting');
                appTitle.classList.remove('clickable');
                break;
            default:
                appTitle.classList.remove('clickable');
        }
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === tabName);
        });

        return tabName;
    }

    async loadAppVersion() {
        const versionEl = document.getElementById('appVersion');
        if (!versionEl) return;

        const setVersion = (label) => {
            versionEl.textContent = label;
            versionEl.setAttribute('aria-label', `App version ${label}`);
        };

        if (!window.location.protocol.startsWith('http')) {
            setVersion('dev');
            console.info('App version fetch skipped: requires serving over http/https.');
            return;
        }

        try {
            const response = await fetch('version.json');
            if (!response.ok) throw new Error('Failed to load version');
            const data = await response.json();
            if (data?.version) {
                setVersion(`v${data.version}`);
            }
        } catch (error) {
            console.warn('Unable to load app version:', error);
            setVersion('dev');
        }
    }

    async readDeviceName() {
        if (!this.bluetooth.hasCharacteristic('deviceName')) {
            console.log('Device name characteristic not available');
            return;
        }

        try {
            const value = await this.bluetooth.readCharacteristic('deviceName');
            const decoder = new TextDecoder();
            this.currentDeviceName = decoder.decode(value);
            console.log('Device name:', this.currentDeviceName);
            
            const titleEl = document.querySelector('.app-title h1');
            if (titleEl && this.currentDeviceName) {
                titleEl.textContent = '🌙 ' + this.currentDeviceName;
            }
        } catch (error) {
            console.error('Failed to read device name:', error);
        }
    }

    async setDeviceName(newName) {
        if (!this.bluetooth.hasCharacteristic('deviceName')) {
            alert('Device name feature not available on this firmware');
            return;
        }

        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(newName.substring(0, 20));
            await this.bluetooth.writeCharacteristic('deviceName', data);
            this.currentDeviceName = newName;
            console.log('Device name set to:', newName);
            
            const titleEl = document.querySelector('.app-title h1');
            if (titleEl) {
                titleEl.textContent = '🌙 ' + newName;
            }
            
            alert('Name saved! Restart the lamp for the new Bluetooth name to take effect.');
        } catch (error) {
            console.error('Failed to set device name:', error);
            alert('Failed to set device name');
        }
    }

    showRenameDialog() {
        const currentName = this.currentDeviceName || 'Moon Lamp';
        const prefix = 'Moon Lamp';
        let suffix = '';
        if (currentName.startsWith(prefix + ' ')) {
            suffix = currentName.substring(prefix.length + 1);
        } else if (currentName !== prefix) {
            suffix = currentName.replace(prefix, '').trim();
        }
        
        const dialog = document.createElement('div');
        dialog.className = 'preset-dialog';
        dialog.innerHTML = `
            <div class="preset-dialog-content">
                <h3>Rename Lamp</h3>
                <div class="form-row">
                    <label style="min-width: auto;">Moon Lamp</label>
                    <input type="text" id="deviceNameInput" value="${suffix}" maxlength="9" placeholder="(optional)" style="flex: 1; padding: 10px 14px; background: var(--card-bg); border: 1px solid var(--glass-border); border-radius: 8px; color: var(--text); font-size: 0.95em;">
                </div>
                <p class="info-text" style="margin-top: 8px; font-size: 0.8em;">Add a suffix to identify this lamp. Restart lamp after renaming.</p>
                <div class="dialog-buttons">
                    <button class="btn" id="cancelRenameBtn">Cancel</button>
                    <button class="btn btn-primary" id="saveRenameBtn">Save</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);

        const input = document.getElementById('deviceNameInput');
        input.focus();
        input.select();

        document.getElementById('cancelRenameBtn').addEventListener('click', () => {
            dialog.remove();
        });

        const saveName = async () => {
            const suffix = input.value.trim();
            const fullName = suffix ? `Moon Lamp ${suffix}` : 'Moon Lamp';
            await this.setDeviceName(fullName);
            dialog.remove();
        };

        document.getElementById('saveRenameBtn').addEventListener('click', saveName);

        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) dialog.remove();
        });

        input.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                await saveName();
            }
        });
    }

    registerServiceWorker() {
        const isSecureProtocol = window.location.protocol.startsWith('http');

        if ('serviceWorker' in navigator && isSecureProtocol) {
            const swVersion = 'v__VERSION__';
            let refreshing = false;
            
            // Check for force reset flag
            if (window.location.search.includes('reset=1')) {
                this.forceResetSW().then(() => {
                    window.location.href = window.location.pathname;
                });
                return;
            }
            
            navigator.serviceWorker.register(`./sw.js?v=${swVersion}`)
                .then(reg => {
                    console.log('Service Worker registered', reg);
                })
                .catch(err => console.error('Service Worker registration failed', err));
        } else if (!isSecureProtocol) {
            console.info('Service worker registration skipped: requires http/https protocol.');
        }
    }

    async forceResetSW() {
        console.log('Force resetting service worker...');
        try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(r => r.unregister()));
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
            console.log('Service worker and caches cleared');
        } catch (e) {
            console.error('Reset failed:', e);
        }
    }
}
