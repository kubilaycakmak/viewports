import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createPreviewRequest, DEVICE_IDS } from './desktop/request.js';
import { presentationFor, TEXT_SIZES } from './desktop/presentation.js';
import { ALL_DEVICES } from './public/devices.js';

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
      textSize: z.enum(Object.keys(TEXT_SIZES)).optional()
        .describe('Browser default text size. Defaults to default.'),
      areas: z.object({ top: z.boolean(), bottom: z.boolean() }).optional()
        .describe('Show the top and bottom device areas. Both default to true.'),
    },
  }, async ({ url, devices, textSize, areas }) => {
    try {
      const request = createPreviewRequest(url, devices, textSize, areas);
      const { launchDesktop } = await import('./desktop/launch.js');
      const result = await launchDesktop(request, { managed: true });
      if (clientClosed) {
        result.control.disconnect();
        throw new Error('MCP client disconnected.');
      }
      const sessionId = randomUUID();
      sessions.set(sessionId, result);
      const value = {
        sessionId,
        url: result.url,
        devices: result.devices.map(device => withViewport(device, result.areas)),
        textSize: result.textSize,
        areas: result.areas,
      };
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

  function withViewport(device, areas) {
    const presentation = presentationFor(device, areas);
    return { ...device, viewportWidth: presentation.viewportWidth, viewportHeight: presentation.viewportHeight };
  }

  async function updateSession(sessionId, action, device, value) {
    const session = sessions.get(sessionId);
    if (!session) throw new Error('Preview session was not found. Open a new preview.');
    const result = await session.control.request(action, device, value);
    return {
      sessionId,
      url: result.url,
      devices: result.devices,
      viewports: result.devices.map(id => withViewport(ALL_DEVICES.find(device => device.id === id), result.areas)),
      textSize: result.textSize,
      areas: result.areas,
    };
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

  server.registerTool('capture_screenshot', {
    title: 'Capture a device screenshot',
    description: 'Capture the current viewport or the full page of an open device as a PNG image.',
    inputSchema: {
      ...deviceSchema,
      mode: z.enum(['viewport', 'full-page']).describe('Capture the visible viewport or the full page.'),
    },
  }, async ({ sessionId, device, mode }) => {
    try {
      const session = sessions.get(sessionId);
      if (!session) throw new Error('Preview session was not found. Open a new preview.');
      const result = await session.control.request('screenshot', device, mode);
      return { content: [{ type: 'image', data: result.data, mimeType: 'image/png' }] };
    } catch (error) {
      return errorResponse(error);
    }
  });

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

  server.registerTool('navigate_preview', {
    title: 'Change preview website',
    description: 'Navigate all devices in an existing preview session to a website.',
    inputSchema: {
      ...sessionSchema,
      url: z.string().describe('HTTP(S) website address.'),
    },
  }, async ({ sessionId, url }) => {
    try {
      return response(await updateSession(sessionId, 'navigate', undefined, url));
    } catch (error) {
      return errorResponse(error);
    }
  });

  server.registerTool('set_text_size', {
    title: 'Change preview text size',
    description: 'Set the browser default text size for all devices in an existing preview session.',
    inputSchema: {
      ...sessionSchema,
      textSize: z.enum(Object.keys(TEXT_SIZES)),
    },
  }, async ({ sessionId, textSize }) => {
    try {
      return response(await updateSession(sessionId, 'text-size', undefined, textSize));
    } catch (error) {
      return errorResponse(error);
    }
  });

  server.registerTool('set_device_areas', {
    title: 'Change device areas',
    description: 'Show or hide the top and bottom device areas in a preview session.',
    inputSchema: {
      ...sessionSchema,
      areas: z.object({ top: z.boolean(), bottom: z.boolean() }),
    },
  }, async ({ sessionId, areas }) => {
    try {
      return response(await updateSession(sessionId, 'areas', undefined, areas));
    } catch (error) {
      return errorResponse(error);
    }
  });

  process.stdin.once('end', () => {
    clientClosed = true;
    for (const session of sessions.values()) session.control.disconnect();
  });
  await server.connect(new StdioServerTransport());
}
