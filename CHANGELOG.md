# Changelog

## 4.1.0 - 2026-11-13

- Capture the visible viewport or a bounded full-page PNG for an open device from the desktop menu or the MCP `capture_screenshot` tool.
- Fix Windows MCP session startup and control. Use one transparent preview toolbar on Windows instead of duplicated window controls.
- Keep initial preview windows within the display work area.
- Fix extra space beside narrow Windows previews and the folded iPhone Duo viewport.
- Keep web content rectangular and place the simulated navigation area above rounded device corners.
- Add a desktop menu switch for folded and unfolded iPhone Duo previews while preserving both CLI and MCP preset IDs.
- Add contribution guidance, issue and pull request templates, and continuous integration checks.

Full-page capture scrolls the main document to trigger lazy loading and restores its scroll position. See the README for capture limits and platform-specific setup.
