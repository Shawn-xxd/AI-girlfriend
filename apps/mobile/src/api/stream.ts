import {
  chatStreamEventSchema,
  sendMessageSchema,
  type ChatReply,
  type ChatStatus,
} from '@companion/shared';
import { apiBaseUrl, apiErrorForStatus, MobileApiError } from './core';
type FetchStream = (
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
    redirect: 'error';
  },
) => Promise<Pick<Response, 'ok' | 'status' | 'headers' | 'body'>>;
export function createChatStream(
  base: string | undefined,
  session: () => Promise<{ access_token: string; user: { id: string } }>,
  fetchImpl: FetchStream,
  allowLocalHttp = false,
) {
  return async (
    owner: string,
    conversation: string,
    body: { requestKey: string; text: string },
    onStatus: (status: ChatStatus) => void,
    signal?: AbortSignal,
    timeoutMs = 120000,
  ): Promise<ChatReply> => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const origin = apiBaseUrl(base, allowLocalHttp);
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          conversation,
        )
      )
        throw new MobileApiError('configuration');
      const request = sendMessageSchema.parse(body);
      const identity = await session();
      if (identity.user.id !== owner) throw new MobileApiError('unauthorized');
      if (controller.signal.aborted) throw new MobileApiError('unavailable');
      const response = await fetchImpl(
        `${origin}/v1/conversations/${conversation}/messages/stream`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${identity.access_token}`,
            Accept: 'text/event-stream',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
          signal: controller.signal,
          redirect: 'error',
        },
      );
      if (!response.ok) throw apiErrorForStatus(response.status);
      if (
        !response.headers
          .get('content-type')
          ?.toLowerCase()
          .startsWith('text/event-stream') ||
        !response.body
      )
        throw new MobileApiError('invalid_response');
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '',
        size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) throw new MobileApiError('unavailable');
        size += value.byteLength;
        if (size > 262144) throw new MobileApiError('invalid_response');
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > 131072)
          throw new MobileApiError('invalid_response');
        let boundary: RegExpExecArray | null;
        while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
          const frame = buffer.slice(0, boundary.index);
          buffer = buffer.slice(boundary.index + boundary[0].length);
          const data = frame
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).replace(/^ /, ''))
            .join('\n');
          if (!data) continue;
          let event;
          try {
            event = chatStreamEventSchema.parse(JSON.parse(data));
          } catch {
            throw new MobileApiError('invalid_response');
          }
          if (event.type === 'status') onStatus(event.status);
          else if (event.type === 'error')
            throw apiErrorForStatus(event.status);
          else {
            const [user, assistant] = event.reply.messages;
            if (
              user?.role !== 'user' ||
              assistant?.role !== 'assistant' ||
              user.requestKey !== request.requestKey ||
              assistant.requestKey !== request.requestKey ||
              user.content !== request.text ||
              user.turnId !== event.reply.turnId ||
              assistant.turnId !== event.reply.turnId ||
              user.state !== 'completed' ||
              assistant.state !== 'completed'
            )
              throw new MobileApiError('invalid_response');
            return event.reply;
          }
        }
      }
    } catch (error) {
      if (error instanceof MobileApiError) throw error;
      throw new MobileApiError('unavailable');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (reader) await reader.cancel().catch(() => undefined);
      controller.abort();
    }
  };
}
