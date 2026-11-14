# Maintainer handoff

## Repository map

- `bin/viewports.js`: CLI routing and interactive prompts.
- `src/desktop/`: Electron lifecycle, preview windows, presentation, and request validation.
- `src/mcp.js`: stdio MCP server and session tools.
- `src/public/` and `src/server.js`: original browser canvas and proxy.
- `test/`: installer, Electron desktop, and MCP integration checks.

## Change and release workflow

Start substantial work with an issue, use a focused branch and PR, and record verification and compatibility impact in the PR. CI is defined in `.github/workflows/ci.yml`; it does not itself enforce branch protection. Configure required status checks and review rules in GitHub repository settings after confirming the workflow runs on the default branch.

Before releasing, review the npm package contents (`npm pack --dry-run`), test on supported platforms, verify documentation and version, and review the final diff. A maintainer decides the version and publishes using the project's established npm credentials. CI does not publish packages.

## Current screenshot initiative

See [device screenshot proposal](device-screenshots.md) and issue #1. Keep the screenshot work in a separate PR, preserving existing canvas screenshots and MCP tools. Record decisions and validation results in that PR so a later contributor can resume safely.
