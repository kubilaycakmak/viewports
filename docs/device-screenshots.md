# Device screenshot proposal

## Goal

Capture the content of an individual open device preview as a PNG, both manually and through MCP. Support the currently visible viewport and a full-page capture that scrolls through the page to trigger lazy-loaded content.

## Acceptance criteria

- Choose an open device and capture mode; save a PNG with an explicit success or error result.
- MCP offers the same modes for a session and device and returns useful output metadata. It does not write unsolicited output to stdout, which is reserved for MCP transport.
- The capture reflects the actual preview's viewport size, current URL, browser state, text size, and device settings; it does not require a separate unauthenticated browser session.
- Full-page capture has bounded scrolling, time, and output size. Restore scroll position even on failure. Define behavior for dynamic/infinite pages, sticky elements, nested scroll containers, and navigation during capture; do not silently claim completeness when a limit is reached.
- Existing canvas capture, preview interaction, and existing MCP/CLI contracts continue to work.
- Automated tests cover visible and full-page output dimensions and content, lazy loading, invalid/closed devices, limits, and scroll restoration. Exercise the manual flow and MCP integration on supported platforms.

## Design questions for the feature PR

Choose and document a save destination and overwrite policy for manual and MCP captures, image return versus file paths for MCP clients, and treatment of sensitive page content. Compare Electron capture mechanisms against scrolling and stitching using representative pages before committing to an approach. Include cancellation, concurrent requests, accessibility, and large-page memory limits in the design. This proposal does not promise pixel-perfect reproduction of physical devices.
