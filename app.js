// Moon Lamp PWA - Web Bluetooth Control
// BLE Service and Characteristics UUIDs (must match ESP32)
const LAMP_SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
const LED_STATE_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef1';
const COLOR_PRESET_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef2';
const BRIGHTNESS_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef3';
const LED_CUSTOM_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef4';
const MOTOR_POSITION_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef5';

class MoonLamp {
    constructor() {
        this.device = null;
        this.server = null;
        this.service = null;
        this.characteristics = {};
        this.ledStates = Array(8).fill({ r: 255, g: 220, b: 150, brightness: 75 });
        this.selectedLed = null;
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.createLEDRing();
        this.createMotorDial();
        this.updateUI();
        
        // Register service worker for PWA
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('Service Worker registered', reg))
                .catch(err => console.error('Service Worker registration failed', err));
        }
    }
    
    setupEventListeners() {
        // Bluetooth connection
        document.getElementById('connectBtn').addEventListener('click', () => this.connect());
        document.getElementById('disconnectBtn').addEventListener('click', () => this.disconnect());
        
        // Tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });
        
        // Color presets
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const preset = parseInt(e.currentTarget.dataset.preset);
                this.setColorPreset(preset);
            });
        });
        
        // Brightness presets
        document.querySelectorAll('.brightness-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const brightness = parseInt(e.currentTarget.dataset.brightness);
                this.setBrightness(brightness);
            });
        });
        
        // Brightness slider
        const brightnessSlider = document.getElementById('brightnessSlider');
        brightnessSlider.addEventListener('input', (e) => {
            document.getElementById('brightnessValue').textContent = e.target.value + '%';
        });
        brightnessSlider.addEventListener('change', (e) => {
            this.setBrightness(parseInt(e.target.value));
        });
        
        // Custom color
        document.getElementById('applyCustomBtn').addEventListener('click', () => {
            const color = document.getElementById('colorPicker').value;
            const brightness = parseInt(document.getElementById('customBrightness').value);
            this.setCustomColor(color, brightness);
        });
        
        document.getElementById('customBrightness').addEventListener('input', (e) => {
            document.getElementById('customBrightnessValue').textContent = e.target.value + '%';
        });
        
        // Individual LED control
        document.getElementById('applyLedBtn').addEventListener('click', () => {
            if (this.selectedLed !== null) {
                const color = document.getElementById('ledColorPicker').value;
                const brightness = parseInt(document.getElementById('ledBrightness').value);
                this.setIndividualLED(this.selectedLed, color, brightness);
            }
        });
        
        document.getElementById('ledBrightness').addEventListener('input', (e) => {
            document.getElementById('ledBrightnessValue').textContent = e.target.value + '%';
        });
        
        // Motor control
        const motorSlider = document.getElementById('motorSlider');
        const motorDial = document.getElementById('motorDial');
        
        motorSlider.addEventListener('input', (e) => {
            const angle = parseInt(e.target.value);
            this.updateMotorPointer(angle);
            document.getElementById('motorValue').textContent = angle + '°';
        });
        
        // Dial interaction
        let isDragging = false;
        
        const handleMotorDrag = (e) => {
            e.preventDefault();
            const rect = motorDial.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            
            const dx = clientX - centerX;
            const dy = clientY - centerY;
            
            let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
            if (angle < 0) angle += 360;
            angle = Math.round(angle);
            
            motorSlider.value = angle;
            this.updateMotorPointer(angle);
            document.getElementById('motorValue').textContent = angle + '°';
        };
        
        motorDial.addEventListener('mousedown', (e) => {
            isDragging = true;
            handleMotorDrag(e);
        });
        
        motorDial.addEventListener('touchstart', (e) => {
            isDragging = true;
            handleMotorDrag(e);
        });
        
        document.addEventListener('mousemove', (e) => {
            if (isDragging) handleMotorDrag(e);
        });
        
        document.addEventListener('touchmove', (e) => {
            if (isDragging) handleMotorDrag(e);
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
        
        document.addEventListener('touchend', () => {
            isDragging = false;
        });
        
        document.getElementById('setMotorBtn').addEventListener('click', () => {
            const position = parseInt(document.getElementById('motorSlider').value);
            this.setMotorPosition(position);
        });
        
        document.getElementById('zeroMotorBtn').addEventListener('click', () => {
            this.setMotorZero();
        });
    }
    
    createLEDRing() {
        const ring = document.getElementById('ledRing');
        const radius = 100;
        const centerX = 125;
        const centerY = 125;
        
        for (let i = 0; i < 8; i++) {
            const angle = (i * 45 - 90) * Math.PI / 180;
            const x = centerX + radius * Math.cos(angle) - 10;
            const y = centerY + radius * Math.sin(angle) - 10;
            
            const led = document.createElement('div');
            led.className = 'led';
            led.style.left = x + 'px';
            led.style.top = y + 'px';
            led.dataset.index = i;
            led.addEventListener('click', () => this.selectLED(i));
            
            ring.appendChild(led);
        }
    }
    
    createMotorDial() {
        const markersGroup = document.getElementById('degreeMarkers');
        
        // Add degree markers every 30 degrees
        for (let i = 0; i < 12; i++) {
            const angle = i * 30;
            const rad = (angle - 90) * Math.PI / 180;
            const x1 = 125 + 90 * Math.cos(rad);
            const y1 = 125 + 90 * Math.sin(rad);
            const x2 = 125 + 100 * Math.cos(rad);
            const y2 = 125 + 100 * Math.sin(rad);
            
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', x1);
            line.setAttribute('y1', y1);
            line.setAttribute('x2', x2);
            line.setAttribute('y2', y2);
            line.setAttribute('stroke', '#666');
            line.setAttribute('stroke-width', '2');
            markersGroup.appendChild(line);
            
            // Add text labels
            const textRad = (angle - 90) * Math.PI / 180;
            const textX = 125 + 75 * Math.cos(textRad);
            const textY = 125 + 75 * Math.sin(textRad);
            
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', textX);
            text.setAttribute('y', textY);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('fill', '#888');
            text.setAttribute('font-size', '12');
            text.textContent = angle + '°';
            markersGroup.appendChild(text);
        }
    }
    
    updateMotorPointer(angle) {
        const pointer = document.getElementById('motorPointer');
        pointer.style.transform = `rotate(${angle}deg)`;
    }
    
    selectLED(index) {
        this.selectedLed = index;
        
        // Update visual selection
        document.querySelectorAll('.led').forEach((led, i) => {
            led.classList.toggle('selected', i === index);
        });
        
        // Show LED editor
        document.getElementById('ledEditor').style.display = 'block';
        document.getElementById('selectedLedNum').textContent = index;
        
        // Set current values
        const state = this.ledStates[index];
        const hex = this.rgbToHex(state.r, state.g, state.b);
        document.getElementById('ledColorPicker').value = hex;
        document.getElementById('ledBrightness').value = state.brightness;
        document.getElementById('ledBrightnessValue').textContent = state.brightness + '%';
    }
    
    updateLEDRing() {
        document.querySelectorAll('.led').forEach((led, i) => {
            const state = this.ledStates[i];
            const brightness = state.brightness / 100;
            const r = Math.round(state.r * brightness);
            const g = Math.round(state.g * brightness);
            const b = Math.round(state.b * brightness);
            led.style.background = `rgb(${r}, ${g}, ${b})`;
            led.style.boxShadow = `0 0 ${10 + brightness * 10}px rgba(${r}, ${g}, ${b}, 0.8)`;
        });
    }
    
    switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === tabName);
        });
    }
    
    updateConnectionStatus(connected) {
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        const connectBtn = document.getElementById('connectBtn');
        const disconnectBtn = document.getElementById('disconnectBtn');
        
        if (connected) {
            statusDot.classList.add('connected');
            statusText.textContent = 'Connected';
            connectBtn.style.display = 'none';
            disconnectBtn.style.display = 'block';
        } else {
            statusDot.classList.remove('connected');
            statusText.textContent = 'Not Connected';
            connectBtn.style.display = 'block';
            disconnectBtn.style.display = 'none';
        }
    }
    
    updateUI() {
        this.updateLEDRing();
        this.updateConnectionStatus(false);
    }
    
    // Bluetooth Methods
    async connect() {
        try {
            console.log('Requesting Bluetooth Device...');
            this.device = await navigator.bluetooth.requestDevice({
                filters: [{ name: 'MoonLamp' }],
                optionalServices: [LAMP_SERVICE_UUID]
            });
            
            console.log('Connecting to GATT Server...');
            this.server = await this.device.gatt.connect();
            
            console.log('Getting Service...');
            this.service = await this.server.getPrimaryService(LAMP_SERVICE_UUID);
            
            console.log('Getting Characteristics...');
            this.characteristics.ledState = await this.service.getCharacteristic(LED_STATE_CHAR_UUID);
            this.characteristics.colorPreset = await this.service.getCharacteristic(COLOR_PRESET_CHAR_UUID);
            this.characteristics.brightness = await this.service.getCharacteristic(BRIGHTNESS_CHAR_UUID);
            this.characteristics.ledCustom = await this.service.getCharacteristic(LED_CUSTOM_CHAR_UUID);
            this.characteristics.motorPosition = await this.service.getCharacteristic(MOTOR_POSITION_CHAR_UUID);
            
            // Subscribe to LED state notifications
            await this.characteristics.ledState.startNotifications();
            this.characteristics.ledState.addEventListener('characteristicvaluechanged', (e) => {
                this.handleLEDStateUpdate(e.target.value);
            });
            
            this.updateConnectionStatus(true);
            console.log('Connected successfully!');
            
            // Read initial state
            await this.readLEDState();
            
        } catch (error) {
            console.error('Connection failed:', error);
            alert('Failed to connect: ' + error.message);
        }
    }
    
    async disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
            this.updateConnectionStatus(false);
            console.log('Disconnected');
        }
    }
    
    async readLEDState() {
        try {
            const value = await this.characteristics.ledState.readValue();
            this.handleLEDStateUpdate(value);
        } catch (error) {
            console.error('Failed to read LED state:', error);
        }
    }
    
    handleLEDStateUpdate(dataView) {
        // Parse LED state data (8 LEDs * 4 bytes each: R, G, B, Brightness)
        for (let i = 0; i < 8; i++) {
            const offset = i * 4;
            this.ledStates[i] = {
                r: dataView.getUint8(offset),
                g: dataView.getUint8(offset + 1),
                b: dataView.getUint8(offset + 2),
                brightness: dataView.getUint8(offset + 3)
            };
        }
        this.updateLEDRing();
    }
    
    async setColorPreset(preset) {
        if (!this.characteristics.colorPreset) {
            alert('Not connected to lamp');
            return;
        }
        
        try {
            const data = new Uint8Array([preset]);
            await this.characteristics.colorPreset.writeValue(data);
            console.log('Color preset set:', preset);
        } catch (error) {
            console.error('Failed to set color preset:', error);
            alert('Failed to set color preset');
        }
    }
    
    async setBrightness(brightness) {
        if (!this.characteristics.brightness) {
            alert('Not connected to lamp');
            return;
        }
        
        try {
            const data = new Uint8Array([brightness]);
            await this.characteristics.brightness.writeValue(data);
            console.log('Brightness set:', brightness);
        } catch (error) {
            console.error('Failed to set brightness:', error);
            alert('Failed to set brightness');
        }
    }
    
    async setCustomColor(hexColor, brightness) {
        const rgb = this.hexToRgb(hexColor);
        
        // Apply to all LEDs
        for (let i = 0; i < 8; i++) {
            await this.setIndividualLED(i, hexColor, brightness);
        }
    }
    
    async setIndividualLED(index, hexColor, brightness) {
        if (!this.characteristics.ledCustom) {
            alert('Not connected to lamp');
            return;
        }
        
        try {
            const rgb = this.hexToRgb(hexColor);
            const data = new Uint8Array([index, rgb.r, rgb.g, rgb.b, brightness]);
            await this.characteristics.ledCustom.writeValue(data);
            console.log(`LED ${index} set:`, rgb, brightness);
            
            // Update local state
            this.ledStates[index] = { ...rgb, brightness };
            this.updateLEDRing();
        } catch (error) {
            console.error('Failed to set LED:', error);
            alert('Failed to set LED');
        }
    }
    
    async setMotorPosition(position) {
        if (!this.characteristics.motorPosition) {
            alert('Not connected to lamp');
            return;
        }
        
        try {
            const data = new Uint16Array([position]);
            await this.characteristics.motorPosition.writeValue(data);
            console.log('Motor position set:', position);
            document.getElementById('currentPosition').textContent = position + '°';
        } catch (error) {
            console.error('Failed to set motor position:', error);
            alert('Failed to set motor position');
        }
    }
    
    async setMotorZero() {
        await this.setMotorPosition(0);
    }
    
    // Utility methods
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 255, g: 220, b: 150 };
    }
    
    rgbToHex(r, g, b) {
        return "#" + [r, g, b].map(x => {
            const hex = x.toString(16);
            return hex.length === 1 ? "0" + hex : hex;
        }).join('');
    }
}

// Initialize app
const lamp = new MoonLamp();
