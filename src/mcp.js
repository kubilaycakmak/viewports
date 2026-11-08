import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createPreviewRequest, DEVICE_IDS } from './desktop/request.js';

export async function startMcp(version) {
  const server = new McpServer({ name: 'viewports', version });
  const sessions = new Map();
  let clientClosed = false;

  server.registerTool('open_preview', {
    title: 'Open desktop viewports',
    description: 'Open live responsive previews in separate desktop windows and return a session ID.',
    inputSchema: {
      url: z.string().describe('Complete HTTP(S) URL, including a localhost port when applicable.'),
      devices: z.array(z.enum(DEVICE_IDS)).min(1).optional()
        .describe('Device preset IDs. Defaults to iPhone 17, iPad Pro 11, and Desktop HD.'),
    },
  }, async ({ url, devices }) => {
    try {
      const request = createPreviewRequest(url, devices);
      const { launchDesktop } = await import('./desktop/launch.js');
      const result = await launchDesktop(request, { managed: true });
      if (clientClosed) {
        result.control.disconnect();
        throw new Error('MCP client disconnected.');
      }
      const sessionId = randomUUID();
      sessions.set(sessionId, result);
      const value = { sessionId, url: result.url, devices: result.devices };
      const names = result.devices.map(({ name }) => name).join(', ');
      return {
        content: [{ type: 'text', text: `Opened ${names} for ${result.url}. Session: ${sessionId}` }],
        structuredContent: value,
      };
    } catch (error) {
      return { content: [{ type: 'text', text: error.message }], isError: true };
    }
  });

  const sessionSchema = {
    sessionId: z.string().uuid().describe('Session ID returned by open_preview.'),
  };
  const deviceSchema = {
    ...sessionSchema,
    device: z.enum(DEVICE_IDS).describe('Device preset ID.'),
  };

  async function updateSession(sessionId, action, device) {
    const session = sessions.get(sessionId);
    if (!session) throw new Error('Preview session was not found. Open a new preview.');
    const result = await session.control.request(action, device);
    return { sessionId, url: session.url, devices: result.devices };
  }

  function response(value) {
    return {
      content: [{ type: 'text', text: JSON.stringify(value) }],
      structuredContent: value,
    };
  }

  function errorResponse(error) {
    return { content: [{ type: 'text', text: error.message }], isError: true };
  }

  server.registerTool('list_devices', {
    title: 'List open devices',
    description: 'Return the devices currently open in a preview session.',
    inputSchema: sessionSchema,
  }, async ({ sessionId }) => {
    try {
      return response(await updateSession(sessionId, 'status'));
    } catch (error) {
      return errorResponse(error);
    }
  });

  for (const action of ['add', 'remove']) {
    server.registerTool(`${action}_device`, {
      title: `${action === 'add' ? 'Add' : 'Remove'} a device`,
      description: `${action === 'add' ? 'Open' : 'Close'} a device window in an existing preview session.`,
      inputSchema: deviceSchema,
    }, async ({ sessionId, device }) => {
      try {
        return response(await updateSession(sessionId, action, device));
      } catch (error) {
        return errorResponse(error);
      }
    });
  }

  process.stdin.once('end', () => {
    clientClosed = true;
    for (const session of sessions.values()) session.control.disconnect();
  });
  await server.connect(new StdioServerTransport());
}
