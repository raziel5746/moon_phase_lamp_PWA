---
name: motor-ui-protocol
description: Motor control protocol for the Moon Lamp PWA, including position math, degree-to-step conversion, special commands, calibration flow, and speed presets. Use when modifying motor UI, adding motor features, or debugging motor position issues.
---

# Motor UI Protocol

## Coordinate System
- **Steps**: 0–4095 (full revolution = 4096 steps, 28BYJ-48 stepper via DRV8833)
- **Degrees**: 0–360 (displayed to user)
- Conversion: `degrees = (steps * 360) / 4096`  |  `steps = (degrees * 4096) / 360`

## Special Motor Commands (sent as position values)
These are special uint16 values outside the 0–4095 range:
```js
MOTOR_ZERO_COMMAND    = 361  // Mark current physical position as 0° (new moon)
MOTOR_CALIBRATE_COMMAND = 362  // Run Hall sensor homing calibration
```
Both are defined in `js/constants.js` — always import from there.

## Motor Position BLE Characteristic
- UUID: `MOTOR_POSITION_CHAR_UUID` (`...def5`)
- **Write**: 2-byte little-endian uint16 (position in steps, or special command)
- **Notify**: 2-byte little-endian uint16 (current position after move, or 0xFFFF on calibration failure)

### Write Example
```js
async function sendMotorPosition(steps) {
    const buf = new Uint8Array(2);
    new DataView(buf.buffer).setUint16(0, steps, true); // little-endian
    await bluetooth.writeCharacteristic('motorPosition', buf);
}
```

### Read Notification Example
```js
bluetooth.startNotifications('motorPosition', (value) => {
    const raw = value.getUint16(0, true); // little-endian
    if (raw === 0xFFFF) {
        // Calibration failed — Hall sensor not found
        showCalibrationError();
    } else {
        const degrees = Math.round((raw * 360) / 4096);
        updateMotorPositionDisplay(degrees);
    }
});
```

## Motor Speed Presets
- **Write**: 1-byte preset index (0–3)
- Presets: `0=Very Slow`, `1=Slow`, `2=Medium`, `3=Fast`
- Characteristic: `motorSpeed` (`MOTOR_SPEED_CHAR_UUID`, `...cdefc`)

## Moon Phase Auto-Tracking
Controls automatic moon phase position updates on the device:
- Characteristic: `autoTracking` (`AUTO_TRACKING_CHAR_UUID`, `...def7`)
- Write: 5 bytes — `[enabled:uint8, intervalMinutes:uint32 little-endian]`
- Default interval: 60 minutes

### Encoding Auto-Tracking
```js
const buf = new Uint8Array(5);
const view = new DataView(buf.buffer);
view.setUint8(0, enabled ? 1 : 0);
view.setUint32(1, intervalMinutes, true); // little-endian
await bluetooth.writeCharacteristic('autoTracking', buf);
```

## Calibration Flow (PWA side)
1. User clicks "Calibrate" → send `MOTOR_CALIBRATE_COMMAND` (362) as motor position
2. Wait for motor position notification
3. If notification value is `0xFFFF` → show error (Hall sensor not found)
4. Otherwise → update displayed position with returned degree value
5. Show success feedback

## Zero-Set Flow (PWA side)
1. User physically positions lamp to new moon (0° = fully closed/dark)
2. User clicks "Set as Zero" → send `MOTOR_ZERO_COMMAND` (361)
3. Firmware marks current physical position as steps=0
4. PWA updates displayed position to 0°

## Moon Phase Calculation (PWA side)
`suncalc.js` is used in the PWA to display the current moon phase independently of the device. This is display-only; the firmware also calculates moon phase using its own RTC time.
```js
const moon = SunCalc.getMoonIllumination(new Date());
// moon.phase: 0.0 (new) to 1.0 (full and back)
const degrees = moon.phase * 360;
const steps = Math.round((degrees * 4096) / 360);
```
