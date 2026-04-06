<div align="center">

<br/>

```
◈ viewports
```

### See your site at every screen size — simultaneously.

A zero-config developer tool that opens your localhost in **12+ device viewports** at once. Free 2D canvas, drag & drop, instant zoom, custom devices.

<br/>

[![npm version](https://img.shields.io/npm/v/@kubilaycakmak/viewports?style=flat-square&color=7c6afe&label=npm)](https://www.npmjs.com/package/@kubilaycakmak/viewports)
[![npm downloads](https://img.shields.io/npm/dm/@kubilaycakmak/viewports?style=flat-square&color=7c6afe)](https://www.npmjs.com/package/@kubilaycakmak/viewports)
[![License: MIT](https://img.shields.io/badge/license-MIT-7c6afe?style=flat-square)](./LICENSE.md)
[![Node ≥18](https://img.shields.io/badge/node-%3E%3D18-7c6afe?style=flat-square)](https://nodejs.org)

<br/>

```bash
npx @kubilaycakmak/viewports http://localhost:3000
```

<br/>

<!-- After taking a screenshot with the built-in 📷 button, save it to docs/screenshot.png -->
![viewports preview](https://raw.githubusercontent.com/kubilaycakmak/viewports/master/docs/screenshot.png)

<br/>

</div>

---

## ✨ Features

- 🗺 &nbsp;**Free 2D canvas** — drag every window to any position, stack vertically or side-by-side
- 📱 &nbsp;**12 built-in device presets** — iPhone SE → Desktop 2K, all real dimensions
- 🔍 &nbsp;**Smart zoom** — step controls, `Ctrl+Scroll`, or **Fit All** (auto-arranges + zooms in one click)
- 🔄 &nbsp;**Rotate** — portrait ↔ landscape toggle per device
- ➕ &nbsp;**Custom devices** — add any resolution with a name and category
- 💾 &nbsp;**Persistent state** — URL, layout, zoom, device visibility all saved between sessions
- 🎨 &nbsp;**Professional dark UI** — layered shadows, glass-effect frames, spring animations
- ⚡ &nbsp;**Zero frontend dependencies** — pure vanilla JS/CSS, boots instantly
- 📸 &nbsp;**Screenshot** — capture the full canvas for marketing with one click (Screen Capture API)

---

## 🚀 Quick Start

```bash
# No install needed
npx @kubilaycakmak/viewports http://localhost:3000

# Or with a custom port
npx @kubilaycakmak/viewports http://localhost:5173 --port 4444
```

Your browser opens automatically with all device viewports loaded and ready.

---

## 📦 Installation

**Global install** (use anywhere):
```bash
npm install -g @kubilaycakmak/viewports
viewports http://localhost:3000
```

**Per-project** (recommended for teams):
```bash
npm install -D @kubilaycakmak/viewports
```

Then add to your `package.json`:
```json
{
  "scripts": {
    "preview": "viewports http://localhost:3000"
  }
}
```

Now the whole team can run `npm run preview` without any global install.

---

## 🖥 CLI Options

```
Usage: viewports [url] [options]

Arguments:
  url                    Target URL to preview  (default: last used)

Options:
  -p, --port <number>    Port for the viewports server  (default: 5177)
  --no-open              Skip auto-opening the browser
  -V, --version          Print version number
  -h, --help             Display help
```

---

## 📱 Device Presets

| Category | Device | Width | Height |
|----------|--------|------:|-------:|
| Mobile | iPhone SE | 375 | 667 |
| Mobile | iPhone 14 | 390 | 844 |
| Mobile | iPhone 14 Pro Max | 430 | 932 |
| Tablet | iPad Mini | 768 | 1024 |
| Tablet | iPad Pro 11" | 834 | 1194 |
| Tablet | iPad Pro 13" | 1024 | 1366 |
| Laptop | Laptop 1280 | 1280 | 800 |
| Laptop | MacBook 13" | 1280 | 832 |
| Laptop | MacBook 14" | 1512 | 982 |
| Laptop | MacBook 16" | 1728 | 1117 |
| Desktop | Desktop HD | 1920 | 1080 |
| Desktop | Desktop 2K | 2560 | 1440 |

> **➕ Custom devices** — click the `+` button in the toolbar to add any resolution.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` in URL bar | Load / reload URL |
| `Ctrl / ⌘` + `Scroll` | Zoom canvas in / out |
| `Ctrl / ⌘` + `R` | Reload all viewports |
| `Escape` | Close modal |

## 📸 Marketing Screenshots

Click the 📷 camera button in the toolbar. Your browser will ask which tab to share — select the viewports tab — and a full-resolution PNG is downloaded instantly. No external libraries, uses the native [Screen Capture API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Capture_API).

---

## 🛠 Requirements

- **Node.js** ≥ 18.0.0
- Any modern browser (Chrome, Firefox, Edge, Safari)

---

## 🤝 Contributing

Contributions, issues and feature requests are welcome!

1. Fork the repository
2. Create your branch: `git checkout -b feat/your-feature`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push and open a Pull Request

Please open an [issue](https://github.com/kubilaycakmak/viewports/issues) first for major changes.

---

## 👤 Author

<div align="center">

**Kubilay Cakmak** · *neo* ⚡

Full-Stack Developer & Mentor · Vancouver, BC

[![GitHub](https://img.shields.io/badge/GitHub-kubilaycakmak-7c6afe?style=flat-square&logo=github)](https://github.com/kubilaycakmak)

*I like JavaScript 🍻*

</div>

---

## 📄 License

Copyright © 2026 [Kubilay Cakmak](https://github.com/kubilaycakmak).  
Released under the [MIT License](./LICENSE.md).

---

<div align="center">

If this tool saved you time, consider giving it a ⭐ on [GitHub](https://github.com/kubilaycakmak/viewports)!

</div>
