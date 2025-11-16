# Moon Lamp PWA 🌙

Progressive Web App for controlling the Moon Phase Lamp via Bluetooth.

## Features

- ✅ **Installable PWA** - Add to home screen on any device
- ✅ **Offline Support** - Works without internet connection
- ✅ **Bluetooth Control** - Direct BLE connection to lamp
- ✅ **Color Presets** - Quick access to favorite colors
- ✅ **Custom Colors** - Full RGB control per LED
- ✅ **Brightness Control** - Adjust intensity
- ✅ **Motor Control** - Position the moon phase display

## Setup

### 1. Deploy to GitHub Pages

1. Push this repository to GitHub
2. Go to Settings → Pages
3. Select "Deploy from main branch"
4. Wait for deployment (usually 1-2 minutes)
5. Access at: `https://yourusername.github.io/moon_phase_lamp_PWA`

### 2. Install PWA

1. Open the GitHub Pages URL on your phone
2. Chrome will show "Install" button or banner
3. Tap "Install" or "Add to Home Screen"
4. App icon appears on home screen

### 3. Connect to Lamp

1. Make sure ESP32 is powered on
2. Open the installed app
3. Tap "Connect Bluetooth"
4. Select "MoonLamp" from the list
5. Control your lamp!

## Bluetooth Protocol

The ESP32 must implement the following BLE GATT service:

**Service UUID:** `12345678-1234-5678-1234-56789abcdef0`

**Characteristics:**

| UUID | Name | Type | Description |
|------|------|------|-------------|
| `...def1` | LED State | Read/Notify | Current state of all 8 LEDs (32 bytes) |
| `...def2` | Color Preset | Write | Set color preset (1 byte: 0-4) |
| `...def3` | Brightness | Write | Set brightness (1 byte: 0-100) |
| `...def4` | LED Custom | Write | Set individual LED (5 bytes: index, R, G, B, brightness) |
| `...def5` | Motor Position | Read/Write | Motor position in degrees (2 bytes: 0-360) |

### LED State Format (32 bytes)

8 LEDs × 4 bytes each:
```
LED0: [R, G, B, Brightness]
LED1: [R, G, B, Brightness]
...
LED7: [R, G, B, Brightness]
```

## Development

### Local Testing

1. Install a local web server:
   ```bash
   npm install -g http-server
   ```

2. Serve the PWA:
   ```bash
   http-server -p 8080
   ```

3. Access at `http://localhost:8080`

**Note:** Bluetooth requires HTTPS in production, but works on localhost for testing.

### File Structure

```
moon_phase_lamp_PWA/
├── index.html          # Main HTML
├── styles.css          # Styling
├── app.js              # JavaScript + Bluetooth logic
├── manifest.json       # PWA manifest
├── sw.js               # Service worker
├── icon-192.png        # App icon (192x192)
├── icon-512.png        # App icon (512x512)
└── README.md           # This file
```

## Browser Compatibility

- ✅ Chrome/Edge (Android, Desktop, iOS)
- ✅ Safari (iOS 16.4+)
- ❌ Firefox (no Web Bluetooth support yet)

## Troubleshooting

**"Install" button doesn't appear:**
- Make sure you're using HTTPS (GitHub Pages provides this)
- Check that manifest.json is loading correctly
- Try clearing browser cache

**Can't connect to Bluetooth:**
- Ensure ESP32 is powered on and advertising
- Check that Bluetooth is enabled on your device
- Make sure the device name is "MoonLamp"
- Try restarting the ESP32

**App doesn't work offline:**
- Install the PWA first (don't just bookmark)
- Check that service worker registered successfully (DevTools → Application)
- Make sure all files are cached

## Next Steps

1. Deploy this PWA to GitHub Pages
2. Implement Bluetooth backend on ESP32 (see `../BLUETOOTH_IMPLEMENTATION.md`)
3. Test the full flow
4. Enjoy your wireless moon lamp! 🌙

## License

MIT
