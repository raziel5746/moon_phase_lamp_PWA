---
name: pwa-architecture
description: Overall architecture of the Moon Phase Lamp PWA. Use when adding new features, understanding module structure, modifying how modules interact, or working on UI components. Covers ES module layout, file responsibilities, and coding patterns.
---

# PWA Architecture

## Project Overview
Moon Lamp Control is a vanilla JavaScript PWA (no framework) that controls an ESP32-C3 moon phase lamp via Web Bluetooth. Hosted on GitHub Pages at `/moon_phase_lamp_PWA/`.

## File Structure
```
index.html          - Single HTML page, loads all CSS and bootstraps app.js
manifest.json       - PWA manifest (scope: /moon_phase_lamp_PWA/)
sw.js               - Service worker (cache versioning via __VERSION__ token)
version.json        - {"version": "x.y"} - used for cache busting
suncalc.js          - Third-party sun/moon calculation library (not modified)
iro.min.js          - Third-party color picker library (not modified)

css/
  base.css          - CSS variables, reset, global typography
  components.css    - Buttons, cards, shared UI elements
  tabs.css          - Tab navigation component
  led-ring.css      - LED ring visualization
  presets.css       - Color preset chips
  motor.css         - Motor control panel
  automations.css   - Automation scheduling panel
  responsive.css    - Mobile breakpoints
  modal.css         - Modal dialogs

js/
  app.js            - Entry point, wires up all modules, handles tab switching
  constants.js      - BLE UUIDs and DEFAULT_PRESETS (import from here, never hardcode)
  bluetooth.js      - BluetoothManager class: BLE connect/disconnect/read/write/notify
  led-controller.js - LEDController: LED state, brightness, color control
  motor-controller.js - MotorController: position, zero-set, calibration, speed
  presets.js        - PresetsController: built-in + custom presets management
  automations.js    - AutomationsController: schedule-based LED automations
  ui.js             - UIController: DOM updates, connection state, shared UI helpers
  modal.js          - Modal dialog management
  utils.js          - Shared utilities (time conversion, brightness scaling, etc.)
```

## Module Wiring Pattern
`app.js` instantiates all controllers and passes dependencies:
```js
const bluetooth = new BluetoothManager();
const ui = new UIController(bluetooth);
const led = new LEDController(bluetooth);
const motor = new MotorController(bluetooth);
const presets = new PresetsController(bluetooth, led);
const automations = new AutomationsController(bluetooth, presets);
```
Controllers register callbacks on `bluetooth` for BLE notifications.

## ES Module Convention
- All JS files use `import`/`export` (ES modules via `type="module"` in HTML)
- Import from `./constants.js` for all UUIDs and preset constants
- Import utilities from `./utils.js` (time, brightness conversion, etc.)
- Never use `var`; prefer `const`/`let`
- Use `async/await` for all BLE operations (they return Promises)

## Adding a New Feature
1. Add BLE UUID to `constants.js` if a new characteristic is needed
2. Add read/write methods to `bluetooth.js` (`BluetoothManager`)
3. Create or update a controller in the appropriate `js/` file
4. Wire the controller in `app.js`
5. Add CSS to the most relevant existing CSS file or create a new one
6. Add the new CSS file to `sw.js` `filesToCache` array

## CSS Patterns
- Dark theme: `--bg-primary: #1a1a2e`, `--bg-secondary: #16213e`, `--accent: #7c3aed`
- Use CSS custom properties (variables) defined in `base.css` for all colors/spacing
- Mobile-first layout, breakpoints in `responsive.css`

## State Management
- No global state object; each controller owns its own state
- BLE connection state lives in `BluetoothManager`
- UI reflects state via callbacks: controllers call `ui.*` methods after BLE reads
