export const TEXT_SIZES = {
  default: { label: 'Default', fontSize: 16, scale: 1 },
  large: { label: 'Large', fontSize: 20, scale: 1.25 },
  'extra-large': { label: 'Extra Large', fontSize: 24, scale: 1.5 },
};

export function presentationFor(device) {
  if (device.type !== 'mobile' && device.type !== 'tablet') {
    return {
      width: device.width,
      height: device.height,
      viewportWidth: device.width,
      viewportHeight: device.height,
      top: 0,
      bottom: 0,
      bezel: 0,
      kind: 'desktop',
      pixelRatio: 0,
    };
  }

  const ios = device.id.startsWith('iphone');
  const tablet = device.type === 'tablet';
  const bezel = 8;
  let top = 80;
  let bottom = 24;
  let kind = 'android';
  let pixelRatio = 0;

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

  return {
    width: device.width + bezel * 2,
    height: device.height + bezel * 2,
    viewportWidth: device.width,
    viewportHeight: device.height - top - bottom,
    top,
    bottom,
    bezel,
    kind,
    pixelRatio,
  };
}

export function mobileUserAgent(device, chromeVersion) {
  if (device.type !== 'mobile' && device.type !== 'tablet') return undefined;
  if (device.id.startsWith('iphone') || device.id.startsWith('ipad')) {
    const model = device.id.startsWith('iphone') ? 'iPhone; CPU iPhone OS' : 'iPad; CPU OS';
    return `Mozilla/5.0 (${model} 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1`;
  }
  const mobile = device.type === 'mobile' ? ' Mobile' : '';
  return `Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion}${mobile} Safari/537.36`;
}
