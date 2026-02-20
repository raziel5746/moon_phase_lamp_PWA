// Moon Lamp PWA - Main Application
import { BluetoothManager } from './bluetooth.js';
import { LEDController } from './led-controller.js';
import { MotorController } from './motor-controller.js';
import { PresetsController } from './presets.js';
import { AutomationsController } from './automations.js';
import { UIController } from './ui.js';
import { Modal } from './modal.js';
import { moonIconSvg } from './utils.js';
import { MotorPresetsController } from './motor-presets.js';

// Fix for Chrome Android PWA viewport height bug
// Chrome miscalculates viewport height on reload in standalone mode
// Solution: Set CSS variable based on actual window.innerHeight
const setViewportHeight = () => {
    const vh = window.innerHeight;
    document.documentElement.style.setProperty('--app-height', `${vh}px`);
};
setViewportHeight();
window.addEventListener('resize', setViewportHeight);

class MoonLamp {
    constructor() {
        this.bluetooth = new BluetoothManager();
        this.ledController = new LEDController(this.bluetooth);
        this.motorController = new MotorController(this.bluetooth);
        this.presetsController = new PresetsController(this.bluetooth, this.ledController);
        this.automationsController = new AutomationsController(this.bluetooth, this.presetsController);
        this.motorPresetsController = new MotorPresetsController(this.motorController);
        this.motorController.motorPresetsController = this.motorPresetsController;
        this.uiController = new UIController(this.bluetooth);

        // Set up callbacks
        this.bluetooth.onConnectionChange = (state) => this._handleConnectionChange(state);
        this.bluetooth.onLEDStateUpdate = (value) => this._handleLEDStateUpdate(value);
        this.bluetooth.onReconnected = () => this._handleReconnected();
        this.bluetooth.onRetryAttempt = () => this.uiController.addRetryDot();

        this.init();
    }

    async init() {
        this.uiController.applyStoredTheme();
        this.setupEventListeners();
        this.ledController.createLEDRing();

        const titleIcon = document.getElementById('titleMoonIcon');
        if (titleIcon) titleIcon.innerHTML = moonIconSvg(40);
        this.motorController.createMotorDial();
        this.motorController.setupDialInteraction();
        this.uiController.updateConnectionStatus('disconnected');
        this.presetsController.renderPresets();
        this.motorController.initSpeedUI();
        this.motorPresetsController.renderPresets();
        requestAnimationFrame(() => this.updateBrightnessSlider(50));
        await this.uiController.loadAppVersion();
        this.uiController.registerServiceWorker();
    }

    _handleConnectionChange(state) {
        this.uiController.updateConnectionStatus(state);
    }

    async _handleReconnected() {
        try {
            if (this.bluetooth.hasCharacteristic('timeSync')) {
                await this.bluetooth.syncTime();
            }
            await this.ledController.readLEDState();
            await this.motorController.readMotorPosition();
            await this.motorController.readAutoTracking();
            await this.motorController.readMotorSpeed();
            await this.automationsController.readAutomations();
            await this.presetsController.readCustomPresets();
            await this.uiController.readDeviceName();
            this.presetsController.updatePresetFeedback(this.ledController.ledStates);
            const currentBrightness = this.ledController.ledStates[0]?.brightness || 50;
            this.updateBrightnessSlider(currentBrightness);
            // If auto-tracking is enabled, immediately sync to current moon position
            const autoTrackingToggle = document.getElementById('autoTrackingToggle');
            if (autoTrackingToggle && autoTrackingToggle.checked) {
                await this.motorController.setRealMoonPosition();
            }
        } catch (error) {
            console.error('Failed to read state after reconnect:', error);
        }
    }

    _handleLEDStateUpdate(value) {
        this.ledController.handleLEDStateUpdate(value);
        this.presetsController.updatePresetFeedback(this.ledController.ledStates);
    }

    setupEventListeners() {
        // Settings modal via title click (always available)
        document.querySelector('.app-title').addEventListener('click', () => {
            this.uiController.showSettingsModal(this.bluetooth.isConnected);
        });

        // Rename lamp by clicking on device name label (only when connected)
        document.getElementById('deviceNameLabel').addEventListener('click', () => {
            if (this.bluetooth.isConnected && this.bluetooth.hasCharacteristic('deviceName')) {
                this.uiController.showSettingsModal(true);
            }
        });

        // Bluetooth connection via status badge
        document.getElementById('connectionStatus').addEventListener('click', async () => {
            if (this.bluetooth.isConnecting) {
                const confirmed = await Modal.confirm('Cancel connection attempt?', 'Cancel');
                if (confirmed) {
                    this.bluetooth.abort();
                }
                return;
            }
            if (this.bluetooth.isConnected) {
                const confirmed = await Modal.confirm('Disconnect from Moon Lamp?', 'Disconnect');
                if (confirmed) {
                    this.uiController.updateConnectionStatus('disconnecting');
                    // Handle case where auto-reconnect started while modal was open
                    this.bluetooth.disconnect();
                }
            } else {
                this.connect();
            }
        });

        // Reset button
        const resetBtn = document.getElementById('resetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', async () => {
                const confirmed = await Modal.confirm('Reset app and clear cache? This will reload the app.', 'Reset App');
                if (confirmed) {
                    try {
                        const registrations = await navigator.serviceWorker.getRegistrations();
                        await Promise.all(registrations.map(r => r.unregister()));
                        const cacheNames = await caches.keys();
                        await Promise.all(cacheNames.map(name => caches.delete(name)));
                    } catch (e) {
                        console.error('Reset failed:', e);
                    }
                    window.location.reload();
                }
            });
        }

        // Tabs
        const tabOrder = ['presets', 'motor', 'automations'];

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = this.uiController.switchTab(e.currentTarget.dataset.tab);
                if (tabName === 'custom') {
                    requestAnimationFrame(() => this.ledController.updateLEDLayout());
                }
            });
        });

        // Swipe on tab bar to navigate tabs
        const tabBar = document.querySelector('.tabs');
        let swipeStartX = null;
        tabBar.addEventListener('touchstart', (e) => {
            swipeStartX = e.touches[0].clientX;
        }, { passive: true });
        tabBar.addEventListener('touchend', (e) => {
            if (swipeStartX === null) return;
            const dx = e.changedTouches[0].clientX - swipeStartX;
            swipeStartX = null;
            if (Math.abs(dx) < 40) return;
            const activeBtn = document.querySelector('.tab-btn.active');
            const currentIdx = tabOrder.indexOf(activeBtn?.dataset.tab);
            if (currentIdx === -1) return;
            const nextIdx = dx > 0 ? currentIdx + 1 : currentIdx - 1;
            if (nextIdx < 0 || nextIdx >= tabOrder.length) return;
            const tabName = this.uiController.switchTab(tabOrder[nextIdx]);
            if (tabName === 'custom') {
                requestAnimationFrame(() => this.ledController.updateLEDLayout());
            }
        }, { passive: true });

        // Color presets
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const preset = parseInt(e.currentTarget.dataset.preset);
                this.presetsController.setColorPreset(preset);
            });
        });

        // Brightness presets
        document.querySelectorAll('.brightness-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const brightness = parseInt(e.currentTarget.dataset.brightness);
                // Update UI immediately (optimistic update)
                document.querySelectorAll('.brightness-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.updateBrightnessSlider(brightness);
                // Then send to device
                this.ledController.setBrightness(brightness);
            });
        });

        // Brightness slider
        this.setupBrightnessSlider();

        // LED selection controls
        const selectAllBtn = document.getElementById('selectAllBtn');
        const selectMultipleToggle = document.getElementById('selectMultipleToggle');

        selectAllBtn.addEventListener('click', () => {
            this.ledController.selectAll();
        });

        selectMultipleToggle.addEventListener('change', () => {
            if (!selectMultipleToggle.checked && this.ledController.selectedLeds.size > 1) {
                const firstLed = Array.from(this.ledController.selectedLeds)[0];
                this.ledController.selectedLeds.clear();
                this.ledController.selectedLeds.add(firstLed);
                this.ledController.updateSelectionUI();
            }
        });

        this.ledController.updateSelectionUI();

        document.getElementById('customBrightness').addEventListener('input', (e) => {
            document.getElementById('customBrightnessValue').textContent = e.target.value + '%';
        });

        document.getElementById('applyCustomBtn').addEventListener('click', () => {
            this.ledController.applyToSelected();
        });

        // Motor settings menu
        const motorSettingsBtn = document.getElementById('motorSettingsBtn');
        const motorSettingsMenu = document.getElementById('motorSettingsMenu');

        motorSettingsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            motorSettingsMenu.classList.toggle('show');
        });

        document.addEventListener('click', (e) => {
            if (!motorSettingsMenu.contains(e.target) && e.target !== motorSettingsBtn) {
                motorSettingsMenu.classList.remove('show');
            }
        });

        document.getElementById('zeroBtn').addEventListener('click', () => {
            motorSettingsMenu.classList.remove('show');
            this.motorController.setMotorZero();
        });

        document.getElementById('calibrateBtn').addEventListener('click', () => {
            motorSettingsMenu.classList.remove('show');
            this.motorController.calibrateMotor();
        });

        document.getElementById('realMoonBtn').addEventListener('click', () => {
            this.motorController.setRealMoonPosition();
        });

        // Auto tracking controls
        const autoTrackingToggle = document.getElementById('autoTrackingToggle');
        const trackingInterval = document.getElementById('trackingInterval');

        if (autoTrackingToggle) {
            autoTrackingToggle.addEventListener('change', () => {
                const enabled = autoTrackingToggle.checked;
                const interval = parseInt(trackingInterval?.value || '60');
                this.motorController.setAutoTracking(enabled, interval);
            });
        }

        if (trackingInterval) {
            trackingInterval.addEventListener('change', () => {
                const enabled = autoTrackingToggle?.checked || false;
                const interval = parseInt(trackingInterval.value);
                this.motorController.setAutoTracking(enabled, interval);
            });
        }

        // Automations
        const addAutomationBtn = document.getElementById('addAutomationBtn');
        if (addAutomationBtn) {
            addAutomationBtn.addEventListener('click', () => {
                this.automationsController.showAddAutomationDialog();
            });
        }

        // Motor speed toggle button (cycles through speeds)
        const speedToggleBtn = document.getElementById('speedToggleBtn');
        if (speedToggleBtn) {
            speedToggleBtn.addEventListener('click', () => {
                this.motorController.cycleMotorSpeed();
            });
        }
    }

    async connect() {
        this.uiController.resetRetryDots();
        try {
            const connected = await this.bluetooth.connect();
            if (connected) {
                // Sync time immediately on connection
                if (this.bluetooth.hasCharacteristic('timeSync')) {
                    await this.bluetooth.syncTime();
                }

                // Read initial state
                await this.ledController.readLEDState();
                await this.motorController.readMotorPosition();
                await this.motorController.readAutoTracking();
                await this.motorController.readMotorSpeed();
                await this.automationsController.readAutomations();
                await this.presetsController.readCustomPresets();
                await this.uiController.readDeviceName();

                // If auto-tracking is enabled, immediately sync to current moon position
                const autoTrackingToggle = document.getElementById('autoTrackingToggle');
                if (autoTrackingToggle && autoTrackingToggle.checked) {
                    await this.motorController.setRealMoonPosition();
                }

                // Update preset feedback after reading LED state
                this.presetsController.updatePresetFeedback(this.ledController.ledStates);

                // Update brightness slider with current brightness
                const currentBrightness = this.ledController.ledStates[0]?.brightness || 50;
                this.updateBrightnessSlider(currentBrightness);
            }
        } catch (error) {
            Modal.error('Failed to connect: ' + error.message, 'Connection Error');
        }
    }

    // Public methods for inline event handlers in HTML
    showEditAutomationDialog(index) {
        this.automationsController.showEditAutomationDialog(index);
    }

    toggleAutomation(index, enabled) {
        this.automationsController.toggleAutomation(index, enabled);
    }

    removeAutomation(index) {
        this.automationsController.removeAutomation(index);
    }

    setupBrightnessSlider() {
        const slider = document.getElementById('brightnessSlider');
        const fill = document.getElementById('brightnessSliderFill');
        const valueEl = document.getElementById('brightnessSliderValue');
        if (!slider || !fill || !valueEl) return;

        let isDragging = false;
        let lastBrightness = 50;

        const updateSlider = (e) => {
            const rect = slider.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            let percent = ((clientX - rect.left) / rect.width) * 100;
            percent = Math.max(0, Math.min(100, Math.round(percent)));

            fill.style.width = percent + '%';
            valueEl.textContent = percent + '%';
            this._positionSliderLabel(slider, valueEl, percent);

            // Update preset button selection to match current value (only for preset values)
            document.querySelectorAll('.brightness-btn').forEach(btn => {
                const btnValue = parseInt(btn.dataset.brightness);
                if (percent === btnValue) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });

            return percent;
        };

        const sendBrightness = (brightness) => {
            if (brightness !== lastBrightness) {
                lastBrightness = brightness;
                // Update preset button selection based on final value
                document.querySelectorAll('.brightness-btn').forEach(btn => {
                    const btnValue = parseInt(btn.dataset.brightness);
                    btn.classList.toggle('active', btnValue === brightness);
                });
                this.ledController.setBrightness(brightness);
            }
        };

        slider.addEventListener('mousedown', (e) => {
            isDragging = true;
            updateSlider(e);
        });

        slider.addEventListener('touchstart', (e) => {
            isDragging = true;
            updateSlider(e);
            e.preventDefault();
        }, { passive: false });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) updateSlider(e);
        });

        document.addEventListener('touchmove', (e) => {
            if (isDragging) {
                updateSlider(e);
                e.preventDefault();
            }
        }, { passive: false });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                const percent = parseInt(fill.style.width);
                sendBrightness(percent);
            }
        });

        document.addEventListener('touchend', () => {
            if (isDragging) {
                isDragging = false;
                const percent = parseInt(fill.style.width);
                sendBrightness(percent);
            }
        });
    }

    _positionSliderLabel(slider, valueEl, percent) {
        const sliderWidth = slider.getBoundingClientRect().width;
        if (!sliderWidth) return;
        const labelWidth = valueEl.getBoundingClientRect().width || 44;
        const fillEdge = (percent / 100) * sliderWidth;
        const idealLeft = fillEdge - labelWidth - 32;
        const clamped = Math.max(4, Math.min(idealLeft, sliderWidth - labelWidth - 4));
        valueEl.style.left = clamped + 'px';
        valueEl.style.transform = 'translateY(-50%)';
    }

    updateBrightnessSlider(brightness) {
        const slider = document.getElementById('brightnessSlider');
        const fill = document.getElementById('brightnessSliderFill');
        const valueEl = document.getElementById('brightnessSliderValue');
        if (!fill || !valueEl || !slider) return;

        fill.style.width = brightness + '%';
        valueEl.textContent = brightness + '%';
        requestAnimationFrame(() => this._positionSliderLabel(slider, valueEl, brightness));

        document.querySelectorAll('.brightness-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.brightness) === brightness);
        });
    }
}

// Initialize app and expose to window for inline event handlers
const moonLamp = new MoonLamp();
window.moonLamp = moonLamp;
