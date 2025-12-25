// Moon Lamp PWA - Main Application
import { BluetoothManager } from './bluetooth.js';
import { LEDController } from './led-controller.js';
import { MotorController } from './motor-controller.js';
import { PresetsController } from './presets.js';
import { AutomationsController } from './automations.js';
import { UIController } from './ui.js';

class MoonLamp {
    constructor() {
        this.bluetooth = new BluetoothManager();
        this.ledController = new LEDController(this.bluetooth);
        this.motorController = new MotorController(this.bluetooth);
        this.presetsController = new PresetsController(this.bluetooth, this.ledController);
        this.automationsController = new AutomationsController(this.bluetooth, this.presetsController);
        this.uiController = new UIController(this.bluetooth);

        // Set up callbacks
        this.bluetooth.onConnectionChange = (state) => this._handleConnectionChange(state);
        this.bluetooth.onLEDStateUpdate = (value) => this._handleLEDStateUpdate(value);

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.ledController.createLEDRing();
        this.motorController.createMotorDial();
        this.motorController.setupDialInteraction();
        this.uiController.updateConnectionStatus('disconnected');
        this.presetsController.renderPresets();
        this.uiController.loadAppVersion();
        this.uiController.registerServiceWorker();
    }

    _handleConnectionChange(state) {
        this.uiController.updateConnectionStatus(state);
    }

    _handleLEDStateUpdate(value) {
        this.ledController.handleLEDStateUpdate(value);
        this.presetsController.updatePresetFeedback(this.ledController.ledStates);
    }

    setupEventListeners() {
        // Rename lamp by clicking on title (only when connected)
        document.querySelector('.app-title h1').addEventListener('click', () => {
            if (this.bluetooth.isConnected && this.bluetooth.hasCharacteristic('deviceName')) {
                this.uiController.showRenameDialog();
            }
        });

        // Bluetooth connection via status badge
        document.getElementById('connectionStatus').addEventListener('click', () => {
            if (this.bluetooth.isConnected) {
                if (confirm('Disconnect from Moon Lamp?')) {
                    this.bluetooth.disconnect();
                }
            } else {
                this.connect();
            }
        });

        // Tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = this.uiController.switchTab(e.target.dataset.tab);
                if (tabName === 'custom') {
                    requestAnimationFrame(() => this.ledController.updateLEDLayout());
                }
            });
        });

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
                // Then send to device
                this.ledController.setBrightness(brightness);
            });
        });

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
    }

    async connect() {
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
                await this.automationsController.readAutomations();
                await this.presetsController.readCustomPresets();
                await this.uiController.readDeviceName();

                // Update preset feedback after reading LED state
                this.presetsController.updatePresetFeedback(this.ledController.ledStates);
            }
        } catch (error) {
            alert('Failed to connect: ' + error.message);
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
}

// Initialize app and expose to window for inline event handlers
const moonLamp = new MoonLamp();
window.moonLamp = moonLamp;
