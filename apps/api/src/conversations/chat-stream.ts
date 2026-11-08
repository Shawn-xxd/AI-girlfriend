import type { ServerResponse } from 'node:http';
import { HttpException } from '@nestjs/common';
import {
  chatStreamEventSchema,
  type ChatReply,
  type ChatStatus,
  type ChatStreamEvent,
} from '@companion/shared';

/** A disconnected client does not cancel a claimed, bounded generation. */
export async function deliverChatStream(
  response: ServerResponse,
  generate: (onStatus: (status: ChatStatus) => void) => Promise<ChatReply>,
) {
  response.statusCode = 200;
  response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  response.setHeader('Cache-Control', 'no-cache, no-store, no-transform');
  response.setHeader('X-Accel-Buffering', 'no');
  response.flushHeaders();
  let connected = true;
  const write = (event: ChatStreamEvent) => {
    if (connected && !response.destroyed && !response.writableEnded)
      response.write(
        `data: ${JSON.stringify(chatStreamEventSchema.parse(event))}\n\n`,
      );
  };
  const heartbeat = setInterval(() => {
    if (connected && !response.destroyed && !response.writableEnded)
      response.write(': keep-alive\n\n');
  }, 10000);
  const close = () => {
    connected = false;
    clearInterval(heartbeat);
  };
  response.once('close', close);
  try {
    const reply = await generate((status) => write({ type: 'status', status }));
    write({ type: 'completed', reply });
  } catch (error) {
    const status = error instanceof HttpException ? error.getStatus() : 503;
    const safe =
      status === 400 ||
      status === 401 ||
      status === 404 ||
      status === 409 ||
      status === 422 ||
      status === 429
        ? status
        : 503;
    write({ type: 'error', status: safe });
  } finally {
    clearInterval(heartbeat);
    response.off('close', close);
    if (connected && !response.destroyed && !response.writableEnded)
      response.end();
  }
}
