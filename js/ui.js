import { Modal } from './modal.js';
import { moonIconSvg } from './utils.js';

// UI Controller
export class UIController {
    constructor(bluetooth) {
        this.bluetooth = bluetooth;
        this.currentDeviceName = null;
        this.waitingServiceWorker = null;
        this.deferredInstallPrompt = null;
        this._failedAttempts = 0;
        
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
        statusDot.classList.remove('connected', 'connecting', 'disconnecting');
        const deviceLabel = document.getElementById('deviceNameLabel');

        switch (state) {
            case 'connected':
                statusDot.classList.add('connected');
                this.resetRetryDots();
                if (deviceLabel) deviceLabel.classList.add('clickable');
                break;
            case 'connecting':
                statusDot.classList.add('connecting');
                if (deviceLabel) deviceLabel.classList.remove('clickable');
                break;
            case 'disconnecting':
                statusDot.classList.add('disconnecting');
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

    resetRetryDots() {
        this._failedAttempts = 0;
        const statusDot = document.getElementById('statusDot');
        if (statusDot) {
            statusDot.querySelectorAll('.status-retry-dot').forEach(d => d.remove());
        }
    }

    addRetryDot() {
        this._failedAttempts++;
        const statusDot = document.getElementById('statusDot');
        if (statusDot) {
            const dot = document.createElement('span');
            dot.className = 'status-retry-dot';
            statusDot.appendChild(dot);
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
                // Show name without "Moon Lamp - " prefix in the app (it's already in the title)
                let displayName = this.currentDeviceName;
                if (displayName.startsWith('Moon Lamp - ')) {
                    displayName = displayName.substring('Moon Lamp - '.length);
                } else if (displayName.startsWith('Moon Lamp ')) {
                    displayName = displayName.substring('Moon Lamp '.length);
                } else if (displayName === 'Moon Lamp') {
                    displayName = '';
                }
                if (displayName) {
                    labelEl.textContent = displayName;
                    labelEl.classList.add('visible');
                }
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
            const data = encoder.encode(newName.substring(0, 42));
            await this.bluetooth.writeCharacteristic('deviceName', data);
            this.currentDeviceName = newName;
            console.log('Device name set to:', newName);
            
            const labelEl = document.getElementById('deviceNameLabel');
            if (labelEl) {
                // Show name without "Moon Lamp - " prefix in the app
                let displayName = newName;
                if (displayName.startsWith('Moon Lamp - ')) {
                    displayName = displayName.substring('Moon Lamp - '.length);
                } else if (displayName.startsWith('Moon Lamp ')) {
                    displayName = displayName.substring('Moon Lamp '.length);
                } else if (displayName === 'Moon Lamp') {
                    displayName = '';
                }
                if (displayName) {
                    labelEl.textContent = displayName;
                    labelEl.classList.add('visible');
                } else {
                    labelEl.textContent = '';
                    labelEl.classList.remove('visible');
                }
            }
            
            Modal.success('Name saved! Restart the lamp for the new Bluetooth name to take effect.', 'Name Updated');
        } catch (error) {
            console.error('Failed to set device name:', error);
            Modal.error('Failed to set device name');
        }
    }

    showSettingsModal(isConnected) {
        const currentName = this.currentDeviceName || 'Moon Lamp';
        const prefix = 'Moon Lamp - ';
        let suffix = '';
        if (currentName.startsWith(prefix)) {
            suffix = currentName.substring(prefix.length);
        } else if (currentName.startsWith('Moon Lamp ')) {
            suffix = currentName.substring('Moon Lamp '.length);
        } else if (currentName !== 'Moon Lamp') {
            suffix = currentName.replace('Moon Lamp', '').replace(/^\s*-?\s*/, '');
        }

        const isDark = document.documentElement.getAttribute('data-theme') !== 'light';

        const renameSection = isConnected ? `
            <div class="settings-section">
                <h3 class="settings-section-title">Lamp Name</h3>
                <div style="position: relative;">
                    <input type="text" id="deviceNameInput" value="${suffix}" maxlength="30" placeholder="Name your lamp" style="width: 100%; padding: 10px 14px; padding-right: 50px; background: var(--surface); border: 1px solid var(--glass-border); border-radius: 8px; color: var(--text); font-size: 0.95em; box-sizing: border-box;">
                    <span id="nameCharCount" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 0.75em; color: var(--text-secondary); pointer-events: none;">${suffix.length}/30</span>
                </div>
                <p class="info-text" style="margin-top: 6px; font-size: 0.8em;">This name appears when searching for Bluetooth devices. Restart lamp after renaming.</p>
                <div class="dialog-buttons" style="margin-top: 12px;">
                    <button class="btn" id="cancelRenameBtn">Cancel</button>
                    <button class="btn btn-primary" id="saveRenameBtn">Save Name</button>
                </div>
            </div>
        ` : `
            <div class="settings-section">
                <p class="info-text" style="text-align: center;">Connect to lamp to rename it.</p>
                <div class="dialog-buttons" style="margin-top: 12px;">
                    <button class="btn" id="cancelRenameBtn">Close</button>
                </div>
            </div>
        `;

        const currentDefault = this.getDefaultTab();
        const dialog = document.createElement('div');
        dialog.className = 'preset-dialog';
        dialog.innerHTML = `
            <div class="preset-dialog-content">
                <h3>Moon Lamp</h3>
                <div class="settings-section">
                    <h3 class="settings-section-title">Appearance</h3>
                    <button class="btn theme-toggle-btn" id="themeToggleBtn">
                        ${isDark
                            ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:6px"><circle cx="12" cy="12" r="5"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>Switch to Light`
                            : `${moonIconSvg(15, 'vertical-align:-2px;margin-right:6px')}Switch to Dark`
                        }
                    </button>
                </div>
                <div class="settings-section">
                    <h3 class="settings-section-title">Default Tab</h3>
                    <select id="defaultTabSelect" style="width:100%;padding:10px 14px;background:var(--surface);border:1px solid var(--glass-border);border-radius:8px;color:var(--text);font-size:0.95em;cursor:pointer;appearance:none;-webkit-appearance:none;">
                        <option value="presets"${currentDefault === 'presets' ? ' selected' : ''}>Presets</option>
                        <option value="motor"${currentDefault === 'motor' ? ' selected' : ''}>Motor</option>
                        <option value="automations"${currentDefault === 'automations' ? ' selected' : ''}>Schedule</option>
                    </select>
                </div>
                ${renameSection}
            </div>
        `;
        document.body.appendChild(dialog);

        document.getElementById('defaultTabSelect').addEventListener('change', (e) => {
            localStorage.setItem('defaultTab', e.target.value);
        });

        document.getElementById('themeToggleBtn').addEventListener('click', () => {
            this.toggleTheme();
            dialog.remove();
        });

        document.getElementById('cancelRenameBtn').addEventListener('click', () => {
            dialog.remove();
        });

        if (isConnected) {
            const input = document.getElementById('deviceNameInput');
            const charCount = document.getElementById('nameCharCount');
            input.focus();
            input.select();

            input.addEventListener('input', () => {
                charCount.textContent = `${input.value.length}/30`;
            });

            const saveName = async () => {
                const s = input.value.trim();
                const fullName = s ? `Moon Lamp - ${s}` : 'Moon Lamp';
                await this.setDeviceName(fullName);
                dialog.remove();
            };

            document.getElementById('saveRenameBtn').addEventListener('click', saveName);
            input.addEventListener('keypress', async (e) => {
                if (e.key === 'Enter') await saveName();
            });
        }

        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) dialog.remove();
        });
    }

    getDefaultTab() {
        return localStorage.getItem('defaultTab') || 'presets';
    }

    toggleTheme() {
        const html = document.documentElement;
        const isLight = html.getAttribute('data-theme') === 'light';
        if (isLight) {
            html.removeAttribute('data-theme');
            localStorage.setItem('theme', 'dark');
        } else {
            html.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
        }
    }

    applyStoredTheme() {
        const stored = localStorage.getItem('theme');
        if (stored === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
        }
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

        // Hide moon icon to prevent header overflow
        const titleMoonIcon = document.getElementById('titleMoonIcon');
        if (titleMoonIcon) titleMoonIcon.style.display = 'none';
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
