import {
    LAMP_SERVICE_UUID,
    LED_STATE_CHAR_UUID,
    COLOR_PRESET_CHAR_UUID,
    BRIGHTNESS_CHAR_UUID,
    LED_CUSTOM_CHAR_UUID,
    MOTOR_POSITION_CHAR_UUID,
    TIME_SYNC_CHAR_UUID,
    AUTO_TRACKING_CHAR_UUID,
    AUTOMATIONS_CHAR_UUID,
    CUSTOM_PRESETS_CHAR_UUID,
    DEVICE_NAME_CHAR_UUID,
    MOTOR_SPEED_CHAR_UUID
} from './constants.js';

// Characteristics safe for write-without-response (fire-and-forget, no confirmation needed)
const FAST_WRITE_CHARS = new Set([
    'colorPreset', 'brightness', 'ledCustom', 'motorPosition', 'timeSync', 'motorSpeed'
]);

export class BluetoothManager {
    constructor() {
        this.device = null;
        this.server = null;
        this.service = null;
        this.characteristics = {};
        this.isConnecting = false;
        this.abortConnection = false;
        this._intentionalDisconnect = false;
        this._gattQueue = [];
        this._gattBusy = false;
        this.onConnectionChange = null;
        this.onLEDStateUpdate = null;
        this.onReconnected = null;
        this.onRetryAttempt = null;
    }

    get isConnected() {
        return this.device && this.device.gatt.connected;
    }

    async connect() {
        // Check if Web Bluetooth API is supported
        if (!navigator.bluetooth) {
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

            if (isIOS) {
                throw new Error(
                    'Web Bluetooth is not supported on iOS Safari.\n\n' +
                    'To use this app on iOS, please install the "Bluefy" browser from the App Store, ' +
                    'which adds Web Bluetooth support.'
                );
            } else {
                throw new Error(
                    'Web Bluetooth is not supported in this browser. ' +
                    'Please use Chrome, Edge, or Opera on desktop/Android.'
                );
            }
        }

        try {
            this.isConnecting = true;
            this.abortConnection = false;
            this._intentionalDisconnect = false;
            this._notifyConnectionChange('connecting');
            console.log('Requesting Bluetooth Device...');

            this.device = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: 'Moon Lamp' },
                    { namePrefix: 'MoonLamp' }
                ],
                optionalServices: [LAMP_SERVICE_UUID]
            });

            this.device.addEventListener('gattserverdisconnected', () => {
                console.log('Device disconnected');
                this._handleDisconnect();
            });

            await this._connectToDevice();
            return true;
        } catch (error) {
            console.error('Connection failed:', error);
            this.isConnecting = false;
            // Clear device reference so isConnected returns false
            this.device = null;
            this.server = null;
            this.service = null;
            this.characteristics = {};
            this._notifyConnectionChange('disconnected');

            if (error.name === 'NotFoundError' || error.message.includes('cancelled')) {
                console.log('User cancelled selection');
                return false;
            }

            if (this.abortConnection || error.message.includes('aborted')) {
                console.log('Connection aborted');
                return false;
            }

            throw error;
        }
    }

    async _connectToDevice() {
        const maxRetries = 5;
        const isAndroid = /Android/i.test(navigator.userAgent);
        let lastError;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                if (this.abortConnection) {
                    throw new Error('Connection aborted');
                }

                console.log(`Connection attempt ${attempt}/${maxRetries}...`);
                console.log('Connecting to GATT Server...');

                const connectPromise = this.device.gatt.connect();
                const timeout = attempt <= 2 ? 15000 : 10000;
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Connection timeout')), timeout)
                );

                this.server = await Promise.race([connectPromise, timeoutPromise]);

                if (this.abortConnection) {
                    throw new Error('Connection aborted');
                }

                if (!this.server || !this.server.connected) {
                    throw new Error('GATT server not connected after connect()');
                }

                console.log('Getting Service...');
                const servicePromise = this.server.getPrimaryService(LAMP_SERVICE_UUID);
                const serviceTimeout = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Service discovery timeout')), 10000)
                );
                this.service = await Promise.race([servicePromise, serviceTimeout]);

                console.log('Getting Characteristics...');
                // Fetch characteristics sequentially to avoid overwhelming Android BLE stack
                const charMap = [
                    ['ledState', LED_STATE_CHAR_UUID],
                    ['colorPreset', COLOR_PRESET_CHAR_UUID],
                    ['brightness', BRIGHTNESS_CHAR_UUID],
                    ['ledCustom', LED_CUSTOM_CHAR_UUID],
                    ['motorPosition', MOTOR_POSITION_CHAR_UUID],
                    ['timeSync', TIME_SYNC_CHAR_UUID],
                    ['autoTracking', AUTO_TRACKING_CHAR_UUID],
                    ['automations', AUTOMATIONS_CHAR_UUID],
                    ['customPresets', CUSTOM_PRESETS_CHAR_UUID],
                    ['deviceName', DEVICE_NAME_CHAR_UUID],
                    ['motorSpeed', MOTOR_SPEED_CHAR_UUID]
                ];

                for (let i = 0; i < charMap.length; i++) {
                    const [key, uuid] = charMap[i];
                    try {
                        this.characteristics[key] = await this.service.getCharacteristic(uuid);
                        console.log(`✓ ${key} characteristic found`);
                    } catch (e) {
                        this.characteristics[key] = null;
                        console.log(`${key} characteristic not available`);
                    }
                    // Small delay between discoveries for Android BLE stack stability
                    if (i < charMap.length - 1) {
                        await new Promise(r => setTimeout(r, 50));
                    }
                }

                // Verify required characteristics are present
                const required = ['ledState', 'colorPreset', 'brightness', 'ledCustom', 'motorPosition'];
                for (const key of required) {
                    if (!this.characteristics[key]) {
                        throw new Error(`Required characteristic '${key}' not found`);
                    }
                }

                // Subscribe to LED state notifications
                await this.characteristics.ledState.startNotifications();
                this.characteristics.ledState.addEventListener('characteristicvaluechanged', (e) => {
                    if (this.onLEDStateUpdate) {
                        this.onLEDStateUpdate(e.target.value);
                    }
                });

                // Small delay between notification subscriptions for Android stability
                await new Promise(r => setTimeout(r, 100));

                // Subscribe to motor position notifications (for calibration completion)
                await this.characteristics.motorPosition.startNotifications();
                this.characteristics.motorPosition.addEventListener('characteristicvaluechanged', (e) => {
                    if (this.onMotorPositionUpdate) {
                        this.onMotorPositionUpdate(e.target.value);
                    }
                });

                this.isConnecting = false;
                this._notifyConnectionChange('connected');
                console.log('Connected successfully!');
                return;

            } catch (error) {
                lastError = error;
                console.log(`Attempt ${attempt} failed:`, error.message);

                // Explicitly disconnect to clear zombie connections on ESP32
                // (without this, the ESP32 stays in "connected" state and ignores new connections)
                try { this.device.gatt.disconnect(); } catch (e) {}

                if (this.abortConnection) {
                    console.log('Connection aborted by user');
                    throw new Error('Connection aborted');
                }
                if (this.onRetryAttempt) {
                    this.onRetryAttempt(attempt);
                }
                if (attempt < maxRetries) {
                    // Escalating delays — Windows BLE stack needs 10s+ to recover after degradation
                    const delays = isAndroid
                        ? [5000, 8000, 12000, 18000]
                        : [3000, 5000, 8000, 15000];
                    const delay = delays[Math.min(attempt - 1, delays.length - 1)];
                    console.log(`Retrying in ${delay / 1000}s... (${maxRetries - attempt} tries left)`);
                    if (!this.abortConnection) {
                        this._notifyConnectionChange('connecting');
                    }
                    await new Promise(resolve => {
                        const timer = setTimeout(resolve, delay);
                        const check = setInterval(() => {
                            if (this.abortConnection) {
                                clearTimeout(timer);
                                clearInterval(check);
                                resolve();
                            }
                        }, 100);
                    });
                    if (this.abortConnection) throw new Error('Connection aborted');
                } else {
                    this.isConnecting = false;
                    throw lastError;
                }
            }
        }
    }

    _handleDisconnect() {
        // Don't clear state if we're in the middle of a connection attempt
        // The retry logic will handle reconnection (unless aborted)
        if (this.isConnecting && !this.abortConnection) {
            console.log('Disconnect during connection attempt - will retry');
            return;
        }

        this._clearQueue();
        this.characteristics = {};
        this.server = null;
        this.service = null;

        // If intentional disconnect, don't auto-reconnect
        // (flag is reset by connect() when user initiates a new connection)
        if (this._intentionalDisconnect) {
            return;
        }

        // Auto-reconnect on unexpected disconnect
        this._autoReconnect();
    }

    _notifyConnectionChange(state) {
        if (this.onConnectionChange) {
            this.onConnectionChange(state);
        }
    }

    async _autoReconnect() {
        if (!this.device || this.isConnecting || this.abortConnection || this._intentionalDisconnect) return;

        try {
            this.isConnecting = true;
            this._notifyConnectionChange('connecting');
            console.log('Auto-reconnecting...');

            // Brief delay before attempting reconnect
            await new Promise(r => setTimeout(r, 1000));

            await this._connectToDevice();
            // _connectToDevice sets isConnecting=false and notifies 'connected' on success

            // Notify app to re-read device state after reconnection
            if (this.onReconnected && this.isConnected) {
                this.onReconnected();
            }
        } catch (error) {
            // Only update state if disconnect() hasn't already handled it
            if (!this._intentionalDisconnect) {
                this.isConnecting = false;
                this._notifyConnectionChange('disconnected');
            }
            console.log('Auto-reconnect failed:', error.message);
        }
    }

    abort() {
        this._intentionalDisconnect = true;
        this.abortConnection = true;
        this.isConnecting = false;
        this._clearQueue();
        this.characteristics = {};
        this.server = null;
        this.service = null;
        if (this.device) {
            try { this.device.gatt.disconnect(); } catch (e) {}
        }
        this._notifyConnectionChange('disconnected');
        console.log('Aborting connection...');
    }

    async disconnect() {
        this._intentionalDisconnect = true;
        this.abortConnection = true;
        this.isConnecting = false;
        this._clearQueue();
        if (this.device) {
            try { this.device.gatt.disconnect(); } catch (e) {}
        }
        this.characteristics = {};
        this.server = null;
        this.service = null;
        this._notifyConnectionChange('disconnected');
        console.log('Disconnected');
    }

    async syncTime() {
        if (!this.characteristics.timeSync) {
            console.warn('Time sync characteristic not available');
            return;
        }

        try {
            const utcTimestamp = Math.floor(Date.now() / 1000);
            const data = new Uint8Array(4);
            data[0] = utcTimestamp & 0xFF;
            data[1] = (utcTimestamp >> 8) & 0xFF;
            data[2] = (utcTimestamp >> 16) & 0xFF;
            data[3] = (utcTimestamp >> 24) & 0xFF;

            await this.writeCharacteristic('timeSync', data);
            console.log('Time synced to device (UTC seconds):', utcTimestamp);
        } catch (error) {
            console.error('Failed to sync time:', error);
        }
    }

    async writeCharacteristic(name, data) {
        const char = this.characteristics[name];
        if (!char) {
            throw new Error(`Characteristic ${name} not available`);
        }
        await this._enqueue(async () => {
            if (FAST_WRITE_CHARS.has(name) && char.writeValueWithoutResponse) {
                await char.writeValueWithoutResponse(data);
            } else if (char.writeValueWithResponse) {
                await char.writeValueWithResponse(data);
            } else {
                await char.writeValue(data);
            }
        });
    }

    async readCharacteristic(name) {
        const char = this.characteristics[name];
        if (!char) {
            throw new Error(`Characteristic ${name} not available`);
        }
        return await this._enqueue(() => char.readValue());
    }

    hasCharacteristic(name) {
        return !!this.characteristics[name];
    }

    // --- GATT Operation Queue ---
    // Serializes all BLE read/write operations to prevent "GATT operation in progress" errors
    async _enqueue(operation) {
        return new Promise((resolve, reject) => {
            this._gattQueue.push({ operation, resolve, reject });
            this._processQueue();
        });
    }

    async _processQueue() {
        if (this._gattBusy || this._gattQueue.length === 0) return;
        this._gattBusy = true;

        const { operation, resolve, reject } = this._gattQueue.shift();
        try {
            const result = await operation();
            resolve(result);
        } catch (error) {
            reject(error);
        } finally {
            this._gattBusy = false;
            this._processQueue();
        }
    }

    _clearQueue() {
        const pending = this._gattQueue.splice(0);
        for (const { reject } of pending) {
            reject(new Error('BLE queue cleared (disconnected)'));
        }
        this._gattBusy = false;
    }
}
