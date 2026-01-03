// Motor Controller
import { MOTOR_ZERO_COMMAND, MOTOR_CALIBRATE_COMMAND } from './constants.js';
import { Modal } from './modal.js';

export class MotorController {
    constructor(bluetooth) {
        this.bluetooth = bluetooth;
        this.motorAngle = 0;
        this.pendingMotorAngle = undefined;
        this.moonPositionAngle = 0;

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
        moonMarker.style.filter = 'drop-shadow(0 0 3px #ffd700)';
        markersGroup.appendChild(moonMarker);

        const moonIcon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        moonIcon.setAttribute('x', moonX2 + 10 * Math.cos(moonRad));
        moonIcon.setAttribute('y', moonY2 + 10 * Math.sin(moonRad));
        moonIcon.setAttribute('text-anchor', 'middle');
        moonIcon.setAttribute('dominant-baseline', 'middle');
        moonIcon.setAttribute('fill', '#ffd700');
        moonIcon.setAttribute('font-size', '16');
        moonIcon.setAttribute('id', 'moonIcon');
        moonIcon.textContent = '🌙';
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
    }

    calculateMoonPhase() {
        const illumination = SunCalc.getMoonIllumination(new Date());
        return illumination.phase;
    }

    updateMotorPointer(targetAngle) {
        const pointer = document.getElementById('motorPointer');
        this.updateMotorPointerDirect(pointer, targetAngle);
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

        moonIcon.setAttribute('x', moonX2 + 10 * Math.cos(moonRad));
        moonIcon.setAttribute('y', moonY2 + 10 * Math.sin(moonRad));

        this.moonPositionAngle = degrees;
    }

    async setRealMoonPosition() {
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
        try {
            const data = new Uint16Array([MOTOR_CALIBRATE_COMMAND]);
            await this.bluetooth.writeCharacteristic('motorPosition', data);
            console.log('Motor calibration command sent');
        } catch (error) {
            console.error('Failed to calibrate motor:', error);
            Modal.error('Failed to calibrate motor');
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

            const toggle = document.getElementById('autoTrackingToggle');
            const select = document.getElementById('trackingInterval');
            if (toggle) toggle.checked = enabled;
            if (select) select.value = intervalMinutes.toString();
        } catch (error) {
            console.error('Failed to read auto tracking:', error);
        }
    }

    async setAutoTracking(enabled, intervalMinutes) {
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

    // Speed preset names for UI
    static SPEED_PRESETS = ['Speed 1', 'Speed 2', 'Speed 3'];

    async setMotorSpeed(preset) {
        if (!this.bluetooth.hasCharacteristic('motorSpeed')) {
            console.warn('Motor speed characteristic not available');
            return;
        }

        try {
            const data = new Uint8Array([preset]);
            await this.bluetooth.writeCharacteristic('motorSpeed', data);
            console.log('Motor speed set to preset:', preset, '(' + MotorController.SPEED_PRESETS[preset] + ')');
            this.updateSpeedButtonsUI(preset);
        } catch (error) {
            console.error('Failed to set motor speed:', error);
        }
    }

    async readMotorSpeed() {
        if (!this.bluetooth.hasCharacteristic('motorSpeed')) {
            console.log('Motor speed characteristic not available');
            return;
        }

        try {
            const value = await this.bluetooth.readCharacteristic('motorSpeed');
            const preset = value.getUint8(0);
            console.log('Motor speed preset:', preset, '(' + MotorController.SPEED_PRESETS[preset] + ')');
            this.updateSpeedButtonsUI(preset);
            return preset;
        } catch (error) {
            console.error('Failed to read motor speed:', error);
        }
    }

    updateSpeedButtonsUI(activePreset) {
        const buttons = document.querySelectorAll('.speed-btn');
        buttons.forEach((btn, index) => {
            if (index === activePreset) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
}
