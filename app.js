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
        this.selectedLeds = new Set(); // Track multiple selected LEDs
        this.ledElements = [];
        
        // Track a continuous motor dial angle for smooth wrap-around
        this.motorAngle = 0; // can go beyond 0–360 for animation purposes
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.createLEDRing();
        this.createMotorDial();
        this.updateUI();
        
        // Register service worker for PWA
        if ('serviceWorker' in navigator) {
            // Add a version query to force browsers (especially Android) to fetch the new SW
            const swVersion = 'v3.1';
            navigator.serviceWorker.register(`./sw.js?${swVersion}`)
                .then(reg => {
                    console.log('Service Worker registered', reg);

                    const showUpdatePrompt = (worker) => {
                        const shouldUpdate = confirm('A new version of Moon Lamp is available. Reload now?');
                        if (shouldUpdate) {
                            if (worker) {
                                worker.postMessage({ type: 'SKIP_WAITING' });
                            }
                        }
                    };

                    if (reg.waiting) {
                        showUpdatePrompt(reg.waiting);
                    }

                    reg.addEventListener('updatefound', () => {
                        const newWorker = reg.installing;
                        if (!newWorker) return;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                showUpdatePrompt(newWorker);
                            }
                        });
                    });

                    navigator.serviceWorker.addEventListener('controllerchange', () => {
                        window.location.reload();
                    });
                })
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
        
        // LED selection controls
        const selectMultipleToggle = document.getElementById('selectMultipleToggle');
        const selectAllBtn = document.getElementById('selectAllBtn');
        const selectedLedCount = document.getElementById('selectedLedCount');
        const applyCustomBtn = document.getElementById('applyCustomBtn');

        const updateSelectionUI = () => {
            const count = this.selectedLeds.size;
            
            // Update count display
            if (count === 0) {
                selectedLedCount.textContent = '0 LEDs';
                applyCustomBtn.textContent = 'Select LEDs first';
                applyCustomBtn.disabled = true;
            } else if (count === 8) {
                selectedLedCount.textContent = 'ALL LEDs';
                applyCustomBtn.textContent = 'Apply to ALL';
                applyCustomBtn.disabled = false;
            } else if (count === 1) {
                const ledNum = Array.from(this.selectedLeds)[0];
                selectedLedCount.textContent = `LED ${ledNum}`;
                applyCustomBtn.textContent = `Apply to LED ${ledNum}`;
                applyCustomBtn.disabled = false;
            } else {
                selectedLedCount.textContent = `${count} LEDs`;
                applyCustomBtn.textContent = `Apply to ${count} LEDs`;
                applyCustomBtn.disabled = false;
            }
            
            // Update center button state
            selectAllBtn.classList.toggle('active', count === 8);
            
            // Update LED visual states
            document.querySelectorAll('.led').forEach((led, i) => {
                led.classList.toggle('selected', this.selectedLeds.has(i));
            });
        };

        // Center button: select/deselect all
        selectAllBtn.addEventListener('click', () => {
            if (this.selectedLeds.size === 8) {
                this.selectedLeds.clear();
            } else {
                this.selectedLeds = new Set([0, 1, 2, 3, 4, 5, 6, 7]);
            }
            updateSelectionUI();
        });

        // Select multiple toggle changes selection behavior
        selectMultipleToggle.addEventListener('change', () => {
            // When switching to single-select mode, keep only the first selected LED
            if (!selectMultipleToggle.checked && this.selectedLeds.size > 1) {
                const firstLed = Array.from(this.selectedLeds)[0];
                this.selectedLeds.clear();
                this.selectedLeds.add(firstLed);
                updateSelectionUI();
            }
        });

        // Initialize UI
        updateSelectionUI();

        document.getElementById('customBrightness').addEventListener('input', (e) => {
            document.getElementById('customBrightnessValue').textContent = e.target.value + '%';
        });

        applyCustomBtn.addEventListener('click', async () => {
            if (this.selectedLeds.size === 0) {
                alert('Select at least one LED first');
                return;
            }
            
            const color = document.getElementById('colorPicker').value;
            const brightness = parseInt(document.getElementById('customBrightness').value);
            
            // Apply to all selected LEDs
            for (const ledIndex of this.selectedLeds) {
                await this.setIndividualLED(ledIndex, color, brightness);
            }
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
        this.ledElements = [];
        
        for (let i = 0; i < 8; i++) {
            const led = document.createElement('div');
            led.className = 'led';
            led.dataset.index = i;
            led.addEventListener('click', () => this.selectLED(i));
            ring.appendChild(led);
            this.ledElements.push(led);
        }
        
        // Position LEDs now and on future resizes
        this.updateLEDLayout();
        window.addEventListener('resize', () => this.updateLEDLayout());
    }

    updateLEDLayout() {
        const ring = document.getElementById('ledRing');
        if (!ring || !this.ledElements.length) return;
        
        const width = ring.clientWidth;
        const height = ring.clientHeight;

        // If the tab is hidden, width/height may be zero. Recalculate later.
        if (width === 0 || height === 0) {
            return;
        }
        const diameter = Math.min(width, height);
        const centerX = width / 2;
        const centerY = height / 2;
        const ledSize = this.ledElements[0].offsetWidth || 20;
        const radius = (diameter / 2) - (ledSize / 2) - 4;
        
        this.ledElements.forEach((led, i) => {
            const angle = (i * 45 - 90) * Math.PI / 180;
            const x = centerX + radius * Math.cos(angle) - ledSize / 2;
            const y = centerY + radius * Math.sin(angle) - ledSize / 2;
            led.style.left = `${x}px`;
            led.style.top = `${y}px`;
        });
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
    
    updateMotorPointer(targetAngle) {
        const pointer = document.getElementById('motorPointer');
        
        // Current visual angle (may be outside 0–360 range)
        let current = this.motorAngle;
        
        // Normalize current to [0, 360) for delta computation
        let currentNorm = ((current % 360) + 360) % 360;
        let delta = targetAngle - currentNorm;
        
        // Wrap delta into the shortest path [-180, 180]
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        
        // Update continuous angle and apply transform
        this.motorAngle = current + delta;
        pointer.style.transform = `rotate(${this.motorAngle}deg)`;
    }
    
    selectLED(index) {
        const selectMultipleToggle = document.getElementById('selectMultipleToggle');
        const selectAllBtn = document.getElementById('selectAllBtn');
        const selectedLedCount = document.getElementById('selectedLedCount');
        const applyCustomBtn = document.getElementById('applyCustomBtn');
        
        if (selectMultipleToggle.checked) {
            // Multi-select mode: toggle the LED
            if (this.selectedLeds.has(index)) {
                this.selectedLeds.delete(index);
            } else {
                this.selectedLeds.add(index);
            }
        } else {
            // Single-select mode: select only this LED
            this.selectedLeds.clear();
            this.selectedLeds.add(index);
        }
        
        // Update UI
        const count = this.selectedLeds.size;
        
        if (count === 0) {
            selectedLedCount.textContent = '0 LEDs';
            applyCustomBtn.textContent = 'Select LEDs first';
            applyCustomBtn.disabled = true;
        } else if (count === 8) {
            selectedLedCount.textContent = 'ALL LEDs';
            applyCustomBtn.textContent = 'Apply to ALL';
            applyCustomBtn.disabled = false;
        } else if (count === 1) {
            const ledNum = Array.from(this.selectedLeds)[0];
            selectedLedCount.textContent = `LED ${ledNum}`;
            applyCustomBtn.textContent = `Apply to LED ${ledNum}`;
            applyCustomBtn.disabled = false;
        } else {
            selectedLedCount.textContent = `${count} LEDs`;
            applyCustomBtn.textContent = `Apply to ${count} LEDs`;
            applyCustomBtn.disabled = false;
        }
        
        selectAllBtn.classList.toggle('active', count === 8);
        
        document.querySelectorAll('.led').forEach((led, i) => {
            led.classList.toggle('selected', this.selectedLeds.has(i));
        });
        
        // Update picker values from the last selected LED's state
        if (this.selectedLeds.size > 0) {
            const lastSelected = Array.from(this.selectedLeds)[this.selectedLeds.size - 1];
            const state = this.ledStates[lastSelected];
            const hex = this.rgbToHex(state.r, state.g, state.b);
            document.getElementById('colorPicker').value = hex;
            document.getElementById('customBrightness').value = state.brightness;
            document.getElementById('customBrightnessValue').textContent = state.brightness + '%';
        }
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

        if (tabName === 'custom') {
            // Ensure LED positions update once the tab becomes visible
            requestAnimationFrame(() => this.updateLEDLayout());
        }
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
        if (!this.characteristics.motorPosition) {
            alert('Not connected to lamp');
            return;
        }
        try {
            // Use a special out-of-range value (>360) as a "set zero" command
            const ZERO_COMMAND = 65535; // 0xFFFF
            const data = new Uint16Array([ZERO_COMMAND]);
            await this.characteristics.motorPosition.writeValue(data);
            console.log('Motor zero set command sent');
        } catch (error) {
            console.error('Failed to set motor zero:', error);
            alert('Failed to set motor zero');
        }
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
