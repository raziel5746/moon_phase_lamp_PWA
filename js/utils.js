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

// Returns SVG path string for the lit portion of the moon at a given phase (0–1).
// phase=0: new moon, phase=0.5: full moon.
// Uses a semicircle (limb) + ellipse arc (terminator) construction.
function moonPhaseFilledPath(phase, cx, cy, r) {
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

// Returns an <svg> string showing the moon phase for a given motor angle (0–360°).
// 0° = new moon, 180° = full moon.
export function moonAngleSvg(angleDeg, size = 44) {
    const phase = ((angleDeg % 360) + 360) % 360 / 360;
    const pad = 3;
    const r = size / 2 - pad;
    const cx = size / 2, cy = size / 2;
    const litPath = moonPhaseFilledPath(phase, cx, cy, r);
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">` +
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.35"/>` +
        (litPath ? `<path d="${litPath}" fill="currentColor" opacity="0.9"/>` : '') +
        `</svg>`;
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
