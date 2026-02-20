// Motor Controller
import { MOTOR_ZERO_COMMAND, MOTOR_CALIBRATE_COMMAND } from './constants.js';
import { Modal } from './modal.js';
import { MOON_ICON_PATH_SVG, moonIconSvg } from './utils.js';

export class MotorController {
    constructor(bluetooth) {
        this.bluetooth = bluetooth;
        this.motorAngle = 0;
        this.pendingMotorAngle = undefined;
        this.moonPositionAngle = 0;
        this.autoTrackingEnabled = true;
        this.autoTrackingInterval = 60;

        // Handle motor position notifications (e.g., after calibration)
        this.bluetooth.onMotorPositionUpdate = (dataView) => {
            const degrees = dataView.getUint16(0, true);
            console.log('Motor position notification received:', degrees + '°');
            this.motorAngle = degrees;
            this.updateMotorPointer(degrees);
            this.updateCurrentPosMarker(degrees);
            document.getElementById('motorValue').textContent = degrees + '°';
            document.getElementById('currentPosition').textContent = degrees + '°';
        };
    }

    createMotorDial() {
        const markersGroup = document.getElementById('degreeMarkers');

        // Inject moon icon into the moon button
        const realMoonBtn = document.getElementById('realMoonBtn');
        if (realMoonBtn) realMoonBtn.innerHTML = moonIconSvg(32);

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
        this.moonPositionAngle = moonAngle;

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
        markersGroup.appendChild(moonMarker);

        // Filled crescent moon icon (SVG path scaled to ~16px, centered at icon position)
        const iconCx = moonX2 + 12 * Math.cos(moonRad);
        const iconCy = moonY2 + 12 * Math.sin(moonRad);
        const moonIcon = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        // Crescent: filled circle minus offset circle, approximated as a path
        // Using a simple crescent path centered at 0,0 scaled to r=7
        // Same crescent path as moon button: M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z
        // Centered at 0,0 by translating -12,-12 (half of 24 viewBox), scaled to 0.65
        moonIcon.setAttribute('d', MOON_ICON_PATH_SVG);
        moonIcon.setAttribute('fill', '#ffd700');
        moonIcon.setAttribute('transform', `translate(${iconCx},${iconCy})`);
        moonIcon.setAttribute('id', 'moonIcon');
        moonIcon.style.cursor = 'pointer';
        markersGroup.appendChild(moonIcon);
    }

    setupDialInteraction() {
        const motorDial = document.getElementById('motorDial');
        const motorPointer = document.getElementById('motorPointer');
        const motorValueEl = document.getElementById('motorValue');
        let isDragging = false;
        let rafId = null;
        let pendingAngle = null;

        const handleMotorDrag = (e) => {
            e.preventDefault();
            const rect = motorDial.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            const dx = clientX - centerX;
            const dy = clientY - centerY;

            const distance = Math.sqrt(dx * dx + dy * dy);
            const dialRadius = rect.width / 2;
            const normalizedDistance = distance / dialRadius;

            let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
            if (angle < 0) angle += 360;

            if (normalizedDistance < 0.6) {
                angle = Math.round(angle / 30) * 30;
                if (angle === 360) angle = 0;
            } else {
                angle = Math.round(angle);
            }

            pendingAngle = angle;
            this.pendingMotorAngle = angle;

            if (!rafId) {
                rafId = requestAnimationFrame(() => {
                    if (pendingAngle !== null) {
                        this.updateMotorPointerDirect(motorPointer, pendingAngle);
                        this.updateDialMoon(pendingAngle);
                        this.motorPresetsController?.setActiveAngle(pendingAngle);
                        motorValueEl.textContent = pendingAngle + '°';
                    }
                    rafId = null;
                });
            }
        };

        const isWithinDialCircle = (e) => {
            const rect = motorDial.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const dx = clientX - centerX;
            const dy = clientY - centerY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const dialRadius = rect.width / 2;
            return distance <= dialRadius * 0.9;
        };

        motorDial.addEventListener('mousedown', (e) => {
            if (e.target.id === 'moonMarker' || e.target.id === 'moonIcon') return;
            if (!isWithinDialCircle(e)) return;
            isDragging = true;
            handleMotorDrag(e);
        });

        motorDial.addEventListener('touchstart', (e) => {
            if (e.target.id === 'moonMarker' || e.target.id === 'moonIcon') return;
            if (!isWithinDialCircle(e)) return;
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
                this.clearSpecificDate();
                this.setMotorPosition(this.pendingMotorAngle);
                this.pendingMotorAngle = undefined;
            }
            isDragging = false;
        });

        document.addEventListener('touchend', () => {
            if (isDragging && this.pendingMotorAngle !== undefined) {
                this.clearSpecificDate();
                this.setMotorPosition(this.pendingMotorAngle);
                this.pendingMotorAngle = undefined;
            }
            isDragging = false;
        });
    }

    calculateMoonPhase() {
        const illumination = SunCalc.getMoonIllumination(new Date());
        return illumination.phase;
    }

    updateMotorPointer(targetAngle) {
        const pointer = document.getElementById('motorPointer');
        this.updateMotorPointerDirect(pointer, targetAngle);
        this.updateDialMoon(targetAngle);
        this.motorPresetsController?.setActiveAngle(targetAngle);
    }

    _dialMoonPath(angleDeg, cx, cy, r) {
        const phase = ((angleDeg % 360) + 360) % 360 / 360;
        if (phase <= 0.002) return null;
        if (phase >= 0.998) {
            return `M ${cx - r} ${cy} A ${r} ${r} 0 0 0 ${cx + r} ${cy} A ${r} ${r} 0 0 0 ${cx - r} ${cy} Z`;
        }
        const tx = Math.cos(2 * Math.PI * phase);
        const trx = Math.abs(tx) * r;
        const topX = cx, topY = cy - r;
        const botX = cx, botY = cy + r;
        if (phase < 0.5) {
            const ts = tx >= 0 ? 0 : 1;
            return `M ${topX} ${topY} A ${r} ${r} 0 0 1 ${botX} ${botY} A ${trx} ${r} 0 0 ${ts} ${topX} ${topY} Z`;
        } else {
            const ts = tx >= 0 ? 1 : 0;
            return `M ${topX} ${topY} A ${r} ${r} 0 0 0 ${botX} ${botY} A ${trx} ${r} 0 0 ${ts} ${topX} ${topY} Z`;
        }
    }

    updateDialMoon(angleDeg) {
        const group = document.getElementById('dialMoonPhase');
        if (!group) return;
        const cx = 125, cy = 125, r = 8;
        const litPath = this._dialMoonPath(angleDeg, cx, cy, r);
        group.innerHTML =
            `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="currentColor" stroke-width="0.8" opacity="0.4"/>` +
            (litPath ? `<path d="${litPath}" fill="currentColor" opacity="0.9"/>` : '');
    }

    updateMotorPointerDirect(pointer, targetAngle) {
        let current = this.motorAngle;
        let currentNorm = ((current % 360) + 360) % 360;
        let delta = targetAngle - currentNorm;

        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;

        this.motorAngle = current + delta;
        pointer.style.transform = `rotate(${this.motorAngle}deg)`;
    }

    updateCurrentPosMarker(angle) {
        const marker = document.getElementById('currentPosMarker');
        if (marker) {
            marker.style.transform = `rotate(${angle}deg)`;
        }
    }

    updateMoonMarker(degrees) {
        const moonMarker = document.getElementById('moonMarker');
        const moonIcon = document.getElementById('moonIcon');
        if (!moonMarker || !moonIcon) return;

        const moonRad = (degrees - 90) * Math.PI / 180;
        const moonX1 = 125 + 85 * Math.cos(moonRad);
        const moonY1 = 125 + 85 * Math.sin(moonRad);
        const moonX2 = 125 + 100 * Math.cos(moonRad);
        const moonY2 = 125 + 100 * Math.sin(moonRad);

        moonMarker.setAttribute('x1', moonX1);
        moonMarker.setAttribute('y1', moonY1);
        moonMarker.setAttribute('x2', moonX2);
        moonMarker.setAttribute('y2', moonY2);

        const iconCx = moonX2 + 12 * Math.cos(moonRad);
        const iconCy = moonY2 + 12 * Math.sin(moonRad);
        moonIcon.setAttribute('transform', `translate(${iconCx},${iconCy})`);

        this.moonPositionAngle = degrees;
    }

    async setRealMoonPosition() {
        this.clearSpecificDate();
        const phase = this.calculateMoonPhase();
        const degrees = Math.round(phase * 360);
        console.log(`Calculated Moon Phase: ${phase.toFixed(4)}, Target Degrees: ${degrees}`);

        this.updateMoonMarker(degrees);
        this.updateMotorPointer(degrees);
        document.getElementById('motorValue').textContent = degrees + '°';
        document.getElementById('moonAngle').textContent = degrees + '°';

        await this.setMotorPosition(degrees);
    }

    async setMotorPosition(position) {
        if (!this.bluetooth.hasCharacteristic('motorPosition')) {
            Modal.warning('Not connected to lamp');
            return;
        }

        try {
            const data = new Uint16Array([position]);
            await this.bluetooth.writeCharacteristic('motorPosition', data);
            console.log('Motor position set:', position);
            document.getElementById('currentPosition').textContent = position + '°';
            this.updateCurrentPosMarker(position);
        } catch (error) {
            console.error('Failed to set motor position:', error);
            Modal.error('Failed to set motor position');
        }
    }

    async setMotorZero() {
        if (!this.bluetooth.hasCharacteristic('motorPosition')) {
            Modal.warning('Not connected to lamp');
            return;
        }
        try {
            const data = new Uint16Array([MOTOR_ZERO_COMMAND]);
            console.log('Sending zero command:', MOTOR_ZERO_COMMAND);
            await this.bluetooth.writeCharacteristic('motorPosition', data);
            console.log('Motor zero set command sent');

            this.motorAngle = 0;
            this.updateMotorPointer(0);
            this.updateCurrentPosMarker(0);
            document.getElementById('motorValue').textContent = '0°';
            document.getElementById('currentPosition').textContent = '0°';
        } catch (error) {
            console.error('Failed to set motor zero:', error);
            Modal.error('Failed to set motor zero');
        }
    }

    async calibrateMotor() {
        if (!this.bluetooth.hasCharacteristic('motorPosition')) {
            Modal.warning('Not connected to lamp');
            return;
        }

        // Show a persistent loading indicator
        const loadingDialog = document.createElement('div');
        loadingDialog.className = 'preset-dialog';
        loadingDialog.innerHTML = `
            <div class="preset-dialog-content" style="text-align:center;">
                <h3>Calibrating</h3>
                <p class="info-text">The motor is rotating to find the Hall effect sensor magnet. This may take up to a minute.</p>
                <div class="ring-spinner" style="margin:16px auto;"></div>
            </div>
        `;
        document.body.appendChild(loadingDialog);

        // Listen for the motor position notification that signals calibration is done
        const originalHandler = this.bluetooth.onMotorPositionUpdate;
        const calibrationPromise = new Promise((resolve) => {
            const timeout = setTimeout(() => resolve('timeout'), 90000); // 90s timeout
            this.bluetooth.onMotorPositionUpdate = (dataView) => {
                clearTimeout(timeout);
                const degrees = dataView.getUint16(0, true);
                if (degrees === 0xFFFF) {
                    console.log('Calibration failed - Hall sensor not found');
                    resolve('failed');
                    return;
                }
                console.log('Calibration complete, position:', degrees + '°');
                this.motorAngle = degrees;
                this.updateMotorPointer(degrees);
                this.updateCurrentPosMarker(degrees);
                document.getElementById('motorValue').textContent = degrees + '°';
                document.getElementById('currentPosition').textContent = degrees + '°';
                resolve('success');
            };
        });

        try {
            const data = new Uint16Array([MOTOR_CALIBRATE_COMMAND]);
            await this.bluetooth.writeCharacteristic('motorPosition', data);
            console.log('Motor calibration command sent');

            const result = await calibrationPromise;
            loadingDialog.remove();

            if (result === 'success') {
                Modal.success('Calibration complete! The motor found the magnet and set its zero position.', 'Calibration Done');
            } else if (result === 'failed') {
                Modal.error('Calibration failed. The Hall effect sensor was not detected. Check that the sensor is wired correctly and the magnet is installed.');
            } else {
                Modal.warning('Calibration timed out. The motor may still be searching. Check the serial monitor for details.');
            }
        } catch (error) {
            loadingDialog.remove();
            console.error('Failed to calibrate motor:', error);
            Modal.error('Failed to start calibration');
        } finally {
            // Restore original handler
            this.bluetooth.onMotorPositionUpdate = originalHandler;
        }
    }

    async readMotorPosition() {
        try {
            const value = await this.bluetooth.readCharacteristic('motorPosition');
            const degrees = value.getUint16(0, true);
            console.log('Initial motor position:', degrees);

            this.updateMotorPointer(degrees);
            this.updateCurrentPosMarker(degrees);
            document.getElementById('motorValue').textContent = degrees + '°';
            document.getElementById('currentPosition').textContent = degrees + '°';
        } catch (error) {
            console.error('Failed to read motor position:', error);
        }
    }

    async readAutoTracking() {
        if (!this.bluetooth.hasCharacteristic('autoTracking')) {
            console.log('Auto tracking characteristic not available');
            return;
        }

        try {
            const value = await this.bluetooth.readCharacteristic('autoTracking');
            const enabled = value.getUint8(0) !== 0;
            const intervalMinutes = value.getUint16(1, true);
            console.log('Auto tracking:', enabled ? 'ON' : 'OFF', 'interval:', intervalMinutes, 'min');
            this.autoTrackingEnabled = enabled;
            this.autoTrackingInterval = intervalMinutes;
            this.updateAutoTrackingLabel();
        } catch (error) {
            console.error('Failed to read auto tracking:', error);
        }
    }

    async setAutoTracking(enabled, intervalMinutes) {
        this.autoTrackingEnabled = enabled;
        this.autoTrackingInterval = intervalMinutes;
        this.updateAutoTrackingLabel();

        if (!this.bluetooth.hasCharacteristic('autoTracking')) {
            console.warn('Auto tracking characteristic not available');
            return;
        }

        try {
            const data = new Uint8Array(3);
            data[0] = enabled ? 1 : 0;
            data[1] = intervalMinutes & 0xFF;
            data[2] = (intervalMinutes >> 8) & 0xFF;

            await this.bluetooth.writeCharacteristic('autoTracking', data);
            console.log('Auto tracking set:', enabled ? 'ON' : 'OFF', 'interval:', intervalMinutes, 'min');
        } catch (error) {
            console.error('Failed to set auto tracking:', error);
        }
    }

    _formatInterval(minutes) {
        if (minutes % 60 === 0) return `${minutes / 60} h`;
        return `${minutes} m`;
    }

    updateAutoTrackingLabel() {
        const label = document.getElementById('autoTrackingLabel');
        if (!label) return;
        label.textContent = this.autoTrackingEnabled ? this._formatInterval(this.autoTrackingInterval) : '';
    }

    showAutoTrackingModal() {
        const dialog = document.createElement('div');
        dialog.className = 'preset-dialog';
        dialog.innerHTML = `
            <div class="preset-dialog-content">
                <h3>Auto Tracking</h3>
                <div class="tracking-interval">
                    <input type="checkbox" id="modalAutoTrackingToggle" class="tracking-checkbox" ${this.autoTrackingEnabled ? 'checked' : ''}>
                    <label for="modalTrackingInterval">Update every:</label>
                    <select id="modalTrackingInterval">
                        <option value="5">5 minutes</option>
                        <option value="15">15 minutes</option>
                        <option value="30">30 minutes</option>
                        <option value="60">1 hour</option>
                        <option value="120">2 hours</option>
                        <option value="360">6 hours</option>
                        <option value="720">12 hours</option>
                        <option value="1440">24 hours</option>
                    </select>
                </div>
                <div class="dialog-buttons">
                    <button class="btn btn-secondary" id="cancelAutoTrackingBtn">Cancel</button>
                    <button class="btn btn-primary" id="saveAutoTrackingBtn">Save</button>
                </div>
            </div>`;
        document.body.appendChild(dialog);

        document.getElementById('modalTrackingInterval').value = this.autoTrackingInterval.toString();

        document.getElementById('cancelAutoTrackingBtn').addEventListener('click', () => dialog.remove());
        dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });

        document.getElementById('saveAutoTrackingBtn').addEventListener('click', () => {
            const enabled = document.getElementById('modalAutoTrackingToggle').checked;
            const interval = parseInt(document.getElementById('modalTrackingInterval').value);
            this.setAutoTracking(enabled, interval);
            dialog.remove();
        });
    }

    showSpecificDateModal() {
        const dialog = document.createElement('div');
        dialog.className = 'preset-dialog';
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];
        dialog.innerHTML = `
            <div class="preset-dialog-content">
                <h3>Specific Date</h3>
                <p class="info-text">Calculate moon position for a specific date and time.</p>
                <div style="display:flex;flex-direction:column;gap:12px;">
                    <div>
                        <label style="font-size:0.85em;color:var(--text-secondary);display:block;margin-bottom:4px;">Date</label>
                        <input type="date" id="specificDateInput" value="${dateStr}" style="width:100%;padding:10px 14px;background:var(--surface);border:1px solid var(--glass-border);border-radius:8px;color:var(--text);font-size:0.95em;box-sizing:border-box;">
                    </div>
                    <div>
                        <label style="font-size:0.85em;color:var(--text-secondary);display:block;margin-bottom:4px;">Time (optional, default 12:00)</label>
                        <input type="time" id="specificTimeInput" style="width:100%;padding:10px 14px;background:var(--surface);border:1px solid var(--glass-border);border-radius:8px;color:var(--text);font-size:0.95em;box-sizing:border-box;">
                    </div>
                </div>
                <div class="dialog-buttons" style="margin-top:16px;">
                    <button class="btn btn-secondary" id="cancelSpecificDateBtn">Cancel</button>
                    <button class="btn btn-primary" id="applySpecificDateBtn">Apply</button>
                </div>
            </div>`;
        document.body.appendChild(dialog);

        document.getElementById('cancelSpecificDateBtn').addEventListener('click', () => dialog.remove());
        dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.remove(); });

        document.getElementById('applySpecificDateBtn').addEventListener('click', () => {
            const dateVal = document.getElementById('specificDateInput').value;
            const timeVal = document.getElementById('specificTimeInput').value || '12:00';
            if (!dateVal) return;
            const dateTime = new Date(`${dateVal}T${timeVal}:00`);
            if (isNaN(dateTime.getTime())) return;
            dialog.remove();
            this.setSpecificDatePosition(dateTime);
        });
    }

    async setSpecificDatePosition(date) {
        const illumination = SunCalc.getMoonIllumination(date);
        const degrees = Math.round(illumination.phase * 360);
        console.log(`Moon phase for ${date.toISOString()}: phase=${illumination.phase.toFixed(4)}, degrees=${degrees}`);

        this.updateMotorPointer(degrees);
        document.getElementById('motorValue').textContent = degrees + '°';

        const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
        this.showSpecificDateLabel(`${dateStr} ${timeStr}`);

        await this.setMotorPosition(degrees);
    }

    showSpecificDateLabel(text) {
        const display = document.getElementById('specificDateDisplay');
        const textEl = document.getElementById('specificDateText');
        if (!display || !textEl) return;
        textEl.textContent = text;
        display.classList.add('visible');
    }

    clearSpecificDate() {
        const display = document.getElementById('specificDateDisplay');
        if (display) display.classList.remove('visible');
    }

    // Speed icons: 1, 2, or 3 triangles
    static SPEED_ICONS = ['▶', '▶▶', '▶▶▶'];
    static SPEED_PRESETS = ['Speed 1', 'Speed 2', 'Speed 3'];

    currentSpeed = 0;

    initSpeedUI() {
        this.updateSpeedToggleUI(this.currentSpeed);
    }

    async setMotorSpeed(preset) {
        if (!this.bluetooth.hasCharacteristic('motorSpeed')) {
            console.warn('Motor speed characteristic not available');
            return;
        }

        try {
            const data = new Uint8Array([preset]);
            await this.bluetooth.writeCharacteristic('motorSpeed', data);
            console.log('Motor speed set to preset:', preset, '(' + MotorController.SPEED_PRESETS[preset] + ')');
            this.currentSpeed = preset;
            this.updateSpeedToggleUI(preset);
        } catch (error) {
            console.error('Failed to set motor speed:', error);
        }
    }

    async cycleMotorSpeed() {
        const next = (this.currentSpeed + 1) % 3;
        await this.setMotorSpeed(next);
    }

    async readMotorSpeed() {
        if (!this.bluetooth.hasCharacteristic('motorSpeed')) {
            console.log('Motor speed characteristic not available');
            this.updateSpeedToggleUI(this.currentSpeed);
            return;
        }

        try {
            const value = await this.bluetooth.readCharacteristic('motorSpeed');
            const preset = value.getUint8(0);
            console.log('Motor speed preset:', preset, '(' + MotorController.SPEED_PRESETS[preset] + ')');
            this.currentSpeed = preset;
            this.updateSpeedToggleUI(preset);
            return preset;
        } catch (error) {
            console.error('Failed to read motor speed:', error);
            this.updateSpeedToggleUI(this.currentSpeed);
        }
    }

    updateSpeedToggleUI(preset) {
        const icon = document.getElementById('speedToggleIcon');
        if (icon) icon.textContent = MotorController.SPEED_ICONS[preset];
    }
}
