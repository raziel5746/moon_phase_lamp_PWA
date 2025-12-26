// Bluetooth connection management
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
    DEVICE_NAME_CHAR_UUID
} from './constants.js';

export class BluetoothManager {
    constructor() {
        this.device = null;
        this.server = null;
        this.service = null;
        this.characteristics = {};
        this.isConnecting = false;
        this.onConnectionChange = null;
        this.onLEDStateUpdate = null;
    }

    get isConnected() {
        return this.device && this.device.gatt.connected;
    }

    async connect() {
        try {
            this.isConnecting = true;
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
        const baseDelay = 2000; // 2 seconds base delay
        let lastError;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`Connection attempt ${attempt}/${maxRetries}...`);

                // Android workaround: disconnect before connecting to clear any stale connection state
                if (this.device.gatt.connected) {
                    console.log('Device appears connected, disconnecting first...');
                    try {
                        this.device.gatt.disconnect();
                        await new Promise(resolve => setTimeout(resolve, 500));
                    } catch (e) {
                        console.log('Pre-disconnect failed (expected):', e.message);
                    }
                }

                console.log('Connecting to GATT Server...');
                const connectPromise = this.device.gatt.connect();
                // Longer timeout for first attempt (15s), shorter for retries (10s)
                const timeout = attempt === 1 ? 15000 : 10000;
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Connection timeout')), timeout)
                );

                this.server = await Promise.race([connectPromise, timeoutPromise]);
                // Increased delay after GATT connect to let the connection stabilize
                await new Promise(resolve => setTimeout(resolve, 1000));

                console.log('Getting Service...');
                const servicePromise = this.server.getPrimaryService(LAMP_SERVICE_UUID);
                const serviceTimeout = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Service discovery timeout')), 10000)
                );
                this.service = await Promise.race([servicePromise, serviceTimeout]);

                if (!this.server || !this.server.connected) {
                    throw new Error('GATT server disconnected while getting service');
                }

                console.log('Getting Characteristics...');
                const [ledState, colorPreset, brightness, ledCustom, motorPosition] = await Promise.all([
                    this.service.getCharacteristic(LED_STATE_CHAR_UUID),
                    this.service.getCharacteristic(COLOR_PRESET_CHAR_UUID),
                    this.service.getCharacteristic(BRIGHTNESS_CHAR_UUID),
                    this.service.getCharacteristic(LED_CUSTOM_CHAR_UUID),
                    this.service.getCharacteristic(MOTOR_POSITION_CHAR_UUID)
                ]);

                this.characteristics.ledState = ledState;
                this.characteristics.colorPreset = colorPreset;
                this.characteristics.brightness = brightness;
                this.characteristics.ledCustom = ledCustom;
                this.characteristics.motorPosition = motorPosition;

                // Optional characteristics
                await this._getOptionalCharacteristics();

                // Subscribe to LED state notifications
                await this.characteristics.ledState.startNotifications();
                this.characteristics.ledState.addEventListener('characteristicvaluechanged', (e) => {
                    if (this.onLEDStateUpdate) {
                        this.onLEDStateUpdate(e.target.value);
                    }
                });

                this.isConnecting = false;
                this._notifyConnectionChange('connected');
                console.log('Connected successfully!');
                return;

            } catch (error) {
                lastError = error;
                console.log(`Attempt ${attempt} failed:`, error.message);

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

    async _getOptionalCharacteristics() {
        const optionalChars = [
            { key: 'timeSync', uuid: TIME_SYNC_CHAR_UUID, name: 'Time sync' },
            { key: 'autoTracking', uuid: AUTO_TRACKING_CHAR_UUID, name: 'Auto tracking' },
            { key: 'automations', uuid: AUTOMATIONS_CHAR_UUID, name: 'Automations' },
            { key: 'customPresets', uuid: CUSTOM_PRESETS_CHAR_UUID, name: 'Custom presets' },
            { key: 'deviceName', uuid: DEVICE_NAME_CHAR_UUID, name: 'Device name' }
        ];

        for (const { key, uuid, name } of optionalChars) {
            try {
                this.characteristics[key] = await this.service.getCharacteristic(uuid);
                console.log(`${name} characteristic found`);
            } catch (e) {
                console.log(`${name} characteristic not available (older firmware)`);
                this.characteristics[key] = null;
            }
        }
    }

    _handleDisconnect() {
        // Don't clear state if we're in the middle of a connection attempt
        // The retry logic will handle reconnection
        if (this.isConnecting) {
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
