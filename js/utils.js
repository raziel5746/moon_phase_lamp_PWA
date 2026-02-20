// Utility functions

// Moon icon — crescent path in a 24x24 viewBox
export const MOON_ICON_PATH = 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z';

// Moon icon path pre-scaled for SVG coordinate space (centered at 0,0, radius ~9)
// Used when embedding directly into an SVG element via createElementNS
export const MOON_ICON_PATH_SVG = 'M9,0.79A9,9,0,1,1,-0.79,-9 7,7,0,0,0,9,0.79Z';

// Returns a full <svg> string for use in HTML templates
// size: number (px), extraStyle: optional inline style string
export function moonIconSvg(size = 24, extraStyle = '') {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" stroke="none"${extraStyle ? ` style="${extraStyle}"` : ''}><path d="${MOON_ICON_PATH}"/></svg>`;
}

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
