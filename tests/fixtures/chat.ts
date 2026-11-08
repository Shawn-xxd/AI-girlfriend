import type { ChatReply } from '../../packages/shared/src/index';
export const owner = '20000000-0000-4000-8000-000000000001';
export const conversation = '30000000-0000-4000-8000-000000000001';
export const requestKey = '40000000-0000-4000-8000-000000000001';
export const reply: ChatReply = {
  turnId: '50000000-0000-4000-8000-000000000001',
  state: 'completed',
  messages: [
    {
      id: '60000000-0000-4000-8000-000000000001',
      turnId: '50000000-0000-4000-8000-000000000001',
      requestKey,
      role: 'user',
      content: 'Hello',
      sequence: 1,
      createdAt: '2026-11-04T00:00:00Z',
      state: 'completed',
      leaseExpiresAt: null,
    },
    {
      id: '60000000-0000-4000-8000-000000000002',
      turnId: '50000000-0000-4000-8000-000000000001',
      requestKey,
      role: 'assistant',
      content: 'Hello 😊',
      sequence: 2,
      createdAt: '2026-11-04T00:00:01Z',
      state: 'completed',
      leaseExpiresAt: null,
    },
  ],
};
