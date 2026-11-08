import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import { ConflictException } from '@nestjs/common';
import { reply } from '../../../../tests/fixtures/chat';
import { deliverChatStream } from './chat-stream';
function fixture() {
  const fake = Object.assign(new EventEmitter(), {
    statusCode: 0,
    destroyed: false,
    writableEnded: false,
    frames: [] as string[],
    setHeader: () => {},
    flushHeaders: () => {},
    write(data: string) {
      this.frames.push(data);
    },
    end() {
      this.writableEnded = true;
    },
  });
  return { fake, response: fake as unknown as ServerResponse };
}
describe('server chat delivery', () => {
  it('emits only status until an approved and persisted response is available', async () => {
    const { fake, response } = fixture();
    let finish!: (value: typeof reply) => void;
    const result = deliverChatStream(response, async (status) => {
      status('generating');
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    expect(fake.frames.join('')).toContain('generating');
    expect(fake.frames.join('')).not.toContain(reply.messages[1]!.content);
    finish(reply);
    await result;
    expect(fake.frames.join('')).toContain('completed');
    expect(fake.writableEnded).toBe(true);
  });
  it('allows an already claimed generation to save after disconnection without further writes', async () => {
    const { fake, response } = fixture();
    let finish!: (value: typeof reply) => void;
    let saved = false;
    const result = deliverChatStream(response, async () => {
      const value = await new Promise<typeof reply>((resolve) => {
        finish = resolve;
      });
      saved = true;
      return value;
    });
    fake.emit('close');
    finish(reply);
    await result;
    expect(saved).toBe(true);
    expect(fake.frames).toHaveLength(0);
  });
  it('sanitizes conflict and arbitrary upstream errors', async () => {
    for (const error of [
      new ConflictException('private conflict'),
      new Error('private upstream'),
    ]) {
      const { fake, response } = fixture();
      await deliverChatStream(response, async () => {
        throw error;
      });
      const wire = fake.frames.join('');
      expect(wire).not.toContain('private');
      expect(wire).toContain(
        error instanceof ConflictException ? '409' : '503',
      );
    }
  });
});
