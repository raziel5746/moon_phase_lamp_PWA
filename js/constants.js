// BLE Service and Characteristics UUIDs (must match ESP32)
export const LAMP_SERVICE_UUID = 'a1b2c3d4-1234-5678-1234-56789abcdef0';
export const LED_STATE_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef1';
export const COLOR_PRESET_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef2';
export const BRIGHTNESS_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef3';
export const LED_CUSTOM_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef4';
export const MOTOR_POSITION_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef5';
export const TIME_SYNC_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef6';
export const AUTO_TRACKING_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef7';
export const AUTOMATIONS_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef8';
export const CUSTOM_PRESETS_CHAR_UUID = '12345678-1234-5678-1234-56789abcdefa';
export const DEVICE_NAME_CHAR_UUID = '12345678-1234-5678-1234-56789abcdefb';
export const MOTOR_SPEED_CHAR_UUID = '12345678-1234-5678-1234-56789abcdefc';
export const FULL_MODE_CHAR_UUID = '12345678-1234-5678-1234-56789abcdefd';
export const MOTOR_PRESETS_CHAR_UUID = '12345678-1234-5678-1234-56789abcdef9';

// Motor commands
export const MOTOR_ZERO_COMMAND = 361;
export const MOTOR_CALIBRATE_COMMAND = 362;
export const MOTOR_RESET_POSITION_COMMAND = 363;
export const MOTOR_FULL_MOON_COMMAND = 364;

// Default presets (shown even when disconnected)
export const DEFAULT_PRESETS = [
    { id: 0, r: 255, g: 220, b: 150, name: 'Warm White', isCustom: false },
    { id: 1, r: 255, g: 100, b: 0, name: 'Sunset', isCustom: false },
    { id: 2, r: 0, g: 100, b: 255, name: 'Ocean Blue', isCustom: false },
    { id: 3, r: 255, g: 0, b: 100, name: 'Pink Dream', isCustom: false },
    { id: 4, r: 100, g: 255, b: 100, name: 'Forest Green', isCustom: false }
];
