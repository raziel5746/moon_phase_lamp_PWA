import { Modal } from './modal.js';

// UI Controller
export class UIController {
    constructor(bluetooth) {
        this.bluetooth = bluetooth;
        this.currentDeviceName = null;
        this.waitingServiceWorker = null;
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
            // Load version from cache (not network) to show the actual installed version
            // This ensures the header shows the cached version, not the latest server version
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
            Modal.warning('Device name feature not available on this firmware');
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
                console.log('controllerchange fired! New service worker took control');
                console.log('Current controller:', navigator.serviceWorker.controller?.scriptURL);
                if (refreshing) return;
                refreshing = true;
                // Reload to get new files from the new SW
                console.log('Reloading page...');
                window.location.reload();
            });
            
            // Also listen for activation complete as backup
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data?.type === 'ACTIVATION_COMPLETE') {
                    console.log('SW activation complete message received');
                    // The controllerchange event should handle the reload
                    // This is just for logging
                }
            });
            
            navigator.serviceWorker.register(`./sw.js?v=${swVersion}`)
                .then(reg => {
                    console.log('Service Worker registered', reg);
                    console.log('SW state - installing:', reg.installing, 'waiting:', reg.waiting, 'active:', reg.active);
                    
                    // Check if there's already a waiting SW
                    if (reg.waiting) {
                        console.log('Found waiting SW on registration');
                        this.onNewServiceWorkerAvailable(reg.waiting);
                    }
                    
                    // Listen for new SW installing
                    reg.addEventListener('updatefound', () => {
                        console.log('updatefound event fired');
                        const newWorker = reg.installing;
                        if (!newWorker) return;
                        
                        console.log('New worker installing, state:', newWorker.state);
                        newWorker.addEventListener('statechange', () => {
                            console.log('Worker state changed to:', newWorker.state);
                            // New SW is installed and waiting
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                console.log('New SW installed and waiting, showing update button');
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
        console.log('New service worker available');
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
        
        // Get current cached version to compare
        const versionEl = document.getElementById('appVersion');
        const currentVersion = versionEl?.textContent?.replace('v', '');
        
        // Don't show button if versions match (already updated)
        if (newVersionRaw && currentVersion && newVersionRaw === currentVersion) {
            console.log('Versions match, hiding update button:', currentVersion);
            return;
        }
        
        const updateBtn = document.createElement('button');
        updateBtn.id = 'updateBtn';
        updateBtn.className = 'update-btn';
        updateBtn.innerHTML = `<span>${newVersion}</span>`;
        updateBtn.title = 'New version available - click to update';
        
        updateBtn.addEventListener('click', () => {
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
        console.log('applyUpdate called, waitingServiceWorker:', this.waitingServiceWorker);
        if (!this.waitingServiceWorker) {
            console.log('No waiting service worker!');
            return;
        }
        
        // Send skip waiting message to the waiting SW
        console.log('Sending SKIP_WAITING to:', this.waitingServiceWorker.scriptURL);
        this.waitingServiceWorker.postMessage('SKIP_WAITING');
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
