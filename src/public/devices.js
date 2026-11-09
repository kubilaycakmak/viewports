export const DEVICE_GROUPS = [
  {
    label: 'Mobile',
    devices: [
      // ── iPhone 17 series (2025) ──
      { id: 'iphone-17',          name: 'iPhone 17',          width: 402,  height: 874,  type: 'mobile' },
      { id: 'iphone-17-air',      name: 'iPhone Air',         width: 420,  height: 912,  type: 'mobile' },
      { id: 'iphone-17-pro',      name: 'iPhone 17 Pro',      width: 402,  height: 874,  type: 'mobile' },
      { id: 'iphone-17-pro-max',  name: 'iPhone 17 Pro Max',  width: 440,  height: 956,  type: 'mobile' },
      // ── Galaxy S26 series (2026) ──
      { id: 'galaxy-s26',         name: 'Galaxy S26',         width: 360,  height: 780,  type: 'mobile' },
      { id: 'galaxy-s26-plus',    name: 'Galaxy S26+',        width: 412,  height: 915,  type: 'mobile' },
      { id: 'galaxy-s26-ultra',   name: 'Galaxy S26 Ultra',   width: 412,  height: 932,  type: 'mobile' },
      // ── Pixel 10 series (2026) ──
      { id: 'pixel-10',           name: 'Pixel 10',           width: 393,  height: 851,  type: 'mobile' },
      { id: 'pixel-10-pro',       name: 'Pixel 10 Pro',       width: 412,  height: 892,  type: 'mobile' },
      // ── Legacy ──
      { id: 'iphone-se',          name: 'iPhone SE',          width: 375,  height: 667,  type: 'mobile' },
      { id: 'iphone-14',          name: 'iPhone 14',          width: 390,  height: 844,  type: 'mobile' },
    ],
  },
  {
    label: 'Tablet',
    devices: [
      { id: 'ipad-mini',       name: 'iPad Mini',       width: 768,  height: 1024, type: 'tablet' },
      { id: 'ipad-air-11',     name: 'iPad Air 11"',    width: 820,  height: 1180, type: 'tablet' },
      { id: 'ipad-pro-11',     name: 'iPad Pro 11"',    width: 834,  height: 1194, type: 'tablet' },
      { id: 'ipad-pro-13',     name: 'iPad Pro 13"',    width: 1024, height: 1366, type: 'tablet' },
      { id: 'galaxy-tab-s10',  name: 'Galaxy Tab S10',  width: 800,  height: 1280, type: 'tablet' },
    ],
  },
  {
    label: 'Laptop',
    devices: [
      { id: 'laptop-1280',  name: 'Laptop 1280',  width: 1280, height: 800,  type: 'laptop' },
      { id: 'macbook-13',   name: 'MacBook 13"',  width: 1280, height: 832,  type: 'laptop' },
      { id: 'macbook-14',   name: 'MacBook 14"',  width: 1512, height: 982,  type: 'laptop' },
      { id: 'macbook-16',   name: 'MacBook 16"',  width: 1728, height: 1117, type: 'laptop' },
    ],
  },
  {
    label: 'Desktop',
    devices: [
      { id: 'desktop-hd',  name: 'Desktop HD',   width: 1920, height: 1080, type: 'desktop' },
      { id: 'desktop-2k',  name: 'Desktop 2K',   width: 2560, height: 1440, type: 'desktop' },
      { id: 'desktop-4k',  name: 'Desktop 4K',   width: 3840, height: 2160, type: 'desktop' },
    ],
  },
];

export const ALL_DEVICES = DEVICE_GROUPS.flatMap((g) => g.devices);
