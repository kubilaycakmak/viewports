# Maintainer handoff

## Repository map

- `bin/viewports.js`: CLI routing and interactive prompts.
- `src/desktop/`: Electron lifecycle, preview windows, presentation, and request validation.
- `src/mcp.js`: stdio MCP server and session tools.
- `src/public/` and `src/server.js`: original browser canvas and proxy.
- `test/`: installer, Electron desktop, and MCP integration checks.

## Change and release workflow

Start substantial work with an issue, use a focused branch and PR, and record verification and compatibility impact in the PR. CI is defined in `.github/workflows/ci.yml`; it does not itself enforce branch protection. Configure required status checks and review rules in GitHub repository settings after confirming the workflow runs on the default branch.

Before releasing, review the npm package contents (`npm pack --dry-run`), test on supported platforms, verify documentation and version, and review the final diff. A maintainer decides the version and publishes to npmjs.org using their npm account (`npm publish --access public`). Do not put npm credentials or one-time codes in repository files or chat.

After npmjs.org reports the new version, create the matching `vX.Y.Z` tag and GitHub Release from the same commit. `.github/workflows/publish-github-package.yml` then publishes that version to GitHub Packages using the repository's `GITHUB_TOKEN`. Confirm both registries report the version; they are separate and do not sync automatically. If the GitHub Packages workflow fails, fix and rerun it before announcing the release.

## Current screenshot initiative

See [device screenshot proposal](device-screenshots.md) and issue #1. Keep the screenshot work in a separate PR, preserving existing canvas screenshots and MCP tools. Record decisions and validation results in that PR so a later contributor can resume safely.
