// Moon Lamp PWA - Web Bluetooth Control
// BLE Service and Characteristics UUIDs (must match ESP32)
const LAMP_SERVICE_UUID = 'a1b2c3d4-1234-5678-1234-56789abcdef0';
const LED_STATE_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef1';
const COLOR_PRESET_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef2';
const BRIGHTNESS_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef3';
const LED_CUSTOM_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef4';
const MOTOR_POSITION_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef5';
const TIME_SYNC_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef6';
const AUTO_TRACKING_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef7';
const AUTOMATIONS_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef8';
const CUSTOM_PRESETS_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef9';

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

        // Default presets (shown even when disconnected)
        this.presets = [
            { r: 255, g: 220, b: 150, name: 'Warm White', isCustom: false },
            { r: 255, g: 100, b: 0, name: 'Sunset', isCustom: false },
            { r: 0, g: 100, b: 255, name: 'Ocean Blue', isCustom: false },
            { r: 255, g: 0, b: 100, name: 'Pink Dream', isCustom: false },
            { r: 100, g: 255, b: 100, name: 'Forest Green', isCustom: false }
        ];

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.createLEDRing();
        this.createMotorDial();
        this.updateUI();
        this.renderPresets(); // Render default presets on load

        // Register service worker for PWA
        if ('serviceWorker' in navigator) {
            // Add a version query to force browsers (especially Android) to fetch the new SW
            const swVersion = 'v__VERSION__';
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
        // Bluetooth connection via status badge
        document.getElementById('connectionStatus').addEventListener('click', () => {
            if (this.device && this.device.gatt.connected) {
                // Already connected - ask to disconnect
                if (confirm('Disconnect from Moon Lamp?')) {
                    this.disconnect();
                }
            } else {
                // Not connected - initiate connection
                this.connect();
            }
        });

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

            console.log(`Applying color ${color} at ${brightness}% to LEDs:`, Array.from(this.selectedLeds));

            // Apply to all selected LEDs
            for (const ledIndex of this.selectedLeds) {
                await this.setIndividualLED(ledIndex, color, brightness);
            }

            console.log('All LEDs updated successfully');
        });

        // Motor control - dial interaction only (no slider)
        const motorDial = document.getElementById('motorDial');
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
            
            // Calculate distance from center (normalized to dial radius)
            const distance = Math.sqrt(dx * dx + dy * dy);
            const dialRadius = rect.width / 2;
            const normalizedDistance = distance / dialRadius;

            let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
            if (angle < 0) angle += 360;
            
            // Inner zone (< 60% of radius): snap to 30° increments
            // Outer zone (>= 60% of radius): fine 1° control
            if (normalizedDistance < 0.6) {
                angle = Math.round(angle / 30) * 30;
                if (angle === 360) angle = 0;
            } else {
                angle = Math.round(angle);
            }

            this.updateMotorPointer(angle);
            document.getElementById('motorValue').textContent = angle + '°';
            
            // Auto-send position when dragging stops
            this.pendingMotorAngle = angle;
        };

        motorDial.addEventListener('mousedown', (e) => {
            // Don't start dragging if clicking on moon marker or icon
            if (e.target.id === 'moonMarker' || e.target.id === 'moonIcon') return;
            isDragging = true;
            handleMotorDrag(e);
        });

        motorDial.addEventListener('touchstart', (e) => {
            // Don't start dragging if touching moon marker or icon
            if (e.target.id === 'moonMarker' || e.target.id === 'moonIcon') return;
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
            if (isDragging && this.pendingMotorAngle !== undefined) {
                this.setMotorPosition(this.pendingMotorAngle);
                this.pendingMotorAngle = undefined;
            }
            isDragging = false;
        });

        document.addEventListener('touchend', () => {
            if (isDragging && this.pendingMotorAngle !== undefined) {
                this.setMotorPosition(this.pendingMotorAngle);
                this.pendingMotorAngle = undefined;
            }
            isDragging = false;
        });

        document.getElementById('zeroMotorBtn').addEventListener('click', () => {
            this.setMotorZero();
            // Update UI to show 0 position
            this.motorAngle = 0;
            this.updateMotorPointer(0);
            this.updateCurrentPosMarker(0);
            document.getElementById('motorValue').textContent = '0°';
            document.getElementById('currentPosition').textContent = '0°';
        });

        document.getElementById('realMoonBtn').addEventListener('click', () => {
            this.setRealMoonPosition();
        });

        // Auto tracking controls
        const autoTrackingToggle = document.getElementById('autoTrackingToggle');
        const trackingInterval = document.getElementById('trackingInterval');
        
        if (autoTrackingToggle) {
            autoTrackingToggle.addEventListener('change', () => {
                const enabled = autoTrackingToggle.checked;
                const interval = parseInt(trackingInterval?.value || '60');
                this.setAutoTracking(enabled, interval);
            });
        }
        
        if (trackingInterval) {
            trackingInterval.addEventListener('change', () => {
                const enabled = autoTrackingToggle?.checked || false;
                const interval = parseInt(trackingInterval.value);
                this.setAutoTracking(enabled, interval);
            });
        }

        // Automations form
        const automationBrightness = document.getElementById('automationBrightness');
        const automationBrightnessValue = document.getElementById('automationBrightnessValue');
        
        if (automationBrightness && automationBrightnessValue) {
            automationBrightness.addEventListener('input', () => {
                automationBrightnessValue.textContent = automationBrightness.value + '%';
            });
        }

        const addAutomationBtn = document.getElementById('addAutomationBtn');
        if (addAutomationBtn) {
            addAutomationBtn.addEventListener('click', () => {
                const timeInput = document.getElementById('automationTime');
                const presetSelect = document.getElementById('automationPreset');
                const brightnessInput = document.getElementById('automationBrightness');
                
                if (timeInput && presetSelect && brightnessInput) {
                    const [hour, minute] = timeInput.value.split(':').map(Number);
                    const presetId = parseInt(presetSelect.value);
                    const brightness = parseInt(brightnessInput.value);
                    
                    this.addAutomation(hour, minute, presetId, brightness);
                }
            });
        }
    }

    setRealMoonPosition() {
        const phase = this.calculateMoonPhase();
        const degrees = Math.round(phase * 360);
        console.log(`Calculated Moon Phase: ${phase.toFixed(4)}, Target Degrees: ${degrees}`);

        // Update UI immediately
        this.updateMotorPointer(degrees);
        document.getElementById('motorValue').textContent = degrees + '°';
        document.getElementById('moonAngle').textContent = degrees + '°';

        // Send to lamp
        this.setMotorPosition(degrees);
    }

    calculateMoonPhase() {
        // Use SunCalc library for accurate moon phase
        // Returns phase: 0.0 (New Moon) -> 0.25 (First Quarter) -> 0.5 (Full Moon) -> 0.75 (Last Quarter) -> 1.0 (New Moon)
        const illumination = SunCalc.getMoonIllumination(new Date());
        return illumination.phase;
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

        // Add moon position marker
        const moonPhase = this.calculateMoonPhase();
        const moonAngle = Math.round(moonPhase * 360);
        this.moonPositionAngle = moonAngle; // Store for later use
        
        // Display moon angle at initial load
        document.getElementById('moonAngle').textContent = moonAngle + '°';

        const moonRad = (moonAngle - 90) * Math.PI / 180;
        const moonX1 = 125 + 85 * Math.cos(moonRad);
        const moonY1 = 125 + 85 * Math.sin(moonRad);
        const moonX2 = 125 + 100 * Math.cos(moonRad);
        const moonY2 = 125 + 100 * Math.sin(moonRad);

        const moonMarker = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        moonMarker.setAttribute('x1', moonX1);
        moonMarker.setAttribute('y1', moonY1);
        moonMarker.setAttribute('x2', moonX2);
        moonMarker.setAttribute('y2', moonY2);
        moonMarker.setAttribute('stroke', '#ffd700');
        moonMarker.setAttribute('stroke-width', '4');
        moonMarker.setAttribute('stroke-linecap', 'round');
        moonMarker.setAttribute('id', 'moonMarker');
        moonMarker.style.cursor = 'pointer';
        moonMarker.style.filter = 'drop-shadow(0 0 3px #ffd700)';
        markersGroup.appendChild(moonMarker);

        // Add moon icon at the marker
        const moonIcon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        moonIcon.setAttribute('x', moonX2 + 10 * Math.cos(moonRad));
        moonIcon.setAttribute('y', moonY2 + 10 * Math.sin(moonRad));
        moonIcon.setAttribute('text-anchor', 'middle');
        moonIcon.setAttribute('dominant-baseline', 'middle');
        moonIcon.setAttribute('fill', '#ffd700');
        moonIcon.setAttribute('font-size', '16');
        moonIcon.setAttribute('id', 'moonIcon');
        moonIcon.textContent = '🌙';
        moonIcon.style.cursor = 'pointer';
        markersGroup.appendChild(moonIcon);

        // Create tooltip
        this.createMoonTooltip(moonAngle);

        // Add click/touch events for both marker and icon
        const toggleTooltip = (e) => {
            e.stopPropagation();
            e.preventDefault(); // Prevent default touch behavior
            const tooltip = document.getElementById('moonTooltip');
            const isVisible = tooltip.style.display === 'block';

            if (isVisible) {
                tooltip.style.display = 'none';
            } else {
                // Position tooltip relative to the motor dial
                const motorDial = document.getElementById('motorDial');
                const dialRect = motorDial.getBoundingClientRect();

                // Calculate position based on moon angle
                const tooltipAngle = (moonAngle - 90) * Math.PI / 180;
                const dialCenterX = dialRect.left + dialRect.width / 2;
                const dialCenterY = dialRect.top + dialRect.height / 2;
                const tooltipDistance = 140; // Distance from center

                const tooltipX = dialCenterX + tooltipDistance * Math.cos(tooltipAngle) * 2;
                const tooltipY = dialCenterY + tooltipDistance * Math.sin(tooltipAngle);

                tooltip.style.left = tooltipX + 'px';
                tooltip.style.top = tooltipY + 'px';
                tooltip.style.transform = 'translate(-50%, -50%)';
                tooltip.style.display = 'block';
            }
        };

        // Add both click and touch events for mobile support
        moonMarker.addEventListener('click', toggleTooltip);
        moonMarker.addEventListener('touchend', toggleTooltip);
        moonIcon.addEventListener('click', toggleTooltip);
        moonIcon.addEventListener('touchend', toggleTooltip);

        // Close tooltip when clicking outside
        document.addEventListener('click', (e) => {
            const tooltip = document.getElementById('moonTooltip');
            if (tooltip && !tooltip.contains(e.target) &&
                e.target.id !== 'moonMarker' && e.target.id !== 'moonIcon') {
                tooltip.style.display = 'none';
            }
        });
    }

    createMoonTooltip(angle) {
        const tooltip = document.createElement('div');
        tooltip.id = 'moonTooltip';
        tooltip.className = 'moon-tooltip';
        tooltip.innerHTML = `
            <div class="moon-tooltip-content">
                <strong>Real Moon Position</strong>
                <div style="margin: 8px 0;">${angle}°</div>
                <button class="btn btn-primary" id="setToMoonBtn" style="margin: 0; padding: 8px 16px; font-size: 0.9em;">Set</button>
            </div>
        `;
        tooltip.style.position = 'fixed';
        document.body.appendChild(tooltip);

        // Add click handler for Set button
        document.getElementById('setToMoonBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.setRealMoonPosition();
            tooltip.style.display = 'none';
        });
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

        if (connected) {
            statusDot.classList.add('connected');
            statusText.textContent = 'Connected';
        } else {
            statusDot.classList.remove('connected');
            statusText.textContent = 'Not Connected';
        }
    }

    updateUI() {
        this.updateLEDRing();
        this.updateConnectionStatus(false);
    }

    // Bluetooth Methods
    async connect() {
        const statusText = document.getElementById('statusText');

        try {
            // Show selecting feedback
            statusText.textContent = 'Selecting device...';

            console.log('Requesting Bluetooth Device...');
            this.device = await navigator.bluetooth.requestDevice({
                filters: [{ name: 'MoonLamp' }],
                optionalServices: [LAMP_SERVICE_UUID]
            });

            // Add disconnect handler
            this.device.addEventListener('gattserverdisconnected', () => {
                console.log('Device disconnected');
                this.handleDisconnect();
            });

            // Show connecting feedback
            statusText.textContent = 'Connecting...';

            await this.connectToDevice();
        } catch (error) {
            console.error('Connection failed:', error);
            statusText.textContent = 'Connection failed';

            // Ignore "User cancelled" error
            if (error.name === 'NotFoundError' || error.message.includes('cancelled')) {
                console.log('User cancelled selection');
                this.updateConnectionStatus(false);
                return;
            }

            alert('Failed to connect: ' + error.message);
        }
    }

    async connectToDevice() {
        // Retry the ENTIRE connection process up to 3 times
        let lastError;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                console.log(`Connection attempt ${attempt}...`);
                document.getElementById('statusText').textContent = `Connecting (attempt ${attempt}/3)...`;

                // Step 1: Connect to GATT server
                console.log('Connecting to GATT Server...');
                const connectPromise = this.device.gatt.connect();
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Connection timeout')), 10000)
                );

                this.server = await Promise.race([connectPromise, timeoutPromise]);

                // Small delay to let BLE stabilize
                await new Promise(resolve => setTimeout(resolve, 500));

                // Step 2: Get service with timeout
                console.log('Getting Service...');
                const servicePromise = this.server.getPrimaryService(LAMP_SERVICE_UUID);
                const serviceTimeout = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Service discovery timeout')), 10000)
                );
                this.service = await Promise.race([servicePromise, serviceTimeout]);

                // Step 5: Verify still connected
                if (!this.server || !this.server.connected) {
                    throw new Error('GATT server disconnected while getting service');
                }

                // Step 6: Get required characteristics in parallel
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

                // Try to get optional time sync characteristic (may not exist on older firmware)
                try {
                    this.characteristics.timeSync = await this.service.getCharacteristic(TIME_SYNC_CHAR_UUID);
                    console.log('Time sync characteristic found');
                } catch (e) {
                    console.log('Time sync characteristic not available (older firmware)');
                    this.characteristics.timeSync = null;
                }

                // Debug: List all characteristics in the service
                try {
                    const allChars = await this.service.getCharacteristics();
                    console.log('All characteristics found:', allChars.length);
                    allChars.forEach(c => console.log('  - UUID:', c.uuid));
                } catch (e) {
                    console.log('Could not list characteristics:', e.message);
                }

                // Try to get optional auto-tracking characteristic
                try {
                    this.characteristics.autoTracking = await this.service.getCharacteristic(AUTO_TRACKING_CHAR_UUID);
                    console.log('Auto tracking characteristic found');
                } catch (e) {
                    console.log('Auto tracking characteristic not available (older firmware)');
                    this.characteristics.autoTracking = null;
                }

                // Try to get optional automations characteristic
                try {
                    this.characteristics.automations = await this.service.getCharacteristic(AUTOMATIONS_CHAR_UUID);
                    console.log('Automations characteristic found');
                } catch (e) {
                    console.log('Automations characteristic not available (older firmware)');
                    this.characteristics.automations = null;
                }

                // Try to get optional custom presets characteristic
                try {
                    console.log('Looking for custom presets characteristic:', CUSTOM_PRESETS_CHAR_UUID);
                    this.characteristics.customPresets = await this.service.getCharacteristic(CUSTOM_PRESETS_CHAR_UUID);
                    console.log('Custom presets characteristic found:', this.characteristics.customPresets);
                } catch (e) {
                    console.log('Custom presets characteristic not available (older firmware):', e.message);
                    this.characteristics.customPresets = null;
                }

                // Step 7: Subscribe to notifications
                await this.characteristics.ledState.startNotifications();
                this.characteristics.ledState.addEventListener('characteristicvaluechanged', (e) => {
                    this.handleLEDStateUpdate(e.target.value);
                });

                // Step 8: Success!
                this.updateConnectionStatus(true);
                console.log('Connected successfully!');

                // Sync time immediately on connection (if supported)
                if (this.characteristics.timeSync) {
                    await this.syncTime();
                }

                // Read initial state
                await this.readLEDState();
                await this.readMotorPosition();
                await this.readAutoTracking();
                await this.readAutomations();
                await this.readCustomPresets();

                return; // Success, exit function

            } catch (error) {
                lastError = error;
                console.log(`Attempt ${attempt} failed:`, error.message);

                if (attempt < 3) {
                    const delay = attempt * 1000; // 1s, 2s
                    console.log(`Retrying in ${delay}ms...`);
                    document.getElementById('statusText').textContent = `Attempt ${attempt} failed, retrying in ${delay / 1000}s...`;
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    // All attempts failed
                    throw lastError;
                }
            }
        }
    }

    handleDisconnect() {
        this.characteristics = {};
        this.server = null;
        this.service = null;
        this.updateConnectionStatus(false);
    }

    async disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
            this.updateConnectionStatus(false);
            console.log('Disconnected');
        }
    }

    async syncTime() {
        if (!this.characteristics.timeSync) {
            console.warn('Time sync characteristic not available');
            return;
        }

        try {
            // Get current Unix timestamp in seconds, adjusted for local timezone
            // This makes the ESP32 use local time, so schedules work correctly
            const now = new Date();
            const utcTimestamp = Math.floor(now.getTime() / 1000);
            const timezoneOffsetSeconds = now.getTimezoneOffset() * -60; // getTimezoneOffset returns minutes, negative for ahead of UTC
            const localTimestamp = utcTimestamp + timezoneOffsetSeconds;
            
            // Send as 4-byte little-endian uint32
            const data = new Uint8Array(4);
            data[0] = localTimestamp & 0xFF;
            data[1] = (localTimestamp >> 8) & 0xFF;
            data[2] = (localTimestamp >> 16) & 0xFF;
            data[3] = (localTimestamp >> 24) & 0xFF;
            
            await this.characteristics.timeSync.writeValue(data);
            console.log('Time synced to device (local):', now.toLocaleString());
        } catch (error) {
            console.error('Failed to sync time:', error);
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

    async readMotorPosition() {
        try {
            const value = await this.characteristics.motorPosition.readValue();
            const degrees = value.getUint16(0, true); // Little-endian
            console.log('Initial motor position:', degrees);

            // Update UI - set both target and current position
            this.updateMotorPointer(degrees);
            this.updateCurrentPosMarker(degrees);
            document.getElementById('motorValue').textContent = degrees + '°';
            document.getElementById('currentPosition').textContent = degrees + '°';
        } catch (error) {
            console.error('Failed to read motor position:', error);
        }
    }

    async readAutoTracking() {
        if (!this.characteristics.autoTracking) {
            console.log('Auto tracking characteristic not available');
            return;
        }

        try {
            const value = await this.characteristics.autoTracking.readValue();
            const enabled = value.getUint8(0) !== 0;
            const intervalMinutes = value.getUint16(1, true); // Little-endian
            console.log('Auto tracking:', enabled ? 'ON' : 'OFF', 'interval:', intervalMinutes, 'min');

            // Update UI
            const toggle = document.getElementById('autoTrackingToggle');
            const select = document.getElementById('trackingInterval');
            if (toggle) toggle.checked = enabled;
            if (select) select.value = intervalMinutes.toString();
        } catch (error) {
            console.error('Failed to read auto tracking:', error);
        }
    }

    async setAutoTracking(enabled, intervalMinutes) {
        if (!this.characteristics.autoTracking) {
            console.warn('Auto tracking characteristic not available');
            return;
        }

        try {
            // Byte 0: enabled (0 or 1)
            // Bytes 1-2: interval in minutes (little-endian uint16)
            const data = new Uint8Array(3);
            data[0] = enabled ? 1 : 0;
            data[1] = intervalMinutes & 0xFF;
            data[2] = (intervalMinutes >> 8) & 0xFF;

            await this.characteristics.autoTracking.writeValue(data);
            console.log('Auto tracking set:', enabled ? 'ON' : 'OFF', 'interval:', intervalMinutes, 'min');
        } catch (error) {
            console.error('Failed to set auto tracking:', error);
        }
    }

    async readAutomations() {
        if (!this.characteristics.automations) {
            console.log('Automations characteristic not available');
            return;
        }

        try {
            const value = await this.characteristics.automations.readValue();
            const count = value.getUint8(0);
            console.log('Automations count:', count);

            this.automations = [];
            for (let i = 0; i < count; i++) {
                const offset = 1 + i * 8;
                this.automations.push({
                    enabled: value.getUint8(offset) !== 0,
                    hour: value.getUint8(offset + 1),
                    minute: value.getUint8(offset + 2),
                    presetId: value.getUint8(offset + 3),
                    brightness: value.getUint8(offset + 4),
                    r: value.getUint8(offset + 5),
                    g: value.getUint8(offset + 6),
                    b: value.getUint8(offset + 7)
                });
            }

            this.renderAutomations();
        } catch (error) {
            console.error('Failed to read automations:', error);
        }
    }

    async addAutomation(hour, minute, presetId, brightness, r = 0, g = 0, b = 0) {
        if (!this.characteristics.automations) {
            console.warn('Automations characteristic not available');
            return;
        }

        try {
            // Command 0x01 = Add automation
            const data = new Uint8Array(8);
            data[0] = 0x01; // Add command
            data[1] = hour;
            data[2] = minute;
            data[3] = presetId;
            data[4] = brightness;
            data[5] = r;
            data[6] = g;
            data[7] = b;

            await this.characteristics.automations.writeValue(data);
            console.log('Automation added:', hour + ':' + minute);
            
            // Re-read automations to update UI
            await this.readAutomations();
        } catch (error) {
            console.error('Failed to add automation:', error);
        }
    }

    async removeAutomation(index) {
        if (!this.characteristics.automations) {
            console.warn('Automations characteristic not available');
            return;
        }

        // Show loading state on the button
        const btn = document.querySelector(`.automation-item:nth-child(${index + 1}) .btn-icon`);
        if (btn) {
            btn.classList.add('loading');
            btn.disabled = true;
        }

        try {
            // Command 0x02 = Remove automation
            const data = new Uint8Array(2);
            data[0] = 0x02; // Remove command
            data[1] = index;

            await this.characteristics.automations.writeValue(data);
            console.log('Automation removed:', index);
            
            // Re-read automations to update UI
            await this.readAutomations();
        } catch (error) {
            console.error('Failed to remove automation:', error);
            // Restore button on error
            if (btn) {
                btn.classList.remove('loading');
                btn.disabled = false;
            }
        }
    }

    async toggleAutomation(index, enabled) {
        if (!this.characteristics.automations) {
            console.warn('Automations characteristic not available');
            return;
        }

        try {
            // Command 0x04 = Enable/disable automation
            const data = new Uint8Array(3);
            data[0] = 0x04; // Enable/disable command
            data[1] = index;
            data[2] = enabled ? 1 : 0;

            await this.characteristics.automations.writeValue(data);
            console.log('Automation', index, enabled ? 'enabled' : 'disabled');
            
            // Re-read automations to update UI
            await this.readAutomations();
        } catch (error) {
            console.error('Failed to toggle automation:', error);
        }
    }

    showEditAutomationDialog(index) {
        const auto = this.automations[index];
        if (!auto) return;

        const timeStr = `${auto.hour.toString().padStart(2, '0')}:${auto.minute.toString().padStart(2, '0')}`;
        
        const dialog = document.createElement('div');
        dialog.className = 'preset-dialog';
        dialog.innerHTML = `
            <div class="preset-dialog-content">
                <h3>Edit Schedule</h3>
                <div class="form-row">
                    <label>Time:</label>
                    <input type="time" id="editAutomationTime" value="${timeStr}">
                </div>
                <div class="form-row">
                    <label>Preset:</label>
                    <select id="editAutomationPreset">
                        ${this.presets.map((p, i) => 
                            `<option value="${i}" ${i === auto.presetId ? 'selected' : ''}>${p.name}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="form-row">
                    <label>Brightness:</label>
                    <input type="range" id="editAutomationBrightness" min="0" max="100" value="${auto.brightness}">
                    <span id="editBrightnessValue">${auto.brightness}%</span>
                </div>
                <div class="dialog-buttons">
                    <button class="btn" id="cancelEditBtn">Cancel</button>
                    <button class="btn btn-primary" id="saveEditBtn">Save</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);

        // Brightness slider update
        const brightnessInput = document.getElementById('editAutomationBrightness');
        const brightnessValue = document.getElementById('editBrightnessValue');
        brightnessInput.addEventListener('input', () => {
            brightnessValue.textContent = `${brightnessInput.value}%`;
        });

        document.getElementById('cancelEditBtn').addEventListener('click', () => {
            dialog.remove();
        });

        document.getElementById('saveEditBtn').addEventListener('click', async () => {
            const time = document.getElementById('editAutomationTime').value;
            const preset = parseInt(document.getElementById('editAutomationPreset').value);
            const brightness = parseInt(document.getElementById('editAutomationBrightness').value);
            
            if (time) {
                const [hour, minute] = time.split(':').map(Number);
                await this.updateAutomation(index, hour, minute, preset, brightness);
                dialog.remove();
            }
        });

        // Close on backdrop click
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) dialog.remove();
        });
    }

    async updateAutomation(index, hour, minute, presetId, brightness) {
        if (!this.characteristics.automations) {
            console.warn('Automations characteristic not available');
            return;
        }

        try {
            // Command 0x03 = Update automation
            const data = new Uint8Array(9);
            data[0] = 0x03; // Update command
            data[1] = index;
            data[2] = hour;
            data[3] = minute;
            data[4] = presetId;
            data[5] = brightness;
            data[6] = 0; // r (not used for preset)
            data[7] = 0; // g
            data[8] = 0; // b

            await this.characteristics.automations.writeValue(data);
            console.log('Automation updated:', index);
            
            // Re-read automations to update UI
            await this.readAutomations();
        } catch (error) {
            console.error('Failed to update automation:', error);
        }
    }

    renderAutomations() {
        const container = document.getElementById('automationsList');
        if (!container) return;

        if (!this.automations || this.automations.length === 0) {
            container.innerHTML = '<p class="info-text">No automations set. Add one to schedule LED changes.</p>';
            return;
        }

        const presetNames = ['Warm White', 'Sunset', 'Ocean Blue', 'Pink Dream', 'Forest Green'];
        
        container.innerHTML = this.automations.map((auto, index) => {
            const timeStr = `${auto.hour.toString().padStart(2, '0')}:${auto.minute.toString().padStart(2, '0')}`;
            const presetName = this.presets && this.presets[auto.presetId] 
                ? this.presets[auto.presetId].name 
                : (auto.presetId < presetNames.length ? presetNames[auto.presetId] : 'Custom');
            
            return `
                <div class="automation-item ${auto.enabled ? '' : 'disabled'}" onclick="moonLamp.showEditAutomationDialog(${index})">
                    <div class="automation-info">
                        <span class="automation-time">${timeStr}</span>
                        <span class="automation-preset">${presetName} @ ${auto.brightness}%</span>
                    </div>
                    <div class="automation-actions" onclick="event.stopPropagation()">
                        <label class="toggle-label small">
                            <input type="checkbox" ${auto.enabled ? 'checked' : ''} 
                                   onchange="moonLamp.toggleAutomation(${index}, this.checked)">
                        </label>
                        <button class="btn-icon delete-btn" onclick="moonLamp.removeAutomation(${index})">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6"/>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    async readCustomPresets() {
        if (!this.characteristics.customPresets) {
            console.log('Custom presets characteristic not available');
            return;
        }

        try {
            const value = await this.characteristics.customPresets.readValue();
            const count = value.getUint8(0);
            console.log('Presets count:', count);

            this.presets = [];
            let offset = 1;
            for (let i = 0; i < count; i++) {
                const r = value.getUint8(offset);
                const g = value.getUint8(offset + 1);
                const b = value.getUint8(offset + 2);
                const nameLen = value.getUint8(offset + 3);
                let name = '';
                for (let j = 0; j < nameLen; j++) {
                    name += String.fromCharCode(value.getUint8(offset + 4 + j));
                }
                this.presets.push({ r, g, b, name, isCustom: i >= 5 });
                offset += 4 + nameLen;
            }

            this.renderPresets();
            this.updateAutomationPresetDropdown();
            
            // Re-detect active preset now that we have all presets loaded
            if (this.ledStates && this.ledStates.length > 0) {
                this.updatePresetFeedback();
            }
        } catch (error) {
            console.error('Failed to read custom presets:', error);
        }
    }

    async addCustomPreset(r, g, b, name) {
        // Check if we have room for more custom presets
        const customCount = this.presets.filter(p => p.isCustom).length;
        if (customCount >= 5) {
            alert('Maximum 5 custom presets allowed');
            return;
        }

        if (!this.characteristics.customPresets) {
            // Not connected - add locally only (won't persist on ESP32)
            this.presets.push({ r, g, b, name, isCustom: true });
            this.renderPresets();
            alert('Preset added locally. Connect to lamp to sync.');
            return;
        }

        try {
            // Command 0x01 = Add custom preset
            const nameBytes = new TextEncoder().encode(name.substring(0, 15));
            const data = new Uint8Array(5 + nameBytes.length);
            data[0] = 0x01; // Add command
            data[1] = r;
            data[2] = g;
            data[3] = b;
            data[4] = nameBytes.length;
            data.set(nameBytes, 5);

            await this.characteristics.customPresets.writeValue(data);
            console.log('Custom preset added:', name);
            
            // Re-read presets to update UI
            await this.readCustomPresets();
        } catch (error) {
            console.error('Failed to add custom preset:', error);
            alert('Failed to add preset: ' + error.message);
        }
    }

    async removeCustomPreset(index) {
        if (!this.characteristics.customPresets) {
            console.warn('Custom presets characteristic not available');
            return;
        }

        try {
            // Command 0x02 = Remove custom preset
            const data = new Uint8Array(2);
            data[0] = 0x02; // Remove command
            data[1] = index;

            await this.characteristics.customPresets.writeValue(data);
            console.log('Custom preset removed:', index);
            
            // Re-read presets to update UI
            await this.readCustomPresets();
        } catch (error) {
            console.error('Failed to remove custom preset:', error);
        }
    }

    renderPresets() {
        const container = document.querySelector('.preset-grid');
        if (!container || !this.presets) return;

        // Render all presets (default + custom)
        let html = this.presets.map((preset, index) => `
            <button class="preset-btn" data-preset="${index}">
                <div class="preset-color" style="background: rgb(${preset.r},${preset.g},${preset.b});"></div>
                <span>${preset.name}</span>
                ${preset.isCustom ? `<button class="preset-delete" onclick="event.stopPropagation(); moonLamp.removeCustomPreset(${index})">×</button>` : ''}
            </button>
        `).join('');

        // Add the "+" button if we have room for more custom presets
        const customCount = this.presets.filter(p => p.isCustom).length;
        if (customCount < 5) {
            html += `
                <button class="preset-btn add-preset-btn" id="addPresetBtn">
                    <div class="preset-color add-preset-color">+</div>
                    <span>Add Custom</span>
                </button>
            `;
        }

        container.innerHTML = html;

        // Re-attach event listeners
        container.querySelectorAll('.preset-btn[data-preset]').forEach(btn => {
            btn.addEventListener('click', () => {
                const preset = parseInt(btn.dataset.preset);
                this.setColorPreset(preset);
            });
        });

        // Add preset button listener
        const addBtn = document.getElementById('addPresetBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.showAddPresetDialog());
        }

        // Restore selected state if we have one
        if (this.selectedPreset !== undefined) {
            const selectedBtn = container.querySelector(`.preset-btn[data-preset="${this.selectedPreset}"]`);
            if (selectedBtn) {
                selectedBtn.classList.add('selected');
            }
        }
    }

    updateAutomationPresetDropdown() {
        const select = document.getElementById('automationPreset');
        if (!select || !this.presets) return;

        select.innerHTML = this.presets.map((preset, index) => 
            `<option value="${index}">${preset.name}</option>`
        ).join('');
    }

    showAddPresetDialog() {
        // Create a simple color picker dialog
        const dialog = document.createElement('div');
        dialog.className = 'preset-dialog';
        dialog.innerHTML = `
            <div class="preset-dialog-content">
                <h3>Add Custom Preset</h3>
                <div class="form-row">
                    <label>Color:</label>
                    <input type="color" id="newPresetColor" value="#ff6600">
                </div>
                <div class="form-row">
                    <label>Name:</label>
                    <input type="text" id="newPresetName" placeholder="My Color" maxlength="15">
                </div>
                <div class="dialog-buttons">
                    <button class="btn" id="cancelPresetBtn">Cancel</button>
                    <button class="btn btn-primary" id="savePresetBtn">Save</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);

        document.getElementById('cancelPresetBtn').addEventListener('click', () => {
            dialog.remove();
        });

        document.getElementById('savePresetBtn').addEventListener('click', () => {
            const color = document.getElementById('newPresetColor').value;
            const name = document.getElementById('newPresetName').value || 'Custom';
            
            // Convert hex to RGB
            const r = parseInt(color.substr(1, 2), 16);
            const g = parseInt(color.substr(3, 2), 16);
            const b = parseInt(color.substr(5, 2), 16);
            
            this.addCustomPreset(r, g, b, name);
            dialog.remove();
        });

        // Close on backdrop click
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) dialog.remove();
        });
    }

    updateCurrentPosMarker(angle) {
        const marker = document.getElementById('currentPosMarker');
        if (marker) {
            marker.style.transform = `rotate(${angle}deg)`;
        }
    }

    handleLEDStateUpdate(dataView) {
        // Parse LED state data (8 LEDs * 4 bytes each: R, G, B, Brightness)
        // Check if we have enough data
        if (dataView.byteLength < 32) {
            console.warn('LED state data incomplete, expected 32 bytes, got', dataView.byteLength);
            return;
        }

        for (let i = 0; i < 8; i++) {
            const offset = i * 4;
            // Map brightness from 0-255 (firmware) to 0-100 (UI)
            const rawBrightness = dataView.getUint8(offset + 3);
            const uiBrightness = Math.round(rawBrightness * 100 / 255);

            this.ledStates[i] = {
                r: dataView.getUint8(offset),
                g: dataView.getUint8(offset + 1),
                b: dataView.getUint8(offset + 2),
                brightness: uiBrightness
            };
        }
        this.updateLEDRing();
        this.updatePresetFeedback();
    }

    updatePresetFeedback() {
        // Check if all LEDs have the same color and brightness
        const firstLed = this.ledStates[0];
        const allSame = this.ledStates.every(led =>
            led.r === firstLed.r &&
            led.g === firstLed.g &&
            led.b === firstLed.b &&
            led.brightness === firstLed.brightness
        );

        // Reset all active states
        document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.brightness-btn').forEach(btn => btn.classList.remove('active'));

        if (!allSame) return;

        const r = firstLed.r;
        const g = firstLed.g;
        const b = firstLed.b;
        const brightness = firstLed.brightness;
        

        // Helper to check if color matches within small tolerance
        const matches = (tr, tg, tb) => {
            return Math.abs(r - tr) < 5 && Math.abs(g - tg) < 5 && Math.abs(b - tb) < 5;
        };

        let activePreset = -1;

        // Check all presets (including custom)
        if (this.presets) {
            for (let i = 0; i < this.presets.length; i++) {
                const p = this.presets[i];
                if (matches(p.r, p.g, p.b)) {
                    activePreset = i;
                    break;
                }
            }
        } else {
            // Fallback to hardcoded defaults if presets not loaded
            if (matches(255, 220, 150)) activePreset = 0;
            else if (matches(255, 100, 0)) activePreset = 1;
            else if (matches(0, 100, 255)) activePreset = 2;
            else if (matches(255, 0, 100)) activePreset = 3;
            else if (matches(100, 255, 100)) activePreset = 4;
        }

        // Store and display selected preset
        this.selectedPreset = activePreset;
        document.querySelectorAll('.preset-btn[data-preset]').forEach(btn => {
            btn.classList.remove('selected', 'active');
        });
        if (activePreset !== -1) {
            const btn = document.querySelector(`.preset-btn[data-preset="${activePreset}"]`);
            if (btn) btn.classList.add('selected');
        }

        // Check Brightness Presets
        const brightnessBtn = document.querySelector(`.brightness-btn[data-brightness="${brightness}"]`);
        if (brightnessBtn) {
            brightnessBtn.classList.add('active');
        }
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
            
            // Update selected state in UI
            this.selectedPreset = preset;
            document.querySelectorAll('.preset-btn[data-preset]').forEach(btn => {
                const btnPreset = parseInt(btn.dataset.preset);
                btn.classList.toggle('selected', btnPreset === preset);
            });
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
            // Map brightness from 0-100 (UI) to 0-255 (firmware)
            const mappedBrightness = Math.round(brightness * 255 / 100);

            const data = new Uint8Array([index, rgb.r, rgb.g, rgb.b, mappedBrightness]);
            await this.characteristics.ledCustom.writeValue(data);
            console.log(`LED ${index} set:`, rgb, mappedBrightness);

            // Update local state (keep UI brightness 0-100)
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
            this.updateCurrentPosMarker(position);
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
const moonLamp = new MoonLamp();
