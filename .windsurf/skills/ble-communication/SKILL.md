---
name: ble-communication
description: BLE (Web Bluetooth) communication protocol between the PWA and ESP32-C3. Use when adding or modifying BLE characteristics, changing data encoding/decoding, debugging connection issues, or understanding how the GATT queue and write modes work.
---

# BLE Communication

## Service & Characteristic UUIDs
All UUIDs are defined in `js/constants.js`. Always import from there — never hardcode.

| Characteristic       | UUID suffix | Direction | Write Mode |
|----------------------|-------------|-----------|------------|
| LED State            | `...def1`   | Read + Notify | — |
| Color Preset         | `...def2`   | Write     | Fast (no-response) |
| Brightness           | `...def3`   | Write     | Fast (no-response) |
| LED Custom           | `...def4`   | Write     | Fast (no-response) |
| Motor Position       | `...def5`   | Write + Notify | Fast (no-response) |
| Time Sync            | `...def6`   | Write     | Fast (no-response) |
| Auto Tracking        | `...def7`   | Write     | — |
| Automations          | `...def8`   | Read + Write | — |
| Custom Presets       | `...cdefa`  | Read + Write | — |
| Device Name          | `...cdefb`  | Read + Write | — |
| Motor Speed          | `...cdefc`  | Write     | Fast (no-response) |
| Full Mode            | `...cdefd`  | Read + Write + Notify | — |

## BluetoothManager API (`js/bluetooth.js`)
```js
bluetooth.connect()                    // Opens browser BLE device picker
bluetooth.disconnect()                 // Intentional disconnect (no reconnect)
bluetooth.readCharacteristic(name)     // Returns DataView Promise
bluetooth.writeCharacteristic(name, Uint8Array)  // Queued write
bluetooth.startNotifications(name, callback)
bluetooth.hasCharacteristic(name)      // Check before reading/writing
```

Characteristic name strings (key used in `this.characteristics` map):
`ledState`, `colorPreset`, `brightness`, `ledCustom`, `motorPosition`, `timeSync`, `autoTracking`, `automations`, `customPresets`, `deviceName`, `motorSpeed`, `fullMode`

## GATT Queue
All GATT operations go through `_gattQueue` to serialize BLE calls (BLE GATT is single-threaded). Use `bluetooth.writeCharacteristic()` — never call `characteristic.writeValue()` directly.

## Fast Write vs. Normal Write
`FAST_WRITE_CHARS` in `bluetooth.js` uses `writeValueWithoutResponse` for real-time controls (no ACK overhead). Other characteristics use `writeValueWithResponse`.

## Data Encoding Examples

### LED State (Read, Notify) — 4 bytes per LED × 8 LEDs = 32 bytes
```js
const offset = index * 4;
const r = value.getUint8(offset);
const g = value.getUint8(offset + 1);
const b = value.getUint8(offset + 2);
const brightness = value.getUint8(offset + 3); // 0-255
```

### Brightness Write — 1 byte
```js
new Uint8Array([brightnessValue]); // 0-255
```

### Color Preset Write — 1 byte
```js
new Uint8Array([presetIndex]); // 0-4 built-in, 5+ custom
```

### LED Custom Write — 4 bytes
```js
new Uint8Array([r, g, b, brightness]);
```

### Motor Position Write — 2 bytes (little-endian uint16)
```js
const buf = new Uint8Array(2);
new DataView(buf.buffer).setUint16(0, positionValue, true); // little-endian
// positionValue: 0-4095 (steps), or 361 (zero), 362 (calibrate)
```

### Time Sync Write — 4 bytes (Unix timestamp, little-endian uint32)
```js
const buf = new Uint8Array(4);
new DataView(buf.buffer).setUint32(0, Math.floor(Date.now() / 1000), true);
```

### Auto Tracking Write — 5 bytes
```js
new Uint8Array([enabled ? 1 : 0, ...uint32_interval_minutes]);
// Build interval with DataView setUint32 at offset 1, little-endian
```

### Automations Read — variable length
```
byte 0: count (N)
then N × 8-byte records:
  offset+0: enabled (0/1)
  offset+1: utcHour
  offset+2: utcMinute
  offset+3: presetId
  offset+4: brightness (0-255)
  offset+5: r, offset+6: g, offset+7: b
```

### Automations Write (add) — 8 bytes
```
byte 0: 0x01 (add command)
byte 1: utcHour, byte 2: utcMinute
byte 3: presetId, byte 4: brightness
byte 5: r, byte 6: g, byte 7: b
```

## Connection Flow
1. `bluetooth.connect()` → browser picker → GATT connect → discover service → map all characteristics → start LED state notifications
2. After connect: read device name, sync time, read motor position, read automations, read custom presets
3. On disconnect: `_handleDisconnect()` auto-retries unless `_intentionalDisconnect` is true

## iOS / Browser Compatibility
- Web Bluetooth not supported on iOS Safari → show message to use Bluefy app
- Supported: Chrome, Edge, Opera on desktop and Android
- Check `navigator.bluetooth` before any BLE operation
