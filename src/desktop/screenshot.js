const MAX_SCROLL_STEPS = 60;
const MAX_PIXELS = 16_000_000;
const SCROLL_SETTLE_MS = 100;

// Capture the live WebContents so cookies, navigation and device emulation are retained.
export async function captureScreenshot(contents, frame, mode) {
  if (!['viewport', 'full-page'].includes(mode)) throw new Error('Unknown screenshot mode.');
  if (contents.isDestroyed() || !contents.debugger.isAttached()) throw new Error('Preview is unavailable.');
  let navigated = false;
  const onNavigate = (_event, _url, _inPlace, mainFrame) => { if (mainFrame) navigated = true; };
  contents.on('did-start-navigation', onNavigate);
  const evaluate = async expression => {
    if (navigated || contents.isDestroyed()) throw new Error('Preview navigated during capture.');
    return contents.executeJavaScript(expression);
  };
  let original;
  try {
    original = await evaluate('({ x: scrollX, y: scrollY })');
    if (mode === 'full-page') {
      let reachedBottom = false;
      await evaluate("scrollTo({top: 0, left: 0, behavior: 'instant'})");
      for (let step = 0; step < MAX_SCROLL_STEPS; step++) {
        const position = await evaluate(`(() => {
          const root = document.scrollingElement;
          const height = Math.max(root.scrollHeight, innerHeight);
          return { y: scrollY, height, viewport: innerHeight };
        })()`);
        if ((frame.pixelRatio || 1) ** 2 * frame.viewportWidth * position.height > MAX_PIXELS) {
          throw new Error('Page exceeds the screenshot size limit.');
        }
        if (position.y + position.viewport >= position.height - 1) {
          reachedBottom = true;
          break;
        }
        await evaluate(`scrollTo({top: ${Math.min(position.y + position.viewport, position.height)}, behavior: 'instant'})`);
        await new Promise(resolve => setTimeout(resolve, SCROLL_SETTLE_MS));
      }
      if (!reachedBottom) throw new Error('Page did not reach the bottom within the scrolling limit.');
      await evaluate("scrollTo({top: 0, left: 0, behavior: 'instant'})");
    }
    const metrics = await contents.debugger.sendCommand('Page.getLayoutMetrics');
    const height = mode === 'viewport' ? frame.viewportHeight : Math.max(frame.viewportHeight, Math.ceil(metrics.cssContentSize.height));
    if ((frame.pixelRatio || 1) ** 2 * frame.viewportWidth * height > MAX_PIXELS) {
      throw new Error('Page exceeds the screenshot size limit.');
    }
    if (navigated) throw new Error('Preview navigated during capture.');
    const clip = mode === 'viewport' ? undefined : { x: 0, y: 0, width: frame.viewportWidth, height, scale: 1 };
    const result = await contents.debugger.sendCommand('Page.captureScreenshot', {
      format: 'png', fromSurface: true, captureBeyondViewport: mode === 'full-page', ...(clip ? { clip } : {}),
    });
    if (navigated) throw new Error('Preview navigated during capture.');
    return result.data;
  } finally {
    if (original && mode === 'full-page' && !navigated && !contents.isDestroyed()) {
      await contents.executeJavaScript(`scrollTo({left: ${original.x}, top: ${original.y}, behavior: 'instant'})`).catch(() => {});
    }
    contents.removeListener('did-start-navigation', onNavigate);
  }
}
