import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createPreviewRequest, DEVICE_IDS } from './desktop/request.js';

export async function startMcp(version) {
  const server = new McpServer({ name: 'viewports', version });

  server.registerTool('open_preview', {
    title: 'Open desktop viewports',
    description: 'Open live responsive previews of a web URL in separate windows on the computer running this MCP server.',
    inputSchema: {
      url: z.string().describe('Complete HTTP(S) URL, including a localhost port when applicable.'),
      devices: z.array(z.enum(DEVICE_IDS)).min(1).optional()
        .describe('Device preset IDs. Defaults to iPhone 17, iPad Pro 11, and Desktop HD.'),
    },
  }, async ({ url, devices }) => {
    try {
      const request = createPreviewRequest(url, devices);
      const { launchDesktop } = await import('./desktop/launch.js');
      const result = await launchDesktop(request);
      const names = result.devices.map(({ name }) => name).join(', ');
      return {
        content: [{ type: 'text', text: `Opened ${names} for ${result.url}.` }],
        structuredContent: result,
      };
    } catch (error) {
      return { content: [{ type: 'text', text: error.message }], isError: true };
    }
  });

  await server.connect(new StdioServerTransport());
}
