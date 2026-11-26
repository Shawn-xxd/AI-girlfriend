# Clear and delete chat history

The character profile exposes CLEAR CHAT and DELETE at the top right. Both require a native confirmation. Clear removes messages and AI summary and opens an empty chat. Delete also removes the chat from Chats; opening the character again starts an empty chat. Neither replays the initial greeting nor resets the user's level, counted rounds, wallet or photo entitlements.

## Transactions and retries

Migration `20261126140021_conversation_history_actions.sql` is the schema source. The authenticated API accepts `POST /v1/conversations/:id/history` with `{ requestKey, action: "clear" | "delete" }`. Actor identity comes from the verified token. A single service-only, security-invoker RPC locks the owned active conversation, interrupts pending generations, physically removes text messages, photo-message rows and the AI summary, and archives the old conversation ID. Only metadata for accounting, completed-turn counts and idempotency receipts is retained. Clear creates a new active ID; delete does not. The partial unique index permits at most one active chat per owner and character.

A repeated key returns the original result without clearing messages sent since the first action. Reusing a key for another body conflicts. Old chat IDs reject generation, memory claims and paid unlocks; a late generation cannot insert a reply. A reply that committed before the clear transaction is removed by that transaction.

## Device cache and navigation

The confirmed intent is persisted in the existing SecureStore adapter before local or remote changes. The old message screen unmounts and aborts its stream. The owner-scoped pending draft, TanStack Query entries and encrypted history snapshot are purged; strict storage errors keep the intent pending. Old IDs stay excluded from cache capture even if an earlier request finishes late. Startup reads intents before restoring encrypted history, and resumes them with the same request keys. Opening another character also resumes pending actions first. Unknown network outcomes stay pending rather than being reported as success.

On success, the old profile/chat navigation stack is dismissed. Clear opens the new empty chat; delete returns to Chats. Already earned photos remain accessible in Gallery, including their existing local image cache. Clearing history is not account erasure and does not remove wallet/usage accounting records.

## Verification

- `pnpm check` includes intent-store persistence/retry and encrypted-cache race tests.
- `pnpm test:schema` runs the full migration chain twice in an isolated database, transaction assertions in `tests/sql/history-actions-assertions.sql`, and concurrent database probes.
- `pnpm test:integration` runs only against the designated development Supabase project. History tests use temporary anonymous users and an AI substitute, including an in-flight generation race. Cleanup removes business profiles before Auth identities.
- Cloud SQL assertions run in a rolled-back transaction and never clear operational chats.
- Browser checks of the actual profile component cover narrow/large widths, busy controls and retry messaging. Native confirmation, routing and gesture behavior still require iPhone acceptance after the Preview update.
