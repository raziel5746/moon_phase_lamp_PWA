import { Modal } from './modal.js';

// UI Controller
export class UIController {
    constructor(bluetooth) {
        this.bluetooth = bluetooth;
        this.currentDeviceName = null;
        this.waitingServiceWorker = null;
        this.deferredInstallPrompt = null;
        
        // Capture the install prompt event
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredInstallPrompt = e;
            this.showInstallButton();
        });
        
        // Hide install button if app is already installed
        window.addEventListener('appinstalled', () => {
            this.deferredInstallPrompt = null;
            this.hideInstallButton();
        });
    }

    updateConnectionStatus(state) {
        const statusDot = document.getElementById('statusDot');
        statusDot.classList.remove('connected', 'connecting');
        const deviceLabel = document.getElementById('deviceNameLabel');

        switch (state) {
            case 'connected':
                statusDot.classList.add('connected');
                if (deviceLabel) deviceLabel.classList.add('clickable');
                break;
            case 'connecting':
                statusDot.classList.add('connecting');
                if (deviceLabel) deviceLabel.classList.remove('clickable');
                break;
            default:
                if (deviceLabel) {
                    deviceLabel.classList.remove('clickable');
                    deviceLabel.textContent = '';
                    deviceLabel.classList.remove('visible');
                }
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

        // Use the version embedded in this file by the build process
        // This ensures we show the version of the actual code running
        const embeddedVersion = '__VERSION__';
        
        const isDev = embeddedVersion.includes('__');
        if (isDev) {
            versionEl.textContent = 'dev';
            const labelEl = document.getElementById('deviceNameLabel');
            if (labelEl) {
                labelEl.textContent = 'placeholder';
                labelEl.classList.add('visible', 'dev-placeholder');
            }
        } else {
            versionEl.textContent = `v${embeddedVersion}`;
        }
        versionEl.setAttribute('aria-label', `App version ${versionEl.textContent}`);
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
            
            const labelEl = document.getElementById('deviceNameLabel');
            if (labelEl && this.currentDeviceName) {
                labelEl.textContent = this.currentDeviceName;
                labelEl.classList.add('visible');
            }
        } catch (error) {
            console.error('Failed to read device name:', error);
        }
    }

    async setDeviceName(newName) {
        if (!this.bluetooth.hasCharacteristic('deviceName')) {
            Modal.warning('Device name feature not available on this firmware');
            return;
        }

        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(newName.substring(0, 20));
            await this.bluetooth.writeCharacteristic('deviceName', data);
            this.currentDeviceName = newName;
            console.log('Device name set to:', newName);
            
            const labelEl = document.getElementById('deviceNameLabel');
            if (labelEl) {
                labelEl.textContent = newName;
                labelEl.classList.add('visible');
            }
            
            Modal.success('Name saved! Restart the lamp for the new Bluetooth name to take effect.', 'Name Updated');
        } catch (error) {
            console.error('Failed to set device name:', error);
            Modal.error('Failed to set device name');
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
            
            // Listen for controller change - this fires when a new SW takes control
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (refreshing) return;
                refreshing = true;
                setTimeout(() => window.location.reload(), 100);
            });
            
            
            navigator.serviceWorker.register(`./sw.js?v=${swVersion}`)
                .then(reg => {
                    if (reg.waiting) {
                        this.onNewServiceWorkerAvailable(reg.waiting);
                    }
                    
                    reg.addEventListener('updatefound', () => {
                        const newWorker = reg.installing;
                        if (!newWorker) return;
                        
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                this.onNewServiceWorkerAvailable(newWorker);
                            }
                        });
                    });
                })
                .catch(err => console.error('Service Worker registration failed', err));
        } else if (!isSecureProtocol) {
            console.info('Service worker registration skipped: requires http/https protocol.');
        }
    }
    
    async onNewServiceWorkerAvailable(worker) {
        this.waitingServiceWorker = worker;
        await this.showUpdateButton();
    }
    
    async showUpdateButton() {
        // Remove existing button if any
        const existingBtn = document.getElementById('updateBtn');
        if (existingBtn) existingBtn.remove();
        
        // Fetch the new version number from network (bypassing cache)
        let newVersion = 'Update';
        let newVersionRaw = null;
        try {
            const response = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
            if (response.ok) {
                const data = await response.json();
                if (data?.version) {
                    newVersion = `v${data.version}`;
                    newVersionRaw = data.version;
                }
            }
        } catch (e) {
            console.warn('Could not fetch new version:', e);
        }
        
        // Get current version to compare
        const versionEl = document.getElementById('appVersion');
        const currentVersion = versionEl?.textContent?.replace('v', '');
        
        // Don't show button if versions match
        if (newVersionRaw && currentVersion && newVersionRaw === currentVersion) {
            return;
        }
        
        const updateBtn = document.createElement('button');
        updateBtn.id = 'updateBtn';
        updateBtn.className = 'update-btn';
        updateBtn.innerHTML = `<span>${newVersion}</span>`;
        updateBtn.title = 'New version available - click to update';
        
        updateBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.applyUpdate();
        });
        
        // Insert before connection status in header-actions
        const headerActions = document.querySelector('.header-actions');
        const connectionStatus = document.getElementById('connectionStatus');
        if (headerActions && connectionStatus) {
            headerActions.insertBefore(updateBtn, connectionStatus);
        }
    }
    
    applyUpdate() {
        if (!this.waitingServiceWorker) {
            window.location.reload();
            return;
        }
        
        this.waitingServiceWorker.postMessage({ type: 'SKIP_WAITING' });
        
        // Fallback: if controllerchange doesn't fire within 2 seconds, force reload
        setTimeout(() => window.location.reload(), 2000);
    }

    async forceResetSW() {
        try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(r => r.unregister()));
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
        } catch (e) {
            console.error('Reset failed:', e);
        }
    }
    
    showInstallButton() {
        // Don't show if already exists
        if (document.getElementById('installBtn')) return;
        
        const installBtn = document.createElement('button');
        installBtn.id = 'installBtn';
        installBtn.className = 'install-btn';
        installBtn.innerHTML = '<span>Install</span>';
        installBtn.title = 'Install app to home screen';
        
        installBtn.addEventListener('click', async () => {
            if (!this.deferredInstallPrompt) return;
            
            this.deferredInstallPrompt.prompt();
            const { outcome } = await this.deferredInstallPrompt.userChoice;
            
            if (outcome === 'accepted') {
                this.deferredInstallPrompt = null;
                this.hideInstallButton();
            }
        });
        
        // Insert before connection status
        const headerActions = document.querySelector('.header-actions');
        const connectionStatus = document.getElementById('connectionStatus');
        if (headerActions && connectionStatus) {
            headerActions.insertBefore(installBtn, connectionStatus);
        }
    }
    
    hideInstallButton() {
        const installBtn = document.getElementById('installBtn');
        if (installBtn) installBtn.remove();
    }
}
