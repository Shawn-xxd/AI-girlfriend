import type { Message } from '@companion/shared';
/** A retried turn has a new lease, while its original message date stays old. */
export function generationIsPending(
  message: Pick<Message, 'state' | 'leaseExpiresAt'>,
  now = Date.now(),
) {
  return (
    message.state === 'pending' &&
    (message.leaseExpiresAt === null ||
      Date.parse(message.leaseExpiresAt) > now)
  );
}
