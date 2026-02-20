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

export class BluetoothManager {
    constructor() {
        this.device = null;
        this.server = null;
        this.service = null;
        this.characteristics = {};
        this.isConnecting = false;
        this.abortConnection = false;
        this.onConnectionChange = null;
        this.onLEDStateUpdate = null;
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

            throw error;
        }
    }

    async _connectToDevice() {
        const maxRetries = 3;
        const baseDelay = 3000; // 3 seconds base delay
        let lastError;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`Connection attempt ${attempt}/${maxRetries}...`);

                // Always force-disconnect before each attempt to clear any stale GATT state
                try {
                    this.device.gatt.disconnect();
                    // Android needs longer cooldown after disconnect before reconnecting
                    const isAndroid = /Android/i.test(navigator.userAgent);
                    await new Promise(resolve => setTimeout(resolve, isAndroid ? 3000 : 1000));
                } catch (e) {
                    // Expected if not connected
                }

                console.log('Connecting to GATT Server...');
                const connectPromise = this.device.gatt.connect();
                // Longer timeout for first attempt (15s), shorter for retries (10s)
                const timeout = attempt === 1 ? 15000 : 10000;
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Connection timeout')), timeout)
                );

                this.server = await Promise.race([connectPromise, timeoutPromise]);
                // Wait for connection parameter negotiation to complete
                await new Promise(resolve => setTimeout(resolve, 3000));

                // Re-connect if the parameter negotiation caused a transient disconnect
                if (!this.server.connected) {
                    console.log('Reconnecting after parameter negotiation...');
                    this.server = await this.device.gatt.connect();
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                if (!this.server.connected) {
                    throw new Error('GATT server disconnected after stabilization');
                }

                console.log('Getting Service...');
                const servicePromise = this.server.getPrimaryService(LAMP_SERVICE_UUID);
                const serviceTimeout = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Service discovery timeout')), 10000)
                );
                this.service = await Promise.race([servicePromise, serviceTimeout]);

                console.log('Getting Characteristics...');
                // Fetch all characteristics in one parallel batch to minimize GATT round-trips
                const allUUIDs = [
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
                ];
                const allKeys = [
                    'ledState', 'colorPreset', 'brightness', 'ledCustom', 'motorPosition',
                    'timeSync', 'autoTracking', 'automations', 'customPresets', 'deviceName', 'motorSpeed'
                ];

                const results = await Promise.allSettled(
                    allUUIDs.map(uuid => this.service.getCharacteristic(uuid))
                );

                results.forEach((result, i) => {
                    if (result.status === 'fulfilled') {
                        this.characteristics[allKeys[i]] = result.value;
                        console.log(`✓ ${allKeys[i]} characteristic found`);
                    } else {
                        this.characteristics[allKeys[i]] = null;
                        console.log(`${allKeys[i]} characteristic not available`);
                    }
                });

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

                if (this.abortConnection) {
                    this.isConnecting = false;
                    this.abortConnection = false;
                    this._notifyConnectionChange('disconnected');
                    console.log('Connection aborted by user');
                    return;
                }
                if (attempt < maxRetries) {
                    // Exponential backoff: 2s, 4s, 8s...
                    const delay = baseDelay * Math.pow(2, attempt - 1);
                    console.log(`Retrying in ${delay / 1000}s... (${maxRetries - attempt} tries left)`);
                    this._notifyConnectionChange('connecting');
                    await new Promise(resolve => setTimeout(resolve, delay));
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

        this.characteristics = {};
        this.server = null;
        this.service = null;
        this._notifyConnectionChange('disconnected');
    }

    _notifyConnectionChange(state) {
        if (this.onConnectionChange) {
            this.onConnectionChange(state);
        }
    }

    abort() {
        this.abortConnection = true;
        if (this.device) {
            try { this.device.gatt.disconnect(); } catch (e) {}
        }
        console.log('Aborting connection...');
    }

    async disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.isConnecting = false;
            this.device.gatt.disconnect();
            this._notifyConnectionChange('disconnected');
            console.log('Disconnected');
        }
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

            await this.characteristics.timeSync.writeValue(data);
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
        await char.writeValue(data);
    }

    async readCharacteristic(name) {
        const char = this.characteristics[name];
        if (!char) {
            throw new Error(`Characteristic ${name} not available`);
        }
        return await char.readValue();
    }

    hasCharacteristic(name) {
        return !!this.characteristics[name];
    }
}
