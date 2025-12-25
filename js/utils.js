// Utility functions

export function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 255, g: 220, b: 150 };
}

export function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? "0" + hex : hex;
    }).join('');
}

export function getLocalToUtcTime(hour, minute) {
    const now = new Date();
    now.setHours(hour, minute, 0, 0);
    return { hour: now.getUTCHours(), minute: now.getUTCMinutes() };
}

export function getUtcToLocalTime(hour, minute) {
    const now = new Date();
    now.setUTCHours(hour, minute, 0, 0);
    return { hour: now.getHours(), minute: now.getMinutes() };
}

export function formatTime(hour, minute) {
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

export function brightnessToFirmware(uiBrightness) {
    return Math.round(uiBrightness * 255 / 100);
}

export function brightnessToUI(firmwareBrightness) {
    return Math.round(firmwareBrightness * 100 / 255);
}
