---
name: automations-scheduling
description: Automation scheduling system for the Moon Lamp PWA. Use when adding, modifying, or debugging time-based LED automations, understanding UTC/local time conversion, or working with the automations BLE characteristic data format.
---

# Automations Scheduling

## What Automations Are
Time-based rules that automatically change LED color/brightness at a specified time each day. Up to N automations can be stored on the device (firmware limit). Each automation has:
- `enabled`: boolean
- `hour`/`minute`: local time (displayed to user)
- `hourUtc`/`minuteUtc`: UTC time (stored on firmware, which has no timezone awareness)
- `presetId`: 0–4 = built-in presets, 5+ = custom presets, 0xFF = custom RGB
- `brightness`: 0–255 firmware value
- `r`, `g`, `b`: RGB values (used when presetId == 0xFF)

## UTC/Local Time Conversion
The firmware stores and compares automations in **UTC** (it has no timezone). The PWA converts between local and UTC when reading and writing.

Utility functions in `js/utils.js`:
```js
getLocalToUtcTime(localHour, localMinute)   // returns { hour, minute } in UTC
getUtcToLocalTime(utcHour, utcMinute)        // returns { hour, minute } in local time
```

**Rule**: Always convert to UTC before sending to firmware. Always convert to local when displaying to the user.

## BLE Data Format — Automations Characteristic (`...def8`)

### Read (device → PWA)
```
byte 0:      count (N)
bytes 1...:  N records × 8 bytes each
  record[0]: enabled (0 = disabled, non-zero = enabled)
  record[1]: utcHour   (0–23)
  record[2]: utcMinute (0–59)
  record[3]: presetId
  record[4]: brightness (0–255)
  record[5]: r
  record[6]: g
  record[7]: b
```

### Write — Add Automation (8 bytes)
```
byte 0: 0x01  (add command)
byte 1: utcHour
byte 2: utcMinute
byte 3: presetId
byte 4: brightness
byte 5: r
byte 6: g
byte 7: b
```

### Write — Delete Automation (2 bytes)
```
byte 0: 0x02  (delete command)
byte 1: index (0-based)
```

### Write — Toggle Automation (2 bytes)
```
byte 0: 0x03  (toggle command)
byte 1: index (0-based)
```

### Write — Update Automation (9 bytes)
```
byte 0: 0x04  (update command)
byte 1: index (0-based)
bytes 2–8: same layout as add (utcHour, utcMinute, presetId, brightness, r, g, b)
```

## AutomationsController API (`js/automations.js`)
```js
automations.readAutomations()                              // Read all from device
automations.addAutomation(hour, minute, presetId, brightness, r, g, b)
automations.deleteAutomation(index)
automations.toggleAutomation(index)
automations.renderAutomations()                            // Refresh DOM list
```

## Brightness Scaling
The firmware uses 0–255 for brightness, but the UI shows 0–100%. Use utility functions:
```js
brightnessToUI(firmwareValue)       // 0-255 → 0-100
brightnessToFirmware(uiValue)       // 0-100 → 0-255
```
Both in `js/utils.js`.

## Preset ID Mapping
```
0 = Warm White  (built-in)
1 = Sunset      (built-in)
2 = Ocean Blue  (built-in)
3 = Pink Dream  (built-in)
4 = Forest Green(built-in)
5–N = Custom presets (user-defined, stored via PresetManager on firmware)
0xFF = Raw RGB (use r, g, b fields directly, ignore preset color)
```

## Adding a New Automation from UI
1. User picks time (local), preset, brightness (UI 0–100)
2. Convert time to UTC: `getLocalToUtcTime(hour, minute)`
3. Convert brightness to firmware: `brightnessToFirmware(uiValue)`
4. Call `automations.addAutomation(localHour, localMin, presetId, firmwareBrightness, r, g, b)`
5. After write succeeds, call `readAutomations()` to refresh the list from device

## Dependencies
- `bluetooth` (BluetoothManager) — for BLE reads/writes
- `presetsController` (PresetsController) — to resolve preset names/colors for display
