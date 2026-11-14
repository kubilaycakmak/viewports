export const TEXT_SIZES = {
  default: { label: 'Default', fontSize: 16, scale: 1 },
  large: { label: 'Large', fontSize: 20, scale: 1.25 },
  'extra-large': { label: 'Extra Large', fontSize: 24, scale: 1.5 },
};

export const WINDOW_CONTROLS_HEIGHT = 34;

export const DEFAULT_AREAS = { top: true, bottom: true };

// Visual approximations in CSS pixels, not manufacturer measurements.
const DEVICE_CORNER_RADII = {
  'iphone-17': 55, 'iphone-17-air': 54, 'iphone-17-pro': 55, 'iphone-17-pro-max': 60,
  'iphone-14': 48, 'iphone-se': 30,
  'iphone-duo-folded': 48, 'iphone-duo-unfolded': 46,
  'galaxy-s26': 44, 'galaxy-s26-plus': 48, 'galaxy-s26-ultra': 24,
  'pixel-10': 48, 'pixel-10-pro': 50,
  'ipad-mini': 25, 'ipad-air-11': 27, 'ipad-pro-11': 28, 'ipad-pro-13': 32,
  'galaxy-tab-s10': 24,
};

export function presentationFor(device, areas = DEFAULT_AREAS) {
  if (device.type !== 'mobile' && device.type !== 'tablet') {
    const top = areas.top ? 48 : 0;
    return {
      width: device.width,
      height: device.height,
      viewportWidth: device.width,
      viewportHeight: device.height - top,
      top,
      bottom: 0,
      bezel: 0,
      kind: 'desktop',
      pixelRatio: 0,
      outerRadius: 0,
      screenRadius: 0,
    };
  }

  const ios = device.id.startsWith('iphone');
  const tablet = device.type === 'tablet';
  const bezel = 8;
  let top = 80;
  let bottom = 24;
  let kind = 'android';
  let pixelRatio = 0;
  const outerRadius = DEVICE_CORNER_RADII[device.id] ?? (tablet ? 26 : 46);
  const screenRadius = device.id === 'iphone-se' ? 2 : outerRadius - bezel;

  if (tablet) {
    top = 76;
    bottom = 20;
    kind = 'tablet';
    if (device.id.startsWith('ipad')) pixelRatio = 2;
  } else if (ios) {
    top = device.id === 'iphone-se' ? 26 : 54;
    bottom = 82;
    kind = 'ios';
    pixelRatio = device.id === 'iphone-se' ? 2 : 3;
  }

  if (device.id === 'iphone-duo-folded') {
    top = 18;
    bottom = 80;
  } else if (device.id === 'iphone-duo-unfolded') {
    top = 74;
    bottom = 10;
    kind = 'ios-inner';
  }

  if (!areas.top) top = 0;
  if (!areas.bottom) bottom = 0;

  const viewportWidth = device.id === 'iphone-duo-folded' && (areas.top || areas.bottom) ? 382 : device.width;
  return {
    width: viewportWidth + bezel * 2,
    height: device.height + bezel * 2,
    viewportWidth,
    viewportHeight: device.height - top - bottom,
    top,
    bottom,
    bezel,
    kind,
    pixelRatio,
    outerRadius,
    screenRadius,
  };
}

export function mobileUserAgent(device, chromeVersion) {
  if (device.type !== 'mobile' && device.type !== 'tablet') return undefined;
  if (device.id.startsWith('iphone') || device.id.startsWith('ipad')) {
    const model = device.id.startsWith('iphone') ? 'iPhone; CPU iPhone OS' : 'iPad; CPU OS';
    const osVersion = device.id.startsWith('iphone-duo-') ? '27_1' : '26_0';
    const safariVersion = device.id.startsWith('iphone-duo-') ? '27.1' : '26.0';
    return `Mozilla/5.0 (${model} ${osVersion} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${safariVersion} Mobile/15E148 Safari/604.1`;
  }
  const mobile = device.type === 'mobile' ? ' Mobile' : '';
  return `Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion}${mobile} Safari/537.36`;
}
