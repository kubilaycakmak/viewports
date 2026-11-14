# Contributing

Thanks for helping improve Viewports. For a significant change, open an issue describing the problem and proposed behavior before starting implementation. Small fixes can go directly to a pull request.

## Development

Use Node.js 22.12 or later and npm. From a clone of the repository:

```sh
npm ci
npm run test:install
npm run test:desktop
npm run test:mcp
```

The desktop and MCP tests launch Electron and require a graphical desktop. On Linux, a display server such as Xvfb is required. The first desktop launch may download Electron. For a manual check, start a local web server and run `npm start -- http://localhost:3000`.

## Pull requests

1. Branch from the current default branch and keep the change focused.
2. Describe the user-facing behavior, compatibility implications, and verification in the PR. Link the issue when one exists.
3. Add regression coverage for behavior changes and run the relevant checks above. Report checks you could not run.
4. Update documentation when commands, configuration, device behavior, or MCP tools change.
5. Do not publish a package or merge a PR without maintainer review.

Preserve existing CLI options, MCP tools, and supported Node versions unless a breaking change is explicitly agreed and documented. Avoid committing screenshots containing private data or credentials.
