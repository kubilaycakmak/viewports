import { ALL_DEVICES } from '../public/devices.js';
import { DEFAULT_AREAS, TEXT_SIZES } from './presentation.js';

export const DEFAULT_DEVICES = ['iphone-17', 'ipad-pro-11', 'desktop-hd'];
export const DEVICE_IDS = ALL_DEVICES.map(({ id }) => id);
export const STARTUP_MESSAGE = 'viewports:';

export function createPreviewRequest(url, deviceIds = DEFAULT_DEVICES, textSize = 'default', areas = DEFAULT_AREAS) {
  let target;
  try {
    target = new URL(url);
  } catch {
    throw new Error('Pass a complete URL such as http://localhost:3000.');
  }

  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) {
    throw new Error('Use an HTTP or HTTPS URL without embedded credentials.');
  }
  if (!Object.hasOwn(TEXT_SIZES, textSize)) {
    throw new Error('Text size must be default, large, or extra-large.');
  }
  if (typeof areas?.top !== 'boolean' || typeof areas?.bottom !== 'boolean') {
    throw new Error('Device areas must specify top and bottom as true or false.');
  }
  if (deviceIds.length < 1) {
    throw new Error('Choose at least one device.');
  }
  if (new Set(deviceIds).size !== deviceIds.length) {
    throw new Error('Choose each device only once.');
  }

  const devices = deviceIds.map(id => {
    const device = ALL_DEVICES.find(device => device.id === id);
    if (!device) throw new Error(`Unknown device "${id}". Run viewports --help to list presets.`);
    return device;
  });
  return { url: target.href, devices, textSize, areas: { top: areas.top, bottom: areas.bottom } };
}
